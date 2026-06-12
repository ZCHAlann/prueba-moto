// src/pages/Platform/CRM/page.tsx
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { useCRM }           from "../../hooks/useCRM";
import { CRMHeader }        from "./components/CRMHeader";
import { CRMKpiCards }      from "./components/CRMKpiCards";
import { Pipeline }         from "./components/Pipeline";
import { DealDrawer }       from "./components/DealDrawer";
import { DealForm }         from "./components/DealForm";
import { ConvertModal }     from "./components/ConvertModal";
import { ActivityFeed }     from "./components/ActivityFeed";
import { ForecastPanel }    from "./components/ForecastPanel";
import { CmdK }             from "./components/CmdK";

import type { CRMDeal, LeadStatus } from "../../types/platform";

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirm({
  deal, onConfirm, onCancel, loading,
}: {
  deal:      CRMDeal;
  onConfirm: () => void;
  onCancel:  () => void;
  loading:   boolean;
}) {
  return (
    <AnimatePresence>
      <motion.div
        key="del-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 bg-gray-950/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <motion.div
        key="del-modal"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{ opacity: 0,   scale: 0.96, y: 12  }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-full max-w-sm overflow-hidden rounded-2xl
          border border-white/[0.08] bg-gray-900 shadow-2xl">

          {/* Header */}
          <div className="border-b border-white/[0.06] px-4 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl
                bg-rose-500/[0.12] border border-rose-500/20">
                <span className="text-base">🗑️</span>
              </div>
              <div>
                <p className="font-bold text-white text-sm">Eliminar deal</p>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[200px]">
                  {deal.companyName}
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-4 py-5 sm:px-6">
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-4 py-3">
              <p className="text-sm text-rose-300 leading-relaxed">
                Esta acción eliminará el deal permanentemente. No se puede deshacer.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse items-stretch gap-2 border-t border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <button type="button" onClick={onCancel}
              className="text-sm font-semibold text-gray-600
                hover:text-gray-300 transition px-1">
              Cancelar
            </button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={onConfirm}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl
                bg-rose-500 px-4 py-2 text-sm font-semibold text-white
                shadow-sm shadow-rose-500/20 hover:bg-rose-600 transition
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin" width="13" height="13"
                    viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Eliminando…
                </>
              ) : "Sí, eliminar"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── CRM Page ─────────────────────────────────────────────────────────────────

export function CRMPage() {
  const {
    pipeline, stats, forecast, activity,
    loadingPipeline, loadingStats, loadingForecast, loadingActivity,
    refetch,
    moveDeal, convertDeal, createDeal, updateDeal, deleteDeal, searchDeals,
  } = useCRM();

  // ── UI state ────────────────────────────────────────────────────────────────

  const [drawerDeal,    setDrawerDeal]    = useState<CRMDeal | null>(null);
  const [formOpen,      setFormOpen]      = useState(false);
  const [editingDeal,   setEditingDeal]   = useState<CRMDeal | null>(null);
  const [initialStage,  setInitialStage]  = useState<LeadStatus | undefined>();
  const [convertOpen,   setConvertOpen]   = useState(false);
  const [convertDeal_,  setConvertDeal_]  = useState<CRMDeal | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<CRMDeal | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  const [cmdkOpen,      setCmdkOpen]      = useState(false);
  const [sidebarOpen,   setSidebarOpen]   = useState(true);

  // ── Keyboard shortcut Cmd+K ─────────────────────────────────────────────────

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdkOpen(v => !v);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function openCreate(stage?: LeadStatus) {
    setEditingDeal(null);
    setInitialStage(stage);
    setFormOpen(true);
  }

  function openEdit(deal: CRMDeal) {
    setEditingDeal(deal);
    setInitialStage(undefined);
    setDrawerDeal(null);
    setFormOpen(true);
  }

  function openConvert(deal: CRMDeal) {
    setConvertDeal_(deal);
    setConvertOpen(true);
    setDrawerDeal(null);
  }

  function openDelete(deal: CRMDeal) {
    setDeleteTarget(deal);
    setDrawerDeal(null);
  }

  const handleMove = useCallback(async (deal: CRMDeal, status: LeadStatus) => {
    try {
      await moveDeal(deal.id, status);
      toast.success(`Movido a ${status.replace("_", " ")}`);
      // Actualizar drawer si está abierto
      if (drawerDeal?.id === deal.id) {
        setDrawerDeal(prev => prev ? { ...prev, status } : null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al mover");
    }
  }, [moveDeal, drawerDeal]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDeal(deleteTarget.id);
      toast.success(`"${deleteTarget.companyName}" eliminado`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleteDeal]);

  const handleCmdKSelect = useCallback((deal: CRMDeal) => {
    setDrawerDeal(deal);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <CRMHeader
        stats={stats}
        loading={loadingStats}
        onRefetch={refetch}
      />

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <CRMKpiCards stats={stats} />

      {/* ── Toolbar extra ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Cmd+K trigger */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={() => setCmdkOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08]
            bg-white/[0.03] px-3 py-2 text-sm text-gray-500
            hover:bg-white/[0.05] hover:text-gray-300 transition"
        >
          <Search size={13} />
          <span>Buscar deal…</span>
          <div className="flex items-center gap-0.5 ml-1">
            <kbd className="rounded border border-white/[0.08] bg-white/[0.04]
              px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
              ⌘
            </kbd>
            <kbd className="rounded border border-white/[0.08] bg-white/[0.04]
              px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
              K
            </kbd>
          </div>
        </motion.button>

        {/* Toggle sidebar */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={() => setSidebarOpen(v => !v)}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2
            text-xs font-semibold transition-all
            ${sidebarOpen
              ? "border-brand-500/30 bg-brand-500/10 text-brand-400"
              : "border-white/[0.08] text-gray-500 hover:text-gray-300"
            }`}
        >
          {sidebarOpen ? "Ocultar panel" : "Ver forecast y actividad"}
        </motion.button>

        {/* New deal */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={() => openCreate()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl
            bg-brand-500 px-4 py-2 text-sm font-semibold text-white
            shadow-sm shadow-brand-500/20 hover:bg-brand-600 transition"
        >
          <Plus size={14} /> Nuevo deal
        </motion.button>
      </div>

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div className={`grid gap-6 transition-all duration-300
        ${sidebarOpen ? "xl:grid-cols-[1fr_280px]" : "xl:grid-cols-1"}`}>

        {/* Pipeline */}
        <div className="min-w-0">
          <Pipeline
            pipeline={pipeline}
            loading={loadingPipeline}
            onDetail={deal  => setDrawerDeal(deal)}
            onEdit={openEdit}
            onDelete={openDelete}
            onMove={handleMove}
            onAdd={openCreate}
          />
        </div>

        {/* Sidebar — Forecast + Activity */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              key="sidebar"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0  }}
              exit={{ opacity: 0,   x: 24  }}
              transition={{ duration: 0.25 }}
              className="space-y-4 hidden xl:block"
            >
              <ForecastPanel
                forecast={forecast}
                loading={loadingForecast}
              />
              <ActivityFeed
                activity={activity}
                loading={loadingActivity}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Modals & overlays ─────────────────────────────────────────────── */}

      {/* Deal Drawer */}
      <DealDrawer
        deal={drawerDeal}
        onClose={() => setDrawerDeal(null)}
        onEdit={() => drawerDeal && openEdit(drawerDeal)}
        onConvert={() => drawerDeal && openConvert(drawerDeal)}
        onMove={(status) => drawerDeal && handleMove(drawerDeal, status)}
      />

      {/* Deal Form — crear / editar */}
      <DealForm
        open={formOpen}
        editing={editingDeal}
        initialStage={initialStage}
        onClose={() => setFormOpen(false)}
        onCreate={createDeal}
        onUpdate={updateDeal}
      />

      {/* Convert Modal */}
      <ConvertModal
        open={convertOpen}
        deal={convertDeal_}
        onClose={() => { setConvertOpen(false); setConvertDeal_(null); }}
        onConvert={convertDeal}
      />

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirm
            deal={deleteTarget}
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
            loading={deleting}
          />
        )}
      </AnimatePresence>

      {/* Cmd+K */}
      <CmdK
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        onSearch={searchDeals}
        onSelect={handleCmdKSelect}
      />
    </div>
  );
}