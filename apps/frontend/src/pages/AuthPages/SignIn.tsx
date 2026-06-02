import { SignInForm } from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <img src="/images/logo/logo.svg"      className="h-10 dark:hidden"       alt="Logo" />
          <img src="/images/logo/logo-dark.svg" className="hidden h-10 dark:block" alt="Logo" />
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-white/[0.08] dark:bg-gray-900">
          <h1 className="mb-1 text-xl font-bold text-gray-800 dark:text-white">Bienvenido de vuelta</h1>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">Ingresa tus credenciales para continuar</p>
          <SignInForm />
        </div>
      </div>
    </div>
  );
}