import { useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Eye, EyeOff, AlertTriangle, ArrowLeft } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";

export function PlatformSignInForm() {
  const { loginPlatform } = useAuth();
  const navigate = useNavigate();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<{ title: string; description: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await loginPlatform({ email, password, remember });
    setLoading(false);
    if (result.ok) {
      navigate("/platform/dashboard", { replace: true });
    } else {
      setError({ title: result.title, description: result.description });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 rounded-xl border border-rose-200/80 bg-rose-50/95 px-4 py-3 backdrop-blur"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-rose-700">{error.title}</p>
            <p className="mt-0.5 text-xs text-rose-600/90">{error.description}</p>
          </div>
        </motion.div>
      )}

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@aplismart.com"
          required
          autoComplete="email"
          autoFocus
          className="h-11 w-full rounded-xl border border-slate-200 bg-white/85 px-4 text-sm text-slate-800 placeholder:text-slate-400 outline-none backdrop-blur transition focus:border-blue-700 focus:bg-white focus:ring-2 focus:ring-blue-700/25"
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
          Contraseña
        </label>
        <div className="relative">
          <input
            type={showPass ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white/85 px-4 pr-11 text-sm text-slate-800 placeholder:text-slate-400 outline-none backdrop-blur transition focus:border-blue-700 focus:bg-white focus:ring-2 focus:ring-blue-700/25"
          />
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {/* Remember + forgot */}
      <div className="flex items-center justify-between pt-1 text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-slate-600">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-700/30 focus:ring-offset-0"
          />
          Recordarme
        </label>
        <button
          type="button"
          className="text-slate-500 transition hover:text-blue-800"
        >
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      {/* Submit — azul oscuro con peso */}
      <button
        type="submit"
        disabled={loading}
        className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-800 text-sm font-semibold text-white shadow-sm shadow-blue-900/30 transition hover:bg-blue-900 active:scale-[0.99] disabled:opacity-60"
      >
        {loading ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            <span>Verificando...</span>
          </>
        ) : (
          <span>Acceder al panel</span>
        )}
      </button>

      {/* Operator link */}
      <div className="mt-1 flex items-center justify-center">
        <button
          type="button"
          onClick={() => navigate("/signin")}
          className="flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-blue-800"
        >
          <ArrowLeft size={12} />
          ¿Eres operador? Inicia sesión acá
        </button>
      </div>
    </form>
  );
}
