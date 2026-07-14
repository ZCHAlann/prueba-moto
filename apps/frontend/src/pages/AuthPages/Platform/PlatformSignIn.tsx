import { motion } from "framer-motion";
import { PlatformSignInForm } from "../../../components/auth/Platform/PlatformSignInForm";

// Imagen de fondo fullscreen. Generada con IA (matices azul oscuro + violeta
// para que combine con el glass card). Si falla al cargar, el color de
// fallback mantiene el layout sin romper.
const HERO_BG = "/images/login-bg-mountains.jpg";

export default function PlatformSignIn() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-900">
      {/* ── Background image (fullscreen, cover) ─────────────────────── */}
      <div className="absolute inset-0 z-0">
        <img
          src={HERO_BG}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        {/* Velo oscuro sutil (azul muy oscuro) para asegurar contraste
            del card y de los textos blancos. Ajustar opacidad si querés
            más o menos protagonismo de la imagen. */}
        <div className="absolute inset-0 bg-blue-950/35" />
      </div>

      {/* ── Card centrada ─────────────────────────────────────────────── */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[420px]"
        >
          {/* Card con frosted glass (semi-translúcido) y borde claro */}
          <div className="overflow-hidden rounded-2xl border border-white/40 bg-white/85 shadow-2xl shadow-blue-950/40 backdrop-blur-md">
            <div className="px-8 pt-7 pb-2">
              <div className="mb-5 flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-700" />
                  Platform Admin
                </span>
              </div>
              <h1 className="text-center text-[22px] font-bold tracking-tight text-slate-900">
                Acceso master
              </h1>
              <p className="mt-1 text-center text-sm text-slate-500">
                Reservado para el equipo de plataforma.
              </p>
            </div>

            <div className="px-8 pb-7 pt-4">
              <PlatformSignInForm />
            </div>
          </div>

          <div className="mt-5 text-center">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/70">
              Secured by ApliSmart
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
