// routes/ai-api/modules/checklists.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de checklists para /api/ai/*.
// 4 endpoints: lista general, pendientes, vencidos, anomalías.
// (Read-only — los checklists se crean desde la app móvil.)
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, lte, or, sql, count } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyChecklists, companyAssets, companyDrivers,
  companyStatsAnomalies,
} from '../../../db/schema/operational';
import { authAiApiKey } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseQuery, todayYmdEc,
} from '../shared';

const router = Router();

// ── 1. GET /checklists (lista general, últimos 30 días) ──────────────
const listQuery = z.object({
  vehiculo: z.string().max(120).optional(),
  estado: z.enum(['Pendiente', 'En curso', 'Completado', 'Vencido']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  '/checklists',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { vehiculo, estado, limit } = parseQuery(listQuery, req.query);

    const conds = [eq(companyChecklists.companyId, companyId)];
    if (estado) conds.push(eq(companyChecklists.status, estado));

    const rows = await db
      .select({
        id: companyChecklists.id,
        date: companyChecklists.date,
        assetId: companyChecklists.assetId,
        assetName: companyAssets.name,
        driverId: companyChecklists.driverId,
        driverFirstName: companyDrivers.firstName,
        driverLastName: companyDrivers.lastName,
        targetLabel: companyChecklists.targetLabel,
        status: companyChecklists.status,
        summary: companyChecklists.summary,
        findings: companyChecklists.findings,
        isLate: companyChecklists.isLate,
      })
      .from(companyChecklists)
      .leftJoin(companyAssets, eq(companyAssets.id, companyChecklists.assetId))
      .leftJoin(companyDrivers, eq(companyDrivers.id, companyChecklists.driverId))
      .where(and(...conds))
      .orderBy(desc(companyChecklists.date))
      .limit(limit);

    res.json({
      total: rows.length,
      checklists: rows.map((r) => ({
        id: `checklist-${r.id}`,
        fecha: r.date,
        vehiculo: r.assetName,
        conductor: r.driverFirstName ? `${r.driverFirstName} ${r.driverLastName}`.trim() : null,
        target: r.targetLabel,
        estado: r.status,
        resumen: r.summary,
        hallazgos: r.findings,
        tardio: r.isLate,
      })),
    });
  }),
);

// ── 2. GET /checklists/pendientes ────────────────────────────────────
router.get(
  '/checklists/pendientes',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const rows = await db
      .select({
        id: companyChecklists.id,
        date: companyChecklists.date,
        assetId: companyChecklists.assetId,
        assetName: companyAssets.name,
        targetLabel: companyChecklists.targetLabel,
        windowEnd: companyChecklists.windowEnd,
        cycleEnd: companyChecklists.cycleEnd,
      })
      .from(companyChecklists)
      .leftJoin(companyAssets, eq(companyAssets.id, companyChecklists.assetId))
      .where(and(
        eq(companyChecklists.companyId, companyId),
        or(
          eq(companyChecklists.status, 'Pendiente'),
          eq(companyChecklists.status, 'En curso'),
        )!,
      ))
      .orderBy(companyChecklists.date)
      .limit(100);

    res.json({
      total: rows.length,
      checklists: rows.map((r) => ({
        id: `checklist-${r.id}`,
        fecha: r.date,
        vehiculo: r.assetName,
        target: r.targetLabel,
        ventanaHasta: r.windowEnd,
        cicloHasta: r.cycleEnd,
      })),
      resumenTexto: rows.length === 0
        ? 'No hay checklists pendientes.'
        : `Hay ${rows.length} checklist(s) pendiente(s) de completar.`,
    });
  }),
);

// ── 3. GET /checklists/vencidos ──────────────────────────────────────
router.get(
  '/checklists/vencidos',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();

    const rows = await db
      .select({
        id: companyChecklists.id,
        date: companyChecklists.date,
        assetId: companyChecklists.assetId,
        assetName: companyAssets.name,
        targetLabel: companyChecklists.targetLabel,
        windowEnd: companyChecklists.windowEnd,
        cycleEnd: companyChecklists.cycleEnd,
      })
      .from(companyChecklists)
      .leftJoin(companyAssets, eq(companyAssets.id, companyChecklists.assetId))
      .where(and(
        eq(companyChecklists.companyId, companyId),
        eq(companyChecklists.status, 'Vencido'),
      ))
      .orderBy(companyChecklists.date)
      .limit(100);

    res.json({
      total: rows.length,
      checklists: rows.map((r) => ({
        id: `checklist-${r.id}`,
        fecha: r.date,
        vehiculo: r.assetName,
        target: r.targetLabel,
        ventanaHasta: r.windowEnd,
      })),
      resumenTexto: rows.length === 0
        ? 'No hay checklists vencidos.'
        : `Hay ${rows.length} checklist(s) vencido(s) que requieren reautorización.`,
    });
  }),
);

// ── 4. GET /checklists/anomalias ──────────────────────────────────────
router.get(
  '/checklists/anomalias',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const rows = await db.select()
      .from(companyStatsAnomalies)
      .where(and(
        eq(companyStatsAnomalies.companyId, companyId),
        eq(companyStatsAnomalies.modulo, 'checklist'),
      ))
      .orderBy(desc(companyStatsAnomalies.detectadoEn))
      .limit(50);

    res.json({
      total: rows.length,
      anomalias: rows.map((r) => ({
        id: `anom-${r.id}`,
        tipo: r.tipo,
        dimension: r.dimension,
        dimensionLabel: r.dimensionLabel,
        severidad: r.severidad,
        descripcion: r.descripcion,
        fecha: r.detectadoEn,
      })),
      resumenTexto: rows.length === 0
        ? 'No hay anomalías de checklists detectadas.'
        : `Hay ${rows.length} anomalía(s) de checklists.`,
    });
  }),
);

export default router;
