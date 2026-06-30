// routes/company/canvas-boards.ts
// ─────────────────────────────────────────────────────────────────────
// CRUD del Lienzo de Presentación.
//
// Endpoints:
//   GET    /company/:id/canvas-boards             lista (propios + compartidos)
//   POST   /company/:id/canvas-boards              crear {name, description?, isShared?}
//   GET    /company/:id/canvas-boards/:boardId      detalle + widgets
//   PUT    /company/:id/canvas-boards/:boardId      renombrar / cambiar descripción / panelModules / isShared
//   DELETE /company/:id/canvas-boards/:boardId      borrar (dueño o admin)
//
//   POST   /company/:id/canvas-boards/:boardId/widgets       crear widget
//   PUT    /company/:id/canvas-boards/:boardId/widgets/:wId   mover/redimensionar/reconfigurar
//   DELETE /company/:id/canvas-boards/:boardId/widgets/:wId   borrar
//
// Permisos granulares: `lienzo.lienzo.{ver,crear,editar,eliminar}`.
// (Antes `reportes.lienzo.*` — el shim en `requirePermission` mantiene compat.)
// Aislamiento por empresa (companyId SIEMPRE del JWT, nunca del body).
//
// FIX (jun 2026): el handler PUT de widget tenía un bug en la validación de
// scope/entityKind/entityIds al editar un widget existente: usaba
// `updateData.entityKind ?? existing.entityKind` para resolver el valor
// final, pero `??` trata `null` igual que `undefined`. Cuando scope pasaba
// a 'todos' se seteaba `updateData.entityKind = null` A PROPÓSITO, y el
// `??` de más abajo descartaba ese null y volvía a traer el entityKind
// viejo del widget — rompiendo la validación con "Para scope='todos' no
// se envía entityKind ni entityIds" aunque el frontend mandaba bien los
// valores. Reemplazado por chequeo de presencia de key (`"entityKind" in
// updateData`) en vez de `??`.
// ─────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { and, eq, desc, sql, or } from "drizzle-orm";
import { db } from "../../db/client";
import {
  companyCanvasBoards,
  companyCanvasWidgets,
} from "../../db/schema/operational";
import { validate } from "../../lib/validate";
import { requireModule } from "../../middlewares/requireModule";
import { requirePermission } from "../../middlewares/requirePermission";
import { NotFoundError, ForbiddenError, AppError, ValidationError } from "../../lib/errors";
import { toId, parseId } from "../../lib/ids";
import { logAudit } from "../../lib/audit";
import { safeString, validators } from "../../lib/validators";
import { fetchCanvasRows } from "../../lib/canvas-rows";
import { fetchCombinedEntityData } from "../../lib/canvas-combined";

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────

const MODULOS_VALIDOS = [
  "mantenimiento","combustible","flotas","conductores","checklists",
  "alertas","ac","seguros","peajes","asignaciones",
] as const;

const VIZ_KINDS        = ["chart", "table"] as const;
const CHART_TYPES      = ["bar_h","bar_v","line","line_exponencial","pie","radar"] as const;
const SCOPES           = ["todos", "uno", "varios"] as const;
const ENTITY_KINDS     = ["asset", "driver"] as const;
const PERIODOS         = ["month", "quarter", "year"] as const;

const createBoardSchema = z.object({
  name:        safeString({ min: 2, max: 160, fieldLabel: "Nombre", allowEmpty: false }),
  description: validators.longTextOptional,
  panelModules: z.array(z.string().min(1)).max(20).default([]),
  isShared:    z.boolean().default(false),
});

const updateBoardSchema = z.object({
  name:         safeString({ min: 2, max: 160, fieldLabel: "Nombre", allowEmpty: false }).optional(),
  description:  validators.longTextOptional,
  panelModules: z.array(z.string().min(1)).max(20).optional(),
  isShared:     z.boolean().optional(),
});

const createWidgetSchema = z.object({
  modulo:       z.enum(MODULOS_VALIDOS),
  vizKind:      z.enum(VIZ_KINDS),
  chartType:    z.enum(CHART_TYPES).nullable().optional(),

  scope:        z.enum(SCOPES).default("todos"),
  entityKind:   z.enum(ENTITY_KINDS).nullable().optional(),
  entityIds:    z.array(z.number().int().positive()).max(20).default([]),

  periodo:      z.enum(PERIODOS).default("month"),
  fechaDesde:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  fechaHasta:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),

  sourceField:  z.enum([
    "lineChart","barVChart","barHChart","radarChart","exponencialChart",
    "comparacionChart","kpis",
  ]).optional(),
  title:        z.string().max(160).optional().nullable(),

  // Combinación de módulos (solo válido para vizKind='chart').
  secondaryModulo: z.enum(MODULOS_VALIDOS).nullable().optional(),
});

const updateWidgetSchema = z.object({
  // Geometría
  posX:        z.number().int().min(-5000).max(20000).optional(),
  posY:        z.number().int().min(-5000).max(20000).optional(),
  width:       z.number().int().min(180).max(3000).optional(),
  height:      z.number().int().min(120).max(3000).optional(),
  // Configuración completa (jun 2026: permitimos editar también modulo,
  // vizKind, scope, fechas, etc. — antes había que borrar y recrear).
  modulo:       z.enum(MODULOS_VALIDOS).optional(),
  vizKind:      z.enum(VIZ_KINDS).optional(),
  chartType:    z.enum(CHART_TYPES).nullable().optional(),
  scope:        z.enum(SCOPES).optional(),
  entityKind:   z.enum(ENTITY_KINDS).nullable().optional(),
  entityIds:    z.array(z.number().int().positive()).max(20).optional(),
  periodo:      z.enum(PERIODOS).optional(),
  fechaDesde:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").optional(),
  fechaHasta:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").optional(),
  title:        z.string().max(160).optional().nullable(),
  sourceField:  z.enum([
    "lineChart","barVChart","barHChart","radarChart","exponencialChart",
    "comparacionChart","kpis",
  ]).optional(),
  // Combinación de módulos
  secondaryModulo: z.enum(MODULOS_VALIDOS).nullable().optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────

type BoardRow = typeof companyCanvasBoards.$inferSelect;
type WidgetRow = typeof companyCanvasWidgets.$inferSelect;

function serializeBoard(b: BoardRow) {
  return {
    id:           toId("canvas-board", b.id),
    companyId:    toId("company", b.companyId),
    ownerUserId:  b.ownerUserId != null ? toId("company-user", b.ownerUserId) : null,
    name:         b.name,
    description:  b.description,
    panelModules: b.panelModules ?? [],
    isShared:     b.isShared,
    createdAt:    b.createdAt.toISOString(),
    updatedAt:    b.updatedAt.toISOString(),
  };
}

function serializeWidget(w: WidgetRow) {
  return {
    id:           toId("canvas-widget", w.id),
    boardId:      toId("canvas-board", w.boardId),
    companyId:    toId("company", w.companyId),
    modulo:       w.modulo,
    vizKind:      w.vizKind,
    chartType:    w.chartType,
    scope:        w.scope,
    entityKind:   w.entityKind,
    entityIds:    w.entityIds ?? [],
    periodo:      w.periodo,
    fechaDesde:   typeof w.fechaDesde === "string"
                    ? w.fechaDesde
                    : w.fechaDesde.toISOString().slice(0, 10),
    fechaHasta:   typeof w.fechaHasta === "string"
                    ? w.fechaHasta
                    : w.fechaHasta.toISOString().slice(0, 10),
    sourceField:  w.sourceField,
    secondaryModulo: w.secondaryModulo ?? null,
    posX:         w.posX,
    posY:         w.posY,
    width:        w.width,
    height:       w.height,
    title:        w.title,
    createdAt:    w.createdAt.toISOString(),
    updatedAt:    w.updatedAt.toISOString(),
  };
}

/** Mapea un chartType al campo sourceField por defecto (al crear el widget). */
function defaultSourceFieldFor(chartType: string | null | undefined, vizKind: string): string {
  if (vizKind === "table") return "barVChart";
  switch (chartType) {
    case "bar_h":            return "barHChart";
    case "bar_v":            return "barVChart";
    case "line":             return "lineChart";
    case "line_exponencial": return "exponencialChart";
    case "pie":              return "barVChart";
    case "radar":            return "radarChart";
    default:                 return "lineChart";
  }
}

/** Valida la consistencia entre scope / entityKind / entityIds. */
function validateScopeConsistency(scope: string, entityKind: string | null | undefined, entityIds: number[]) {
  if (scope === "todos") {
    if (entityKind || entityIds.length > 0) {
      throw new ValidationError({ scope: ["Para scope='todos' no se envía entityKind ni entityIds."] });
    }
    return;
  }
  if (scope === "uno") {
    if (!entityKind) throw new ValidationError({ entityKind: ["Requerido para scope='uno'."] });
    if (entityIds.length !== 1) throw new ValidationError({ entityIds: ["Para scope='uno' exactamente 1 id."] });
    return;
  }
  // scope === "varios"
  if (!entityKind) throw new ValidationError({ entityKind: ["Requerido para scope='varios'."] });
  if (entityIds.length < 2) throw new ValidationError({ entityIds: ["Para scope='varios' se necesitan al menos 2 ids."] });
  if (entityIds.length > 6) throw new ValidationError({ entityIds: ["Máximo 6 entidades para mantener legibilidad."] });
}

// ─── LIST ────────────────────────────────────────────────────────────────

router.get(
  "/",
  requireModule("lienzo"),
  requirePermission("lienzo", "lienzo", "ver"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const userIdNum = parseInt(req.user!.sub.replace(/\D/g, "")) || null;

      // Lista: boards del usuario (cualquier isShared) + boards compartidos de la empresa.
      // Si es admin/owner, ve TODOS los boards de la empresa.
      const isAdminLike = ["owner_empresa", "admin_empresa", "superadmin"].includes(req.user!.role);
      const conds = [eq(companyCanvasBoards.companyId, companyId)];
      if (!isAdminLike && userIdNum) {
        conds.push(or(
          eq(companyCanvasBoards.ownerUserId, userIdNum),
          eq(companyCanvasBoards.isShared, true),
        )!);
      }
      const rows = await db
        .select()
        .from(companyCanvasBoards)
        .where(and(...conds))
        .orderBy(desc(companyCanvasBoards.updatedAt));

      res.json({ data: rows.map(serializeBoard), total: rows.length });
    } catch (err) {
      next(err);
    }
  },
);

// ─── CREATE BOARD ────────────────────────────────────────────────────────

router.post(
  "/",
  requireModule("lienzo"),
  requirePermission("lienzo", "lienzo", "crear"),
  validate(createBoardSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const userIdNum = parseInt(req.user!.sub.replace(/\D/g, "")) || null;
      const body = req.body as z.infer<typeof createBoardSchema>;

      const [created] = await db
        .insert(companyCanvasBoards)
        .values({
          companyId,
          ownerUserId: userIdNum,
          name:        body.name,
          description: body.description ?? null,
          panelModules: body.panelModules ?? [],
          isShared:    body.isShared ?? false,
        })
        .returning();

      await logAudit(db, companyId, {
        entity: "canvas_boards",
        entityId: toId("canvas-board", created.id),
        action: "create",
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Lienzo "${created.name}" creado.`,
      });

      res.status(201).json(serializeBoard(created));
    } catch (err) {
      next(err);
    }
  },
);

// ─── DETAIL (con widgets) ────────────────────────────────────────────────

router.get(
  "/:boardId",
  requireModule("lienzo"),
  requirePermission("lienzo", "lienzo", "ver"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const boardId = parseId("canvas-board", req.params.boardId);
      const userIdNum = parseInt(req.user!.sub.replace(/\D/g, "")) || null;
      const isAdminLike = ["owner_empresa", "admin_empresa", "superadmin"].includes(req.user!.role);

      const [board] = await db
        .select()
        .from(companyCanvasBoards)
        .where(and(
          eq(companyCanvasBoards.id, boardId),
          eq(companyCanvasBoards.companyId, companyId),
        ))
        .limit(1);

      if (!board) throw new NotFoundError("Lienzo", req.params.boardId);

      // Permisos: admin-like ve todo; si es isShared lo ve cualquiera; sino solo el dueño.
      if (!isAdminLike && !board.isShared && board.ownerUserId !== userIdNum) {
        throw new ForbiddenError("No tenés permiso para ver este lienzo.");
      }

      const widgets = await db
        .select()
        .from(companyCanvasWidgets)
        .where(eq(companyCanvasWidgets.boardId, boardId))
        .orderBy(companyCanvasWidgets.createdAt);

      res.json({
        board: serializeBoard(board),
        widgets: widgets.map(serializeWidget),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── UPDATE BOARD ────────────────────────────────────────────────────────

router.put(
  "/:boardId",
  requireModule("lienzo"),
  requirePermission("lienzo", "lienzo", "editar"),
  validate(updateBoardSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const boardId = parseId("canvas-board", req.params.boardId);
      const userIdNum = parseInt(req.user!.sub.replace(/\D/g, "")) || null;
      const isAdminLike = ["owner_empresa", "admin_empresa", "superadmin"].includes(req.user!.role);
      const body = req.body as z.infer<typeof updateBoardSchema>;

      const [existing] = await db
        .select()
        .from(companyCanvasBoards)
        .where(and(
          eq(companyCanvasBoards.id, boardId),
          eq(companyCanvasBoards.companyId, companyId),
        ))
        .limit(1);

      if (!existing) throw new NotFoundError("Lienzo", req.params.boardId);
      if (!isAdminLike && existing.ownerUserId !== userIdNum) {
        throw new ForbiddenError("Solo el dueño del lienzo (o un admin) puede editarlo.");
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.name         !== undefined) updateData.name         = body.name;
      if (body.description  !== undefined) updateData.description  = body.description;
      if (body.panelModules !== undefined) updateData.panelModules = body.panelModules;
      if (body.isShared     !== undefined) updateData.isShared     = body.isShared;

      const [updated] = await db
        .update(companyCanvasBoards)
        .set(updateData)
        .where(eq(companyCanvasBoards.id, boardId))
        .returning();

      await logAudit(db, companyId, {
        entity: "canvas_boards",
        entityId: toId("canvas-board", boardId),
        action: "update",
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Lienzo "${updated.name}" actualizado.`,
      });

      res.json(serializeBoard(updated));
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE BOARD ────────────────────────────────────────────────────────

router.delete(
  "/:boardId",
  requireModule("lienzo"),
  requirePermission("lienzo", "lienzo", "eliminar"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const boardId = parseId("canvas-board", req.params.boardId);
      const userIdNum = parseInt(req.user!.sub.replace(/\D/g, "")) || null;
      const isAdminLike = ["owner_empresa", "admin_empresa", "superadmin"].includes(req.user!.role);

      const [existing] = await db
        .select()
        .from(companyCanvasBoards)
        .where(and(
          eq(companyCanvasBoards.id, boardId),
          eq(companyCanvasBoards.companyId, companyId),
        ))
        .limit(1);

      if (!existing) throw new NotFoundError("Lienzo", req.params.boardId);
      if (!isAdminLike && existing.ownerUserId !== userIdNum) {
        throw new ForbiddenError("Solo el dueño del lienzo (o un admin) puede eliminarlo.");
      }

      await db
        .delete(companyCanvasBoards)
        .where(eq(companyCanvasBoards.id, boardId));

      await logAudit(db, companyId, {
        entity: "canvas_boards",
        entityId: toId("canvas-board", boardId),
        action: "delete",
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Lienzo "${existing.name}" eliminado.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── CREATE WIDGET ───────────────────────────────────────────────────────

router.post(
  "/:boardId/widgets",
  requireModule("lienzo"),
  requirePermission("lienzo", "lienzo", "editar"),
  validate(createWidgetSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const boardId = parseId("canvas-board", req.params.boardId);
      const userIdNum = parseInt(req.user!.sub.replace(/\D/g, "")) || null;
      const isAdminLike = ["owner_empresa", "admin_empresa", "superadmin"].includes(req.user!.role);
      const body = req.body as z.infer<typeof createWidgetSchema>;

      // Verificar que el board existe y el usuario tiene permiso para editarlo.
      const [board] = await db
        .select()
        .from(companyCanvasBoards)
        .where(and(
          eq(companyCanvasBoards.id, boardId),
          eq(companyCanvasBoards.companyId, companyId),
        ))
        .limit(1);
      if (!board) throw new NotFoundError("Lienzo", req.params.boardId);
      if (!isAdminLike && board.ownerUserId !== userIdNum) {
        throw new ForbiddenError("No tenés permiso para editar este lienzo.");
      }

      // chartType obligatorio si vizKind='chart'.
      if (body.vizKind === "chart" && !body.chartType) {
        throw new ValidationError({ chartType: ["Requerido cuando vizKind='chart'."] });
      }

      // Consistencia scope/entity.
      validateScopeConsistency(body.scope, body.entityKind ?? null, body.entityIds ?? []);

      // sourceField: si el cliente lo manda, lo respetamos; si no, derivamos.
      const sourceField = body.sourceField || defaultSourceFieldFor(body.chartType, body.vizKind);

      // secondaryModulo solo es válido para vizKind='chart'.
      if (body.secondaryModulo && body.vizKind !== "chart") {
        throw new ValidationError({
          secondaryModulo: ["Solo se puede combinar módulos en widgets de tipo gráfica."],
        });
      }
      if (body.secondaryModulo === body.modulo) {
        throw new ValidationError({
          secondaryModulo: ["Tiene que ser un módulo distinto al principal."],
        });
      }

      const [created] = await db
        .insert(companyCanvasWidgets)
        .values({
          boardId,
          companyId,
          modulo:      body.modulo,
          vizKind:     body.vizKind,
          chartType:   body.vizKind === "chart" ? body.chartType : null,
          scope:       body.scope,
          entityKind:  body.scope === "todos" ? null : body.entityKind ?? null,
          entityIds:   body.scope === "todos" ? [] : (body.entityIds ?? []),
          periodo:     body.periodo,
          fechaDesde:  body.fechaDesde,
          fechaHasta:  body.fechaHasta,
          sourceField,
          title:       body.title ?? null,
          secondaryModulo: body.secondaryModulo ?? null,
        })
        .returning();

      res.status(201).json(serializeWidget(created));
    } catch (err) {
      next(err);
    }
  },
);

// ─── UPDATE WIDGET (mover/redimensionar/reconfigurar) ───────────────────

router.put(
  "/:boardId/widgets/:widgetId",
  requireModule("lienzo"),
  requirePermission("lienzo", "lienzo", "editar"),
  validate(updateWidgetSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const boardId  = parseId("canvas-board", req.params.boardId);
      const widgetId = parseId("canvas-widget", req.params.widgetId);
      const userIdNum = parseInt(req.user!.sub.replace(/\D/g, "")) || null;
      const isAdminLike = ["owner_empresa", "admin_empresa", "superadmin"].includes(req.user!.role);
      const body = req.body as z.infer<typeof updateWidgetSchema>;

      // Permiso sobre el board
      const [board] = await db
        .select()
        .from(companyCanvasBoards)
        .where(and(
          eq(companyCanvasBoards.id, boardId),
          eq(companyCanvasBoards.companyId, companyId),
        ))
        .limit(1);
      if (!board) throw new NotFoundError("Lienzo", req.params.boardId);
      if (!isAdminLike && board.ownerUserId !== userIdNum) {
        throw new ForbiddenError("No tenés permiso para editar este lienzo.");
      }

      const [existing] = await db
        .select()
        .from(companyCanvasWidgets)
        .where(and(
          eq(companyCanvasWidgets.id, widgetId),
          eq(companyCanvasWidgets.boardId, boardId),
          eq(companyCanvasWidgets.companyId, companyId),
        ))
        .limit(1);
      if (!existing) throw new NotFoundError("Widget", req.params.widgetId);

      const updateData: Record<string, unknown> = { updatedAt: new Date() };

      // Geometría
      if (body.posX        !== undefined) updateData.posX        = body.posX;
      if (body.posY        !== undefined) updateData.posY        = body.posY;
      if (body.width       !== undefined) updateData.width       = body.width;
      if (body.height      !== undefined) updateData.height      = body.height;
      if (body.title       !== undefined) updateData.title       = body.title;

      // Config completa — si vienen modulo/vizKind/chartType/scope/etc., los
      // aplicamos. Antes había que borrar y recrear el widget (jun 2026).
      if (body.modulo       !== undefined) updateData.modulo      = body.modulo;
      if (body.vizKind      !== undefined) updateData.vizKind     = body.vizKind;
      if (body.chartType    !== undefined) updateData.chartType   = body.chartType;
      if (body.scope        !== undefined) updateData.scope       = body.scope;
      if (body.entityKind   !== undefined) updateData.entityKind  = body.entityKind;
      if (body.entityIds    !== undefined) updateData.entityIds   = body.entityIds;
      if (body.periodo      !== undefined) updateData.periodo     = body.periodo;
      if (body.fechaDesde   !== undefined) updateData.fechaDesde  = body.fechaDesde;
      if (body.fechaHasta   !== undefined) updateData.fechaHasta  = body.fechaHasta;
      if (body.sourceField  !== undefined) updateData.sourceField = body.sourceField;
      if (body.secondaryModulo !== undefined) updateData.secondaryModulo = body.secondaryModulo;

      // Si cambia el scope, normalizamos entityKind/entityIds según la nueva config.
      const finalScope = (body.scope ?? existing.scope);
      if (body.scope !== undefined || body.entityKind !== undefined || body.entityIds !== undefined) {
        if (finalScope === "todos") {
          updateData.entityKind = null;
          updateData.entityIds  = [];
        } else {
          // Asegurar que entityKind esté presente si el scope lo requiere.
          const ek = body.entityKind !== undefined ? body.entityKind : existing.entityKind;
          if (!ek) {
            throw new ValidationError({
              entityKind: [`Requerido cuando scope='${finalScope}'.`],
            });
          }
          updateData.entityKind = ek;
        }
      }

      // Si cambia chartType/vizKind sin sourceField, recalculamos sourceField
      // para mantener consistencia con defaultSourceFieldFor.
      if (
        (body.chartType !== undefined || body.vizKind !== undefined) &&
        body.sourceField === undefined
      ) {
        const newVizKind   = body.vizKind   ?? existing.vizKind;
        const newChartType = body.chartType ?? existing.chartType;
        updateData.sourceField = defaultSourceFieldFor(newChartType, newVizKind);
      }

      // Si cambia vizKind='table', forzamos chartType=null para mantener consistencia.
      if (body.vizKind === "table") {
        updateData.chartType = null;
      }

      // Validar consistencia de scope/entityKind/entityIds si alguno cambió.
      //
      // OJO (fix jun 2026): usamos `"entityKind" in updateData` en vez de
      // `??`. El bloque de arriba puede haber seteado
      // `updateData.entityKind = null` A PROPÓSITO cuando finalScope ===
      // 'todos'. Con `updateData.entityKind ?? existing.entityKind`, ese
      // `null` intencional se descartaba (?? trata null como "ausente") y
      // volvía a traer el entityKind viejo del widget — por eso 'todos'
      // fallaba siempre que el widget ya tenía un entityKind guardado de
      // antes. Mismo razonamiento para entityIds, aunque ahí el bug no se
      // manifestaba porque `[] ?? x` sí preserva el array vacío (no es
      // nullish), solo entityKind=null es el caso roto.
      if (body.scope !== undefined || body.entityKind !== undefined || body.entityIds !== undefined) {
        const finalEntityKind = (
          "entityKind" in updateData ? updateData.entityKind : existing.entityKind
        ) as string | null;
        const finalEntityIds = (
          "entityIds" in updateData ? updateData.entityIds : (existing.entityIds ?? [])
        ) as number[];
        validateScopeConsistency(
          (updateData.scope ?? existing.scope) as string,
          finalEntityKind,
          finalEntityIds,
        );
      }

      // Validar secondaryModulo: solo para charts, no puede ser igual a modulo.
      const finalSecondary = (body.secondaryModulo !== undefined
        ? body.secondaryModulo
        : existing.secondaryModulo) as string | null;
      const finalModulo = (body.modulo !== undefined ? body.modulo : existing.modulo);
      const finalVizKind = (body.vizKind !== undefined ? body.vizKind : existing.vizKind);
      if (finalSecondary) {
        if (finalVizKind !== "chart") {
          throw new ValidationError({
            secondaryModulo: ["Solo se puede combinar módulos en widgets de tipo gráfica."],
          });
        }
        if (finalSecondary === finalModulo) {
          throw new ValidationError({
            secondaryModulo: ["Tiene que ser un módulo distinto al principal."],
          });
        }
      }

      const [updated] = await db
        .update(companyCanvasWidgets)
        .set(updateData)
        .where(eq(companyCanvasWidgets.id, widgetId))
        .returning();

      res.json(serializeWidget(updated));
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE WIDGET ───────────────────────────────────────────────────────

router.delete(
  "/:boardId/widgets/:widgetId",
  requireModule("lienzo"),
  requirePermission("lienzo", "lienzo", "editar"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const boardId  = parseId("canvas-board", req.params.boardId);
      const widgetId = parseId("canvas-widget", req.params.widgetId);
      const userIdNum = parseInt(req.user!.sub.replace(/\D/g, "")) || null;
      const isAdminLike = ["owner_empresa", "admin_empresa", "superadmin"].includes(req.user!.role);

      const [board] = await db
        .select()
        .from(companyCanvasBoards)
        .where(and(
          eq(companyCanvasBoards.id, boardId),
          eq(companyCanvasBoards.companyId, companyId),
        ))
        .limit(1);
      if (!board) throw new NotFoundError("Lienzo", req.params.boardId);
      if (!isAdminLike && board.ownerUserId !== userIdNum) {
        throw new ForbiddenError("No tenés permiso para editar este lienzo.");
      }

      const [existing] = await db
        .select()
        .from(companyCanvasWidgets)
        .where(and(
          eq(companyCanvasWidgets.id, widgetId),
          eq(companyCanvasWidgets.boardId, boardId),
          eq(companyCanvasWidgets.companyId, companyId),
        ))
        .limit(1);
      if (!existing) throw new NotFoundError("Widget", req.params.widgetId);

      await db
        .delete(companyCanvasWidgets)
        .where(eq(companyCanvasWidgets.id, widgetId));

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET ROWS DE UN WIDGET ──────────────────────────────────────────────────
//
// Devuelve las filas específicas del módulo del widget (Combustible,
// Mantenimiento, Conductores, etc.), filtradas por scope/entityIds/rango.
// Es lo que alimenta las TABLAS del lienzo. Antes se usaba el payload
// agregado del calculator (que mostraba nombres crudos y datos agrupados);
// ahora se devuelven los mismos registros que el usuario ve en la lista
// del módulo correspondiente, con columnas legibles en español.

router.get(
  "/:boardId/widgets/:widgetId/rows",
  requireModule("lienzo"),
  requirePermission("lienzo", "lienzo", "ver"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const boardId   = parseId("canvas-board", req.params.boardId);
      const widgetId  = parseId("canvas-widget", req.params.widgetId);

      const [widget] = await db
        .select()
        .from(companyCanvasWidgets)
        .where(and(
          eq(companyCanvasWidgets.id, widgetId),
          eq(companyCanvasWidgets.boardId, boardId),
          eq(companyCanvasWidgets.companyId, companyId),
        ))
        .limit(1);
      if (!widget) throw new NotFoundError("Widget", req.params.widgetId);

      const result = await fetchCanvasRows({
        companyId,
        modulo:     widget.modulo,
        scope:      widget.scope,
        entityKind: widget.entityKind,
        entityIds:  widget.entityIds ?? [],
        fechaDesde: typeof widget.fechaDesde === "string"
                      ? widget.fechaDesde
                      : widget.fechaDesde.toISOString().slice(0, 10),
        fechaHasta: typeof widget.fechaHasta === "string"
                      ? widget.fechaHasta
                      : widget.fechaHasta.toISOString().slice(0, 10),
      });

      res.json({
        modulo:    widget.modulo,
        widgetId:  toId("canvas-widget", widget.id),
        columns:   result.columns,
        rows:      result.rows,
        warning:   result.warning ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET DATOS COMBINADOS (widget con secondaryModulo) ─────────────────────
//
// Devuelve datos de DOS módulos side-by-side, agregados por entidad. Usado
// por `CombinedChart` en el frontend cuando el widget tiene
// `secondaryModulo` seteado.
//
// Ejemplo: modulo='combustible', secondaryModulo='mantenimiento' →
//   series[0] = total costo combustible por vehículo
//   series[1] = total costo mantenimiento por vehículo

router.get(
  "/:boardId/widgets/:widgetId/combined-data",
  requireModule("lienzo"),
  requirePermission("lienzo", "lienzo", "ver"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId!;
      const boardId   = parseId("canvas-board", req.params.boardId);
      const widgetId  = parseId("canvas-widget", req.params.widgetId);

      const [widget] = await db
        .select()
        .from(companyCanvasWidgets)
        .where(and(
          eq(companyCanvasWidgets.id, widgetId),
          eq(companyCanvasWidgets.boardId, boardId),
          eq(companyCanvasWidgets.companyId, companyId),
        ))
        .limit(1);
      if (!widget) throw new NotFoundError("Widget", req.params.widgetId);

      if (!widget.secondaryModulo) {
        // Si no hay secondaryModulo, devolvemos un error claro: el frontend
        // debería llamar a /rows o /estadisticas según vizKind.
        throw new ValidationError({
          secondaryModulo: ["Este widget no tiene un módulo secundario configurado."],
        });
      }

      const result = await fetchCombinedEntityData({
        companyId,
        modulo:          widget.modulo,
        secondaryModulo: widget.secondaryModulo,
        scope:           widget.scope,
        entityKind:      widget.entityKind,
        entityIds:       widget.entityIds ?? [],
        fechaDesde:      typeof widget.fechaDesde === "string"
                           ? widget.fechaDesde
                           : widget.fechaDesde.toISOString().slice(0, 10),
        fechaHasta:      typeof widget.fechaHasta === "string"
                           ? widget.fechaHasta
                           : widget.fechaHasta.toISOString().slice(0, 10),
      });

      res.json({
        modulo:    widget.modulo,
        widgetId:  toId("canvas-widget", widget.id),
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;