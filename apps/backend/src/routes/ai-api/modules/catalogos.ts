// routes/ai-api/modules/catalogos.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de catálogos (seguros, talleres, proveedores, sites)
// para /api/ai/*. 4 recursos, 8 endpoints.
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, eq, gte, ilike, isNotNull, lte, or, sql, desc } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyInsurancePolicies, companyWorkshops, companySuppliers, companySites, companyAssets,
} from '../../../db/schema/operational';
import { authAiApiKey, requireAiApiScope } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseBody, parseQuery,
  resolveAsset, todayYmdEc,
} from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';

const router = Router();

// ══════════════════════════════════════════════════════════════════════
//  SEGUROS
// ══════════════════════════════════════════════════════════════════════

const segurosListQuery = z.object({
  vehiculo: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// GET /seguros
router.get(
  '/seguros',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { vehiculo, limit } = parseQuery(segurosListQuery, req.query);

    const conds = [eq(companyInsurancePolicies.companyId, companyId)];
    if (vehiculo) {
      const a = await resolveAsset(companyId, vehiculo);
      conds.push(eq(companyInsurancePolicies.assetId, a.id));
    }

    const rows = await db
      .select({
        id: companyInsurancePolicies.id,
        assetId: companyInsurancePolicies.assetId,
        assetName: companyAssets.name,
        insurer: companyInsurancePolicies.insurer,
        policyNumber: companyInsurancePolicies.policyNumber,
        coverage: companyInsurancePolicies.coverage,
        startDate: companyInsurancePolicies.startDate,
        endDate: companyInsurancePolicies.endDate,
        status: companyInsurancePolicies.status,
      })
      .from(companyInsurancePolicies)
      .leftJoin(companyAssets, eq(companyAssets.id, companyInsurancePolicies.assetId))
      .where(and(...conds))
      .orderBy(desc(companyInsurancePolicies.endDate))
      .limit(limit);

    res.json({
      total: rows.length,
      polizas: rows.map((r) => ({
        id: `insurance-${r.id}`,
        vehiculo: r.assetName,
        aseguradora: r.insurer,
        numero: r.policyNumber,
        cobertura: r.coverage,
        fechaInicio: r.startDate,
        fechaVencimiento: r.endDate,
        estado: r.status,
      })),
    });
  }),
);

// GET /seguros/por-vencer — vigentes con vencimiento en los próximos 60 días
router.get(
  '/seguros/por-vencer',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();
    const [yStr, mStr] = today.split('-');
    const limit = new Date(Number(yStr), Number(mStr) + 2, 0); // ~60 días
    // jul 2026 v7 — endDate es `date` → string YYYY-MM-DD.
    const limitDate = limit.toISOString().slice(0, 10);

    const rows = await db
      .select({
        id: companyInsurancePolicies.id,
        assetId: companyInsurancePolicies.assetId,
        assetName: companyAssets.name,
        insurer: companyInsurancePolicies.insurer,
        policyNumber: companyInsurancePolicies.policyNumber,
        endDate: companyInsurancePolicies.endDate,
      })
      .from(companyInsurancePolicies)
      .leftJoin(companyAssets, eq(companyAssets.id, companyInsurancePolicies.assetId))
      .where(and(
        eq(companyInsurancePolicies.companyId, companyId),
        gte(companyInsurancePolicies.endDate, today),
        lte(companyInsurancePolicies.endDate, limitDate),
      ))
      .orderBy(companyInsurancePolicies.endDate)
      .limit(50);

    res.json({
      total: rows.length,
      polizas: rows.map((r) => {
        const daysToExpire = Math.floor(
          (new Date(String(r.endDate)).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24),
        );
        return {
          id: `insurance-${r.id}`,
          vehiculo: r.assetName,
          aseguradora: r.insurer,
          numero: r.policyNumber,
          fechaVencimiento: r.endDate,
          diasParaVencer: daysToExpire,
          alerta: daysToExpire <= 30 ? 'URGENTE' : daysToExpire <= 60 ? 'PROXIMO' : 'OK',
        };
      }),
      resumenTexto: rows.length === 0
        ? 'No hay pólizas por vencer en los próximos 60 días.'
        : `Hay ${rows.length} póliza(s) por vencer en los próximos 60 días. La más urgente vence en ${rows[0].endDate}.`,
    });
  }),
);

// POST /seguros/create
const seguroSchema = z.object({
  vehiculo: z.string().min(1),
  aseguradora: z.string().min(2).max(160),
  numero: z.string().min(1).max(120),
  cobertura: z.string().max(255).optional(),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post(
  '/seguros/create',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(seguroSchema, req.body);
    const asset = await resolveAsset(companyId, body.vehiculo);

    if (body.fechaVencimiento <= body.fechaInicio) {
      throw new AppError(400, 'La fecha de vencimiento debe ser posterior a la fecha de inicio');
    }

    const [created] = await db.insert(companyInsurancePolicies).values({
      companyId,
      assetId: asset.id,
      insurer: body.aseguradora,
      policyNumber: body.numero,
      coverage: body.cobertura ?? null,
      startDate: body.fechaInicio,
      endDate: body.fechaVencimiento,
      status: 'Vigente',
    }).returning();

    res.status(201).json({
      id: `insurance-${created.id}`,
      vehiculo: asset.name,
      aseguradora: created.insurer,
      numero: created.policyNumber,
      fechaVencimiento: created.endDate,
      estado: created.status,
      resumenTexto: `Póliza de seguro "${created.policyNumber}" creada para ${asset.name}, vigente hasta ${created.endDate}.`,
    });
  }),
);

// ══════════════════════════════════════════════════════════════════════
//  TALLERES
// ══════════════════════════════════════════════════════════════════════

// GET /talleres
router.get(
  '/talleres',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const rows = await db.select()
      .from(companyWorkshops)
      .where(eq(companyWorkshops.companyId, companyId))
      .orderBy(companyWorkshops.name)
      .limit(200);

    res.json({
      total: rows.length,
      talleres: rows.map((r) => ({
        id: `workshop-${r.id}`,
        nombre: r.name,
        nit: r.nit,
        contacto: r.contactName,
        telefono: r.phone,
        direccion: r.address,
        notas: r.notes,
      })),
    });
  }),
);

// POST /talleres/create
const tallerSchema = z.object({
  nombre: z.string().min(2).max(120),
  nit: z.string().max(40).optional(),
  contacto: z.string().max(120).optional(),
  telefono: z.string().max(40).optional(),
  direccion: z.string().max(500).optional(),
  notas: z.string().max(2000).optional(),
});

router.post(
  '/talleres/create',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(tallerSchema, req.body);

    const [created] = await db.insert(companyWorkshops).values({
      companyId,
      name: body.nombre,
      nit: body.nit ?? null,
      contactName: body.contacto ?? null,
      phone: body.telefono ?? null,
      address: body.direccion ?? null,
      notes: body.notas ?? null,
    }).returning();

    res.status(201).json({
      id: `workshop-${created.id}`,
      nombre: created.name,
      resumenTexto: `Taller "${created.name}" creado.`,
    });
  }),
);

// ══════════════════════════════════════════════════════════════════════
//  PROVEEDORES
// ══════════════════════════════════════════════════════════════════════

const proveedoresQuery = z.object({
  busqueda: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

// GET /proveedores
router.get(
  '/proveedores',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { busqueda, limit } = parseQuery(proveedoresQuery, req.query);

    const conds = [eq(companySuppliers.companyId, companyId)];
    if (busqueda) {
      const q = `%${busqueda}%`;
      conds.push(
        or(
          ilike(companySuppliers.name, q),
          ilike(companySuppliers.nit, q),
          ilike(companySuppliers.contactName, q),
        )!,
      );
    }

    const rows = await db.select()
      .from(companySuppliers)
      .where(and(...conds))
      .orderBy(companySuppliers.name)
      .limit(limit);

    res.json({
      total: rows.length,
      proveedores: rows.map((r) => ({
        id: `supplier-${r.id}`,
        nombre: r.name,
        nit: r.nit,
        contacto: r.contactName,
        telefono: r.phone,
        email: r.email,
        direccion: r.address,
        notas: r.notes,
      })),
    });
  }),
);

// POST /proveedores/create
const proveedorSchema = z.object({
  nombre: z.string().min(2).max(120),
  nit: z.string().max(40).optional(),
  contacto: z.string().max(120).optional(),
  telefono: z.string().max(40).optional(),
  email: z.string().email().optional(),
  direccion: z.string().max(500).optional(),
  notas: z.string().max(2000).optional(),
});

router.post(
  '/proveedores/create',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(proveedorSchema, req.body);

    const [created] = await db.insert(companySuppliers).values({
      companyId,
      name: body.nombre,
      nit: body.nit ?? null,
      contactName: body.contacto ?? null,
      phone: body.telefono ?? null,
      email: body.email ?? null,
      address: body.direccion ?? null,
      notes: body.notas ?? null,
    }).returning();

    res.status(201).json({
      id: `supplier-${created.id}`,
      nombre: created.name,
      nit: created.nit,
      resumenTexto: `Proveedor "${created.name}" creado.`,
    });
  }),
);

// ══════════════════════════════════════════════════════════════════════
//  SITES / SEDES
// ══════════════════════════════════════════════════════════════════════

// GET /sedes
router.get(
  '/sedes',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const rows = await db.select()
      .from(companySites)
      .where(eq(companySites.companyId, companyId))
      .orderBy(companySites.name)
      .limit(200);

    res.json({
      total: rows.length,
      sedes: rows.map((r) => ({
        id: `site-${r.id}`,
        nombre: r.name,
        codigo: r.code,
        ciudad: r.city,
        direccion: r.address,
        contacto: r.contact,
        estado: r.status,
        notas: r.notes,
      })),
    });
  }),
);

// POST /sedes/create
const sedeSchema = z.object({
  nombre: z.string().min(2).max(160),
  codigo: z.string().min(1).max(40),
  ciudad: z.string().max(120).optional(),
  direccion: z.string().max(500).optional(),
  contacto: z.string().max(160).optional(),
  notas: z.string().max(2000).optional(),
});

router.post(
  '/sedes/create',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(sedeSchema, req.body);

    const [created] = await db.insert(companySites).values({
      companyId,
      name: body.nombre,
      code: body.codigo,
      city: body.ciudad ?? null,
      address: body.direccion ?? null,
      contact: body.contacto ?? null,
      notes: body.notas ?? null,
    }).returning();

    res.status(201).json({
      id: `site-${created.id}`,
      nombre: created.name,
      codigo: created.code,
      resumenTexto: `Sede "${created.name}" creada.`,
    });
  }),
);

export default router;
