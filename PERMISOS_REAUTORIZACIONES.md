# Permisos de reautorización de mantenimiento

> Generado 2026-07-04 por el fix del flujo de reautorizaciones.

## Permisos involucrados

| Permiso | Path | Quién lo necesita |
|---|---|---|
| `mantenimiento.reautorizaciones.ver` | Bandeja / Mis solicitudes / Reporte | Todos los que quieran ver |
| `mantenimiento.reautorizaciones.editar` | Aprobar / Rechazar | Admin, owner, supervisor |

## ⚠️ Importante: override per-user gana sobre el rol

En `apps/backend/src/routes/company/roles.ts` la regla es:

```ts
// Si el usuario tiene CUALQUIER submódulo con acciones en module_permissions,
// ESE override manda completamente. NO se mergea con el rol.
const hasUserOverride = ...;
if (hasUserOverride) {
  return { ...perUserOverride };   // ← gana el override
}
```

**Implicancia práctica**: si tu usuario actual ya tiene `module_permissions` con un solo submódulo seteado (ej. `checklist.checklist: ["ver"]`), está en modo override y **NO hereda los permisos nuevos de la migración**, ni siquiera los `mantenimiento.*` o `gestion.*` que su rol tiene sembrados.

## Tres escenarios posibles

### 1. Tu usuario NO tiene override

Tiene `modulePermissions = {}` o `null` → hereda 100% del rol.

- Si rol = `operador` o `conductor` o `supervisor` → la migración 0039 ya le puso `mantenimiento.reautorizaciones: ["ver"]`. **Debería ver el tab.**
- Si rol = `owner_empresa`/`admin_empresa`/`superadmin` → bypass automático, no necesita permiso granular.

### 2. Tu usuario SÍ tiene override (lo más común tras un tiempo)

Cualquier valor en `module_permissions` lo activa. Aunque hayas editado el rol antes, tu usuario sigue con la copia vieja.

**Cómo diagnosticar**:

```sql
SELECT id, email, role,
       jsonb_pretty(module_permissions::jsonb) AS perms,
       module_permissions = '{}'::jsonb AS is_empty,
       module_permissions IS NULL AS is_null
  FROM company_users
 WHERE email = 'tu@email.com';
```

Si `is_empty = false` y `is_null = false` pero `perms` tiene algo → está en override.

**Cómo arreglarlo sin tocar el resto del override**:

Tienes dos caminos:

- **(A) Editar el rol en la UI** (Accesos → Roles → operador) y tildar manualmente "Mantenimiento › Reautorizaciones › Ver" tanto en la columna de permisos del rol como en cada usuario que hereda — el editor ya hace override merge en este caso. Recomiendo hacerlo desde la UI porque queda registrado en la pantalla.

- **(B) SQL directo**: Patchear SOLO la key que falta en `company_users.module_permissions` sin tocar el resto:

```sql
UPDATE company_users
   SET module_permissions = jsonb_set(
         module_permissions,
         '{mantenimiento,reautorizaciones}',
         '["ver"]'::jsonb,
         true            -- create_if_missing
       )
 WHERE email = 'tu@email.com'
   AND NOT (module_permissions #> '{mantenimiento,reautorizaciones}' IS NOT NULL);
```

El `create_if_missing=true` y el `WHERE NOT ... IS NOT NULL` lo hacen idempotente — solo agrega la key si no estaba.

Para aprobar/rechazar (no solo ver):

```sql
UPDATE company_users
   SET module_permissions = jsonb_set(
         module_permissions,
         '{mantenimiento,reautorizaciones}',
         '["ver","editar"]'::jsonb,
         true
       )
 WHERE email = 'admin@tuempresa.com'
   AND NOT (module_permissions #> '{mantenimiento,reautorizaciones}' IS NOT NULL);
```

## Cómo verificar visualmente

1. Login con tu usuario.
2. Ir a Mantenimiento.
3. ¿Aparece el tab "Reautorizaciones" o "Mis solicitudes"?

- **Sí** → todo OK.
- **No** → falta el permiso `ver` (escenario 2).

## También relevante

- El **endpoint viejo `POST /:id/reauthorize`** (sin guion, el que ya existía como atajo de admin) sigue activo. Como atajo, solo accesible con `mantenimiento.execution.editar` — sin necesidad del permiso de reautorizaciones. Es la vía rápida que tenías antes para el admin.

- El **flujo nuevo `request` → `approve`/`deny`** requiere `mantenimiento.reautorizaciones.{ver,editar}`. Los roles default ya las tienen sembrados en la migración 0039.
