import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import axios from 'axios';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { oilChecks } from '../db/schema/operational';
import { companyAssets } from '../db/schema/operational';
import { companyUsers } from '../db/schema/platform';
import { parseId } from '../lib/ids';
import { AppError } from '../lib/errors';
import { getGroqKeyForCompany } from '../lib/ai/client-factory';

export type OilLevel = 'ok' | 'bajo' | 'critico' | 'no_visible';
export type OilColor = 'miel' | 'oscuro' | 'negro' | 'no_visible';
export type Confidence = 'alta' | 'media' | 'baja';

export type OilAnalysisResult = {
  nivel: OilLevel;
  color: OilColor;
  confianza: Confidence;
  puede_salir: boolean;
  observaciones: string;
  accion_recomendada: string;
};

const UPLOAD_BASE = process.env.UPLOAD_DIR ?? join(process.cwd(), '..', '..', 'uploads');

const PROMPT = `Eres un mecánico experto con 20 años de experiencia inspeccionando motores de vehículos pesados y livianos. Tu especialidad es leer varillas (bayonetas) de aceite con precisión milimétrica. Analizas imágenes como si tuvieras la varilla en la mano.

PASO 1 — VALIDACIÓN DE IMAGEN (haz esto PRIMERO, sin excepción):
Examina estos cuatro puntos antes de cualquier análisis:
  a) ¿Se distingue físicamente la varilla/bayoneta? (objeto delgado y alargado, generalmente metálico)
  b) ¿La zona con aceite está dentro del encuadre y enfocada?
  c) ¿Hay suficiente luz para apreciar el color real del aceite?
  d) ¿Se ven las marcas de nivel (MIN/MAX, agujeros, muescas, o rayas grabadas)?

Si alguno de estos puntos falla → nivel="no_visible", color="no_visible", confianza="baja", puede_salir=false. No sigas al paso 2.

PASO 2 — NIVEL DE ACEITE (lee la mancha húmeda, no el brillo del metal):
El aceite deja una mancha visible en la varilla. Determina hasta dónde llega esa mancha:
  - "ok": la mancha húmeda llega entre la marca inferior y la superior (zona segura — ideal)
  - "bajo": la mancha no alcanza la marca inferior pero hay algo de aceite visible
  - "critico": la varilla aparece seca o casi seca, sin mancha húmeda apreciable
  - "no_visible": no puedes determinarlo con certeza por condiciones de imagen

TRAMPA COMÚN: el brillo metálico de la varilla limpia NO es aceite. Solo cuentas la zona donde el metal aparece mojado, oscurecido o con película de aceite adherida.

PASO 3 — COLOR DEL ACEITE (mira la película adherida, no el reflejo):
Analiza el color real de la película de aceite sobre la varilla:
  - "miel": dorado, amarillo o castaño claro con transparencia — aceite nuevo o casi nuevo (menos de 3.000 km de uso típico)
  - "oscuro": marrón oscuro o café, opaco pero sin llegar a negro — aceite usado, funcional, normal entre cambios
  - "negro": negro carbón, completamente opaco, sin ninguna transparencia — aceite degradado, carbonizado, cambio urgente
  - "no_visible": luz insuficiente o imagen borrosa para determinarlo

TRAMPA COMÚN: en imágenes con poca luz todo parece negro. Si dudas entre "oscuro" y "negro", elige "oscuro" y baja la confianza a "media".

PASO 4 — CONFIANZA (sé honesto, un mecánico no adivina):
  - "alta": imagen clara, varilla visible completa, marcas distinguibles, color evidente — diagnóstico seguro
  - "media": alguna condición subóptima (luz regular, ángulo difícil, marcas parcialmente visibles) — diagnóstico probable
  - "baja": imagen problemática — el diagnóstico es una estimación, no una certeza

REGLAS PARA puede_salir (aquí no hay zona gris):
  - true: ÚNICAMENTE si nivel="ok" AND (color="miel" OR color="oscuro") AND confianza="alta"
  - false: en CUALQUIER otro caso, incluyendo confianza="media"

ANTES DE RESPONDER, razona internamente:
  1. ¿La imagen es válida? Si no → no_visible en todo.
  2. ¿Hasta dónde llega la mancha húmeda exactamente?
  3. ¿Cuál es el color real de esa película, descartando reflejos y sombras?
  4. ¿Qué tan seguro estoy? ¿Apostaría mi reputación de mecánico a este diagnóstico?

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"nivel":"ok"|"bajo"|"critico"|"no_visible","color":"miel"|"oscuro"|"negro"|"no_visible","confianza":"alta"|"media"|"baja","puede_salir":true|false,"observaciones":"max 1 oración describiendo exactamente lo que ves en la varilla","accion_recomendada":"max 1 oración con la acción concreta a tomar"}`.trim();

// ─── Analyze ──────────────────────────────────────────────────────────────────

async function analyzeWithGroq(file: Express.Multer.File, companyId: number): Promise<OilAnalysisResult> {
  // jul 2026 v7 — multi-tenant. Resolvemos la key de Groq de la empresa
  // (key propia o cascada global). El modelo es el default de ApliSmart
  // (la empresa NO puede elegirlo).
  const aiKey = await getGroqKeyForCompany(companyId, 'ai_insights');
  if (!aiKey) {
    throw new AppError(503,
      'Análisis IA no disponible: cargá tu API key de Groq o pedile al superadmin que configure la cascada global.',
    );
  }

  const base64 = file.buffer.toString('base64');

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: aiKey.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${file.mimetype};base64,${base64}` },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${aiKey.apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  const text: string = response.data.choices[0].message.content.trim();
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean) as OilAnalysisResult;
  } catch {
    throw new AppError(500, 'El modelo no devolvió una respuesta válida. Intenta de nuevo.');
  }
}

function sanitizePlate(plate: string): string {
  // Solo alfanuméricos y guiones, max 20 chars — evita path traversal
  return plate.replace(/[^a-zA-Z0-9\-]/g, '').slice(0, 20).toUpperCase() || 'SIN-PLACA';
}

function savePhoto(file: Express.Multer.File, companyId: string, plate: string): string {
  const now = new Date();
  const dateFolder = now.toISOString().slice(0, 10); // "2026-05-29"

  const folder = join(UPLOAD_BASE, 'oil-checks', companyId, dateFolder);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });

  const safePlate = sanitizePlate(plate);
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19); // "2026-05-29T14-30-00"
  const ext = (file.originalname.split('.').pop() ?? 'jpg').toLowerCase();
  const filename = `${safePlate}_${timestamp}.${ext}`;

  writeFileSync(join(folder, filename), file.buffer);
  return `/uploads/oil-checks/${companyId}/${dateFolder}/${filename}`;
}

// ─── Main exports ─────────────────────────────────────────────────────────────

export async function analyzeOilCheck(params: {
  file: Express.Multer.File;
  assetId: string;
  technicianId: string;
  companyId: string;
}) {
  const { file, assetId, technicianId, companyId } = params;

  const companyNumericId    = parseId('company',      companyId);
  const assetNumericId      = assetId      ? parseId('asset',        assetId)      : null;
  const technicianNumericId = technicianId ? parseId('company-user', technicianId) : null;

  // Fetch asset ANTES de guardar la foto para tener la placa
  const [asset] = assetNumericId
    ? await db.select({ plate: companyAssets.plate, name: companyAssets.name })
        .from(companyAssets).where(eq(companyAssets.id, assetNumericId)).limit(1)
    : [null];

  let analysis: OilAnalysisResult;
  try {
    analysis = await analyzeWithGroq(file, companyNumericId);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(500, 'Error al conectar con el servicio de análisis. Intenta de nuevo.');
  }

  const photoUrl = savePhoto(file, String(companyNumericId), asset?.plate ?? '');

  const [record] = await db
    .insert(oilChecks)
    .values({
      companyId:         companyNumericId,
      assetId:           assetNumericId      ?? undefined,
      technicianId:      technicianNumericId ?? undefined,
      nivel:             analysis.nivel,
      color:             analysis.color,
      confianza:         analysis.confianza,
      puedeSalir:        analysis.puede_salir,
      observaciones:     analysis.observaciones,
      accionRecomendada: analysis.accion_recomendada,
      photoUrl,
    })
    .returning();

  const [technician] = technicianNumericId
    ? await db.select({ username: companyUsers.username, profileData: companyUsers.profileData })
        .from(companyUsers).where(eq(companyUsers.id, technicianNumericId)).limit(1)
    : [null];

  const technicianName = technician
    ? ((technician.profileData as Record<string, string>)?.fullName ?? technician.username)
    : null;

  return {
    id:                 String(record.id),
    nivel:              analysis.nivel,
    color:              analysis.color,
    confianza:          analysis.confianza,
    puede_salir:        analysis.puede_salir,
    observaciones:      analysis.observaciones,
    accion_recomendada: analysis.accion_recomendada,
    photo_url:          photoUrl,
    assetId,
    assetPlate:         asset?.plate ?? null,
    assetName:          asset?.name  ?? null,
    technicianId,
    technicianName,
    companyId,
    createdAt:          record.createdAt.toISOString(),
  };
}

export async function getOilChecks(params: { companyId: string; assetId?: string }) {
  const companyNumericId = parseId('company', params.companyId);
  const assetNumericId   = params.assetId ? parseId('asset', params.assetId) : null;

  const rows = await db
    .select({
      // oil_checks fields
      id:                oilChecks.id,
      nivel:             oilChecks.nivel,
      color:             oilChecks.color,
      confianza:         oilChecks.confianza,
      puedeSalir:        oilChecks.puedeSalir,
      observaciones:     oilChecks.observaciones,
      accionRecomendada: oilChecks.accionRecomendada,
      photoUrl:          oilChecks.photoUrl,
      assetId:           oilChecks.assetId,
      technicianId:      oilChecks.technicianId,
      companyId:         oilChecks.companyId,
      createdAt:         oilChecks.createdAt,
      // joined fields
      assetPlate:        companyAssets.plate,
      assetName:         companyAssets.name,
      technicianUsername: companyUsers.username,
      technicianProfile:  companyUsers.profileData,
    })
    .from(oilChecks)
    .leftJoin(companyAssets, eq(oilChecks.assetId, companyAssets.id))
    .leftJoin(companyUsers,  eq(oilChecks.technicianId, companyUsers.id))
    .where(
      assetNumericId
        ? and(eq(oilChecks.companyId, companyNumericId), eq(oilChecks.assetId, assetNumericId))
        : eq(oilChecks.companyId, companyNumericId)
    )
    .orderBy(oilChecks.createdAt);

  return rows.map((r) => ({
    id:                 String(r.id),
    nivel:              r.nivel,
    color:              r.color,
    confianza:          r.confianza,
    puede_salir:        r.puedeSalir,
    observaciones:      r.observaciones,
    accion_recomendada: r.accionRecomendada,
    photo_url:          r.photoUrl,
    assetId:            r.assetId   ? `asset-${r.assetId}`        : '',
    assetPlate:         r.assetPlate  ?? null,
    assetName:          r.assetName   ?? null,
    technicianId:       r.technicianId ? `company-user-${r.technicianId}` : '',
    technicianName:     ((r.technicianProfile as Record<string, string>)?.fullName ?? r.technicianUsername ?? null),
    companyId:          `company-${r.companyId}`,
    createdAt:          r.createdAt.toISOString(),
  }));
}