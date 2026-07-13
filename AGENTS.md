# AGENTS.md

Notas operativas del proyecto para futuros agentes / devs.

## Stack

- Backend: **Express + Drizzle ORM + Postgres 15+**. JWT auth vía cookie `aplismart_token`. TypeScript.
- Frontend: **React + Vite + Tailwind CSS + Framer Motion + lucide-react**. TypeScript.
- Multi-tenant:
  - `scope = 'plataforma'` → superadmin/admin_saas (gestiona empresas).
  - `scope = 'operacion'`   → owner_empresa/admin_empresa/etc. (gestiona su propia empresa).

## Módulos y submódulos

A partir de **jul 2026** la fuente de verdad del catálogo de módulos es la BD:

- `platform_modules`        — módulos top-level (dashboard, gestion, mantenimiento, …).
- `platform_module_submodules` — submódulos (`mantenimiento.execution`, `gestion.flotas`).
- `platform_plan_modules`   — tabla puente plan ↔ módulo (qué módulos están en cada plan).
- `company_enabled_modules` — tabla puente empresa ↔ módulo (override por empresa).
- `company_roles.permissions` — permisos granulares por submódulo (jsonb).

### Seed inicial

Al arrancar el backend se ejecuta `seedPlatformCatalog()` (en
`apps/backend/src/lib/platform-seed.ts`). Es idempotente:

- Crea 18 módulos con sus submódulos (espejo del antiguo `MODULE_TREE`).
- Crea los 4 planes Starter/Pro/Business/Enterprise con límites por rol.
- Asocia cada plan a su set de módulos.

### Frontend: cliente del catálogo

El frontend tiene dos hooks:

- `usePlatformModules()` → carga `/api/platform/modules/all`.
- `usePublicPlans()`     → carga `/api/public/plans` (sin auth, lo usa el landing).

Los módulos siguen consultándose hardcoded en `MODULE_TREE` (lib/module-tree.ts)
para ser la fuente estable del editor de permisos; pero la creación/eliminación
viva de empresas usa los IDs de la tabla `platform_modules`.

## Planes (jul 2026)

`platform_plans` se mantiene pero se le agregaron columnas:

- `max_admins`, `max_supervisors`, `max_operators`, `max_drivers` — límites por rol. `null` = ilimitado.
- `description`, `features jsonb`, `is_popular`, `sort_order`, `currency`.
- `allowed_modules text[]` se mantiene por compat — la fuente de verdad pasó a `platform_plan_modules`.

### 4 planes default

| Plan       | Tier enum | Usuarios máx | Admins | Sup | Op | Cond | Activos máx | Precio/mes |
|------------|-----------|--------------|--------|-----|----|------|-------------|-------------|
| starter    | starter   | 10           | 2      | 2   | 2  | 10   | 30          | $29         |
| pro        | pro       | 30           | 3      | 5   | 10 | 30   | 200         | $89         |
| business   | pro *     | 100          | 10     | 30  | 50 | 100  | 1000        | $199        |
| enterprise | enterprise| ilimitado    | ∞      | ∞   | ∞  | ∞    | ilimitado   | $499        |

(*) Business mapea a `tier = 'pro'` hasta migrar el enum.

## Límites por rol (aplicados en backend)

`assertWithinPlanLimits(companyId, roleKey, currentCount)` en
`apps/backend/src/routes/company/user.ts` valida ANTES de insertar/editar
un usuario que la empresa no exceda:

- `max_users` global.
- `max_admins` / `max_supervisors` / `max_operators` / `max_drivers` por categoría.

El backend devuelve `403 AppError` con mensaje claro. El trigger
`sync_company_user_counts` mantiene la tabla `company_user_counts`
auto-actualizada en cada INSERT/UPDATE/DELETE de `company_users`.

UI: en `/accesos/usuarios` aparece un `<PlanLimitBanner>` arriba del listado
con barras de progreso y bloqueo del botón "Nuevo usuario" cuando se excede.

## Endpoints públicos (sin auth)

Para alimentar la landing page:

- `GET /api/public/plans`  — 4 planes con bullets, pricing y módulos incluidos.
- `GET /api/public/config` — settings del sitio (brand, contacto).

Reescritos en `apps/backend/src/routes/public.ts`.

## CRUD Superadmin (todo bajo `/api/platform/*`)

| Ruta                                 | Acceso         | Notas |
|--------------------------------------|----------------|-------|
| `GET/POST/PUT/DELETE /platform/companies` | superadmin (DELETE) | Crea empresa + auto-siembra roles default (supervisor/operador/conductor). Si viene `masterUser`, crea el owner. |
| `GET /platform/companies/:id/limits` | plataforma     | Plan + conteos actuales. Usado por la UI de Usuarios. |
| `GET/POST/PUT/DELETE /platform/plans` | superadmin (POST/PUT/DELETE) | Soporta `allowedModules` + sincroniza la tabla puente. |
| `POST/DELETE /platform/plans/:id/modules/:moduleId` | superadmin | Toggle fino de módulos por plan. |
| `GET/POST/PUT/DELETE /platform/modules` | superadmin (POST/PUT/DELETE) | CRUD del catálogo. DELETE desactiva (`is_active=false`), no borra. |

## Migraciones SQL

Las migraciones viven en `apps/backend/migrations/` y se aplican manualmente.

- `0041_platform_modules_and_rol_limits.sql` — crea las tablas nuevas +
  trigger sync_company_user_counts + backfill inicial. **Idempotente** —
  se puede correr las veces que sea.

## Empresas: `enabled_modules`

`companies.enabled_modules text[]` se mantiene por compat con data
existente. La fuente de verdad para queries es `company_enabled_modules`.
El PUT de empresa (`/platform/companies/:id`) sincroniza ambos.

## Frontend pages de Superadmin

- `/platform/companies` — wizard de 3 pasos (datos / plan+módulos / owner) + tabla + board + drawer de detalle con barras de uso del plan.
- `/platform/plans`     — 4 cards visuales (Starter/Pro/Business/Enterprise), form con tabs (Básico/Límites/Módulos/Marketing).
- `/platform/modules`   — lista expandible con submódulos, creación/edición con detalle de submódulos.

## Estructura típica de archivos relevantes

```
apps/backend/src/
├── db/schema/
│   ├── platform.ts          ← tablas companies, plans, modules, roles
│   └── relations.ts         ← relaciones
├── lib/
│   ├── platform-seed.ts     ← seed inicial de módulos + planes
│   ├── audit.ts             ← log de auditoría
│   └── pagination.ts        ← helper compartido
├── routes/platform/
│   ├── index.ts             ← /state, registrer routers
│   ├── companies.ts         ← CRUD empresas + /:id/limits
│   ├── plans.ts             ← CRUD planes
│   └── modules.ts           ← CRUD módulos
├── routes/public.ts         ← /public/plans + /public/config (sin auth)
└── routes/company/user.ts   ← POST/PUT users con assertWithinPlanLimits

apps/backend/migrations/
└── 0041_platform_modules_and_rol_limits.sql   ← migración principal nueva

apps/frontend/src/
├── hooks/
│   ├── usePlatformCompanies.ts   ← + masterUser en createCompany
│   ├── usePlatformPlans.ts       ← + usePlatformModules + usePublicPlans
│   └── useCompanyLimits.ts       ← ← NUEVO jul 2026
├── pages/Platform/
│   ├── Companies/page.tsx        ← wizard de 3 pasos + board + drawer
│   ├── Plans/page.tsx            ← cards visuales + form por tabs
│   └── Modules/pages.tsx         ← lista expandible de módulos
├── pages/Landing/page.tsx        ← usa usePublicPlans (4 cards)
└── pages/Accesos/Usuarios/page.tsx ← PlanLimitBanner arriba del listado
```

## Convenciones de TypeScript

- Backend usa Drizzle ORM (queries tipadas), zod (validación), pgEnum
  (enums como literales).
- Frontend usa componentes funcionales, Framer Motion para transiciones,
  lucide-react para iconos, Tailwind para styling.

## Cómo correr localmente

```bash
# backend
cd apps/backend
psql $DATABASE_URL -f migrations/0041_platform_modules_and_rol_limits.sql
npm run dev    # arranca en :5000 y ejecuta seedPlatformCatalog()

# frontend
cd apps/frontend
npm run dev    # :3000, proxy a :5000 vía /api
```

## Próximas tareas / ideas

- [ ] Migrar el enum `plan_tier_enum` para incluir 'business'.
- [ ] Reemplazar `MODULE_TREE` hardcoded por `usePlatformModules()` en `usePermissions`.
- [ ] Frontend: editor de submódulos en /platform/modules/:id con permisos granulares por empresa.
- [ ] Reporte ejecutivo en /platform/plans con revenue MRR por plan.

## IA multi-tenant (jul 2026 v6)

Cada empresa puede configurar su propio provider de IA, modelo y API key.
Sin override, sigue usando la config global (`process.env.GROQ_API_KEY` etc.).

### Tablas (migración 0043)

- `company_ai_settings` — 1 fila por empresa. Guarda provider, key cifrada
  AES-256-GCM (`api_key_encrypted`), modelo primario/fallback, toggles por
  feature (jarvis / exit_analysis / ai_insights / tts), budget, kill-switch.
- `company_ai_api_keys` — historial de fingerprints (sha256) para revocación.
  NO contiene la key cruda.
- `company_ai_usage` — log diario por empresa/feature/model. Permite
  facturación futura y dashboards de uso.

### Backend

- `lib/crypto.ts` — AES-256-GCM. `MASTER_ENCRYPTION_KEY` (32 bytes hex/base64)
  en env; fallback derivado de `JWT_SECRET` con warning.
- `lib/ai/client-factory.ts` — `resolveAiConfig(companyId)` lee BD, fallback
  a env vars. Cache en memoria TTL=60s. `assertFeatureEnabled()` para gates.
- `routes/company/ai-settings.ts` — CRUD + test connection + usage + providers.
- `routes/platform/companies-ai.ts` — vista plataforma + kill-switch
  (`POST /:id/ai-disable`, `POST /:id/ai-enable`).
- `lib/audit.ts` — `logPlatformAudit()` para acciones de superadmin. Scrubbing
  automático de campos `*key*`, `*secret*`, `*token*`, `*password*`.

### Frontend

- `pages/Settings/AISettingsPanel.tsx` — tab "Asistente IA" en
  `/configuracion` (empresa). Provider, modelo, API key (show/hide),
  test connection, tabla de uso últimos 30 días.
- `pages/Platform/Companies/AISettings/page.tsx` — vista plataforma en
  `/platform/companies/:id/ai`. Resumen + kill-switch + uso.
- Drawer de `/platform/companies` muestra link "Ver config IA →".

### Cifrado

- Master key: `MASTER_ENCRYPTION_KEY` (hex 64 chars o base64 44 chars).
- Algoritmo: AES-256-GCM, IV 12 bytes aleatorio, authTag 16 bytes concatenado.
- Formato: `base64url(iv | tag | ciphertext)`.
- En logs/audit, solo persiste `api_key_last4` y `fingerprint` (sha256).

### Pendientes / ideas

- [ ] Pricing por modelo: hoy `cost_usd = 0`. Sumar tabla `model_pricing`.
- [ ] Rate limit por empresa (`rpmLimit`/`tpmLimit`) — el factory los lee
      pero `lib/ai/rate-limit.ts` no los aplica todavía.
- [ ] Editor de submódulos en /platform/modules/:id.
- [ ] Soporte real para `openai` y `anthropic` (clientes SDK).
