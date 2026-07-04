/**
 * Endpoints `form-options` por módulo.
 *
 * Patrón: cada módulo expone su propio `/form-options` con permiso del
 * módulo consumidor. Esto permite que módulos como Checklist, Alertas,
 * Reports, AC, Motores — que NO son dueños de los datos de Flotas/Sedes/
 * Conductores/Usuarios — puedan mostrar selectores y nombres sin tener
 * que pegarle al endpoint del módulo dueño (que requiere su permiso
 * específico).
 *
 *   GET /api/company/:id/checklist/form-options   → { assets, users }
 *   GET /api/company/:id/alerts/form-options      → { assets, drivers }
 *   GET /api/company/:id/reports/form-options     → { assets, drivers }
 *   GET /api/company/:id/ac-units/form-options    → { sites, users }
 *   GET /api/company/:id/insurance/form-options  → { assets }
 *   GET /api/company/:id/vehicles/form-options    → { drivers } (para el módulo de motores)
 *   GET /api/company/:id/garages/form-options     → { assets, users }
 *   GET /api/company/:id/users/form-options       → { sites, roles } (para Accesos/Usuarios)
 *   GET /api/company/:id/settings/form-options    → { sitesCount, assetsCount, driversCount, usersCount }
 *   GET /api/company/:id/assignments/form-options → { assets, drivers }
 *
 * Validación: solo autenticación + pertenecer a la empresa + estar activo.
 * NO se valida un permiso de módulo específico — el módulo que llama YA
 * validó el suyo (Checklist, Alertas, etc.) antes de mostrar el botón
 * que dispara el lookup.
 *
 * IMPORTANTE: este archivo es la "fuente de verdad" de los catálogos
 * que cada módulo necesita. NO centraliza permisos de otros módulos
 * — solo expone datos que el módulo consumidor YA PUEDE ver a través
 * de su flujo normal (un mantenimiento tiene asset, un checklist tiene
 * un vehículo, etc.).
 */

import { Router } from 'express';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAssets, companySites, companyDrivers } from '../../db/schema/operational';
import { companyUsers, companyRoles } from '../../db/schema/platform';

const router = Router({ mergeParams: true });

// ─── /checklist/form-options ────────────────────────────────────────────────
// Devuelve: vehículos disponibles para inspeccionar + usuarios (inspectores).
router.get('/checklist/form-options', async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const [assets, users] = await Promise.all([
      db
        .select({
          id:     companyAssets.id,
          code:   companyAssets.code,
          name:   companyAssets.name,
          plate:  companyAssets.plate,
          brand:  companyAssets.brand,
          model:  companyAssets.model,
          status: companyAssets.status,
        })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId)),
      // Inspectores posibles: cualquier usuario de la empresa menos
      // owners/admins de plataforma. El rol `conductor` puede
      // auto-inspeccionar su vehículo, pero el resto (operador,
      // supervisor) son los inspectores más comunes.
      db
        .select({
          id:        companyUsers.id,
          username:  companyUsers.username,
          role:      companyUsers.role,
          firstName: sql<string>`${companyUsers.profileData}->>'firstName'`,
          lastName:  sql<string>`${companyUsers.profileData}->>'lastName'`,
        })
        .from(companyUsers)
        .where(and(
          eq(companyUsers.companyId, companyId),
          inArray(companyUsers.role, ['operador', 'supervisor', 'conductor', 'admin_empresa', 'owner_empresa']),
        )),
    ]);

    res.json({
      assets: assets.map((a) => ({
        id:     `asset-${a.id}`,
        code:   a.code,
        name:   a.name,
        plate:  a.plate,
        brand:  a.brand,
        model:  a.model,
        status: a.status,
      })),
      users: users.map((u) => ({
        id:        `company-user-${u.id}`,
        username:  u.username,
        role:      u.role,
        firstName: u.firstName ?? null,
        lastName:  u.lastName  ?? null,
        fullName:  [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── /alerts/form-options ──────────────────────────────────────────────────
// Devuelve: vehículos y conductores para asignar la alerta.
router.get('/alerts/form-options', async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const [assets, drivers] = await Promise.all([
      db
        .select({
          id:    companyAssets.id,
          code:  companyAssets.code,
          name:  companyAssets.name,
          plate: companyAssets.plate,
          brand: companyAssets.brand,
          model: companyAssets.model,
        })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId)),
      db
        .select({
          id:        companyDrivers.id,
          firstName: companyDrivers.firstName,
          lastName:  companyDrivers.lastName,
        })
        .from(companyDrivers)
        .where(eq(companyDrivers.companyId, companyId)),
    ]);

    res.json({
      assets: assets.map((a) => ({
        id:    `asset-${a.id}`,
        code:  a.code,
        name:  a.name,
        plate: a.plate,
        brand: a.brand,
        model: a.model,
      })),
      drivers: drivers.map((d) => ({
        id:        `driver-${d.id}`,
        firstName: d.firstName,
        lastName:  d.lastName,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── /reports/form-options ─────────────────────────────────────────────────
// Devuelve: vehículos y conductores para los filtros de Reportes.
router.get('/reports/form-options', async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const [assets, drivers] = await Promise.all([
      db
        .select({
          id:    companyAssets.id,
          name:  companyAssets.name,
          plate: companyAssets.plate,
        })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId)),
      db
        .select({
          id:        companyDrivers.id,
          firstName: companyDrivers.firstName,
          lastName:  companyDrivers.lastName,
        })
        .from(companyDrivers)
        .where(eq(companyDrivers.companyId, companyId)),
    ]);

    res.json({
      assets: assets.map((a) => ({
        id:    `asset-${a.id}`,
        name:  a.name,
        plate: a.plate,
      })),
      drivers: drivers.map((d) => ({
        id:        `driver-${d.id}`,
        firstName: d.firstName,
        lastName:  d.lastName,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── /ac-units/form-options ────────────────────────────────────────────────
// Devuelve: sedes (para AC instalados en una sede) y usuarios (responsables).
router.get('/ac-units/form-options', async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const [sites, users] = await Promise.all([
      db
        .select({
          id:     companySites.id,
          code:   companySites.code,
          name:   companySites.name,
          status: companySites.status,
        })
        .from(companySites)
        .where(eq(companySites.companyId, companyId)),
      db
        .select({
          id:        companyUsers.id,
          username:  companyUsers.username,
          role:      companyUsers.role,
          firstName: sql<string>`${companyUsers.profileData}->>'firstName'`,
          lastName:  sql<string>`${companyUsers.profileData}->>'lastName'`,
        })
        .from(companyUsers)
        .where(and(
          eq(companyUsers.companyId, companyId),
          inArray(companyUsers.role, ['operador', 'supervisor', 'admin_empresa', 'owner_empresa']),
        )),
    ]);

    res.json({
      sites: sites.map((s) => ({
        id:     `site-${s.id}`,
        code:   s.code,
        name:   s.name,
        status: s.status,
      })),
      users: users.map((u) => ({
        id:        `company-user-${u.id}`,
        username:  u.username,
        role:      u.role,
        firstName: u.firstName ?? null,
        lastName:  u.lastName  ?? null,
        fullName:  [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── /assignments/form-options ─────────────────────────────────────────────
// Devuelve: vehículos y conductores para el wizard de asignaciones.
router.get('/assignments/form-options', async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const [assets, drivers] = await Promise.all([
      db
        .select({
          id:    companyAssets.id,
          name:  companyAssets.name,
          plate: companyAssets.plate,
        })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId)),
      db
        .select({
          id:        companyDrivers.id,
          firstName: companyDrivers.firstName,
          lastName:  companyDrivers.lastName,
        })
        .from(companyDrivers)
        .where(eq(companyDrivers.companyId, companyId)),
    ]);

    res.json({
      assets: assets.map((a) => ({
        id:    `asset-${a.id}`,
        name:  a.name,
        plate: a.plate,
      })),
      drivers: drivers.map((d) => ({
        id:        `driver-${d.id}`,
        firstName: d.firstName,
        lastName:  d.lastName,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── /insurance/form-options ───────────────────────────────────────────────
// Devuelve: vehículos para asociar a la póliza de seguro.
router.get('/insurance/form-options', async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const assets = await db
      .select({
        id:    companyAssets.id,
        code:  companyAssets.code,
        name:  companyAssets.name,
        plate: companyAssets.plate,
        brand: companyAssets.brand,
        model: companyAssets.model,
      })
      .from(companyAssets)
      .where(eq(companyAssets.companyId, companyId));

    res.json({
      assets: assets.map((a) => ({
        id:    `asset-${a.id}`,
        code:  a.code,
        name:  a.name,
        plate: a.plate,
        brand: a.brand,
        model: a.model,
      })),
    });
  } catch (err) {
    next(err);
  }
});
// ─── /insurance/form-options ───────────────────────────────────────────────
// Devuelve: vehículos para asociar a la póliza de seguro.
router.get('/insurance/form-options', async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const assets = await db
      .select({
        id:    companyAssets.id,
        code:  companyAssets.code,
        name:  companyAssets.name,
        plate: companyAssets.plate,
        brand: companyAssets.brand,
        model: companyAssets.model,
      })
      .from(companyAssets)
      .where(eq(companyAssets.companyId, companyId));

    res.json({
      assets: assets.map((a) => ({
        id:    `asset-${a.id}`,
        code:  a.code,
        name:  a.name,
        plate: a.plate,
        brand: a.brand,
        model: a.model,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── /drivers/form-options ────────────────────────────────────────────────
// Devuelve: sitios para asignar al conductor.
router.get('/drivers/form-options', async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const sites = await db
      .select({
        id:   companySites.id,
        name: companySites.name,
        code: companySites.code,
      })
      .from(companySites)
      .where(eq(companySites.companyId, companyId));

    res.json({
      sites: sites.map((s) => ({
        id:   `site-${s.id}`,
        name: s.name,
        code: s.code,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── /users/form-options ─────────────────────────────────────────────────────
// Catálogo que necesita el módulo de Accesos/Usuarios: sedes activas
// (para el selector "Sede" del form) y los custom roles de la empresa
// (que se mezclan con los platform roles en el dropdown "Rol").
//
// Este endpoint NO requiere permiso de `gestion/sedes` — el caller ya
// validó su permiso de `accesos/usuarios` (o `gestion/conductores`)
// antes de llegar al form. Devolver la lista de sedes desde acá es
// seguro: el caller ya tiene acceso al módulo de Usuarios por alguno
// de los dos paths.
router.get('/users/form-options', async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const [sites, roles] = await Promise.all([
      db
        .select({
          id:     companySites.id,
          name:   companySites.name,
          code:   companySites.code,
          status: companySites.status,
        })
        .from(companySites)
        .where(eq(companySites.companyId, companyId)),
      db
        .select({
          key:         companyRoles.key,
          label:       companyRoles.label,
          permissions: companyRoles.permissions,
          isSystem:    companyRoles.isSystem,
        })
        .from(companyRoles)
        .where(eq(companyRoles.companyId, companyId)),
    ]);

    res.json({
      sites: sites.map((s) => ({
        id:     `site-${s.id}`,
        name:   s.name,
        code:   s.code,
        status: s.status,
      })),
      roles: roles.map((r) => ({
        key:         r.key,
        label:       r.label,
        permissions: r.permissions,
        isSystem:    r.isSystem,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Conteos agregados para el dashboard de Settings. Si el usuario
// tiene permiso de Settings puede ver estos números agregados; el
// listado completo sigue requiriendo el permiso del módulo dueño
// (gestion/flotas, gestion/sedes, gestion/conductores).
router.get('/settings/form-options', async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const [sitesCount, assetsCount, driversCount, usersCount] = await Promise.all([
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companySites)
        .where(eq(companySites.companyId, companyId)),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId)),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companyDrivers)
        .where(eq(companyDrivers.companyId, companyId)),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companyUsers)
        .where(eq(companyUsers.companyId, companyId)),
    ]);

    res.json({
      sitesCount:    sitesCount[0]?.value    ?? 0,
      assetsCount:   assetsCount[0]?.value   ?? 0,
      driversCount:  driversCount[0]?.value  ?? 0,
      usersCount:    usersCount[0]?.value    ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

// Devuelve: conductores (para asignar motor a conductor).
// El path usa "vehicles" (en plural, en inglés) para no chocar con
// rutas del módulo "gestion/flotas" que ya está montado en /assets.
router.get('/vehicles/form-options', async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const drivers = await db
      .select({
        id:          companyDrivers.id,
        firstName:   companyDrivers.firstName,
        lastName:    companyDrivers.lastName,
        code:        companyDrivers.code,
        licenseType: companyDrivers.licenseType,
        status:      companyDrivers.status,
      })
      .from(companyDrivers)
      .where(eq(companyDrivers.companyId, companyId));

    res.json({
      drivers: drivers.map((d) => ({
        id:          `driver-${d.id}`,
        firstName:   d.firstName,
        lastName:    d.lastName,
        name:        [d.firstName, d.lastName].filter(Boolean).join(' ').trim() || d.code,
        code:        d.code,
        licenseType: d.licenseType,
        status:      d.status,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
