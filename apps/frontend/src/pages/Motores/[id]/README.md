# VehicleCockpit — Frontend (Fase 2)

Componentes en TypeScript listos para integrarse al proyecto
`motors-aplismart` (Vite + React Router + Recharts + Leaflet).

## 📦 Estructura entregada

```
vehicles/  (copia a src/components/vehiculo/ o donde prefieras)
├── VehicleCockpit.tsx              ← componente raíz
├── page.tsx                        ← entrypoint para la ruta [id]
├── hooks/                          ← 11 hooks tipados
├── tabs/                           ← 3 pestañas
├── cards/                          ← 4 cards del tab Vehículo
├── modals/                         ← 5 modales
├── stats/                          ← 4 charts del tab Estadísticas
└── common/                         ← CockpitModal + ChartCard
```

## 🚀 Pasos para integrar

### 1) Copiar archivos

```bash
# Toda la carpeta va a:
#   apps/frontend/src/components/vehiculo/

cp -r frontend-changes/* \
  apps/frontend/src/components/vehiculo/
```

### 2) Registrar la ruta en tu router

Tu proyecto usa React Router (vi el `useParams` en el árbol).
En el archivo donde defines las rutas, agrega:

```tsx
const VehicleCockpitPage = lazy(() =>
  import('./components/vehiculo/page').then(m => ({ default: m.default }))
);

<Route path="/motores/:id" element={<VehicleCockpitPage />} />
```

Si tu ruta actual de detalle de motor es otra (ej. `/vehicles/:id`),
ajusta el `path` pero el resto queda igual.

### 3) Instalar deps (si no las tienes)

```bash
npm install leaflet react-leaflet recharts
npm install -D @types/leaflet
```

> Los `import 'leaflet/dist/leaflet.css'` ya están en `CardLocation.tsx`
> y `TabRutas.tsx`. Si tu bundler no procesa el CSS, importa el CSS en
> tu entry point (`main.tsx` o `App.tsx`).

### 4) Verificar el import del `AuthContext`

`page.tsx` lee `companyId` desde tu `AuthContext`. Si tu context expone
otro nombre, ajusta este bloque:

```ts
// apps/frontend/src/components/vehiculo/page.tsx
const auth = useAuth() as { user?: AuthUser } | undefined;
const rawId = auth?.user?.companyId ?? auth?.user?.company?.id ?? null;
```

Si tu context tiene `user.companyId` directo, ya funciona.
Si tiene otra forma (ej. `user.empresa.id`), cámbialo ahí.

### 5) Verificar middlewares backend

El backend nuevo está en `/workspace/backend-changes/`. Antes de probar
el frontend asegúrate de haber:

- Copiado los 4 archivos al backend
- Corrido la migración SQL
- Reiniciado el servidor backend

## 🧩 Lo que se conecta a qué backend

| Componente              | Endpoint                                                        |
|-------------------------|-----------------------------------------------------------------|
| `useVehicleCockpit`     | `GET /api/company/{cid}/vehicle-cockpit/{aid}`                  |
| `useVehicleLocation`    | `GET /api/company/{cid}/vehicle-cockpit/{aid}/location`         |
| `useDailyUsage`         | `GET .../daily-usage?date=YYYY-MM-DD`                           |
| `useStats*`             | `GET .../stats/{fuel\|maintenances\|odometer\|costs}`           |
| `useVehicleRoutes`      | `GET\|POST .../routes`                                          |
| `useAssetNotes`         | `GET\|POST .../notes`, `DELETE .../notes/{id}`                  |
| `useToggleEngine`       | `POST .../engine-toggle`                                        |
| `useToggleLock`         | `POST .../lock-toggle`                                          |
| `useToggleAssetStatus`  | `PATCH .../status`                                              |
| `useEndAssignment`      | `PATCH /api/company/{cid}/assignments/{id}`                     |

## ⚠️ Cosas a tener en cuenta

1. **El botón "Activar / Desactivar" del AI Assistant** está conectado
   a un `alert()` placeholder. Para wirearlo de verdad, en
   `TabVehiculo.tsx` busca el `onAction` y reemplaza el alert por la
   llamada a `useToggleAssetStatus` (toggle entre 'Operativo' y
   'Fuera de servicio').

2. **El botón "Asignar conductor"** del modal conductor abre un `alert()`
   con un mensaje. Para wirearlo al wizard de acta existente, en
   `ModalConductor.tsx` busca el `onClick` del botón de la lista y
   reemplaza el `alert()` por la apertura del modal de creación de
   acta, pasándole el `driverId` y `assetId`.

3. **El modal de Seguros** usa los endpoints `/api/company/{cid}/insurance/`
   que ya existen en tu backend. Si la ruta es otra, ajusta las URLs
   en `ModalSeguros.tsx`.

4. **El mapa** carga tiles de CartoCDN. Si necesitas acceso sin internet
   desde tu red local, configura un proxy o usa un tile server propio.

5. **El toast/feedback** está hecho con `alert()` para mantener los
   componentes simples. Cámbialo por tu librería de toasts preferida
   (son 4-5 lugares).

## 🧪 Smoke test

1. Inicia sesión en el frontend.
2. Navega a `/motores/{cualquierId}`.
3. Deberías ver el cockpit con:
   - Header con nombre del vehículo + tabs
   - Foto (o placeholder) + card AI Assistant flotante
   - 3 cards inferiores (mapa, acciones, gráfica)
   - Botón "Registrar nota" abajo
4. Click en cada tab y verifica que:
   - **Estadísticas** muestra 4 charts con fondo oscuro
   - **Rutas** muestra mapa + tabla; click en fila dibuja polyline

## 📝 Siguiente fase (opcional)

- Reemplazar `alert()` por toasts
- Wirear el botón "Asignar conductor" al wizard de acta
- Conectar el toggle del AI Assistant al status del vehículo
- Agregar upload de fotos al modal de configuración
- Animaciones de transición entre tabs
