// src/routes/public.ts
//
// Endpoints públicos (sin autenticación) usados por la landing page:
//   - GET /public/plans              → 4 planes con features y módulos
//   - GET /public/config             → settings del sitio (brand, contacto, etc.)
//   - GET /public/staff/verify/:t    → valida un QR de carnet y devuelve
//                                       datos mínimos de la persona
//
// No exponemos datos sensibles: solo marketing + funcionalidades resumidas +
// verificación de carnets QR.

import { Router } from 'express';
import { eq, and, asc } from 'drizzle-orm';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { db } from '../db/client';
import {
  platformPlans,
  platformModules,
  platformPlanModules,
  companyUsers,
  companies,
} from '../db/schema/platform';
import { platformSettings } from '../db/schema/platform';
import { rateLimitPublic } from '../middlewares/rateLimit';
import { verifyStaffQrToken } from '../lib/qr-token';

const router = Router();

// Rate-limit público: sin auth, key por IP. Suficiente para que la
// landing no sea scrapable de forma masiva. 120 / min.
router.use(rateLimitPublic);

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// GET /public/plans
// Devuelve los 4 planes (starter/pro/business/enterprise) con bullets y
// módulos habilitados en formato resumido para la landing.
router.get('/plans', async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(platformPlans)
      .where(and(eq(platformPlans.isActive, true)))
      .orderBy(asc(platformPlans.sortOrder));

    // Traer todas las relaciones plan→módulo para esos planes
    const planIds = rows.map(p => p.id);
    const allMods = planIds.length > 0
      ? await db
          .select({ planId: platformPlanModules.planId, moduleId: platformPlanModules.moduleId })
          .from(platformPlanModules)
      : [];

    // Traer labels de los módulos
    const moduleIds = Array.from(new Set(allMods.map(m => m.moduleId)));
    const moduleLabels = moduleIds.length > 0
      ? await db
          .select({ id: platformModules.id, label: platformModules.label, icon: platformModules.icon, accent: platformModules.accent })
          .from(platformModules)
          .where(eq(platformModules.isActive, true))
      : [];

    const labelById = new Map(moduleLabels.map(m => [m.id, m]));

    res.json({
      data: rows.map(p => ({
        id:             slugify(p.id),
        slug:           p.id,
        name:           p.name,
        tier:           p.tier,
        description:    p.description ?? '',
        monthlyPrice:   p.monthlyPrice,
        annualPrice:    p.annualPrice,
        currency:       p.currency,
        features:       (p.features as unknown as string[]) ?? [],
        isPopular:      p.isPopular,
        sortOrder:      p.sortOrder,
        maxUsers:       p.maxUsers,
        maxAdmins:      p.maxAdmins,
        maxSupervisors: p.maxSupervisors,
        maxOperators:   p.maxOperators,
        maxDrivers:     p.maxDrivers,
        maxAssets:      p.maxAssets,
        modules:        allMods
          .filter(m => m.planId === p.id)
          .map(m => ({
            id:     m.moduleId,
            label:  labelById.get(m.moduleId)?.label ?? m.moduleId,
            icon:   labelById.get(m.moduleId)?.icon  ?? null,
            accent: labelById.get(m.moduleId)?.accent ?? null,
          })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /public/config
// Settings públicos del sitio (brand, tagline, contacto).
router.get('/config', async (_req, res, next) => {
  try {
    const [row] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.id, 1))
      .limit(1);

    if (!row) {
      // Defaults razonables si todavía no se sembró settings
      return res.json({
        data: {
          platformName: 'ApliSmart Motors',
          platformUrl:  null,
          supportEmail: 'ventas@aplismartmotors.app',
          defaultTimezone: 'America/Guayaquil',
          defaultLanguage: 'es',
        },
      });
    }

    res.json({
      data: {
        platformName:    row.platformName,
        platformUrl:     row.platformUrl,
        supportEmail:    row.supportEmail,
        supportPhone:    null,
        brandTagline:    'Control de flota y equipos motorizados',
        defaultTimezone: row.defaultTimezone,
        defaultLanguage: row.defaultLanguage,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /public/staff/verify/:token ─────────────────────────────────────────
//
// Endpoint PÚBLICO usado por la pantalla de validación (un supervisor
// escanea el QR del carnet con su celu y esta ruta resuelve el token).
//
// Privacidad: devuelve SOLO lo mínimo para confirmar identidad:
//   - valid:        bool
//   - reason:       string (si valid=false)
//   - fullName:     string  (nombre + apellido)
//   - role:         string  (label legible, NO la key interna)
//   - roleKey:      string  (la key interna — útil para UI)
//   - companyName:  string  (a qué empresa pertenece)
//   - photoUrl:     string|null  (foto si tiene)
//   - license:      { number, type, expiry, points } | null  (solo si es conductor)
//   - status:       'active' | 'inactive'
//
// NO expone: email, username, passwordHash, modulePermissions, profileData
// completo, documentNumber/cedula, ni nada que sirva para escalar privilegios.
//
// Seguridad:
//   - Rate-limited a 120/min por IP (rateLimitPublic arriba).
//   - Solo validamos si la firma es buena + iss/aud correctos + no expirado.
//   - Devolvemos 200 con {valid:false} para cualquier fallo (token inválido,
//     expirado, user no encontrado, user inactivo) — NO 401/403. Eso evita
//     que un atacante pueda enumerar tokens válidos vs inválidos.

router.get('/staff/verify/:token', async (req, res, next) => {
  try {
    const token = String(req.params.token ?? '');
    if (!token || token.length < 20 || token.length > 4096) {
      // Token con forma inválida. Devolvemos valid:false sin error
      // para no dar info a un atacante.
      return res.json({ valid: false, reason: 'invalid' });
    }

    // 1) Verificar firma + iss/aud + exp.
    let payload;
    try {
      payload = verifyStaffQrToken(token);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        return res.json({ valid: false, reason: 'expired' });
      }
      if (err instanceof JsonWebTokenError) {
        return res.json({ valid: false, reason: 'invalid' });
      }
      throw err;
    }

    // 2) Extraer userId del sub (`company-user-<id>`).
    const subParts = payload.sub.split('-');
    if (subParts.length < 3 || subParts[0] !== 'company' || subParts[1] !== 'user') {
      return res.json({ valid: false, reason: 'invalid' });
    }
    const userId = parseInt(subParts.slice(2).join('-'), 10);
    if (!Number.isFinite(userId)) {
      return res.json({ valid: false, reason: 'invalid' });
    }

    // 3) Cross-tenant guard: el companyId del token debe matchear la fila
    // del user. Eso evita que un QR emitido para empresa-A valide como
    // user de empresa-B si por algún bug el userId colisionara.
    const [row] = await db
      .select({
        id:           companyUsers.id,
        companyId:    companyUsers.companyId,
        companyName:  companies.name,
        status:       companyUsers.status,
        role:         companyUsers.role,
        profileData:  companyUsers.profileData,
        photoUrl:     companyUsers.photoUrl,
      })
      .from(companyUsers)
      .innerJoin(companies, eq(companies.id, companyUsers.companyId))
      .where(eq(companyUsers.id, userId))
      .limit(1);

    if (!row) {
      return res.json({ valid: false, reason: 'not_found' });
    }
    if (row.companyId !== payload.companyId) {
      // Token emitió para otra empresa. Mismo motivo: no dar info.
      return res.json({ valid: false, reason: 'invalid' });
    }
    if (row.status !== 'active') {
      return res.json({ valid: false, reason: 'inactive' });
    }

    // 4) Resolver label legible del rol. Hardcodeamos los 5 platform
    // roles; custom roles caen al key.
    const ROLE_LABELS: Record<string, string> = {
      owner_empresa:  'Dueño / Propietario',
      admin_empresa:  'Administrador',
      supervisor:     'Supervisor',
      operador:       'Operador',
      conductor:      'Conductor',
    };
    const roleLabel = ROLE_LABELS[row.role] ?? row.role;

    // 5) Nombre completo. Preferencia: fullName explícito en profileData
    // > firstName + lastName > username.
    const pd = (row.profileData as Record<string, unknown> | null) ?? {};
    const fullNameFromProfile = typeof pd.fullName === 'string' ? pd.fullName.trim() : '';
    const firstName = typeof pd.firstName === 'string' ? pd.firstName.trim() : '';
    const lastName  = typeof pd.lastName  === 'string' ? pd.lastName.trim()  : '';
    const fullName = fullNameFromProfile || [firstName, lastName].filter(Boolean).join(' ') || '—';

    // 6) Datos de licencia — SOLO si el rol es conductor. Para cualquier
    // otro rol, devolvemos null (no revelamos info que no aplica).
    let license: {
      number: string;
      type: string;
      expiry: string | null;
      points: number;
    } | null = null;
    if (row.role === 'conductor') {
      const ln = typeof pd.licenseNumber === 'string' ? pd.licenseNumber : '';
      const lt = typeof pd.licenseType   === 'string' ? pd.licenseType   : '';
      const le = typeof pd.licenseExpiry === 'string' ? pd.licenseExpiry : null;
      const lp = typeof pd.licensePoints === 'number' ? pd.licensePoints : 0;
      if (ln || lt) {
        license = { number: ln, type: lt, expiry: le, points: lp };
      }
    }

    // 7) Listo. Devolvemos solo lo mínimo.
    return res.json({
      valid:       true,
      fullName,
      role:        roleLabel,
      roleKey:     row.role,
      companyName: row.companyName,
      photoUrl:    row.photoUrl ?? null,
      status:      row.status,
      license,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
