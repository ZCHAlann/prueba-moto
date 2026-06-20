// lib/stats-anomalies-persist.ts
// ─────────────────────────────────────────────────────────────────────
// Persiste el resultado de `detectAllAnomalies` en la tabla
// `company_stats_anomalies`.
//
// Estrategia: por cada (companyId, modulo, tipo, dimension, dimensionId)
// solo guardamos la anomalía "activa" más reciente. Si el detector ya
// no la detecta, la marcamos como resuelta (metadata.resolvedAt).
//
// En la implementación actual sólo hacemos UPSERT de las anomalías nuevas
// + marcamos como resueltas las que ya no aparecen (en los últimos 60 min).
// ─────────────────────────────────────────────────────────────────────

import { and, eq, gte, sql, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { companyStatsAnomalies } from "../db/schema/operational";
import type { DetectedAnomalia } from "./stats-anomalies";

export type PersistResult = {
  inserted: number;
  updated: number;
  resolved: number;
};

const RESOLUTION_WINDOW_MIN = 60; // anomalías que no aparecen en este último sweep → resueltas

export async function persistAnomalies(
  companyId: number,
  detected: DetectedAnomalia[],
  options: { sweepId?: string } = {},
): Promise<PersistResult> {
  const sweepId = options.sweepId ?? new Date().toISOString();
  let inserted = 0, updated = 0, resolved = 0;

  // 1) Traer anomalías activas (sin resolver) del último RESOLUTION_WINDOW_MIN
  const cutoff = new Date();
  cutoff.setMinutes(cutoff.getMinutes() - RESOLUTION_WINDOW_MIN);

  const active = await db
    .select()
    .from(companyStatsAnomalies)
    .where(and(
      eq(companyStatsAnomalies.companyId, companyId),
      gte(companyStatsAnomalies.detectadoEn, cutoff),
      // (no marcamos resueltas las que ya tienen detectedEn más viejo
      //  porque esas probablemente ya se limpiaron)
    ));

  // Indexar por (modulo, tipo, dimension, dimensionId)
  const activeKey = (a: typeof active[number]) =>
    `${a.modulo}|${a.tipo}|${a.dimension}|${a.dimensionId ?? "null"}`;

  const activeMap = new Map<string, typeof active[number]>();
  for (const a of active) activeMap.set(activeKey(a), a);

  const detectedKeys = new Set<string>();

  // 2) Upsert cada anomalía detectada
  for (const d of detected) {
    const key = `${d.modulo}|${d.tipo}|${d.dimension}|${d.dimensionId ?? "null"}`;
    detectedKeys.add(key);
    const existing = activeMap.get(key);
    if (existing) {
      // Update: severidad / descripcion / metadata pueden haber cambiado
      await db
        .update(companyStatsAnomalies)
        .set({
          severidad:    d.severidad,
          descripcion:  d.descripcion,
          dimensionLabel: d.dimensionLabel,
          metadata:     { ...d.metadata, sweepId } as any,
          detectadoEn:  new Date(),
        })
        .where(eq(companyStatsAnomalies.id, existing.id));
      updated++;
    } else {
      // Insert
      await db.insert(companyStatsAnomalies).values({
        companyId,
        modulo:         d.modulo,
        tipo:           d.tipo,
        dimension:      d.dimension,
        dimensionId:    d.dimensionId,
        dimensionLabel: d.dimensionLabel,
        severidad:      d.severidad,
        descripcion:    d.descripcion,
        metadata:       { ...d.metadata, sweepId } as any,
      });
      inserted++;
    }
  }

  // 3) Marcar como resueltas las activas que NO aparecieron en este sweep
  // Solo lo hacemos si la anomalía es "resoluble" (es decir, se basa en
  // estado actual, no en histórico). Por ahora, todas son resolubles.
  const toResolve = active.filter((a) => !detectedKeys.has(activeKey(a)));
  if (toResolve.length > 0) {
    // En lugar de borrarlas (queremos histórico), las dejamos en la tabla
    // pero el endpoint /anomalias filtra por detectadoEn reciente.
    // Para resolverlas, actualizamos metadata.resolvedAt.
    for (const r of toResolve) {
      await db
        .update(companyStatsAnomalies)
        .set({
          metadata: { ...(r.metadata as any), resolvedAt: sweepId } as any,
        })
        .where(eq(companyStatsAnomalies.id, r.id));
      resolved++;
    }
  }

  return { inserted, updated, resolved };
}
