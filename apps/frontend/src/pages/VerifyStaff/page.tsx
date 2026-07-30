// pages/VerifyStaff/page.tsx
//
// Pantalla PÚBLICA que valida el QR de un carnet del personal.
// ──────────────────────────────────────────────────────────────────────
// Se accede típicamente escaneando el QR del carnet con el celu, lo
// que abre el browser en `<dominio>/verify/<token>`. Esta página llama
// a GET /public/staff/verify/:token (en el backend) y muestra el
// resultado.
//
// Reglas de seguridad:
//   - Es pública (sin auth). NO muestra email, username, password, ni
//     datos sensibles. Solo lo que el backend decide revelar.
//   - Si el token es inválido, expirado, o el user está inactivo, el
//     backend devuelve {valid:false} con un `reason` que acá
//     traducimos a un mensaje legible (sin filtrar info extra).
//   - Rate-limit en backend (120/min por IP). El frontend no hace
//     reintentos agresivos.

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { motion } from "framer-motion";

// ─── Tipos ────────────────────────────────────────────────────────────────

type VerifySuccess = {
  valid: true;
  fullName: string;
  role: string;
  roleKey: string;
  companyName: string;
  photoUrl: string | null;
  status: "active" | "inactive";
  license: {
    number: string;
    type: string;
    expiry: string | null;
    points: number;
  } | null;
};

type VerifyFailure = {
  valid: false;
  reason: "invalid" | "expired" | "not_found" | "inactive";
};

type VerifyResponse = VerifySuccess | VerifyFailure;

const REASON_LABEL: Record<VerifyFailure["reason"], string> = {
  invalid:   "Este código QR no es válido.",
  expired:   "Este carnet venció. Pedile al colaborador que lo renueve.",
  not_found: "No se encontró al personal asociado a este código.",
  inactive:  "Este colaborador está inactivo. No tiene acceso operativo.",
};

const ROLE_ACCENT: Record<string, string> = {
  owner_empresa:  "from-purple-500 to-indigo-600",
  admin_empresa:  "from-blue-500 to-blue-700",
  supervisor:     "from-cyan-500 to-cyan-700",
  operador:       "from-slate-500 to-slate-700",
  conductor:      "from-amber-500 to-amber-700",
};

// ─── Componente ───────────────────────────────────────────────────────────

export default function VerifyStaffPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; data: VerifySuccess }
    | { kind: "fail"; reason: VerifyFailure["reason"]; message: string }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "fail", reason: "invalid", message: REASON_LABEL.invalid });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/public/staff/verify/${encodeURIComponent(token)}`, {
          // Importante: NO mandamos credentials — este endpoint es público.
          // Si el browser manda cookies de sesión, el backend las ignora,
          // pero igualmente evitamos incluirlas para no dar info extra.
          credentials: "omit",
        });
        if (!res.ok) {
          if (cancelled) return;
          setState({ kind: "error", message: `Error HTTP ${res.status}` });
          return;
        }
        const data = (await res.json()) as VerifyResponse;
        if (cancelled) return;

        if (data.valid) {
          setState({ kind: "ok", data });
        } else {
          setState({
            kind: "fail",
            reason: data.reason,
            message: REASON_LABEL[data.reason] ?? "No se pudo verificar el código.",
          });
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Error de red",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md"
      >
        {/* Header — branding */}
        <div className="mb-6 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
          <ShieldIcon />
          <span className="text-xs font-bold uppercase tracking-widest">
            Validador de personal
          </span>
        </div>

        {state.kind === "loading" && <LoadingCard />}
        {state.kind === "ok" && <SuccessCard data={state.data} />}
        {state.kind === "fail" && <FailCard reason={state.reason} message={state.message} />}
        {state.kind === "error" && <ErrorCard message={state.message} />}

        <div className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
          <Link to="/" className="hover:underline">← Volver al inicio</Link>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────

function LoadingCard() {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-slate-900 shadow-xl p-8 flex flex-col items-center">
      <div className="h-12 w-12 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Verificando…</p>
    </div>
  );
}

function SuccessCard({ data }: { data: VerifySuccess }) {
  const initials = data.fullName
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const accent = ROLE_ACCENT[data.roleKey] ?? ROLE_ACCENT.operador;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
      <div className={`bg-gradient-to-br ${accent} px-6 py-4 text-white`}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-90">
          <CheckIcon />
          Personal verificado
        </div>
      </div>

      <div className="px-6 py-6 flex flex-col items-center text-center">
        <div className="h-24 w-24 overflow-hidden rounded-2xl border-4 border-white dark:border-slate-900 shadow-md bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
          {data.photoUrl ? (
            <img
              src={data.photoUrl}
              alt={data.fullName}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className="text-2xl font-bold text-white">{initials}</span>
          )}
        </div>

        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
          {data.fullName}
        </h1>
        <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {data.role}
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          {data.companyName}
        </p>

        {data.license && (
          <div className="mt-5 w-full grid grid-cols-3 gap-2 text-left">
            <LicensePill label="Licencia" value={data.license.type || "—"} />
            <LicensePill
              label="Vence"
              value={data.license.expiry ?? "—"}
            />
            <LicensePill
              label="Puntos"
              value={String(data.license.points ?? 0)}
            />
          </div>
        )}

        <div className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Acceso vigente
        </div>
      </div>
    </div>
  );
}

function LicensePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function FailCard({ reason, message }: { reason: VerifyFailure["reason"]; message: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-white dark:bg-slate-900 shadow-xl p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-500">
        <XIcon />
      </div>
      <h1 className="mt-4 text-base font-semibold text-slate-800 dark:text-white">
        No se pudo verificar
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{message}</p>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        código: {reason}
      </p>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-white dark:bg-slate-900 shadow-xl p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-500">
        <AlertIcon />
      </div>
      <h1 className="mt-4 text-base font-semibold text-slate-800 dark:text-white">
        Error de red
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}

// ─── Iconos inline (sin deps) ────────────────────────────────────────────

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
