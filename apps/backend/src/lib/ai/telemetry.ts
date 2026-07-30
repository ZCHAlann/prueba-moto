// lib/ai/telemetry.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v3 — Sistema de timing end-to-end para identificar el
// cuello de botella en la respuesta del asistente.
//
// Stages que medimos en `jarvisChatStream`:
//   1. auth       → validar JWT y resolver empresa (en route, fuera de aquí)
//   2. setup      → ensureConversation, loadHistory
//   3. classify   → clasificador (si no hay shortcut por currentModule)
//   4. llm_create→ chat.completions.create (Groq)
//   5. llm_stream→ recibir todos los chunks de texto
//   6. tool_N     → cada tool ejecutada (parse + validate + run + cache)
//   7. llm_loop   → si hubo tool_calls, segunda llamada al LLM con results
//   8. persist    → guardar en DB (ai_messages, ai_tool_calls)
//
// Cada stage tiene: start, end, duration, metadata opcional.
//
// Output: log consolidado al final del turno con breakdown por
// stage + total. Útil para ver dónde se va el tiempo.
//
// También expone el estado via `getLastBreakdown()` y `getRecent()`.
// El frontend NO consume esto (es solo backend observability).
// ─────────────────────────────────────────────────────────────────────

export type StageName =
  | 'setup'
  | 'classify'
  | 'llm_create'
  | 'llm_stream'
  | 'tool'
  | 'llm_loop'
  | 'persist';

export interface StageRecord {
  name: StageName;
  /** Para tools, nombre de la tool. Para llm_*, modelo usado. */
  label?: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Metadata libre (ej. "fromCache: true", "keyIndex: 2"). */
  meta?: Record<string, unknown>;
}

export interface TurnTelemetry {
  /** Timestamp absoluto del inicio (ms epoch). */
  startedAt: number;
  /** Cuando terminó el turno entero (incluyendo persist). */
  finishedAt?: number;
  /** Total en ms (finishedAt - startedAt). */
  totalMs?: number;
  /** Stages en orden de ejecución. */
  stages: StageRecord[];
  /** Inputs del turno (no sensible). */
  context?: {
    messageLen: number;
    conversationId?: string | null;
    hasCurrentModule: boolean;
    shortcutUsed: boolean;
    toolsSelected: number;
    toolsExecuted: number;
    tokensIn: number;
    tokensOut: number;
    cascadeKey: number;
    cascadeModel: string;
    fallbackUsed: boolean;
  };
}

const _current: TurnTelemetry = {
  startedAt: 0,
  stages: [],
};

/** Inicializa un nuevo turno. Llamar al entrar al handler. */
export function startTurn(): TurnTelemetry {
  _current.startedAt = Date.now();
  _current.finishedAt = undefined;
  _current.totalMs = undefined;
  _current.stages = [];
  return _current;
}

/**
 * Marca el inicio de un stage. Devuelve una función para marcar el
 * final, o el record ya completo si llamaste con start/end directo.
 */
export function beginStage(
  name: StageName,
  label?: string,
  startMs = Date.now(),
): { end: (meta?: Record<string, unknown>) => StageRecord } {
  const start = startMs;
  return {
    end: (meta?: Record<string, unknown>): StageRecord => {
      const end = Date.now();
      const rec: StageRecord = {
        name,
        label,
        startMs: start,
        endMs: end,
        durationMs: end - start,
        meta,
      };
      _current.stages.push(rec);
      return rec;
    },
  };
}

/** Helper para stages de duración fija (ya sabemos cuánto duró). */
export function recordStage(
  name: StageName,
  durationMs: number,
  label?: string,
  meta?: Record<string, unknown>,
  startMs = Date.now() - durationMs,
): StageRecord {
  const rec: StageRecord = {
    name,
    label,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    meta,
  };
  _current.stages.push(rec);
  return rec;
}

/** Finaliza el turno y loguea el breakdown. */
export function finishTurn(
  context?: Partial<TurnTelemetry['context']>,
  log: (line: string) => void = console.log,
): TurnTelemetry {
  _current.finishedAt = Date.now();
  _current.totalMs = _current.finishedAt - _current.startedAt;
  if (context) _current.context = { ..._current.context, ...context } as TurnTelemetry['context'];

  // Calcular breakdown por categoría.
  const byStage = new Map<string, { count: number; totalMs: number }>();
  for (const s of _current.stages) {
    const key = s.label ? `${s.name}:${s.label}` : s.name;
    const prev = byStage.get(key) ?? { count: 0, totalMs: 0 };
    prev.count++;
    prev.totalMs += s.durationMs;
    byStage.set(key, prev);
  }

  // Log con formato tabular para que sea fácil de escanear.
  const ctx = _current.context;
  log(`[jarvis-perf] ━━━ TURN ${_current.totalMs}ms ━━━`);
  log(
    `[jarvis-perf] tools=${ctx?.toolsSelected ?? '?'} ` +
    `executed=${ctx?.toolsExecuted ?? 0} tokens=${ctx?.tokensIn ?? 0}/${ctx?.tokensOut ?? 0} ` +
    `key=${ctx?.cascadeKey ?? '?'} model=${ctx?.cascadeModel ?? '?'} fallback=${ctx?.fallbackUsed}`,
  );
  const sorted = Array.from(byStage.entries()).sort((a, b) => b[1].totalMs - a[1].totalMs);
  for (const [key, agg] of sorted) {
    const pct = _current.totalMs ? ((agg.totalMs / _current.totalMs) * 100).toFixed(1) : '0';
    log(
      `[jarvis-perf]   ${key.padEnd(40)} ${String(agg.totalMs).padStart(6)}ms ` +
      `(${pct}%)  ×${agg.count}`,
    );
  }
  log(`[jarvis-perf] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  return _current;
}

/** Devuelve el último turno (para debug endpoint o tests). */
export function getLastTurn(): TurnTelemetry {
  return _current;
}
