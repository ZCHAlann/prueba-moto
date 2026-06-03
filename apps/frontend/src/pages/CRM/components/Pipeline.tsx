import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, TrendingUp, DollarSign, Plus,
} from "lucide-react";
import { DealCard } from "./DealCard";
import type { CRMDeal, CRMPipelineStage, LeadStatus } from "../../../types/platform";

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_META: Record<LeadStatus, {
  label: string;
  color: string;
  accent: string;
  bg: string;
  border: string;
  textColor: string;
}> = {
  nuevo: {
    label: "Nuevo",
    color: "bg-gray-400",
    accent: "#9ca3af",
    bg: "bg-gray-500/[0.07]",
    border: "border-gray-500/20",
    textColor: "text-gray-300",
  },
  contactado: {
    label: "Contactado",
    color: "bg-blue-400",
    accent: "#60a5fa",
    bg: "bg-blue-500/[0.07]",
    border: "border-blue-500/20",
    textColor: "text-blue-300",
  },
  demo_agendada: {
    label: "Demo agendada",
    color: "bg-violet-400",
    accent: "#a78bfa",
    bg: "bg-violet-500/[0.07]",
    border: "border-violet-500/20",
    textColor: "text-violet-300",
  },
  propuesta_enviada: {
    label: "Propuesta enviada",
    color: "bg-amber-400",
    accent: "#fbbf24",
    bg: "bg-amber-500/[0.07]",
    border: "border-amber-500/20",
    textColor: "text-amber-300",
  },
  ganado: {
    label: "Ganado",
    color: "bg-emerald-400",
    accent: "#34d399",
    bg: "bg-emerald-500/[0.07]",
    border: "border-emerald-500/20",
    textColor: "text-emerald-300",
  },
  perdido: {
    label: "Perdido",
    color: "bg-rose-400",
    accent: "#fb7185",
    bg: "bg-rose-500/[0.07]",
    border: "border-rose-500/20",
    textColor: "text-rose-300",
  },
};

const ACTIVE_STAGES: LeadStatus[] = [
  "nuevo", "contactado", "demo_agendada", "propuesta_enviada",
];
const ALL_STAGES: LeadStatus[] = [...ACTIVE_STAGES, "ganado", "perdido"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtValue(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

// ─── Column Header ────────────────────────────────────────────────────────────

function ColumnHeader({
  stage, count, totalValue, collapsed, onToggle, onAdd,
}: {
  stage: LeadStatus;
  count: number;
  totalValue: number;
  collapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
}) {
  const meta = STAGE_META[stage];

  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5
      ${meta.bg} ${meta.border} mb-3`}>

      {/* Dot + label */}
      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.color}`} />
      {!collapsed && (
        <span className={`text-xs font-semibold ${meta.textColor} truncate flex-1`}>
          {meta.label}
        </span>
      )}

      {/* Count badge */}
      <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5
        text-[10px] font-bold text-gray-300 shrink-0">
        {count}
      </span>

      {/* Value */}
      {!collapsed && totalValue > 0 && (
        <span className={`text-[10px] font-semibold ${meta.textColor} shrink-0`}>
          {fmtValue(totalValue)}
        </span>
      )}

      {/* Actions */}
      {!collapsed && (
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <motion.button
            type="button" whileTap={{ scale: 0.88 }}
            onClick={e => { e.stopPropagation(); onAdd(); }}
            className="flex h-5 w-5 items-center justify-center rounded-lg
              text-gray-500 hover:text-brand-400 transition"
          >
            <Plus size={11} />
          </motion.button>
          <motion.button
            type="button" whileTap={{ scale: 0.88 }}
            onClick={onToggle}
            className="flex h-5 w-5 items-center justify-center rounded-lg
              text-gray-500 hover:text-gray-300 transition"
          >
            <ChevronLeft size={11} />
          </motion.button>
        </div>
      )}

      {/* Collapsed — solo toggle */}
      {collapsed && (
        <motion.button
          type="button" whileTap={{ scale: 0.88 }}
          onClick={onToggle}
          className="ml-auto flex h-5 w-5 items-center justify-center
            rounded-lg text-gray-500 hover:text-gray-300 transition"
        >
          <ChevronLeft size={11} className="rotate-180" />
        </motion.button>
      )}
    </div>
  );
}

// ─── Pipeline Column ──────────────────────────────────────────────────────────

function PipelineColumn({
  stageData, collapsed, onToggle, onAdd,
  onDetail, onEdit, onDelete, onMove,
}: {
  stageData: CRMPipelineStage;
  collapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onDetail: (deal: CRMDeal) => void;
  onEdit:   (deal: CRMDeal) => void;
  onDelete: (deal: CRMDeal) => void;
  onMove:   (deal: CRMDeal, status: LeadStatus) => void;
}) {
  const meta = STAGE_META[stageData.stage];

  return (
    <motion.div
      layout
      animate={{ width: collapsed ? 48 : "100%" }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="flex flex-col shrink-0"
      style={{ minWidth: collapsed ? 48 : 240, maxWidth: collapsed ? 48 : 300 }}
    >
      <ColumnHeader
        stage={stageData.stage}
        count={stageData.count}
        totalValue={stageData.totalValue}
        collapsed={collapsed}
        onToggle={onToggle}
        onAdd={onAdd}
      />

      {/* Cards */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-2.5 flex-1"
          >
            {stageData.deals.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`flex flex-col items-center justify-center gap-1.5
                  rounded-2xl border border-dashed py-8
                  ${meta.border}`}
              >
                <DollarSign size={16} className="text-gray-600" />
                <p className="text-xs text-gray-500">Sin deals</p>
              </motion.div>
            ) : (
              <AnimatePresence>
                {stageData.deals.map(deal => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    onDetail={() => onDetail(deal)}
                    onEdit={() => onEdit(deal)}
                    onDelete={() => onDelete(deal)}
                    onMove={status => onMove(deal, status)}
                  />
                ))}
              </AnimatePresence>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed — rotated label */}
      {collapsed && (
        <div className="flex flex-1 items-center justify-center">
          <p className={`text-[10px] font-semibold ${meta.textColor}
            rotate-90 whitespace-nowrap mt-4`}>
            {meta.label} ({stageData.count})
          </p>
        </div>
      )}
    </motion.div>
  );
}

// ─── Focus Mode ───────────────────────────────────────────────────────────────

function FocusMode({
  pipeline, onDetail, onEdit, onDelete, onMove,
}: {
  pipeline: CRMPipelineStage[];
  onDetail: (deal: CRMDeal) => void;
  onEdit:   (deal: CRMDeal) => void;
  onDelete: (deal: CRMDeal) => void;
  onMove:   (deal: CRMDeal, status: LeadStatus) => void;
}) {
  const staleDeal = pipeline
    .flatMap(s => s.deals)
    .filter(d => d.urgency !== "normal" && !["ganado","perdido"].includes(d.status))
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border border-amber-500/20
        bg-amber-500/[0.07] px-4 py-3">
        <TrendingUp size={14} className="text-amber-400" />
        <p className="text-sm font-semibold text-amber-300">
          Focus Mode — {staleDeal.length} deal{staleDeal.length !== 1 ? "s" : ""} requieren atención
        </p>
      </div>

      {staleDeal.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <TrendingUp size={24} className="text-emerald-500" />
          <p className="text-sm font-semibold text-emerald-400">Pipeline saludable</p>
          <p className="text-xs text-gray-500">Todos los deals están activos</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence>
            {staleDeal.map(deal => (
              <DealCard
                key={deal.id}
                deal={deal}
                onDetail={() => onDetail(deal)}
                onEdit={() => onEdit(deal)}
                onDelete={() => onDelete(deal)}
                onMove={status => onMove(deal, status)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Pipeline Main ────────────────────────────────────────────────────────────

type ViewMode = "kanban" | "focus";

interface PipelineProps {
  pipeline: CRMPipelineStage[];
  loading: boolean;
  onDetail: (deal: CRMDeal) => void;
  onEdit:   (deal: CRMDeal) => void;
  onDelete: (deal: CRMDeal) => void;
  onMove:   (deal: CRMDeal, status: LeadStatus) => void;
  onAdd:    (stage?: LeadStatus) => void;
}

export function Pipeline({
  pipeline, loading, onDetail, onEdit, onDelete, onMove, onAdd,
}: PipelineProps) {
  const [viewMode,   setViewMode]   = useState<ViewMode>("kanban");
  const [collapsed,  setCollapsed]  = useState<Set<LeadStatus>>(new Set(["perdido"]));
  const [showClosed, setShowClosed] = useState(false);

  function toggleCollapse(stage: LeadStatus) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(stage) ? next.delete(stage) : next.add(stage);
      return next;
    });
  }

  const visibleStages = showClosed ? ALL_STAGES : ACTIVE_STAGES;
  const closedDeals   = pipeline
    .filter(s => ["ganado","perdido"].includes(s.stage))
    .reduce((sum, s) => sum + s.count, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-gray-400">
        <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <span className="text-sm">Cargando pipeline…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.08]
          bg-white/[0.03] p-1">
          {(["kanban","focus"] as ViewMode[]).map(v => (
            <button key={v} type="button"
              onClick={() => setViewMode(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all
                ${viewMode === v
                  ? "bg-white/[0.08] text-white"
                  : "text-gray-500 hover:text-gray-300"
                }`}
            >
              {v === "kanban" ? "Kanban" : "⚡ Focus"}
            </button>
          ))}
        </div>

        {/* Show closed toggle */}
        <button
          type="button"
          onClick={() => setShowClosed(v => !v)}
          className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all
            ${showClosed
              ? "border-brand-500/30 bg-brand-500/10 text-brand-400"
              : "border-white/[0.08] text-gray-500 hover:text-gray-300"
            }`}
        >
          {showClosed ? "Ocultar cerrados" : `Ver cerrados (${closedDeals})`}
        </button>

        {/* Add deal */}
        <motion.button
          type="button" whileTap={{ scale: 0.95 }}
          onClick={() => onAdd()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl
            bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white
            shadow-sm shadow-brand-500/20 hover:bg-brand-600 transition"
        >
          <Plus size={13} /> Nuevo deal
        </motion.button>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">

        {viewMode === "focus" ? (
          <motion.div key="focus"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <FocusMode
              pipeline={pipeline}
              onDetail={onDetail}
              onEdit={onEdit}
              onDelete={onDelete}
              onMove={onMove}
            />
          </motion.div>
        ) : (
          <motion.div key="kanban"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex gap-3 overflow-x-auto pb-4"
            style={{ minHeight: 400 }}
          >
            {visibleStages.map(stage => {
              const stageData = pipeline.find(s => s.stage === stage) ?? {
                stage, deals: [], count: 0, totalValue: 0, forecastValue: 0,
              };
              return (
                <PipelineColumn
                  key={stage}
                  stageData={stageData}
                  collapsed={collapsed.has(stage)}
                  onToggle={() => toggleCollapse(stage)}
                  onAdd={() => onAdd(stage)}
                  onDetail={onDetail}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onMove={onMove}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}