// src/pages/AuthPages/SignIn.tsx
// Login dark + esmeralda (consistente con la landing y el sistema).
// Imagen a sangre completa de administracion/rastreo de flotas (no carros en si).
// Card de form compacta con floating labels, password toggle, social buttons.

import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";

const QUOTES = [
  { text: "Controla tu flota, motores y generadores.", subtext: "Una sola vista para toda tu operacion." },
  { text: "Menos planilla, mas decisiones.", subtext: "Datos claros para tu equipo y tu gerencia." },
  { text: "Trazabilidad en tiempo real.", subtext: "Vehiculos, mantenimientos, combustible y alertas." },
];

// Imagenes: administracion de flotas / rastreo GPS / dashboards (no carros en si)
const CAROUSEL_IMAGES = [
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1600&q=80", // dashboard analytics
  "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1600&q=80", // warehouse/fleet management
  "https://images.unsplash.com/photo-1518186285589-2f7649de83e0?auto=format&fit=crop&w=1600&q=80", // logistics/data
];

export default function SignIn() {
  const { login, session, getHomePath, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const [imageIndex, setImageIndex] = useState(0);
  const rippleIdRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setImageIndex((i) => (i + 1) % CAROUSEL_IMAGES.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = ++rippleIdRef.current;
    setRipples((prev) => [...prev, { x, y, id }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 800);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const result = await login({ email: loginValue, password, remember });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.title, { description: result.description });
      return;
    }

    toast.success("Bienvenido", {
      description: "Acceso concedido. Redirigiendo a tu panel...",
    });

    const redirect = searchParams.get("redirect") || result.redirectTo;
    setTimeout(() => navigate(redirect, { replace: true }), 600);
  };

  const nextImage = () => setImageIndex((i) => (i + 1) % CAROUSEL_IMAGES.length);
  const prevImage = () => setImageIndex((i) => (i - 1 + CAROUSEL_IMAGES.length) % CAROUSEL_IMAGES.length);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gray-950">
      {/* Fondo dark con mesh gradient emerald */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl animate-[meshMove1_18s_ease-in-out_infinite]" />
        <div className="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-cyan-500/5 blur-3xl animate-[meshMove2_22s_ease-in-out_infinite]" />
      </div>
      {/* Particulas */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <span
            key={i}
            className="absolute h-1 w-1 rounded-full bg-emerald-400/20 animate-[floatParticle_15s_linear_infinite]"
            style={{
              left: `${(i * 37) % 100}%`,
              animationDelay: `${(i * 0.6) % 15}s`,
              animationDuration: `${15 + (i % 5) * 2}s`,
            }}
          />
        ))}
      </div>

      {/* ── TOPBAR ── */}
      <header
        className={`fixed inset-x-0 top-0 z-30 transition-all duration-500 ${
          scrolled
            ? "border-b border-white/10 bg-gray-950/80 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 ring-1 ring-emerald-400/30">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 13l2-5h14l2 5M3 13v6h2v-2h14v2h2v-6M3 13h18" />
                <circle cx="7" cy="17" r="1.5" fill="currentColor" />
                <circle cx="17" cy="17" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <span className="text-sm font-bold text-white">ApliSmart Motors</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            <a href="/#beneficios" className="text-sm font-medium text-gray-300 transition hover:text-white">Beneficios</a>
            <a href="/#modulos" className="text-sm font-medium text-gray-300 transition hover:text-white">Modulos</a>
            <a href="/#planes" className="text-sm font-medium text-gray-300 transition hover:text-white">Planes</a>
            <a href="/#faq" className="text-sm font-medium text-gray-300 transition hover:text-white">FAQ</a>
          </nav>

          <Link
            to="/"
            className="rounded-lg border border-white/20 bg-white/[0.05] px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/10"
          >
            Volver al inicio
          </Link>
        </div>
      </header>

      {/* ── CARD PRINCIPAL ── */}
      <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-4 py-24 sm:px-6">
        <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-white/10 bg-gray-900/80 shadow-2xl shadow-emerald-500/5 backdrop-blur-xl lg:grid-cols-2">
          {/* ═══ LADO IZQUIERDO: FORM ═══ */}
          <div className="flex flex-col justify-center p-8 sm:p-10">
            <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Acceso unificado
            </div>
            <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
              Hola de nuevo
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Ingresa para continuar con tu operacion.
            </p>

            {/* Sesion activa */}
            {isAuthenticated && session ? (
              <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-sm font-semibold text-emerald-300">Sesion activa</p>
                <p className="mt-0.5 text-sm text-emerald-200">{session.name} / {session.roleLabel}</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate(getHomePath())}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-gray-950 transition hover:bg-emerald-400"
                  >
                    Continuar en mi panel
                  </button>
                  <button
                    onClick={() => { logout(); toast.success("Sesion cerrada"); }}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/5"
                  >
                    Cerrar sesion
                  </button>
                </div>
              </div>
            ) : null}

            {/* Form */}
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <FloatingInput
                label="Correo o usuario"
                type="text"
                value={loginValue}
                onChange={setLoginValue}
                placeholder="correo@empresa.com o master"
              />
              <PasswordInput
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggle={() => setShowPassword((s) => !s)}
              />

              <div className="flex items-center justify-between text-xs">
                <label className="flex cursor-pointer items-center gap-2 text-gray-400">
                  <span className="relative">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="peer sr-only"
                    />
                    <span className="block h-4 w-7 rounded-full bg-gray-700 transition peer-checked:bg-emerald-500" />
                    <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform peer-checked:translate-x-3" />
                  </span>
                  Recordarme
                </label>
                <Link to="/solicitar-demo" className="text-gray-500 transition hover:text-emerald-400">
                  Olvide mi contrasena
                </Link>
              </div>

              {/* Submit */}
              <button
                type="submit"
                onClick={handleButtonClick}
                disabled={submitting}
                className="group relative w-full overflow-hidden rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-gray-950 shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 hover:shadow-emerald-400/30 disabled:opacity-60"
              >
                {submitting && (
                  <span className="absolute inset-0 animate-[progress_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                )}
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {submitting ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-950/30 border-t-gray-950" />
                      Ingresando...
                    </>
                  ) : (
                    <>Ingresar</>
                  )}
                </span>
                {ripples.map((r) => (
                  <span
                    key={r.id}
                    className="pointer-events-none absolute h-4 w-4 rounded-full bg-white/50 animate-[ripple_0.8s_ease-out]"
                    style={{ left: r.x - 8, top: r.y - 8 }}
                  />
                ))}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-gray-500">
              No tienes cuenta?{" "}
              <Link to="/solicitar-demo" className="font-semibold text-emerald-400 transition hover:text-emerald-300">
                Solicita una demo
              </Link>
            </p>
          </div>

          {/* ═══ LADO DERECHO: IMAGEN CON CAROUSEL ═══ */}
          <div className="relative hidden min-h-[520px] overflow-hidden lg:block">
            {/* Imagenes con crossfade */}
            {CAROUSEL_IMAGES.map((src, i) => (
              <div
                key={i}
                aria-hidden="true"
                className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out ${
                  i === imageIndex ? "opacity-100" : "opacity-0"
                }`}
                style={{ backgroundImage: `url(${src})` }}
              />
            ))}
            {/* Overlay gradient dark + emerald */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-950/80 via-gray-950/50 to-emerald-950/60" />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-gray-950/30 to-transparent" />

            {/* Contenido overlay */}
            <div className="absolute inset-0 flex flex-col justify-between p-8 text-white">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md ring-1 ring-white/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Plataforma lider
                </span>
              </div>

              <div>
                <p className="text-xl font-semibold leading-snug transition-all duration-700 sm:text-2xl">
                  {QUOTES[imageIndex].text}
                </p>
                {QUOTES[imageIndex].subtext && (
                  <p className="mt-2 text-sm text-white/80 transition-all duration-700">
                    {QUOTES[imageIndex].subtext}
                  </p>
                )}

                {/* Carousel controls */}
                <div className="mt-5 flex items-center gap-2.5">
                  <button
                    onClick={prevImage}
                    aria-label="Imagen anterior"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/20 transition hover:bg-white/25"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    onClick={nextImage}
                    aria-label="Siguiente imagen"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/20 transition hover:bg-white/25"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                  <div className="ml-2 flex gap-1.5">
                    {CAROUSEL_IMAGES.map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 rounded-full transition-all ${
                          i === imageIndex ? "w-5 bg-white" : "w-1.5 bg-white/40"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CSS keyframes */}
      <style>{`
        @keyframes meshMove1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(80px, -40px) scale(1.1); }
          66% { transform: translate(-40px, 60px) scale(0.95); }
        }
        @keyframes meshMove2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-100px, 80px) scale(1.2); }
        }
        @keyframes floatParticle {
          0% { transform: translateY(100vh) translateX(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-100vh) translateX(50px); opacity: 0; }
        }
        @keyframes ripple {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(20); opacity: 0; }
        }
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

// ─── Floating label input ───
function FloatingInput({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const filled = value.length > 0;
  return (
    <label className="relative block">
      <span
        className={`pointer-events-none absolute left-3 z-10 origin-left transition-all duration-300 ${
          focused || filled
            ? "top-0 -translate-y-1/2 scale-75 bg-gray-900 px-1.5 font-semibold text-emerald-400"
            : "top-1/2 -translate-y-1/2 text-sm text-gray-500"
        }`}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? placeholder : ""}
        autoComplete={type === "password" ? "current-password" : "username"}
        className="w-full rounded-lg border border-white/10 bg-gray-950/50 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500/60 focus:bg-gray-950 focus:shadow-lg focus:shadow-emerald-500/10"
      />
    </label>
  );
}

// ─── Password input con toggle ───
function PasswordInput({
  value,
  onChange,
  show,
  onToggle,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const filled = value.length > 0;
  return (
    <label className="relative block">
      <span
        className={`pointer-events-none absolute left-3 z-10 origin-left transition-all duration-300 ${
          focused || filled
            ? "top-0 -translate-y-1/2 scale-75 bg-gray-900 px-1.5 font-semibold text-emerald-400"
            : "top-1/2 -translate-y-1/2 text-sm text-gray-500"
        }`}
      >
        Contrasena
      </span>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? "********" : ""}
        autoComplete="current-password"
        className="w-full rounded-lg border border-white/10 bg-gray-950/50 px-3 py-2.5 pr-10 text-sm text-white outline-none transition focus:border-emerald-500/60 focus:bg-gray-950 focus:shadow-lg focus:shadow-emerald-500/10"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Ocultar contrasena" : "Mostrar contrasena"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 transition hover:bg-white/5 hover:text-gray-300"
      >
        {show ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        )}
      </button>
    </label>
  );
}

// ─── Social button ───
function SocialButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-10 w-12 items-center justify-center rounded-lg border border-white/10 bg-gray-950/50 transition-all hover:border-emerald-500/40 hover:bg-gray-950 hover:-translate-y-0.5"
    >
      {children}
    </button>
  );
}
