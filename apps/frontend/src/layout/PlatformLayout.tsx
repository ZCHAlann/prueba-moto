import { useEffect } from "react";
import { useNavigate, Outlet } from "react-router";
import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";
import { platformNavigationSections } from "../lib/platform-navigation";

const PlatformLayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { ready, session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    if (!session || session.scope !== "plataforma") {
      navigate("/platform/signin", { replace: true });
    }
  }, [ready, session, navigate]);

  if (!ready) return null;
  if (!session || session.scope !== "plataforma") return null;

  return (
    <div className="min-h-screen xl:flex">
      <div>
        <AppSidebar
          sections={platformNavigationSections}
          homeHref="/platform/dashboard"
        />
        <Backdrop />
      </div>
      <div
        className={`flex-1 transition-all duration-300 ease-in-out ${
          isExpanded || isHovered ? "lg:ml-[290px]" : "lg:ml-[90px]"
        } ${isMobileOpen ? "ml-0" : ""}`}
      >
        <AppHeader />
        <div className="pt-24 p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

const PlatformLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <PlatformLayoutContent />
    </SidebarProvider>
  );
};

export default PlatformLayout;