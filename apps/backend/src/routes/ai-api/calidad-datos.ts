// routes/ai-api/calidad-datos.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v2.2 — Calidad de datos
//
// Calcula un score 0-100 y lista de advertencias sobre los datos que
// está viendo el LLM. Se incluye en `meta.calidad` de las operaciones
// de detalle/lista para que el LLM pueda avisar al usuario cuando
// los datos son incompletos o sospechosos.
//
// Ejemplo:
//   data = { id: 14, plate: 'ABM-4662', odometerKm: 0, ... }
//   calidad = {
//     score: 65,
//     advertencias: 2,
//     resumen: 'Odómetro nunca registrado. Datos con confianza media.'
//   }
//
// Heurísticas (jul 2026 v2.2 — primera versión):
//   - Sin odómetro registrado → -20
//   - Sin asignaciones de conductor → -15
//   - Sin mantenimiento en últimos 180 días → -10 (puede ser flota chica)
//   - Sin cargas de combustible en últimos 30 días → -10
//   - Sin checklists en últimos 30 días → -10
//   - Placa o código faltante → -5
// ─────────────────────────────────────────────────────────────────────

import { and, eq, gte, sql, count } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyAssets,
  companyMaintenanceRecords,
  companyFuelEntries,
  companyChecklists,
  companyAssignments,
} from '../../db/schema/operational';

export type Advertencia = {
  codigo: string;
  campo: string;
  mensaje: string;
  severidad: 'info' | 'warning' | 'error';
};

export type CalidadDatos = {
  score: number;            // 0-100
  advertencias: number;     // count
  resumen: string;          // frase en español
  detalle?: Advertencia[];  // solo si score<90, sino resumido
};

const D180 = 180 * 24 * 60 * 60 * 1000;
const D30  = 30  * 24 * 60 * 60 * 1000;

/** Calcula calidad de los datos de UN vehículo. */
export async function calidadVehiculo(companyId: number, assetId: number): Promise<CalidadDatos> {
  const advertencias: Advertencia[] = [];
  let score = 100;

  // 1) Datos básicos del vehículo
  const [asset] = await db
    .select({ plate: companyAssets.plate, code: companyAssets.code, odometerKm: companyAssets.odometerKm })
    .from(companyAssets)
    .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
    .limit(1);

  if (!asset) {
    return { score: 0, advertencias: 1, resumen: 'Vehículo no encontrado.' };
  }

  if (!asset.plate) {
    advertencias.push({ codigo: 'PLACA_FALTANTE', campo: 'plate', mensaje: 'El vehículo no tiene placa registrada.', severidad: 'warning' });
    score -= 5;
  }
  if (!asset.code) {
    advertencias.push({ codigo: 'CODIGO_FALTANTE', campo: 'code', mensaje: 'El vehículo no tiene código interno.', severidad: 'warning' });
    score -= 5;
  }
  if (!asset.odometerKm || Number(asset.odometerKm) === 0) {
    advertencias.push({ codigo: 'ODOMETRO_NO_REGISTRADO', campo: 'odometerKm', mensaje: 'El odómetro del vehículo nunca fue registrado.', severidad: 'warning' });
    score -= 20;
  }

  // 2) Mantenimiento en últimos 180 días
  const cutoff180 = new Date(Date.now() - D180);
  const [mnt] = await db
    .select({ n: count() })
    .from(companyMaintenanceRecords)
    .where(and(
      eq(companyMaintenanceRecords.companyId, companyId),
      eq(companyMaintenanceRecords.assetId, assetId),
      gte(companyMaintenanceRecords.createdAt, cutoff180),
    ));
  if ((mnt?.n ?? 0) === 0) {
    advertencias.push({ codigo: 'SIN_MANTENIMIENTO_180D', campo: 'mantenimiento', mensaje: 'Sin mantenimientos registrados en los últimos 180 días.', severidad: 'info' });
    score -= 10;
  }

  // 3) Combustible en últimos 30 días
  const cutoff30 = new Date(Date.now() - D30);
  const [fuel] = await db
    .select({ n: count() })
    .from(companyFuelEntries)
    .where(and(
      eq(companyFuelEntries.companyId, companyId),
      eq(companyFuelEntries.assetId, assetId),
      gte(companyFuelEntries.date, cutoff30),
    ));
  if ((fuel?.n ?? 0) === 0) {
    advertencias.push({ codigo: 'SIN_COMBUSTIBLE_30D', campo: 'combustible', mensaje: 'Sin cargas de combustible en los últimos 30 días.', severidad: 'info' });
    score -= 10;
  }

  // 4) Asignación activa
  const [asg] = await db
    .select({ n: count() })
    .from(companyAssignments)
    .where(and(
      eq(companyAssignments.companyId, companyId),
      eq(companyAssignments.assetId, assetId),
      eq(companyAssignments.status, 'Activa'),
    ));
  if ((asg?.n ?? 0) === 0) {
    advertencias.push({ codigo: 'SIN_ASIGNACION_ACTIVA', campo: 'asignacion', mensaje: 'El vehículo no tiene un conductor asignado actualmente.', severidad: 'info' });
    score -= 15;
  }

  // 5) Checklists en últimos 30 días
  const [chk] = await db
    .select({ n: count() })
    .from(companyChecklists)
    .where(and(
      eq(companyChecklists.companyId, companyId),
      eq(companyChecklists.assetId, assetId),
      gte(companyChecklists.createdAt, cutoff30),
    ));
  if ((chk?.n ?? 0) === 0) {
    advertencias.push({ codigo: 'SIN_CHECKLIST_30D', campo: 'checklist', mensaje: 'Sin checklists completados en los últimos 30 días.', severidad: 'info' });
    score -= 10;
  }

  score = Math.max(0, score);

  return {
    score,
    advertencias: advertencias.length,
    resumen: resumenCalidad(score, advertencias.length),
    detalle: advertencias,
  };
}

function resumenCalidad(score: number, count: number): string {
  if (score >= 90) {
    return count === 0
      ? 'Datos completos. Información confiable para análisis.'
      : `Datos completos con ${count} advertencia(s) menor(es).`;
  }
  if (score >= 70) return 'Datos con confianza media. Algunas métricas pueden estar incompletas.';
  if (score >= 50) return 'Datos con confianza baja. Múltiples métricas faltantes. Interpretar con cautela.';
  return 'Datos insuficientes. No se recomienda usar este registro para análisis.';
}
