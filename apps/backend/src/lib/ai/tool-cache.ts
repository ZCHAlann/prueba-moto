// lib/ai/tool-cache.ts
// ─────────────────────────────────────────────────────────────────────
// Cache de resultados de tools de SOLO LECTURA.
//
// jul 2026 v3 — Agregado soporte SWR (Stale-While-Revalidate).
//
// Clave: `${empresaId}|${rol}|${toolName}|${canonicalArgsJson}`
// Valor: { result, freshExpiresAt, staleExpiresAt, hits }
// Estados de una entrada:
//   - fresh : ahora < freshExpiresAt
//   - stale : freshExpiresAt < ahora < staleExpiresAt  (devolver + recomputar)
//   - dead  : ahora > staleExpiresAt  (descartar)
//
// El cache es best-effort, en memoria del proceso Node. No se comparte
// entre workers de PM2.
//
// BENEFICIOS:
//   1. Reduce tokens consumidos en tools repetidas (mismo filtro).
//   2. Reduce latencia (~0ms vs ~80ms de DB).
//   3. SWR permite datos "ligeramente viejos" sin bloquear al user.
// ─────────────────────────────────────────────────────────────────────

import type { ToolResult } from './tools/registry';
import { incCounter } from './metrics';

const DEFAULT_FRESH_TTL_MS = 5 * 60 * 1000; // 5 min "fresh"
const DEFAULT_STALE_TTL_MS = 30 * 60 * 1000; // 30 min "stale but usable"

interface CacheEntry {
  result:           ToolResult;
  freshExpiresAt:   number;
  staleExpiresAt:   number;
  hits:             number;
  createdAt:        number;
}

export type CacheFetchResult =
  | { kind: 'fresh'; result: ToolResult }
  | { kind: 'stale'; result: ToolResult; ageMs: number }
  | { kind: 'miss' };

class ToolCache {
  private map = new Map<string, CacheEntry>();
  private stats = {
    hits:           0,   // fresh hit
    staleHits:      0,   // stale hit (SWR)
    misses:         0,
    sets:           0,
    evictions:      0,
  };

  /** Hash determinístico para los argumentos (mismo orden = mismo hash). */
  private canonicalKey(args: unknown): string {
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

  /**
   * Devuelve fresh o stale. NUNCA null (salvo que la entry no exista
   * o haya expirado del todo). Útil cuando el llamador quiere
   * devolver datos al user aunque sean viejos, y disparar la
   * recomputación en background.
   */
  getSWR(
    empresaId: number,
    rol: string,
    toolName: string,
    args: unknown,
  ): CacheFetchResult {
    const key = this.buildKey(empresaId, rol, toolName, args);
    const entry = this.map.get(key);
    if (!entry) {
      this.stats.misses++;
      incCounter('jarvis_cache_misses_total');
      return { kind: 'miss' };
    }
    const now = Date.now();
    if (now > entry.staleExpiresAt) {
      // Dead: borrar y devolver miss.
      this.map.delete(key);
      this.stats.misses++;
      incCounter('jarvis_cache_misses_total');
      return { kind: 'miss' };
    }
    if (now <= entry.freshExpiresAt) {
      // Fresh.
      entry.hits++;
      this.stats.hits++;
      incCounter('jarvis_cache_hits_total');
      return { kind: 'fresh', result: entry.result };
    }
    // Stale: devolver el viejo y marcar para revalidar.
    entry.hits++;
    this.stats.staleHits++;
    incCounter('jarvis_cache_stale_hits_total');
    return { kind: 'stale', result: entry.result, ageMs: now - entry.freshExpiresAt };
  }

  /**
   * Compat: comportamiento anterior. Devuelve null si está stale o dead.
   * Útil para tools donde los datos viejos NO son aceptables.
   */
  get(empresaId: number, rol: string, toolName: string, args: unknown): ToolResult | null {
    const r = this.getSWR(empresaId, rol, toolName, args);
    return r.kind === 'miss' ? null : r.result;
  }

  /**
   * Guarda un resultado con TTL fresh + stale. Defaults: 5 min fresh,
   * 30 min stale. Si pasás `freshTtlMs` solo, stale se calcula como
   * `freshTtlMs * 6` (cap a 30 min). Si pasás ambos, se respetan.
   */
  set(
    empresaId: number,
    rol: string,
    toolName: string,
    args: unknown,
    result: ToolResult,
    freshTtlMs: number = DEFAULT_FRESH_TTL_MS,
    staleTtlMs?: number,
  ): void {
    const key = this.buildKey(empresaId, rol, toolName, args);
    const now = Date.now();
    const finalStale = staleTtlMs ?? Math.min(freshTtlMs * 6, DEFAULT_STALE_TTL_MS);
    this.map.set(key, {
      result,
      freshExpiresAt: now + freshTtlMs,
      staleExpiresAt: now + finalStale,
      hits:           0,
      createdAt:      now,
    });
    this.stats.sets++;
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
    const totalHits = this.stats.hits + this.stats.staleHits;
    return {
      ...this.stats,
      size:       this.map.size,
      hitRate:    this.stats.hits + this.stats.misses > 0
        ? Math.round((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100)
        : 0,
      swrRate:     this.stats.hits + this.stats.staleHits + this.stats.misses > 0
        ? Math.round((totalHits / (this.stats.hits + this.stats.staleHits + this.stats.misses)) * 100)
        : 0,
    };
  }
}

// Singleton para el proceso Node.
export const toolCache = new ToolCache();
