// lib/ai/metrics.ts
// ─────────────────────────────────────────────────────────────────────
// Métricas en formato Prometheus (texto plano).
//
// Por ahora expone:
//   - jarvis_chat_total{status}      → counter de chats completados
//   - jarvis_chat_latency_ms         → histogram (summary) por turno
//   - jarvis_tool_invocations_total{tool,ok} → counter por tool
//   - jarvis_tool_latency_ms{tool}   → summary por tool
//   - jarvis_cache_hits_total        → counter
//   - jarvis_cache_misses_total      → counter
//   - jarvis_tokens_total{type}      → counter (in/out)
//   - jarvis_active_conversations    → gauge (último valor de listMyConversations)
//
// El endpoint /metrics se monta en app.ts (no bajo /api/company).
// ─────────────────────────────────────────────────────────────────────

interface Counter {
  value: number;
  help: string;
  label?: string;
}

interface Histogram {
  buckets: number[]; // [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
  counts:  number[]; // count per bucket
  sum:     number;
  count:   number;
  help:    string;
  label?:  string;
}

const counters: Record<string, Counter> = {
  jarvis_chat_total:              { value: 0, help: 'Total de chats completados' },
  jarvis_chat_errors_total:       { value: 0, help: 'Total de chats con error' },
  jarvis_cache_hits_total:        { value: 0, help: 'Cache hits' },
  jarvis_cache_misses_total:      { value: 0, help: 'Cache misses' },
  jarvis_tokens_in_total:         { value: 0, help: 'Tokens de entrada consumidos' },
  jarvis_tokens_out_total:        { value: 0, help: 'Tokens de salida generados' },
};

const histograms: Record<string, Histogram> = {
  jarvis_chat_latency_ms: {
    buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000],
    counts:  [0,  0,   0,   0,   0,    0,    0,    0,       0],
    sum:     0,
    count:   0,
    help:    'Latencia de chats en ms',
  },
  jarvis_tool_latency_ms: {
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 5000],
    counts:  [0, 0,  0,  0,  0,   0,   0,   0,    0],
    sum:     0,
    count:   0,
    help:    'Latencia de tool calls en ms',
  },
};

// Counters con labels dinámicos: jarvis_tool_invocations_total{tool,ok}
const labeledCounters: Record<string, Record<string, number>> = {
  jarvis_tool_invocations_total: {},
};

// ─── API pública ─────────────────────────────────────────────────────

export function incCounter(name: keyof typeof counters, n = 1) {
  if (counters[name]) counters[name].value += n;
}

export function incLabeledCounter(metric: string, labels: Record<string, string>, n = 1) {
  if (!labeledCounters[metric]) labeledCounters[metric] = {};
  const k = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
  labeledCounters[metric][k] = (labeledCounters[metric][k] ?? 0) + n;
}

export function observeHistogram(name: keyof typeof histograms, value: number) {
  const h = histograms[name];
  if (!h) return;
  h.sum += value;
  h.count++;
  for (let i = 0; i < h.buckets.length; i++) {
    if (value <= h.buckets[i]!) h.counts[i]!++;
  }
}

// ─── Render ──────────────────────────────────────────────────────────

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function renderMetrics(): string {
  const lines: string[] = [];

  for (const [name, c] of Object.entries(counters)) {
    lines.push(`# HELP ${name} ${c.help}`);
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${c.value}`);
  }

  for (const [name, h] of Object.entries(histograms)) {
    lines.push(`# HELP ${name} ${h.help}`);
    lines.push(`# TYPE ${name} histogram`);
    let cum = 0;
    for (let i = 0; i < h.buckets.length; i++) {
      cum = h.counts[i]!;
      lines.push(`${name}_bucket{le="${h.buckets[i]}"} ${cum}`);
    }
    lines.push(`${name}_bucket{le="+Inf"} ${h.count}`);
    lines.push(`${name}_sum ${h.sum}`);
    lines.push(`${name}_count ${h.count}`);
  }

  for (const [name, labeled] of Object.entries(labeledCounters)) {
    lines.push(`# HELP ${name} Contadores con etiquetas`);
    lines.push(`# TYPE ${name} counter`);
    for (const [labels, value] of Object.entries(labeled)) {
      lines.push(`${name}{${escapeLabelValue(labels)}} ${value}`);
    }
  }

  return lines.join('\n') + '\n';
}