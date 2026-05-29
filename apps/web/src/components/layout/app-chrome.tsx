"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSelectedLayoutSegments } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PublicShell } from "@/components/layout/public-shell";
import { MasterShell } from "@/components/layout/master-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { AccessDeniedState, AppLoadingState } from "@/components/ui/access-state";
import {
  getAccessMessage,
  getDefaultRouteForRole,
  isAllowedCurrentPath,
  isPublicPath,
  isSuperadminPath,
} from "@/lib/access-control";

export function AppChrome({
  children,
  initialPathname = "",
}: {
  children: React.ReactNode;
  initialPathname?: string;
}) {
  const pathnameFromRouter = usePathname();
  const segments = useSelectedLayoutSegments();
  const pathnameFromSegments = segments.length > 0 ? `/${segments.join("/")}` : "/";
  const pathname = pathnameFromRouter || pathnameFromSegments || initialPathname || "";
  const router = useRouter();
  const { ready, session } = useAuth();
  const isPublic = isPublicPath(pathname);
  const isSuperadmin = isSuperadminPath(pathname);
  const hasAccess = session ? isAllowedCurrentPath(session.role, pathname) : false;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  useEffect(() => {
    if (!ready || isPublic || session || isSuperadmin) {
      return;
    }

    if (typeof window !== "undefined") {
      window.location.replace("/login");
      return;
    }

    router.replace("/login");
  }, [isPublic, isSuperadmin, ready, router, session]);

  if (isPublic) {
    return <PublicShell>{children}</PublicShell>;
  }

  if (isSuperadmin) {
    return <MasterShell>{children}</MasterShell>;
  }

  if (!ready) {
    return (
      <PublicShell>
        <AppLoadingState />
      </PublicShell>
    );
  }

  if (!session) {
    return (
      <PublicShell>
        <AppLoadingState
          title="Redirigiendo al acceso"
          description="No encontramos una sesion activa. Te llevaremos al portal de ingreso."
        />
      </PublicShell>
    );
  }

  if (!hasAccess) {
    const deniedState = (
      <AccessDeniedState
        description={getAccessMessage(session.role, pathname)}
        homeHref={getDefaultRouteForRole(session.role)}
        homeLabel={
          isSuperadmin
            ? "Ir a mi panel permitido"
            : session.role === "superadmin"
              ? "Volver al dashboard"
              : "Volver a mi inicio"
        }
      />
    );

    if (isSuperadmin) {
      return <MasterShell>{deniedState}</MasterShell>;
    }

    return <DashboardShell>{deniedState}</DashboardShell>;
  }

  return <DashboardShell>{children}</DashboardShell>;
}
