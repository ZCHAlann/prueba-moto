// lib/ai/tools/intent-classifier.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v3 — Intent classifier para reducir el schema de tools
// que se envía al 120b.
//
// jul 2026 — El catálogo consolidado v3 tiene 63 tools. Pasar el JSON
// Schema de las 63 al 120b consume ~16k tokens de overhead en cada
// turno. Con el clasificador, mandamos solo:
//   - Capa 1 (siempre): 11 tools, ~3.5k tokens
//   - Capa 2 (bajo demanda, según pregunta): subset típico de ~5-8 tools
//   - Capa 3 (creación): se agrega SOLO si `needsWrite=true`
//
// El ahorro típico: 60-70% de tokens de schema por turno.
//
// IMPLEMENTACIÓN:
//   1. Recibe la pregunta del user + últimos 2 turnos de historial.
//   2. Llama a Groq con el modelo CLASIFICADOR (gpt-oss-20b, $0.075/$0.30).
//   3. Prompt con JSON forzado (no function calling — el clasificador
//      no necesita tools, solo debe devolver un JSON estructurado).
//   4. Valida el output con Zod. Si falla, fallback a Capa 1 + Capa 2
//      completas (modo seguro).
//   5. Cacheamos el resultado del clasificador (mismo input → mismo
//      output) para evitar pagar el clasificador en cada turno.
//
// CACHÉ DEL CLASIFICADOR:
//   - Key: hash(pregunta normalizada + rol + últimos 2 turnos).
//   - TTL: 5 minutos (cambios de intención son raros en un chat).
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getClassifier } from '../model-config';
import { getClassifierGroqClient } from '../client-factory';
import { CATALOG_V3_TOOLS } from './catalog';
import {
  getToolByName,
  toolsSubsetToGroqSchema,
  type ToolDefinition,
  getLayer1Tools,
  getLayer2Tools,
  getLayer3Tools,
  TOOL_REGISTRY,
} from './registry';
import { incCounter } from '../metrics';

// ─── Schema de salida del clasificador ──────────────────────────────────

const MODULES = [
  'flota', 'mantenimiento', 'combustible', 'peajes', 'checklists',
  'conductores', 'alertas', 'caja-chica', 'facturas', 'stats',
  'auditoria', 'cumplimiento',
] as const;
type ModuleName = (typeof MODULES)[number];

const classifierOutputSchema = z.object({
  /** Lista de nombres de tools a incluir (Capa 2 + Capa 3). */
  tools: z.array(z.string()).max(20),
  /** Módulo principal inferido (para logging/métricas). */
  module: z.enum(MODULES).default('flota'),
  /** Si la pregunta amerita crear algo (Capa 3). */
  needsWrite: z.boolean().default(false),
  /** Confianza 0-1, útil para log/debug. */
  confidence: z.number().min(0).max(1).default(0.5),
  /** Razón corta (1 frase) por la que eligió esas tools. */
  reason: z.string().max(200).default(''),
});

export type ClassifierOutput = z.infer<typeof classifierOutputSchema>;

// ─── Caché del clasificador (separado del tool cache) ─────────────────

interface ClassifierCacheEntry {
  output:    ClassifierOutput;
  expiresAt: number;
}

const classifierCache = new Map<string, ClassifierCacheEntry>();
// jul 2026 v3 — TTL subido de 5min a 30min. Las intenciones del
// usuario cambian lento (pregunta = pregunta, salvo que sea una
// nueva). 30min reduce llamadas al clasificador en ~85% y, lo más
// importante, le saca presión de cuota a la key de Groq.
const CLASSIFIER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

function cacheKey(question: string, lastTurns: string[], empresaId: number): string {
  // jul 2026 v3 — normalización para que variaciones triviales de la
  // misma pregunta peguen el mismo cache key. Sin esto, "vehículos con
  // seguro vencido en 30 días" y "...en 60 días" generan 2 keys
  // distintas y queman 2 clasificaciones. La intención es la misma;
  // la ventana de tiempo es variable de negocio.
  //
  // Reemplazos (en orden):
  //   - Números sueltos        → "N"
  //   - "30 días", "60 días"   → "N días" (típica ventana de reporte)
  //   - Fechas YYYY-MM-DD      → "FECHA"
  //   - Fechas DD/MM/YYYY      → "FECHA"
  //   - Meses en español       → "MES" ("enero", "febrero", etc.)
  //   - Whitespace multiple    → " "
  const normQuestion = question
    .toLowerCase()
    .trim()
    .replace(/\b\d{1,4}\b/g, 'N')              // 30 → N
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, 'FECHA') // 2026-07-29 → FECHA
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, 'FECHA') // 29/07/2026 → FECHA
    .replace(
      /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g,
      'MES',
    )
    .replace(/\s+/g, ' ');

  // Mismo tratamiento a los turnos recientes para que la firma
  // conversación-dependiente (módulo) no sufra drift.
  const normTurns = lastTurns.map((t) =>
    t
      .toLowerCase()
      .replace(/\b\d{1,4}\b/g, 'N')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, 'FECHA')
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, 'FECHA'),
  );

  const hash = createHash('sha256');
  hash.update(`${empresaId}|${normQuestion}|${normTurns.join('|')}`);
  return hash.digest('hex').slice(0, 32);
}

// jul 2026 v3 — Whitelist de tools que el clasificador puede elegir.
// Solo las ~30 más usadas. El resto se descartan automáticamente,
// aunque el LLM las pida, porque (a) son nicho y (b) queremos
// mantener el prompt del clasificador chico (~1.2k tokens vs 2.5k).
//
// ⚠️ CRÍTICO: tiene que estar ANTES del CLASSIFIER_SYSTEM_PROMPT
// porque el prompt es una template string que llama a
// buildToolsCatalog() al construirse, y esa función usa la whitelist.
// Si la whitelist está DESPUÉS del prompt, TDZ explota en runtime
// (TS no lo detecta porque el template string se evalúa lazy dentro
// de la función buildToolsCatalog, pero el módulo lo inicializa
// apenas se importa).
const CLASSIFIER_TOOL_WHITELIST = new Set<string>([
  // Vehículos (L1, casi siempre necesarias)
  'getVehiculos',
  'getVehicleById',
  'getVehicleFullProfile',
  'getVehicleScorecard',
  'getVehicleNotes',
  // Mantenimiento
  'getMantenimientos',
  'getVehicleTCO',
  'getMostExpensiveVehicles',
  'scheduleMaintenance',
  'flagVehicleForMaintenance',
  // Combustible
  'getCombustible',
  'registerFuelEntry',
  // Seguros / Checklists / Asignaciones / Conductores / Peajes
  'getSeguros',
  'getChecklists',
  'getAsignaciones',
  'getConductores',
  'getPeajes',
  // Stats (las más comunes)
  'getSpendingSummary',
  'getSpendingAnomalies',
  'getInsights',
  'getStatsReport',
  // Alertas
  'listAlerts',
  'getAlertById',
  // Caja chica / facturas
  'listPettyCashMovements',
  'getPettyCashAccount',
  'listFinanceRequests',
  'listInvoices',
  'getInvoiceById',
  // Auditoría / cumplimiento
  'listAuditEntries',
  'getUserCompliance',
]);

// ─── System prompt del clasificador ────────────────────────────────────

const CLASSIFIER_SYSTEM_PROMPT = `Eres el clasificador de intents del asistente Jarvis.
Tu trabajo es decidir qué tools necesita el LLM principal para responder la pregunta del usuario.

IMPORTANTE:
- Responde SOLO con JSON válido. Sin explicaciones, sin markdown, sin texto adicional.
- El JSON debe tener exactamente estos campos:
  {
    "tools": ["name1", "name2", ...],   // array de nombres de tools
    "module": "flota|mantenimiento|combustible|peajes|checklists|conductores|alertas|caja-chica|facturas|stats|auditoria|cumplimiento",
    "needsWrite": true|false,             // ¿la pregunta pide crear algo?
    "confidence": 0.0-1.0,                // qué tan seguro estás
    "reason": "una frase corta"
  }

REGLAS:
1. Si la pregunta es ambigua, prefiere 'flota' como módulo default.
2. needsWrite=true SOLO si la pregunta pide EXPLÍCITAMENTE crear/registrar/agendar algo.
   Saludos, consultas, análisis → needsWrite=false.
3. Devuelve SOLO los nombres exactos de tools que el LLM va a necesitar.
   Si la pregunta es solo de cumplimiento, no incluyas tools de mantenimiento/combustible.
4. Si no estás seguro, devuelve un array vacío de tools (cae a Capa 1 only).
5. NO inventes nombres de tools. Solo los que existen abajo.

CATÁLOGO DE TOOLS (nombre — módulo — descripción corta):

${buildToolsCatalog()}

Responde SOLO con el JSON.`;

function buildToolsCatalog(): string {
  // jul 2026 v3 — Bug fix: ANTES solo iteraba `CATALOG_V3_TOOLS` (22
  // tools v3), no las viejas (35 de TOOL_REGISTRY). Por eso el
  // clasificador no podía elegir getMantenimientos/getCombustible/
  // getSeguros y devolvía tools=[], lo que disparaba el fallback
  // completo de 54 tools.
  //
  // Ahora filtramos TOOL_REGISTRY por whitelist. Resultado: el
  // clasificador ve ~30 tools relevantes en vez de 57 totales, y
  // el prompt baja de ~2.5k a ~1.2k tokens.
  const filtered = TOOL_REGISTRY.filter((t) =>
    CLASSIFIER_TOOL_WHITELIST.has(t.name),
  );
  return filtered.map((t) => {
    const short = t.description.length > 80
      ? t.description.slice(0, 77) + '...'
      : t.description;
    const layer = t.layer ?? 2;
    const kind = t.kind ?? 'read';
    return `- ${t.name} [${t.category ?? 'general'}] (${kind}, L${layer}): ${short}`;
  }).join('\n');
}

// ─── Función principal del clasificador ────────────────────────────────

export interface ClassifyInput {
  empresaId: number;
  question: string;
  /** Últimos 2 turnos de historial (opcional, para contexto). */
  recentTurns?: string[];
  /** Si el user está en una ruta específica (del frontend). */
  currentModule?: string;
}

/**
 * Clasifica la pregunta del user y devuelve las tools a cargar.
 * El output siempre es válido (Zod), y si el clasificador falla
 * por cualquier razón, devuelve Capa 1 + Capa 2 completas
 * (modo seguro, sin ahorro).
 */
export async function classifyToolsForQuestion(
  input: ClassifyInput,
): Promise<ClassifierOutput> {
  const recentKey = (input.recentTurns ?? []).slice(-2).join(' | ');
  const ck = cacheKey(input.question, [recentKey], input.empresaId);

  // 1) Cache del clasificador.
  const cached = classifierCache.get(ck);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.output;
  }

  // 2) Llamar al clasificador (modelo barato). Usa cliente dedicado
  // (GROQ_CLASSIFIER_API_KEY) si está configurado; si no, fallback a
  // la cascada de la empresa. Esto evita que un pico del LLM principal
  // tumbe la cuota del clasificador.
  const client = await getClassifierGroqClient(input.empresaId);
  if (!client) {
    // Sin key de Groq: fallback seguro.
    return safeFallback();
  }

  const model = getClassifier();
  const userMessage = input.currentModule
    ? `Módulo actual del usuario: ${input.currentModule}\n\nPregunta: ${input.question}`
    : `Pregunta: ${input.question}`;

  try {
    // jul 2026 v3 — Retry robusto: si el response_format: json_object
    // falla con 400 (json_validate_failed) o el LLM devuelve string
    // vacío, reintentamos SIN response_format y parseamos el JSON con
    // un extractor regex. Esto cubre el caso donde el LLM devuelve
    // texto tipo "```json\n{...}\n```" o envuelve el JSON en markdown.
    let raw: string = '';
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });
    raw = completion.choices[0]?.message?.content ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Fallback: el LLM devolvió texto con JSON embebido. Intentamos
      // extraer el primer objeto JSON que encontremos.
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) {
        // Sin JSON en la respuesta. Segundo intento sin response_format.
        const retryCompletion = await client.chat.completions.create({
          model,
          messages: [
            {
              role: 'system',
              content: CLASSIFIER_SYSTEM_PROMPT +
                '\n\nIMPORTANTE: respondé SOLO con un objeto JSON puro, sin markdown, sin ```json, sin nada antes o después.',
            },
            { role: 'user', content: userMessage },
          ],
          temperature: 0,
          max_tokens: 800,
        });
        raw = retryCompletion.choices[0]?.message?.content ?? '';
        const m2 = raw.match(/\{[\s\S]*\}/);
        if (!m2) {
          throw new Error('classifier returned no JSON after retry');
        }
        parsed = JSON.parse(m2[0]);
      } else {
        parsed = JSON.parse(m[0]);
      }
    }
    const validated = classifierOutputSchema.parse(parsed);

    // 3) Validar que los nombres de tools existan en el catálogo
    //    Y estén en el whitelist del clasificador. Si el LLM inventó
    //    un nombre, lo descartamos. Esto evita que el clasificador
    //    elija tools de nicho que no conoce bien.
    const validTools = validated.tools.filter((name) => {
      if (!CLASSIFIER_TOOL_WHITELIST.has(name)) return false;
      const inV3 = CATALOG_V3_TOOLS.some((t) => t.name === name);
      const inLegacy = !!getToolByName(name);
      return inV3 || inLegacy;
    });

    const cleaned: ClassifierOutput = {
      ...validated,
      tools: validTools,
    };

    // 4) Cachear.
    classifierCache.set(ck, {
      output: cleaned,
      expiresAt: Date.now() + CLASSIFIER_CACHE_TTL_MS,
    });

    incCounter('jarvis_classifier_calls_total');
    if (cleaned.needsWrite) incCounter('jarvis_classifier_needs_write_total');

    return cleaned;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[jarvis-classifier] failed, falling back to Capa 1 + Capa 2:', err);
    incCounter('jarvis_classifier_errors_total');
    return safeFallback();
  }
}

function safeFallback(): ClassifierOutput {
  return {
    tools: [],
    module: 'flota',
    needsWrite: false,
    confidence: 0,
    reason: 'Fallback por error del clasificador',
  };
}

/**
 * Resuelve la lista final de tools a enviar al 120b para una pregunta.
 *
 * - SIEMPRE incluye Capa 1 (núcleo).
 * - SIEMPRE incluye las tools que el clasificador eligió (de Capa 2).
 * - Si needsWrite=true, agrega TODAS las tools de Capa 3.
 * - Si el clasificador devolvió tools vacías o falló, devuelve
 *   Capa 1 + Capa 2 completas (modo seguro).
 */
export function resolveToolsForLlm(
  classified: ClassifierOutput,
  rol: 'admin_empresa' | 'owner_empresa',
): ToolDefinition[] {
  const layer1 = getLayer1Tools(rol);
  const layer2 = getLayer2Tools(rol);
  const layer3 = getLayer3Tools(rol);

  const classifiedNames = new Set(classified.tools);
  const fromLayer2 = layer2.filter((t) => classifiedNames.has(t.name));

  if (classified.tools.length === 0) {
    // Fallback: Capa 1 + Capa 2 completas.
    return [...layer1, ...layer2];
  }

  return [
    ...layer1,
    ...fromLayer2,
    ...(classified.needsWrite ? layer3 : []),
  ];
}

/** Convierte la lista resuelta a schema Groq para enviar al 120b. */
export function buildLlmSchema(tools: ToolDefinition[]) {
  return toolsSubsetToGroqSchema(tools);
}

// ─── Pista de módulo (no override) ─────────────────────────────────────
// jul 2026 v3 — Si el frontend sabe en qué ruta está el user, NO
// lo usamos para forzar el subset de tools (peligroso: el user puede
// preguntar sobre otro módulo estando en otra ruta).
//
// Lo usamos como PISTA dentro del prompt del clasificador. El LLM
// sigue decidiendo qué tools cargar — solo que con un poquito más
// de contexto.

const ROUTE_TO_MODULE: Record<string, ModuleName> = {
  '/mantenimiento':  'mantenimiento',
  '/mantenimientos': 'mantenimiento',
  '/combustible':    'combustible',
  '/peajes':         'peajes',
  '/checklists':     'checklists',
  '/conductores':    'conductores',
  '/alertas':        'alertas',
  '/caja-chica':     'caja-chica',
  '/facturas':       'facturas',
  '/reportes':       'stats',
  '/auditoria':      'auditoria',
  '/cumplimiento':   'cumplimiento',
};

/**
 * Resuelve la ruta del frontend a un nombre de módulo del clasificador.
 * Devuelve null si la ruta no matchea ningún módulo conocido.
 *
 * NO se usa para override — el clasificador lo recibe como pista.
 */
export function resolveCurrentModule(
  currentModule: string | null | undefined,
): ModuleName | null {
  if (!currentModule) return null;
  const route = currentModule.startsWith('/')
    ? currentModule.split('/').slice(0, 2).join('/')
    : currentModule;
  return ROUTE_TO_MODULE[route] ?? ROUTE_TO_MODULE[`/${currentModule}`] ?? null;
}

/** Stats del cache del clasificador. */
export function getClassifierCacheStats() {
  const now = Date.now();
  let alive = 0;
  let expired = 0;
  for (const e of classifierCache.values()) {
    if (e.expiresAt > now) alive++;
    else expired++;
  }
  return {
    size: classifierCache.size,
    alive,
    expired,
  };
}
