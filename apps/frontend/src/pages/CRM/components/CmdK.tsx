// src/pages/Platform/CRM/components/CmdK.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Building2, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import type { CRMDeal, LeadStatus } from "../../../types/platform";

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_META: Record<LeadStatus, { label: string; color: string }> = {
  nuevo:             { label: "Nuevo",            color: "text-gray-400"   },
  contactado:        { label: "Contactado",        color: "text-blue-400"   },
  demo_agendada:     { label: "Demo",              color: "text-violet-400" },
  propuesta_enviada: { label: "Propuesta",         color: "text-amber-400"  },
  ganado:            { label: "Ganado",            color: "text-emerald-400"},
  perdido:           { label: "Perdido",           color: "text-rose-400"   },
};

function fmtValue(v: string | null) {
  if (!v || parseFloat(v) === 0) return null;
  const n = parseFloat(v);
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

// ─── Result Item ──────────────────────────────────────────────────────────────

function ResultItem({
  deal, active, onSelect,
}: {
  deal:     CRMDeal;
  active:   boolean;
  onSelect: () => void;
}) {
  const meta  = STAGE_META[deal.status];
  const value = fmtValue(deal.estimatedValue);
  const initials = deal.companyName
    .split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  const AVATAR_COLORS = [
    "bg-brand-500/20 text-brand-300",
    "bg-violet-500/20 text-violet-300",
    "bg-emerald-500/20 text-emerald-300",
    "bg-amber-500/20 text-amber-300",
    "bg-rose-500/20 text-rose-300",
    "bg-cyan-500/20 text-cyan-300",
  ];
  const avatarColor = AVATAR_COLORS[deal.companyName.charCodeAt(0) % AVATAR_COLORS.length];

  return (
    <motion.button
      type="button"
      layout
      onClick={onSelect}
      className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5
        text-left transition-all
        ${active
          ? "bg-brand-500/10 border border-brand-500/20"
          : "border border-transparent hover:bg-white/[0.04]"
        }`}
    >
      {/* Avatar */}
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center
        rounded-xl text-[11px] font-bold ${avatarColor}`}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-200 truncate">
            {deal.companyName}
          </p>
          {deal.urgency === "critical" && (
            <AlertTriangle size={10} className="shrink-0 text-rose-400" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[10px] font-medium ${meta.color}`}>
            {meta.label}
          </span>
          {value && (
            <span className="text-[10px] text-gray-600">· {value}</span>
          )}
          {deal.contactName && (
            <span className="text-[10px] text-gray-600 truncate">· {deal.contactName}</span>
          )}
        </div>
      </div>

      {/* Score */}
      <div className="shrink-0 text-right">
        <p className="text-[11px] font-bold text-gray-400">{deal.score}</p>
        <p className="text-[9px] text-gray-700">score</p>
      </div>
    </motion.button>
  );
}

// ─── Cmd+K ────────────────────────────────────────────────────────────────────

interface CmdKProps {
  open:       boolean;
  onClose:    () => void;
  onSearch:   (q: string) => Promise<CRMDeal[]>;
  onSelect:   (deal: CRMDeal) => void;
}

export function CmdK({ open, onClose, onSearch, onSelect }: CmdKProps) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<CRMDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor,  setCursor]  = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input al abrir
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await onSearch(query);
        setResults(res);
        setCursor(0);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, onSearch]);

  // Keyboard nav
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && results[cursor]) {
      onSelect(results[cursor]);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [results, cursor, onSelect, onClose]);

  // Global Cmd+K / Ctrl+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!open) return; // el page lo abre
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cmdk-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-gray-950/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="cmdk-panel"
            initial={{ opacity: 0, scale: 0.96, y: -16 }}
            animate={{ opacity: 1, scale: 1,    y: 0   }}
            exit={{ opacity: 0,   scale: 0.96, y: -16  }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="fixed left-1/2 top-[18%] z-50 w-full max-w-md
              -translate-x-1/2 overflow-hidden rounded-2xl
              border border-white/[0.08] bg-gray-900 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
              {loading ? (
                <svg className="animate-spin shrink-0 text-brand-400"
                  width="15" height="15" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <Search size={15} className="shrink-0 text-gray-500" />
              )}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Buscar deals, empresas, contactos…"
                className="flex-1 bg-transparent text-sm text-gray-200
                  placeholder:text-gray-600 outline-none"
              />
              {query && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setQuery("")}
                  className="flex h-5 w-5 shrink-0 items-center justify-center
                    rounded-md text-gray-600 hover:text-gray-400 transition"
                >
                  <X size={11} />
                </motion.button>
              )}
              <kbd className="shrink-0 rounded-lg border border-white/[0.08]
                bg-white/[0.04] px-1.5 py-0.5 text-[10px]
                font-semibold text-gray-600">
                Esc
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[360px] overflow-y-auto custom-scrollbar p-2">
              <AnimatePresence mode="wait">

                {/* Empty state — no query */}
                {!query && (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center gap-2 py-10"
                  >
                    <div className="flex h-10 w-10 items-center justify-center
                      rounded-xl bg-white/[0.04] border border-white/[0.06]">
                      <Search size={16} className="text-gray-600" />
                    </div>
                    <p className="text-xs text-gray-600">
                      Escribe para buscar deals
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <kbd className="rounded border border-white/[0.08] bg-white/[0.04]
                        px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">↑</kbd>
                      <kbd className="rounded border border-white/[0.08] bg-white/[0.04]
                        px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">↓</kbd>
                      <span className="text-[10px] text-gray-700">navegar</span>
                      <kbd className="rounded border border-white/[0.08] bg-white/[0.04]
                        px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">↵</kbd>
                      <span className="text-[10px] text-gray-700">abrir</span>
                    </div>
                  </motion.div>
                )}

                {/* No results */}
                {query && !loading && results.length === 0 && (
                  <motion.div
                    key="no-results"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center gap-2 py-10"
                  >
                    <Building2 size={18} className="text-gray-700" />
                    <p className="text-xs text-gray-600">
                      Sin resultados para <span className="text-gray-400">"{query}"</span>
                    </p>
                  </motion.div>
                )}

                {/* Results */}
                {results.length > 0 && (
                  <motion.div
                    key="results"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-0.5"
                  >
                    <p className="px-3 pb-1.5 text-[10px] font-bold
                      uppercase tracking-wider text-gray-600">
                      {results.length} resultado{results.length !== 1 ? "s" : ""}
                    </p>
                    {results.map((deal, idx) => (
                      <ResultItem
                        key={deal.id}
                        deal={deal}
                        active={idx === cursor}
                        onSelect={() => { onSelect(deal); onClose(); }}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-1.5 border-t border-white/[0.04]
              px-4 py-2.5">
              <TrendingUp size={10} className="text-gray-700" />
              <span className="text-[10px] text-gray-700">
                CRM · GenTrack
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Clock size={9} className="text-gray-700" />
                <span className="text-[10px] text-gray-700">
                  Búsqueda en tiempo real
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}