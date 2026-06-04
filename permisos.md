# Sistema de permisos granulares — Mira / ApliSmart Motors
### Versión 2 — Revisada con arquitectura real del proyecto

## Índice

1. [Dónde estamos ahora](#1-donde-estamos-ahora)
2. [Qué queremos lograr](#2-que-queremos-lograr)
3. [Arquitectura del sistema de permisos](#3-arquitectura-del-sistema-de-permisos)
4. [Estructura de datos](#4-estructura-de-datos)
5. [Cambios en la base de datos](#5-cambios-en-la-base-de-datos)
6. [Cambios en el backend](#6-cambios-en-el-backend)
7. [Cambios en el JWT](#7-cambios-en-el-jwt)
8. [Cambios en el frontend](#8-cambios-en-el-frontend)
9. [Flujo completo de asignación de permisos](#9-flujo-completo-de-asignacion-de-permisos)
10. [Archivos a modificar — resumen](#10-archivos-a-modificar--resumen)
11. [Orden de implementación](#11-orden-de-implementacion)

---

## 1. Dónde estamos ahora

### Estado tras la Fase 1 (completada)

Los siguientes cambios ya están aplicados y funcionando:

| Archivo | Cambio aplicado |
|---------|----------------|
| `middlewares/authenticate.ts` | `modulePermissions` tipado como `ModulePermissionMap` (Record) |
| `services/auth.service.ts` | `SignTokenParams.modulePermissions` actualizado al nuevo tipo |
| `routes/auth.ts` | Lee `modulePermissions` de la nueva columna DB; incluye `companyModules` en `userOut` y en `GET /session` |
| `db/schema/platform.ts` | Columna `module_permissions jsonb` agregada a `companyUsers` |
| `context/AuthContext.tsx` | `AuthSession` tiene `companyModules`; todos los `setSession` leen el nuevo campo |
| `lib/access-control.ts` | `filterOperationalNavigation` reescrita con mapa explícito y nueva firma |
| `layout/AppSidebar.tsx` | Pasa `companyModules` a `filterOperationalNavigation` |
| `hooks/usePermissions.ts` | Hook creado con `can()` y `actionsFor()` |

### Estructura de permisos que ya existe en el frontend

El proyecto ya tenía un sistema de permisos granulares construido en `lib/module-tree.ts` con la siguiente estructura:

```typescript
// lib/module-tree.ts
export const MODULE_TREE = {
  dashboard:    { label: "Dashboard",       submodules: { dashboard: "Dashboard" } },
  gestion:      { label: "Gestión",         submodules: { flotas, conductores, sedes, garajes, asignaciones, seguros } },
  motores:      { label: "Motores",         submodules: { lista_motores, mantenimientos_motor, historial_motor } },
  mantenimiento:{ label: "Mantenimiento",   submodules: { ordenes, inventario, oil } },
  checklist:    { label: "Checklist",       submodules: { checklist } },
  alertas:      { label: "Alertas",         submodules: { alertas } },
  reportes:     { label: "Reportes",        submodules: { reportes } },
  combustible:  { label: "Combustible",     submodules: { combustible } },
  geolocalizacion: { label: "Geolocalización", submodules: { geolocalizacion } },
  accesos:      { label: "Accesos",         submodules: { accesos: "Usuarios y roles" } },
};

export type ActionKey    = "ver" | "crear" | "editar" | "eliminar";
export type PermissionMap = Record<string, Record<string, ActionKey[]>>;
```

Y la página `pages/Accesos/Usuarios/page.tsx` ya tiene un `PermissionEditor` completo con UI de checkboxes por módulo/submódulo/acción.

### Lo que falta conectar

El sistema de UI ya existe pero no está conectado al backend ni al JWT correctamente:

- `routes/company/user.ts` guarda `permissions` dentro de `profileData` (jsonb genérico) en lugar de la nueva columna `module_permissions`
- El serializador de usuarios lee `permissions` de `profileData` en lugar de la columna dedicada
- El JWT no lleva `permissions` (el mapa granular) — solo lleva `modulePermissions` que era `string[]` y ahora es `Record`
- El hook `usePermissions.ts` usa `ActionKey` en inglés (`"read"`) pero el sistema real usa español (`"ver"`)
- Los botones/acciones en cada módulo no están conectados al hook todavía

---

## 2. Qué queremos lograr

### Visión completa

Un sistema de permisos de **dos niveles**:

**Nivel 1 — Superadmin → Empresa**

El superadmin define qué módulos tiene disponibles la empresa. Esto vive en `companies.enabledModules`. Ya funciona, no se toca.

```
Empresa "Ecuavial":
  enabledModules: ["gestion", "motores", "mantenimiento", "alertas", "checklist"]
```

**Nivel 2 — Admin empresa → Usuario**

El admin entra a `/accesos/usuarios`, selecciona un usuario, y por cada módulo + submódulo define qué acciones puede hacer:

```json
{
  "gestion": {
    "flotas":       ["ver", "editar"],
    "conductores":  ["ver"],
    "sedes":        [],
    "garajes":      ["ver"],
    "asignaciones": ["ver", "crear"],
    "seguros":      []
  },
  "motores": {
    "lista_motores":        ["ver"],
    "mantenimientos_motor": ["ver", "crear", "editar"],
    "historial_motor":      ["ver"]
  },
  "mantenimiento": {
    "ordenes":    ["ver", "crear"],
    "inventario": ["ver"],
    "oil":        ["ver"]
  }
}
```

### Qué controla cada acción

| Acción | Qué habilita en la UI |
|--------|----------------------|
| `ver` | El módulo/submódulo aparece. Puede ver listas y detalles. |
| `crear` | Aparece el botón "Nuevo ..." y puede abrir modales de creación. |
| `editar` | Aparece el botón "Editar" en tablas y vistas de detalle. |
| `eliminar` | Aparece el botón "Eliminar" y el confirm dialog. |

Sin `ver`, el módulo no aparece en el sidebar y la ruta está bloqueada en el backend.

### Regla para admins

`admin_empresa` y `owner_empresa` tienen acceso completo a todos los módulos habilitados de la empresa. Su `permissions` es `{}` y el sistema lo interpreta como "todo permitido".

---

## 3. Arquitectura del sistema de permisos

### Tipos canónicos (ya en `lib/module-tree.ts`)

```typescript
export type ModuleKey    = keyof typeof MODULE_TREE;
export type ActionKey    = "ver" | "crear" | "editar" | "eliminar";
export type PermissionMap = Record<string, Record<string, ActionKey[]>>;

// Ejemplo de un supervisor:
const permisos: PermissionMap = {
  "gestion": {
    "flotas":      ["ver", "editar"],
    "conductores": ["ver"],
  },
  "motores": {
    "lista_motores":        ["ver"],
    "mantenimientos_motor": ["ver", "crear", "editar"],
    "historial_motor":      ["ver"],
  },
};
```

### Lógica de resolución

```
¿El usuario es admin_empresa, owner_empresa o superadmin?
  → SÍ: tiene ["ver","crear","editar","eliminar"] en todo
  → NO: leer su PermissionMap del JWT (campo permissions)

¿El módulo+submódulo tiene entry en permissions?
  → SÍ: usar esa lista de acciones
  → NO: el usuario no tiene acceso
```

### Relación entre MODULE_TREE y el sidebar

El sidebar filtra por si el usuario tiene al menos `"ver"` en **algún submódulo** de ese módulo:

```typescript
// Si tiene "ver" en cualquier submódulo de "gestion" → aparece "Gestion" en sidebar
// Si no tiene "ver" en ningún submódulo de "motores" → no aparece "Motores"
```

---

## 4. Estructura de datos

### El JWT que generamos

```json
{
  "sub": "company-user-5",
  "email": "supervisor@ecuavial.com",
  "role": "supervisor",
  "scope": "operacion",
  "companyId": 1,
  "companyModules": ["gestion", "motores", "mantenimiento", "alertas", "checklist"],
  "modulePermissions": {
    "gestion":       { "flotas": ["ver","editar"], "conductores": ["ver"] },
    "motores":       { "lista_motores": ["ver"], "mantenimientos_motor": ["ver","crear","editar"] },
    "mantenimiento": { "ordenes": ["ver","crear"], "inventario": ["ver"], "oil": ["ver"] }
  },
  "permissions": {}
}
```

> **Nota:** En el JWT el campo se llama `modulePermissions` y es de tipo `PermissionMap` (`Record<string, Record<string, ActionKey[]>>`). El campo `permissions` queda vacío `{}` y se puede deprecar a futuro.

### La columna en DB

```sql
-- Ya aplicada en Fase 1
ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS module_permissions jsonb NOT NULL DEFAULT '{}';
```

Estructura que guarda:

```json
{
  "gestion": {
    "flotas":      ["ver", "editar"],
    "conductores": ["ver"]
  },
  "motores": {
    "lista_motores": ["ver"]
  }
}
```

Para admins, queda `{}` → sistema interpreta como acceso completo.

---

## 5. Cambios en la base de datos

### ✅ Ya aplicado — `db/schema/platform.ts`

```typescript
export const companyUsers = pgTable('company_users', {
  // ...todo lo existente...
  profileData:       jsonb('profile_data').notNull().default({}),       // solo firstName, lastName, etc.
  modulePermissions: jsonb('module_permissions').notNull().default({}), // ← columna de permisos granulares
  // ...
});
```

La migración SQL ya fue corrida. No hay nada más que hacer en la DB.

---

## 6. Cambios en el backend

### 6.1 `middlewares/authenticate.ts` — ✅ Ya aplicado

```typescript
export type CrudAction = "create" | "read" | "update" | "delete"; // interno, no se usa en permisos
export type ModulePermissionMap = Record<string, Record<string, string[]>>; // PermissionMap del JWT
export type PermissionMap = Record<string, unknown>;

export interface JwtPayload {
  // ...
  companyModules:    string[];
  modulePermissions: ModulePermissionMap;  // ← es el PermissionMap granular
  permissions:       PermissionMap;        // vacío, deprecado
}
```

### 6.2 `services/auth.service.ts` — ✅ Ya aplicado

```typescript
interface SignTokenParams {
  // ...
  modulePermissions: ModulePermissionMap;
}
```

### 6.3 `routes/auth.ts` — ✅ Ya aplicado

Lee `user.modulePermissions` de la columna nueva. Incluye `companyModules` en `userOut` y en `GET /session`.

### 6.4 `routes/company/user.ts` — ⚠️ Pendiente

**Problema actual:** el router guarda y lee `permissions` desde `profileData` (jsonb genérico). Hay que migrarlo a la columna `module_permissions`.

**Cambios necesarios:**

**Serializador — leer de la columna nueva:**

```typescript
function serializeUser(u: typeof companyUsers.$inferSelect) {
  const profile = (u.profileData as Record<string, unknown>) ?? {};
  return {
    id:                toId('company-user', u.id),
    companyId:         toId('company', u.companyId),
    email:             u.email,
    username:          u.username,
    role:              u.role,
    status:            u.status,
    modulePermissions: (u.modulePermissions as Record<string, Record<string, string[]>>) ?? {}, // ← columna nueva
    permissions:       {},  // deprecado, vacío siempre
    profileData:       profile,
    createdAt:         u.createdAt,
    updatedAt:         u.updatedAt,
  };
}
```

**Schema de validación — actualizar `modulePermissions`:**

```typescript
const createCompanyUserSchema = z.object({
  email:             z.string().email(),
  username:          z.string().min(3),
  password:          z.string().min(8),
  role:              z.enum(COMPANY_ROLES),
  status:            z.enum(['active', 'inactive']).default('active'),
  modulePermissions: z.record(                          // ← Record<string, Record<string, string[]>>
    z.string(),
    z.record(z.string(), z.array(z.enum(["ver","crear","editar","eliminar"])))
  ).default({}),
  profileData: z.record(z.string(), z.unknown()).default({}),
});
```

**POST — guardar en columna nueva:**

```typescript
// Antes guardaba en profileData. Ahora:
const [created] = await db
  .insert(companyUsers)
  .values({
    companyId,
    email:             rest.email,
    username:          rest.username,
    passwordHash,
    role:              rest.role,
    status:            rest.status,
    modulePermissions: body.modulePermissions ?? {},   // ← columna dedicada
    profileData:       body.profileData ?? {},          // ← solo datos de perfil
  })
  .returning();
```

**PUT — actualizar columna nueva:**

```typescript
const updateData: Record<string, unknown> = {
  ...rest,
  updatedAt: new Date(),
};

if (password) {
  updateData.passwordHash = await hashPassword(password);
}

if (body.modulePermissions !== undefined) {
  updateData.modulePermissions = body.modulePermissions;  // ← directo a la columna
}

if (body.profileData !== undefined) {
  const currentProfile = (existing[0].profileData as Record<string, unknown>) ?? {};
  updateData.profileData = { ...currentProfile, ...body.profileData };
}
```

**Nuevo endpoint `PUT /:userId/permissions`** — para asignar permisos sin tocar el resto del usuario:

```typescript
const permissionsSchema = z.object({
  modulePermissions: z.record(
    z.string(),
    z.record(z.string(), z.array(z.enum(["ver","crear","editar","eliminar"])))
  ),
});

router.put(
  '/:userId/permissions',
  requireAdmin,
  validate(permissionsSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.params.userId);
      const { modulePermissions } = req.body;

      const existing = await db
        .select()
        .from(companyUsers)
        .where(and(eq(companyUsers.id, userId), eq(companyUsers.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Usuario', req.params.userId);

      const [updated] = await db
        .update(companyUsers)
        .set({ modulePermissions, updatedAt: new Date() })
        .where(and(eq(companyUsers.id, userId), eq(companyUsers.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity:      'company_users',
        entityId:    toId('company-user', updated.id),
        action:      'update',
        actorId:     req.user!.sub,
        actorName:   req.user!.name,
        description: `Permisos de "${updated.email}" actualizados.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);
```

### 6.5 `middlewares/requirePermission.ts` — ⚠️ Pendiente

Actualizar para la nueva estructura anidada:

```typescript
import type { ActionKey } from '../../../frontend/src/lib/module-tree'; // o redefinir el tipo aquí

export function requirePermission(module: string, submodule: string, action: "ver" | "crear" | "editar" | "eliminar") {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return res.status(401).json({ message: "No autenticado" });

    const isAdmin = ["owner_empresa", "admin_empresa", "superadmin"].includes(user.role);
    if (isAdmin) return next();

    const perms = (user.modulePermissions as Record<string, Record<string, string[]>>) ?? {};
    const subPerms = perms[module]?.[submodule] ?? [];

    if (!subPerms.includes(action)) {
      return res.status(403).json({
        message: `Sin permiso para ${action} en ${module}/${submodule}`,
      });
    }

    next();
  };
}
```

Uso en rutas:

```typescript
// Solo puede ver lista de motores
router.get("/", authenticate, requirePermission("motores", "lista_motores", "ver"), handler);

// Solo puede crear mantenimientos de motor
router.post("/", authenticate, requirePermission("motores", "mantenimientos_motor", "crear"), handler);
```

---

## 7. Cambios en el JWT

### Por qué es seguro

El JWT está firmado con `JWT_SECRET`. Cualquier modificación del payload invalida la firma — `verifyToken` lo rechaza. El cliente no puede falsificar permisos.

### Qué lleva el JWT

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `companyModules` | `string[]` | Módulos habilitados por la empresa. Controla el sidebar para admins. |
| `modulePermissions` | `PermissionMap` | Permisos granulares por módulo/submódulo/acción. Controla botones y endpoints. |

### Consideración de tamaño

Una empresa con 10 módulos y 3 submódulos promedio cada uno = ~30 entradas en `modulePermissions`. Con 4 acciones posibles, el payload crece ~800 bytes en el peor caso. Completamente aceptable para un JWT.

### Actualización de permisos

Si el admin cambia los permisos de un usuario, el JWT viejo sigue siendo válido hasta que expire. Para minimizar el impacto: configurar `sessionExpiryHours` a 8h en `platform_settings`. El usuario ve los nuevos permisos en su próximo login.

---

## 8. Cambios en el frontend

### 8.1 `context/AuthContext.tsx` — ✅ Ya aplicado

```typescript
export type AuthSession = {
  // ...
  companyModules:    string[];
  modulePermissions: Record<string, Record<string, string[]>>;  // PermissionMap
  // ...
};
```

### 8.2 `hooks/usePermissions.ts` — ⚠️ Corregir

El hook fue creado en Fase 2 con `ActionKey` en inglés. Hay que corregirlo para usar el español que define `module-tree.ts`:

```typescript
import { useAuth } from "../context/AuthContext";
import type { ActionKey, PermissionMap } from "../lib/module-tree";

const ADMIN_ROLES = ["owner_empresa", "admin_empresa", "superadmin"];

export function usePermissions() {
  const { session } = useAuth();

  /**
   * Verifica si el usuario puede realizar una acción en un módulo/submódulo.
   *
   * Ejemplos:
   *   can("motores", "lista_motores", "ver")        → ¿puede ver la lista?
   *   can("motores", "mantenimientos_motor", "crear") → ¿puede crear mantenimientos?
   *   can("gestion", "flotas", "eliminar")           → ¿puede eliminar flotas?
   */
  function can(module: string, submodule: string, action: ActionKey): boolean {
    if (!session) return false;

    if (ADMIN_ROLES.includes(session.role)) {
      // Admins tienen todo en módulos habilitados de la empresa
      return session.companyModules.includes(module) ||
        ["dashboard", "accesos"].includes(module);
    }

    const perms = session.modulePermissions as PermissionMap;
    const subPerms = perms[module]?.[submodule] ?? [];
    return subPerms.includes(action);
  }

  /**
   * Verifica si el usuario puede ver al menos un submódulo de un módulo.
   * Usado por el sidebar para decidir si mostrar la sección.
   */
  function canSeeModule(module: string): boolean {
    if (!session) return false;

    if (ADMIN_ROLES.includes(session.role)) {
      return session.companyModules.includes(module) ||
        ["dashboard", "accesos"].includes(module);
    }

    const perms = session.modulePermissions as PermissionMap;
    const modulePerm = perms[module] ?? {};
    return Object.values(modulePerm).some((actions) => actions.includes("ver"));
  }

  /**
   * Devuelve las acciones que el usuario puede hacer en un submódulo.
   */
  function actionsFor(module: string, submodule: string): ActionKey[] {
    if (!session) return [];

    if (ADMIN_ROLES.includes(session.role)) {
      return ["ver", "crear", "editar", "eliminar"];
    }

    const perms = session.modulePermissions as PermissionMap;
    return (perms[module]?.[submodule] ?? []) as ActionKey[];
  }

  return { can, canSeeModule, actionsFor };
}
```

### 8.3 `lib/access-control.ts` — ✅ Ya aplicado (pero revisar)

La función `filterOperationalNavigation` ya fue reescrita. Verificar que el matching de `sectionKey` sea correcto para todos los módulos del `MODULE_TREE`:

```typescript
const SECTION_MODULE_MAP: Record<string, string[]> = {
  "dashboard":            ["dashboard"],
  "accesos":              ["accesos"],
  "gestion":              ["gestion"],          // cubre flotas, conductores, sedes, garajes, etc.
  "motores":              ["motores"],
  "generadores":          ["generadores"],
  "aires_acondicionados": ["ac"],
  "mantenimiento":        ["mantenimiento"],     // cubre ordenes, inventario, oil
  "checklist":            ["checklist"],
  "alertas":              ["alertas"],
  "reportes":             ["reportes"],
  "combustible":          ["combustible"],
  "geolocalizacion":      ["geolocalizacion"],
  "cuenta":               [],
};
```

Para roles que no son admin, el filtro debe verificar si tiene `"ver"` en **algún submódulo** del módulo:

```typescript
// Otros roles: necesitan "ver" en al menos un submódulo
const allowed = mappedKeys.some((key) => {
  const modulePerm = modulePermissions[key] ?? {};
  return Object.values(modulePerm).some((actions) =>
    (actions as string[]).includes("ver")
  );
});
```

### 8.4 `pages/Accesos/Usuarios/page.tsx` — ⚠️ Parcialmente pendiente

La UI del `PermissionEditor` ya está construida y funciona. Lo que falta:

**En `formToCreateInput` y `formToUpdateInput`** — enviar `modulePermissions` en lugar de `permissions`:

```typescript
function formToCreateInput(form: UserFormState): CreateCompanyUserInput {
  return {
    email:             form.email.trim().toLowerCase(),
    username:          form.username.trim().toLowerCase(),
    password:          form.password,
    role:              form.role,
    status:            form.status,
    modulePermissions: form.permissions,   // ← el form usa "permissions" internamente, se mapea a modulePermissions
    profileData: {
      fullName:       form.fullName.trim(),
      lastName:       form.lastName.trim(),
      phone:          form.phone.trim(),
      site:           form.site.trim(),
      area:           form.area.trim(),
      documentNumber: form.documentNumber.trim(),
      notes:          form.notes.trim(),
    },
  };
}
```

**En `userToForm`** — leer de `modulePermissions` en lugar de `permissions`:

```typescript
function userToForm(user: CompanyUser): UserFormState {
  const p = user.profileData;
  return {
    // ...
    permissions: Object.keys(user.modulePermissions).length > 0
      ? user.modulePermissions
      : ROLE_DEFAULT_PERMISSIONS[user.role] ?? {},
    // ...
  };
}
```

**En `serializeUser` del hook** — asegurarse que `useCompanyUsers` expone `modulePermissions`:

```typescript
// hooks/useCompanyUsers.ts — el tipo CompanyUser debe tener:
export type CompanyUser = {
  id: string;
  // ...
  modulePermissions: PermissionMap;   // ← en lugar de permissions
  permissions: Record<string, unknown>; // deprecado, siempre {}
  // ...
};
```

### 8.5 Uso en cada página/módulo — ⚠️ Pendiente (Fase 4)

Patrón estándar para cada módulo. Siempre usar `can(módulo, submódulo, acción)`:

```tsx
import { usePermissions } from "../../hooks/usePermissions";

export function MotorsPage() {
  const { can } = usePermissions();

  return (
    <div>
      <ModulePageHeader
        action={
          can("motores", "lista_motores", "crear") ? (
            <button onClick={() => setShowModal(true)}>Nuevo motor</button>
          ) : null
        }
      />

      {/* En RowActions */}
      <RowActions
        motor={motor}
        canEdit={can("motores", "lista_motores", "editar")}
        canDelete={can("motores", "lista_motores", "eliminar")}
      />
    </div>
  );
}
```

**Mapa de módulo+submódulo por página:**

| Página | Módulo | Submódulo |
|--------|--------|-----------|
| `/motores` | `motores` | `lista_motores` |
| `/motores/mantenimientos` | `motores` | `mantenimientos_motor` |
| `/motores/historial` | `motores` | `historial_motor` |
| `/flotas` | `gestion` | `flotas` |
| `/operaciones/conductores` | `gestion` | `conductores` |
| `/gestion/sedes` | `gestion` | `sedes` |
| `/gestion/garajes` | `gestion` | `garajes` |
| `/operaciones/asignaciones` | `gestion` | `asignaciones` |
| `/gestion/seguros` | `gestion` | `seguros` |
| `/mantenimiento` | `mantenimiento` | `ordenes` |
| `/mantenimiento/inventario` | `mantenimiento` | `inventario` |
| `/mantenimiento/verificacion-aceite` | `mantenimiento` | `oil` |
| `/checklist` | `checklist` | `checklist` |
| `/alertas` | `alertas` | `alertas` |
| `/reportes` | `reportes` | `reportes` |
| `/combustible` | `combustible` | `combustible` |
| `/geolocalizacion` | `geolocalizacion` | `geolocalizacion` |
| `/accesos/usuarios` | `accesos` | `accesos` |
| `/accesos/roles` | `accesos` | `accesos` |

---

## 9. Flujo completo de asignación de permisos

### Flujo 1 — Superadmin habilita módulos a empresa

```
[Superadmin en /platform/companies]
  → Empresa "Ecuavial" → editar módulos
  → Selecciona: ["gestion", "motores", "mantenimiento", "alertas", "checklist"]
  → companies.enabled_modules = '["gestion","motores","mantenimiento","alertas","checklist"]'
```

### Flujo 2 — Admin empresa configura permisos a supervisor

```
[Admin en /accesos/usuarios]
  → Crea "supervisor_juan" con rol "supervisor"
  → En el PermissionEditor configura:

     Gestión:
       Flotas:           [ver, editar]
       Conductores:      [ver]
       Sedes:            []
       Garajes:          [ver]
       Asignaciones:     [ver, crear]
       Seguros:          []

     Motores:
       Lista de motores:        [ver]
       Mantenimientos de motor: [ver, crear, editar]
       Historial de motor:      [ver]

     Mantenimiento:
       Órdenes:    [ver, crear]
       Inventario: [ver]
       Aceites:    [ver]

  → POST /api/company/:id/users con body:
    {
      "modulePermissions": {
        "gestion": {
          "flotas": ["ver","editar"],
          "conductores": ["ver"],
          "garajes": ["ver"],
          "asignaciones": ["ver","crear"]
        },
        "motores": {
          "lista_motores": ["ver"],
          "mantenimientos_motor": ["ver","crear","editar"],
          "historial_motor": ["ver"]
        },
        "mantenimiento": {
          "ordenes": ["ver","crear"],
          "inventario": ["ver"],
          "oil": ["ver"]
        }
      }
    }

  → DB: company_users.module_permissions = { ... }
```

### Flujo 3 — Supervisor hace login

```
[POST /api/auth/login scope: operacion]

[Backend]
  user.role = "supervisor"
  user.modulePermissions = { gestion: { flotas: ["ver","editar"], ... }, ... }  ← columna nueva
  user.company.enabledModules = ["gestion","motores","mantenimiento","alertas","checklist"]

[JWT generado]
  {
    "role": "supervisor",
    "companyModules": ["gestion","motores","mantenimiento","alertas","checklist"],
    "modulePermissions": {
      "gestion": { "flotas": ["ver","editar"], "conductores": ["ver"], ... },
      "motores": { "lista_motores": ["ver"], "mantenimientos_motor": ["ver","crear","editar"], ... },
      "mantenimiento": { "ordenes": ["ver","crear"], "inventario": ["ver"], "oil": ["ver"] }
    }
  }

[Sidebar filtra]
  Dashboard       → siempre visible ✅
  Gestión         → tiene "ver" en flotas y conductores ✅
  Motores         → tiene "ver" en lista_motores ✅
  Mantenimiento   → tiene "ver" en ordenes, inventario, oil ✅
  Alertas         → NO está en modulePermissions ❌
  Checklist       → NO está en modulePermissions ❌
  Cuenta          → siempre visible ✅

[En página /motores]
  can("motores", "lista_motores", "crear")   → false → botón "Nuevo motor" oculto
  can("motores", "lista_motores", "editar")  → false → botón "Editar" oculto
  can("motores", "lista_motores", "eliminar")→ false → botón "Eliminar" oculto
  can("motores", "lista_motores", "ver")     → true  → ve la lista ✅

[En página /motores/mantenimientos]
  can("motores", "mantenimientos_motor", "ver")   → true  ✅
  can("motores", "mantenimientos_motor", "crear") → true  → puede crear ✅
  can("motores", "mantenimientos_motor", "editar")→ true  → puede editar ✅
  can("motores", "mantenimientos_motor", "eliminar")→ false → no puede eliminar ❌

[En /flotas]
  can("gestion", "flotas", "ver")     → true  ✅
  can("gestion", "flotas", "editar")  → true  → puede editar ✅
  can("gestion", "flotas", "crear")   → false → botón "Nueva flota" oculto ❌
  can("gestion", "flotas", "eliminar")→ false → no puede eliminar ❌
```

### Flujo 4 — Backend valida en cada endpoint

```
[GET /api/company/assets]
  requirePermission("gestion", "flotas", "ver") → ok ✅

[POST /api/company/assets]
  requirePermission("gestion", "flotas", "crear") → 403 ❌
  "Sin permiso para crear en gestion/flotas"

[PUT /api/company/assets/:id]
  requirePermission("gestion", "flotas", "editar") → ok ✅
```

---

## 10. Archivos a modificar — resumen

### Backend

| Archivo | Estado | Qué cambia |
|---------|--------|-----------|
| `db/schema/platform.ts` | ✅ Hecho | Columna `module_permissions` agregada |
| `middlewares/authenticate.ts` | ✅ Hecho | Tipo `ModulePermissionMap` correcto |
| `services/auth.service.ts` | ✅ Hecho | `SignTokenParams` actualizado |
| `routes/auth.ts` | ✅ Hecho | Lee columna nueva, devuelve `companyModules` |
| `routes/company/user.ts` | ⚠️ Pendiente | Serializador y CRUD leen/escriben columna `module_permissions`; nuevo endpoint `PUT /:id/permissions` |
| `middlewares/requirePermission.ts` | ⚠️ Pendiente | Lógica con estructura anidada módulo/submódulo/acción |

### Frontend

| Archivo | Estado | Qué cambia |
|---------|--------|-----------|
| `context/AuthContext.tsx` | ✅ Hecho | `companyModules` y `modulePermissions` como Record |
| `lib/access-control.ts` | ✅ Hecho | `filterOperationalNavigation` con mapa explícito |
| `layout/AppSidebar.tsx` | ✅ Hecho | Pasa `companyModules` |
| `hooks/usePermissions.ts` | ⚠️ Corregir | Usar `ActionKey` en español (`"ver"/"crear"/...`); agregar `canSeeModule()` |
| `hooks/useCompanyUsers.ts` | ⚠️ Pendiente | Tipo `CompanyUser` con `modulePermissions: PermissionMap` |
| `pages/Accesos/Usuarios/page.tsx` | ⚠️ Pendiente | `formToCreateInput`/`formToUpdateInput`/`userToForm` usando `modulePermissions` |
| `pages/Motores/page.tsx` | ⚠️ Pendiente | `can("motores", "lista_motores", acción)` |
| `pages/Gestion/Flotas/page.tsx` | ⚠️ Pendiente | `can("gestion", "flotas", acción)` |
| `pages/Gestion/Drivers/page.tsx` | ⚠️ Pendiente | `can("gestion", "conductores", acción)` |
| `pages/Gestion/Garajes/page.tsx` | ⚠️ Pendiente | `can("gestion", "garajes", acción)` |
| `pages/Gestion/Sedes/page.tsx` | ⚠️ Pendiente | `can("gestion", "sedes", acción)` |
| `pages/Gestion/Seguros/page.tsx` | ⚠️ Pendiente | `can("gestion", "seguros", acción)` |
| `pages/Gestion/Asignaciones/page.tsx` | ⚠️ Pendiente | `can("gestion", "asignaciones", acción)` |
| `pages/Mantenimientos/page.tsx` | ⚠️ Pendiente | `can("mantenimiento", "ordenes", acción)` |
| `pages/Mantenimientos/Inventario/page.tsx` | ⚠️ Pendiente | `can("mantenimiento", "inventario", acción)` |
| `pages/Mantenimientos/Oil/page.tsx` | ⚠️ Pendiente | `can("mantenimiento", "oil", acción)` |
| `pages/Checklist/page.tsx` | ⚠️ Pendiente | `can("checklist", "checklist", acción)` |
| `pages/Alertas/page.tsx` | ⚠️ Pendiente | `can("alertas", "alertas", acción)` |
| `pages/Combustible/page.tsx` | ⚠️ Pendiente | `can("combustible", "combustible", acción)` |

---

## 11. Orden de implementación

### ✅ Fase 1 — Fix sidebar (completada)
Migración SQL, auth routes, AuthContext, access-control, AppSidebar.

### ✅ Fase 2 — Hook usePermissions (completada, pero requiere corrección)
Corregir `ActionKey` de inglés a español y agregar `canSeeModule()`.

### Fase 3 — Conectar backend con columna nueva

1. `routes/company/user.ts` — serializador lee `module_permissions`; POST/PUT escriben a columna; agregar `PUT /:id/permissions`
2. `middlewares/requirePermission.ts` — lógica con módulo/submódulo/acción
3. `hooks/useCompanyUsers.ts` — tipo `CompanyUser` con `modulePermissions`
4. `pages/Accesos/Usuarios/page.tsx` — `formToCreateInput`, `formToUpdateInput`, `userToForm`

### Fase 4 — Granularidad en cada módulo

En cada página, mismo patrón:

```tsx
const { can } = usePermissions();

// Botón de creación
{can("módulo", "submódulo", "crear") && <button>Nuevo...</button>}

// RowActions
canEdit={can("módulo", "submódulo", "editar")}
canDelete={can("módulo", "submódulo", "eliminar")}
```

Orden sugerido por impacto: Motores → Flotas → Conductores → Mantenimiento → Inventario → Checklist → Alertas → Combustible → Garajes → Sedes → Seguros → Asignaciones.