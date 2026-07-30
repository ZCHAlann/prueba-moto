// components/IDCardModal.tsx
//
// Modal de carnet digital (ID card) para usuarios de la empresa.
// ──────────────────────────────────────────────────────────────────────
// - Layout vertical fiel a la referencia: foto grande arriba, barra de
//   nombre superpuesta al borde inferior de la foto, y debajo una grilla
//   de 2 columnas con los datos a la izquierda y el QR a la derecha.
// - Estética del sistema: azul de marca + gris (mismos tokens que el
//   resto del panel), con soporte dark mode.
// - El QR codifica la URL pública `${PUBLIC_BASE}/verify/${token}`.
// - El token se pide al backend on-demand (POST /qr-token), no se
//   cachea en el cliente: si rotamos STAFF_QR_SECRET en el server,
//   los QRs viejos siguen funcionando hasta que el server los invalida
//   (exp natural o user inactivo).
// - Botón "Descargar PDF": delega al backend (GET /card.pdf). El server
//   genera el PDF con jspdf + qrcode en formato credencial ID-1
//   (54×85.6mm), pixel-perfect, sin html2canvas.
//
//   jul 2026 v8.7 — Antes este botón hacía html2canvas del DOM. Eso
//   rompía con gradientes, ring shadows y dark mode (gradientes
//   salían pixelados, ring se convertía en rectángulo negro). Ahora
//   todo se hace server-side, mismo patrón que `invoice-pdf.ts`.
//
// Componente LOCAL al módulo Usuarios. Si en el futuro otro módulo
// necesita un carnet, mover a components/ui/id-card/.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import type { CompanyUser } from "@/hooks/useCompanyUsers";
import { requestStaffQrToken } from "@/hooks/useCompanyUsers";

// ─── Tipos ────────────────────────────────────────────────────────────────

/**
 * jul 2026 — subset flexible para abrir el carnet desde otras páginas
 * (Conductores, etc.) que ya tienen los datos del `company_user` en
 * memoria y no quieren/peuden re-fetchear la fila completa. El carnet
 * solo necesita: id, username, email, role, photoUrl, dni, profileData.
 * `CompanyUser` (de Accesos/Usuarios) es estructuralmente compatible.
 */
export type UserCardData = {
  id: string;
  username: string;
  email: string;
  role: string;
  photoUrl: string | null;
  dni?: string | null;
  profileData: Record<string, unknown>;
};

type Props = {
  open: boolean;
  user: UserCardData | CompanyUser | null;
  companyId: number;
  /** URL base pública del frontend (sin slash al final). Se usa para
   *  armar la URL que codifica el QR (`/verify/<token>`). Si no se pasa,
   *  intenta derivarla de `window.location.origin`. */
  publicBaseUrl?: string;
  onClose: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  owner_empresa: "Dueño / Propietario",
  admin_empresa: "Administrador",
  supervisor: "Supervisor",
  operador: "Operador",
  conductor: "Conductor",
};

function userDisplayName(u: UserCardData): string {
  const p = u.profileData;
  const full =
    (typeof p.fullName === "string" ? p.fullName : "") ||
    [
      typeof p.firstName === "string" ? p.firstName : "",
      typeof p.lastName === "string" ? p.lastName : "",
    ]
      .filter(Boolean)
      .join(" ");
  return full || u.username || u.email || "—";
}

function userInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** ID corto y legible derivado del token, solo para mostrar en el carnet
 *  (como el "ID29103050" de la referencia). No es un dato de seguridad,
 *  el token real que va en el QR nunca se trunca ni se reformatea. */
function shortId(userId: number | string, token: string | null): string {
  const suffix = token ? token.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase() : "--------";
  return `ID${suffix}`;
}

// ─── Componente ───────────────────────────────────────────────────────────

export function IDCardModal({ open, user, companyId, publicBaseUrl, onClose }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);


  // ── Cargar token cuando se abre el modal ───────────────────────────────
  useEffect(() => {
    if (!open || !user) {
      // Al cerrar, limpiamos estado para que la próxima apertura haga
      // un fetch fresco (el backend puede haber rotado la clave).
      setToken(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setToken(null);

    requestStaffQrToken(companyId, user.id)
      .then((res) => {
        if (cancelled) return;
        setToken(res.token);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || "No se pudo obtener el token del QR");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, user, companyId]);

  if (!user) return null;

  const p = user.profileData;
  const fullName = userDisplayName(user);
  const initials = userInitials(fullName);
  const dni =
    (user.dni as unknown as string) ||
    (typeof p.documentNumber === "string" ? p.documentNumber : "");
  const licenseNumber = typeof p.licenseNumber === "string" ? p.licenseNumber : "";
  const licenseType = typeof p.licenseType === "string" ? p.licenseType : "";
  const licenseExpiry = typeof p.licenseExpiry === "string" ? p.licenseExpiry : "";
  const licensePoints = typeof p.licensePoints === "number" ? p.licensePoints : 0;
  const isConductor = user.role === "conductor";
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  // URL pública del QR. Si no nos pasaron publicBaseUrl, derivamos de
  // window.location.origin. En dev eso es http://localhost:5173.
  const base = (publicBaseUrl ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(
    /\/$/,
    ""
  );
  const qrUrl = token ? `${base}/verify/${token}` : "";
  const cardId = shortId(user.id, token);

  // ── Descargar carnet como PDF (server-side) ───────────────────────────
  // jul 2026 v8.7 — Antes esto hacía html2canvas del DOM, que rompía
  // con gradientes, ring shadows y dark mode. Ahora delegamos al
  // backend: GET /api/company/:id/users/:userId/card.pdf devuelve
  // un PDF jspdf pixel-perfect con la misma info que el modal.
  //
  // El PDF incluye el QR REAL (no un placeholder) con la URL
  // /verify/<token> del server, así un supervisor puede escanear
  // desde el PDF impreso y validar al personal.
  async function handleDownloadPdf() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/company/${companyId}/users/${user.id}/card.pdf`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      const blob = await res.blob();
      // Crear un link temporal y disparar la descarga programática.
      // Más robusto que `window.location.href` porque permite
      // manipular el nombre del archivo.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `carnet-${user.username || user.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Liberar el object URL en el siguiente tick (después de que el
      // browser haya tomado la URL para la descarga).
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Carnet descargado");
    } catch (err) {
      console.error("[IDCardModal] Error descargando PDF:", err);
      toast.error(err instanceof Error ? err.message : "No se pudo generar el PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-[70] w-full max-w-[360px] -translate-x-1/2 -translate-y-1/2 px-4"
          >
            <div className="relative">
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute -top-3 -right-1 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-400 shadow-lg ring-1 ring-black/5 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 transition"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>

              {/* ── Carnet ── */}
              <div
                className="overflow-hidden rounded-[20px] bg-white dark:bg-gray-900 shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06]"
              >
                {/* Foto grande arriba */}
                <div className="relative bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-500/10 dark:to-blue-500/5 px-5 pt-5 pb-9">
                  <div className="mx-auto h-[168px] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                    {user.photoUrl ? (
                      <img
                        src={user.photoUrl}
                        alt={fullName}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="text-4xl font-bold text-white">{initials}</span>
                    )}
                  </div>
                </div>

                {/* Barra de nombre, superpuesta al borde inferior de la foto */}
                <div className="-mt-6 px-5">
                  <div className="rounded-xl bg-gray-900 dark:bg-black px-4 py-2.5 text-center shadow-md">
                    <p className="truncate text-[13px] font-bold uppercase tracking-wide text-white">
                      {fullName}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wider text-blue-300">
                      {roleLabel}
                    </p>
                  </div>
                </div>

                {/* Grilla de datos: izquierda info apilada, derecha QR */}
                <div className="grid grid-cols-2 gap-3 px-5 pt-4 pb-5">
                  <div className="space-y-2.5">
                    <CardField label="Documento" value={dni || "—"} />
                    <CardField label="Usuario" value={`@${user.username}`} />
                    {isConductor && (licenseNumber || licenseType) && (
                      <CardField
                        label="Licencia"
                        value={licenseNumber ? `${licenseType ? `${licenseType} · ` : ""}${licenseNumber}` : "—"}
                      />
                    )}
                    {isConductor && licenseExpiry && <CardField label="Vence" value={licenseExpiry} />}
                    {isConductor && (licenseNumber || licenseType) && (
                      <CardField label="Puntos" value={String(licensePoints)} />
                    )}
                  </div>

                  <div className="flex flex-col items-center justify-start gap-2">
                    <div className="flex h-[92px] w-[92px] items-center justify-center rounded-lg border border-gray-200 dark:border-white/10 bg-white p-1.5">
                      {loading && (
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                      )}
                      {error && !loading && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-rose-500">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      )}
                      {token && !loading && !error && (
                        <QRCodeSVG value={qrUrl} size={78} level="M" bgColor="#ffffff" fgColor="#0f172a" />
                      )}
                    </div>
                    <p className="text-center font-mono text-[9px] tracking-wider text-gray-400 dark:text-gray-500">
                      {cardId}
                    </p>
                  </div>
                </div>

                {/* Pie de marca */}
                <div className="border-t border-gray-100 dark:border-white/[0.06] px-5 py-2.5 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Validar personal · ApliSmart Motors
                  </p>
                </div>
              </div>

              {/* Botón de descarga — fuera del área capturada */}
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloading || loading || !token}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Generando PDF…
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Descargar PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────

function CardField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <p className="truncate text-[12px] font-semibold text-gray-800 dark:text-white">{value}</p>
    </div>
  );
}