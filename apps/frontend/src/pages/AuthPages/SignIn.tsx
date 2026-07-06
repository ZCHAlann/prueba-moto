import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { defaultMessageForCode } from "../../lib/authEvents";
import { toast } from "sonner";

const SLIDES = [
  {
    image: "/images/login-slide-fleet-tablet.png",
    headline: "Tu operacion,",
    accent: "al instante.",
    sub: "Consulta vehiculos, combustible y alertas desde cualquier lugar.",
  },
  {
    image: "/images/login-slide-dashboard.png",
    headline: "Toda la flota,",
    accent: "una pantalla.",
    sub: "Vehiculos, mantenimientos, combustible y alertas en un solo panel.",
  },
  {
    image: "/images/login-slide-ai.png",
    headline: "Decisiones con",
    accent: "inteligencia.",
    sub: "Datos claros y trazables para tu equipo y tu gerencia.",
  },
  {
    image: "/images/fleet-vans.png",
    headline: "Camionetas, motores",
    accent: "y generadores.",
    sub: "Una plataforma para ordenar toda tu operacion.",
  },
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
  const [slideIndex, setSlideIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const rippleIdRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const changeSlide = (next: number) => {
    setFading(true);
    setTimeout(() => {
      setSlideIndex(next);
      setFading(false);
    }, 500);
  };

  // ── Si entramos con ?reason=CODE (p.ej. SITE_INACTIVE tras ser
  // expulsado por la invalidación de sesión), mostrar un toast con el
  // motivo. Esto cubre el caso 4.8 (sesión activa bloqueada a mitad
  // de uso) — el form de login debe comunicar al usuario por qué
  // fue redirigido acá. (Fase 3.3)
  useEffect(() => {
    const reason = searchParams.get("reason");
    if (reason) {
      toast.error(defaultMessageForCode(reason), {
        description: "Tu sesión fue cerrada por un cambio administrativo. Si crees que es un error, contacta a tu administrador.",
        duration: 9000,
      });
      // Limpia el query param para que no se repita en un refresh.
      const next = new URLSearchParams(searchParams);
      next.delete("reason");
      const qs = next.toString();
      navigate(qs ? `/signin?${qs}` : "/signin", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSlideIndex((i) => {
        const next = (i + 1) % SLIDES.length;
        changeSlide(next);
        return i;
      });
    }, 6000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const goTo = (i: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    changeSlide(i);
    intervalRef.current = setInterval(() => {
      setSlideIndex((cur) => {
        const next = (cur + 1) % SLIDES.length;
        changeSlide(next);
        return cur;
      });
    }, 6000);
  };

  const addRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = ++rippleIdRef.current;
    setRipples((p) => [...p, { x: e.clientX - rect.left, y: e.clientY - rect.top, id }]);
    setTimeout(() => setRipples((p) => p.filter((r) => r.id !== id)), 900);
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
    toast.success("Bienvenido", { description: "Acceso concedido." });
    const redirect = searchParams.get("redirect") || result.redirectTo;
    setTimeout(() => navigate(redirect, { replace: true }), 500);
  };

  const slide = SLIDES[slideIndex];

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden" style={{ background: "#07090d" }}>

      {/* Keyframes */}
      <style>{`
        @keyframes fadeInRight { from { opacity:0; transform:translateX(24px); } to { opacity:1; transform:translateX(0); } }
        @keyframes rippleKf   { 0% { transform:scale(0); opacity:.7; } 100% { transform:scale(24); opacity:0; } }
        @keyframes shimmerKf  { 0% { transform:translateX(-100%); } 60%,100% { transform:translateX(200%); } }
        @keyframes floatY     { 0%,100% { transform:translateY(0px); } 50% { transform:translateY(-14px); } }
        @keyframes pulseDot   { 0%,100% { box-shadow:0 0 4px 1px rgba(16,185,129,.5); } 50% { box-shadow:0 0 10px 3px rgba(16,185,129,.9); } }
        @keyframes fadeSlide  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .form-item-1 { animation: fadeInRight .5s cubic-bezier(.22,1,.36,1) .05s both; }
        .form-item-2 { animation: fadeInRight .5s cubic-bezier(.22,1,.36,1) .13s both; }
        .form-item-3 { animation: fadeInRight .5s cubic-bezier(.22,1,.36,1) .20s both; }
        .form-item-4 { animation: fadeInRight .5s cubic-bezier(.22,1,.36,1) .27s both; }
        .form-item-5 { animation: fadeInRight .5s cubic-bezier(.22,1,.36,1) .33s both; }
        .form-item-6 { animation: fadeInRight .5s cubic-bezier(.22,1,.36,1) .39s both; }
        .apl-input:focus { border-color: rgba(16,185,129,.55) !important; box-shadow: 0 0 0 3px rgba(16,185,129,.09), 0 0 18px rgba(16,185,129,.07) !important; }
        .apl-input { transition: border-color .22s, box-shadow .22s, background .22s; }
        .apl-btn:hover { background: #34d399 !important; box-shadow: 0 8px 32px rgba(16,185,129,.45) !important; transform: translateY(-1px); }
        .apl-btn:active { transform: translateY(0); }
        .nav-link:hover { color: #10b981 !important; }
        .forgot-link:hover { color: #10b981 !important; }
        .demo-link:hover { color: #34d399 !important; }
        .apl-dot-btn:hover { background: rgba(255,255,255,.35) !important; }
      `}</style>

      {/* ─── TOPBAR ─────────────────────────────────────────────── */}
      <header
        className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-8 py-4 transition-all duration-500"
        style={{
          borderBottom: scrolled ? "1px solid rgba(255,255,255,.06)" : "1px solid transparent",
          background: scrolled ? "rgba(7,9,13,.92)" : "transparent",
          backdropFilter: scrolled ? "blur(18px)" : "none",
        }}
      >
        <Link to="/" className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "rgba(16,185,129,.15)", border: "1px solid rgba(16,185,129,.3)" }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" style={{ color: "#10b981" }} fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 13l2-5h14l2 5M3 13v6h2v-2h14v2h2v-6M3 13h18" />
              <circle cx="7" cy="17" r="1.5" fill="currentColor" />
              <circle cx="17" cy="17" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <span className="text-[13px] font-bold tracking-tight text-white">ApliSmart Motors</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {["Beneficios", "Modulos", "Planes", "FAQ"].map((item) => (
            <a
              key={item}
              href={`/#${item.toLowerCase()}`}
              className="nav-link text-[12px] font-semibold uppercase transition-colors duration-200"
              style={{ color: "rgba(255,255,255,.38)", letterSpacing: "0.08em" }}
            >
              {item}
            </a>
          ))}
        </nav>

        <Link
          to="/"
          className="rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition-all"
          style={{ border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)" }}
        >
          Volver al inicio
        </Link>
      </header>

      {/* ─── LAYOUT PRINCIPAL ─────────────────────────────────────
           Imagen izquierda | borde | Form derecha
      ──────────────────────────────────────────────────────────── */}
      <div className="flex min-h-screen w-full">

        {/* ══ IZQUIERDA — IMAGEN ══ */}
        <div className="relative hidden flex-1 overflow-hidden lg:block">

          {/* Imágenes con crossfade */}
          {SLIDES.map((s, i) => (
            <div
              key={i}
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${s.image})`,
                opacity: i === slideIndex ? (fading ? 0 : 1) : 0,
                transition: "opacity .6s ease-in-out",
                filter: "brightness(.45) saturate(.7)",
                transform: "scale(1.04)",
              }}
            />
          ))}

          {/* Gradientes de profundidad */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to left, rgba(7,9,13,.95) 0%, rgba(7,9,13,.2) 40%, transparent 100%)" }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(7,9,13,.85) 0%, transparent 55%)" }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 35% 40%, rgba(16,185,129,.07) 0%, transparent 60%)" }} />

          {/* Badge LIVE */}
          <div
            className="absolute left-6 top-6 flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase"
            style={{
              background: "rgba(0,0,0,.5)",
              border: "1px solid rgba(255,255,255,.1)",
              backdropFilter: "blur(10px)",
              color: "rgba(255,255,255,.55)",
            }}
          >
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{ background: "#f43f5e", animation: "pulseDot 1.5s ease-in-out infinite" }}
            />
            LIVE · 47 veh activos
          </div>

          {/* Contenido bottom */}
          <div className="absolute bottom-0 inset-x-0 p-10">
            <div key={slideIndex} style={{ animation: "fadeSlide .5s cubic-bezier(.22,1,.36,1) both" }}>
              <p
                className="mb-2 text-[30px] font-black leading-tight text-white"
                style={{ letterSpacing: "-0.03em", textShadow: "0 2px 24px rgba(0,0,0,.6)" }}
              >
                {slide.headline}<br />
                <span style={{ color: "#10b981" }}>{slide.accent}</span>
              </p>
              <p className="mb-8 text-[13px]" style={{ color: "rgba(255,255,255,.45)" }}>
                {slide.sub}
              </p>
            </div>

            {/* Dots */}
            <div className="flex items-center gap-2">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className="apl-dot-btn h-[3px] rounded-full transition-all duration-300"
                  style={{
                    width: i === slideIndex ? 28 : 8,
                    background: i === slideIndex ? "#10b981" : "rgba(255,255,255,.22)",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ══ BORDE CENTRAL ══ */}
        <div
          className="hidden lg:block w-px flex-shrink-0"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(16,185,129,.15) 30%, rgba(16,185,129,.1) 70%, transparent)" }}
        />

        {/* ══ DERECHA — FORM ══ */}
        <div
          className="relative z-10 flex w-full flex-col justify-center px-10 py-28 lg:w-[46%] xl:w-[42%]"
          style={{ background: "#07090d" }}
        >
          {/* Glow ambiental */}
          <div
            className="pointer-events-none absolute"
            style={{
              top: "10%", right: "-100px",
              width: "400px", height: "400px",
              background: "radial-gradient(circle, rgba(16,185,129,.07) 0%, transparent 65%)",
              animation: "floatY 10s ease-in-out infinite",
            }}
          />
          <div
            className="pointer-events-none absolute"
            style={{
              bottom: "5%", left: "-60px",
              width: "280px", height: "280px",
              background: "radial-gradient(circle, rgba(6,182,212,.04) 0%, transparent 65%)",
              animation: "floatY 13s ease-in-out infinite reverse",
            }}
          />

          <div className="relative mx-auto w-full max-w-[360px]">

            {/* Badge */}
            <div className="form-item-1 mb-7">
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase"
                style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.22)", color: "#10b981" }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#10b981", animation: "pulseDot 2s ease-in-out infinite" }}
                />
                Acceso unificado
              </div>
            </div>

            {/* Titulo */}
            <div className="form-item-1 mb-2">
              <h1 className="text-[36px] font-black leading-[1.08] text-white" style={{ letterSpacing: "-0.03em" }}>
                Hola de<br />
                <span style={{ color: "#10b981" }}>nuevo.</span>
              </h1>
            </div>
            <p className="form-item-2 mb-9 text-[13px]" style={{ color: "rgba(255,255,255,.32)", lineHeight: 1.6 }}>
              Ingresa para continuar con tu operacion.
            </p>

            {/* Sesion activa */}
            {isAuthenticated && session && (
              <div
                className="mb-6 rounded-xl p-4"
                style={{ background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.22)" }}
              >
                <p className="text-[12px] font-bold" style={{ color: "#10b981" }}>Sesion activa</p>
                <p className="mt-1 text-[12px]" style={{ color: "rgba(16,185,129,.75)" }}>
                  {session.name} · {session.roleLabel}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => navigate(getHomePath())}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-bold"
                    style={{ background: "#10b981", color: "#07090d" }}
                  >
                    Ir a mi panel
                  </button>
                  <button
                    onClick={() => { logout(); toast.success("Sesion cerrada"); }}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                    style={{ border: "1px solid rgba(255,255,255,.1)", color: "rgba(255,255,255,.5)" }}
                  >
                    Cerrar sesion
                  </button>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="form-item-3">
                <FloatingInput
                  label="Correo o usuario"
                  type="text"
                  value={loginValue}
                  onChange={setLoginValue}
                  placeholder="correo@empresa.com"
                />
              </div>

              <div className="form-item-3">
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((s) => !s)}
                />
              </div>

              <div className="form-item-4 flex items-center justify-between pt-1">
                <label className="flex cursor-pointer select-none items-center gap-2.5">
                  <span className="relative">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="peer sr-only"
                    />
                    <span
                      className="block h-[18px] w-8 rounded-full transition-colors duration-200 peer-checked:bg-emerald-500"
                      style={{ background: "rgba(255,255,255,.1)" }}
                    />
                    <span className="absolute left-[3px] top-[3px] h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-[14px]" />
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,.38)" }}>
                    Recordarme
                  </span>
                </label>
                <Link
                  to="/solicitar-demo"
                  className="forgot-link text-[11px] font-medium transition-colors duration-200"
                  style={{ color: "rgba(255,255,255,.28)" }}
                >
                  Olvide mi contrasena
                </Link>
              </div>

              <div className="form-item-5 pt-2">
                <button
                  type="submit"
                  onClick={addRipple}
                  disabled={submitting}
                  className="apl-btn relative w-full overflow-hidden rounded-xl py-[14px] text-[13px] font-bold text-[#07090d] transition-all duration-200 disabled:opacity-60"
                  style={{ background: "#10b981", boxShadow: "0 4px 20px rgba(16,185,129,.28)" }}
                >
                  <span
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: "linear-gradient(105deg,transparent 40%,rgba(255,255,255,.22) 50%,transparent 60%)",
                      animation: "shimmerKf 3.5s ease-in-out infinite",
                    }}
                  />
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {submitting ? (
                      <>
                        <span
                          className="h-4 w-4 animate-spin rounded-full border-2"
                          style={{ borderColor: "rgba(7,9,13,.2)", borderTopColor: "#07090d" }}
                        />
                        Ingresando...
                      </>
                    ) : (
                      "Ingresar"
                    )}
                  </span>
                  {ripples.map((r) => (
                    <span
                      key={r.id}
                      className="pointer-events-none absolute rounded-full bg-white/30"
                      style={{
                        left: r.x - 8, top: r.y - 8, width: 16, height: 16,
                        animation: "rippleKf .9s ease-out forwards",
                      }}
                    />
                  ))}
                </button>
              </div>
            </form>

            <p className="form-item-6 mt-7 text-center text-[11px]" style={{ color: "rgba(255,255,255,.22)" }}>
              No tienes cuenta?{" "}
              <Link
                to="/solicitar-demo"
                className="demo-link font-bold transition-colors duration-200"
                style={{ color: "#10b981" }}
              >
                Solicita una demo
              </Link>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Floating label input ────────────────────────────────────────────────────
function FloatingInput({
  label, type, value, onChange, placeholder,
}: {
  label: string; type: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const raised = focused || value.length > 0;

  return (
    <label className="relative block">
      <span
        className="pointer-events-none absolute z-10 origin-left font-semibold transition-all duration-200"
        style={{
          left: raised ? 12 : 14,
          top: raised ? 0 : "50%",
          transform: raised ? "translateY(-50%) scale(.72)" : "translateY(-50%)",
          background: raised ? "#07090d" : "transparent",
          paddingLeft: raised ? 4 : 0,
          paddingRight: raised ? 4 : 0,
          fontSize: 13,
          color: raised ? "#10b981" : "rgba(255,255,255,.25)",
        }}
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
        className="apl-input w-full rounded-xl px-4 py-[13px] text-[13px] text-white outline-none"
        style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)" }}
      />
    </label>
  );
}

// ─── Password input ──────────────────────────────────────────────────────────
function PasswordInput({
  value, onChange, show, onToggle,
}: {
  value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const raised = focused || value.length > 0;

  return (
    <label className="relative block">
      <span
        className="pointer-events-none absolute z-10 origin-left font-semibold transition-all duration-200"
        style={{
          left: raised ? 12 : 14,
          top: raised ? 0 : "50%",
          transform: raised ? "translateY(-50%) scale(.72)" : "translateY(-50%)",
          background: raised ? "#07090d" : "transparent",
          paddingLeft: raised ? 4 : 0,
          paddingRight: raised ? 4 : 0,
          fontSize: 13,
          color: raised ? "#10b981" : "rgba(255,255,255,.25)",
        }}
      >
        Contrasena
      </span>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? "••••••••" : ""}
        autoComplete="current-password"
        className="apl-input w-full rounded-xl px-4 py-[13px] pr-12 text-[13px] text-white outline-none"
        style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)" }}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Ocultar contrasena" : "Mostrar contrasena"}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 transition-colors duration-200"
        style={{ color: "rgba(255,255,255,.25)" }}
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