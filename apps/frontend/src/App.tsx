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
import { LeadsPage } from "./pages/Platform/Leads/page";
import { ModulesPage } from "./pages/Platform/Modules/pages";
import { PlatformUsersPage } from "./pages/Platform/Users/page";
import { AuditPage } from "./pages/Platform/Audit/page";
import { PlatformSettingsPage } from "./pages/Platform/Settings/page";
import { CRMPage } from "./pages/CRM/page";
import { BillingPage } from "./pages/Platform/Billing/page";
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
          <Route path="/mantenimiento" element={<MaintenanceGeneralPage />} />
          <Route path="/mantenimiento/reportes/reautorizaciones" element={<ReauthReportPage />} />
          <Route path="/checklist" element={<ChecklistPage />} />
          <Route path="/alertas" element={<AlertsPage />} />
          <Route path="/reportes" element={<ReportsPage />} />
          <Route path="/lienzo" element={<CanvasBoardsListPage />} />
          <Route path="/lienzo/:boardId" element={<CanvasBoardEditorPage />} />
          <Route path="/combustible" element={<FuelPage />} />
          <Route path="/peajes" element={<PeajesPage />} />
          <Route path="/finanzas/facturas" element={<FacturasPage />} />
          <Route path="/finanzas/caja-chica" element={<CajaChicaPage />} />
          <Route path="/finanzas/transacciones" element={<TransaccionesPage />} />
          <Route path="/finanzas/estadisticas" element={<EstadisticasPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/configuracion" element={<SettingsPage />} />
          <Route path="/flotas" element={<FlotasPage />} />
          <Route path="/operaciones/conductores" element={<DriversPage />} />
          <Route path="/operaciones/asignaciones" element={<AssignmentsPage />} />
          <Route path="/gestion/garajes" element={<GaragesPage />} />
          <Route path="/gestion/sedes" element={<SitesManagementPage />} />
          <Route path="/gestion/seguros" element={<InsuranceManagementPage />} />
          <Route path="/gestion/talleres" element={<GestionTalleresPage />} />
          <Route path="/gestion/proveedores" element={<GestionProveedoresPage />} />
          <Route path="/accesos/usuarios" element={<UsersPage />} />
          <Route path="/accesos/roles" element={<RolesPage />} />
          <Route path="/autorizaciones" element={<AutorizacionesPage />} />
          <Route path="/soporte" element={<SoportePage />} />
          <Route path="/geolocalizacion" element={<GeolocationPage />} />
          <Route path="/aires-acondicionados" element={<AcPage />} />
          <Route path="/aires-acondicionados/mantenimientos" element={<AcMaintenancesPage />} />
        </Route>

        {/* ── Plataforma ── */}
        <Route element={<RequirePlatform />}>
          <Route path="/platform/dashboard" element={<PlatformDashboard />} />
          <Route path="/platform/plans" element={<PlansPage />} />
          <Route path="/platform/companies" element={<CompaniesPage />} />
          <Route path="/platform/companies/:id/ai" element={<CompanyAIPage />} />
          <Route path="/platform/leads" element={<LeadsPage />} />
          <Route path="/platform/modules" element={<ModulesPage />} />
          <Route path="/platform/users" element={<PlatformUsersPage />} />
          <Route path="/platform/audit" element={<AuditPage />} />
          <Route path="/platform/settings" element={<PlatformSettingsPage />} />
          <Route path="/platform/crm" element={<CRMPage />} />
          <Route path="/platform/billing" element={<BillingPage />} />
          <Route path="/platform/fleet" element={<FleetHealthPage />} />
          <Route path="/platform/tickets" element={<PlatformTicketsPage />} />
        </Route>

        {/* ── Auth (público) ── */}
        <Route path="/signin" element={<GuestOperacion><SignIn /></GuestOperacion>} />
        <Route path="/platform/signin" element={<GuestPlatform><PlatformSignIn /></GuestPlatform>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}