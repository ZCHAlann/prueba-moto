// src/routes/platform/companies.ts
//
// CRUD de empresas desde superadmin.
// Crea empresas con su masterUser (usuario dueño), así como:
//   - Asigna plan + módulos según plan.
//   - Popula company_user_counts via trigger.
//   - Siembra roles default (supervisor, operador, conductor) en
//     company_roles para que el admin pueda empezar a invitar gente.

import { Router } from 'express';
import { z } from 'zod';
import { eq, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { validate } from '../../lib/validate';
import { requireSuperadmin } from '../../middlewares/requireSuperadmin';
import { NotFoundError, AppError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import {
  companies,
  companyUsers,
  companyRoles,
  companyEnabledModules,
  platformPlanModules,
  platformPlans,
  platformModules,
  companyUserCounts as companyUserCountsRef,
} from '../../db/schema/platform';
import { hashPassword } from '../../services/auth.service';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createCompanySchema = z.object({
  name:            z.string().min(2).max(160),
  slug:            z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  planId:          z.string().min(1).default('starter'),
  status:          z.enum(['active', 'inactive', 'suspended', 'trial']).default('active'),
  enabledModules:  z.array(z.string()).optional(),
  industry:        z.string().max(80).optional(),
  country:         z.string().max(80).optional(),
  city:            z.string().max(80).optional(),
  contactName:     z.string().max(160).optional(),
  contactEmail:    z.string().email().optional().or(z.literal('')),
  contactPhone:    z.string().max(40).optional(),
  website:         z.string().max(255).optional(),
  notes:           z.string().optional(),
  trialEndsAt:     z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()),
  contractStartAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  contractEndAt:   z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  masterUser: z.object({
    email:    z.string().email(),
    username: z.string().min(3).max(80),
    password: z.string().min(8).max(128),
    fullName: z.string().max(160).optional(),
  }).optional(),
});

const updateCompanySchema = createCompanySchema.omit({ masterUser: true, slug: true }).partial().extend({
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function serializeCompany(c: typeof companies.$inferSelect, opts?: {
  enabledModulesDetailed?: string[];
}) {
  return {
    id:              toId('company', c.id),
    name:            c.name,
    slug:            c.slug,
    planId:          c.planId,
    status:          c.status,
    enabledModules:  c.enabledModules,
    enabledModulesDetailed: opts?.enabledModulesDetailed ?? [],
    industry:        c.industry,
    country:         c.country,
    city:            c.city,
    contactName:     c.contactName,
    contactEmail:    c.contactEmail,
    contactPhone:    c.contactPhone,
    website:         c.website,
    notes:           c.notes,
    trialEndsAt:     c.trialEndsAt,
    contractStartAt: c.contractStartAt,
    contractEndAt:   c.contractEndAt,
    createdAt:       c.createdAt,
    updatedAt:       c.updatedAt,
  };
}

async function getEnabledModulesDetailed(companyId: number): Promise<string[]> {
  const rows = await db
    .select({ id: companyEnabledModules.moduleId })
    .from(companyEnabledModules)
    .where(eq(companyEnabledModules.companyId, companyId));
  return rows.map(r => r.id);
}

async function ensureSlugUnique(slug: string): Promise<string> {
  let s = slug;
  let n = 1;
  while (true) {
    const [exists] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, s))
      .limit(1);
    if (!exists) return s;
    n++;
    s = `${slug}-${n}`;
  }
}

/**
 * Siembra los 3 roles default de la empresa: supervisor, operador, conductor.
 * `is_system = true` para que NO se puedan borrar ni renombrar (sí
 * editar permisos).
 *
 * Permisos por defecto (alineados con role-catalog.service.ts del frontend):
 *  - supervisor: ver todo lo operativo, sin editar roles
 *  - operador:   ver + checklist + asignación (no edita usuarios)
 *  - conductor:  solo checklist + sus asignaciones
 */
async function seedDefaultRoles(companyId: number): Promise<void> {
  await db.insert(companyRoles).values([
    {
      companyId, key: 'supervisor', label: 'Supervisor',
      description: 'Supervisa operacion diaria. Ve y edita mantenimientos, checklist, combustible.',
      palette: 'Esmeralda',
      isSystem: true,
      permissions: {
        dashboard:        { dashboard:        ['ver'] },
        gestion:          { flotas: ['ver','crear','editar'], conductores: ['ver','crear','editar'], sedes: ['ver'], garajes: ['ver'], asignaciones: ['ver','crear','editar'] },
        seguros:          { polizas:          ['ver'] },
        mantenimiento:    { agenda: ['ver','crear','editar'], execution: ['ver','crear','editar'], records: ['ver','crear','editar'] },
        combustible:      { combustible:      ['ver','crear','editar'] },
        peajes:           { peajes:           ['ver','crear'] },
        checklist:        { checklist: ['ver','crear','editar'], inspecciones: ['ver','crear'], historial: ['ver'] },
        autorizaciones:   { autorizaciones:   ['ver','crear','editar','aprobar'] },
        alertas:          { alertas:          ['ver'] },
        reportes:         { reportes:         ['ver'] },
        accesos:          { usuarios: ['ver'] },
      },
    },
    {
      companyId, key: 'operador', label: 'Operador',
      description: 'Opera el dia a dia. Ingresa checklists y combustible. No edita roles.',
      palette: 'Esmeralda',
      isSystem: true,
      permissions: {
        dashboard:        { dashboard:        ['ver'] },
        gestion:          { flotas: ['ver'], conductores: ['ver'], asignaciones: ['ver'] },
        mantenimiento:    { execution: ['ver','crear'], records: ['ver'] },
        combustible:      { combustible:      ['ver','crear'] },
        checklist:        { checklist: ['ver','crear'], inspecciones: ['ver','crear'], historial: ['ver'] },
        autorizaciones:   { autorizaciones:   ['ver','crear'] },
        alertas:          { alertas:          ['ver'] },
        reportes:         { reportes:         ['ver'] },
      },
    },
    {
      companyId, key: 'conductor', label: 'Conductor',
      description: 'Solo ve sus vehiculos asignados y realiza checklists de salida.',
      palette: 'Esmeralda',
      isSystem: true,
      permissions: {
        dashboard:        { dashboard:        ['ver'] },
        checklist:        { checklist: ['ver','crear'], inspecciones: ['ver','crear'] },
        gestion:          { conductores:      ['ver'] },
      },
    },
  ]).onConflictDoNothing();
}

// ─── Listado con paginación ──────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>);

    const [rows, countRow, planModules, planRows] = await Promise.all([
      db.select().from(companies)
        .orderBy(desc(companies.name)).limit(pageSize).offset(offset),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(companies),
      db.select().from(platformPlanModules),
      db.select().from(platformPlans),
    ]);

    // Traer módulos habilitados por empresa
    const companyIds = rows.map(r => r.id);
    const enabledAll = companyIds.length > 0
      ? await db.select().from(companyEnabledModules).where(inArray(companyEnabledModules.companyId, companyIds))
      : [];
    const byCompany = new Map<number, string[]>();
    for (const em of enabledAll) {
      const arr = byCompany.get(em.companyId) ?? [];
      arr.push(em.moduleId);
      byCompany.set(em.companyId, arr);
    }

    const planModulesMap = new Map<string, string[]>();
    for (const pm of planModules) {
      const arr = planModulesMap.get(pm.planId) ?? [];
      arr.push(pm.moduleId);
      planModulesMap.set(pm.planId, arr);
    }

    const total = countRow?.[0]?.value ?? 0;
    res.json(buildPageResponse(
      rows.map(c => serializeCompany(c, { enabledModulesDetailed: byCompany.get(c.id) ?? [] })),
      total, page, pageSize,
    ));
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id ───────────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const companyId = parseId('company', req.params.id);
    const [row] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!row) throw new NotFoundError('Empresa', req.params.id);

    const enabledModules = await getEnabledModulesDetailed(companyId);
    res.json(serializeCompany(row, { enabledModulesDetailed: enabledModules }));
  } catch (err) {
    next(err);
  }
});

// ─── POST / ─────────────────────────────────────────────────────────────────

router.post('/', validate(createCompanySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createCompanySchema>;

    // Validar plan
    const [plan] = await db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.id, body.planId))
      .limit(1);
    if (!plan) {
      throw new AppError(400, `El plan "${body.planId}" no existe.`);
    }

    // Slug automático si no vino
    const requestedSlug = body.slug ?? slugify(body.name);
    const slug = await ensureSlugUnique(requestedSlug);

    // Módulos a habilitar:
    //   - Si vinieron explícitos, respetarlos.
    //   - Si no, tomar los del plan (de la tabla puente).
    let enabledModuleIds: string[];
    if (body.enabledModules && body.enabledModules.length > 0) {
      enabledModuleIds = body.enabledModules;
    } else {
      const planMods = await db
        .select({ moduleId: platformPlanModules.moduleId })
        .from(platformPlanModules)
        .where(eq(platformPlanModules.planId, body.planId));
      enabledModuleIds = planMods.map(m => m.moduleId);
    }

    const [created] = await db
      .insert(companies)
      .values({
        name:           body.name,
        slug,
        planId:         body.planId,
        status:         body.status ?? 'active',
        enabledModules: enabledModuleIds,  // compat text[]
        industry:       body.industry ?? null,
        country:        body.country ?? null,
        city:           body.city ?? null,
        contactName:    body.contactName ?? null,
        contactEmail:   body.contactEmail || null,
        contactPhone:   body.contactPhone ?? null,
        website:        body.website ?? null,
        notes:          body.notes ?? null,
        trialEndsAt:    body.trialEndsAt ? new Date(body.trialEndsAt) : null,
        contractStartAt: body.contractStartAt ?? null,
        contractEndAt:   body.contractEndAt ?? null,
      })
      .returning();

    // Insertar módulos habilitados en la nueva tabla puente
    if (enabledModuleIds.length > 0) {
      await db.insert(companyEnabledModules).values(
        enabledModuleIds.map(mid => ({ companyId: created.id, moduleId: mid })),
      );
    }

    // Siembra roles default (supervisor, operador, conductor)
    await seedDefaultRoles(created.id);

    // Master user (usuario owner/admin de la empresa)
    if (body.masterUser) {
      const passwordHash = await hashPassword(body.masterUser.password);
      const firstName = body.masterUser.fullName?.split(' ').slice(0, -1).join(' ') || body.masterUser.fullName || '';
      const lastName  = body.masterUser.fullName?.split(' ').slice(-1).join(' ') || '';
      await db.insert(companyUsers).values({
        companyId:    created.id,
        email:        body.masterUser.email,
        username:     body.masterUser.username,
        passwordHash,
        role:         'owner_empresa',
        status:       'active',
        profileData: {
          firstName,
          lastName,
          fullName: body.masterUser.fullName ?? body.masterUser.username,
          modulePermissions: enabledModuleIds.reduce<Record<string, Record<string, string[]>>>((acc, m) => {
            acc[m] = acc[m] ?? {};
            return acc;
          }, {}),
        },
      });
    }

    await logAudit(db, null, {
      entity:      'companies',
      entityId:    toId('company', created.id),
      action:      'create',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Empresa "${created.name}" creada.`,
    });

    res.status(201).json(serializeCompany(created, { enabledModulesDetailed: enabledModuleIds }));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /:id ───────────────────────────────────────────────────────────────

router.put('/:id', validate(updateCompanySchema), async (req, res, next) => {
  try {
    const rawId = String(req.params.id);
    const companyId = parseId('company', rawId);

    const [existing] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!existing) throw new NotFoundError('Empresa', rawId);

    const body = req.body as z.infer<typeof updateCompanySchema>;

    // Si cambia el plan, re-poblar los módulos desde la tabla puente
    // (a menos que también vengan enabledModules explícitos).
    let enabledModuleIds: string[] | undefined;
    if (body.enabledModules && body.enabledModules.length > 0) {
      enabledModuleIds = body.enabledModules;
    } else if (body.planId && body.planId !== existing.planId) {
      const planMods = await db
        .select({ moduleId: platformPlanModules.moduleId })
        .from(platformPlanModules)
        .where(eq(platformPlanModules.planId, body.planId));
      enabledModuleIds = planMods.map(m => m.moduleId);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ['name','planId','status','industry','country','city','contactName','contactEmail','contactPhone','website','notes'] as const) {
      if (body[k] !== undefined) updateData[k] = body[k] ?? null;
    }
    if (body.slug) {
      const newSlug = await ensureSlugUnique(body.slug);
      updateData.slug = newSlug;
    }
    if (body.trialEndsAt !== undefined)     updateData.trialEndsAt    = body.trialEndsAt ? new Date(body.trialEndsAt) : null;
    if (body.contractStartAt !== undefined) updateData.contractStartAt = body.contractStartAt ?? null;
    if (body.contractEndAt !== undefined)   updateData.contractEndAt   = body.contractEndAt ?? null;
    if (enabledModuleIds !== undefined)     updateData.enabledModules = enabledModuleIds;

    const [updated] = await db
      .update(companies)
      .set(updateData as any)
      .where(eq(companies.id, companyId))
      .returning();

    // Sincronizar la tabla puente si cambiaron los módulos
    if (enabledModuleIds !== undefined) {
      await db.delete(companyEnabledModules).where(eq(companyEnabledModules.companyId, companyId));
      if (enabledModuleIds.length > 0) {
        await db.insert(companyEnabledModules).values(
          enabledModuleIds.map(mid => ({ companyId, moduleId: mid })),
        );
      }
    }

    await logAudit(db, null, {
      entity:      'companies',
      entityId:    toId('company', companyId),
      action:      'update',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Empresa "${updated.name}" actualizada.`,
    });

    const finalEnabledModules = enabledModuleIds ?? await getEnabledModulesDetailed(companyId);
    res.json(serializeCompany(updated, { enabledModulesDetailed: finalEnabledModules }));
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /:id [SA] ──────────────────────────────────────────────────────

router.delete('/:id', requireSuperadmin, async (req, res, next) => {
  try {
    const companyId = parseId('company', String(req.params.id));

    const [existing] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!existing) throw new NotFoundError('Empresa', String(req.params.id));

    await db.delete(companies).where(eq(companies.id, companyId));

    await logAudit(db, null, {
      entity:      'companies',
      entityId:    toId('company', companyId),
      action:      'delete',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Empresa "${existing.name}" eliminada.`,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id/limits (info de límites del plan + consumo actual) ────────────

router.get('/:id/limits', async (req, res, next) => {
  try {
    const companyId = parseId('company', req.params.id);

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) throw new NotFoundError('Empresa', req.params.id);

    const [plan] = await db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.id, company.planId))
      .limit(1);

    const [counts] = await db
      .select()
      .from(companyUserCountsRef)
      .where(eq(companyUserCountsRef.companyId, companyId))
      .limit(1);

    res.json({
      plan: plan ? {
        id: plan.id, name: plan.name,
        maxUsers: plan.maxUsers, maxAdmins: plan.maxAdmins,
        maxSupervisors: plan.maxSupervisors, maxOperators: plan.maxOperators,
        maxDrivers: plan.maxDrivers, maxAssets: plan.maxAssets,
      } : null,
      counts: counts ?? {
        total: 0, admins: 0, supervisors: 0, operators: 0, drivers: 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
