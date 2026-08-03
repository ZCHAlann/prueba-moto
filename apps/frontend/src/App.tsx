import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router";
import { Toaster } from "sonner";
import { useAuth } from "./context/AuthContext";

// Auth pages
import SignIn from "./pages/AuthPages/SignIn";
import PlatformSignIn from "./pages/AuthPages/Platform/PlatformSignIn";
import NotFound from "./pages/OtherPage/NotFound";

// Layouts
import AppLayout from "./layout/AppLayout";
import PlatformLayout from "./layout/PlatformLayout";

// Operacion pages
import { ScrollToTop } from "./components/common/ScrollToTop";
import { DashboardOverview } from "./pages/Dashboard/page";
import MaintenanceGeneralPage from "./pages/Mantenimientos/page";
import ReauthReportPage from "./pages/Mantenimientos/ReauthReportPage";
// jul 2026 v3 — Submódulo Data de Mantenimientos. Wizard 4 pasos
// (vehículo → módulo → categoría → detalle). El gate `mantenimiento.data.ver`
// se chequea a nivel endpoint (maintenance-data.ts); el `RequireCompanyModule`
// de acá solo asegura que la empresa tenga el módulo "mantenimiento" activo.
import MaintenanceDataPage from "./pages/Mantenimientos/Data";
import AcPage from "./pages/AiresAcondicionados/page";
import AcMaintenancesPage from "./pages/AiresAcondicionados/Mantenimientos/page";
import { ChecklistPage } from "./pages/Checklist/page";
import { AlertsPage } from "./pages/Alertas/page";
import { ReportsPage } from "./pages/Reports/page";
import { CanvasBoardsListPage } from "./pages/Reports/CanvasBoardsListPage";
import { CanvasBoardEditorPage } from "./pages/Reports/CanvasBoardEditorPage";
import { FuelPage } from "./pages/Combustible/page";
import { PeajesPage } from "./pages/Peajes/page";
import { FacturasPage } from "./pages/finanzas/FacturasPage";
import { CajaChicaPage } from "./pages/finanzas/CajaChicaPage";
import { TransaccionesPage } from "./pages/finanzas/TransaccionesPage";
import { EstadisticasPage } from "./pages/finanzas/EstadisticasPage";
import { ProfilePage } from "./pages/Profile/page";
import { SettingsPage } from "./pages/Settings/page";
import FlotasPage from "./pages/Gestion/Flotas/page";
import DriversPage from "./pages/Gestion/Drivers/page";
import { AssignmentsPage } from "./pages/Gestion/Asignaciones/page";
import { GaragesPage } from "./pages/Gestion/Garajes/page";
import { SitesManagementPage } from "./pages/Gestion/Sedes/page";
import { InsuranceManagementPage } from "./pages/Gestion/Seguros/page";
import { GestionTalleresPage } from "./pages/Gestion/Talleres/page";
import { GestionProveedoresPage } from "./pages/Gestion/Proveedores/page";
// jul 2026 v5 — Horario de conductores ya no es ruta propia. Vive
// como TAB dentro de /operaciones/conductores (page.tsx de Drivers).
// Se importa via ./pages/Gestion/Drivers/page.tsx.
import { UsersPage } from "./pages/Accesos/Usuarios/page";
import { RolesPage } from "./pages/Accesos/Roles/page";
import { AutorizacionesPage } from "./pages/Autorizaciones/page";
import SoportePage from "@/pages/Soporte/page";

// Platform pages
import PlatformDashboard from "./pages/Platform/Dashboard/page";
import { PlansPage } from "./pages/Platform/Plans/page";
import { CompaniesPage } from "./pages/Platform/Companies/page";
import { ModulesPage } from "./pages/Platform/Modules/pages";
import { PlatformUsersPage } from "./pages/Platform/Users/page";
import { AuditPage } from "./pages/Platform/Audit/page";
import { PlatformSettingsPage } from "./pages/Platform/Settings/page";
import PlatformGeolocationPage from "./pages/Platform/Geolocalizacion/page";
import { FleetHealthPage } from "./pages/Platform/Flotas/page";
import PlatformTicketsPage from "./pages/Platform/Tickets/page";
import CompanyAIPage from "./pages/Platform/Companies/AISettings/page";
import CompanyAiApiKeysPage from "./pages/Platform/Companies/AiApiKeys/page";
import { GeolocationPage } from "./pages/Geolocalizacion/GeolocationPage";

//Landing
import PublicLayout from "./layout/PublicLayout";
import LandingPage from "./pages/Landing/page";
import SolicitarDemoPage from "./pages/SolicitarDemo/page";
import PoliticaPrivacidadPage from "./pages/PoliticaPrivacidad/page";
// jul 2026 — validación pública de QR de carnets del personal
import VerifyStaffPage from "./pages/VerifyStaff/page";



// ─── Guards ──────────────────────────────────────────────────────────────────

/** Redirige a /signin si no hay sesión de operacion */
function RequireOperacion() {
  const { ready, session } = useAuth();
  if (!ready) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
  if (!session || session.scope !== "operacion") return <Navigate to="/signin" replace />;
  return <AppLayout />;
}

/** Redirige a /platform/signin si no hay sesión de plataforma */
function RequirePlatform() {
  const { ready, session } = useAuth();
  if (!ready) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
    </div>
  );
  if (!session || session.scope !== "plataforma") return <Navigate to="/panel/signin" replace />;
  return <PlatformLayout />;
}

/** Si ya tienes sesión de operacion, salta el login */
function GuestOperacion({ children }: { children: React.ReactNode }) {
  const { ready, session, getHomePath } = useAuth();
  if (!ready) return null;
  if (session?.scope === "operacion") return <Navigate to={getHomePath()} replace />;
  return <>{children}</>;
}

/** Si ya tienes sesión de plataforma, salta el login */
function GuestPlatform({ children }: { children: React.ReactNode }) {
  const { ready, session } = useAuth();
  if (!ready) return null;
  if (session?.scope === "plataforma") return <Navigate to="/panel/dashboard" replace />;
  return <>{children}</>;
}

// jul 2026 v6 — Mapa de rutas a módulos de empresa. Si el admin de la
// empresa intenta entrar a una ruta de un módulo que la empresa NO
// tiene activo, lo redirigimos a /dashboard con un toast. El backend
// también valida con `requireModule(...)` (devuelve 403), pero esta
// capa evita mostrar la pantalla vacía y da mejor UX.
//
// superadmin de plataforma (scope='plataforma') bypasea este check.
const ROUTE_TO_COMPANY_MODULE: Record<string, string> = {
  "/mantenimiento": "mantenimiento",
  "/mantenimiento/data": "mantenimiento",
  "/mantenimiento/reportes/reautorizaciones": "mantenimiento",
  "/checklist": "checklist",
  "/alertas": "alertas",
  "/reportes": "reportes",
  "/lienzo": "lienzo",
  "/combustible": "combustible",
  "/peajes": "peajes",
  "/finanzas/facturas": "finanzas",
  "/finanzas/caja-chica": "finanzas",
  "/finanzas/transacciones": "finanzas",
  "/finanzas/estadisticas": "finanzas",
  "/flotas": "gestion",
  "/operaciones/conductores": "gestion",
  "/operaciones/asignaciones": "gestion",
  "/gestion/garajes": "gestion",
  "/gestion/sedes": "gestion",
  "/gestion/seguros": "seguros",
  "/gestion/talleres": "gestion",
  "/gestion/proveedores": "gestion",
  "/autorizaciones": "autorizaciones",
  "/geolocalizacion": "geolocalizacion",
  "/aires-acondicionados": "ac",
  "/aires-acondicionados/mantenimientos": "ac",
  "/soporte": "soporte",
};

function RequireCompanyModule({ children, module }: { children: React.ReactNode; module: string }) {
  const { session, ready } = useAuth();
  if (!ready) return null;
  // superadmin de plataforma bypasea.
  if (session?.scope === "plataforma") return <>{children}</>;
  // Si no hay companyModules (modo system / sin restricción), dejamos pasar.
  const companyModules = (session?.companyModules ?? []) as string[];
  if (companyModules.length === 0) return <>{children}</>;
  if (companyModules.includes(module)) return <>{children}</>;
  // Empresa no tiene este módulo → redirigir al dashboard.
  return <Navigate to="/dashboard" replace />;
}

/**
 * Vuelve a llamar a /api/auth/session cada vez que cambia la ruta.
 * Esto garantiza que cualquier cambio de permisos/rol que se hizo en
 * otra pestaña (o que el admin acaba de aplicar) se refleje de inmediato
 * sin re-login. La respuesta trae siempre los permisos frescos de BD.
 *
 * Vive acá adentro del <Router> porque necesita useLocation.
 */
function SessionRefresher() {
  const { ready, session, refreshSession } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!ready || !session) return;
    refreshSession();
    // refreshSession es estable (useCallback) y solo se llama al cambiar
    // de ruta. No la incluimos en deps para evitar re-fires en cada
    // cambio de referencia de su closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, ready, session?.scope]);

  return null;
}

/**
 * Para la landing y solicitar-demo: si el usuario ya tiene sesion de
 * operacion, lo mandamos directo a su panel. Si tiene sesion de plataforma,
 * dejamos pasar (puede querer ver el sitio publico igual).
 */
function GuestLanding({ children }: { children: React.ReactNode }) {
  const { ready, session, getHomePath } = useAuth();
  if (!ready) return null;
  if (session?.scope === "operacion") return <Navigate to={getHomePath()} replace />;
  return <>{children}</>;
}

// ─── Título de pestaña (jul 2026 v6) ──────────────────────────────────────────
//
// Por defecto el <title> del HTML es el nombre del proyecto ("ApliSmart
// Motors"). Eso se ve feo en la pestaña del browser cuando uno navega
// entre módulos: "ApliSmart Motors" para todos. Este componente escucha
// useLocation y setea el título según la ruta.
//
// Formato: "ApliSmart Motors  ·  {Nombre del módulo}" (separador punto
// medio para que sea fácil de escanear cuando hay varias pestañas
// abiertas del mismo sitio).
//
// Las rutas se matchean en orden: las más específicas primero
// (ej `/mantenimiento/data` antes de `/mantenimiento`). Si no hay
// match, se usa un fallback con el primer segmento de la URL.
const ROUTE_TITLES: Array<{ prefix: string; title: string }> = [
  // ── Plataformas (superadmin) ──
  { prefix: '/panel/dashboard',      title: 'Panel · Dashboard' },
  { prefix: '/panel/plans',         title: 'Panel · Planes' },
  { prefix: '/panel/companies',     title: 'Panel · Empresas' },
  { prefix: '/panel/companies/.*/ai-api-keys', title: 'Panel · API Keys IA' },
  { prefix: '/panel/companies/.*/ai', title: 'Panel · IA de empresa' },
  { prefix: '/panel/modules',       title: 'Panel · Módulos' },
  { prefix: '/panel/users',         title: 'Panel · Usuarios' },
  { prefix: '/panel/audit',         title: 'Panel · Auditoría' },
  { prefix: '/panel/settings',      title: 'Panel · Configuración' },
  { prefix: '/panel/fleet',         title: 'Panel · Salud de flota' },
  { prefix: '/panel/tickets',       title: 'Panel · Tickets' },
  { prefix: '/panel/geolocalizacion', title: 'Panel · Geolocalización' },
  // ── Operación (admin/supervisor/técnico) ──
  { prefix: '/dashboard',           title: 'Dashboard' },
  { prefix: '/perfil',              title: 'Mi perfil' },
  { prefix: '/configuracion',       title: 'Configuración' },
  { prefix: '/accesos/usuarios',    title: 'Configuración · Usuarios' },
  { prefix: '/accesos/roles',       title: 'Configuración · Roles' },
  { prefix: '/mantenimiento/data',  title: 'Mantenimiento · Datos' },
  { prefix: '/mantenimiento/reportes/reautorizaciones', title: 'Mantenimiento · Reautorizaciones' },
  { prefix: '/mantenimiento',       title: 'Mantenimiento' },
  { prefix: '/checklist',           title: 'Inspecciones' },
  { prefix: '/alertas',             title: 'Alertas' },
  { prefix: '/reportes',            title: 'Reportes' },
  { prefix: '/lienzo',              title: 'Lienzo de reportes' },
  { prefix: '/combustible',         title: 'Combustible' },
  { prefix: '/peajes',              title: 'Peajes' },
  { prefix: '/finanzas/facturas',   title: 'Finanzas · Facturas' },
  { prefix: '/finanzas/caja-chica', title: 'Finanzas · Caja chica' },
  { prefix: '/finanzas/transacciones', title: 'Finanzas · Transacciones' },
  { prefix: '/finanzas/estadisticas', title: 'Finanzas · Estadísticas' },
  { prefix: '/flotas',              title: 'Flotas' },
  { prefix: '/operaciones/conductores', title: 'Operaciones · Conductores' },
  { prefix: '/operaciones/asignaciones', title: 'Operaciones · Asignaciones' },
  { prefix: '/gestion/garajes',     title: 'Gestión · Garajes' },
  { prefix: '/gestion/sedes',       title: 'Gestión · Sedes' },
  { prefix: '/gestion/seguros',     title: 'Gestión · Seguros' },
  { prefix: '/gestion/talleres',    title: 'Gestión · Talleres' },
  { prefix: '/gestion/proveedores', title: 'Gestión · Proveedores' },
  { prefix: '/autorizaciones',      title: 'Autorizaciones de salida' },
  { prefix: '/soporte',             title: 'Soporte' },
  { prefix: '/geolocalizacion',     title: 'Geolocalización' },
  { prefix: '/aires-acondicionados/mantenimientos', title: 'Aires acondicionados · Mantenimientos' },
  { prefix: '/aires-acondicionados', title: 'Aires acondicionados' },
  // ── Públicas ──
  { prefix: '/solicitar-demo',      title: 'Solicitar demo' },
  { prefix: '/signin',              title: 'Iniciar sesión' },
  { prefix: '/panel/signin',        title: 'Panel · Iniciar sesión' },
  { prefix: '/verify/',             title: 'Verificar carnet' },
  { prefix: '/politica-privacidad', title: 'Política de privacidad' },
];

const PRODUCT_NAME = 'ApliSmart Motors';

/**
 * Devuelve el título a mostrar en la pestaña según el pathname.
 * Si no hay match, devuelve "ApliSmart Motors · {primer segmento}".
 */
function titleForPath(pathname: string): string {
  for (const r of ROUTE_TITLES) {
    if (r.prefix.includes('.*')) {
      // regex prefix
      const re = new RegExp('^' + r.prefix.replace(/\*/g, '[^/]+') + '$');
      if (re.test(pathname)) return `${PRODUCT_NAME} · ${r.title}`;
    } else if (pathname === r.prefix || pathname.startsWith(r.prefix + '/')) {
      return `${PRODUCT_NAME} · ${r.title}`;
    }
  }
  // Fallback: primer segmento
  const seg = pathname.split('/').filter(Boolean)[0] ?? '';
  const pretty = seg
    ? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')
    : 'Inicio';
  return `${PRODUCT_NAME} · ${pretty}`;
}

function DocumentTitle() {
  const location = useLocation();
  useEffect(() => {
    document.title = titleForPath(location.pathname);
  }, [location.pathname]);
  return null;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <Toaster position="top-right" richColors closeButton toastOptions={{ duration: 4000 }} />
      <SessionRefresher />
      <DocumentTitle />
      <Routes>

        {/* ── Publico (no autenticado) ── */}
        <Route element={<PublicLayout />}>
          <Route
            path="/"
            element={
              <GuestLanding>
                <LandingPage />
              </GuestLanding>
            }
          />
          <Route
            path="/solicitar-demo"
            element={
              <GuestLanding>
                <SolicitarDemoPage />
              </GuestLanding>
            }
          />
          <Route path="/politica-privacidad" element={<PoliticaPrivacidadPage />} />
          {/* jul 2026 — ruta pública de validación de QR de carnets. Un
              supervisor escanea el QR con su celu y abre esta URL; el
              backend verifica el token y devuelve datos mínimos. */}
          <Route path="/verify/:token" element={<VerifyStaffPage />} />
        </Route>

        {/* ── Operacion ── */}
        <Route element={<RequireOperacion />}>
          <Route path="/dashboard" element={<DashboardOverview />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/configuracion" element={<SettingsPage />} />
          <Route path="/accesos/usuarios" element={<UsersPage />} />
          <Route path="/accesos/roles" element={<RolesPage />} />

          {/* jul 2026 v6 — Cada ruta de módulo de empresa se envuelve
              con RequireCompanyModule. Si la empresa no tiene el módulo
              activo, redirige a /dashboard. Backend valida con
              requireModule() como segunda línea de defensa. */}
          <Route path="/mantenimiento" element={
            <RequireCompanyModule module="mantenimiento">
              <MaintenanceGeneralPage />
            </RequireCompanyModule>
          } />
          {/* jul 2026 v3 — Submódulo Data. Requiere el módulo mantenimiento
              activo. El gate granular `mantenimiento.data.ver` lo evalúa
              el endpoint `maintenance-data.ts`. Si el user no lo tiene,
              el backend responde 403 y la página muestra un mensaje
              claro (no se renderiza contenido). */}
          <Route path="/mantenimiento/data" element={
            <RequireCompanyModule module="mantenimiento">
              <MaintenanceDataPage />
            </RequireCompanyModule>
          } />
          <Route path="/mantenimiento/reportes/reautorizaciones" element={
            <RequireCompanyModule module="mantenimiento">
              <ReauthReportPage />
            </RequireCompanyModule>
          } />
          <Route path="/checklist" element={
            <RequireCompanyModule module="checklist">
              <ChecklistPage />
            </RequireCompanyModule>
          } />
          <Route path="/alertas" element={
            <RequireCompanyModule module="alertas">
              <AlertsPage />
            </RequireCompanyModule>
          } />
          <Route path="/reportes" element={
            <RequireCompanyModule module="reportes">
              <ReportsPage />
            </RequireCompanyModule>
          } />
          <Route path="/lienzo" element={
            <RequireCompanyModule module="lienzo">
              <CanvasBoardsListPage />
            </RequireCompanyModule>
          } />
          <Route path="/lienzo/:boardId" element={
            <RequireCompanyModule module="lienzo">
              <CanvasBoardEditorPage />
            </RequireCompanyModule>
          } />
          <Route path="/combustible" element={
            <RequireCompanyModule module="combustible">
              <FuelPage />
            </RequireCompanyModule>
          } />
          <Route path="/peajes" element={
            <RequireCompanyModule module="peajes">
              <PeajesPage />
            </RequireCompanyModule>
          } />
          <Route path="/finanzas/facturas" element={
            <RequireCompanyModule module="finanzas">
              <FacturasPage />
            </RequireCompanyModule>
          } />
          <Route path="/finanzas/caja-chica" element={
            <RequireCompanyModule module="finanzas">
              <CajaChicaPage />
            </RequireCompanyModule>
          } />
          <Route path="/finanzas/transacciones" element={
            <RequireCompanyModule module="finanzas">
              <TransaccionesPage />
            </RequireCompanyModule>
          } />
          <Route path="/finanzas/estadisticas" element={
            <RequireCompanyModule module="finanzas">
              <EstadisticasPage />
            </RequireCompanyModule>
          } />
          <Route path="/flotas" element={
            <RequireCompanyModule module="gestion">
              <FlotasPage />
            </RequireCompanyModule>
          } />
          <Route path="/operaciones/conductores" element={
            <RequireCompanyModule module="gestion">
              <DriversPage />
            </RequireCompanyModule>
          } />
          <Route path="/operaciones/asignaciones" element={
            <RequireCompanyModule module="gestion">
              <AssignmentsPage />
            </RequireCompanyModule>
          } />
          <Route path="/gestion/garajes" element={
            <RequireCompanyModule module="gestion">
              <GaragesPage />
            </RequireCompanyModule>
          } />
          <Route path="/gestion/sedes" element={
            <RequireCompanyModule module="gestion">
              <SitesManagementPage />
            </RequireCompanyModule>
          } />
          <Route path="/gestion/seguros" element={
            <RequireCompanyModule module="seguros">
              <InsuranceManagementPage />
            </RequireCompanyModule>
          } />
          <Route path="/gestion/talleres" element={
            <RequireCompanyModule module="gestion">
              <GestionTalleresPage />
            </RequireCompanyModule>
          } />
          <Route path="/gestion/proveedores" element={
            <RequireCompanyModule module="gestion">
              <GestionProveedoresPage />
            </RequireCompanyModule>
          } />
          <Route path="/autorizaciones" element={
            <RequireCompanyModule module="autorizaciones">
              <AutorizacionesPage />
            </RequireCompanyModule>
          } />
          <Route path="/soporte" element={
            <RequireCompanyModule module="soporte">
              <SoportePage />
            </RequireCompanyModule>
          } />
          <Route path="/geolocalizacion" element={
            <RequireCompanyModule module="geolocalizacion">
              <GeolocationPage />
            </RequireCompanyModule>
          } />
          <Route path="/aires-acondicionados" element={
            <RequireCompanyModule module="ac">
              <AcPage />
            </RequireCompanyModule>
          } />
          <Route path="/aires-acondicionados/mantenimientos" element={
            <RequireCompanyModule module="ac">
              <AcMaintenancesPage />
            </RequireCompanyModule>
          } />
        </Route>

        {/* ── Plataforma ── */}
        <Route element={<RequirePlatform />}>
          <Route path="/panel/dashboard" element={<PlatformDashboard />} />
          <Route path="/panel/plans" element={<PlansPage />} />
          <Route path="/panel/companies" element={<CompaniesPage />} />
          <Route path="/panel/companies/:id/ai" element={<CompanyAIPage />} />
          <Route path="/panel/companies/:id/ai-api-keys" element={<CompanyAiApiKeysPage />} />
          <Route path="/panel/modules" element={<ModulesPage />} />
          <Route path="/panel/users" element={<PlatformUsersPage />} />
          <Route path="/panel/audit" element={<AuditPage />} />
          <Route path="/panel/settings" element={<PlatformSettingsPage />} />
          <Route path="/panel/fleet" element={<FleetHealthPage />} />
          <Route path="/panel/tickets" element={<PlatformTicketsPage />} />
          {/* jul 2026 v6 — Placeholder de Geolocalización en panel master.
              Muestra "Trabajando en el desarrollo del módulo" en vez de
              quedar en blanco. Cuando el feature esté listo, reemplazar
              por la página real. */}
          <Route path="/panel/geolocalizacion" element={<PlatformGeolocationPage />} />
        </Route>

        {/* ── Auth (público) ── */}
        <Route path="/signin" element={<GuestOperacion><SignIn /></GuestOperacion>} />
        <Route path="/panel/signin" element={<GuestPlatform><PlatformSignIn /></GuestPlatform>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}