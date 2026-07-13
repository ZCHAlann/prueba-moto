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

export type AiProvider = 'platform_default' | 'groq' | 'gemini' | 'openai' | 'anthropic' | 'custom';

export interface ResolvedAiConfig {
  companyId:      number;
  provider:       AiProvider;
  /** Key ya descifrada. */
  apiKey:         string | null;
  modelPrimary:   string;
  modelFallback:  string;
  /** 'platform' = env vars; 'company' = apiKey de la empresa. */
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

  // provider = platform_default → usa env vars aunque haya fila.
  if (row.provider === 'platform_default') {
    const config: ResolvedAiConfig = {
      ...buildPlatformDefault(companyId),
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

  // provider custom → necesita API key cifrada.
  if (!row.apiKeyEncrypted) {
    // Tiene provider custom pero sin key: degradamos a platform_default
    // y logueamos (en consola) para que el operador note el problema.
    console.warn(
      `[ai-factory] company ${companyId} tiene provider=${row.provider} pero sin api_key. ` +
      `Cayendo a platform_default.`,
    );
    const config: ResolvedAiConfig = {
      ...buildPlatformDefault(companyId),
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

  let apiKey: string;
  try {
    apiKey = decryptSecret(row.apiKeyEncrypted);
  } catch (err) {
    console.error(`[ai-factory] company ${companyId} api_key no se pudo descifrar`, err);
    throw new AppError(500, 'API key de IA corrupta. Contactá al administrador de plataforma.');
  }

  const isGroq   = row.provider === 'groq';
  const isGemini = row.provider === 'gemini';
  const primary  = row.modelPrimary  || (isGroq ? defaultGroqPrimary()  : isGemini ? defaultGeminiModel()  : 'gpt-4o-mini');
  const fallback = row.modelFallback || (isGroq ? defaultGroqFallback() : '');

  const config: ResolvedAiConfig = {
    companyId,
    provider:       row.provider as AiProvider,
    apiKey,
    modelPrimary:   primary,
    modelFallback:  fallback,
    keySource:      'company',
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
  // Detecta qué provider global está activo por la env var que exista.
  const groq   = globalGroqKey();
  const gemini = globalGeminiKey();
  let provider: AiProvider = 'platform_default';
  let apiKey:   string | null = null;
  if (groq)   { provider = 'groq';   apiKey = groq;   }
  else if (gemini) { provider = 'gemini'; apiKey = gemini; }

  return {
    companyId,
    provider,
    apiKey,
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
  const cfg = await resolveAiConfig(companyId);
  if (!cfg.apiKey) return null;
  return new Groq({ apiKey: cfg.apiKey });
}

export async function getGeminiClientForCompany(
  companyId: number,
): Promise<GoogleGenerativeAI | null> {
  const cfg = await resolveAiConfig(companyId);
  if (!cfg.apiKey) return null;
  return new GoogleGenerativeAI(cfg.apiKey);
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