"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Download, Video, Check, AlertTriangle, Car, User, Calendar,
  MessageSquareWarning, Wrench, Camera, FileText, Loader2, CircleDot
} from "lucide-react";
import { toast } from "sonner";
import type { ExitAuthorization, ExitAuthStatus } from "../../../hooks/useExitAuthorizations";

type Props = {
  authorization: ExitAuthorization | null;
  /** 'viewer' = conductor (sin botones de acción). 'operator' = supervisor/operador/admin/owner. */
  role: "viewer" | "operator";
  onClose: () => void;
  onDecide?: (id: string, action: "approve" | "reject", notes?: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return String(iso).slice(0, 16).replace("T", " ");
}

function StatusPill({ status }: { status: ExitAuthStatus }) {
  const tone =
    status === "Autorizada"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30"
      : status === "Rechazada"
        ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30"
        : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:amber-500/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "Autorizada" ? "bg-emerald-500" : status === "Rechazada" ? "bg-rose-500" : "bg-amber-500"}`} />
      {status}
    </span>
  );
}

export function ExitAuthDetailDrawer({ authorization, role, onClose, onDecide, onDelete }: Props) {
  const [busy, setBusy] = useState<"approve" | "reject" | "delete" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  useEffect(() => {
    if (!authorization) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy && !exporting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [authorization, onClose, busy, exporting]);

  useEffect(() => {
    if (authorization) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [authorization]);

  if (!authorization) return null;

  const a = authorization;
  const isPending = a.status === "Pendiente";
  const canDecide = role === "operator" && isPending;
  const canDelete = role === "operator" && !isPending;

  async function downloadPdf() {
    setExporting(true);
    try {
      const { generateExitAuthPdf } = await import("./ExitAuthorizationPdf");
      const blob = await generateExitAuthPdf(a);
      const url = URL.createObjectURL(blob);
      const xa = document.createElement("a");
      xa.href = url;
      const date = (a.requestedAt ?? "").slice(0, 10);
      xa.download = `autorizacion-${(a.assetPlate ?? a.assetLabel ?? "vehiculo").replace(/[^\w-]+/g, "_")}-${date}.pdf`;
      document.body.appendChild(xa);
      xa.click();
      xa.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo generar el PDF");
    } finally {
      setExporting(false);
    }
  }

  async function handleApprove() {
    if (!onDecide) return;
    setBusy("approve");
    try { await onDecide(a.id, "approve"); } finally { setBusy(null); }
  }
  async function handleReject() {
    if (!onDecide) return;
    setBusy("reject");
    try { await onDecide(a.id, "reject", rejectNotes.trim() || undefined); } finally { setBusy(null); }
  }
  async function handleDelete() {
    if (!onDelete) return;
    if (!confirm("¿Eliminar esta autorización? Esta acción no se puede deshacer.")) return;
    setBusy("delete");
    try { await onDelete(a.id); } finally { setBusy(null); }
  }

  return (
    <AnimatePresence>
      {authorization && (
        <>
          <motion.div key="bd"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={() => { if (!busy && !exporting) onClose(); }}
            className="fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-[2px]" />

          <motion.aside key="dr"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-white/[0.08]">

            {/* HEADER */}
            <header className="px-4 py-5 sm:px-7 border-b border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                      <Wrench size={10} /> Autorización
                    </span>
                    <StatusPill status={a.status} />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight truncate">
                    {a.assetPlate ?? a.assetLabel ?? "Vehículo"}
                  </h2>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate">
                    {a.assetName ?? a.assetLabel ?? "—"}
                  </p>
                </div>
                <button type="button" onClick={onClose} disabled={!!busy || exporting}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-gray-200 transition disabled:opacity-50">
                  <X size={18} />
                </button>
              </div>
            </header>

            {/* BODY */}
            <div className="flex-1 overflow-y-auto bg-gray-50/40 dark:bg-gray-950/20">
              {/* Meta */}
              <div className="px-4 py-5 sm:px-7">
                <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] divide-y divide-gray-100 dark:divide-white/[0.06]">
                  <MetaRow icon={<Car size={12} />}      label="Placa"     value={a.assetPlate ?? a.assetLabel ?? "—"} />
                  <MetaRow icon={<User size={12} />}     label="Conductor" value={a.driverName ?? "—"} />
                  <MetaRow icon={<Calendar size={12} />} label="Solicitada" value={fmtDate(a.requestedAt)} />
                  {a.decidedAt && <MetaRow icon={<Check size={12} />} label="Decidida" value={fmtDate(a.decidedAt)} />}
                  {a.decidedByName && <MetaRow icon={<User size={12} />} label="Decisor" value={a.decidedByName} />}
                </div>
              </div>

              {/* Evidencias */}
              <div className="px-4 pb-5 sm:px-7 space-y-4">
                <SectionTitle icon={<Camera size={12} />}>Evidencias</SectionTitle>

                {/* Video de la bayoneta */}
                <EvidenceRow
                  label="Bayoneta de aceite (video)"
                  videoUrl={a.oilBayonetaVideoUrl}
                  thumbUrl={a.oilBayonetaVideoThumbUrl}
                  type="video"
                />

                {/* Llantas (4) */}
                <TiresRow urls={a.tirePhotosUrl} />

                {/* Fotos individuales */}
                <PhotoEvidence label="Líquido refrigerante"        url={a.coolantPhotoUrl} />
                <PhotoEvidence label="Líquido de frenos"          url={a.brakeFluidPhotoUrl} />
                <PhotoEvidence label="Agua del limpia parabrisas" url={a.windshieldWasherPhotoUrl} />
                <PhotoEvidence label="Luces"                      url={a.lightsPhotoUrl} />
                <PhotoEvidence label="Batería"                    url={a.batteryPhotoUrl} />
                <PhotoEvidence label="Gato hidráulico"            url={a.jackPhotoUrl} />
              </div>

              {/* Notas */}
              {(a.notes || a.decisionNotes) && (
                <div className="px-7 pb-5 space-y-3">
                  {a.notes && (
                    <div>
                      <SectionTitle icon={<FileText size={12} />}>Notas del conductor</SectionTitle>
                      <p className="mt-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{a.notes}</p>
                    </div>
                  )}
                  {a.decisionNotes && (
                    <div>
                      <SectionTitle icon={<MessageSquareWarning size={12} />}>Motivo de rechazo</SectionTitle>
                      <p className="mt-2 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/[0.04] px-4 py-3 text-sm text-rose-900 dark:text-rose-100">{a.decisionNotes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* FOOTER */}
            <footer className="border-t border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shrink-0">
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-2 sm:px-5 sm:py-3.5">
                {canDelete ? (
                  <button type="button" onClick={handleDelete} disabled={!!busy}
                    className="rounded-lg border border-rose-200 dark:border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-40 transition">
                    Eliminar
                  </button>
                ) : null}

                {rejectNotes.length > 0 && canDecide ? (
                  <button type="button" onClick={() => setRejectNotes("")}
                    className="self-start text-xs text-gray-500 dark:text-gray-400 underline sm:self-auto">
                    Limpiar nota de rechazo
                  </button>
                ) : null}

                <div className="hidden flex-1 sm:block" />

                {canDecide ? (
                  <textarea
                    placeholder="Nota de rechazo (opcional)…"
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                    rows={1}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/10 resize-none sm:flex-1 sm:max-w-xs" />
                ) : null}

                {canDecide ? (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleReject} disabled={!!busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/15 disabled:opacity-40 transition sm:flex-none">
                      {busy === "reject" && <Loader2 size={12} className="animate-spin" />}
                      Rechazar
                    </button>
                    <button type="button" onClick={handleApprove} disabled={!!busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 px-4 py-2 text-xs font-semibold text-white transition sm:flex-none">
                      {busy === "approve" && <Loader2 size={12} className="animate-spin" />}
                      Aprobar salida
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={downloadPdf} disabled={exporting}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition sm:w-auto">
                    {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    {exporting ? "Generando…" : "Descargar PDF"}
                  </button>
                )}
              </div>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <span className="text-gray-400 dark:text-gray-500">{icon}</span>
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 shrink-0 w-24">{label}</span>
      <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1 text-right">{value}</span>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
      {icon} {children}
    </p>
  );
}

function PhotoEvidence({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.02] px-4 py-3 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
        <Camera size={12} /> {label} — sin foto
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-hidden">
      <a href={url} target="_blank" rel="noopener noreferrer" className="block group">
        <div className="relative">
          <img src={url} alt={label} className="w-full h-44 object-cover group-hover:opacity-90 transition" />
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            <Camera size={10} /> Ver
          </span>
        </div>
      </a>
      <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function TiresRow({ urls }: { urls: string[] }) {
  const labels = ["Delantera izquierda", "Delantera derecha", "Trasera izquierda", "Trasera derecha"];
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Llantas</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {labels.map((label, i) => {
          const url = urls[i];
          if (!url) {
            return (
              <div key={i} className="rounded-lg border border-dashed border-gray-200 dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.02] px-2 py-3 text-[10px] text-gray-400 dark:text-gray-500 flex flex-col items-center gap-1">
                <CircleDot size={14} />
                {label}
                <span>—</span>
              </div>
            );
          }
          return (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
              className="relative block rounded-lg border border-gray-200 dark:border-white/[0.08] overflow-hidden group">
              <img src={url} alt={label} className="w-full h-24 object-cover group-hover:opacity-90 transition" />
              <span className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white bg-black/70">{label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceRow({ label, videoUrl, thumbUrl, type }: {
  label: string; videoUrl: string | null; thumbUrl: string | null; type: "video" | "image";
}) {
  if (!videoUrl) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.02] px-4 py-3 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
        <Video size={12} /> {label} — sin video
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-hidden">
      <div className="relative bg-gray-900">
        <video src={videoUrl} controls poster={thumbUrl ?? undefined} className="w-full max-h-56" />
      </div>
      <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        <Video size={11} /> {label}
      </p>
    </div>
  );
}
