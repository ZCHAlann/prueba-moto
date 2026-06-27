// lib/ai/tool-cache.ts
// ─────────────────────────────────────────────────────────────────────
// Cache de resultados de tools de SOLO LECTURA.
//
// Clave: `${empresaId}|${rol}|${toolName}|${canonicalArgsJson}`
// Valor: { result, expiresAt, hits }
// TTL:   5 minutos (configurable).
//
// El cache es best-effort, en memoria del proceso Node. No se comparte
// entre workers de PM2 — eso está bien porque:
//
//   1. Reduce tokens consumidos en tools repetidas (mismo filtro).
//   2. Reduce latencia (~0ms vs ~80ms de DB).
//   3. Si se invalidar por reinicio del server, simplemente recomputamos.
//
// Invalidez automática por TTL. Sin invalidación manual: las tools de
// lectura reflejan datos que pueden cambiar, pero un delay de 5 min
// es aceptable para el caso de uso (analytics read-only).
// ─────────────────────────────────────────────────────────────────────

import type { ToolResult } from './tools/registry';
import { incCounter } from './metrics';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutos

interface CacheEntry {
  result:    ToolResult;
  expiresAt: number;
  hits:      number;
  createdAt: number;
}

class ToolCache {
  private map = new Map<string, CacheEntry>();
  private stats = {
    hits:      0,
    misses:    0,
    sets:      0,
    evictions: 0,
  };

  /** Hash determinístico para los argumentos (mismo orden = mismo hash). */
  private canonicalKey(args: unknown): string {
    // Ordenamos las claves recursivamente para que {a:1,b:2} === {b:2,a:1}.
    const sortKeys = (val: unknown): unknown => {
      if (Array.isArray(val)) return val.map(sortKeys);
      if (val && typeof val === 'object') {
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(val as Record<string, unknown>).sort()) {
          sorted[k] = sortKeys((val as Record<string, unknown>)[k]);
        }
        return sorted;
      }
      return val;
    };
    return JSON.stringify(sortKeys(args ?? {}));
  }

  private buildKey(empresaId: number, rol: string, toolName: string, args: unknown): string {
    return `${empresaId}|${rol}|${toolName}|${this.canonicalKey(args)}`;
  }

  /** Devuelve el resultado cacheado si existe y no expiró. */
  get(empresaId: number, rol: string, toolName: string, args: unknown): ToolResult | null {
    const key = this.buildKey(empresaId, rol, toolName, args);
    const entry = this.map.get(key);
    if (!entry) {
      this.stats.misses++;
      incCounter('jarvis_cache_misses_total');
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      this.stats.misses++;
      incCounter('jarvis_cache_misses_total');
      return null;
    }
    entry.hits++;
    this.stats.hits++;
    incCounter('jarvis_cache_hits_total');
    return entry.result;
  }

  /** Guarda un resultado con TTL (por defecto 5 min). */
  set(
    empresaId: number,
    rol: string,
    toolName: string,
    args: unknown,
    result: ToolResult,
    ttlMs = DEFAULT_TTL_MS,
  ): void {
    const key = this.buildKey(empresaId, rol, toolName, args);
    this.map.set(key, {
      result,
      expiresAt: Date.now() + ttlMs,
      hits:      0,
      createdAt: Date.now(),
    });
    this.stats.sets++;
    // Limpieza oportunista: si el cache crece mucho (>500 entradas),
    // evictamos las más viejas.
    if (this.map.size > 500) {
      this.evictOldest(100);
    }
  }

  /** Limpia todas las entradas (por empresa o todas). */
  invalidate(empresaId?: number): number {
    if (empresaId == null) {
      const n = this.map.size;
      this.map.clear();
      return n;
    }
    let n = 0;
    for (const key of this.map.keys()) {
      if (key.startsWith(`${empresaId}|`)) {
        this.map.delete(key);
        n++;
      }
    }
    return n;
  }

  private evictOldest(n: number): void {
    const entries = Array.from(this.map.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < n && i < entries.length; i++) {
      this.map.delete(entries[i]![0]);
      this.stats.evictions++;
    }
  }

  /** Métricas para debug endpoint. */
  getStats() {
    return {
      ...this.stats,
      size:       this.map.size,
      hitRate:    this.stats.hits + this.stats.misses > 0
        ? Math.round((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100)
        : 0,
    };
  }
}

// Singleton para el proceso Node.
export const toolCache = new ToolCache();