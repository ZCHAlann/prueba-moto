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
import { eq, and, gte, lte, sql, desc, or, ilike, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  getExitAuthorizationAnalyses,
  getExitAuthorizationEffectiveStatuses,
  classifyAnalysisError,
} from '../../services/exit-analysis/exit-analysis.service';
import { computeGlobalDecision } from '../../services/exit-analysis/effective-status';
import {
  buildCorrectionsList,
  returnToDriver,
  submitCorrectionsStart,
  submitCorrectionsFinish,
  getCorrections,
} from '../../services/exit-analysis/exit-corrections.service';
import { isAiEnabled } from '../../lib/gemini-client';
import { companyUsers } from '../../db/schema/platform'
import { safeString } from '../../lib/validators';
import {
  companyExitAuthorizations,
  companyDrivers,
  companyAssets,
  exitAuthorizationAnalyses,
  exitAnalysisRejections
} from '../../db/schema/operational'
import { ForbiddenError, AppError, NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { requireModule } from '../../middlewares/requireModule';
import { reanalyzeFailedItems, analyzeExitAuthorization } from '../../services/exit-analysis/exit-analysis.service';
import { logAudit } from '../../lib/audit';
import { wsBroadcast } from '../../services/websocket';
import { validate } from '../../lib/validate';

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
    // Estado de análisis IA + correcciones (lo usa el conductor para
    // saber si tiene correcciones pendientes que rehacer).
    aiAnalysisStatus:           r.aiAnalysisStatus           ?? r.ai_analysis_status           ?? null,
    correctionsSentAt:          r.correctionsSentAt          ?? r.corrections_sent_at          ?? null,
    correctionsRound:           r.correctionsRound           ?? r.corrections_round           ?? 0,
    // Fecha en que el conductor resubmitió las correcciones. Si está
    // seteada y `correctionsSentAt` también, significa que esta
    // autorización ya NO está esperando que el conductor haga algo
    // (está en re-análisis o esperando decisión final del supervisor).
    // El frontend usa esto para ocultar el card amarillo.
    correctionsResubmittedAt:   r.correctionsResubmittedAt   ?? r.corrections_resubmitted_at  ?? null,
    // Enrichment
    assetLabel:    info.assetLabel,
    assetName:     info.assetName,
    assetPlate:    info.assetPlate,
    driverName:    info.driverName,
    decidedByName: info.decidedByName ?? (
      ((r.decisionNotes ?? r.decision_notes ?? '') as string).includes('automáticamente')
        ? 'Sistema'
        : null
    ),
  };
}

/** Helper: resuelve assetPlate, assetName, assetLabel y driverName en una sola query. */
async function fetchEnrichInfo(assetId: number, driverId: number, companyId: number): Promise<{
  assetLabel: string | null;
  assetName:  string | null;
  assetPlate: string | null;
  driverName: string | null;
}> {
  // Asset y driver en queries separadas. Esto evita el problema del
  // LEFT JOIN implícito (que devolvía NULL si el `assetId` no matcheaba
  // y hacía imposible debuggear casos donde el driverName salía vacío).
  const [assetRow] = await db.execute<{
    name:  string | null;
    plate: string | null;
    code:  string | null;
  }>(sql`
    SELECT name, plate, code
    FROM company_assets
    WHERE id = ${assetId}
      AND company_id = ${companyId}
    LIMIT 1
  `);

  const [driverRow] = await db.execute<{
    first_name: string | null;
    last_name:  string | null;
  }>(sql`
    SELECT first_name, last_name
    FROM company_drivers
    WHERE id = ${driverId}
      AND company_id = ${companyId}
    LIMIT 1
  `);

  return {
    assetLabel: assetRow?.code  ?? null,
    assetName:  assetRow?.name  ?? null,
    assetPlate: assetRow?.plate ?? null,
    driverName: driverRow
      ? `${driverRow.first_name ?? ''} ${driverRow.last_name ?? ''}`.trim() || null
      : null,
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

    // Mismo cálculo de driverName que usan los demás endpoints
    // (first_name + last_name de company_drivers), para que el nombre
    // que ve el conductor coincida con el que ve el supervisor.
    const [driverNameRow] = await db.execute<{
      first_name: string | null;
      last_name:  string | null;
    }>(sql`
      SELECT first_name, last_name
      FROM company_drivers
      WHERE id = ${driverRow.id}
        AND company_id = ${companyId}
      LIMIT 1
    `);
    const driverName = driverNameRow
      ? `${driverNameRow.first_name ?? ''} ${driverNameRow.last_name ?? ''}`.trim() || null
      : null;

    return res.json({
      driverId: driverRow.id,
      asset,
      authorizations: auths.map((a) => serializeAuthorization(a, {
        assetLabel: asset?.plate ?? null,
        assetName:  asset ? `${asset.brand} ${asset.model}`.trim() : null,
        assetPlate: asset?.plate ?? null,
        driverName,
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
      ai_analysis_status: string | null; corrections_sent_at: string | null; corrections_round: number | null;
    }>(sql`
      SELECT
        a.id, a.company_id, a.asset_id, a.driver_id, a.status,
        a.oil_bayoneta_video_url, a.oil_bayoneta_video_thumb_url,
        a.coolant_photo_url, a.brake_fluid_photo_url, a.tire_photos_url,
        a.windshield_washer_photo_url, a.lights_photo_url, a.battery_photo_url, a.jack_photo_url,
        a.notes, a.decision_notes, a.decision_by_user_id, a.decided_at,
        a.requested_at, a.created_at, a.updated_at,
        a.ai_analysis_status, a.corrections_sent_at, a.corrections_round,
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

    // Trigger automático del análisis IA. El conductor terminó el wizard
    // → el sistema dispara el análisis sin que el supervisor tenga que
    // apretar nada. Si GEMINI_API_KEY no está configurado, isAiEnabled()
    // devuelve false y el service lanza AI_DISABLED sin hacer daño.
    //
    // Fire-and-forget: NO esperamos. La respuesta al cliente sale con
    // status 201 inmediatamente. Cuando el análisis termine, los
    // suscriptores (panel del supervisor) reciben el evento por WebSocket.
    if (isAiEnabled()) {
      console.info(`[exit-auth] Triggering auto-análisis para auth ${created.id} (company=${companyId})`);
      analyzeExitAuthorization({
        exitAuthorizationId: String(created.id),
        companyId: companyId,
      })
        .then((result) => {
          console.info(`[exit-auth] Análisis auto de auth ${created.id} completado: ${result.decision}`);
          wsBroadcast(companyId, {
            type: 'exit-authorization:analysis-completed',
            data: { exitAuthorizationId: String(created.id), decision: result.decision, auto: true },
          });
        })
        .catch((err) => {
          console.error(`[exit-auth] Error en análisis auto de auth ${created.id}:`, err);
          wsBroadcast(companyId, {
            type: 'exit-authorization:analysis-failed',
            data: { exitAuthorizationId: String(created.id), error: err?.message ?? 'unknown' },
          });
        });
    } else {
      console.warn(`[exit-auth] Auto-análisis NO disparado: isAiEnabled()=false (GEMINI_API_KEY no configurada)`);
    }

    res.status(201).json(serializeAuthorization(created, { ...enrichInfo, decidedByName: null }));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/exit-authorizations/:authId/analyze ─────────────────
//
// Dispara el análisis IA completo (5 ítems en 1 sola llamada a Gemini).
// Fire-and-forget: responde 202 inmediatamente y el análisis corre en
// background. El frontend hace polling a GET /:authId/analyses.
//
// Solo roles que pueden decidir (operador/supervisor/admin) pueden
// disparar el análisis. El conductor no lo dispara — eso es decisión del
// supervisor.

router.post('/:authId/analyze', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const role = req.user!.role;
    if (!canDecide(role)) {
      throw new ForbiddenError('No tenés permiso para disparar el análisis IA.');
    }

    const authId = parseId('exit-auth', req.params.authId);

    // Validar que existe y pertenece a la empresa.
    const [existing] = await db
      .select({ id: companyExitAuthorizations.id, status: companyExitAuthorizations.status })
      .from(companyExitAuthorizations)
      .where(and(
        eq(companyExitAuthorizations.id, authId),
        eq(companyExitAuthorizations.companyId, companyId),
      ))
      .limit(1);

    if (!existing) throw new NotFoundError('Autorización', req.params.authId);
    if (existing.status !== 'Pendiente') {
      throw new AppError(409, `La autorización está en estado "${existing.status}" y no se puede analizar.`);
    }

    // Fire-and-forget. NO esperamos: el endpoint responde 202 y el análisis
    // corre en background. Si el proceso Node se reinicia, la autorización
    // quedará en 'en_proceso' hasta el próximo job de limpieza (futuro).
    analyzeExitAuthorization({
      exitAuthorizationId: authId,
      companyId: companyId,
    })
      .then((result) => {
        console.info(`[exit-auth] Análisis ${authId} completado: ${result.decision}`);
        // Notificar a los suscriptores (supervisores viendo la lista).
        wsBroadcast(companyId, {
          type: 'exit-authorization:analysis-completed',
          data: { exitAuthorizationId: String(authId), decision: result.decision },
        });
      })
      .catch((err) => {
        console.error(`[exit-auth] Error en análisis background de ${authId}:`, err);
        wsBroadcast(companyId, {
          type: 'exit-authorization:analysis-failed',
          data: { exitAuthorizationId: String(authId), error: err?.message ?? 'unknown' },
        });
      });

    res.status(202).json({
      ok: true,
      message: 'Análisis IA iniciado.',
      exitAuthorizationId: String(authId),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/exit-authorizations/:authId/reanalyze ────────────────
//
// Re-analiza SOLO los ítems que fueron marcados como no_salida en el
// análisis anterior. Útil cuando el conductor subió nuevas fotos y solo
// se quieren re-evaluar esas (no las 5 de nuevo).

// ─── POST /company/:id/exit-authorizations/:authId/reanalyze ────────────────
//
// Dispara un re-análisis IA de la autorización. El job corre en
// background y broadcastea el resultado por WS (`analysis-completed` o
// `analysis-failed`).
//
// Acepta también un body con URLs de evidencia actualizadas. Esto le
// permite al conductor "reenviar solo el video problemático" cuando la
// IA falló por un archivo demasiado pesado: sube el nuevo video (URL
// ya debe estar cargada en /uploads) y llama a este endpoint con la URL
// nueva en el body. El backend reemplaza el campo, limpia el error
// previo, y dispara el reanálisis.
//
// Permisos: cualquier user del módulo `autorizaciones` (supervisor,
// admin, owner, **y conductor** que sea dueño de la autorización). Para
// el caso del conductor, validamos que la autorización le pertenezca
// (auth.driverId → company_drivers.userId === req.user.sub).
router.post('/:authId/reanalyze', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const role = req.user!.role;
    const authId = parseId('exit-auth', req.params.authId);

    // Permisos: supervisor+ puede siempre. Conductor solo si es dueño.
    if (!canDecide(role)) {
      const userId = Number(String(req.user!.sub).replace(/\D/g, '')) || null;
      if (role === 'conductor' && userId) {
        const [own] = await db
          .select({ id: companyExitAuthorizations.id })
          .from(companyExitAuthorizations)
          .innerJoin(companyDrivers, eq(companyDrivers.id, companyExitAuthorizations.driverId))
          .where(and(
            eq(companyExitAuthorizations.id, authId),
            eq(companyExitAuthorizations.companyId, companyId),
            eq(companyDrivers.userId, userId),
          ))
          .limit(1);
        if (!own) {
          throw new ForbiddenError('Solo el dueño de la autorización puede re-analizarla.');
        }
      } else {
        throw new ForbiddenError('No tenés permiso para re-analizar.');
      }
    }

    // Body opcional: URLs de evidencia a reemplazar antes de re-analizar.
    // Útil para que el conductor reenvíe solo el video problemático.
    const body = (req.body ?? {}) as {
      oilBayonetaVideoUrl?: string;
      oilBayonetaVideoThumbUrl?: string;
    };
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
      // Limpiamos el error previo (si lo había) y forzamos status en_proceso
      // para que el frontend muestre el spinner.
      aiAnalysisError: null,
      aiAnalysisErrorCode: null,
      aiAnalysisStatus: 'en_proceso',
    };
    if (typeof body.oilBayonetaVideoUrl === 'string') {
      updateFields.oilBayonetaVideoUrl = body.oilBayonetaVideoUrl;
    }
    if (typeof body.oilBayonetaVideoThumbUrl === 'string') {
      updateFields.oilBayonetaVideoThumbUrl = body.oilBayonetaVideoThumbUrl;
    }
    if (Object.keys(updateFields).length > 0) {
      await db
        .update(companyExitAuthorizations)
        .set(updateFields as any)
        .where(eq(companyExitAuthorizations.id, authId));
    }

    reanalyzeFailedItems({
      exitAuthorizationId: authId,
      companyId: companyId,
    })
      .then((result) => {
        wsBroadcast(companyId, {
          type: 'exit-authorization:analysis-completed',
          data: { exitAuthorizationId: String(authId), decision: result.decision, reItems: result.reItems },
        });
      })
      .catch((err) => {
        console.error(`[exit-auth] Error en re-análisis background de ${authId}:`, err);
        // Clasificar el error para mostrar un mensaje amigable al
        // conductor. Sin esto, el frontend recibía `errorMessage` (raw)
        // y mostraba toasts vacíos o JSON de Google.
        const classification = classifyAnalysisError(err);
        const userMessage = classification.userMessage;
        const errorCode = classification.code;
        // Persistir el error raw para que el siguiente intento sepa
        // qué pasó (técnico, no user-facing).
        const errorMessage = err instanceof Error ? err.message : 'Error desconocido al analizar.';
        void db
          .update(companyExitAuthorizations)
          .set({
            aiAnalysisError: errorMessage,
            // Para errores transitorios (rate limit, timeout) dejamos
            // el status en 'en_proceso' para que se pueda re-disparar.
            // Para errores del usuario, lo movemos a
            // 'requiere_revision_humana'.
            aiAnalysisStatus: classification.transient ? 'en_proceso' : 'requiere_revision_humana',
            updatedAt: new Date(),
          } as any)
          .where(eq(companyExitAuthorizations.id, authId));
        // Solo broadcasteamos al conductor dueño para que vea el toast.
        void (async () => {
          const [authRow] = await db
            .select()
            .from(companyExitAuthorizations)
            .where(eq(companyExitAuthorizations.id, authId))
            .limit(1);
          if (!authRow) return;
          const [driverRow] = await db
            .select({ userId: companyDrivers.userId })
            .from(companyDrivers)
            .where(eq(companyDrivers.id, authRow.driverId))
            .limit(1);
          wsBroadcast(companyId, {
            type: 'exit-authorization:analysis-failed',
            data: {
              exitAuthorizationId: toId('exit-auth', authId),
              errorCode,
              userMessage,
            },
          }, { targetUserId: driverRow?.userId ?? undefined });
        })();
      });

    res.status(202).json({
      ok: true,
      message: 'Re-análisis iniciado.',
      exitAuthorizationId: String(authId),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/exit-authorizations/:authId/analyses ──────────────────
//
// Devuelve los análisis guardados de la autorización. El frontend hace
// polling cada 3s mientras espera resultados. Cuando el status de la
// autorización es 'aprobado_ia', 'requiere_correccion' o
// 'requiere_revision_humana', el polling puede detenerse.

router.get('/:authId/analyses', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const authId = parseId('exit-auth', req.params.authId);

    // 1. Status actual de la autorización (para que el frontend sepa si
    //    debe seguir haciendo polling o parar).
    const [auth] = await db
      .select({
        id: companyExitAuthorizations.id,
        status: companyExitAuthorizations.status,
        aiAnalysisStatus: companyExitAuthorizations.aiAnalysisStatus,
        aiAnalysisDecisionAt: companyExitAuthorizations.aiAnalysisDecisionAt,
      })
      .from(companyExitAuthorizations)
      .where(and(
        eq(companyExitAuthorizations.id, authId),
        eq(companyExitAuthorizations.companyId, companyId),
      ))
      .limit(1);

    if (!auth) throw new NotFoundError('Autorización', req.params.authId);

    // 2. Análisis guardados.
    const analyses = await db
      .select()
      .from(exitAuthorizationAnalyses)
      .where(eq(exitAuthorizationAnalyses.exitAuthorizationId, authId))
      .orderBy(desc(exitAuthorizationAnalyses.createdAt));

    // 3. Decisiones manuales del supervisor (la más reciente activa por ítem).
    const rejections = await db
      .select()
      .from(exitAnalysisRejections)
      .where(and(
        eq(exitAnalysisRejections.exitAuthorizationId, authId),
        isNull(exitAnalysisRejections.supersededAt),
      ))
      .orderBy(desc(exitAnalysisRejections.decidedAt));

    // NUEVO: estado efectivo de los 5 ítems (IA + override del supervisor,
    // con el humano siempre ganando). Esto es lo que el frontend debe usar
    // para decidir qué mostrarle al conductor y al supervisor — no
    // `puedeSalir` crudo de la IA.
    const effectiveStatuses = await getExitAuthorizationEffectiveStatuses({
      exitAuthorizationId: authId,
      companyId,
    });

    res.json({
      authorization: {
        id: String(auth.id),
        status: auth.status,
        aiAnalysisStatus: auth.aiAnalysisStatus,
        aiAnalysisDecisionAt: auth.aiAnalysisDecisionAt?.toISOString() ?? null,
      },
      analyses: analyses.map((a) => ({
        id: String(a.id),
        exitAuthorizationId: String(a.exitAuthorizationId),
        itemType: a.itemType,
        nivel: a.nivel,
        estado: a.estado,
        color: a.color,
        confianza: a.confianza,
        puedeSalir: a.puedeSalir,
        observaciones: a.observaciones,
        accionRecomendada: a.accionRecomendada,
        razonamiento: a.razonamiento,
        aiGuidance: a.aiGuidance ?? '',
        geminiModel: a.geminiModel,
        latencyMs: a.latencyMs,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        totalTokens: a.totalTokens,
        photoUrl: a.photoUrl,
        createdAt: a.createdAt.toISOString(),
      })),
      // Decisiones manuales del supervisor. Vacío si no hay.
      rejections: rejections.map((r) => ({
        id: String(r.id),
        itemType: r.itemType,
        action: r.action,
        reason: r.reason,
        decidedByName: r.decidedByName,
        decidedAt: r.decidedAt.toISOString(),
      })),
      // NUEVO: estado efectivo combinado por ítem — esto le dice al
      // frontend exactamente quién decidió qué y si algo espera revisión.
      effectiveStatuses,
      effectiveDecision: computeGlobalDecision(effectiveStatuses),
      // Correcciones consolidadas que el supervisor le envió al conductor.
      // Si awaitingResubmission=true, el conductor todavía no subió las
      // fotos nuevas. Si hay items acá, es lo que el wizard del
      // conductor debe mostrar.
      corrections: (await getCorrections({
        exitAuthorizationId: authId,
        companyId,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/exit-authorizations/:authId/items/:itemType/reject ─
//
// El supervisor marca un ítem como "mal tomado" (foto borrosa, no muestra
// lo que pide) o "fallo confirmado" o "aprobado manualmente". Queda
// guardado en exit_analysis_rejections con la razón obligatoria.

const itemRejectSchema = z.object({
  action:  z.enum(['request_recapture', 'override_approve', 'confirm_fail']),
  reason:  z.string().trim().min(3, 'La razón es obligatoria (mínimo 3 caracteres)').max(500),
});

router.post('/:authId/items/:itemType/reject', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const role = req.user!.role;
    if (!canDecide(role)) {
      throw new ForbiddenError('No tenés permiso para decidir sobre ítems.');
    }

    const authId  = parseId('exit-auth', req.params.authId);
    const itemType = req.params.itemType as string;
    const body = itemRejectSchema.parse(req.body);

    // Validar que el itemType sea uno de los 5.
    const validTypes = ['refrigerante', 'frenos', 'tablero_luces', 'bateria', 'bayoneta_aceite'];
    if (!validTypes.includes(itemType)) {
      throw new AppError(400, `itemType inválido: ${itemType}`);
    }

    // Marcar como superseded cualquier rejection previa activa del mismo
    // ítem (para mantener historial limpio).
    await db
      .update(exitAnalysisRejections)
      .set({ supersededAt: new Date() })
      .where(and(
        eq(exitAnalysisRejections.exitAuthorizationId, authId),
        eq(exitAnalysisRejections.itemType, itemType as any),
        isNull(exitAnalysisRejections.supersededAt),
      ));

    // Insertar la nueva rejection.
    const meId = Number(String(req.user!.sub).replace(/\D/g, '')) || null;
    await db.insert(exitAnalysisRejections).values({
      exitAuthorizationId: authId,
      companyId,
      itemType: itemType as any,
      action:   body.action,
      reason:   body.reason,
      decidedByUserId: meId,
      decidedByName:   req.user!.name ?? null,
    });

    // Si el supervisor pidió reenvío, la autorización queda en estado
    // "requiere_correccion" para que el conductor sepa qué rehacer.
    if (body.action === 'request_recapture') {
      await db
        .update(companyExitAuthorizations)
        .set({ aiAnalysisStatus: 'requiere_correccion', updatedAt: new Date() } as any)
        .where(eq(companyExitAuthorizations.id, authId));
    }

    wsBroadcast(companyId, {
      type: 'exit-authorization:item-decided',
      data: {
        exitAuthorizationId: String(authId),
        itemType,
        action: body.action,
        reason: body.reason,
      },
    });

    res.json({ ok: true, action: body.action, itemType });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /company/:id/exit-authorizations/:authId/photo ───────────────────
//
// El conductor (o supervisor) reemplaza UNA sola foto del análisis. Útil
// cuando el supervisor marcó una foto como "mal tomada" y el conductor
// subió una nueva. NO se reenvía toda la autorización — solo el campo
// URL del ítem correspondiente. Después se dispara re-análisis SOLO
// de ese ítem (manejado por el frontend llamando a /reanalyze).

const photoReplaceSchema = z.object({
  field: z.enum(['coolantPhotoUrl', 'brakeFluidPhotoUrl', 'lightsPhotoUrl', 'batteryPhotoUrl', 'oilBayonetaVideoUrl']),
  url:   z.string().min(1).max(2_000_000),
});

router.patch('/:authId/photo', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const authId = parseId('exit-auth', req.params.authId);
    const body = photoReplaceSchema.parse(req.body);

    // Verificar que la autorización existe y pertenece a la empresa.
    const [existing] = await db
      .select()
      .from(companyExitAuthorizations)
      .where(and(
        eq(companyExitAuthorizations.id, authId),
        eq(companyExitAuthorizations.companyId, companyId),
      ))
      .limit(1);

    if (!existing) throw new NotFoundError('Autorización', req.params.authId);
    if (existing.status !== 'Pendiente') {
      throw new AppError(409, `La autorización está en estado "${existing.status}" y no se puede modificar.`);
    }

    // Reemplazar SOLO el campo de la URL.
    await db
      .update(companyExitAuthorizations)
      .set({ [body.field]: body.url, updatedAt: new Date() } as any)
      .where(eq(companyExitAuthorizations.id, authId));

    // Limpiar cualquier rejection activa de ese ítem (porque se subió
    // una nueva foto que la IA va a re-evaluar).
    const itemTypeMap: Record<string, string> = {
      coolantPhotoUrl:    'refrigerante',
      brakeFluidPhotoUrl: 'frenos',
      lightsPhotoUrl:     'tablero_luces',
      batteryPhotoUrl:    'bateria',
      oilBayonetaVideoUrl:'bayoneta_aceite',
    };
    const itemType = itemTypeMap[body.field];

    await db
      .update(exitAnalysisRejections)
      .set({ supersededAt: new Date() })
      .where(and(
        eq(exitAnalysisRejections.exitAuthorizationId, authId),
        eq(exitAnalysisRejections.itemType, itemType as any),
        isNull(exitAnalysisRejections.supersededAt),
      ));

    wsBroadcast(companyId, {
      type: 'exit-authorization:photo-replaced',
      data: { exitAuthorizationId: String(authId), field: body.field, url: body.url },
    });

    res.json({ ok: true, field: body.field, url: body.url, itemType });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/exit-authorizations/:authId/corrections ──────────────
//
// Devuelve la lista consolidada de correcciones que el supervisor le
// envió al conductor. El wizard del conductor la lee al entrar para
// saber qué fotos rehacer y mostrar el aiGuidance como instrucción.

router.get('/:authId/corrections', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const authId = parseId('exit-auth', req.params.authId);

    const result = await getCorrections({
      exitAuthorizationId: authId,
      companyId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/exit-authorizations/:authId/return-to-driver ────────
//
// El supervisor devuelve la autorización al conductor con la lista
// consolidada de correcciones. Internamente:
//   1. Construye la lista (IA + rechazos manuales).
//   2. La guarda en correctionsSnapshot.
//   3. Marca la autorización como requiere_correccion con
//      correctionsSentAt = now().
//   4. Notifica al conductor por WebSocket.

router.post('/:authId/return-to-driver', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const role = req.user!.role;
    if (!canDecide(role)) {
      throw new ForbiddenError('No tenés permiso para devolver solicitudes al conductor.');
    }

    const authId = parseId('exit-auth', req.params.authId);
    const meId = Number(String(req.user!.sub).replace(/\D/g, '')) || null;

    const result = await returnToDriver({
      exitAuthorizationId: authId,
      companyId,
      decidedBy: { id: meId, name: req.user!.name ?? null },
    });

    await logAudit(db, companyId, {
      entity:      'company_exit_authorizations',
      entityId:    toId('exit-auth', String(authId)),
      action:      'return_to_driver',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Devuelta al conductor con ${result.count} correcciones (ronda ${result.snapshot.round}).`,
    });

    res.json({
      ok: true,
      message: 'Devuelta al conductor con correcciones.',
      correctionsCount: result.count,
      round: result.snapshot.round,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/exit-authorizations/:authId/corrections/submit ──────
//
// El conductor subió las correcciones (las fotos nuevas). Este endpoint:
//   1. Marca correctionsResubmittedAt = now().
//   2. Superseded los rechazos manuales de los items re-enviados.
//   3. Dispara re-análisis SOLO de esos items.
//
// IMPORTANTE: las URLs nuevas se actualizan ANTES vía PATCH /:authId/photo.
// Este endpoint solo confirma que el conductor terminó.

router.post('/:authId/corrections/submit', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const authId = parseId('exit-auth', req.params.authId);

    // ── Persistir de forma síncrona (correctionsResubmittedAt, status, etc.)
    //    y arrancar el re-análisis en BACKGROUND para no hacer esperar al
    //    conductor con un modal "Enviando…" durante 5-10s (lo que tarda
    //    Gemini en re-analizar las fotos).
    //
    //    El frontend cierra el modal apenas recibe 200 OK y muestra el
    //    modal "Reanalizando con IA…". El modal se cierra cuando llega
    //    el WS event `corrections-sent` (otra ronda de correcciones) o
    //    `decided` (aprobada/rechazada).
    const { reanalyzedItems, itemTypesToReanalyze } = await submitCorrectionsStart({
      exitAuthorizationId: authId,
      companyId,
    });

    if (itemTypesToReanalyze.length > 0) {
      // Fire-and-forget. Errores se loguean pero NO se devuelven al cliente
      // (el cliente ya tiene el response 200 OK).
      void (async () => {
        try {
          await submitCorrectionsFinish({
            exitAuthorizationId: authId,
            companyId,
            itemTypes: itemTypesToReanalyze,
          });
        } catch (err) {
          console.error('[exit-auth] submitCorrectionsFinish failed:', err);
        }
      })();
    }

    res.json({
      ok: true,
      message: 'Correcciones enviadas. Re-analizando items modificados.',
      reanalyzedItems,
    });
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

    // El supervisor TIENE la última palabra: si aprueba, las correcciones
    // pendientes (de la IA o de él mismo) se descartan. Esto es por
    // requerimiento del usuario: "lo que decida el supervisor tiene como
    // poder sobre lo que pida la IA y demás".
    //
    // Limpiamos:
    //   - correctionsSentAt          (la IA ya no espera correcciones)
    //   - correctionsResubmittedAt   (el conductor ya no espera re-analisis)
    //   - correctionsSnapshot         (ya no aplica)
    //   - correctionsRound            (reset a 0)
    // El status final es "Autorizada" — el de la IA en análisis no importa.
    const [updated] = await db
      .update(companyExitAuthorizations)
      .set({
        status: 'Autorizada',
        decisionByUserId: userId,
        decidedAt: new Date(),
        updatedAt: new Date(),
        correctionsSentAt: null,
        correctionsResubmittedAt: null,
        correctionsSnapshot: null,
        correctionsRound: 0,
      } as any)
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
      description: `Autorización ${toId('exit-auth', updated.id)} aprobada (supervisor override).`,
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

    // El supervisor TIENE la última palabra: si rechaza, las correcciones
    // pendientes se descartan. Mismo rationale que en /approve.
    const [updated] = await db
      .update(companyExitAuthorizations)
      .set({
        status: 'Rechazada',
        decisionByUserId: userId,
        decisionNotes: body.notes ?? null,
        decidedAt: new Date(),
        updatedAt: new Date(),
        correctionsSentAt: null,
        correctionsResubmittedAt: null,
        correctionsSnapshot: null,
        correctionsRound: 0,
      } as any)
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
      description: `Autorización ${toId('exit-auth', updated.id)} rechazada (supervisor override).`,
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

// ─── GET /company/:id/exit-authorizations/pending-review ───────────────────
//
// Lista las autorizaciones donde algún ítem quedó "en duda" (confianza
// baja de Gemini, sin override del supervisor todavía). Es la bandeja de
// entrada del supervisor — solo ve lo que la IA NO pudo decidir sola.

router.get('/pending-review', requireModule('autorizaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const role = req.user!.role;
    if (!canDecide(role)) {
      throw new ForbiddenError('No tenés permiso para ver la bandeja de revisión.');
    }

    const candidates = await db
      .select({ id: companyExitAuthorizations.id })
      .from(companyExitAuthorizations)
      .where(and(
        eq(companyExitAuthorizations.companyId, companyId),
        eq(companyExitAuthorizations.aiAnalysisStatus, 'requiere_revision_humana'),
      ));

    const results = await Promise.all(
      candidates.map(async (c) => {
        const statuses = await getExitAuthorizationEffectiveStatuses({
          exitAuthorizationId: c.id,
          companyId,
        });
        return {
          exitAuthorizationId: String(c.id),
          itemsEnDuda: statuses.filter((s) => s.enDuda).map((s) => s.itemType),
        };
      }),
    );

    res.json({ data: results.filter((r) => r.itemsEnDuda.length > 0) });
  } catch (err) {
    next(err);
  }
});


export default router;