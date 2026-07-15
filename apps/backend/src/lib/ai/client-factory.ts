// lib/ai/client-factory.ts
// ─────────────────────────────────────────────────────────────────────
// IA multi-tenant (jul 2026 v6) — Migración 0043.
//
// Resuelve la config de IA para una empresa. Orden de prioridad:
//
//   1. /platform/companies/:id/ai-disable  → killedByPlatform = true → ERROR.
//   2. company_ai_settings.isEnabled = false → ERROR.
//   3. company_ai_settings.provider = 'platform_default' → usa env vars globales.
//   4. company_ai_settings con api_key cifrada → descifra y devuelve esa key.
//
// Devuelve un objeto con { provider, apiKey, modelPrimary, modelFallback, keySource }
// donde keySource ∈ {'platform', 'company'}.
//
// Cache en memoria con TTL=60s por empresa. Si rotás la key (PUT ai-settings)
// el frontend puede pasar `?force=1` o el cache se vence solo.
//
// Para Groq, devuelve un cliente NUEVO (no reutilizamos el singleton global
// porque pertenece al cascade state de la plataforma). Si la empresa custom
// tiene su propia key, su rate-limit no impacta a otras empresas.
// ─────────────────────────────────────────────────────────────────────

import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAiSettings } from '../../db/schema/platform';
import { decryptSecret } from '../crypto';
import { AppError } from '../errors';
import { companyEnabledModules, companies } from '../../db/schema/platform';

/**
 * jul 2026 v9 — Helper local: devuelve los módulos habilitados para
 * una empresa, leídos desde la tabla puente `company_enabled_modules`
 * (que es la fuente de verdad del plan+overrides). Si la empresa
 * no tiene filas, devuelve el array vacío.
 *
 * Usado por `getGroqKeyForCompany` para gatear la IA por plan.
 */
async function getCompanyModules(companyId: number): Promise<string[]> {
  try {
    const rows = await db
      .select({ moduleId: companyEnabledModules.moduleId })
      .from(companyEnabledModules)
      .where(eq(companyEnabledModules.companyId, companyId));
    return rows.map(r => r.moduleId);
  } catch {
    // Si la tabla no existe (BD sin seed), fallamos a enabled_modules
    // legacy de la tabla companies (text[]).
    const [row] = await db
      .select({ mods: companies.enabledModules })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    return (row?.mods as string[] | null) ?? [];
  }
}

export type AiProvider = 'platform_default' | 'groq' | 'gemini' | 'openai' | 'anthropic' | 'custom';

export interface ResolvedAiConfig {
  companyId:      number;
  provider:       AiProvider;
  /** Key "principal" ya descifrada (Groq si hay, sino Gemini, sino null).
   *  Por compat con código viejo. Para nueva lógica, usar
   *  `groqApiKey` / `geminiApiKey` directo. */
  apiKey:         string | null;
  /** Key de Groq de la empresa (descifrada). null = usar cascada global. */
  groqApiKey:     string | null;
  /** Key de Gemini de la empresa (descifrada). null = usar global. */
  geminiApiKey:   string | null;
  modelPrimary:   string;
  modelFallback:  string;
  /** 'platform' = env vars; 'company' = key propia de la empresa. */
  keySource:      'platform' | 'company';
  /** Si la empresa quiere la feature (use_jarvis / use_exit_analysis / etc.) */
  useJarvis:      boolean;
  useExitAnalysis:boolean;
  useAiInsights:  boolean;
  useTts:         boolean;
  /** Si el superadmin la kill-switchó. */
  killed:         boolean;
  /** RPM/TPM budget custom (null = usar el global). */
  rpmLimit:       number | null;
  tpmLimit:       number | null;
  monthlyBudgetUsd: number | null;
}

// ─── Defaults globales (env vars) ────────────────────────────────────────────

function globalGroqKey(): string | null {
  const v = process.env.GROQ_API_KEY?.trim();
  return v && v.length > 0 ? v : null;
}
function globalGeminiKey(): string | null {
  const v = process.env.GEMINI_API_KEY?.trim();
  return v && v.length > 0 ? v : null;
}
function defaultGroqPrimary(): string {
  return process.env.GROQ_MODEL_PRIMARY?.trim() || 'llama-3.1-8b-instant';
}
function defaultGroqFallback(): string {
  return process.env.GROQ_MODEL_FALLBACK?.trim() || 'llama-3.3-70b-versatile';
}
function defaultGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-1.5-flash';
}

// ─── Cache en memoria (TTL 60s) ──────────────────────────────────────────────

interface CacheEntry {
  config: ResolvedAiConfig;
  expiresAt: number;
}
const _cache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 60_000;

export function clearAiConfigCache(companyId?: number): void {
  if (companyId == null) _cache.clear();
  else _cache.delete(companyId);
}

// ─── Resolver ────────────────────────────────────────────────────────────────

export async function resolveAiConfig(
  companyId: number,
  opts: { force?: boolean } = {},
): Promise<ResolvedAiConfig> {
  if (!opts.force) {
    const cached = _cache.get(companyId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.config;
    }
  }

  // Lee la fila de la empresa (si existe).
  const [row] = await db
    .select()
    .from(companyAiSettings)
    .where(eq(companyAiSettings.companyId, companyId))
    .limit(1);

  // Sin fila → todo platform_default.
  if (!row) {
    const config = buildPlatformDefault(companyId);
    _cache.set(companyId, { config, expiresAt: Date.now() + CACHE_TTL_MS });
    return config;
  }

  const killed = row.killedByPlatform || !row.isEnabled;

  // jul 2026 v7 — multi-key. Descifrar las keys que la empresa haya
  // cargado. Si una falla, esa key queda null (cae a global).
  let groqApiKey:  string | null = null;
  let geminiApiKey: string | null = null;
  if (row.groqApiKeyEncrypted) {
    try { groqApiKey  = decryptSecret(row.groqApiKeyEncrypted); } catch { /* corrupta */ }
  }
  if (row.geminiApiKeyEncrypted) {
    try { geminiApiKey = decryptSecret(row.geminiApiKeyEncrypted); } catch { /* corrupta */ }
  }

  // El "provider" efectivo lo decide el CALLER según la feature.
  // Acá solo exponemos cuál key propia tiene la empresa. Para mantener
  // compat con código viejo, `apiKey` se setea a la primera key propia
  // disponible (preferentemente Groq).
  const primaryKey = groqApiKey ?? geminiApiKey;
  const primaryProvider: AiProvider = groqApiKey  ? 'groq'
                                    : geminiApiKey ? 'gemini'
                                    : 'platform_default';
  const keySource: 'platform' | 'company' = primaryKey ? 'company' : 'platform';

  const config: ResolvedAiConfig = {
    companyId,
    provider:       primaryProvider,
    apiKey:         primaryKey,
    groqApiKey,
    geminiApiKey,
    // El modelo SIEMPRE lo define ApliSmart — la empresa no puede
    // cambiarlo. Por eso ignoramos `row.modelPrimary` y devolvemos el
    // default de cada provider.
    modelPrimary:   primaryProvider === 'gemini' ? defaultGeminiModel() : defaultGroqPrimary(),
    modelFallback:  primaryProvider === 'gemini' ? ''                   : defaultGroqFallback(),
    keySource,
    useJarvis:      row.useJarvis,
    useExitAnalysis:row.useExitAnalysis,
    useAiInsights:  row.useAiInsights,
    useTts:         row.useTts,
    killed,
    rpmLimit:       row.rpmLimit,
    tpmLimit:       row.tpmLimit,
    monthlyBudgetUsd: row.monthlyBudgetUsd ? Number(row.monthlyBudgetUsd) : null,
  };

  _cache.set(companyId, { config, expiresAt: Date.now() + CACHE_TTL_MS });
  return config;
}

function buildPlatformDefault(companyId: number): ResolvedAiConfig {
  // Detecta qué providers globales están activos por la env var.
  const groq   = resolveGlobalGroqKey();
  const gemini = globalGeminiKey();
  let provider: AiProvider = 'platform_default';
  let apiKey:   string | null = null;
  if (groq)   { provider = 'groq';   apiKey = groq;   }
  else if (gemini) { provider = 'gemini'; apiKey = gemini; }

  return {
    companyId,
    provider,
    apiKey,
    groqApiKey:   groq,
    geminiApiKey: gemini,
    modelPrimary:   provider === 'gemini' ? defaultGeminiModel() : defaultGroqPrimary(),
    modelFallback:  provider === 'gemini' ? ''                   : defaultGroqFallback(),
    keySource:      'platform',
    useJarvis:      true,
    useExitAnalysis:true,
    useAiInsights:  true,
    useTts:         false,
    killed:         false,
    rpmLimit:       null,
    tpmLimit:       null,
    monthlyBudgetUsd: null,
  };
}

// ─── Clientes SDK por-empresa ────────────────────────────────────────────────
//
// Devuelven un cliente Groq o Gemini NUEVO por empresa. No reutilizamos
// el singleton global porque su state (cascade keys/models) pertenece a
// la plataforma.
//
// Si en el futuro hay 1000 empresas con su propia key, conviene un pool
// con TTL. Hoy (jul 2026) son pocas empresas con override, así que OK.

export async function getGroqClientForCompany(companyId: number): Promise<Groq | null> {
  // jul 2026 v7 — usa key de Groq específica (no la "primary" que puede ser Gemini).
  const cfg = await resolveAiConfig(companyId);
  if (cfg.groqApiKey) return new Groq({ apiKey: cfg.groqApiKey });
  const k = resolveGlobalGroqKey();
  if (!k) return null;
  return new Groq({ apiKey: k });
}

export async function getGeminiClientForCompany(
  companyId: number,
): Promise<GoogleGenerativeAI | null> {
  // jul 2026 v7 — usa key de Gemini específica.
  const cfg = await resolveAiConfig(companyId);
  if (cfg.geminiApiKey) return new GoogleGenerativeAI(cfg.geminiApiKey);
  const k = globalGeminiKey();
  if (!k) return null;
  return new GoogleGenerativeAI(k);
}

// ─── Helpers unificados por-empresa (jul 2026 v6 — feature 2) ──────────────
//
// Para casos donde el código ya TIENE el cliente Groq (singleton legacy
// de groq-client.ts, o el HTTP crudo de ai-client.ts) y solo necesita
// resolver la key + modelo correctos para esta empresa. Usado por:
//
//   - ai-insights.ts (análisis de estadísticas)
//   - tts.ts (ElevenLabs)
//   - oil-check.service.ts (análisis de bayoneta de aceite)
//   - weekly-summary.ts (cron de resúmenes semanales)
//
// La cascada de prioridad (igual que resolveAiConfig) es:
//   1. company_ai_settings con key propia cifrada
//   2. company_ai_settings.provider = 'platform_default' → env vars globales
//   3. Sin override de empresa → env vars globales (legacy + cascada)
//
// Si el superadmin kill-switchó la empresa, devuelve null (NO se debe
// generar contenido de IA para esa empresa).

/** Resultado de resolver la key+modelo para una feature de una empresa. */
export interface AiKeyForCompany {
  apiKey:         string;
  model:          string;
  /** 'company' = key propia, 'platform' = env vars. */
  keySource:      'company' | 'platform';
  provider:       AiProvider;
}

/**
 * Resuelve API key + modelo de Groq para una empresa y feature.
 * Devuelve `null` si la feature está deshabilitada, kill-switched, o
 * no hay key disponible en ningún lado.
 *
 * jul 2026 v7 — la empresa puede tener su PROPIA API key de Groq.
 * El MODELO es siempre el de ApliSmart (env var o default). La
 * empresa NO elige modelo, solo "comprá tu propia key de Groq con
 * el mismo modelo que nosotros usamos".
 */
export async function getGroqKeyForCompany(
  companyId: number,
  feature: AiFeature = 'jarvis',
): Promise<AiKeyForCompany | null> {
  // jul 2026 v9 — Gate per-modulo. La empresa tiene que tener el módulo
  // `jarvis` habilitado en su plan (`companyModules`). Sin esto, una
  // empresa del plan Starter podría usar la IA si el flag `useJarvis`
  // quedó activo por un override manual. Con esto, la única manera de
  // usar la IA es que la empresa SÍ tenga `jarvis` en su plan.
  const companyModules = await getCompanyModules(companyId);
  if (!companyModules.includes("jarvis")) return null;

  const cfg = await resolveAiConfig(companyId);
  if (cfg.killed) return null;
  const flag =
    feature === 'jarvis'        ? cfg.useJarvis      :
    feature === 'exit_analysis' ? cfg.useExitAnalysis :
    feature === 'ai_insights'   ? cfg.useAiInsights  :
                                  cfg.useTts;
  if (!flag) return null;

  const model = defaultGroqPrimary();

  // 1. Si la empresa tiene su propia key de Groq → la usamos.
  if (cfg.groqApiKey) {
    return {
      apiKey:    cfg.groqApiKey,
      model,
      keySource: 'company',
      provider:  'groq',
    };
  }

  // 2. Si no, caemos a la cascada global.
  const groqKey = resolveGlobalGroqKey();
  if (!groqKey) return null;

  return {
    apiKey:    groqKey,
    model,
    keySource: 'platform',
    provider:  'groq',
  };
}

/**
 * Resuelve API key + modelo de Gemini para una empresa y feature.
 * Misma filosofía: la empresa puede tener su propia key, el modelo
 * es siempre el de ApliSmart.
 */
export async function getGeminiKeyForCompany(
  companyId: number,
  feature: AiFeature = 'exit_analysis',
): Promise<AiKeyForCompany | null> {
  const cfg = await resolveAiConfig(companyId);
  if (cfg.killed) return null;
  const flag =
    feature === 'jarvis'        ? cfg.useJarvis      :
    feature === 'exit_analysis' ? cfg.useExitAnalysis :
    feature === 'ai_insights'   ? cfg.useAiInsights  :
                                  cfg.useTts;
  if (!flag) return null;

  const model = defaultGeminiModel();

  if (cfg.geminiApiKey) {
    return {
      apiKey:    cfg.geminiApiKey,
      model,
      keySource: 'company',
      provider:  'gemini',
    };
  }

  const geminiKey = globalGeminiKey();
  if (!geminiKey) return null;

  return {
    apiKey:    geminiKey,
    model,
    keySource: 'platform',
    provider:  'gemini',
  };
}

/**
 * Resuelve API key de ElevenLabs para TTS.
 *
 * NOTA: ElevenLabs todavía NO se guarda en company_ai_settings (solo
 * soportamos Groq + Gemini como override). Si en el futuro se quiere
 * per-empresa, hay que agregar `elevenlabs_api_key_encrypted` a la
 * tabla. Por ahora, todas las empresas usan la key global.
 */
export function getElevenLabsKey(): string | null {
  const k = process.env.ELEVENLABS_API_KEY?.trim();
  return k && k.length > 10 ? k : null;
}

// ─── Cascada Groq (compat con .env 1-based) ────────────────────────────────

/**
 * Devuelve la key Groq "primaria" global. Prioriza la cascada 1-based
 * (`GROQ_API_KEY1`, `GROQ_API_KEY2`, …), y cae a la legacy `GROQ_API_KEY`
 * si la cascada no está configurada.
 */
function resolveGlobalGroqKey(): string | null {
  // Si hay cascada 1-based, tomamos la primera disponible.
  const countStr = process.env.GROQ_API_KEY_COUNT?.trim();
  const count = countStr && /^\d+$/.test(countStr) ? Math.min(20, Number(countStr)) : 0;
  if (count >= 1) {
    for (let i = 1; i <= count; i++) {
      const v = process.env[`GROQ_API_KEY${i}`]?.trim();
      if (v && v.length > 10) return v;
    }
    return null;
  }
  // Sin cascada → legacy.
  return globalGroqKey();
}

// ─── Guard: ¿la empresa puede usar la feature? ───────────────────────────────

export type AiFeature = 'jarvis' | 'exit_analysis' | 'ai_insights' | 'tts';

export async function assertFeatureEnabled(
  companyId: number,
  feature: AiFeature,
): Promise<ResolvedAiConfig> {
  const cfg = await resolveAiConfig(companyId);
  if (cfg.killed) {
    throw new AppError(403, 'La IA está deshabilitada para tu empresa por el administrador de plataforma.');
  }
  const flag =
    feature === 'jarvis'        ? cfg.useJarvis      :
    feature === 'exit_analysis' ? cfg.useExitAnalysis :
    feature === 'ai_insights'   ? cfg.useAiInsights  :
                                  cfg.useTts;
  if (!flag) {
    throw new AppError(403, `La feature "${feature}" no está habilitada para tu empresa.`);
  }
  if (!cfg.apiKey) {
    throw new AppError(503,
      'No hay API key de IA configurada. Pedile al admin de plataforma que configure una key ' +
      'global o a tu admin de empresa que cargue una key propia.');
  }
  return cfg;
}