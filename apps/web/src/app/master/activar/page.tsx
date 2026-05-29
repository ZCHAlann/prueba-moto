"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AppLoadingState } from "@/components/ui/access-state";

const STORAGE_LOCAL_KEY = "aplismart-auth-local-v6-production-refresh";
const STORAGE_SESSION_KEY = "aplismart-auth-session-v6-production-refresh";

type MasterRole =
  | "superadmin"
  | "admin_saas"
  | "comercial"
  | "soporte"
  | "owner_empresa"
  | "admin_empresa"
  | "operador"
  | "supervisor";

type AuthSession = {
  id: string;
  email: string;
  name: string;
  role: MasterRole;
  roleLabel: string;
  title: string;
  companyId: string | null;
  companyName: string;
  scope: "operacion" | "plataforma";
  remember: boolean;
  loginAt: string;
};

function fallbackRoleLabel(role: MasterRole) {
  switch (role) {
    case "superadmin":
      return "Administrador master";
    case "admin_saas":
      return "Administrador de plataforma";
    case "comercial":
      return "Comercial";
    case "soporte":
      return "Soporte";
    case "owner_empresa":
      return "Propietario de empresa";
    case "admin_empresa":
      return "Administrador de empresa";
    case "supervisor":
      return "Supervisor";
    default:
      return "Operador";
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MasterActivatePage() {
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    const activate = async () => {
      const remember = searchParams.get("remember") === "1";
      const email = (searchParams.get("email") ?? "aplicrm@gmail.com").trim().toLowerCase();
      const role = (searchParams.get("role") ?? "superadmin") as MasterRole;
      const scope = (searchParams.get("scope") ?? "plataforma") as "operacion" | "plataforma";

      const persist = (session: AuthSession) => {
        window.localStorage.removeItem(STORAGE_LOCAL_KEY);
        window.sessionStorage.removeItem(STORAGE_SESSION_KEY);

        if (remember) {
          window.localStorage.setItem(STORAGE_LOCAL_KEY, JSON.stringify(session));
        } else {
          window.sessionStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
        }
      };

      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "include",
        });

        if (response.ok) {
          const backendSession = (await response.json()) as Omit<AuthSession, "remember" | "loginAt">;
          if (!cancelled) {
            persist({
              ...backendSession,
              remember,
              loginAt: new Date().toISOString(),
            });
            window.location.replace("/master");
          }
          return;
        }
      } catch {
        // Fallback local si el endpoint aun no responde en este instante.
      }

      if (!cancelled) {
        persist({
          id: "platform-user-master",
          email,
          name: "Superadmin ApliSmart",
          role,
          roleLabel: fallbackRoleLabel(role),
          title: "Administrador master",
          companyId: null,
          companyName: "ApliSmart Motors",
          scope,
          remember,
          loginAt: new Date().toISOString(),
        });
        window.location.replace("/master");
      }
    };

    void activate();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <div className="bg-slate-100 px-4 py-12">
      <div className="mx-auto w-full max-w-[880px]">
        <AppLoadingState
          title="Activando tu sesion"
          description="Estamos validando el acceso y preparando el panel master."
        />
      </div>
    </div>
  );
}
