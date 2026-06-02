import { PlatformSignInForm } from "../../../components/auth/Platform/PlatformSignInForm";

export default function PlatformSignIn() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md">
        {/* Badge */}
        <div className="mb-6 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-violet-400">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            Panel de plataforma
          </span>
        </div>

        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <img src="/images/logo/logo-dark.svg" className="h-10" alt="Logo" />
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-gray-900 p-8 shadow-xl">
          <h1 className="mb-1 text-xl font-bold text-white">Acceso master</h1>
          <p className="mb-6 text-sm text-gray-500">
            Solo para administradores de plataforma.
          </p>
          <PlatformSignInForm />
        </div>

        {/* Link de vuelta */}
        <p className="mt-6 text-center text-xs text-gray-600">
          ¿Eres operador?{" "}
          <a href="/signin" className="text-gray-400 underline underline-offset-2 hover:text-white transition-colors">
            Inicia sesión aquí
          </a>
        </p>
      </div>
    </div>
  );
}