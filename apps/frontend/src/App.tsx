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
import { GeolocationPage } from "./pages/Geolocalizacion/GeolocationPage";

//Landing
import PublicLayout from "./layout/PublicLayout";                          
import LandingPage from "./pages/Landing/page";                          
import SolicitarDemoPage from "./pages/SolicitarDemo/page";             
import PoliticaPrivacidadPage from "./pages/PoliticaPrivacidad/page";



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
  if (!session || session.scope !== "plataforma") return <Navigate to="/platform/signin" replace />;
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
  if (session?.scope === "plataforma") return <Navigate to="/platform/dashboard" replace />;
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

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <Toaster position="top-right" richColors closeButton toastOptions={{ duration: 4000 }} />
      <SessionRefresher />
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
          <Route path="/platform/dashboard" element={<PlatformDashboard />} />
          <Route path="/platform/plans" element={<PlansPage />} />
          <Route path="/platform/companies" element={<CompaniesPage />} />
          <Route path="/platform/companies/:id/ai" element={<CompanyAIPage />} />
          <Route path="/platform/modules" element={<ModulesPage />} />
          <Route path="/platform/users" element={<PlatformUsersPage />} />
          <Route path="/platform/audit" element={<AuditPage />} />
          <Route path="/platform/settings" element={<PlatformSettingsPage />} />
          <Route path="/platform/fleet" element={<FleetHealthPage />} />
          <Route path="/platform/tickets" element={<PlatformTicketsPage />} />
          {/* jul 2026 v6 — Placeholder de Geolocalización en panel master.
              Muestra "Trabajando en el desarrollo del módulo" en vez de
              quedar en blanco. Cuando el feature esté listo, reemplazar
              por la página real. */}
          <Route path="/platform/geolocalizacion" element={<PlatformGeolocationPage />} />
        </Route>

        {/* ── Auth (público) ── */}
        <Route path="/signin" element={<GuestOperacion><SignIn /></GuestOperacion>} />
        <Route path="/platform/signin" element={<GuestPlatform><PlatformSignIn /></GuestPlatform>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}