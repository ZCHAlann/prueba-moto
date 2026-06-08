import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router";
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
import { MotorsPage } from "./pages/Motores/page";
import MaintenancesPage from "./pages/Motores/Mantenimientos/page";
import HistorialPage from "./pages/Motores/Historial/page";
import MaintenanceGeneralPage from "./pages/Mantenimientos/page";
import MaintenanceInventoryPage from "./pages/Mantenimientos/Inventario/page";
import MaintenanceOilPage from "./pages/Mantenimientos/Oil/page";
import MotorCockpitPage from "./pages/Motores/[id]/page";
import AcPage from "./pages/AiresAcondicionados/page";
import AcMaintenancesPage from "./pages/AiresAcondicionados/Mantenimientos/page";
import { ChecklistPage } from "./pages/Checklist/page";
import { AlertsPage } from "./pages/Alertas/page";
import { ReportsPage } from "./pages/Reports/page";
import { FuelPage } from "./pages/Combustible/page";
import { ProfilePage } from "./pages/Profile/page";
import { SettingsPage } from "./pages/Settings/page";
import FlotasPage from "./pages/Gestion/Flotas/page";
import DriversPage from "./pages/Gestion/Drivers/page";
import { AssignmentsPage } from "./pages/Gestion/Asignaciones/page";
import { GaragesPage } from "./pages/Gestion/Garajes/page";
import { SitesManagementPage } from "./pages/Gestion/Sedes/page";
import { InsuranceManagementPage } from "./pages/Gestion/Seguros/page";
import { UsersPage } from "./pages/Accesos/Usuarios/page";
import { RolesPage } from "./pages/Accesos/Roles/page";
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
  const { ready, session } = useAuth();
  if (!ready) return null;
  if (session?.scope === "operacion") return <Navigate to="/dashboard" replace />;
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
 * Para la landing y solicitar-demo: si el usuario ya tiene sesion de
 * operacion, lo mandamos directo a su panel. Si tiene sesion de plataforma,
 * dejamos pasar (puede querer ver el sitio publico igual).
 */
function GuestLanding({ children }: { children: React.ReactNode }) {
  const { ready, session } = useAuth();
  if (!ready) return null;
  if (session?.scope === "operacion") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <Toaster position="top-right" richColors closeButton toastOptions={{ duration: 4000 }} />
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
          <Route path="/motores" element={<MotorsPage />} />
          <Route path="/motores/:id" element={<MotorCockpitPage />} />
          <Route path="/motores/mantenimientos" element={<MaintenancesPage />} />
          <Route path="/motores/historial" element={<HistorialPage />} />
          <Route path="/mantenimiento" element={<MaintenanceGeneralPage />} />
          <Route path="/mantenimiento/inventario" element={<MaintenanceInventoryPage />} />
          <Route path="/mantenimiento/verificacion-aceite" element={<MaintenanceOilPage />} />
          <Route path="/checklist" element={<ChecklistPage />} />
          <Route path="/alertas" element={<AlertsPage />} />
          <Route path="/reportes" element={<ReportsPage />} />
          <Route path="/combustible" element={<FuelPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/configuracion" element={<SettingsPage />} />
          <Route path="/flotas" element={<FlotasPage />} />
          <Route path="/operaciones/conductores" element={<DriversPage />} />
          <Route path="/operaciones/asignaciones" element={<AssignmentsPage />} />
          <Route path="/gestion/garajes" element={<GaragesPage />} />
          <Route path="/gestion/sedes" element={<SitesManagementPage />} />
          <Route path="/gestion/seguros" element={<InsuranceManagementPage />} />
          <Route path="/accesos/usuarios" element={<UsersPage />} />
          <Route path="/accesos/roles" element={<RolesPage />} />
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