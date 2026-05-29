"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";

export function LoginPage() {
  const searchParams = useSearchParams();
  const { notifyError, notifySuccess } = useFeedback();
  const { settings } = usePlatform();
  const { getHomePath, isAuthenticated, login, session, logout } = useAuth();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(settings.rememberSessionDefault);
  const [submitting, setSubmitting] = useState(false);
  const hasError = searchParams.get("error") === "1";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    const result = await login({
      email: loginValue,
      password,
      remember,
      scope: "operacion",
    });
    setSubmitting(false);

    if (!result.ok) {
      notifyError(result.title, result.description);
      return;
    }

    window.location.assign(searchParams.get("redirect") || result.redirectTo);
  };

  return (
    <div className="bg-slate-100 px-4 py-10 lg:px-6">
      <div className="mx-auto grid w-full max-w-[1120px] gap-6 lg:grid-cols-[0.95fr_1fr]">
        <section
          className="rounded-lg bg-slate-950 p-7 text-white shadow-sm"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(2,6,23,0.98), rgba(15,23,42,0.9)), url('https://images.pexels.com/photos/4481328/pexels-photo-4481328.jpeg?auto=compress&cs=tinysrgb&w=1400')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <span className="inline-flex rounded-lg bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/20">
            Acceso unificado
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-tight lg:text-4xl">
            Ingresa con tu correo o usuario
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-zinc-200">
            Accede de forma segura a tu cuenta para administrar la plataforma o trabajar en la operacion diaria de tu empresa.
          </p>

          <div className="mt-10 border-t border-white/10 pt-8 flex flex-col items-center">
            <h3 className="text-lg font-bold text-white mb-1 text-center">Lleva ApliSmart en Dispositivo Movil.</h3>
            <p className="text-sm font-medium text-zinc-400 mb-5 text-center">Descarga la App:</p>
            <div className="flex flex-col gap-4 w-full max-w-[320px]">
              <a 
                href="/downloads/aplismart-motors.apk" 
                className="flex items-center justify-center gap-3 rounded-2xl bg-[#3DDC84] px-6 py-4 text-lg font-bold text-slate-900 transition-transform hover:scale-105 shadow-[0_0_20px_rgba(61,220,132,0.3)] w-full"
              >
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.6 9.28l1.84-3.18c.16-.27.07-.62-.2-.78-.27-.16-.62-.07-.78.2l-1.9 3.28C15.2 8.21 13.66 7.8 12 7.8s-3.2.41-4.56 1.02L5.54 5.54c-.16-.27-.51-.36-.78-.2-.27.16-.36.51-.2.78l1.84 3.18C3.76 10.74 2 13.68 2 17h20c0-3.32-1.76-6.26-4.4-7.72zM8.25 14.5c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25zm7.5 0c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z"/>
                </svg>
                Android
              </a>
              <a 
                href="/downloads/aplismart-motors.ipa" 
                className="flex items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 text-lg font-bold text-slate-950 transition-transform hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.2)] w-full"
              >
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.365 2.052c.866-1.056 1.448-2.583 1.288-4.104-1.32.053-2.915.879-3.805 1.954-.795.94-1.488 2.502-1.298 3.992 1.483.115 2.951-.784 3.815-1.842zm-1.826 4.316c-1.385-.028-2.656.848-3.37.848-.716 0-1.765-.795-2.911-.773-1.492.023-2.871.868-3.639 2.197-1.558 2.698-.398 6.689 1.117 8.878.739 1.066 1.611 2.253 2.766 2.213 1.118-.042 1.545-.722 2.906-.722 1.357 0 1.745.722 2.927.697 1.198-.024 1.94-.1087 2.655-2.148 1.157-1.688 1.632-3.327 1.656-3.411-.035-.015-3.197-1.226-3.23-4.88-.029-3.053 2.49-4.521 2.607-4.593-1.428-2.091-3.631-2.378-4.484-2.406z"/>
                </svg>
                iOS
              </a>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 text-slate-950 shadow-xl shadow-slate-200/70 lg:p-8">
          <h2 className="text-2xl font-bold text-neutral-950">Iniciar sesion</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Escribe tu correo o usuario y tu contrasena. Te llevaremos a la ruta que corresponda segun tu perfil.
          </p>

          {isAuthenticated && session ? (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="text-sm font-semibold text-emerald-800">Sesion activa</p>
              <p className="mt-2 text-sm text-emerald-900">
                {session.name} / {session.roleLabel}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button tone="teal" variant="solid" onClick={() => window.location.assign(getHomePath())}>
                  Continuar en mi panel
                </Button>
                <Button
                  tone="neutral"
                  variant="outline"
                  onClick={() => {
                    logout();
                    notifySuccess("Sesion cerrada", "Ahora puedes ingresar nuevamente.");
                  }}
                >
                  Cerrar sesion
                </Button>
              </div>
            </div>
          ) : null}

          {hasError ? (
            <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
              No pudimos validar esas credenciales. Revisa el usuario o correo y la contrasena e intenta nuevamente.
            </div>
          ) : null}

          <form className="mt-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <label className="space-y-2">
                <span className="text-sm font-medium text-neutral-700">Correo o usuario</span>
                <input
                  type="text"
                  autoComplete="username"
                  value={loginValue}
                  onChange={(event) => setLoginValue(event.target.value)}
                  placeholder="correo@empresa.com o master"
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-neutral-700">Contrasena</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="********"
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
                />
              </label>
              <label className="flex items-center gap-3 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                Recordar sesion
              </label>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <Button type="submit" tone="teal" variant="solid" className="w-full" disabled={submitting}>
                Ingresar
              </Button>
            </div>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href="/forgot-password" className="font-medium text-teal-700 hover:text-teal-800">
              Olvidaste tu contrasena?
            </Link>
            <span className="font-medium text-neutral-500">Acceso seguro para usuarios autorizados</span>
          </div>
        </section>
      </div>
    </div>
  );
}
