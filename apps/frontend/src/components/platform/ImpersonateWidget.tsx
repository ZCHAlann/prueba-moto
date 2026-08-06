// components/platform/ImpersonateWidget.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Widget flotante de impersonación (solo superadmin).
// FAB → lista de empresas → confirmación → entrar al panel de la empresa.
// Mientras está activa una impersonación, el botón de "volver" vive en
// AppHeader (banner), no acá. Este widget solo se monta en scope
// 'plataforma' con rol 'superadmin'.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Building2, Search, Loader2, X, RefreshCw,
  ShieldCheck, ArrowLeft, ExternalLink,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useScreenTransition } from "../../context/ScreenTransitionContext";
import { usePlatformCompanies } from "../../hooks/usePlatformCompanies";
import { PlatformModal } from "./PlatformModal";
import type { PlatformCompany } from "../../types/platform";

export function ImpersonateWidget() {
  const { session, impersonate } = useAuth();
  const navigate = useNavigate();
  const { transition } = useScreenTransition();

  const { companies, loading, error, refetch } = usePlatformCompanies();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PlatformCompany | null>(null);
  const [busy, setBusy] = useState(false);

  const isSuperadmin = session?.role === "superadmin" && session.scope === "plataforma";
  if (!isSuperadmin) return null;

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  );

  const handleConfirm = async () => {
    if (!selected) return;
    const company = selected;
    setBusy(true);
    setOpen(false);
    setSelected(null);
    setSearch("");
    try {
      const result = await impersonate(company.id);
      if (result.ok) {
        // Transición de "teletransporte": un círculo oscurece toda la
        // pantalla, navega al dashboard de la empresa y se abre revelando
        // el nuevo panel. El provider global mantiene el overlay arriba
        // mientras el router cambia de layout.
        transition({
          label: `Abriendo ${company.name}...`,
          navigate: () => navigate("/dashboard"),
        });
      } else {
        toast.error(result.message ?? "No se pudo impersonar la empresa.");
      }
    } finally {
      setBusy(false);
    }
  };

  const closeConfirm = () => {
    if (busy) return;
    setSelected(null);
  };

  return (
    <>
      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar impersonación" : "Impersonar empresa"}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-2xl transition-transform hover:scale-105 active:scale-95"
        style={{
          background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
          boxShadow: open
            ? "0 0 20px rgba(245,158,11,0.6)"
            : "0 8px 30px rgba(239,68,68,0.35)",
        }}
      >
        {open ? <X className="h-6 w-6" /> : <Building2 className="h-6 w-6" />}
      </button>

      {/* Panel de empresas */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 bg-transparent"
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="fixed bottom-24 right-6 z-50 flex w-[320px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-gray-900"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/[0.12] dark:text-amber-400">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">
                      Impersonar empresa
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      Entrás como admin de la empresa
                    </p>
                  </div>
                </div>
              </div>

              {/* Search */}
              <div className="px-3 pt-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar empresa..."
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-amber-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:focus:bg-white/[0.06]"
                  />
                </div>
              </div>

              {/* List */}
              <div className="mt-2 max-h-[45vh] overflow-y-auto px-1 pb-2">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando empresas...
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <p className="text-sm text-red-500">{error}</p>
                    <button
                      type="button"
                      onClick={refetch}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.05]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">
                    {search ? "Sin resultados." : "No hay empresas."}
                  </p>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelected(c)}
                      disabled={c.status !== "active" && c.status !== "trial"}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/[0.05]"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/[0.12] dark:text-brand-400">
                        <Building2 className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800 dark:text-white">
                          {c.name}
                        </p>
                        <p className="truncate text-[11px] text-gray-400">
                          {c.enabledModules?.length ?? 0} módulos activos
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          c.status === "active"
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/[0.12] dark:text-emerald-400"
                            : c.status === "trial"
                              ? "bg-amber-50 text-amber-600 dark:bg-amber-500/[0.12] dark:text-amber-400"
                              : "bg-red-50 text-red-500 dark:bg-red-500/[0.12] dark:text-red-400"
                        }`}
                      >
                        {c.status}
                      </span>
                    </button>
                  ))
                )}
              </div>

              <div className="border-t border-gray-100 px-3 py-2 dark:border-white/[0.06]">
                <p className="text-[10px] text-gray-400">
                  {session?.impersonating
                    ? "Ya hay una impersonación activa en otra empresa."
                    : "Las acciones quedan registradas en auditoría."}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal de confirmación */}
      <PlatformModal
        open={!!selected}
        onClose={closeConfirm}
        title="Impersonar empresa"
        subtitle={selected?.name}
        icon={<ShieldCheck className="h-4 w-4" />}
        iconBg="bg-amber-50 dark:bg-amber-500/[0.12]"
        iconColor="text-amber-600 dark:text-amber-400"
        maxWidth="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={closeConfirm}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <ArrowLeft className="h-4 w-4" /> Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-amber-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              {busy ? "Entrando..." : "Entrar como admin"}
            </button>
          </>
        }
      >
        <div className="px-6 py-4">
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            Vas a entrar al panel de <strong className="text-gray-900 dark:text-white">{selected?.name}</strong>{" "}
            con rol de administrador. Volverás a tu panel de plataforma desde
            el indicador <strong>“Impersonando”</strong> en la esquina superior derecha.
          </p>
        </div>
      </PlatformModal>
    </>
  );
}
