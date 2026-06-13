# Plan de Mantenimientos v2 + Notificaciones

> Estado al 2026-06-13. Este documento refleja TODO lo conversado y ejecutado en el sprint.
> Tareas ✅ = listas · ⏳ = pendientes · 🚧 = en curso

---

## 1. Contexto y decisiones

### 1.1 El módulo debe verse así en el menú
```
Mantenimientos
├── Agendar                       (calendario grande + panel drag&drop)
├── Preventivo y correctivo       (lista con tabla + paginación 7)
├── Primordiales
│   ├── Bombas e inyectores       (filtro por category)
│   └── Motores                   (filtro por category)
└── Aceites
    ├── Cambios de aceite         (filtro por category)
    └── Inventario                (reusa Mantenimientos/Inventario legacy)

Gestión
├── Flotas
├── Conductores
├── Sedes
├── Garajes
├── Asignar vehículo
├── Seguros vehiculares
├── Talleres                       ← movido aquí desde Mantenimientos
└── Proveedores                    ← movido aquí desde Mantenimientos
```

Notificaciones **NO** aparece en el sidebar: es una funcionalidad transversal, siempre activa, ya está la campanita en el header.

### 1.2 Decisiones técnicas

- **PDF**: server-side con `jspdf` + `jspdf-autotable` (ya instalados). Estilo empresarial con header, bandas alternadas, totales, paginación. 3 reportes: por taller, por proveedor, general.
- **PDF bonito (estilo acta)**: client-side con `@react-pdf/renderer` (ya instalado) — futuro, no prioritario.
- **Cron**: `node-cron` dentro del proceso, con flag `MAINTENANCE_CRON_ENABLED`. 3 jobs:
  - Cada hora: notificar Programados vencidos.
  - Cada 15 min: revisar mantenimientos `km_based` (umbral cruzado).
  - Diario 06:00: reagendar mensuales como defensa.
- **Periodicidad por km**: nuevo endpoint `POST /api/company/:id/assets/:assetId/odometer` que dispara revisión de `km_based` para ese vehículo.
- **Periodicidad reactiva**: al marcar un mantenimiento como Completado, el rescheduler crea el siguiente con la regla que toque (`weekly` / `days(N)` / `monthly` / `km_based(K)`) y notifica.
- **Notificaciones in-app**: insertar en `company_notifications` + emitir WS al usuario (`{ type: 'notification', data: ... }`). FCM push opcional si hay token (configurable via `FIREBASE_SERVICE_ACCOUNT_JSON`).
- **Aislamiento por empresa**: TODAS las queries filtran por `companyId`. Admin puede pasar `?scope=all` para ver todas las de la empresa.
- **React Query**: faltaba el `QueryClientProvider` en `main.tsx`. Ya agregado. Config: `staleTime 30s, retry 1, refetchOnWindowFocus false`.

### 1.3 Lo que ya NO se hace (y por qué)

- **No tabla separada** para "Primordiales" o "Aceites": son categorías dentro de la misma tabla `company_maintenance_records` (`category` enum). Más simple de reportar y filtrar.
- **No carpeta "Aceites / Inventario" nueva**: reusa `Mantenimientos/Inventario/page.tsx` legacy (que ya lista tipos de aceite y stock).
- **No "Notificaciones" como módulo**: no aparece en el sidebar ni en el module-tree.

---

## 2. Modelo de datos (BD)

### 2.1 Tablas nuevas (0006_maintenance_v2.sql)
| Tabla | Propósito |
|---|---|
| `company_workshops` | Talleres donde se hacen los mantenimientos |
| `company_suppliers` | Proveedores de repuestos/insumos |
| `company_odometer_readings` | Historial de lecturas de km del vehículo |
| `company_maintenance_records` | Registro unificado de mantenimientos (reemplaza `company_maintenances`) |
| `company_maintenance_items` | Repuestos/insumos por mantenimiento (FK a `company_maintenance_records` y opcional a `company_suppliers`) |
| `company_notifications` | Notificaciones in-app (per-user) |
| `company_device_tokens` | Tokens FCM/Web Push de dispositivos |

### 2.2 Enums nuevos
| Enum | Valores |
|---|---|
| `maintenance_type_enum` | `Preventivo` \| `Correctivo` \| `Programado` |
| `maintenance_status_enum` | `Programado` \| `En curso` \| `PendienteAtencion` \| `Completado` \| `Cancelado` |
| `maintenance_category_enum` | `Primordial:Bombas` \| `Primordial:Motores` \| `Aceite:Cambio` \| `Aceite:Inventario` \| `Otro` |
| `maintenance_cadence_enum` | `none` \| `weekly` \| `days` \| `monthly` \| `km_based` |
| `notification_kind_enum` | `maintenance_due` \| `maintenance_scheduled` \| `maintenance_completed` \| `maintenance_overshoot_km` \| `workshop_assigned` \| `supplier_invoice` \| `system` |
| `device_platform_enum` | `android` \| `ios` \| `web` |

### 2.3 Campos clave de `company_maintenance_records`
- `cadence_kind` + `cadence_value` + `next_trigger_km` (para `km_based`).
- `parent_id` (self-FK) — apunta al mantenimiento original del cual se clonó al reagendar.
- `total_cost` (computed, no DB-generated — se calcula en el endpoint al cambiar items).
- `created_by` / `completed_by` → FK a `company_users`.
- `workshop_id` → FK a `company_workshops`.

### 2.4 Tabla legacy
- `company_maintenances` (la vieja) → **`DROP TABLE IF EXISTS company_maintenances CASCADE`** en la 0006 (estaba vacía, confirmado por el usuario).
- Los **submódulos legacy** `mantenimiento.ordenes`, `inventario`, `oil` del module-tree → **se quitan**. Los permisos default de `Accesos/Usuarios` se migran a los nombres nuevos.

### 2.5 Índices
- `company_maintenance_records(status, scheduled_for)` — para el cron y la agenda.
- `company_maintenance_records(asset_id, cadence_kind, next_trigger_km) WHERE cadence_kind='km_based'` — para sweep por km.
- `company_notifications(user_id, read_at, created_at DESC)` — para "no leídas" y listado.
- `company_odometer_readings(asset_id, taken_at DESC)` — última lectura del vehículo.

---

## 3. Backend

### 3.1 Rutas nuevas (montadas en `routes/company/index.ts`)
| Método | Path | Permiso | Función |
|---|---|---|---|
| `GET` | `/workshops` | `gestion.workshops.ver` | Listar talleres (con `?q=`) |
| `GET` | `/workshops/:id` | `gestion.workshops.ver` | Detalle |
| `POST` | `/workshops` | `gestion.workshops.crear` + admin | Crear |
| `PUT` | `/workshops/:id` | `gestion.workshops.editar` + admin | Editar |
| `DELETE` | `/workshops/:id` | `gestion.workshops.eliminar` + admin | Borrar |
| `GET` | `/suppliers` | `gestion.suppliers.ver` | Listar proveedores |
| `GET/POST/PUT/DELETE` | `/suppliers[/:id]` | `gestion.suppliers.*` | CRUD |
| `GET` | `/assets/:assetId/odometer` | `maintenance.records.ver` | Listar lecturas de odómetro |
| `POST` | `/assets/:assetId/odometer` | `maintenance.records.crear` | Insertar lectura + disparar sweep km_based |
| `GET/POST/PUT/DELETE` | `/maintenances[/:id]` | `maintenance.execution.*` | CRUD principal |
| `GET` | `/maintenances/agenda` | `maintenance.agenda.ver` | Listado para calendario (rango `from`/`to`) |
| `GET` | `/maintenances/:id/items` | `maintenance.records.ver` | Repuestos del mantenimiento |
| `POST` | `/maintenances/:id/complete` | `maintenance.execution.editar` + supervisor | Marcar completado + reagendar + notificar |
| `POST` | `/maintenances/:id/cancel` | `maintenance.execution.editar` + supervisor | Cancelar |
| `GET` | `/notifications` | `maintenance.notifications.ver` | Listar (con `?unreadOnly`, `?scope=all`, `?limit`) |
| `GET` | `/notifications/unread-count` | `maintenance.notifications.ver` | Contador |
| `PATCH` | `/notifications/:id/read` | `maintenance.notifications.editar` | Marcar leída |
| `PATCH` | `/notifications/read-all` | `maintenance.notifications.editar` | Marcar todas |
| `POST/DELETE` | `/notifications/devices[/...]` | `maintenance.notifications.ver` | Registrar / eliminar token FCM |
| `GET` | `/reports/maintenance.pdf` | `maintenance.records.ver` | PDF general |
| `GET` | `/reports/maintenance/workshop/:id.pdf` | `maintenance.records.ver` | PDF por taller |
| `GET` | `/reports/maintenance/supplier/:id.pdf` | `maintenance.records.ver` | PDF por proveedor |

### 3.2 Servicios (`lib/`)
- **`notification-service.ts`**: `notify(userId, companyId, kind, title, body, payload)` — in-app + WS + FCM lazy. `notifyAdmins(companyId, args)` — notifica a todos los admins. `markAllRead(companyId, userId)`.
- **`maintenance-rescheduler.ts`**: `rescheduleCompletedMaintenance(args)` — crea el siguiente mantenimiento según la periodicidad. `notifyOverdueProgrammed(graceHours=24)` — sweep de vencidos. `sweepKmBasedTriggers(companyId)` — revisa umbral de km.
- **`cron/maintenance.ts`**: 3 jobs con `node-cron`, registrados solo si `MAINTENANCE_CRON_ENABLED=true`.

### 3.3 Notificaciones: audiencia y aislamiento
- `notify(userId)` → un usuario específico.
- `notifyAdmins(companyId)` → todos los `owner_empresa` y `admin_empresa` de la empresa.
- **Siempre** filtrado por `companyId`. **Nunca** se filtra a otra empresa.
- El payload `jsonb` guarda `{ maintenanceId, assetId, ... }` para que el frontend pueda navegar al hacer click.

### 3.4 Triggers de notificación
| Evento | Notificación disparada |
|---|---|
| Mantenimiento **Programado** se pasa de fecha +24h (cron) | `maintenance_due` |
| Mantenimiento **Completado** con periodicidad → se reagenda | `maintenance_scheduled` |
| Mantenimiento **Completado** | `maintenance_completed` |
| Mantenimiento `km_based` cuya lectura de odómetro cruzó el umbral | `maintenance_overshoot_km` |
| Mantenimiento creado con `workshopId` | `workshop_assigned` |
| Item de mantenimiento con `supplierId` | `supplier_invoice` (futuro, no auto) |

---

## 4. Frontend

### 4.1 Estructura de archivos nuevos
```
apps/frontend/src/
├── pages/
│   ├── Mantenimientos/
│   │   ├── page.tsx                                  (HUB con sub-tabs: Agendar, Preventivo, Primordiales x2, Aceites x2)
│   │   ├── Agendar.tsx                               (FullCalendar + DndContext + panel de vehículos)
│   │   └── components/
│   │       ├── MaintenanceFormModal.tsx              (crear/editar/completar, mismo modal)
│   │       ├── MaintenanceListTab.tsx                (tabla genérica con paginación 7, reusada en todos los tabs)
│   │       ├── WorkshopsManager.tsx                  (queda en Mantenimientos como componente, pero la URL es /gestion/talleres)
│   │       └── SuppliersManager.tsx                  (igual, URL /gestion/proveedores)
│   └── Gestion/
│       ├── Talleres/page.tsx                         ← ruta nueva
│       └── Proveedores/page.tsx                      ← ruta nueva
├── hooks/
│   ├── useMaintenancesV2.ts                          (CRUD + agenda + complete + cancel)
│   ├── useWorkshops.ts
│   ├── useSuppliers.ts
│   └── useNotifications.ts
├── components/features/notifications/
│   └── NotificationsBell.tsx                         (campanita + popover + WebSocket en vivo + toast)
└── lib/
    └── module-tree.ts                                (limpio, sin legacy, talleres/proveedores en gestion)
```

### 4.2 Componentes clave

**`Agendar.tsx`** — split layout:
- **Izquierda** (280px en desktop, oculto en móvil): panel scrollable de vehículos, cada uno con `@dnd-kit` `useDraggable`. Buscador arriba. Leyenda de colores de estado.
- **Derecha**: `@fullcalendar/react` con plugins `dayGridMonth`, `timeGridWeek`, `listWeek`, `interaction`. Droppable en toda la grilla (DndContext arriba). Al soltar vehículo → modal prellenado con `assetId` + fecha. Click en evento → editar. Selección de rango → modal vacío. Vista mes/semana/lista. Locale `es`. Botones "Hoy / Mes / Semana / Lista". Exportar PDF en el header.

**`MaintenanceFormModal.tsx`** — modal centrado:
- Campos: vehículo, fecha, taller, tipo (3 botones), categoría (select), título, descripción, periodicidad (cadence + value), odómetro (solo en complete), items (dinámico, calcula total), notas.
- 3 modos según props: `crear` / `editar` / `completar` (los textos del header y botón cambian).

**`MaintenanceListTab.tsx`** — tabla con:
- Paginación 7.
- Filtros: search, status, type. Filtro de categorías por props (los tabs lo pasan).
- Badges por tipo (Preventivo/Correctivo/Programado) y estado (Programado/En curso/Pendiente atención/Completado/Cancelado).
- Acciones: editar (canEdit), eliminar (canDelete), con confirmación.
- Botón "PDF" en toolbar.
- Botón "Nuevo" en toolbar (canCreate).

**`NotificationsBell.tsx`** — popover + WS:
- Badge con contador de no-leídas.
- Popover con las últimas 10, botón "Marcar todas", click individual marca como leída.
- WebSocket en `useEffect` que se conecta a `ws://host:5000/ws?companyId=X`, escucha `{ type: 'notification' }`, hace refetch, dispara `toast()` y opcionalmente `Audio('/notification.mp3')`.
- Solo se conecta si `companyId` existe (es decir, si el usuario está logueado).

**`ModulePageHeader.tsx`** — header reusable (ya existía) que muestra título + descripción.

### 4.3 Permisos granulares (módulo-tree final)
```ts
gestion: {
  flotas, conductores, sedes, garajes, asignaciones, seguros,
  talleres,       // ← nuevo
  proveedores,    // ← nuevo
}
mantenimiento: {
  agenda,         // ver calendario
  execution,      // crear/editar/completar/cancelar
  records,        // ver histórico + export PDF
}
// (talleres/suppliers/notifications sacados del module-tree, gestionan via:
//   gestion.workshops.{ver,crear,editar,eliminar}
//   gestion.suppliers.{ver,crear,editar,eliminar}
//   notifications: no requiere permiso, siempre activo, userId = req.user.sub)
```

### 4.4 Routes (App.tsx)
```
/mantenimiento                       → MantenimientosPage (HUB)
/mantenimiento/agenda                → Agendar (sub-tab, no ruta nueva, state interno)
/mantenimiento/...                   → tabs internos (state interno, no rutas)

/gestion                             → Gestión
/gestion/talleres                    → Talleres (nueva ruta)
/gestion/proveedores                 → Proveedores (nueva ruta)
```

### 4.5 Responsive (mobile-first)
- Sub-tabs con `overflow-x-auto` para scroll horizontal.
- Tablas con `min-w-[720px]` o `min-w-[920px]` + `overflow-x-auto`.
- Modal: `max-w-2xl`, padding `px-4 sm:px-6`, footer `flex-col sm:flex-row`.
- Agendar: en móvil, el panel de vehículos arriba como accordion, calendario abajo a ancho completo.
- NotificationsBell: popover `w-[360px] max-w-[calc(100vw-2rem)]`.

---

## 5. Notificaciones: canales y comportamiento

### 5.1 Canales (en orden de prioridad)
1. **In-app** (siempre) → fila en `company_notifications`.
2. **WebSocket** (siempre) → push en tiempo real al destinatario.
3. **Web Push del navegador** (futuro, con VAPID).
4. **FCM push** (cuando se configure Firebase) → APK + Web.

### 5.2 Firebase (configuración pendiente)
- Crear proyecto Firebase, descargar `serviceAccountKey.json`.
- Guardar en `apps/backend/firebase.json` (NO commitear, agregar a `.gitignore`).
- En `.env` del backend: `FIREBASE_SERVICE_ACCOUNT_JSON` con el JSON escapado.
- `firebase-admin` se inicializa **lazy** la primera vez que se necesita. Si no hay env, las llamadas a FCM son no-op silenciosos (in-app + WS siguen funcionando).
- Web Push de navegador: opcional, mismo flujo que FCM con VAPID key en frontend.

### 5.3 Aislamiento y audiencia
- `notify(userId)` → un usuario.
- `notifyAdmins(companyId)` → todos los admin/owner de la empresa.
- **Siempre** filtrado por `companyId`. No hay forma de notificar a otra empresa.

---

## 6. Permisos granulares

### 6.1 Submódulos finales
| Módulo | Submódulo | Acción | Quién |
|---|---|---|---|
| `gestion` | `talleres` | ver/crear/editar/eliminar | admin |
| `gestion` | `proveedores` | ver/crear/editar/eliminar | admin |
| `mantenimiento` | `agenda` | ver | admin, supervisor, operador |
| `mantenimiento` | `execution` | ver/crear/editar | admin, supervisor (crear+editar), operador (ver) |
| `mantenimiento` | `records` | ver + export PDF | admin, supervisor, operador |
| `notifications` | (no requiere permiso, va por userId) | siempre activo | todos |

### 6.2 Defaults nuevos en `Accesos/Usuarios`
Cuando se crea un usuario nuevo o un rol nuevo, los permisos default son:
- `admin_empresa` / `owner_empresa` → todas las acciones de todos los submódulos de maintenance + gestion.talleres + gestion.proveedores.
- `supervisor` → `agenda.ver`, `execution.{ver,crear,editar}`, `records.{ver,exportar}`, `talleres.ver`, `proveedores.ver`.
- `operador` → `agenda.ver`, `execution.ver`, `records.ver`, `talleres.ver`, `proveedores.ver`.
- `conductor` → `agenda.ver` (filtrado a su vehículo), `records.ver` (las propias), `notifications.ver`. (TBD, depende del producto.)

### 6.3 canSeeModule
- Permisivo: si el usuario tiene **cualquier acción** en **cualquier submódulo**, el módulo aparece en el sidebar. Esto ya estaba así del sprint de checklist, lo mantengo.

---

## 7. Archivos modificados / creados (resumen)

### Backend
```
apps/backend/
├── drizzle/
│   ├── 0006_maintenance_v2.sql             ← migración nueva, idempotente
│   └── meta/
│       ├── 0006_snapshot.json              ← regenerado por Drizzle
│       └── _journal.json                   ← entrada 0006 agregada
├── src/
│   ├── db/schema/
│   │   ├── operational.ts                  ← +6 enums, +7 tablas
│   │   └── relations.ts                    ← +7 relations
│   ├── lib/
│   │   ├── notification-service.ts         ← in-app + WS + FCM lazy
│   │   ├── maintenance-rescheduler.ts      ← reagendamiento + sweep km + overdue
│   │   └── cron/maintenance.ts             ← 3 jobs
│   ├── routes/company/
│   │   ├── workshops.ts                    ← CRUD talleres
│   │   ├── suppliers.ts                    ← CRUD proveedores
│   │   ├── odometer.ts                     ← POST lectura + sweep km
│   │   ├── maintenances.ts                 ← CRUD + agenda + complete + cancel
│   │   ├── notifications.ts                ← in-app + device tokens
│   │   ├── reports.ts                      ← 3 PDFs server-side (jspdf)
│   │   └── index.ts                        ← monta las nuevas
│   ├── index.ts                            ← arranca cron
│   └── package.json                        ← +node-cron, +@types/node-cron
```

### Frontend
```
apps/frontend/src/
├── pages/
│   ├── Mantenimientos/
│   │   ├── page.tsx                        ← HUB reescrito
│   │   ├── Agendar.tsx                     ← FullCalendar + DndContext
│   │   └── components/
│   │       ├── MaintenanceFormModal.tsx    ← modal crear/editar/completar
│   │       ├── MaintenanceListTab.tsx      ← tabla genérica con paginación 7
│   │       ├── WorkshopsManager.tsx        ← (se va a mover a Gestion/Talleres)
│   │       └── SuppliersManager.tsx        ← (se va a mover a Gestion/Proveedores)
│   └── Gestion/
│       ├── Talleres/page.tsx               ← (nuevo, mover el manager aquí)
│       └── Proveedores/page.tsx            ← (nuevo, mover el manager aquí)
├── hooks/
│   ├── useMaintenancesV2.ts                ← CRUD + agenda + complete + cancel
│   ├── useWorkshops.ts
│   ├── useSuppliers.ts
│   └── useNotifications.ts                 ← in-app + unread-count + mark read
├── components/features/notifications/
│   └── NotificationsBell.tsx               ← campanita + popover + WS + toast
├── layout/
│   └── AppHeader.tsx                       ← campanita integrada
├── lib/
│   └── module-tree.ts                      ← limpio: talleres/proveedores en gestion
└── main.tsx                                ← +QueryClientProvider (faltaba)
```

---

## 8. Tareas

### ✅ Hecho
- [x] Migración SQL 0006 (idempotente, 7 tablas + 6 enums + DROP legacy + consolidación 0003-0005).
- [x] Schema TS (Drizzle) + relations actualizados, TS limpio.
- [x] Backend: rutas workshops, suppliers, odometer, maintenances, notifications, reports.
- [x] Backend: servicios notification-service, maintenance-rescheduler.
- [x] Backend: cron con flag `MAINTENANCE_CRON_ENABLED`.
- [x] Backend: 3 PDFs server-side con jspdf (general, por taller, por proveedor).
- [x] Backend: FCM lazy + endpoints device tokens.
- [x] Frontend: hooks useMaintenancesV2, useWorkshops, useSuppliers, useNotifications.
- [x] Frontend: pantalla Agendar con FullCalendar + DndContext + drag&drop de vehículos.
- [x] Frontend: modal unificado crear/editar/completar.
- [x] Frontend: tabla con paginación 7 (MaintenanceListTab).
- [x] Frontend: campanita con popover + WebSocket en tiempo real + toast.
- [x] Frontend: campanita integrada en AppHeader.
- [x] Frontend: QueryClientProvider agregado en main.tsx.
- [x] Frontend: TS limpio.

### ⏳ Pendiente (este turno)
- [ ] **Quitar "Legacy" del module-tree** y limpiar submódulos viejos.
- [ ] **Mover Talleres y Proveedores al módulo `gestion`**.
- [ ] **Sacar Notificaciones del module-tree** (no es un submódulo).
- [ ] **Backend**: migrar permisos de `maintenance.workshops` → `gestion.workshops` y `maintenance.suppliers` → `gestion.suppliers`.
- [ ] **Frontend**: mover `WorkshopsManager` y `SuppliersManager` a `pages/Gestion/Talleres/page.tsx` y `pages/Gestion/Proveedores/page.tsx`.
- [ ] **App.tsx**: agregar rutas `/gestion/talleres` y `/gestion/proveedores` (pueden reusar los managers o crear una página wrapper simple).
- [ ] **Sidebar**: verificar que aparezcan bajo "Gestión" y NO bajo "Mantenimiento".
- [ ] **Migrar permisos default en `Accesos/Usuarios`** (si ya hay usuarios con `mantenimiento.ordenes` en su jsonb, necesitamos una migración de datos o aceptar legacy).
- [ ] **TS check** después de mover.
- [ ] **Entregar este `.md` final al usuario.**

### 🚧 Tareas futuras (próximo sprint)
- [ ] Configurar Firebase (proyecto + service account).
- [ ] Web Push de navegador (VAPID key en frontend).
- [ ] Reporte PDF estilo "acta" con `@react-pdf/renderer` (más bonito que jspdf).
- [ ] Permisos del rol `conductor` (revisar qué puede ver de mantenimientos).
- [ ] Revisar si la página legacy `Mantenimientos/Inventario/page.tsx` sigue funcionando con los nuevos permisos.
- [ ] Pruebas E2E del ciclo completo: agendar → completar → reagendar → notificar.

---

## 9. Pendientes del usuario

- [ ] Crear proyecto Firebase, descargar service account, configurar `.env` (cuando quiera push real).
- [ ] Asignar los nuevos permisos a roles en `Accesos/Roles` para los usuarios existentes.
- [ ] Probar end-to-end el ciclo agendar → completar → reagendar → notif.
- [ ] Si la página legacy `Mantenimientos/Inventario` se va a quedar: avisar para migrarla o dejarla coexistir.
