// lib/gemini-client.ts
//
// Cliente singleton de Gemini para análisis multimodal.
//
// Por qué singleton: el SDK oficial (@google/generative-ai) maneja un pool
// de conexiones HTTP internamente. Crear un cliente por request desperdicia
// memoria y rompe el rate-limiter que el SDK aplica.
//
// Modelo: gemini-2.0-flash. Elegido por:
//   - 1500 RPD gratis (suficiente para 12 conductores × 5 ítems = 60 análisis/día)
//   - 1M TPM (suficiente para imágenes en base64)
//   - Multimodal nativo: imágenes + texto en un solo request
//   - Latencia baja (~1-2s por análisis)
//
// Si en el futuro se quiere usar gemini-2.5-pro (más preciso, más caro),
// cambiar `GEMINI_MODEL` abajo.
//
// jul 2026 v6 — multi-tenant. Las funciones `*ForCompany` permiten que
// cada empresa use su propia API key. Si la empresa usa la global
// (provider='platform_default'), cae al singleton de arriba.

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  getGeminiClientForCompany,
  resolveAiConfig,
  assertFeatureEnabled,
} from './ai/client-factory';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

let _client: GoogleGenerativeAI | null = null;
let _model: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;

/**
 * Devuelve el cliente de Gemini. Si no hay API key configurada, lanza error.
 * Esto evita que el sistema se "sienta" funcionando sin IA (peticiones que
 * fallan silenciosamente y generan frustración al supervisor).
 */
export function getGeminiClient(): GoogleGenerativeAI {
  if (!GEMINI_API_KEY) {
    throw Object.assign(
      new Error('GEMINI_API_KEY no está configurada en el entorno. Análisis IA deshabilitado.'),
      { code: 'AI_DISABLED' },
    );
  }
  if (!_client) {
    _client = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return _client;
}

export function getGeminiModel() {
  if (!_model) {
    _model = getGeminiClient().getGenerativeModel({
      model: GEMINI_MODEL,
      // Importante: generationConfig se pasa por-request, no aquí, porque
      // queremos poder ajustar temperature/maxTokens según el caso de uso.
    });
  }
  return _model;
}

export function isAiEnabled(): boolean {
  return !!GEMINI_API_KEY;
}

export const GEMINI_MODEL_NAME = GEMINI_MODEL;

// ─── Multi-tenant (jul 2026 v6) ───────────────────────────────────────────────

/**
 * Devuelve el cliente Gemini resuelto para la empresa. Si la empresa tiene
 * su propia key, devuelve un cliente nuevo con esa key. Si no, usa el
 * singleton global (mismo comportamiento que antes).
 *
 * Si la feature de Gemini está deshabilitada o la empresa fue killed,
 * assertFeatureEnabled lanza 403.
 */
export async function getGeminiModelForCompany(
  companyId: number,
  feature: 'exit_analysis' | 'ai_insights' = 'exit_analysis',
) {
  const cfg = await assertFeatureEnabled(companyId, feature);
  if (cfg.provider !== 'gemini' && cfg.keySource === 'platform') {
    // Fallback al singleton global (compat con código viejo).
    return { model: getGeminiModel(), config: cfg };
  }
  const client = await getGeminiClientForCompany(companyId);
  if (!client) {
    throw Object.assign(
      new Error('No se pudo obtener cliente Gemini para esta empresa.'),
      { code: 'AI_DISABLED' },
    );
  }
  const model = client.getGenerativeModel({ model: cfg.modelPrimary });
  return { model, config: cfg };
}
