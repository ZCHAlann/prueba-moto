// lib/ai/voice-pipeline.ts
// ─────────────────────────────────────────────────────────────────────
// Orquestador end-to-end del canal de voz de Jarvis.
//
// Pipeline:  AUDIO → [STT: Whisper de Groq] → TEXTO → [Jarvis con tools]
//           → TEXTO respuesta → [TTS: ElevenLabs / Kokoro] → AUDIO respuesta
//
// jul 2026 v6 — Migracion a Groq. Antes del STT, el wake word
// (openWakeWord o Picovoice) corre 100% en el cliente y solo dispara
// el pipeline cuando el usuario dice la palabra clave. Eso queda en el
// frontend; este modulo recibe el audio POST-wake-word.
//
// El frontend (mobile/web) manda el audio ya recortado al backend, y
// este modulo lo transcribe, lo pasa por Jarvis, y devuelve el texto
// (que el frontend reproduce con su TTS local, ej. ElevenLabs o Kokoro).
// ─────────────────────────────────────────────────────────────────────

import { transcribeAudio, transcribeAudioBuffer, type SttResult } from './whisper-stt';
import { jarvisChat, classifyAndMaybeAnswer, type JarvisChatInput } from './jarvis';
import type { JarvisRole } from './jarvis';
import { incCounter, observeHistogram } from './metrics';

export interface VoicePipelineInput {
  /** Empresa del usuario (multi-tenant, del JWT). */
  empresaId: number;
  /** userId del usuario autenticado. */
  userId: number;
  /** Nombre a mostrar en la respuesta hablada. */
  userName: string;
  /** Rol del usuario (admin_empresa / owner_empresa). */
  rol: JarvisRole;
  /** Nombre de la empresa (para personalizar la respuesta). */
  empresaNombre: string;
  /** conversationId para mantener contexto entre turnos. Opcional. */
  conversationId?: string | null;
  /** Buffer de audio del cliente (despues del wake word). */
  audioBuffer: Buffer;
  /** Nombre del archivo, ej. "audio.webm" — para que Whisper sepa el formato. */
  filename?: string;
  /** Idioma del audio, si el cliente lo sabe (ej. 'es'). */
  language?: string | null;
  /**
   * Prompt opcional para guiar a Whisper. Util cuando hay terminos
   * tecnicos de la flota (nombres de modelos, placas, marcas) que
   * Whisper tiende a inventar.
   *
   * Recomendado: "ApliSmart Motors, gestion de flotas en Ecuador.
   * Marcas comunes: Chevrolet, Toyota, JAC. Estados: Operativo,
   * En mantenimiento, Fuera de servicio."
   */
  sttPrompt?: string;
}

export interface VoicePipelineOutput {
  /** Lo que dijo el usuario (transcripcion). */
  transcript: string;
  /** Lo que respondio Jarvis. */
  reply: string;
  /** conversationId para el proximo turno. */
  conversationId: string;
  /** Latencias individuales para telemetria. */
  latency: {
    sttMs: number;
    jarvisMs: number;
    totalMs: number;
  };
  /** Tokens consumidos (si el orquestador los devolvio). */
  tokensIn?: number;
  tokensOut?: number;
}

/**
 * Ejecuta el pipeline de voz completo: STT → jarvis.
 * Devuelve { transcript, reply, conversationId } que el frontend
 * reproduce con su TTS.
 *
 * No hace TTS — el TTS vive en el cliente (ElevenLabs SDK / Kokoro
 * corriendo en el navegador o nativo del movil). Esto evita pagar
 * TTS server-side y baja latencia percibida.
 */
export async function processVoiceTurn(
  input: VoicePipelineInput,
): Promise<VoicePipelineOutput> {
  const t0 = Date.now();

  // 1) STT: audio -> texto.
  const stt: SttResult = await transcribeAudioBuffer(input.audioBuffer, {
    companyId: input.empresaId,
    filename:   input.filename,
    language:   input.language,
    prompt:     input.sttPrompt,
  }).catch((e) => {
    incCounter('voice_pipeline_stt_errors_total');
    throw new Error('STT fallo: ' + e.message);
  });
  incCounter('voice_pipeline_stt_total');
  observeHistogram('voice_stt_latency_ms', stt.latencyMs);

  // Si Whisper no devolvio nada (audio silencio, error de captura, etc),
  // respondemos con un mensaje neutro y dejamos que el frontend decida
  // si vuelve a escuchar o muestra error.
  if (!stt.text.trim()) {
    return {
      transcript: '',
      reply: 'No te escuche bien. ¿Me lo decis de nuevo?',
      conversationId: input.conversationId ?? '',
      latency: { sttMs: stt.latencyMs, jarvisMs: 0, totalMs: Date.now() - t0 },
    };
  }

  // 2) Clasificador barato: si el mensaje es trivial (saludo, chit-chat,
  // etc.) respondemos sin gastar tokens del LLM grande.
  const classification = await classifyAndMaybeAnswer(stt.text, {
    empresaId:      input.empresaId,
    userName:       input.userName,
    rol:            input.rol,
    empresaNombre:  input.empresaNombre,
  });

  let reply: string;
  let conversationId: string;
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  let jarvisMs = 0;

  if (classification.kind === 'answer_directly') {
    // El clasificador ya tiene la respuesta (caso trivial). No
    // gastamos el LLM grande.
    reply = classification.reply;
    conversationId = input.conversationId ?? '';
    incCounter('voice_pipeline_classifier_direct_total');
  } else {
    // 3) Jarvis propiamente: texto -> respuesta con tools si hace falta.
    const t1 = Date.now();
    const jarvisResult = await jarvisChat({
      empresaId:      input.empresaId,
      userId:         input.userId,
      userName:       input.userName,
      rol:            input.rol,
      empresaNombre:  input.empresaNombre,
      conversationId: input.conversationId,
      message:        stt.text,
      // Voice mode ON: la respuesta se va a leer por TTS.
      voiceMode:      true,
    } as JarvisChatInput);
    jarvisMs = Date.now() - t1;
    reply = jarvisResult.answer;
    conversationId = jarvisResult.conversationId;
    tokensIn = jarvisResult.tokensIn;
    tokensOut = jarvisResult.tokensOut;
    incCounter('voice_pipeline_jarvis_total');
    observeHistogram('voice_jarvis_latency_ms', jarvisMs);
  }

  // 4) Metricas + return.
  const totalMs = Date.now() - t0;
  incCounter('voice_pipeline_total');
  observeHistogram('voice_pipeline_latency_ms', totalMs);

  return {
    transcript:    stt.text,
    reply,
    conversationId,
    latency: { sttMs: stt.latencyMs, jarvisMs, totalMs },
    tokensIn,
    tokensOut,
  };
}

/**
 * Helper para el caso de texto puro (no voz). Sirve para que el canal
 * de voz y el canal de chat compartan la misma logica de "clasificar
 * primero, despues orquestar":
 *
 *   classifyAndMaybeAnswer() -> si trivial, responder
 *   sino, jarvisChat() con voiceMode segun el canal
 */
export async function processTextTurn(
  input: JarvisChatInput,
): Promise<{ reply: string; conversationId: string; tokensIn?: number; tokensOut?: number }> {
  const classification = await classifyAndMaybeAnswer(input.message, {
    empresaId:     input.empresaId,
    userName:      input.userName,
    rol:           input.rol,
    empresaNombre: input.empresaNombre,
  });
  if (classification.kind === 'answer_directly') {
    // En modo texto (no voz) el clasificador no devuelve respuesta
    // directa — siempre pasamos a jarvis. Esto es porque las
    // preguntas en chat suelen requerir datos aunque parezcan
    // triviales (ej. "cuantos vehiculos tenes" parece trivial pero
    // necesita getVehiculos).
    // → Esta rama solo se usa en modo voz. En texto, devolvemos
    //   'passthrough' desde el clasificador y caemos aca abajo.
    void classification;
  }
  const result = await jarvisChat(input);
  return {
    reply: result.answer,
    conversationId: result.conversationId,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
}
