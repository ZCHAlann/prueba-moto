# API Documentation - Motors Aplismart

Documentación exhaustiva de la API REST del backend de Motors Aplismart.
Stack: **Node.js + Express + TypeScript + Zod + Drizzle ORM + PostgreSQL**.

> **Nivel de confianza**: este documento fue generado en jul 2026 y **validado
> contra el código fuente real** (spot-check de 8 secciones críticas: auth,
> mantenimientos, combustible, alertas, assets, talleres, finance-invoices,
> jarvis/AI). Los **paths y middlewares** son confiables. Los **responses
> de creación (POST)** fueron corregidos al patrón real: el backend usa
> consistentemente `201 + objeto serializado completo` (no `{ok, id}`).
> Los **request bodies** son aproximaciones a partir de los Zod schemas —
> si necesitás precisión byte a byte, abrí el archivo de ruta correspondiente.

> Formato: compacto. Cada endpoint documentado con método, ruta, descripción,
> auth, body mínimo y response mínimo. Schemas Zod referenciados, no copiados.
>
> **Convención de IDs serializados**: todos los IDs que circulan entre cliente
> y servidor tienen el formato `prefijo-numero` (ej: `asset-42`, `maintenance-100`,
> `maintenance-item-81`, `invoice-7`, `driver-15`). Esto evita confusion entre
> IDs de distintas entidades. La conversión a número entero se hace server-side
> con `parseId(prefix, id)`.
>
> **Convención de paginación**: los endpoints que devuelven listas usan
> query params `page` (1-based, default 1) y `pageSize` (default 10, cap 100) y
> devuelven el shape:
> ```json
> {
>   "data": [...],
>   "total": 123,
>   "page": 1,
>   "pageSize": 10,
>   "totalPages": 13
> }
> ```
>
> **Convención de responses de creación (POST)**: la API sigue consistentemente
> el patrón `res.status(201).json(serializeX(created))` — devuelve el objeto
> recién creado COMPLETO y serializado, NO `{ok: true, id: "..."}`.
> Excepciones: acciones simples como finalize, take, delete, approve devuelven
> `{ok: true, ...}`.

---

## Tabla de Contenidos

### Información General
- [Información General](#información-general)
- [Autenticación](#autenticación)
- [Formato Estándar de Errores](#formato-estándar-de-errores)

### Endpoints (por recurso)
- [Autenticación](#autenticación-endpoints) (`/auth`)
- [Sesión y usuario actual](#sesión-y-usuario-actual) (`/company/:id/auth/me`, `/user`)
- [Vehículos / Assets](#vehículos--assets) (`/company/:id/assets`, `/vehiculo`)
- [Mantenimientos](#mantenimientos) (`/company/:id/maintenances`)
- [Combustible](#combustible) (`/company/:id/fuel`)
- [Peajes](#peajes) (`/company/:id/tolls`)
- [Seguros](#seguros) (`/company/:id/insurance`)
- [Talleres / Workshops](#talleres--workshops) (`/company/:id/workshops`, `/garages`)
- [Proveedores / Suppliers](#proveedores--suppliers) (`/company/:id/suppliers`)
- [Conductores / Drivers](#conductores--drivers) (`/company/:id/drivers`)
- [Asignaciones](#asignaciones) (`/company/:id/assignments`)
- [Checklists](#checklists) (`/company/:id/checklists`)
- [Checklist Reauth](#checklist-reauth) (`/company/:id/checklist-reauth`)
- [Alertas](#alertas) (`/company/:id/alerts`)
- [Notificaciones](#notificaciones) (`/company/:id/notifications`)
- [Sites](#sites) (`/company/:id/sites`)
- [Odómetro](#odómetro) (`/company/:id/odometer`)
- [Autorizaciones de Salida](#autorizaciones-de-salida) (`/company/:id/exit-authorizations`)
- [Tickets](#tickets) (`/company/:id/ticket`)
- [Configuración](#configuración) (`/company/:id/settings`, `ai-settings`, `whatsapp-settings`)
- [Roles](#roles) (`/company/:id/roles`)
- [Opciones de Formularios](#opciones-de-formularios) (`/company/:id/form-options`)
- [Chat](#chat) (`/company/:id/chat`)
- [Canvas Boards](#canvas-boards) (`/company/:id/canvas-boards`)
- [Driver Schedule](#driver-schedule) (`/company/:id/driver-schedule`)
- [Ac Units](#ac-units) (`/company/:id/ac-units`)
- [Audit](#audit) (`/company/:id/audit`)
- [Estadísticas y Reportes](#estadísticas-y-reportes) (`/company/:id/estadisticas`, `reports`, `analytics`, `stats/*`)
- [Finanzas - Caja Chica](#finanzas---caja-chica) (`/company/:id/finance/petty-cash`)
- [Finanzas - Facturas](#finanzas---facturas) (`/company/:id/finance-invoices`, `invoice-types`, `invoice-reviews`)
- [Jarvis / AI](#jarvis--ai) (`/company/:id/ai/...`)
- [Upload](#upload) (`/upload`)
- [Oil Check](#oil-check) (`/oil-check`)
- [Public](#public) (`/public`)
- [Platform (superadmin)](#platform-superadmin) (`/platform/*`)

---

## Información General

### URL base
- **Desarrollo local**: `http://localhost:5000`
- **Producción**: variable según deploy (ver `BACKEND_URL` env)

### Prefijos de ruta raíz
Ver `apps/backend/src/app.ts:65-71`.

| Prefijo | Router | Auth |
|---|---|---|
| `/auth` | `authRouter` | mixto (login es público, el resto requiere cookie) |
| `/public` | `publicRouter` | no requiere (datos para landing) |
| `/platform` | `platformRouter` | requiere cookie de superadmin |
| `/company/:id` | `companyRouter` | requiere cookie de empresa + match de `:id` con sesión |
| `/upload` | `uploadRouter` | cookie requerida (multipart) |
| `/oil-check` | `oilCheckRouter` | pública (público, escaneo QR) |
| `/health` | inline | no requiere |
| `/metrics` | inline (Prometheus) | no requiere |
| `/ws-stats`, `/ws-chat-stats` | inline (debug) | no requiere |

### Headers globales
- `Content-Type: application/json` (en requests con body)
- La cookie de sesión la manda el browser automáticamente (es httpOnly)
- `Accept-Encoding: gzip` activa la compresión gzip de responses (threshold 1 KB)

### Rate limiting
Ver `apps/backend/src/middlewares/rateLimit.ts`. Hay varios limitadores:

| Limitador | Límite | Aplica a |
|---|---|---|
| `rateLimitLogin` | 5/min por IP | `POST /auth/login` |
| `rateLimitDefault` | 120/min por (user+IP) | endpoints sueltos (oil-check) |

---

## Autenticación

**Tipo: Cookie httpOnly** (NO Bearer token). Nombre de la cookie: `token` (ver
`apps/backend/src/routes/auth.ts:COOKIE_NAME`).

### Propiedades de la cookie
- `httpOnly: true` (no se puede leer desde JS del browser)
- `sameSite: 'lax'`
- `secure: true` en producción, `false` en desarrollo
- `path: '/'`
- `maxAge`: variable según el scope (ver `login` response)

### Flujo
1. `POST /auth/login` con `{login, password, scope}`.
2. Si las credenciales son válidas y el usuario no está locked out, el backend
   setea la cookie `token` con el JWT firmado.
3. El browser la manda automáticamente en cada request subsiguiente.
4. `POST /auth/refresh` (requiere cookie actual válida) renueva el token.
5. `POST /auth/logout` borra la cookie.

### Lockout
- **5 intentos fallidos** → bloqueo de **30 minutos** (configurable en
  `platformSettings`).
- Tanto para login de empresa (`scope=operacion`) como de plataforma (`scope=plataforma`).
- El counter se resetea cuando el login es exitoso.

### Scopes
- `operacion`: login de empresa → cookie contiene `companyUser-N` en el JWT.
- `plataforma`: login de superadmin → cookie contiene `platformUser-N`.

---

## Formato Estándar de Errores

Ver `apps/backend/src/middlewares/errorHandler.ts`. Todas las respuestas de error
siguen esta estructura (vía `AppError`):

```json
{
  "error": "Mensaje legible para el humano",
  "code": "CODIGO_MAQUINA",
  "details": { "opcional": "info extra" }
}
```

### Códigos HTTP comunes
| Código | Significado |
|---|---|
| 400 | Validación Zod falló (body/query inválido) |
| 401 | Sin cookie o cookie inválida/expirada |
| 403 | Usuario autenticado pero sin permiso para el recurso |
| 404 | Recurso no existe o no pertenece a la empresa |
| 409 | Conflicto (ej: ya existe, transición de estado inválida) |
| 422 | Validación semántica (ej: stock insuficiente) |
| 500 | Error interno del servidor |
| 503 | Servicio no disponible (ej: API externa caída) |

Para errores de validación Zod, el handler devuelve el array de issues:

```json
{
  "error": "Validation failed",
  "issues": [
    { "path": ["body", "title"], "message": "String must contain at least 3 character(s)" }
  ]
}
```

---

## Autenticación (endpoints)

Prefijo: `/auth`. Archivo: `apps/backend/src/routes/auth.ts`.

### `POST /auth/login`
- **Descripción**: Autentica al usuario (empresa o plataforma) y setea la cookie de sesión. Devuelve también el `token` en el body para uso del WebSocket (los browsers no mandan cookies automáticamente en upgrade WS).
- **Auth**: no requiere.
- **Body**:
  ```json
  {
    "login": "user@example.com",
    "password": "mipassword123",
    "scope": "operacion"
  }
  ```
- **Response 200**:
  ```json
  {
    "id": "company-user-1",
    "email": "user@example.com",
    "name": "juan",
    "role": "owner_empresa",
    "scope": "operacion",
    "companyId": 1,
    "companyName": "Aplismart",
    "companyModules": ["mantenimiento", "combustible"],
    "modulePermissions": { "mantenimiento": { "execution": ["crear", "editar"] } },
    "permissions": {},
    "photoUrl": null,
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
  ```
  La cookie `token` se setea automáticamente (httpOnly) además de incluirse en el body.
- **Errores comunes**: 401 (credenciales inválidas o usuario locked), 423 (locked), 429 (rate limit 5/min).

### `POST /auth/session`
- **Descripción**: Crea o recupera una sesión activa enviando magic link al email. (Flujo de recuperación / primer login sin password.)
- **Auth**: no requiere.
- **Body**: `{ "email": "user@example.com", "scope": "operacion" }` (ambos requeridos)
- **Response 200**: `{ "ok": true, "message": "Sesión enviada al email" }`

### `POST /auth/refresh`
- **Descripción**: Renueva el JWT de la sesión actual (rota el token).
- **Auth**: cookie requerida.
- **Response 200**: `{ "ok": true }` (con nueva cookie seteada)

### `GET /auth/session`
- **Descripción**: Devuelve info de la sesión actual (usuario, empresa, rol, permisos frescos desde BD).
- **Auth**: cookie requerida.
- **Response 200**:
  ```json
  {
    "id": "company-user-1",
    "email": "user@example.com",
    "name": "juan",
    "role": "owner_empresa",
    "scope": "operacion",
    "companyId": "1",
    "companyName": "Aplismart",
    "photoUrl": null,
    "dni": "1712345678",
    "siteId": null,
    "modulePermissions": { "mantenimiento": { "execution": ["crear", "editar"] } }
  }
  ```

### `POST /auth/logout`
- **Descripción**: Borra la cookie de sesión.
- **Auth**: cookie requerida (opcional, también funciona sin).
- **Response 200**: `{ "ok": true }`

---

## Sesión y usuario actual

Prefijo: `/company/:id/auth/me` y `/user`. Archivos: `apps/backend/src/routes/company/auth.me.ts` y `user.ts`.

### `GET /company/:id/auth/me`
- **Descripción**: Devuelve la sesión actual con permisos detallados por módulo.
- **Auth**: cookie requerida.
- **Response 200**: `{ user, company, permissions: { mantenimiento: { execution: ["crear", "editar"] } } }`

### `PATCH /company/:id/auth/me`
- **Descripción**: Actualiza info del usuario actual (nombre, email, teléfono).
- **Auth**: cookie requerida.
- **Body**: `{ "name": "Juan", "phone": "+593991234567" }` (todos opcionales)

### `PATCH /company/:id/auth/me/password`
- **Descripción**: Cambia la contraseña del usuario actual.
- **Body**: `{ "currentPassword": "*", "newPassword": "*" }` (ambos requeridos)

### `GET /company/:id/auth/me/driver-assignment`
- **Descripción**: Devuelve el vehículo y conductor asignado al operador actual (si tiene).

### `GET /company/:id/user`
- **Descripción**: Lista usuarios de la empresa (paginado).
- **Query params**: `page` (default 1), `pageSize` (default 10), `q` (búsqueda), `role` (filtro).
- **Response 200**: paginado estándar.

### `POST /company/:id/user`
- **Descripción**: Crea un usuario nuevo en la empresa.
- **Body**:
  ```json
  {
    "username": "juan",
    "email": "juan@example.com",
    "password": "secret",
    "fullName": "Juan Pérez",
    "role": "operador"
  }
  ```
- **Response 201**: `User object completo` (ver convención al inicio del doc). NO devuelve `{ok, id}`.

### `PATCH /company/:id/user/:userId`
- **Descripción**: Edita un usuario existente.
- **Body**: cualquiera de los campos anteriores (todos opcionales).

### `DELETE /company/:id/user/:userId`
- **Descripción**: Soft-delete un usuario. No se puede eliminar al owner.

### `POST /company/:id/user/:userId/reset-password`
- **Descripción**: Genera nueva password aleatoria y la manda al usuario por email.

### `POST /company/:id/user/:userId/assign-role`
- **Descripción**: Asigna un rol distinto al usuario.

---

## Vehículos / Assets

Prefijos: `/company/:id/assets` y `/company/:id/vehiculo`. Archivos: `apps/backend/src/routes/company/assets.ts` y `vehiculo.ts`.

### `GET /company/:id/assets`
- **Descripción**: Lista vehículos (paginado, con filtros).
- **Auth**: cookie requerida, módulo `gestion` o `flotas`.
- **Query params**: `page`, `pageSize`, `status` (Operativo|En mantenimiento|Fuera de servicio), `type`, `search`.
- **Response 200**: paginado estándar. `data[]` con `{ id: "asset-N", plate, name, status, type, ... }`.

### `GET /company/:id/assets/:assetId`
- **Descripción**: Devuelve un vehículo con sus detalles completos.
- **Response 200**: `{ id, plate, name, status, type, year, brand, model, vin, currentDriver, currentLocation, ... }`

### `POST /company/:id/assets`
- **Descripción**: Crea un vehículo.
- **Body**:
  ```json
  {
    "plate": "ABM-4662",
    "name": "Camión #1",
    "type": "Camión",
    "year": 2020,
    "vin": "...",
    "brand": "Hino",
    "model": "FC"
  }
  ```
- **Response 201**: `Asset object completo` (ver convención al inicio del doc). NO devuelve `{ok, id}`.

### `PUT /company/:id/assets/:assetId`
- **Descripción**: Edita un vehículo.

### `PUT /company/:id/assets/:assetId/status`
- **Descripción**: Cambia el estado del vehículo (Operativo / En mantenimiento / Fuera de servicio). Usado por la tool de Jarvis `changeVehicleStatus`.
- **Auth**: cookie + admin.
- **Body**: `{ "status": "Fuera de servicio", "reason": "Falla de motor" }` (`reason` opcional, máx 500 chars).

### `POST /company/:id/assets/:assetId/notes`
- **Descripción**: Agrega una nota libre al vehículo. Usado por la tool de Jarvis `addVehicleNote`. Persiste en `companyAuditEntries` con `metadata.kind='note_added'`.
- **Auth**: cookie + admin.
- **Body**: `{ "text": "Se le cambió la batería el 28/07" }` (1-2000 chars, requerido).

### `PATCH /company/:id/assets/:assetId/toggle`
- **Descripción**: Alterna el status entre "Operativo" y "Fuera de servicio" (sin body).

### `DELETE /company/:id/assets/:assetId`
- **Descripción**: Soft-delete del vehículo (no se borra físicamente).

### `GET /company/:id/vehiculo/:assetId`
- **Descripción**: Alias de GET /assets/:assetId con campos extras (uso legacy).

### `GET /company/:id/vehiculo/:assetId/location`
- **Descripción**: Última posición GPS conocida del vehículo.

### `PATCH /company/:id/vehiculo/:assetId/status`
- **Descripción**: Cambia status con valores legacy: `Activo` | `Inactivo` | `En taller`. Distinto al del router de assets.

### `POST /company/:id/vehiculo/:assetId/engine-toggle`
- **Descripción**: Engine on/off (para integración con dispositivos telematicos).

### `POST /company/:id/vehiculo/:assetId/lock-toggle`
- **Descripción**: Lock on/off del vehículo.

### `GET /company/:id/vehiculo/:assetId/daily-usage`
- **Descripción**: Resumen de uso diario del vehículo (km, horas).

### `GET /company/:id/vehiculo/:assetId/stats/fuel`
- **Descripción**: Stats de combustible del vehículo (consumo promedio, último registro, etc.).

### `GET /company/:id/vehiculo/:assetId/stats/maintenances`
- **Descripción**: Stats de mantenimientos del vehículo (cantidad, costos, próximos).

### `GET /company/:id/vehiculo/:assetId/stats/odometer`
- **Descripción**: Lecturas de odómetro (histórico).

### `GET /company/:id/vehiculo/:assetId/stats/costs`
- **Descripción**: Costos totales del vehículo (mantenimiento + combustible + peajes + seguros).

### `GET /company/:id/vehiculo/:assetId/routes`
- **Descripción**: Rutas históricas del vehículo.

### `POST /company/:id/vehiculo/:assetId/routes`
- **Descripción**: Registra una nueva ruta.

### `GET /company/:id/vehiculo/:assetId/notes`
- **Descripción**: Lista las notas del vehículo.

### `POST /company/:id/vehiculo/:assetId/notes`
- **Descripción**: Agrega nota (mismo formato que `/assets/:id/notes`).

### `DELETE /company/:id/vehiculo/:assetId/notes/:noteId`
- **Descripción**: Borra una nota específica.

---

## Mantenimientos

Prefijo: `/company/:id/maintenances`. Archivos: `apps/backend/src/routes/company/maintenances.ts` y `maintenance-data.ts`. **El módulo más grande de la app**, ~30 endpoints.

### `GET /company/:id/maintenances`
- **Descripción**: Lista mantenimientos (paginado, filtros).
- **Query params**: `page`, `pageSize`, `from` (YYYY-MM-DD), `to` (YYYY-MM-DD), `status`, `type`, `category`, `excludeStatus`, `assetId`, `assignedUserId`, `search`.
- **Response 200**: paginado estándar. `data[]` con mantenimientos completos.

### `GET /company/:id/maintenances/:id`
- **Descripción**: Mantenimiento completo con items, attachments, eventos, fotos.

### `POST /company/:id/maintenances`
- **Descripción**: Crea mantenimiento. Usado por la tool de Jarvis `scheduleMaintenance`.
- **Body**:
  ```json
  {
    "assetId": "asset-1",
    "title": "Cambio de aceite",
    "type": "Programado",
    "category": "Otro",
    "scheduledFor": "2026-07-31T08:00:00Z",
    "description": "...",
    "odometerKm": 12345,
    "ivaPercent": 15,
    "cadenceKind": "none",
    "items": [],
    "attachments": [],
    "assignedUserId": "company-user-N"
  }
  ```
- **Response 201**: `Maintenance object completo` (ver convención al inicio del doc). NO devuelve `{ok, id}`.

### `PUT /company/:id/maintenances/:id`
- **Descripción**: Edita mantenimiento (body parcial).

### `DELETE /company/:id/maintenances/:id`
- **Descripción**: Borra mantenimiento (soft-delete).

### `POST /company/:id/maintenances/:id/items`
- **Descripción**: Agrega repuestos/items al mantenimiento.
- **Body**:
  ```json
  {
    "items": [
      {
        "name": "Filtro de aceite",
        "quantity": 1,
        "unitCost": 15.50,
        "discountType": "amount",
        "discountValue": 0,
        "ivaPercent": 15,
        "photoUrl": null,
        "supplierId": null
      }
    ]
  }
  ```

### `DELETE /company/:id/maintenances/:id/items/:itemId`
- **Descripción**: Borra un item. Usado por la papelera del drawer.

### `POST /company/:id/maintenances/:id/notes`
- **Descripción**: Agrega nota al mantenimiento.

### `POST /company/:id/maintenances/:id/attachments`
- **Descripción**: Sube adjunto (foto o PDF).
- **Body**: `{ attachments: [{ url, label, kind, amount, ... }] }`

### `POST /company/:id/maintenances/:id/take`
- **Descripción**: Operador toma el mantenimiento (asigna a sí mismo).

### `POST /company/:id/maintenances/:id/start`
- **Descripción**: Pasa el mantenimiento a "En proceso".

### `POST /company/:id/maintenances/:id/finalize`
- **Descripción**: Finaliza el mantenimiento (status: Completado).

### `POST /company/:id/maintenances/:id/reschedule`
- **Descripción**: Reagenda. Body: `{ newScheduledFor, reason, keepItems? }`

### `POST /company/:id/maintenances/:id/request-correction`
- **Descripción**: Marca para corrección. Body: `{ reason }`.

### `POST /company/:id/maintenances/:id/cancel`
- **Descripción**: Cancela. Body: `{ reason }`.

### `POST /company/:id/maintenances/:id/approve-reauth`
- **Descripción**: Aprueba una solicitud de reautorización (admin).

### `POST /company/:id/maintenances/:id/reject-reauth`
- **Descripción**: Rechaza reautorización. Body: `{ reason }`.

### `GET /company/:id/maintenances/:id/events`
- **Descripción**: Lista eventos del mantenimiento (timeline).

### `POST /company/:id/maintenances/:id/photos`
- **Descripción**: Sube fotos de evidencia al mantenimiento.

### `GET /company/:id/maintenances/:id/photos`
- **Descripción**: Lista fotos de evidencia.

### `DELETE /company/:id/maintenances/:id/photos/:photoId`
- **Descripción**: Borra una foto de evidencia.

### `POST /company/:id/maintenances/:id/carwash-extras`
- **Descripción**: Agrega adicional de lavada. Body: `{ name, quantity, unitCost, photoUrl }`.

### `GET /company/:id/maintenances/:id/carwash-extras`
- **Descripción**: Lista adicionales de lavada.

### `POST /company/:id/maintenances/:id/carwash-photos`
- **Descripción**: Sube foto del proceso de lavada.

### `GET /company/:id/maintenances/:id/carwash-photos`
- **Descripción**: Lista fotos de lavada.

### `GET /company/:id/maintenances/calendar`
- **Descripción**: Vista calendario (mantenimientos agrupados por día en un rango).

### `GET /company/:id/maintenances/upcoming`
- **Descripción**: Mantenimientos próximos a vencer (para dashboard).

### `GET /company/:id/maintenances/overdue`
- **Descripción**: Mantenimientos atrasados.

### `POST /company/:id/maintenances/import`
- **Descripción**: Import masivo desde CSV. Body: `{ csv: "..." }`.

### `GET /company/:id/maintenances/categories`
- **Descripción**: Lista categorías (built-in + custom).

### `POST /company/:id/maintenances/categories`
- **Descripción**: Crea categoría custom.

### `GET /company/:id/maintenances/modules`
- **Descripción**: Módulos relacionados (para form options).

### `GET /company/:id/maintenance-data/modules`
- **Descripción**: Lista módulos disponibles. Usado por el form.

### `GET /company/:id/maintenance-data/assets`
- **Descripción**: Assets simplificados para selects. **Query params**: `module` (filtro por módulo — ej: `'combustible'`, `'mantenimiento'`, `'peajes'`).

### `GET /company/:id/maintenance-data/categories`
- **Descripción**: Categorías con sub-categorías (parent_id recursivo). **Query params**: `module` (filtro).

### `GET /company/:id/maintenance-data/last-maintenance`
- **Descripción**: Último mantenimiento por vehículo. **Query params**: `assetIds` (array, ej: `?assetIds=1&assetIds=2` o `?assetIds[]=1&assetIds[]=2`).

### `GET /company/:id/maintenance-data/mantenimiento`
- **Descripción**: Datos agregados de mantenimiento (para gráficos). **Query params**: `from`, `to` (rango de fechas).

### `GET /company/:id/maintenance-data/combustible`
- **Descripción**: Datos agregados de combustible. **Query params**: `from`, `to`.

### `GET /company/:id/maintenance-data/peajes`
- **Descripción**: Datos agregados de peajes. **Query params**: `from`, `to`.

### `GET /company/:id/maintenance-data/checklist`
- **Descripción**: Datos agregados de checklists (completados, pendientes, anomalías). **Query params**: `from`, `to`.

### `GET /company/:id/maintenance-data/alertas`
- **Descripción**: Datos agregados de alertas (activas, resueltas, vencidas). **Query params**: `from`, `to`.

---

## Combustible

Prefijo: `/company/:id/fuel`. Archivo: `apps/backend/src/routes/company/fuel.ts`.

### `GET /company/:id/fuel`
- **Descripción**: Lista cargas de combustible (paginado).
- **Query params**: `page`, `pageSize`, `from` (YYYY-MM-DD), `to` (YYYY-MM-DD), `assetId`, `driverId`.

### `POST /company/:id/fuel`
- **Descripción**: Registra una carga de combustible. Usado por la tool de Jarvis `registerFuelEntry`.
- **Body**:
  ```json
  {
    "assetId": "asset-1",
    "date": "2026-07-30",
    "gallons": 7.9265,
    "cost": 50,
    "odometer": 10000,
    "station": "Primax",
    "fuelType": "Diesel"
  }
  ```
  - `gallons` (requerido, positivo, máx 10M) — la tool convierte de litros.
  - `photoUrl` (opcional, **no requerido** desde jul 2026).
  - `odometerPhotoUrl` (opcional).

### `PUT /company/:id/fuel/:id`
- **Descripción**: Edita una carga de combustible.

### `DELETE /company/:id/fuel/:id`
- **Descripción**: Soft-delete.

### `GET /company/:id/fuel/summary`
- **Descripción**: Resumen agregado (total galones, costo, por vehículo).

### `GET /company/:id/fuel/by-asset/:assetId`
- **Descripción**: Histórico de combustible de un vehículo.

### `GET /company/:id/fuel/:id`
- **Descripción**: Carga específica con detalles.

### `GET /company/:id/fuel/stats/anomalies`
- **Descripción**: Detección de anomalías (consumo fuera de rango por vehículo).

---

## Peajes

Prefijo: `/company/:id/tolls`. Archivo: `apps/backend/src/routes/company/toll.ts`.

### `GET /company/:id/tolls`
- **Descripción**: Lista cruces de peaje (paginado).
- **Query params**: `page`, `pageSize`, `from`, `to`, `assetId`, `highway`.

### `POST /company/:id/tolls`
- **Descripción**: Registra un cruce de peaje. Usado por la tool de Jarvis `registerToll`.
- **Body**: `{ "assetId": "asset-1", "date": "2026-07-30", "highway": "Panamericana", "amount": 2.50, "station": "Alóag", "odometer": 50000 }`

### `PUT /company/:id/tolls/:id`
- **Descripción**: Edita.

### `DELETE /company/:id/tolls/:id`
- **Descripción**: Soft-delete.

### `GET /company/:id/tolls/summary`
- **Descripción**: Resumen agregado.

### `GET /company/:id/tolls/by-asset/:assetId`
- **Descripción**: Histórico por vehículo.

---

## Seguros

Prefijo: `/company/:id/insurance`. Archivo: `apps/backend/src/routes/company/insurance.ts`.

### `GET /company/:id/insurance`
- **Descripción**: Lista seguros activos.

### `POST /company/:id/insurance`
- **Descripción**: Crea un seguro.
- **Body**: `{ "assetId": "asset-1", "policyNumber": "*", "company": "Seguros Equinoccial", "startDate": "2026-01-01", "endDate": "2027-01-01", "premium": 1200, "coverage": "Total" }`

### `PUT /company/:id/insurance/:id`
- **Descripción**: Edita.

### `DELETE /company/:id/insurance/:id`
- **Descripción**: Soft-delete.

### `GET /company/:id/insurance/expiring`
- **Descripción**: Seguros próximos a vencer (default 30 días).

---

## Talleres / Workshops

Prefijos: `/company/:id/workshops` y `/garages`. Archivos: `apps/backend/src/routes/company/workshops.ts` y `garages.ts`.

### `GET /company/:id/workshops`
- **Descripción**: Lista talleres.

### `POST /company/:id/workshops`
- **Descripción**: Crea taller. Body: `{ "name": "*", "address": "...", "phone": "...", "contactName": "..." }`

### `PUT /company/:id/workshops/:id`
- **Descripción**: Edita.

### `DELETE /company/:id/workshops/:id`
- **Descripción**: Soft-delete.

> ⚠️ **Deprecated**: `apps/backend/src/routes/company/garages.ts` es un duplicado legacy de `workshops.ts`. Mantener solo si hay compatibilidad con clientes viejos. Si no, marcar para remover.

---

## Proveedores / Suppliers

Prefijo: `/company/:id/suppliers`. Archivo: `apps/backend/src/routes/company/suppliers.ts`.

### `GET /company/:id/suppliers`
- **Descripción**: Lista proveedores.
- **Query params**: `q` (búsqueda), `nopage` (true para devolver todo).

### `GET /company/:id/suppliers/:supplierId`
- **Descripción**: Detalle de un proveedor.

### `POST /company/:id/suppliers`
- **Descripción**: Crea proveedor. Body: `{ "name": "*", "contactName": "...", "phone": "...", "email": "...", "address": "...", "category": "Repuestos" }`

### `PUT /company/:id/suppliers/:id`
- **Descripción**: Edita.

### `DELETE /company/:id/suppliers/:id`
- **Descripción**: Soft-delete.

---

## Conductores / Drivers

Prefijo: `/company/:id/drivers`. Archivo: `apps/backend/src/routes/company/drivers.ts`.

### `GET /company/:id/drivers`
- **Descripción**: Lista conductores.
- **Query params**: `q`, `status` (Activo|Inactivo|Suspendido), `nopage`.

### `POST /company/:id/drivers`
- **Descripción**: Crea conductor. Body: `{ "name": "*", "license": "*", "phone": "...", "email": "...", "hireDate": "2025-01-01" }`

### `PUT /company/:id/drivers/:id`
- **Descripción**: Edita.

### `DELETE /company/:id/drivers/:id`
- **Descripción**: Soft-delete.

### `GET /company/:id/drivers/:id`
- **Descripción**: Conductor con detalles (asignación actual, historial).

### `GET /company/:id/drivers/available`
- **Descripción**: Conductores disponibles (sin asignación activa).

### `GET /company/:id/drivers/summary`
- **Descripción**: Resumen agregado (total, activos, suspendidos).

### `GET /company/:id/drivers/me/acta`
- **Descripción**: Devuelve el acta actual del conductor logueado (datos de la asignación vigente + vehículo + mantenimiento).

### `GET /company/:id/drivers/:driverId/reports`
- **Descripción**: Lista de reportes del conductor.

### `POST /company/:id/drivers/:driverId/reports`
- **Descripción**: Crea un reporte. Body: `{ "title": "*", "description": "*", "type": "incidente|mantenimiento|otro" }`.

### `GET /company/:id/drivers/reports/all`
- **Descripción**: Lista global de todos los reportes de todos los conductores de la empresa.

### `DELETE /company/:id/drivers/:driverId/reports/:reportId`
- **Descripción**: Borra un reporte específico. Requiere admin.

---

## Asignaciones

Prefijo: `/company/:id/assignments`. Archivo: `apps/backend/src/routes/company/assignments.ts`.

### `GET /company/:id/assignments`
- **Descripción**: Lista asignaciones vehículo-conductor.

### `POST /company/:id/assignments`
- **Descripción**: Crea asignación. Body: `{ "assetId": "asset-1", "driverId": "driver-2", "startDate": "2026-07-30", "notes": "..." }`

### `PUT /company/:id/assignments/:assignId`
- **Descripción**: Edita.

### `DELETE /company/:id/assignments/:assignId`
- **Descripción**: Soft-delete.

### `POST /company/:id/assignments/:assignId/finalize`
- **Descripción**: Finaliza la asignación (cierra el ciclo). Body: `{ endDate, reason }`.

### `PUT /company/:id/assignments/:assignId/handover`
- **Descripción**: Handover (entrega) del vehículo — actualiza el estado y registra evento.

> ⚠️ **No hay** GET /current ni GET /history/:driverId. Para esos casos, usar `GET /` con filtros `?status=active` o `?driverId=driver-N`.

---

## Checklists

Prefijo: `/company/:id` (con guiones en los sub-paths). Archivo: `apps/backend/src/routes/company/checklists.ts`.

### `GET /company/:id/checklist-categories`
- **Descripción**: Lista categorías de checklist (plantillas).

### `POST /company/:id/checklist-categories`
- **Descripción**: Crea categoría.

### `PUT /company/:id/checklist-categories/:catId`
- **Descripción**: Edita categoría.

### `DELETE /company/:id/checklist-categories/:catId`
- **Descripción**: Borra categoría.

### `GET /company/:id/checklists`
- **Descripción**: Lista checklists ejecutados (paginado). Requiere permiso `checklist.historial.ver`.

### `GET /company/:id/checklists/anomalies`
- **Descripción**: Anomalías detectadas en checklists.

### `GET /company/:id/checklists/:checkId`
- **Descripción**: Checklist específico con items marcados.

### `POST /company/:id/checklists`
- **Descripción**: Crea checklist. Body: `{ "assetId": "asset-1", "driverId": "driver-2", "items": [...], "odometer": 50000, "notes": "..." }`. Usado por la tool de Jarvis `createChecklist` (pendiente de implementar).

### `PUT /company/:id/checklists/:checkId`
- **Descripción**: Edita.

### `DELETE /company/:id/checklists/:checkId`
- **Descripción**: Soft-delete.

### `GET /company/:id/checklists/pendientes`
- **Descripción**: Checklists pendientes de firma/aprobación.

### `GET /company/:id/checklists/vencidos`
- **Descripción**: Checklists vencidos (no se hicieron a tiempo).

> ⚠️ **No hay** GET /:id/sign ni PATCH /:id/sign — la firma se hace dentro de PUT /:id (campo `signed: true`).

---

## Checklist Reauth

Prefijo: `/company/:id/reauth-requests`. Archivo: `apps/backend/src/routes/company/checklist-reauth.ts`.

### `GET /company/:id/reauth-requests`
- **Descripción**: Lista solicitudes de reautorización de checklist.

### `POST /company/:id/reauth-requests`
- **Descripción**: Crea solicitud (operador pide reabrir checklist).

### `PUT /company/:id/reauth-requests/:id/decidir`
- **Descripción**: Decide la solicitud (admin). Body: `{ "decision": "approve|reject", "reason": "..." }`.

> ⚠️ El path real es `PUT` (no PATCH) y el endpoint unificado se llama `decidir` (no `approve`/`reject` separados).

---

## Alertas

Prefijo: `/company/:id/alerts`. Archivo: `apps/backend/src/routes/company/alerts.ts`.

### `GET /company/:id/alerts`
- **Descripción**: Lista alertas operativas.
- **Query params**: `page`, `pageSize`, `status` (Abierta|En seguimiento|Cerrada), `severity` (Alta|Media|Baja), `type` (Vencimiento|Mantenimiento|Documento|Manual), `assetId`, `from`, `to`.

### `POST /company/:id/alerts`
- **Descripción**: Crea alerta. Usado por la tool de Jarvis `createAlert`.
- **Body**:
  ```json
  {
    "title": "Vencimiento SOAT en 15 días",
    "notes": "Renovar antes del 15/08",
    "severity": "Alta",
    "type": "Vencimiento",
    "assetId": "asset-1"
  }
  ```
  - `severity`: "Alta" | "Media" | "Baja" (Title case, default "Media").
  - `type`: "Vencimiento" | "Mantenimiento" | "Documento" | "Manual" (default "Manual").
  - `dueDate`: opcional, formato YYYY-MM-DD.

### `GET /company/:id/alerts/:id`
- **Descripción**: Alerta específica.

### `PUT /company/:id/alerts/:id`
- **Descripción**: Edita.

### `DELETE /company/:id/alerts/:id`
- **Descripción**: Soft-delete.

### `PATCH /company/:id/alerts/:alertId/status`
- **Descripción**: Cambia status (Abierta → En seguimiento → Cerrada). Body: `{ "status": "Cerrada", "resolution": "..." }`.

### `PATCH /company/:id/alerts/:id/assign`
- **Descripción**: Asigna la alerta a un usuario.

---

## Notificaciones

Prefijo: `/company/:id/notifications`. Archivo: `apps/backend/src/routes/company/notifications.ts`.

### `GET /company/:id/notifications`
- **Descripción**: Lista notificaciones del usuario actual.
- **Query params**: `scope` (all|unread), `limit` (default 10).

### `GET /company/:id/notifications/unread-count`
- **Descripción**: Cuenta las no leídas (para el badge).

### `PATCH /company/:id/notifications/:id/read`
- **Descripción**: Marca una como leída.

### `PATCH /company/:id/notifications/read-all`
- **Descripción**: Marca todas como leídas.

### `DELETE /company/:id/notifications/:id`
- **Descripción**: Borra una notificación.

### `POST /company/:id/notifications/devices`
- **Descripción**: Registra un device para push notifications. Body: `{ "token": "*", "platform": "ios|android|web" }`.

### `DELETE /company/:id/notifications/devices/:token`
- **Descripción**: Elimina un device (logout del push).

---

## Sites

Prefijo: `/company/:id/sites`. Archivo: `apps/backend/src/routes/company/sites.ts`.

### `GET /company/:id/sites`
- **Descripción**: Lista sitios / sedes (paginado).

### `POST /company/:id/sites`
- **Descripción**: Crea sitio. Body: `{ "name": "*", "address": "*", "city": "...", "phone": "..." }`

### `GET /company/:id/sites/:siteId/impact`
- **Descripción**: Devuelve el impacto del sitio (cuántos vehículos y operaciones dependen de él) — para warning antes de eliminar.

### `PUT /company/:id/sites/:id`
- **Descripción**: Edita.

### `DELETE /company/:id/sites/:id`
- **Descripción**: Soft-delete.

### `GET /company/:id/sites/:id/assets`
- **Descripción**: Vehículos asignados a este sitio.

---

## Odómetro

Prefijo: `/company/:id/assets/:assetId/odometer`. Archivo: `apps/backend/src/routes/company/odometer.ts`.

### `GET /company/:id/assets/:assetId/odometer`
- **Descripción**: Histórico de lecturas de odómetro del vehículo.

### `POST /company/:id/assets/:assetId/odometer`
- **Descripción**: Registra una nueva lectura de odómetro.
- **Body**: `{ "km": 50100, "date": "2026-07-30", "source": "manual|gps" }`

> ⚠️ **No hay** GET /latest/:assetId — el último registro viene como el último elemento del GET histórico.

---

## Autorizaciones de Salida

Prefijo: `/company/:id/autorizaciones` (los paths usan `/autorizaciones`, no `/exit-authorizations`). Archivo: `apps/backend/src/routes/company/exit-authorizations.ts`. **Módulo grande con 15+ endpoints.**

### `GET /company/:id/autorizaciones/conductor-context`
- **Descripción**: Devuelve el contexto del conductor logueado (asignación actual + vehículo) — para inicializar el form.

### `GET /company/:id/autorizaciones`
- **Descripción**: Lista autorizaciones de salida.

### `GET /company/:id/autorizaciones/:authId`
- **Descripción**: Autorización específica.

### `POST /company/:id/autorizaciones`
- **Descripción**: Crea autorización. Body: `{ "assetId": "asset-1", "driverId": "driver-2", "destination": "...", "purpose": "...", "expectedReturnAt": "..." }`

### `POST /company/:id/autorizaciones/:authId/analyze`
- **Descripción**: Dispara análisis con IA de la autorización.

### `POST /company/:id/autorizaciones/:authId/reanalyze`
- **Descripción**: Re-dispara el análisis con IA (si la primera vez falló).

### `GET /company/:id/autorizaciones/:authId/analyses`
- **Descripción**: Lista los análisis de IA hechos sobre esta autorización.

### `POST /company/:id/autorizaciones/:authId/items/:itemType/reject`
- **Descripción**: Marca un item específico como rechazado (ej: `items/foto/reject`, `items/documento/reject`).

### `PATCH /company/:id/autorizaciones/:authId/photo`
- **Descripción**: Actualiza la foto de la autorización.

### `GET /company/:id/autorizaciones/:authId/corrections`
- **Descripción**: Lista las correcciones que pidió el aprobador.

### `POST /company/:id/autorizaciones/:authId/corrections/submit`
- **Descripción**: El conductor envía las correcciones pedidas.

### `POST /company/:id/autorizaciones/:authId/return-to-driver`
- **Descripción**: Devuelve la autorización al conductor para que la complete.

### `POST /company/:id/autorizaciones/:authId/approve`
- **Descripción**: Aprueba la autorización (supervisor).

### `POST /company/:id/autorizaciones/:authId/reject`
- **Descripción**: Rechaza la autorización. Body: `{ reason }`.

### `DELETE /company/:id/autorizaciones/:authId`
- **Descripción**: Borra (soft-delete).

### `GET /company/:id/autorizaciones/pending-review`
- **Descripción**: Autorizaciones pendientes de revisión.

---

## Tickets

Prefijo: `/company/:id/ticket`. Archivo: `apps/backend/src/routes/company/ticket.ts`.

### `GET /company/:id/ticket`
- **Descripción**: Lista tickets de soporte.

### `POST /company/:id/ticket`
- **Descripción**: Crea ticket. Body: `{ "title": "*", "description": "*", "category": "bug|feature|question", "priority": "low|medium|high" }`

### `GET /company/:id/ticket/:id`
- **Descripción**: Ticket con comentarios.

### `POST /company/:id/ticket/:id/messages`
- **Descripción**: Agrega mensaje al ticket. Body: `{ "text": "*" }`.

> ⚠️ **No hay** PATCH, PUT ni DELETE en tickets. Los tickets son append-only.

---

## Configuración

Prefijos: `/company/:id/settings`, `/company/:id/ai-settings`, `/company/:id/whatsapp-settings`.

### `GET /company/:id/settings`
- **Descripción**: Devuelve configuración de la empresa (general).

### `PUT /company/:id/settings`
- **Descripción**: Edita configuración.

### `GET /company/:id/ai-settings`
- **Descripción**: Configuración del asistente AI (modelo, temperatura, etc.).

### `PUT /company/:id/ai-settings`
- **Descripción**: Edita AI settings.

### `GET /company/:id/whatsapp-settings`
- **Descripción**: Configuración de integración WhatsApp.

### `PUT /company/:id/whatsapp-settings`
- **Descripción**: Edita.

---

## Roles

Prefijo: `/company/:id/roles`. Archivo: `apps/backend/src/routes/company/roles.ts`.

### `GET /company/:id/roles`
- **Descripción**: Lista roles configurables (no los built-in del sistema).

### `POST /company/:id/roles`
- **Descripción**: Crea rol. Body: `{ "name": "*", "permissions": { "mantenimiento": { "execution": ["crear", "editar"] } } }`. Requiere permiso `accesos.roles.crear`.

### `PATCH /company/:id/roles/:roleId`
- **Descripción**: Edita. Requiere permiso `accesos.roles.editar`.

### `DELETE /company/:id/roles/:roleId`
- **Descripción**: Borra (soft-delete). Requiere permiso `accesos.roles.eliminar`.

### `POST /company/:id/roles/seed`
- **Descripción**: Carga roles por defecto del sistema (idempotente). Requiere admin.

> ⚠️ **No hay** GET /roles/permissions — los permisos disponibles se infieren del catálogo de tools de cada empresa.

---

## Opciones de Formularios

Prefijo: `/company/:id`. Archivo: `apps/backend/src/routes/company/formOptions.ts`. **No es un solo endpoint** — son 11 endpoints separados, cada uno con su path.

### `GET /company/:id/checklist/form-options`
- **Descripción**: Opciones para forms de checklist.

### `GET /company/:id/alerts/form-options`
- **Descripción**: Opciones para forms de alertas.

### `GET /company/:id/reports/form-options`
- **Descripción**: Opciones para forms de reportes.

### `GET /company/:id/ac-units/form-options`
- **Descripción**: Opciones para forms de AC units.

### `GET /company/:id/assignments/form-options`
- **Descripción**: Opciones para forms de asignaciones.

### `GET /company/:id/insurance/form-options`
- **Descripción**: Opciones para forms de seguros.

### `GET /company/:id/drivers/form-options`
- **Descripción**: Opciones para forms de conductores.

### `GET /company/:id/users/form-options`
- **Descripción**: Opciones para forms de usuarios.

### `GET /company/:id/settings/form-options`
- **Descripción**: Opciones para forms de configuración.

### `GET /company/:id/vehicles/form-options`
- **Descripción**: Opciones para forms de vehículos.

Todos devuelven el shape estándar de opciones consolidadas (assets, users, workshops, etc.) para que el front no haga N requests.

---

## Chat

Prefijo: `/company/:id/chat`. Archivo: `apps/backend/src/routes/company/chat.ts`. **Módulo en español**: los paths usan `/conversaciones` y `/mensajes` (no `/conversations` y `/messages`).

### `GET /company/:id/chat/conversaciones`
- **Descripción**: Lista conversaciones del usuario actual.

### `POST /company/:id/chat/conversaciones`
- **Descripción**: Crea conversación. Body: `{ "participantes": ["company-user-N", ...], "titulo": "...", "tipo": "direct|group" }`

### `GET /company/:id/chat/conversaciones/:convId/mensajes`
- **Descripción**: Mensajes de una conversación (paginado).

### `POST /company/:id/chat/conversaciones/:convId/mensajes/:msgId/reacciones`
- **Descripción**: Reacciona a un mensaje. Body: `{ "emoji": "👍" }`.

### `DELETE /company/:id/chat/conversaciones/:convId/mensajes/:msgId/reacciones/:emoji`
- **Descripción**: Quita una reacción.

### `GET /company/:id/chat/usuarios`
- **Descripción**: Lista usuarios disponibles para iniciar chat.

> ⚠️ Los nombres de campo y rutas son en **español** (`conversaciones`, `mensajes`, `participantes`, `titulo`, `tipo`). `conversaciones/:id/read` no existe — el read se hace al listar mensajes.

---

## Canvas Boards

Prefijo: `/company/:id/canvas-boards`. Archivo: `apps/backend/src/routes/company/canvas-boards.ts`.

### `GET /company/:id/canvas-boards`
- **Descripción**: Lista lienzos (boards) del usuario (si no es admin, ve los propios + los compartidos). Orden por `updatedAt desc`.

### `POST /company/:id/canvas-boards`
- **Descripción**: Crea lienzo. Body: `{ "name": "*", "description": "...", "panelModules": ["combustible", "mantenimiento"], "isShared": false }`. **Response 201**: `Board object serializado` (NO `{ok, id}`).

### `GET /company/:id/canvas-boards/:boardId`
- **Descripción**: Detalle del lienzo + widgets asociados. **Response**: `{ board: {...}, widgets: [...] }`.

### `PUT /company/:id/canvas-boards/:boardId`
- **Descripción**: Edita el lienzo (nombre, descripción, paneles, compartido). Solo el dueño o admin.

### `DELETE /company/:id/canvas-boards/:boardId`
- **Descripción**: Borra el lienzo (cascadea widgets).

### `POST /company/:id/canvas-boards/:boardId/widgets`
- **Descripción**: Crea un widget en el board. Body: `{ "modulo": "*", "vizKind": "chart|table|kpi|number|list", "chartType": "bar|line|pie|doughnut|..." (si vizKind=chart), "scope": "todos|vehiculo|conductor|...|custom", "entityKind": "...", "entityIds": [...], "periodo": "mes|trimestre|año|...|rango", "fechaDesde": "YYYY-MM-DD", "fechaHasta": "YYYY-MM-DD", "title": "...", "secondaryModulo": "..." }`. **Response 201**: `Widget object`.

### `PUT /company/:id/canvas-boards/:boardId/widgets/:widgetId`
- **Descripción**: Edita widget (geometría: posX/posY/width/height + config completa). Mismas validaciones que POST. Acepta geometría parcial y config parcial.

### `DELETE /company/:id/canvas-boards/:boardId/widgets/:widgetId`
- **Descripción**: Borra un widget.

### `GET /company/:id/canvas-boards/:boardId/widgets/:widgetId/rows`
- **Descripción**: Devuelve las filas del módulo del widget (filas detalladas, NO agregados). Alimenta las tablas del lienzo. **Response**: `{ modulo, widgetId, columns: [...], rows: [...], warning }`.

### `GET /company/:id/canvas-boards/:boardId/widgets/:widgetId/combined-data`
- **Descripción**: Devuelve datos de dos módulos combinados (cuando el widget tiene `secondaryModulo`). Para gráficas comparativas (ej: combustible vs mantenimiento). **Response**: `{ modulo, secondaryModulo, series: [...], columns: [...] }`.

### `DELETE /company/:id/canvas-boards/:id`
- **Descripción**: Borra.

---

## Driver Schedule

Prefijo: `/company/:id/driver-schedule`. Archivo: `apps/backend/src/routes/company/driver-schedule.ts`. Módulo de **francos y descansos** (no turnos con hora).

### `GET /company/:id/driver-schedule`
- **Descripción**: Lista libres por conductor. **Query params**: `from` (YYYY-MM-DD, default = 1° día del mes EC actual), `to` (YYYY-MM-DD exclusivo, default = 1° día del mes SIGUIENTE a `from` — jul 2026 fix: antes era solo 1 día, ahora trae el mes entero). **Response**: `{ data: [...], from, toExclusive }`.

### `GET /company/:id/driver-schedule/has-any`
- **Descripción**: ¿Hay entradas en el mes? **Query params**: `month` (1-12), `year` (2000-2100). **Response**: `{ hasAny, count, year, month }`.

### `POST /company/:id/driver-schedule`
- **Descripción**: Crea o actualiza (upsert por `company_id+driver_id+date`) una entrada de franco. Body: `{ "driverId": "driver-N", "date": "2026-07-30", "reason": "...", "notes": "..." }`. **Response 201**: `Entry object serializado`.

### `DELETE /company/:id/driver-schedule/:id`
- **Descripción**: Borra una entrada. **Response**: 204 No Content.

### `POST /company/:id/driver-schedule/copy-from-previous`
- **Descripción**: Copia el mes anterior al mes target (target debe estar vacío). Body: `{ "targetYear": 2026, "targetMonth": 8, "sourceYear": 2026, "sourceMonth": 7 }`. Si no se mandan, default = `targetYear/Month=mes actual EC` y `sourceYear/Month=mes anterior`. Si una fecha no existe en el target (ej. 31 → feb), se descarta con `skippedDayMismatch`. Devuelve 409 si el target ya tiene entradas. **Response**: `{ copied, sourceYear, sourceMonth, targetYear, targetMonth, skippedDayMismatch }`.

### `GET /company/:id/driver-schedule/by-asset`
- **Descripción**: Devuelve `Map<assetId, [freeDates]>` — los días en que el conductor ACTIVO de cada vehículo está libre. JOIN: `driver_time_off` JOIN `company_drivers` JOIN `company_assignments` (status='Activa', start<=date, end IS NULL OR end>=date) JOIN `company_assets` (status='Operativo' o 'En mantenimiento'). Query params: `from`, `to` (ambos YMD, ambos obligatorios). Alimenta el highlight verde del calendario de agendar mantenimiento. **Response**: `{ byAsset: { "asset-N": ["2026-07-15", "2026-07-22"] }, from, toExclusive }`.

### `POST /company/:id/driver-schedule/bulk`
- **Descripción**: Bulk insert para patrón de trabajo/descanso. Body: `{ "entries": [{ "driverId": N, "date": "YYYY-MM-DD", "reason": "..." }, ...] }` (max 2000). Hace UN solo INSERT batch con `ON CONFLICT DO NOTHING` (idempotente). **Response**: `{ total, inserted, skipped }`.

> ⚠️ No hay GET /driver/:driverId separado — usar `GET /` con `?driverId=driver-N` (si el back lo soporta) o filtrar en el cliente.

---

## Ac Units

Prefijo: `/company/:id/ac-units`. Archivo: `apps/backend/src/routes/company/ac-units.ts`. **Módulo HVAC separado de vehículos.**

### `GET /company/:id/ac-units`
- **Descripción**: Lista unidades de aire acondicionado.

### `GET /company/:id/ac-units/:unitId`
- **Descripción**: Detalle de una unidad AC.

### `POST /company/:id/ac-units`
- **Descripción**: Crea unidad. Body: `{ "siteId": "site-N", "name": "*", "code": "AC-001", "type": "Split|Piso techo|Central", "floor": "...", "area": "Sala 1", "serial": "...", "brand": "...", "model": "...", "capacityBtu": 12000, "voltage": 110, "amperage": 5.5, "refrigerantType": "R-410A", "installDate": "2026-01-15", "technician": "...", "status": "Operativo|En mantenimiento|Fuera de servicio", "notes": "..." }`. Requiere supervisor. **Response 201**: `Unit object serializado`.

### `PUT /company/:id/ac-units/:unitId`
- **Descripción**: Edita. Body parcial. Requiere supervisor. **Response**: `Unit object actualizado`.

### `DELETE /company/:id/ac-units/:unitId`
- **Descripción**: Borra. Requiere admin.

### `POST /company/:id/ac-units/:unitId/services`
- **Descripción**: Registra un servicio/mantenimiento AC. Body: `{ "date": "YYYY-MM-DD", "kind": "Preventivo|Correctivo|Instalación", "technician": "*", "cost": 150.50, "findings": "...", "photoUrls": [...], "notes": "..." }`. Actualiza `lastService` en la unidad. **Response 201**: `Service object`.

### `POST /company/:id/ac-units/:unitId/refrigerant-logs`
- **Descripción**: Registra una recarga de refrigerante. Body: `{ "date": "YYYY-MM-DD", "refrigerantType": "R-410A", "quantity": 1.2, "unit": "kg|lb", "technician": "*", "reason": "Fuga|Recarga programada|Reinstalación", "notes": "..." }`. **Response 201**: `RefrigerantLog object`.

### `POST /company/:id/ac-units/:id/maintenance`
- **Descripción**: Registra mantenimiento de AC.

### `GET /company/:id/ac-units/:id/history`
- **Descripción**: Histórico de mantenimientos de la unidad.

---

## Audit

Prefijo: `/company/:id/audit`. Archivo: `apps/backend/src/routes/company/audit.ts`.

### `GET /company/:id/audit`
- **Descripción**: Lista entradas de audit (paginado, filtros). WHERE compartido entre SELECT y COUNT(*) para que `total` siempre refleje el universo que matchea los filtros.
- **Query params**:
  - `entity` (string, ej: `'assets'`, `'maintenances'`, `'canvas_boards'`, `'ac_units'`)
  - `action` (string, ej: `'create'`, `'update'`, `'delete'`, `'complete'`)
  - `from` (ISO date, `createdAt >= from`)
  - `to` (ISO date, se hace `setHours(23,59,59,999)` para incluir el día entero)
  - `page` (default 1), `pageSize` (default 50, max 100)
- **Response**: `{ data: [...], total, page, pageSize }` (formato `buildPageResponse`).

> ⚠️ No hay GET /:id ni GET /entity/:entity/:entityId — filtrar en el cliente con `?entity=X&...` (aunque no hay filtro por `entityId` en el WHERE, solo por `entity` y `action`).

---

## Estadísticas y Reportes

Archivos: `apps/backend/src/routes/company/estadisticas.ts`, `reports.ts`, `reports-filtrado.ts`, `analytics.ts`. **No existe** el subdirectorio `stats/`; los stats viven en los archivos individuales.

### Estadísticas (`/estadisticas`)

Prefijo: `/company/:id/estadisticas`. Archivo: `estadisticas.ts`. `modulo` = `'mantenimiento' | 'combustible' | 'peajes' | 'checklist' | 'alertas' | 'ac' | 'asignaciones' | 'conductores' | 'flotas' | 'vehiculos'`.

### `GET /company/:id/estadisticas/:modulo`
- **Descripción**: Estadísticas de un módulo. Query: `from`, `to`, `assetId` (opcional).

### `GET /company/:id/estadisticas/:modulo/multi`
- **Descripción**: Estadísticas de un módulo con múltiples KPIs (comparativa interna).

### `GET /company/:id/estadisticas/:modulo/multi-entidad`
- **Descripción**: Estadísticas agrupadas por entidad (ej: por vehículo, por conductor). Query: `from`, `to`.

### `GET /company/:id/estadisticas/:modulo/anomalias`
- **Descripción**: Detecta anomalías del módulo (outliers).

### `POST /company/:id/estadisticas/redetectar`
- **Descripción**: Re-detecta anomalías y actualiza flags.

### `POST /company/:id/estadisticas/cleanup`
- **Descripción**: Limpia datos viejos/duplicados.

### `POST /company/:id/estadisticas/:modulo/exportar-pdf`
- **Descripción**: Exporta el reporte del módulo a PDF. Body: `{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "filtros": {...} }`. **Response**: `application/pdf` (stream) o `{ url: "..." }` según implementación.

### `POST /company/:id/estadisticas/:modulo/analisis-ia`
- **Descripción**: Análisis con IA de las estadísticas del módulo. Body: `{ "prompt": "...", "from": "...", "to": "..." }`.

### Reports (`/reports`)

Prefijo: `/company/:id/reports`. Archivo: `reports.ts`. **NO devuelve reportes generados**, devuelve **JSON de datos filtrados** (no es un sistema de generación de PDFs). Los paths terminan en `.json` (es un feature para que el front pueda guardar la URL tal cual).

### `GET /company/:id/reports/maintenance.json`
- **Descripción**: Reporte de mantenimiento. Query: `from`, `to`, `assetId`.

### `GET /company/:id/reports/maintenance/workshop.json`
- **Descripción**: Reporte de mantenimiento agrupado por taller.

### `GET /company/:id/reports/maintenance/supplier.json`
- **Descripción**: Reporte de mantenimiento agrupado por proveedor.

### `GET /company/:id/reports/maintenance/reauthorizations.json`
- **Descripción**: Reporte de reautorizaciones de checklist.

### Reports Filtrado (`/reports/filtrado`)

Prefijo: `/company/:id/reports/filtrado`. Archivo: `reports-filtrado.ts`. Reportes multi-dimensionales con filtros avanzados.

### `GET /company/:id/reports/filtrado/cascade`
- **Descripción**: Reporte en cascada (cascading filters — nivel 1 → nivel 2 → nivel 3).

### `GET /company/:id/reports/filtrado/details`
- **Descripción**: Detalle del reporte filtrado (drill-down).

### Analytics (`/analytics`)

Prefijo: `/company/:id/analytics`. Archivo: `analytics.ts`. Endpoints de dashboard, todos `GET`.

### `GET /company/:id/analytics/dashboard`
- **Descripción**: Datos del dashboard principal (KPIs globales).

### `GET /company/:id/analytics/fleet`
- **Descripción**: Stats de la flota. Requiere `flotas`.

### `GET /company/:id/analytics/maintenance`
- **Descripción**: Stats de mantenimiento (distribución por tipo, costo, etc.).

### `GET /company/:id/analytics/fuel`
- **Descripción**: Stats de combustible (consumo, costo por km, etc.).

### `GET /company/:id/analytics/dashboard-extended/consumo-por-conductor`
- **Descripción**: Consumo de combustible por conductor.

### `GET /company/:id/analytics/dashboard-extended/estado-asignaciones`
- **Descripción**: Estado de las asignaciones (activas/finalizadas/sin asignar).

### `GET /company/:id/analytics/dashboard-extended/disponibilidad-conductores`
- **Descripción**: Conductores disponibles hoy.

### `GET /company/:id/analytics/dashboard-extended/mis-vehiculos`
- **Descripción**: Vehículos del usuario actual (si es conductor).

### `GET /company/:id/analytics/dashboard-extended/polizas-por-vencer`
- **Descripción**: Pólizas de seguro próximas a vencer (90/60/30 días).

### `GET /company/:id/analytics/dashboard-extended/cobertura-activos`
- **Descripción**: % de activos con seguro / mantenimiento / checklist al día.

### `GET /company/:id/analytics/dashboard-extended/kpis-checklists`
- **Descripción**: KPIs de checklists (completados hoy, pendientes, anomalías).

### `GET /company/:id/analytics/dashboard-extended/checklists-pendientes`
- **Descripción**: Checklists pendientes de firma.

### `GET /company/:id/analytics/dashboard-extended/proximo-cambio-aceite`
- **Descripción**: Vehículos con próximo cambio de aceite (km o fecha).

### `GET /company/:id/analytics/dashboard-extended/kpis-ac`
- **Descripción**: KPIs del módulo AC (unidades, servicios, refrigerante).

### `GET /company/:id/analytics/dashboard-extended/servicios-ac-pendientes`
- **Descripción**: Servicios AC pendientes.

### `GET /company/:id/analytics/dashboard-extended/actividad-por-usuario`
- **Descripción**: Actividad reciente por usuario.

### `GET /company/:id/analytics/dashboard-extended/actividad-por-entidad`
- **Descripción**: Actividad reciente por entidad (asset, driver, etc.).

### `GET /company/:id/analytics/maintenance-costs-by-workshop`
- **Descripción**: Costos de mantenimiento agrupados por taller.

### `GET /company/:id/analytics/carwash-costs`
- **Descripción**: Costos de lavado (carwash).

### `GET /company/:id/analytics/maintenance-costs-by-type`
- **Descripción**: Costos de mantenimiento por tipo (Preventivo, Correctivo, etc.).

> ⚠️ Los paths `/analytics/dashboards` y `/analytics/dashboards/:id` que aparecen en algunas docs son **INVENTADOS** — el endpoint real es `/analytics/dashboard` (singular, sin `:id`).

---

## Finanzas - Caja Chica

Prefijo: `/company/:id/finance`. Archivo: `apps/backend/src/routes/company/finance-petty-cash.ts` (montado en `router.use('/finance', ...)`). Módulo grande con 18+ endpoints.

### `GET /company/:id/finance/petty-cash`
- **Descripción**: Lista cajas chicas activas de la empresa.

### `POST /company/:id/finance/petty-cash`
- **Descripción**: Crea caja chica. Body: `{ "name": "*", "currency": "USD", "initialBalance": 0, "responsibleUserId": "company-user-N" }`.

### `POST /company/:id/finance/petty-cash/replenish`
- **Descripción**: Reabastece una caja chica (admin/owner). Body: `{ "accountId": "petty-cash-N", "amount": 500, "notes": "..." }`.

### `GET /company/:id/finance/petty-cash/closed`
- **Descripción**: Lista cajas chicas CERRADAS (histórico).

### `GET /company/:id/finance/petty-cash/accounts/:accountId/flow`
- **Descripción**: Flujo de efectivo (timeline de in/out) de una cuenta. Query: `from`, `to`.

### `GET /company/:id/finance/requests`
- **Descripción**: Lista solicitudes de recursos (vouchers pendientes de aprobación).

### `POST /company/:id/finance/requests`
- **Descripción**: Operador pide un recurso. Body: `{ "amount": 50, "purpose": "*", "categoryId": "..." }`.

### `GET /company/:id/finance/requests/:id`
- **Descripción**: Detalle de una solicitud.

### `PATCH /company/:id/finance/requests/:id/review`
- **Descripción**: Aprueba o rechaza la solicitud. Body: `{ "decision": "approve|reject", "reason": "..." }`.

### `DELETE /company/:id/finance/requests/:id`
- **Descripción**: Borra la solicitud.

### `GET /company/:id/finance/vouchers`
- **Descripción**: Lista vales emitidos.

### `GET /company/:id/finance/vouchers/:id/pdf`
- **Descripción**: Descarga el vale como PDF.

### `PATCH /company/:id/finance/vouchers/:id/close`
- **Descripción**: Cierra el vale (status: cerrado). Body: `{ "closeReason": "..." }`.

### `POST /company/:id/finance/vouchers/:id/invoice`
- **Descripción**: Adjunta una factura al vale. Body: `{ "invoiceId": "factura-N" }` o multipart con foto.

### `POST /company/:id/finance/vouchers/:id/close-from-maintenance`
- **Descripción**: Cierra un vale desde un mantenimiento (crea la factura automáticamente).

### `GET /company/:id/finance/transactions`
- **Descripción**: Historial completo de transacciones (paginada). Query: `from`, `to`, `accountId`, `type`.

### `GET /company/:id/finance/transactions/export.pdf`
- **Descripción**: Exporta transacciones a PDF. Query: `from`, `to`, `accountId`.

### `GET /company/:id/finance/maintenance/:maintenanceId/status`
- **Descripción**: Estado financiero de un mantenimiento (facturas asociadas, vale generado, etc.).

> ⚠️ La doc original mencionaba `/accounts`, `/accounts/:id/movements`, `/movements`, `/vouchers` (POST/PATCH) — la API actual NO tiene esos paths exactos. Las acciones de cuenta/vales se hacen vía `/requests`, `/vouchers/:id/...`.

---

## Finanzas - Facturas

Tres sub-recursos: `finance-invoices` (datos), `finance-invoice-types` (catálogo), `finance-invoice-reviews` (workflow).

### Facturas (`/finance-invoices`)

Prefijo: `/company/:id/finance-invoices` (con guión). Archivo: `apps/backend/src/routes/company/finance-invoices.ts`.

### `GET /company/:id/finance-invoices`
- **Descripción**: Lista facturas (paginado, filtros).
- **Query params**: `page`, `pageSize`, `status` (vigente|anulada|revision), `from`, `to`, `category`, `supplierId`.

### `GET /company/:id/finance-invoices/stats`
- **Descripción**: Estadísticas agregadas de facturas (totales, promedios, distribuciones). Query: `from`, `to`.

### `GET /company/:id/finance-invoices/drill`
- **Descripción**: Drill-down multidimensional (exploración interactiva). Query: `dim1`, `dim2`, `from`, `to`.

### `GET /company/:id/finance-invoices/:id`
- **Descripción**: Factura específica con items y adjuntos. **Nota**: hay 2 handlers `router.get('/:id')` en el archivo (línea 1656 y 1899); Express toma el segundo, que es el de jul 2026 con shape `ApiFinanceInvoice` hidratada. **Response**: `ApiFinanceInvoice` object.

### `GET /company/:id/finance-invoices/:id/pdf`
- **Descripción**: Descarga la factura como PDF.

### `GET /company/:id/finance-invoices/:id/csv`
- **Descripción**: Descarga los items de la factura como CSV.

### `GET /company/:id/finance-invoices/:id/xlsx`
- **Descripción**: Descarga los items como Excel.

### `GET /company/:id/finance-invoices/:id/txt`
- **Descripción**: Descarga los items como texto plano.

### `PATCH /company/:id/finance-invoices/:id/notes`
- **Descripción**: Edita las notas de la factura. Body: `{ "notes": "..." }`.

### Tipos de Factura (`/finance-invoice-types`)

Prefijo: `/company/:id/finance-invoice-types`. Archivo: `finance-invoice-types.ts`. Catálogo de tipos (categorías contables).

### `GET /company/:id/finance-invoice-types`
- **Descripción**: Lista tipos.

### `POST /company/:id/finance-invoice-types`
- **Descripción**: Crea tipo. Body: `{ "name": "*", "code": "...", "ivaDefault": 15 }`. **Response 201**: `Type object completo` (NO `{ok, id}`).

### `PATCH /company/:id/finance-invoice-types/:typeId`
- **Descripción**: Edita.

### `DELETE /company/:id/finance-invoice-types/:typeId`
- **Descripción**: Borra.

### Revisiones (`/finance/invoice-reviews`)

Prefijo: `/company/:id/finance/invoice-reviews` (montado en `/finance`, NO `/finance-invoice-reviews`). Archivo: `finance-invoice-reviews.ts`. Workflow de revisión de facturas.

### `GET /company/:id/finance/invoice-reviews`
- **Descripción**: Lista revisiones por estado. Query: `tab=`, `status=`.

### `GET /company/:id/finance/invoice-reviews/:id`
- **Descripción**: Detalle de una revisión.

### `POST /company/:id/finance/invoice-reviews/:id/seen`
- **Descripción**: Marca como vista por el revisor.

### `POST /company/:id/finance/invoice-reviews/:id/start`
- **Descripción**: Inicia el checklist de revisión.

### `POST /company/:id/finance/invoice-reviews/:id/approve`
- **Descripción**: Aprueba la revisión. Body: `{ "notes": "..." }`.

### `POST /company/:id/finance/invoice-reviews/:id/send-to-correction`
- **Descripción**: Envía a corrección (con observaciones). Body: `{ "corrections": ["...", "..."] }`.

### `POST /company/:id/finance/invoice-reviews/:id/reupload`
- **Descripción**: Sube nueva foto/factura para reemplazar.

### `GET /company/:id/finance/invoice-reviews/:id/timeline`
- **Descripción**: Timeline de eventos de la revisión.

> ⚠️ **Endpoint inventado que NO existe**: `POST /company/:id/finance-invoices` (o `POST /finance-invoices`) para CREAR facturas directamente. La API NO tiene ese endpoint — las facturas se crean **a través del módulo de mantenimientos** cuando se sube una factura como adjunto de un mantenimiento (ver `POST /company/:id/maintenances/:id/attachments` con `kind: "repuesto" | "mano_obra" | "lavada"`). Si necesitás registrar una factura suelta, hay que agregarla vía migración de BD o crear el endpoint.

> ⚠️ **El path de reviews NO es `/finance-invoice-reviews` (con guión)** — es `/finance/invoice-reviews` (con barra), porque está montado en `router.use('/finance', ...)` (el mismo router que caja chica). El nombre de archivo `finance-invoice-reviews.ts` confunde.

---

## Jarvis / AI

Prefijo: `/company/:id/ai/...`. Archivo: `apps/backend/src/routes/company/jarvis.ts` (~1342 líneas). **Todos los endpoints requieren `requireModule('jarvis', 'asistente')`**.

### TTS

### `POST /company/:id/ai/tts`
- **Descripción**: Text-to-speech. Devuelve audio (mp3/wav). Usa Piper (principal) + ElevenLabs (fallback). Body: `{ "text": "*", "voice": "es_ES-davefx-medium", "provider": "piper|elevenlabs" }`.

### `GET /company/:id/ai/tts/voices`
- **Descripción**: Lista de voces disponibles (Piper + ElevenLabs). **Response**: `{ piper: ["es_ES-davefx-medium", ...], elevenlabs: ["Rachel", ...] }`.

### Chat

### `POST /company/:id/ai/chat`
- **Descripción**: Chat con Jarvis (no streaming). Devuelve JSON con la respuesta completa. Body: `{ "message": "*", "conversationId": "?", "voiceMode": false, "currentModule": "?" }`. **Response**: `{ message, conversationId, toolCalls?, usage? }`.

### `POST /company/:id/ai/chat/stream`
- **Descripción**: Chat con Jarvis (streaming SSE). Devuelve eventos `chunk`, `tool`, `fallback`, `done`. Body: mismo que `/chat`. **Es el endpoint principal del chat en el frontend** (FloatingAiAssistant).

### `GET /company/:id/ai/conversations`
- **Descripción**: Lista conversaciones del usuario actual. **Query params**: `limit`, `offset`.

### `GET /company/:id/ai/conversations/:cid`
- **Descripción**: Conversación específica con todos los mensajes.

### `PATCH /company/:id/ai/conversations/:cid`
- **Descripción**: Edita (ej: renombrar). Body: `{ "title": "..." }`.

### `DELETE /company/:id/ai/conversations/:cid`
- **Descripción**: Borra una conversación.

### `GET /company/:id/ai/conversations/:cid/messages`
- **Descripción**: Lista mensajes de la conversación. Query: `from`, `to`, `limit`.

### `GET /company/:id/ai/conversations/:cid/export`
- **Descripción**: Exporta la conversación a PDF/texto. **Response**: `application/pdf` o `text/plain` según `?format=`.

### Tools & Cache

### `GET /company/:id/ai/tools`
- **Descripción**: Lista de tools que Jarvis puede usar (para debug / inspección). **Response**: `{ tools: [{ name, kind, layer, cacheTtlMs, description }, ...] }`.

### `GET /company/:id/ai/cache/stats`
- **Descripción**: Stats del cache: total entries, hits, misses, size.

### `DELETE /company/:id/ai/cache`
- **Descripción**: Invalida el cache de tools de Jarvis para esta empresa. Body opcional: `{ "toolName": "...", "scope": "company|all" }`.

### Admin & Voice

### `POST /company/:id/ai/admin/trigger-summary`
- **Descripción**: Trigger manual del history summarizer (comprime historial de una conversación). Body: `{ "conversationId": "cid", "force": true }`.

### `GET /company/:id/ai/admin/stats`
- **Descripción**: Métricas de uso de Jarvis (llamadas, latencias, cache hits, fallback rate).

### `POST /company/:id/ai/voice`
- **Descripción**: Voz → texto (STT). Recibe audio y devuelve transcripción. Body: multipart con campo `audio` (file de audio). Usa Vosk (reconocedor local).

### Tools de Jarvis (resumen)
Ver `apps/backend/src/lib/ai/tools/`. Categorías:

- **Lectura (kind=read)**: getVehiculos, getMantenimientos, getCombustible, getSeguros, getChecklists, getAsignaciones, getConductores, getPeajes, getTalleres, getStats, getAlertas, getAuditoria, getCajaChica, getCumplimiento, getFacturas, getFinanceRequests, getMaintenanceData, etc.
- **Creación (kind=create)**: createMaintenance, createAlert, createInvoice, createFinanceRequest, addDriverReport, createVehicleNote. **Estas devuelven un `proposal` que requiere confirmación humana** (ver sistema de modal en el frontend, jul 2026).
- **Acción directa (legacy)**: scheduleMaintenance, createAlert (v1), changeVehicleStatus, addVehicleNote (legacy), registerFuelEntry, flagVehicleForMaintenance. **Estas ejecutan directo** sin modal (jul 2026).

> **Pendiente**: migrar las tools de "acción directa" al patrón de proposal + modal. Ver `apps/backend/src/lib/ai/tools/write-wrapper.ts` para la infraestructura ya implementada.

---

## Upload

Prefijo: `/upload`. Archivo: `apps/backend/src/routes/upload.ts` (~919 líneas). **Módulo grande con 20+ endpoints**, todos `multipart/form-data`. **Todos requieren `?companyId=` en query string** (validado por `validateUploadCompanyId`).

> Los nombres de campo en multipart varían: `photos` (array) o `file` (único). Revisar el endpoint específico.

### `POST /upload/asset-photos`
- **Descripción**: Sube fotos de vehículos. Carpeta: `assets/`.

### `POST /upload/maintenance-photos`
- **Descripción**: Sube fotos de mantenimiento. Carpeta: `maintenance/`.

### `POST /upload/ac-photos`
- **Descripción**: Sube fotos de unidades AC. Carpeta: `ac/`.

### `POST /upload/assignment-photos`
- **Descripción**: Sube fotos de asignaciones (handover).

### `POST /upload/toll-photos`
- **Descripción**: Sube fotos de peajes.

### `POST /upload/driver-photos`
- **Descripción**: Sube fotos de conductores.

### `POST /upload/user-photos`
- **Descripción**: Sube fotos de usuarios.

### `POST /upload/exit-auth-photos`
- **Descripción**: Sube fotos de autorizaciones de salida.

### `POST /upload/exit-auth-video`
- **Descripción**: Sube video completo de autorización de salida.

### `POST /upload/exit-auth-video-chunk`
- **Descripción**: Sube chunk de video (upload segmentado). Headers: `X-Chunk-Index`, `X-Chunk-Total`, `X-Upload-Id`.

### `POST /upload/part-photos`
- **Descripción**: Sube foto de un repuesto/item de mantenimiento. Usado por el drawer de mantenimientos.

### `POST /upload/fuel-photos`
- **Descripción**: Sube foto de factura de combustible.

### `POST /upload/checklist-photos`
- **Descripción**: Sube fotos de checklist.

### `POST /upload/handover-pdf`
- **Descripción**: Genera el PDF de handover (entrega de vehículo).

### `POST /upload/invoice-files`
- **Descripción**: Sube archivos de factura (imagen o PDF).

### `POST /upload/maintenance-evidence`
- **Descripción**: Sube evidencia adicional de mantenimiento (fotos + docs).

### `POST /upload/insurance-files`
- **Descripción**: Sube archivos de seguro (pólizas).

### `POST /upload/photos`
- **Descripción**: Sube fotos genéricas (multipart). Devuelve `{ urls: ["..."] }`.

### `POST /upload/file`
- **Descripción**: Sube un archivo único (multipart con campo `file`). Devuelve `{ url, type, name, size }`.

### `DELETE /upload/file`
- **Descripción**: Borra un archivo subido. Query: `?url=...`.

### `POST /upload/finance-receipts`
- **Descripción**: Sube comprobante financiero (imagen o PDF) para facturas standalone del módulo Caja Chica (jul 2026 v4). Devuelve `{ url, type, name, size }`.

### `GET /uploads/*`
- **Descripción**: Sirve archivos estáticos desde el directorio configurado. Ver `apps/backend/src/app.ts:60`. **`companyId` se pasa en query string**, NO en path.

> ⚠️ **No hay** `/upload/maintenance-attachments`, `/upload/finance`, `/upload/temp`, `/upload/voice` — los nombres correctos son los de arriba. `/upload/voice` en realidad es `POST /ai/voice` (dentro de `/company/:id/ai/voice`).

---

## Oil Check

Prefijo: `/oil-check`. Archivo: `apps/backend/src/routes/oil-check.ts`. **Requiere auth** (`authenticate` middleware). `companyId` se pasa en query string (NO en path).

### `POST /oil-check`
- **Descripción**: Sube foto de aceite para análisis con IA. **Query params**: `companyId`, `assetId`, `technicianId` (todos requeridos). **Body**: multipart con campo `photo` (file). **Response 201**: `{ analysis: {...}, assetId, ... }`.

### `GET /oil-check`
- **Descripción**: Lista escaneos previos. **Query params**: `companyId` (requerido), `assetId` (opcional, filtra por vehículo). **Response**: `{ data: [...], total }`.

> ⚠️ **No hay** `POST /oil-check/scan` ni `GET /oil-check/:token`. El path es `POST /` y `GET /` (sin prefijo de acción). El "token" del flujo QR vive en la tabla `oil_check_tokens` (generado en otra parte del sistema).

---

## Public

Prefijo: `/public`. Archivo: `apps/backend/src/routes/public.ts`. **Público, sin auth** (datos para la landing page).

### `GET /public/plans`
- **Descripción**: Planes disponibles (precios, features). **Response**: `{ data: [{ id, name, price, features, ... }] }`.

### `GET /public/config`
- **Descripción**: Configuración pública (versión de la app, flags de marketing, contacto).

### `GET /public/staff/verify/:token`
- **Descripción**: Verifica un token de staff (link de invitación). Devuelve info del usuario + permisos.

> ⚠️ **No hay** `/public/landing/stats` ni `/public/features`. La landing page usa `/public/plans` y `/public/config`.

---

## Platform (superadmin)

Prefijo: `/platform`. Archivos: `apps/backend/src/routes/platform/*`. **Requiere `scope=plataforma` en el JWT** (cookie con superadmin). **Rate-limit dedicado**: 200 read/min + 60 write/min por (user + IP).

### `/platform/state`

#### `GET /platform/state`
- **Descripción**: Snapshot inicial del superadmin. Devuelve empresas, planes, módulos, usuarios globales, conteos por rol. Alimenta el dashboard de superadmin. **Response**: `{ companies: [...], globalUsers: [...], plans: [...] }`.

### `/platform/companies` (`companies.ts`)

#### `GET /platform/companies`
- **Descripción**: Lista todas las empresas registradas.

#### `GET /platform/companies/:id`
- **Descripción**: Detalle de una empresa.

#### `POST /platform/companies`
- **Descripción**: Crea empresa. Body: `{ "name": "*", "slug": "*", "planId": "...", "industry": "...", "country": "EC", "city": "...", "contactName": "...", "contactEmail": "...", "contactPhone": "...", "trialEndsAt": "..." }`. **Response 201**: `Company object`.

#### `PUT /platform/companies/:id`
- **Descripción**: Edita (nombre, plan, módulos habilitados). **NOTA: usa PUT, no PATCH**.

#### `DELETE /platform/companies/:id`
- **Descripción**: Borra (soft-delete). Requiere `superadmin`.

#### `GET /platform/companies/:id/limits`
- **Descripción**: Límites del plan actual + uso actual (usuarios, vehículos, módulos).

### `/platform/companies/:id/ai-*` (`companies-ai.ts`, jul 2026 v6)

Endpoints de IA por empresa (kill-switch, settings, usage, test). Montado en `/platform/companies` (NO pisa a `companiesRouter`).

#### `GET /platform/companies/:id/ai-settings`
- **Descripción**: AI settings de una empresa (sin la key).

#### `GET /platform/companies/:id/ai-usage`
- **Descripción**: Métricas de uso de IA (calls, tokens, latencias, cost) en un período. **Query params**: `from`, `to`.

#### `POST /platform/companies/:id/ai-disable`
- **Descripción**: Deshabilita IA para la empresa (kill-switch). Body: `{ "reason": "..." }`.

#### `POST /platform/companies/:id/ai-enable`
- **Descripción**: Reactiva IA.

> ⚠️ **No hay** `PUT /:id/ai-settings` ni `POST /:id/ai-test` en la plataforma. Esos endpoints están en `/company/:id/ai-settings` (de la empresa, no del superadmin).

### `/platform/users` (`users.ts`)

#### `GET /platform/users`
- **Descripción**: Lista usuarios globales de la plataforma.

#### `POST /platform/users`
- **Descripción**: Crea usuario global. Body: `{ "email": "*", "username": "*", "role": "super_admin", "name": "..." }`.

#### `PUT /platform/users/:id`
- **Descripción**: Edita usuario global.

#### `DELETE /platform/users/:id`
- **Descripción**: Borra (soft-delete). Requiere `superadmin`.

### `/platform/platform-users` (`platform-users.ts`)

> ⚠️ `users.ts` y `platform-users.ts` son archivos separados que montan routers distintos. Si bien solían ser alias legacy, en la versión actual ambos exponen CRUD sobre el mismo dominio (usuarios con scope=plataforma). Mantener ambos en sync.

#### `GET /platform/platform-users`
- **Descripción**: Lista superadmins (alias de `/platform/users`).

#### `POST /platform/platform-users`
- **Descripción**: Crea superadmin. Body: `{ "email": "*", "password": "*", "name": "*", "role": "super_admin" }`.

#### `PUT /platform/platform-users/:id`
- **Descripción**: Edita.

#### `DELETE /platform/platform-users/:id`
- **Descripción**: Borra.

### `/platform/plans` (`plans.ts`)

#### `GET /platform/plans`
- **Descripción**: Lista planes.

#### `GET /platform/plans/:id`
- **Descripción**: Plan específico con módulos.

#### `POST /platform/plans`
- **Descripción**: Crea plan. Body: `{ "name": "*", "price": 99, "modules": ["mantenimiento", "combustible", ...] }`.

#### `PUT /platform/plans/:id`
- **Descripción**: Edita plan.

#### `DELETE /platform/plans/:id`
- **Descripción**: Borra.

#### `POST /platform/plans/:id/modules/:moduleId`
- **Descripción**: Asocia un módulo al plan.

#### `DELETE /platform/plans/:id/modules/:moduleId`
- **Descripción**: Quita un módulo del plan.

### `/platform/modules` (`modules.ts`)

#### `GET /platform/modules`
- **Descripción**: Lista módulos disponibles (mantenimiento, combustible, finance, etc.).

#### `GET /platform/modules/all`
- **Descripción**: Lista TODOS los módulos, incluyendo los deshabilitados (cross-tenant).

#### `GET /platform/modules/:id`
- **Descripción**: Detalle.

#### `POST /platform/modules`
- **Descripción**: Crea módulo. Requiere `superadmin`.

#### `PUT /platform/modules/:id`
- **Descripción**: Edita.

#### `DELETE /platform/modules/:id`
- **Descripción**: Borra.

### `/platform/settings` (`settings.ts`)

#### `GET /platform/settings`
- **Descripción**: Configuración global (lockout, defaults, feature flags).

#### `PUT /platform/settings`
- **Descripción**: Edita. Requiere `superadmin`.

### `/platform/stats` (`stats.ts`)

#### `GET /platform/stats`
- **Descripción**: Métricas globales (MRR, empresas activas, churn, signups). Query: `from`, `to`.

> ⚠️ **No hay** `/stats/overview`, `/stats/companies`, `/stats/revenue` — el endpoint único `/stats` devuelve todo.

### `/platform/audit` (`audit.ts`)

#### `GET /platform/audit/stats`
- **Descripción**: Stats de audit (totales por acción, top usuarios).

#### `GET /platform/audit`
- **Descripción**: Lista de acciones de superadmin. Query: `action`, `from`, `to`.

### `/platform/fleet-health` (`fleet-health.ts`)

#### `GET /platform/fleet-health`
- **Descripción**: Health score global de todas las empresas. Query: `from`, `to`.

> ⚠️ **No hay** `/fleet-health/companies`, `/fleet-health/companies/:id` ni `/fleet-health/global-anomalies` como sub-paths. El endpoint único devuelve el global.

### `/platform/tickets` (`ticket.ts`) — soporte a empresas

#### `GET /platform/tickets`
- **Descripción**: Lista tickets de soporte de todas las empresas. Query: `status`, `companyId`, `from`, `to`.

#### `GET /platform/tickets/:id`
- **Descripción**: Detalle de un ticket.

#### `PUT /platform/tickets/:id`
- **Descripción**: Edita (assignee, status, priority). Body: `{ "status": "open|in_progress|resolved|closed", "assigneeId": "company-user-N" }`.

#### `POST /platform/tickets/:id/messages`
- **Descripción**: Responde (mensaje público a la empresa). Body: `{ "text": "*", "internal": false }`.

> ⚠️ **Path real** es `/platform/tickets` (con `s` final), NO `/platform/ticket`.

---

## Endpoints globales (debug)

### `GET /health`
- **Descripción**: Health check básico.
- **Response 200**: `{ "status": "ok", "timestamp": "2026-07-30T12:00:00Z" }`

### `GET /metrics`
- **Descripción**: Métricas Prometheus (texto plano).
- **Response 200**: Texto plano formato Prometheus. Incluye métricas de Jarvis (tools calls, latencias, cache hits), HTTP, etc.

### `GET /ws-stats`
- **Descripción**: Estadísticas de WebSockets activos.

### `GET /ws-chat-stats`
- **Descripción**: Estadísticas de chat WebSocket.

---

## Notas finales

- **Versión del documento**: jul 2026 (revisar contra `git log` para saber si hay endpoints nuevos).
- **Pendientes**:
  1. Sistema de modal de confirmación en el frontend para tools de escritura de Jarvis (ver sección "Jarvis / AI").
  2. Endpoints `/platform/companies-ai` ya implementados en backend pero no listados en la sección Platform (cubierto parcialmente bajo "AI Settings por empresa").
  3. Algunas tools del catalog v3 (`createInvoice`, `createFinanceRequest`) usan el patrón de proposal pero el modal del frontend todavía no está implementado.
- **Para contribuir**: mantener este archivo en sync con `apps/backend/src/routes/`. Agregar nuevos endpoints siguiendo el formato `### \`METHOD /ruta\``.
- **Contacto**: equipo de desarrollo interno. Issues en el repo del proyecto.
