// routes/company/exit-authorizations.ts
//
// Autorizaciones de salida de vehículos.
//
// Roles:
//  - Conductor:        can(ver), can(crear). Solo ve sus propias solicitudes.
//                      Solo crea nuevas.
//  - Operador:         can(ver) sobre todas, can(editar) sobre pendientes.
//  - Supervisor:       can(ver) sobre todas, can(editar/eliminar) sobre
//                      pendientes + historial.
//  - admin/owner:      can(ver/crear/editar/eliminar) total.
//
// Las evidencias son URLs en /uploads/exit-auth/{companyId}/. El cliente
// sube cada archivo (foto o video) al endpoint genérico de upload con
// `category=exit-auth` y luego crea la autorización con todas las URLs.

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, sql, desc, or, ilike } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyExitAuthorizations,
  companyAssets,
  companyDrivers,
  companyUsers,
} from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError, ForbiddenError, AppError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';
import { wsBroadcast } from '../../services/websocket';

const router = Router({ mergeParams: true });

// ─── Schemas ────────────────────────────────────────────────────────────────

const EXIT_AUTH_STATUSES = ['Pendiente', 'Autorizada', 'Rechazada'] as const;

const urlField = z.string().min(1).max(2_000_000).nullable().optional();

const createAuthorizationSchema = z.object({
  assetId:    z.coerce.number().int().positive(),
  driverId:   z.coerce.number().int().positive(),
  oilBayonetaVideoUrl:       urlField,
  oilBayonetaVideoThumbUrl:  urlField,
  coolantPhotoUrl:           urlField,
  brakeFluidPhotoUrl:        urlField,
  tirePhotosUrl:             z.array(z.string().min(1).max(2_000_000)).max(4).default([]),
  windshieldWasherPhotoUrl:  urlField,
  lightsPhotoUrl:            urlField,
  batteryPhotoUrl:           urlField,
  jackPhotoUrl:              urlField,
  notes:                     safeString({ max: 500, fieldLabel: 'Notas', allowEmpty: true }).nullable().optional(),
});

const decisionSchema = z.object({
  notes: safeString({ max: 500, fieldLabel: 'Notas', allowEmpty: true }).nullable().optional(),
});

const listQuerySchema = z.object({
  status:       z.enum(EXIT_AUTH_STATUSES).optional(),
  driverId:     z.coerce.number().int().positive().optional(),
  assetId:      z.coerce.number().int().positive().optional(),
  decidedBy:    z.coerce.number().int().positive().optional(),
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  from:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function serializeAuthorization(
  a: typeof companyExitAuthorizations.$inferSelect | Record<string, any>,
  info: {
    assetLabel: string | null;
    assetName:  string | null;
    assetPlate: string | null;
    driverName: string | null;
    decidedByName: string | null;
  } = {
    assetLabel: null, assetName: null, assetPlate: null,
    driverName: null, decidedByName: null,
  },
) {
  const r = a as Record<string, any>;
  return {
    id:        toId('exit-auth', r.id),
    companyId: toId('company',   r.companyId  ?? r.company_id),
    assetId:   toId('asset',     r.assetId    ?? r.asset_id),
    driverId:  toId('driver',    r.driverId   ?? r.driver_id),
    status:    r.status,
    oilBayonetaVideoUrl:      r.oilBayonetaVideoUrl      ?? r.oil_bayoneta_video_url      ?? null,
    oilBayonetaVideoThumbUrl: r.oilBayonetaVideoThumbUrl ?? r.oil_bayoneta_video_thumb_url ?? null,
    coolantPhotoUrl:          r.coolantPhotoUrl          ?? r.coolant_photo_url            ?? null,
    brakeFluidPhotoUrl:       r.brakeFluidPhotoUrl       ?? r.brake_fluid_photo_url        ?? null,
    tirePhotosUrl:            r.tirePhotosUrl            ?? r.tire_photos_url              ?? [],
    windshieldWasherPhotoUrl: r.windshieldWasherPhotoUrl ?? r.windshield_washer_photo_url  ?? null,
    lightsPhotoUrl:           r.lightsPhotoUrl           ?? r.lights_photo_url             ?? null,
    batteryPhotoUrl:          r.batteryPhotoUrl          ?? r.battery_photo_url            ?? null,
    jackPhotoUrl:             r.jackPhotoUrl             ?? r.jack_photo_url               ?? null,
    notes:         r.notes         ?? null,
    decisionNotes: r.decisionNotes ?? r.decision_notes   ?? null,
    decisionByUserId: (r.decisionByUserId ?? r.decision_by_user_id)
      ? toId('company-user', r.decisionByUserId ?? r.decision_by_user_id)
      : null,
    decidedAt:   r.decidedAt   ?? r.decided_at   ?? null,
    requestedAt: r.requestedAt ?? r.requested_at,
    createdAt:   r.createdAt   ?? r.created_at,
    updatedAt:   r.updatedAt   ?? r.updated_at,
    // Enrichment
    assetLabel:    info.assetLabel,
    assetName:     info.assetName,
    assetPlate:    info.assetPlate,
    driverName:    info.driverName,
    decidedByName: info.decidedByName,
  };
}

/** Helper: resuelve assetPlate, assetName, assetLabel y driverName en una sola query. */
async function fetchEnrichInfo(assetId: number, driverId: number, companyId: number): Promise<{
  assetLabel: string | null;
  assetName:  string | null;
  assetPlate: string | null;
  driverName: string | null;
}> {
  const [row] = await db.execute<{
    asset_name:  string | null;
    asset_plate: string | null;
    asset_label: string | null;
    driver_name: string | null;
  }>(sql`
    SELECT
      ast.name  AS asset_name,
      ast.plate AS asset_plate,
      ast.code  AS asset_label,
      TRIM(COALESCE(d.first_name,'') || ' ' || COALESCE(d.last_name,'')) AS driver_name
    FROM company_assets ast
    LEFT JOIN company_drivers d
      ON d.id = ${driverId}
     AND d.company_id = ${companyId}
    WHERE ast.id = ${assetId}
      AND ast.company_id = ${companyId}
    LIMIT 1
  `);
  return {
    assetLabel: row?.asset_label ?? null,
    assetName:  row?.asset_name  ?? null,
    assetPlate: row?.asset_plate ?? null,
    driverName: row?.driver_name ?? null,
  };
}

/** Determina si un user puede ver/editar/eliminar una autorización. */
function canDecide(role: string): boolean {
  return ['supervisor', 'admin_empresa', 'owner_empresa'].includes(role);
}
function canDelete(role: string): boolean {
  return ['supervisor', 'admin_empresa', 'owner_empresa'].includes(role);
}

// ─── GET /company/:id/exit-authorizations/conductor-context ─────────────────

router.get('/conductor-context', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const role = req.user!.role;
    const userId = Number(String(req.user!.sub).replace(/\D/g, '')) || null;

    if (role !== 'conductor') {
      throw new ForbiddenError('Este endpoint es exclusivo para conductores.');
    }
    if (!userId) {
      throw new ForbiddenError('Sesión sin company-user id.');
    }

    const [driverRow] = await db
      .select({ id: companyDrivers.id })
      .from(companyDrivers)
      .where(and(eq(companyDrivers.companyId, companyId), eq(companyDrivers.userId, userId)))
      .limit(1);
    if (!driverRow) {
      return res.json({ driverId: null, asset: null, authorizations: [] });
    }

    const today = new Date().toISOString().slice(0, 10);
    const [ctxRow] = await db.execute<{
      asset_id: number | null;
      plate: string | null;
      brand: string | null;
      model: string | null;
    }>(sql`
      SELECT
        ast.id    AS asset_id,
        ast.plate,
        ast.brand,
        ast.model
      FROM company_assignments a
      JOIN company_assets ast
        ON ast.id = a.asset_id
       AND ast.company_id = a.company_id
      WHERE a.company_id = ${companyId}
        AND a.driver_id  = ${driverRow.id}
        AND a.start_date <= ${today}
        AND (a.end_date IS NULL OR a.end_date >= ${today})
        AND a.status = 'Activa'
      ORDER BY a.start_date DESC
      LIMIT 1
    `);
    const asset = ctxRow && ctxRow.asset_id != null
      ? { id: String(ctxRow.asset_id), plate: ctxRow.plate ?? '', brand: ctxRow.brand ?? '', model: ctxRow.model ?? '' }
      : null;

    const auths = await db
      .select()
      .from(companyExitAuthorizations)
      .where(and(
        eq(companyExitAuthorizations.companyId, companyId),
        eq(companyExitAuthorizations.driverId, driverRow.id),
      ))
      .orderBy(desc(companyExitAuthorizations.requestedAt));

    return res.json({
      driverId: driverRow.id,
      asset,
      authorizations: auths.map((a) => serializeAuthorization(a, {
        assetLabel: asset?.plate ?? null,
        assetName:  asset ? `${asset.brand} ${asset.model}`.trim() : null,
        assetPlate: asset?.plate ?? null,
        driverName: null,
        decidedByName: null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/exit-authorizations ──────────────────────────────────

router.get('/', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const role = req.user!.role;
    const userId = Number(String(req.user!.sub).replace(/\D/g, '')) || null;

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'Parámetros de filtro inválidos.');
    }
    const { status, driverId, assetId, decidedBy, date, from, to } = parsed.data;

    let effectiveDriverId: number | undefined = driverId;
    if (role === 'conductor') {
      if (!userId) throw new ForbiddenError('Sesión sin company-user id.');
      const [driverRow] = await db
        .select({ id: companyDrivers.id })
        .from(companyDrivers)
        .where(and(eq(companyDrivers.companyId, companyId), eq(companyDrivers.userId, userId)))
        .limit(1);
      if (!driverRow) {
        return res.json({ data: [], total: 0 });
      }
      effectiveDriverId = driverRow.id;
    }

    const whereParts: ReturnType<typeof sql>[] = [
      sql`a.company_id = ${companyId}`,
    ];
    if (effectiveDriverId !== undefined) whereParts.push(sql`a.driver_id = ${effectiveDriverId}`);
    if (assetId !== undefined)             whereParts.push(sql`a.asset_id  = ${assetId}`);
    if (status)                            whereParts.push(sql`a.status    = ${status}`);
    if (decidedBy !== undefined)           whereParts.push(sql`a.decision_by_user_id = ${decidedBy}`);
    if (date)                              whereParts.push(sql`a.requested_at::date = ${date}`);
    if (from)                              whereParts.push(sql`a.requested_at >= ${from}`);
    if (to)                                whereParts.push(sql`a.requested_at <= ${to}::date + interval '1 day' - interval '1 millisecond'`);

    const rawRows = await db.execute<{
      id: number; company_id: number; asset_id: number; driver_id: number;
      status: 'Pendiente' | 'Autorizada' | 'Rechazada';
      oil_bayoneta_video_url: string | null; oil_bayoneta_video_thumb_url: string | null;
      coolant_photo_url: string | null; brake_fluid_photo_url: string | null;
      tire_photos_url: string[] | null;
      windshield_washer_photo_url: string | null;
      lights_photo_url: string | null; battery_photo_url: string | null; jack_photo_url: string | null;
      notes: string | null; decision_notes: string | null;
      decision_by_user_id: number | null; decided_at: string | null;
      requested_at: string; created_at: string; updated_at: string;
      asset_name: string | null; asset_plate: string | null; asset_label: string | null;
      driver_name: string | null; decided_by_name: string | null;
    }>(sql`
      SELECT
        a.id, a.company_id, a.asset_id, a.driver_id, a.status,
        a.oil_bayoneta_video_url, a.oil_bayoneta_video_thumb_url,
        a.coolant_photo_url, a.brake_fluid_photo_url, a.tire_photos_url,
        a.windshield_washer_photo_url, a.lights_photo_url, a.battery_photo_url, a.jack_photo_url,
        a.notes, a.decision_notes, a.decision_by_user_id, a.decided_at,
        a.requested_at, a.created_at, a.updated_at,
        ast.name  AS asset_name,
        ast.plate AS asset_plate,
        ast.code  AS asset_label,
        TRIM(COALESCE(d.first_name,'') || ' ' || COALESCE(d.last_name,'')) AS driver_name,
        cu.username AS decided_by_name
      FROM company_exit_authorizations a
      LEFT JOIN company_assets   ast ON ast.id = a.asset_id
      LEFT JOIN company_drivers  d   ON d.id   = a.driver_id
      LEFT JOIN company_users    cu  ON cu.id  = a.decision_by_user_id
      WHERE ${sql.join(whereParts, sql` AND `)}
      ORDER BY a.requested_at DESC
    `);

    const rows = (Array.isArray(rawRows) ? rawRows : (rawRows as any).rows ?? []) as any[];

    res.json({
      data: rows.map((r) => serializeAuthorization(r as any, {
        assetLabel:  r.asset_label,
        assetName:   r.asset_name,
        assetPlate:  r.asset_plate,
        driverName:  r.driver_name,
        decidedByName: r.decided_by_name,
      })),
      total: rows.length,
      assets: (await db
        .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate, code: companyAssets.code, brand: companyAssets.brand, model: companyAssets.model })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId))
      ).map((a) => ({
        id: toId('asset', a.id),
        name: a.name,
        plate: a.plate,
        code: a.code,
        brand: a.brand,
        model: a.model,
      })),
      drivers: (await db
        .select({ id: companyDrivers.id, firstName: companyDrivers.firstName, lastName: companyDrivers.lastName, code: companyDrivers.code })
        .from(companyDrivers)
        .where(eq(companyDrivers.companyId, companyId))
      ).map((d) => ({
        id: toId('driver', d.id),
        firstName: d.firstName,
        lastName: d.lastName,
        code: d.code,
        name: `${d.firstName} ${d.lastName}`.trim(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/exit-authorizations/:authId ─────────────────────────

router.get('/:authId', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const authId = parseId('exit-auth', req.params.authId);
    const role = req.user!.role;
    const userId = Number(String(req.user!.sub).replace(/\D/g, '')) || null;

    const raw = await db.execute<{
      id: number; company_id: number; asset_id: number; driver_id: number;
      status: 'Pendiente' | 'Autorizada' | 'Rechazada';
      oil_bayoneta_video_url: string | null; oil_bayoneta_video_thumb_url: string | null;
      coolant_photo_url: string | null; brake_fluid_photo_url: string | null;
      tire_photos_url: string[] | null;
      windshield_washer_photo_url: string | null;
      lights_photo_url: string | null; battery_photo_url: string | null; jack_photo_url: string | null;
      notes: string | null; decision_notes: string | null;
      decision_by_user_id: number | null; decided_at: string | null;
      requested_at: string; created_at: string; updated_at: string;
      asset_name: string | null; asset_plate: string | null; asset_label: string | null;
      driver_name: string | null; driver_user_id: number | null;
      decided_by_name: string | null;
    }>(sql`
      SELECT
        a.*,
        ast.name  AS asset_name,
        ast.plate AS asset_plate,
        ast.code  AS asset_label,
        TRIM(COALESCE(d.first_name,'') || ' ' || COALESCE(d.last_name,'')) AS driver_name,
        d.user_id AS driver_user_id,
        cu.username AS decided_by_name
      FROM company_exit_authorizations a
      LEFT JOIN company_assets   ast ON ast.id = a.asset_id
      LEFT JOIN company_drivers  d   ON d.id   = a.driver_id
      LEFT JOIN company_users    cu  ON cu.id  = a.decision_by_user_id
      WHERE a.id = ${authId} AND a.company_id = ${companyId}
      LIMIT 1
    `);
    const rows = (Array.isArray(raw) ? raw : (raw as any).rows ?? []) as any[];
    const row = rows[0];
    if (!row) throw new NotFoundError('Autorización', req.params.authId);

    if (role === 'conductor') {
      if (!userId || row.driver_user_id !== userId) {
        throw new ForbiddenError('No tenés permiso para ver esta autorización.');
      }
    }

    res.json(serializeAuthorization(row as any, {
      assetLabel:  row.asset_label,
      assetName:   row.asset_name,
      assetPlate:  row.asset_plate,
      driverName:  row.driver_name,
      decidedByName: row.decided_by_name,
    }));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/exit-authorizations ────────────────────────────────

router.post('/', requireModule('autorizaciones'), validate(createAuthorizationSchema), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const role = req.user!.role;
    const userId = Number(String(req.user!.sub).replace(/\D/g, '')) || null;
    const body = req.body as z.infer<typeof createAuthorizationSchema>;

    let driverId = body.driverId;
    if (role === 'conductor') {
      if (!userId) throw new ForbiddenError('Sesión sin company-user id.');
      const [driverRow] = await db
        .select({ id: companyDrivers.id })
        .from(companyDrivers)
        .where(and(eq(companyDrivers.companyId, companyId), eq(companyDrivers.userId, userId)))
        .limit(1);
      if (!driverRow) throw new ForbiddenError('No tenés un perfil de conductor asociado.');
      if (body.driverId !== driverRow.id) {
        throw new ForbiddenError('Solo podés crear solicitudes para tu propio conductor.');
      }
      driverId = driverRow.id;
    }

    const [assetOk] = await db
      .select({ id: companyAssets.id })
      .from(companyAssets)
      .where(and(eq(companyAssets.id, body.assetId), eq(companyAssets.companyId, companyId)))
      .limit(1);
    if (!assetOk) throw new AppError(400, 'Vehículo inválido.');

    const [driverOk] = await db
      .select({ id: companyDrivers.id })
      .from(companyDrivers)
      .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
      .limit(1);
    if (!driverOk) throw new AppError(400, 'Conductor inválido.');

    const [created] = await db
      .insert(companyExitAuthorizations)
      .values({
        companyId,
        assetId:           body.assetId,
        driverId,
        status:            'Pendiente',
        oilBayonetaVideoUrl:      body.oilBayonetaVideoUrl,
        oilBayonetaVideoThumbUrl: body.oilBayonetaVideoThumbUrl,
        coolantPhotoUrl:          body.coolantPhotoUrl,
        brakeFluidPhotoUrl:       body.brakeFluidPhotoUrl,
        tirePhotosUrl:            body.tirePhotosUrl,
        windshieldWasherPhotoUrl:  body.windshieldWasherPhotoUrl,
        lightsPhotoUrl:            body.lightsPhotoUrl,
        batteryPhotoUrl:           body.batteryPhotoUrl,
        jackPhotoUrl:              body.jackPhotoUrl,
        notes:                     body.notes,
      })
      .returning();

    // ── Enriquecer con datos relacionales para WS y response ─────────────
    const enrichInfo = await fetchEnrichInfo(body.assetId, driverId, companyId);

    await logAudit(db, companyId, {
      entity:   'exit_authorizations',
      entityId: toId('exit-auth', created.id),
      action:   'create',
      actorId:  req.user!.sub,
      actorName: req.user!.name,
      description: `Autorización creada para vehículo ${body.assetId} por conductor ${driverId}.`,
    });

    wsBroadcast(companyId, {
      type: 'exit-authorization:created',
      data: serializeAuthorization(created, { ...enrichInfo, decidedByName: null }),
    });

    res.status(201).json(serializeAuthorization(created, { ...enrichInfo, decidedByName: null }));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/exit-authorizations/:authId/approve ─────────────────

router.post('/:authId/approve', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const role = req.user!.role;
    if (!canDecide(role)) throw new ForbiddenError('No tenés permiso para autorizar salidas.');

    const authId = parseId('exit-auth', req.params.authId);
    const userId = Number(String(req.user!.sub).replace(/\D/g, '')) || null;

    const [existing] = await db
      .select()
      .from(companyExitAuthorizations)
      .where(and(eq(companyExitAuthorizations.id, authId), eq(companyExitAuthorizations.companyId, companyId)))
      .limit(1);

    if (!existing) throw new NotFoundError('Autorización', req.params.authId);
    if (existing.status !== 'Pendiente') {
      throw new AppError(409, `La solicitud ya fue ${existing.status.toLowerCase()}.`);
    }

    const [updated] = await db
      .update(companyExitAuthorizations)
      .set({
        status: 'Autorizada',
        decisionByUserId: userId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companyExitAuthorizations.id, authId))
      .returning();

    // ── Enriquecer con datos relacionales para WS y response ─────────────
    const enrichInfo = await fetchEnrichInfo(existing.assetId, existing.driverId, companyId);

    await logAudit(db, companyId, {
      entity:   'exit_authorizations',
      entityId: toId('exit-auth', updated.id),
      action:   'update',
      actorId:  req.user!.sub,
      actorName: req.user!.name,
      description: `Autorización ${toId('exit-auth', updated.id)} aprobada.`,
    });

    wsBroadcast(companyId, {
      type: 'exit-authorization:decided',
      data: serializeAuthorization(updated, { ...enrichInfo, decidedByName: req.user!.name }),
    });

    res.json(serializeAuthorization(updated, { ...enrichInfo, decidedByName: req.user!.name }));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/exit-authorizations/:authId/reject ──────────────────

router.post('/:authId/reject', requireModule('autorizaciones'), validate(decisionSchema), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const role = req.user!.role;
    if (!canDecide(role)) throw new ForbiddenError('No tenés permiso para rechazar salidas.');

    const authId = parseId('exit-auth', req.params.authId);
    const userId = Number(String(req.user!.sub).replace(/\D/g, '')) || null;
    const body = req.body as z.infer<typeof decisionSchema>;

    const [existing] = await db
      .select()
      .from(companyExitAuthorizations)
      .where(and(eq(companyExitAuthorizations.id, authId), eq(companyExitAuthorizations.companyId, companyId)))
      .limit(1);

    if (!existing) throw new NotFoundError('Autorización', req.params.authId);
    if (existing.status !== 'Pendiente') {
      throw new AppError(409, `La solicitud ya fue ${existing.status.toLowerCase()}.`);
    }

    const [updated] = await db
      .update(companyExitAuthorizations)
      .set({
        status: 'Rechazada',
        decisionByUserId: userId,
        decisionNotes: body.notes ?? null,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companyExitAuthorizations.id, authId))
      .returning();

    // ── Enriquecer con datos relacionales para WS y response ─────────────
    const enrichInfo = await fetchEnrichInfo(existing.assetId, existing.driverId, companyId);

    await logAudit(db, companyId, {
      entity:   'exit_authorizations',
      entityId: toId('exit-auth', updated.id),
      action:   'update',
      actorId:  req.user!.sub,
      actorName: req.user!.name,
      description: `Autorización ${toId('exit-auth', updated.id)} rechazada.`,
    });

    wsBroadcast(companyId, {
      type: 'exit-authorization:decided',
      data: serializeAuthorization(updated, { ...enrichInfo, decidedByName: req.user!.name }),
    });

    res.json(serializeAuthorization(updated, { ...enrichInfo, decidedByName: req.user!.name }));
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /company/:id/exit-authorizations/:authId ──────────────────────

router.delete('/:authId', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const role = req.user!.role;
    if (!canDelete(role)) throw new ForbiddenError('No tenés permiso para eliminar.');

    const authId = parseId('exit-auth', req.params.authId);
    const [existing] = await db
      .select()
      .from(companyExitAuthorizations)
      .where(and(eq(companyExitAuthorizations.id, authId), eq(companyExitAuthorizations.companyId, companyId)))
      .limit(1);

    if (!existing) throw new NotFoundError('Autorización', req.params.authId);
    if (existing.status === 'Pendiente') {
      throw new AppError(409, 'No podés eliminar una solicitud pendiente. Primero autorizala o rechazala.');
    }

    await db.delete(companyExitAuthorizations).where(eq(companyExitAuthorizations.id, authId));

    await logAudit(db, companyId, {
      entity:   'exit_authorizations',
      entityId: toId('exit-auth', authId),
      action:   'delete',
      actorId:  req.user!.sub,
      actorName: req.user!.name,
      description: `Autorización ${toId('exit-auth', authId)} eliminada.`,
    });

    wsBroadcast(companyId, {
      type: 'exit-authorization:deleted',
      data: { id: toId('exit-auth', authId) },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;