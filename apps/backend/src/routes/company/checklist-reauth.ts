// routes/company/checklist-reauth.ts
// ─────────────────────────────────────────────────────────────────────
// Endpoints para el flujo de "reautorización de checklists atrasados".
//
// El operador/conductor pide permiso para hacer un checklist cuyo ciclo
// ya cerró (fila 'Vencido' persistida por el cron). El admin/supervisor
// delegado aprueba o rechaza.
//
// Endpoints:
//   POST /checklists/reauth-requests            (ver + crear)
//   GET  /checklists/reauth-requests            (ver)
//   PUT  /checklists/reauth-requests/:id/decidir (editar — aprobar/rechazar)
//
// Aislamiento por empresa: TODAS las queries filtran por companyId.
// El companyId SIEMPRE viene de `req.companyId` (puesto por el middleware
// de autenticación), nunca del body o del query.
// ─────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { and, eq, desc, sql, isNull, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyChecklists,
  companyChecklistReauthRequests,
  companyChecklistCategories,
  companyAssets,
  companyUsers,
} from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requirePermission } from '../../middlewares/requirePermission';
import { NotFoundError, AppError, ForbiddenError, ValidationError } from '../../lib/errors';
import { toId, parseId, parseIdFlexible } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { wsBroadcast } from '../../services/websocket';
import { notify, notifyAdmins } from '../../lib/notification-service';
import { safeString, validators } from '../../lib/validators';

const router = Router({ mergeParams: true });

// ─── Schemas ────────────────────────────────────────────────────────────────

const createReauthSchema = z.object({
  // ID de la fila 'Vencido' persistida (formato "checklist-123" o 123).
  missedChecklistId: z.string().min(1, 'missedChecklistId requerido'),
  // Motivo obligatorio — sin esto no se puede pedir reautorización.
  reason: safeString({ min: 10, max: 2000, fieldLabel: 'Motivo', allowEmpty: false }),
});

const decideReauthSchema = z.object({
  decision: z.enum(['Autorizada', 'Rechazada']),
  notes: validators.longTextOptional,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

type ReauthRow = typeof companyChecklistReauthRequests.$inferSelect;
type ReauthSerialized = {
  id: string;
  companyId: string;
  categoryId: string;
  categoryName: string | null;
  assetId: string | null;
  assetLabel: string | null;
  cycleStart: string;
  cycleEnd: string;
  windowEnd: string;
  missedChecklistId: string | null;
  status: 'Pendiente' | 'Autorizada' | 'Rechazada';
  requestedByUserId: string | null;
  requestedByName: string | null;
  reason: string;
  decidedByUserId: string | null;
  decidedByName: string | null;
  decisionNotes: string | null;
  decidedAt: string | null;
  completedChecklistId: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Serializa una solicitud de reauth con enrichment (nombres de categoría,
 * activo, etc). `info` opcional para que el caller no tenga que re-queryear.
 */
function serializeReauth(
  r: ReauthRow,
  info?: { categoryName?: string | null; assetLabel?: string | null },
): ReauthSerialized {
  return {
    id: toId('checklist-reauth', r.id),
    companyId: toId('company', r.companyId),
    categoryId: toId('checklist-category', r.categoryId),
    categoryName: info?.categoryName ?? null,
    assetId: r.assetId != null ? toId('asset', r.assetId) : null,
    assetLabel: info?.assetLabel ?? null,
    cycleStart: r.cycleStart.toISOString(),
    cycleEnd:   r.cycleEnd.toISOString(),
    windowEnd:  r.windowEnd.toISOString(),
    missedChecklistId: r.missedChecklistId != null ? toId('checklist', r.missedChecklistId) : null,
    status: r.status,
    requestedByUserId: r.requestedByUserId != null ? toId('company-user', r.requestedByUserId) : null,
    requestedByName: r.requestedByName,
    reason: r.reason,
    decidedByUserId: r.decidedByUserId != null ? toId('company-user', r.decidedByUserId) : null,
    decidedByName: r.decidedByName,
    decisionNotes: r.decisionNotes,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    completedChecklistId: r.completedChecklistId != null ? toId('checklist', r.completedChecklistId) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ─── POST /company/:id/checklists/reauth-requests ──────────────────────────
// Crea una solicitud de reautorización para un checklist vencido.
//
// Body: { missedChecklistId: string, reason: string }
//
// Reglas:
//   - El missedChecklistId debe corresponder a una fila 'Vencido' de la
//     misma empresa.
//   - No puede haber otra solicitud 'Pendiente' o 'Autorizada' (sin
//     consumir) para el mismo missedChecklistId → 409.
//   - El reason es obligatorio (mín 10 chars).

router.post(
  '/reauth-requests',
  requireModule('checklist'),
  requirePermission('checklist', 'reautorizaciones', 'crear'),
  validate(createReauthSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const user = req.user!;
      const body = req.body as z.infer<typeof createReauthSchema>;

      // 1) Cargar la fila 'Vencido'.
      let missedChecklistId: number;
      try {
        missedChecklistId = parseIdFlexible('checklist', body.missedChecklistId);
      } catch {
        throw new AppError(400, 'missedChecklistId inválido.');
      }

      const [missed] = await db
        .select()
        .from(companyChecklists)
        .where(and(
          eq(companyChecklists.id, missedChecklistId),
          eq(companyChecklists.companyId, companyId),
        ))
        .limit(1);

      if (!missed) throw new NotFoundError('Checklist vencido', body.missedChecklistId);
      if (missed.status !== 'Vencido') {
        throw new AppError(409, `El checklist no está en estado "Vencido" (actual: "${missed.status}").`);
      }
      if (missed.categoryId == null || missed.cycleStart == null || missed.cycleEnd == null || missed.windowEnd == null) {
        throw new AppError(409, 'La fila vencida no tiene info de ciclo. Probablemente es muy antigua o quedó inconsistente.');
      }

      // 2) Validar que el activo (si existe) corresponda a algo que el usuario puede inspeccionar.
      //    Misma regla que POST /checklists: si es conductor, tiene que ser su asignación activa.
      if (user.role === 'conductor' && missed.assetId != null) {
        const userIdNum = parseIdFlexible('company-user', user.sub);
        const [driverRow] = await db
          .select({ id: sql<number>`company_drivers.id` })
          .from(sql`company_drivers`)
          .where(and(
            sql`company_drivers.user_id = ${userIdNum}`,
            sql`company_drivers.company_id = ${companyId}`,
          ))
          .limit(1);

        if (!driverRow) {
          throw new ForbiddenError('Tu usuario no está registrado como conductor.');
        }
        const [activeAssign] = await db
          .select({ assetId: sql<number>`company_assignments.asset_id` })
          .from(sql`company_assignments`)
          .where(and(
            sql`company_assignments.company_id = ${companyId}`,
            sql`company_assignments.driver_id = ${driverRow.id}`,
            sql`company_assignments.status = 'Activa'`,
          ))
          .limit(1);
        if (!activeAssign || activeAssign.assetId !== missed.assetId) {
          throw new ForbiddenError('Solo podés pedir reautorización para tu propio vehículo.');
        }
      }

      // 3) Verificar que no exista ya una solicitud activa para el mismo missedChecklist.
      const existing = await db
        .select({ id: companyChecklistReauthRequests.id })
        .from(companyChecklistReauthRequests)
        .where(and(
          eq(companyChecklistReauthRequests.companyId, companyId),
          eq(companyChecklistReauthRequests.missedChecklistId, missedChecklistId),
          inArray(companyChecklistReauthRequests.status, ['Pendiente', 'Autorizada']),
        ))
        .limit(1);

      if (existing.length > 0) {
        throw new AppError(409, 'Ya existe una solicitud activa para este checklist vencido.');
      }

      // 4) Insertar la solicitud.
      const requestedByUserId = parseIdFlexible('company-user', user.sub);
      const [created] = await db
        .insert(companyChecklistReauthRequests)
        .values({
          companyId,
          categoryId: missed.categoryId,
          assetId: missed.assetId,
          cycleStart: missed.cycleStart,
          cycleEnd: missed.cycleEnd,
          windowEnd: missed.windowEnd,
          missedChecklistId,
          status: 'Pendiente',
          requestedByUserId,
          requestedByName: user.name,
          reason: body.reason,
        })
        .returning();

      // 5) Audit log.
      await logAudit(db, companyId, {
        entity: 'checklist_reauth_requests',
        entityId: toId('checklist-reauth', created.id),
        action: 'create',
        actorId: user.sub,
        actorName: user.name,
        description: `Pidió reautorización para checklist vencido "${toId('checklist', missedChecklistId)}": "${body.reason.slice(0, 120)}"`,
      });

      // 6) Notificación a admins (in-app + WS + FCM).
      //    No filtramos por permiso `reautorizaciones.editar` porque para los
      //    admins / owner siempre hay bypass. Si después se delega a un
      //    supervisor, podemos refinar este notifyRole en una segunda iteración.
      try {
        const [cat] = await db
          .select({ name: companyChecklistCategories.name })
          .from(companyChecklistCategories)
          .where(eq(companyChecklistCategories.id, missed.categoryId))
          .limit(1);

        await notifyAdmins(companyId, {
          kind: 'system',
          title: `Solicitud de reautorización de checklist`,
          body: `${user.name} pide autorización para rehacer "${cat?.name ?? 'un checklist'}". Motivo: ${body.reason.slice(0, 140)}`,
          payload: {
            reauthRequestId: toId('checklist-reauth', created.id),
            missedChecklistId: toId('checklist', missedChecklistId),
            categoryId: missed.categoryId != null ? toId('checklist-category', missed.categoryId) : null,
            assetId: missed.assetId != null ? toId('asset', missed.assetId) : null,
          },
        });
      } catch (err) {
        console.warn('[reauth] notify falló (no crítico):', (err as Error).message);
      }

      // 7) WS broadcast (la pantalla de "Inbox de reautorizaciones" lo recibe).
      wsBroadcast(companyId, {
        type: 'checklist:reauth-requested',
        data: serializeReauth(created),
      });

      res.status(201).json(serializeReauth(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /company/:id/checklists/reauth-requests ───────────────────────────
// Lista las solicitudes de la empresa.
//
// Query: ?status=Pendiente|Autorizada|Rechazada (opcional)
//
// Visibilidad:
//   - Si el usuario tiene `reautorizaciones.editar` (admin o supervisor
//     delegado) → ve TODAS las solicitudes de la empresa.
//   - Si NO tiene `editar` (operador/conductor) → solo ve las propias
//     (`requestedByUserId === user.sub`).

router.get(
  '/reauth-requests',
  requireModule('checklist'),
  requirePermission('checklist', 'reautorizaciones', 'ver'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const user = req.user!;
      const status = typeof req.query.status === 'string' ? req.query.status : null;

      // `can` se evalúa aquí sin un helper del frontend: replicamos la lógica
      // del middleware para mantener este endpoint autocontenido.
      const canEdit = user.role === 'superadmin'
                   || user.role === 'owner_empresa'
                   || user.role === 'admin_empresa'
                   || ((user.modulePermissions as unknown as Record<string, Record<string, string[]>> | undefined)
                        ?.['checklist']?.['reautorizaciones'] ?? []).includes('editar');

      const conds = [eq(companyChecklistReauthRequests.companyId, companyId)];
      if (status && ['Pendiente', 'Autorizada', 'Rechazada'].includes(status)) {
        conds.push(eq(companyChecklistReauthRequests.status, status as 'Pendiente'));
      }
      if (!canEdit) {
        const userIdNum = parseIdFlexible('company-user', user.sub);
        conds.push(eq(companyChecklistReauthRequests.requestedByUserId, userIdNum));
      }

      const rows = await db
        .select()
        .from(companyChecklistReauthRequests)
        .where(and(...conds))
        .orderBy(desc(companyChecklistReauthRequests.createdAt));

      // Enrichment batch: nombres de categorías y assets.
      const catIds = Array.from(new Set(rows.map((r) => r.categoryId)));
      const assetIds = Array.from(new Set(rows.map((r) => r.assetId).filter((x): x is number => x != null)));

      const [catRows, assetRows] = await Promise.all([
        catIds.length > 0
          ? db.select({ id: companyChecklistCategories.id, name: companyChecklistCategories.name })
              .from(companyChecklistCategories)
              .where(inArray(companyChecklistCategories.id, catIds))
          : Promise.resolve([] as Array<{ id: number; name: string }>),
        assetIds.length > 0
          ? db.select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate })
              .from(companyAssets)
              .where(inArray(companyAssets.id, assetIds))
          : Promise.resolve([] as Array<{ id: number; name: string; plate: string | null }>),
      ]);

      const catMap = new Map(catRows.map((c) => [c.id, c.name]));
      const assetMap = new Map(assetRows.map((a) => [a.id, a]));

      const data = rows.map((r) => {
        const a = r.assetId != null ? assetMap.get(r.assetId) : null;
        const assetLabel = a?.plate ? `${a.name} · ${a.plate}` : (a?.name ?? null);
        return serializeReauth(r, {
          categoryName: catMap.get(r.categoryId) ?? null,
          assetLabel,
        });
      });

      res.json({ data, total: data.length });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/checklists/reauth-requests/:id/decidir ──────────────
// Aprueba o rechaza una solicitud.
//
// Permiso: `checklist.reautorizaciones.editar` (admin/supervisor delegado).
//
// Body: { decision: 'Autorizada' | 'Rechazada', notes?: string }

router.put(
  '/reauth-requests/:id/decidir',
  requireModule('checklist'),
  requirePermission('checklist', 'reautorizaciones', 'editar'),
  validate(decideReauthSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const user = req.user!;
      const reauthId = parseId('checklist-reauth', req.params.id);
      const body = req.body as z.infer<typeof decideReauthSchema>;

      // Si rechaza, `notes` es obligatorio (el operador merece una explicación).
      if (body.decision === 'Rechazada' && (!body.notes || body.notes.trim().length < 5)) {
        throw new ValidationError({ notes: ['La nota es obligatoria al rechazar (mínimo 5 caracteres).'] });
      }

      const [existing] = await db
        .select()
        .from(companyChecklistReauthRequests)
        .where(and(
          eq(companyChecklistReauthRequests.id, reauthId),
          eq(companyChecklistReauthRequests.companyId, companyId),
        ))
        .limit(1);

      if (!existing) throw new NotFoundError('Solicitud de reautorización', req.params.id);
      if (existing.status !== 'Pendiente') {
        throw new AppError(409, `La solicitud ya fue decidida (estado: "${existing.status}").`);
      }

      const decidedByUserId = parseIdFlexible('company-user', user.sub);
      const [updated] = await db
        .update(companyChecklistReauthRequests)
        .set({
          status: body.decision,
          decidedByUserId,
          decidedByName: user.name,
          decisionNotes: body.notes ?? null,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companyChecklistReauthRequests.id, reauthId))
        .returning();

      // Audit log.
      await logAudit(db, companyId, {
        entity: 'checklist_reauth_requests',
        entityId: toId('checklist-reauth', updated.id),
        action: body.decision === 'Autorizada' ? 'approve' : 'reject',
        actorId: user.sub,
        actorName: user.name,
        description: body.decision === 'Autorizada'
          ? `Autorizó reautorización de checklist atrasado "${toId('checklist-category', updated.categoryId)}". Motivo original: "${existing.reason.slice(0, 100)}"`
          : `Rechazó reautorización de checklist atrasado "${toId('checklist-category', updated.categoryId)}". Notas: "${(body.notes ?? '').slice(0, 100)}"`,
      });

      // Notificación al solicitante.
      if (existing.requestedByUserId != null) {
        try {
          const [cat] = await db
            .select({ name: companyChecklistCategories.name })
            .from(companyChecklistCategories)
            .where(eq(companyChecklistCategories.id, updated.categoryId))
            .limit(1);

          await notify({
            companyId,
            userId: existing.requestedByUserId,
            kind: 'system',
            title: body.decision === 'Autorizada'
              ? `Tu reautorización fue aprobada: ${cat?.name ?? 'checklist'}`
              : `Tu reautorización fue rechazada: ${cat?.name ?? 'checklist'}`,
            body: body.decision === 'Autorizada'
              ? `Podés hacer el checklist atrasado desde la sección "Atrasados". Motivo original: ${existing.reason.slice(0, 140)}`
              : (body.notes ?? 'Sin notas del aprobador.'),
            payload: {
              reauthRequestId: toId('checklist-reauth', updated.id),
              decision: body.decision,
              categoryId: toId('checklist-category', updated.categoryId),
            },
          });
        } catch (err) {
          console.warn('[reauth] notify solicitante falló (no crítico):', (err as Error).message);
        }
      }

      // WS broadcast.
      wsBroadcast(companyId, {
        type: 'checklist:reauth-decided',
        data: serializeReauth(updated),
      });

      res.json(serializeReauth(updated));
    } catch (err) {
      next(err);
    }
  }
);

export default router;