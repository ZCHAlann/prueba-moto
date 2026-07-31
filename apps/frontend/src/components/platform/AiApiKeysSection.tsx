"use client";

// components/platform/AiApiKeysSection.tsx
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Sección de gestión de API Keys de /api/ai/* para una
// empresa. Se usa tanto en el drawer de la empresa como en la página
// dedicada /panel/companies/:id/ai-api-keys.
//
// UI (modo lectura, jul 2026 v9.11):
//   - Lista de keys existentes (nombre, prefix, scopes, estado, fecha)
//   - Acciones por key: revocar / reactivar / eliminar / ver logs
//
// jul 2026 v9.11 — Se ELIMINÓ del frontend la UI de creación de keys
// (botón "Generar key", CreateKeyModal, ShowPlainKeyModal). El backend
// sigue exponiendo POST / y la lógica de creación queda disponible
// para uso programático (CLI, scripts, integraciones internas). La
// creación de keys se hace ahora desde la API directamente, no desde
// el panel.
// ─────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  KeyRound, Shield, ShieldOff,
  RotateCcw, Trash2, Activity, AlertTriangle, X,
  Clock, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  usePlatformAiApiKeys,
  type PlatformAiApiKey,
  type PlatformAiApiLog,
} from "@/hooks/usePlatformAiApiKeys";
import { PlatformModal } from "./PlatformModal";

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("es-EC", { year: "numeric", month: "short", day: "2-digit" });
  } catch { return s ?? "—"; }
}

function fmtRelative(s: string | null | undefined): string {
  if (!s) return "nunca";
  try {
    const d = new Date(s);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "hace segundos";
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `hace ${days} d`;
    return fmtDate(s);
  } catch { return "—"; }
}

// ─── Subcomponente: KeyRow ────────────────────────────────────────────

function KeyRow({
  k, onRevoke, onReactivate, onRemove, onViewLogs,
}: {
  k: PlatformAiApiKey;
  onRevoke: (k: PlatformAiApiKey) => void;
  onReactivate: (k: PlatformAiApiKey) => void;
  onRemove: (k: PlatformAiApiKey) => void;
  onViewLogs: (k: PlatformAiApiKey) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div className={`group rounded-xl border p-3 transition
      ${k.active
        ? "border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03] hover:border-brand-300/60"
        : "border-gray-200/50 bg-gray-50/50 dark:border-white/[0.04] dark:bg-white/[0.01]"
      }`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl
          ${k.active
            ? "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400"
            : "bg-gray-100 text-gray-400 dark:bg-white/[0.05] dark:text-gray-500"
          }`}>
          <KeyRound size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
              {k.name}
            </p>
            {!k.active && (
              <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-600 dark:bg-white/[0.08] dark:text-gray-400">
                Revocada
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">
            {k.keyPrefix}…
          </p>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {k.scopes.map(s => (
              <span key={s} className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider
                ${s === "write"
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                  : "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400"
                }`}>
                {s}
              </span>
            ))}
            <span className="text-[10px] text-gray-400 dark:text-gray-500">·</span>
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-gray-500">
              <Clock size={9} /> {fmtRelative(k.lastUsedAt)}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">·</span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {fmtDate(k.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={() => onViewLogs(k)}
            title="Ver logs"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:text-brand-500 dark:border-white/[0.08] dark:hover:text-brand-400">
            <Activity size={12} />
          </button>
          {k.active ? (
            <button type="button" onClick={() => onRevoke(k)} title="Revocar"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:text-amber-500 dark:border-white/[0.08] dark:hover:text-amber-400">
              <ShieldOff size={12} />
            </button>
          ) : (
            <button type="button" onClick={() => onReactivate(k)} title="Reactivar"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:text-emerald-500 dark:border-white/[0.08] dark:hover:text-emerald-400">
              <RotateCcw size={12} />
            </button>
          )}
          <button type="button" onClick={() => setConfirmDel(true)} title="Eliminar"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:text-rose-500 dark:border-white/[0.08] dark:hover:text-rose-400">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Confirm delete inline */}
      <AnimatePresence>
        {confirmDel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-500/20 dark:bg-rose-500/10"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={12} className="shrink-0 text-rose-600 dark:text-rose-400" />
              <p className="flex-1 text-[11px] text-rose-700 dark:text-rose-300">
                ¿Eliminar definitivamente esta key? No se puede deshacer.
              </p>
              <button type="button" onClick={() => setConfirmDel(false)}
                className="rounded px-2 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-500/20">
                No
              </button>
              <button type="button" onClick={() => { setConfirmDel(false); onRemove(k); }}
                className="rounded bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-rose-600">
                Sí, eliminar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Modal: logs de una key ──────────────────────────────────────────

function LogsModal({
  open, onClose, keyId, keyName, fetchLogs,
}: {
  open: boolean;
  onClose: () => void;
  keyId: number | null;
  keyName: string;
  fetchLogs: (keyId: number, opts?: { limit?: number }) => Promise<PlatformAiApiLog[]>;
}) {
  const [logs, setLogs] = useState<PlatformAiApiLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !keyId) return;
    setLoading(true);
    fetchLogs(keyId, { limit: 50 })
      .then(setLogs)
      .finally(() => setLoading(false));
  }, [open, keyId, fetchLogs]);

  return (
    <PlatformModal
      open={open}
      onClose={onClose}
      title={`Logs de "${keyName}"`}
      subtitle="Últimas 50 requests a /api/ai/* con esta key."
      icon={<Activity size={16} />}
      iconBg="bg-brand-50 dark:bg-brand-500/[0.12]"
      iconColor="text-brand-600 dark:text-brand-400"
      maxWidth="max-w-3xl"
    >
      <div className="px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-500">
            <Loader2 className="mr-2 animate-spin" size={14} /> Cargando logs…
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity size={24} className="mb-2 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No hay requests registrados con esta key.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map(log => (
              <div key={log.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 text-[11px] dark:border-white/[0.04] dark:bg-white/[0.02]">
                <span className={`flex h-5 w-12 items-center justify-center rounded-md font-bold ${
                  log.statusCode >= 500 ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400" :
                  log.statusCode >= 400 ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" :
                  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                }`}>
                  {log.statusCode}
                </span>
                <span className="font-mono text-gray-700 dark:text-gray-300 truncate flex-1">{log.method} {log.endpoint}</span>
                <span className="text-gray-400 dark:text-gray-500">{log.durationMs}ms</span>
                <span className="text-gray-400 dark:text-gray-500">{fmtRelative(log.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PlatformModal>
  );
}

// ─── Componente principal ────────────────────────────────────────────

export function AiApiKeysSection({ companyId, compact = false }: { companyId: string | number; compact?: boolean }) {
  // jul 2026 v9.11 — `create` ya no se destructura porque la UI
  // de creación fue removida. La función sigue existiendo en el
  // hook para uso programático futuro.
  const { keys, loading, error, revoke, reactivate, remove, fetchLogs } = usePlatformAiApiKeys(companyId);

  const [logsKey, setLogsKey] = useState<PlatformAiApiKey | null>(null);

  const handleRevoke = useCallback(async (k: PlatformAiApiKey) => {
    if (!confirm(`¿Revocar la key "${k.name}"? El sistema que la use dejará de tener acceso.`)) return;
    const ok = await revoke(k.id);
    if (ok) toast.success("Key revocada");
    else toast.error("Error al revocar");
  }, [revoke]);

  const handleReactivate = useCallback(async (k: PlatformAiApiKey) => {
    const ok = await reactivate(k.id);
    if (ok) toast.success("Key reactivada");
    else toast.error("Error al reactivar");
  }, [reactivate]);

  const handleRemove = useCallback(async (k: PlatformAiApiKey) => {
    const ok = await remove(k.id);
    if (ok) toast.success("Key eliminada");
    else toast.error("Error al eliminar");
  }, [remove]);

  return (
    <div className="space-y-3">
      {/* jul 2026 v9.11 — Modo solo-lectura. NO hay botón "Generar
          key" ni modales de creación: la creación de API keys se
          hace desde el backend (CLI / scripts / integraciones).
          Solo dejamos el título con el contador para que la lista
          sea informativa. En modo compact (drawer) el título va
          implícito en la Section padre. */}
      {!compact && (
        <div className="flex items-center gap-2">
          <p className="min-w-0 truncate text-xs font-semibold text-gray-700 dark:text-gray-200">
            API Keys
            {keys.length > 0 && (
              <span className="ml-1.5 rounded-md bg-gray-200/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                {keys.length}
              </span>
            )}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading && keys.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-xs text-gray-400">
          <Loader2 className="mr-1.5 animate-spin" size={12} /> Cargando…
        </div>
      ) : keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-6 dark:border-white/[0.06]">
          <KeyRound size={18} className="mb-1 text-gray-300 dark:text-gray-600" />
          <p className="text-xs text-gray-400 dark:text-gray-500">No hay API keys</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Se crean desde el backend (CLI / scripts)
          </p>
        </div>
      ) : (
        <div className={compact ? "space-y-2" : "space-y-2 max-h-96 overflow-y-auto"}>
          {keys.map(k => (
            <KeyRow
              key={k.id}
              k={k}
              onRevoke={handleRevoke}
              onReactivate={handleReactivate}
              onRemove={handleRemove}
              onViewLogs={(k) => setLogsKey(k)}
            />
          ))}
        </div>
      )}

      {/* jul 2026 v9.11 — Modales de creación (CreateKeyModal y
          ShowPlainKeyModal) eliminados del frontend. La creación de
          API keys se hace vía backend. */}

      {logsKey && (
        <LogsModal
          open={true}
          onClose={() => setLogsKey(null)}
          keyId={logsKey.id}
          keyName={logsKey.name}
          fetchLogs={fetchLogs}
        />
      )}
    </div>
  );
}
