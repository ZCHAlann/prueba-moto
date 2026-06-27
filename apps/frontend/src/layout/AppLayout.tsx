import { useEffect } from "react";
import { useLocation, useNavigate, Outlet } from "react-router";
import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import { AlertsBellProvider } from "../context/AlertsBellContext";
import { canAccessHref } from "../lib/access-control";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";
import { FloatingAiAssistant } from "../components/ui/FloatingAiAssistant";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { ready, session, getHomePath } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // 1) Si no hay sesión → /signin
  useEffect(() => {
    if (ready && !session) {
      navigate("/signin", { replace: true });
    }
  }, [ready, session, navigate]);

  // 2) Si hay sesión pero el role + permisos granulares NO permiten
  //    la ruta actual → redirigir al primer módulo permitido (sin history).
  useEffect(() => {
    if (!ready || !session) return;
    const role = session.role;
    const perms = (session.modulePermissions ?? {}) as unknown as Record<
      string,
      Record<string, string[]>
    >;
    if (!canAccessHref(role, location.pathname, perms)) {
      navigate(getHomePath(), { replace: true });
    }
  }, [ready, session, location.pathname, navigate, getHomePath]);

  // Mientras carga la sesión no renderizamos nada
  if (!ready) return null;
  if (!session) return null;

  // Evita parpadear la UI destino mientras se redirige
  if (
    !canAccessHref(
      session.role,
      location.pathname,
      (session.modulePermissions ?? {}) as unknown as Record<
        string,
        Record<string, string[]>
      >,
    )
  ) {
    return null;
  }

  return (
    <div className="min-h-screen xl:flex">
      <div>
        <AppSidebar />
        <Backdrop />
      </div>
      <div
        className={`flex-1 min-w-0 transition-all duration-300 ease-in-out ${
          isExpanded || isHovered ? "lg:ml-[290px]" : "lg:ml-[90px]"
        } ${isMobileOpen ? "ml-0" : ""}`}
      >
        <AppHeader />
        <div className="pt-20 p-3 mx-auto max-w-(--breakpoint-2xl) sm:pt-24 sm:p-4 md:p-6">
          <Outlet />
        </div>
      </div>

      {/* Asistente IA (Jarvis) — solo visible para admin_empresa y
          owner_empresa. El componente filtra internamente por rol. */}
      <FloatingAiAssistant />
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <AlertsBellProvider>
      <SidebarProvider>
        <LayoutContent />
      </SidebarProvider>
    </AlertsBellProvider>
  );
};

export default AppLayout;
