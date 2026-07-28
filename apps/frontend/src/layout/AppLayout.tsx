import { useEffect } from "react";
import { useLocation, useNavigate, Outlet } from "react-router";
import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import { canAccessHref } from "../lib/access-control";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";
import { FloatingChatWidget } from "../components/ui/FloatingChatWidget";
import { JarvisWakeWordController } from "../components/jarvis/JarvisWakeWordController";
import { JarvisVoiceOverlay } from "../components/jarvis/JarvisVoiceOverlay";


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

      {/* Un solo widget flotante con dos tabs:
            1. "Mensajes"  → chat interno entre personas (visible para TODOS los roles)
            2. "Asistente" → chat con IA (visible solo para admin/owner + módulo jarvis)
          El FloatingChatWidget es el ÚNICO FAB; el FloatingAiAssistant vive
          embebido dentro del tab "Asistente" cuando aplica. */}
      <FloatingChatWidget />

      {/* jul 2026 v8.4 — Controlador del wake word. Se monta ACÁ (en el
          layout), NO dentro del FloatingAiAssistant, porque ese último
          solo se monta cuando el user abre el tab "Asistente". El wake
          word tiene que estar vivo SIEMPRE que el user esté logueado y
          tenga permisos, así "Jarvis" lo agarra aunque el chat esté
          cerrado. Cuando detecta, dispatcha un CustomEvent global
          'jarvis:wake-detected'. */}

      {/* jul 2026 v8.6 — Overlay estilo Siri. Escucha el mismo evento
          y muestra el flujo de voz fullscreen-ish sobre la esquina
          inferior derecha. NO abre el chat. Se monta siempre que el
          user esté logueado; el control de permisos vive adentro
          (canUseAssistant). */}
      <JarvisVoiceOverlay />
      <JarvisWakeWordController silent={false} />

      {/* NOTA: <FloatingAiAssistant /> ya NO se monta standalone acá.
          Si en el futuro se quiere usar el FAB del Jarvis en una página
          específica (ej. /jarvis), importarlo localmente con embedded={false}. */}
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
