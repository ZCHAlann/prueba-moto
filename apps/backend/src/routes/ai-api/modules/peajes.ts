// routes/ai-api/modules/peajes.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de peajes para /api/ai/*.
// 3 endpoints: lista, resumen, registrar.
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, lte, sql, count } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyTollEntries, companyAssets,
} from '../../../db/schema/operational';
import { authAiApiKey, requireAiApiScope } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseBody, parseQuery,
  resolveAsset, todayYmdEc,
} from '../shared';
import { NotFoundError } from '../../../lib/errors';

const router = Router();

// ── 1. GET /peajes (lista) ───────────────────────────────────────────
const listQuery = z.object({
  vehiculo: z.string().max(120).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  '/peajes',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { vehiculo, desde, hasta, limit } = parseQuery(listQuery, req.query);

    const conds = [eq(companyTollEntries.companyId, companyId)];
    if (vehiculo) {
      const a = await resolveAsset(companyId, vehiculo);
      conds.push(eq(companyTollEntries.assetId, a.id));
    }
    if (desde) conds.push(gte(companyTollEntries.date, desde));
    if (hasta) conds.push(lte(companyTollEntries.date, hasta));

    const rows = await db
      .select({
        id: companyTollEntries.id,
        date: companyTollEntries.date,
        assetId: companyTollEntries.assetId,
        assetName: companyAssets.name,
        assetPlate: companyAssets.plate,
        tollName: companyTollEntries.tollName,
        amount: companyTollEntries.amount,
        category: companyTollEntries.category,
        route: companyTollEntries.route,
      })
      .from(companyTollEntries)
      .leftJoin(companyAssets, eq(companyAssets.id, companyTollEntries.assetId))
      .where(and(...conds))
      .orderBy(desc(companyTollEntries.date))
      .limit(limit);

    res.json({
      total: rows.length,
      peajes: rows.map((r) => ({
        id: `toll-${r.id}`,
        fecha: r.date,
        vehiculo: r.assetName,
        vehiculoPlaca: r.assetPlate,
        nombre: r.tollName,
        categoria: r.category,
        ruta: r.route,
        monto: Number(r.amount),
      })),
    });
  }),
);

// ── 2. GET /peajes/resumen ───────────────────────────────────────────
router.get(
  '/peajes/resumen',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();
    const monthStart = today.slice(0, 8) + '01';

    const [mes, top] = await Promise.all([
      db.select({
        totalAmount: sql<string>`COALESCE(SUM(${companyTollEntries.amount}), 0)::text`,
        count: count(),
      })
        .from(companyTollEntries)
        .where(and(
          eq(companyTollEntries.companyId, companyId),
          gte(companyTollEntries.date, monthStart),
          lte(companyTollEntries.date, today),
        )),
      db.select({
        assetId: companyTollEntries.assetId,
        assetName: companyAssets.name,
        totalAmount: sql<string>`SUM(${companyTollEntries.amount})::text`,
        count: count(),
      })
        .from(companyTollEntries)
        .leftJoin(companyAssets, eq(companyAssets.id, companyTollEntries.assetId))
        .where(and(
          eq(companyTollEntries.companyId, companyId),
          gte(companyTollEntries.date, monthStart),
          lte(companyTollEntries.date, today),
        ))
        .groupBy(companyTollEntries.assetId, companyAssets.name)
        .orderBy(sql`SUM(${companyTollEntries.amount}) DESC`)
        .limit(5),
    ]);

    const m = mes[0] ?? { totalAmount: '0', count: 0 };
    const total = Number(m.totalAmount);

    res.json({
      periodo: { desde: monthStart, hasta: today },
      totalMonto: total,
      totalCruzamientos: m.count,
      topVehiculos: top.map((v) => ({
        id: `vehicle-${v.assetId}`,
        nombre: v.assetName,
        montoTotal: Number(v.totalAmount),
        cruzamientos: v.count,
      })),
      resumenTexto: `Peajes del mes: $${total.toFixed(2)} en ${m.count} cruce(s).`,
    });
  }),
);

// ── 3. POST /peajes/registrar ────────────────────────────────────────
const registrarSchema = z.object({
  vehiculo: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nombre: z.string().min(2).max(200),
  monto: z.coerce.number().min(0),
  categoria: z.string().max(40).optional(),
  ruta: z.string().max(200).optional(),
  ejes: z.coerce.number().int().min(0).optional(),
  numeroFactura: z.string().max(60).optional(),
});

router.post(
  '/peajes/registrar',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(registrarSchema, req.body);
    const asset = await resolveAsset(companyId, body.vehiculo);

    const [created] = await db.insert(companyTollEntries).values({
      companyId,
      assetId: asset.id,
      date: body.fecha ?? todayYmdEc(),
      tollName: body.nombre,
      amount: String(body.monto),
      category: body.categoria ?? null,
      route: body.ruta ?? null,
      axes: body.ejes ?? null,
      invoiceNumber: body.numeroFactura ?? null,
    }).returning();

    res.status(201).json({
      id: `toll-${created.id}`,
      vehiculo: asset.name,
      fecha: created.date,
      nombre: created.tollName,
      monto: Number(created.amount),
      resumenTexto: `Peaje "${created.tollName}" registrado para ${asset.name}: $${Number(created.amount).toFixed(2)}.`,
    });
  }),
);

export default router;
