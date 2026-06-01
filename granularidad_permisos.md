# Contexto del proyecto: Sistema de permisos granulares por submódulo

## 1. Stack y estructura general

**Frontend:** React + TypeScript + Vite + Tailwind CSS + Framer Motion + Sonner (toasts)  
**Backend:** Express + TypeScript + Drizzle ORM + PostgreSQL + JWT (cookie httpOnly)  
**Patrón de autenticación:** Cookie `aplismart_token` con JWT que contiene rol, companyId, módulos contratados y permisos del usuario

---

## 2. Estado actual del sistema de permisos

### JWT payload actual (`JwtPayload`)

```typescript
interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  scope: 'operacion' | 'plataforma';
  companyId: number | null;
  companyModules: string[];      // módulos contratados por la empresa
  modulePermissions: string[];   // módulos a los que tiene acceso el usuario
  iat: number;
  exp: number;
}
```

### Middlewares existentes

**`authenticate.ts`** — verifica JWT desde cookie o header Authorization, inyecta `req.user`

**`requireAdmin.ts`** — permite solo `owner_empresa`, `admin_empresa`, `superadmin`

**`requireModule.ts`** — lógica actual:
1. `superadmin` pasa siempre
2. Verifica que `companyModules` incluya el módulo (módulo contratado por empresa)
3. `owner_empresa` y `admin_empresa` pasan sin verificar permisos individuales
4. Verifica que `modulePermissions` del usuario incluya el módulo

### Esquema de BD relevante (`platform.ts`)

```typescript
export const companyUsers = pgTable('company_users', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull(),
  email: varchar('email', { length: 160 }).notNull(),
  username: varchar('username', { length: 80 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 40 }).notNull(),
  status: varchar('status', { length: 40 }).notNull().default('active'),
  profileData: jsonb('profile_data').notNull().default({}),  // ← aquí vive todo
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

`profileData` es un `jsonb` libre. Actualmente guarda:
```json
{
  "fullName": "...",
  "lastName": "...",
  "phone": "...",
  "site": "...",
  "area": "...",
  "documentNumber": "...",
  "notes": "...",
  "modulePermissions": ["dashboard", "mantenimiento", "checklist"]
}
```

---

## 3. Lo que hay que construir: permisos granulares por submódulo

### 3.1 Nuevo modelo de permisos

Reemplazar `modulePermissions: string[]` por `permissions` con estructura anidada:

```json
{
  "permissions": {
    "gestion": {
      "flotas":               ["ver", "crear", "editar", "eliminar"],
      "conductores":          ["ver", "crear"],
      "sedes":                ["ver"],
      "garajes":              ["ver", "crear", "editar"],
      "asignaciones":         ["ver"],
      "seguros":              ["ver", "crear", "eliminar"]
    },
    "motores": {
      "lista_motores":        ["ver", "editar"],
      "mantenimientos_motor": ["ver", "crear"],
      "historial_motor":      ["ver"]
    },
    "mantenimiento": {
      "ordenes":              ["ver", "crear", "editar"],
      "inventario":           ["ver"],
      "oil":                  []
    },
    "checklist":   { "checklist": ["ver", "crear"] },
    "alertas":     { "alertas":   ["ver"] },
    "reportes":    { "reportes":  ["ver"] },
    "combustible": { "combustible": ["ver", "crear"] },
    "dashboard":   { "dashboard": ["ver"] },
    "accesos":     { "accesos":   ["ver", "crear", "editar", "eliminar"] }
  }
}
```

### 3.2 Mapa completo de módulos y submódulos

Este es el árbol canónico que debe usarse en frontend, backend y BD. Coincide exactamente con el sidebar de la app:

```typescript
export const MODULE_TREE = {
  dashboard:     { label: "Dashboard",     submodules: { dashboard:              "Dashboard" } },
  gestion: {
    label: "Gestión",
    submodules: {
      flotas:           "Flotas",
      conductores:      "Conductores",
      sedes:            "Sedes",
      garajes:          "Garajes",
      asignaciones:     "Asignar vehículo",
      seguros:          "Seguros vehiculares",
    }
  },
  motores: {
    label: "Motores",
    submodules: {
      lista_motores:        "Lista de motores",
      mantenimientos_motor: "Mantenimientos de motor",
      historial_motor:      "Historial de motor",
    }
  },
  mantenimiento: {
    label: "Mantenimiento",
    submodules: {
      ordenes:    "Órdenes de mantenimiento",
      inventario: "Inventario",
      oil:        "Aceites",
    }
  },
  checklist:     { label: "Checklist",       submodules: { checklist:    "Checklist" } },
  alertas:       { label: "Alertas",         submodules: { alertas:      "Alertas" } },
  reportes:      { label: "Reportes",        submodules: { reportes:     "Reportes" } },
  combustible:   { label: "Combustible",     submodules: { combustible:  "Combustible" } },
  geolocalizacion: { label: "Geolocalización", submodules: { geolocalizacion: "Geolocalización" } },
  accesos:       { label: "Accesos",         submodules: { accesos:      "Usuarios y roles" } },
} as const;

export type ModuleKey    = keyof typeof MODULE_TREE;
export type ActionKey    = "ver" | "crear" | "editar" | "eliminar";
export type PermissionMap = Record<string, Record<string, ActionKey[]>>;
```

### 3.3 Nuevo tipo `AuthSession` en el frontend

```typescript
export type AuthSession = {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  modulePermissions: string[];   // mantener por compatibilidad temporal
  permissions: PermissionMap;    // nuevo campo granular
  roleLabel: string;
  companyId: string | null;
  scope: "operacion" | "plataforma";
};
```

---

## 4. Archivos a crear o modificar

### Backend

#### CREAR: `middlewares/requirePermission.ts`

```typescript
// Uso: requirePermission('gestion', 'flotas', 'eliminar')
export const requirePermission = (
  module: string,
  submodule: string,
  action: 'ver' | 'crear' | 'editar' | 'eliminar'
) => (req, res, next) => {
  const user = req.user;
  if (!user) throw new ForbiddenError('No autenticado');

  // superadmin, owner_empresa y admin_empresa pasan siempre
  if (['superadmin', 'owner_empresa', 'admin_empresa'].includes(user.role)) return next();

  // verificar en user.permissions (viene del JWT)
  const actions = user.permissions?.[module]?.[submodule] ?? [];
  if (!actions.includes(action)) {
    throw new ForbiddenError(`Sin permiso para '${action}' en '${module}/${submodule}'`);
  }
  next();
};
```

#### MODIFICAR: `middlewares/authenticate.ts`

Agregar `permissions: PermissionMap` al `JwtPayload`:

```typescript
export interface JwtPayload {
  // ... campos existentes ...
  modulePermissions: string[];
  permissions: PermissionMap;   // ← nuevo
}
```

#### MODIFICAR: `services/auth.service.ts`

Al generar el JWT del login, leer `profileData.permissions` del usuario y meterlo en el token.

#### MODIFICAR: `routes/company/users.ts` (el que creamos)

El endpoint `POST /company/:id/users` y `PUT` deben aceptar y guardar el nuevo formato `permissions` en `profileData`.

#### MODIFICAR: `routes/company/index.ts`

Añadir el nuevo router de users:
```typescript
import usersRouter from './users';
// ...
router.use('/users', usersRouter);
```

(Actualmente no está registrado — hay un `user.ts` pero no está en el index.)

### Frontend

#### CREAR: `lib/permissions.ts`

Helper central para consultar permisos en componentes:

```typescript
import type { AuthSession } from '@/context/AuthContext';

export function can(
  session: AuthSession | null,
  module: string,
  submodule: string,
  action: 'ver' | 'crear' | 'editar' | 'eliminar'
): boolean {
  if (!session) return false;
  // admin y owner siempre pueden todo
  if (['owner_empresa', 'admin_empresa', 'superadmin'].includes(session.role)) return true;
  return session.permissions?.[module]?.[submodule]?.includes(action) ?? false;
}

// Ejemplo de uso en componente:
// const canDelete = can(session, 'gestion', 'flotas', 'eliminar');
```

#### CREAR: `lib/module-tree.ts`

El `MODULE_TREE` canónico definido en 3.2 — fuente única de verdad compartida por `RolesPage`, `UsersPage` y el futuro editor de permisos.

#### MODIFICAR: `context/AuthContext.tsx`

Añadir `permissions` al tipo `AuthSession` y al mapeo de la respuesta del servidor:

```typescript
setSession({
  ...data,
  modulePermissions: data.modulePermissions ?? [],
  permissions: data.permissions ?? {},      // ← nuevo
  roleLabel: roleLabelMap[data.role] ?? data.role,
});
```

#### MODIFICAR: `hooks/useCompanyUsers.ts`

`CompanyUser` debe exponer `permissions: PermissionMap` además de `modulePermissions`.

#### REESCRIBIR: `pages/Accesos/RolesPage.tsx`

Diseño nuevo — ver sección 5.

#### REESCRIBIR: `pages/Accesos/UsersPage.tsx`

El modal de usuario debe incluir el editor de permisos granulares en lugar del grid de checkboxes plano actual.

---

## 5. Diseño de la UI — RolesPage

### Principios de diseño (los mismos que SitesManagementPage y InsurancePage)

- Self-contained: cero imports de providers externos (`useFeedback`, `usePlatform`, etc.)
- Toast de Sonner para feedback
- `useAuth` de `@/context/AuthContext`
- Framer Motion para modales y drawers
- Tailwind puro, dark mode con clases `dark:`
- Sin emojis en ningún punto de la UI
- Sin bullets ni listas en texto de UI
- Colores de acento: azul para acciones primarias, rojo para destructivas, verde para estados activos

### Layout propuesto

```
┌─────────────────────────────────────────────────────────┐
│  Page header: "Roles y permisos"  [badge: Accesos]      │
├──────────────┬──────────────────────────────────────────┤
│              │  PANEL DERECHO                           │
│  LISTA DE    │  ┌────────────────────────────────────┐  │
│  ROLES       │  │  Nombre del rol  [badge nivel]     │  │
│              │  │  Descripción                       │  │
│  [Supervisor]│  ├────────────────────────────────────┤  │
│  [Conductor] │  │  EDITOR DE PERMISOS                │  │
│  [Operador]  │  │                                    │  │
│  ...         │  │  ▼ Gestión              [todos/ninguno] │
│              │  │    Flotas        [V][C][E][X]      │  │
│              │  │    Conductores   [V][ ][ ][ ]      │  │
│              │  │    Sedes         [V][C][E][ ]      │  │
│              │  │    Seguros       [V][C][ ][X]      │  │
│              │  │                                    │  │
│              │  │  ▼ Motores              [todos/ninguno] │
│              │  │    Lista motores  [V][ ][E][ ]     │  │
│              │  │    Mantenimientos [V][C][ ][ ]     │  │
│              │  │    Historial      [V][ ][ ][ ]     │  │
│              │  │                                    │  │
│              │  │  [Guardar plantilla]               │  │
│              │  └────────────────────────────────────┘  │
└──────────────┴──────────────────────────────────────────┘
```

### Comportamiento del editor de permisos

- Cada módulo es un acordeón colapsable (por defecto expandido)
- Cada submódulo tiene 4 toggles: **Ver / Crear / Editar / Eliminar**
- Los toggles son pills/chips clicables, no checkboxes HTML — estilo similar a los tags de módulos que ya existen
- Regla de dependencia: si desmarcas "Ver", se desmarcan automáticamente Crear, Editar y Eliminar
- Regla inversa: si marcas Crear/Editar/Eliminar y Ver no está marcado, se activa Ver automáticamente
- Header de cada módulo tiene "Seleccionar todos" y "Quitar todos" para ese módulo completo
- Los cambios son locales hasta presionar "Guardar plantilla" (guarda en localStorage igual que antes)
- Sección de roles de plataforma al final — solo lectura, sin editor

### Componente de toggle de acción

Cada acción (Ver/Crear/Editar/Eliminar) se renderiza así:

```
┌─────────────┐    activo:   bg azul, texto blanco, borde azul
│     Ver     │    inactivo: bg gris oscuro, texto gris, borde sutil
└─────────────┘
```

Colores por acción:
- **Ver**: azul `blue-600`
- **Crear**: verde `green-600`  
- **Editar**: amarillo/ámbar `amber-500`
- **Eliminar**: rojo `red-600`

---

## 6. Diseño de la UI — UsersPage (modal de permisos)

El modal de crear/editar usuario reemplaza el grid plano de checkboxes de módulos por el mismo editor granular de RolesPage, pero en versión compacta dentro del modal.

Al cambiar el rol del usuario, los permisos se auto-rellenan desde la plantilla del rol (igual que antes, pero ahora con la estructura anidada).

---

## 7. Flujo completo de datos

```
[RolesPage]
    └── guarda plantilla en localStorage
            └── cuando se crea usuario en UsersPage,
                los permisos se pre-cargan desde la plantilla del rol
                    └── POST /api/company/:id/users
                            └── profileData.permissions = { ... }
                                    └── al hacer login,
                                        auth.service lee profileData.permissions
                                            └── lo incluye en el JWT
                                                    └── authenticate.ts lo pone en req.user
                                                            └── requirePermission middleware lo usa
                                                                    └── frontend lo lee de session.permissions
```

---

## 8. Compatibilidad con sistema actual

- `modulePermissions: string[]` se mantiene en el JWT y en `AuthSession` — no romper nada existente
- `requireModule` no se toca — sigue funcionando igual para los endpoints que ya lo usan
- `requirePermission` es aditivo — solo se agrega en endpoints nuevos o donde se quiera granularidad extra
- La migración es progresiva: un endpoint puede tener `requireModule('gestion')` hoy y agregar `requirePermission('gestion', 'flotas', 'eliminar')` mañana sin conflicto

---

## 9. Archivos existentes relevantes (no modificar estructura, solo extender)

| Archivo | Ruta | Notas |
|---|---|---|
| `authenticate.ts` | `middlewares/authenticate.ts` | Agregar `permissions` al `JwtPayload` |
| `requireModule.ts` | `middlewares/requireModule.ts` | No tocar — mantener compatibilidad |
| `requireAdmin.ts` | `middlewares/requireAdmin.ts` | No tocar |
| `auth.service.ts` | `services/auth.service.ts` | Leer `profileData.permissions` al generar JWT |
| `AuthContext.tsx` | `context/AuthContext.tsx` | Agregar `permissions` a `AuthSession` |
| `company/index.ts` | `routes/company/index.ts` | Registrar `usersRouter` — actualmente falta |
| `useCompanyUsers.ts` | `hooks/useCompanyUsers.ts` | Agregar `permissions` al tipo `CompanyUser` |

---

## 10. Archivos a crear desde cero

| Archivo | Ruta | Descripción |
|---|---|---|
| `requirePermission.ts` | `middlewares/requirePermission.ts` | Middleware granular nuevo |
| `module-tree.ts` | `lib/module-tree.ts` (frontend) | Fuente única del árbol de módulos/submódulos |
| `permissions.ts` | `lib/permissions.ts` (frontend) | Helper `can()` para componentes |
| `RolesPage.tsx` | `pages/Accesos/RolesPage.tsx` | Reescritura con editor granular |
| `users.ts` | `routes/company/users.ts` | Ya creado en sesión anterior — registrar en index |

---

## 11. Lo que NO queremos en la UI

- Sin emojis en ningún punto
- Sin bullets en texto de la interfaz
- Sin componentes de providers externos: `useFeedback`, `usePlatform`, `useFleetOps`
- Sin imports de `@/components/ui/surface`, `@/components/ui/button`, `@/features/modules/module-page-header`
- Sin `StatCard`, `SurfaceCard`, `ModulePageHeader`, `Button` de la librería interna
- Todo self-contained al estilo de `SitesManagementPage.tsx` y `InsuranceManagementPage.tsx`
- Sin checkboxes HTML crudos para los permisos — usar pills/chips clicables
- Sin tablas para el editor de permisos — usar acordeones por módulo

---

## 12. Convenciones de código del proyecto

- `toast.success` / `toast.error` de `sonner` para feedback
- `AnimatePresence` + `motion.div` de `framer-motion` para modales y drawers
- `useAuth` de `@/context/AuthContext` — NO de providers alternativos
- `useSites` de `@/hooks/useSites` para catálogo de sedes
- Inputs con clase `inputCls` definida inline en cada página (no importada)
- Modales centrados con backdrop blur
- Drawers desde la derecha con `x: "100%"` a `x: 0`
- Confirmación de borrado siempre en modal separado — nunca `window.confirm`
- `dark:` classes en todos los elementos de UI