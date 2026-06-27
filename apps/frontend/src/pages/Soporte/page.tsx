import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useCompanyTickets,
  type CompanyTicket,
  type TicketMessage,
  type TicketStatus,
  type TicketPriority,
  type CreateTicketInput,
} from "@/hooks/useCompanyTickets";
import { fmtDateTimeEc, fmtDateShortEc } from "@/lib/datetime";

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Abierto",
  in_progress: "En progreso",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const STATUS_CFG: Record<TicketStatus, { bg: string; text: string; border: string; dot: string }> = {
  open:        { bg: "bg-blue-50 dark:bg-blue-500/10",    text: "text-blue-700 dark:text-blue-300",    border: "border-blue-200 dark:border-blue-500/20",    dot: "bg-blue-400"    },
  in_progress: { bg: "bg-amber-50 dark:bg-amber-500/10",  text: "text-amber-700 dark:text-amber-300",  border: "border-amber-200 dark:border-amber-500/20",  dot: "bg-amber-400"   },
  resolved:    { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-500/20", dot: "bg-emerald-400" },
  closed:      { bg: "bg-gray-100 dark:bg-white/[0.05]",  text: "text-gray-500 dark:text-gray-400",    border: "border-gray-200 dark:border-white/[0.08]",   dot: "bg-gray-400"    },
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Baja", medium: "Media", high: "Alta", critical: "Crítica",
};

const PRIORITY_CFG: Record<TicketPriority, { bg: string; text: string; border: string }> = {
  low:      { bg: "bg-gray-100 dark:bg-white/[0.05]",   text: "text-gray-500 dark:text-gray-400",   border: "border-gray-200 dark:border-white/[0.08]"   },
  medium:   { bg: "bg-blue-50 dark:bg-blue-500/10",     text: "text-blue-700 dark:text-blue-300",   border: "border-blue-200 dark:border-blue-500/20"    },
  high:     { bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-700 dark:text-orange-300",border: "border-orange-200 dark:border-orange-500/20" },
  critical: { bg: "bg-red-50 dark:bg-red-500/10",       text: "text-red-700 dark:text-red-300",     border: "border-red-200 dark:border-red-500/20"      },
};

function StatusBadge({ status }: { status: TicketStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${c.bg} ${c.text} ${c.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const c = PRIORITY_CFG[priority];
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold ${c.bg} ${c.text} ${c.border}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function formatDate(iso: string) {
  return fmtDateTimeEc(iso);
}

function formatDateShort(iso: string) {
  return fmtDateShortEc(iso);
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconTicket({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-10 10 2 2 10-10-2-2z" /><path d="M9 11l-4 4 2 2 4-4" /><path d="M15 5l4 4-2 2-4-4" />
      <rect x="3" y="3" width="18" height="18" rx="3" />
    </svg>
  );
}

function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function IconSend({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 20-7z" />
    </svg>
  );
}

function IconChevronDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconTag({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconUser({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function IconClock({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
    </svg>
  );
}

function IconInbox({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3H10l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ tickets }: { tickets: CompanyTicket[] }) {
  const total      = tickets.length;
  const open       = tickets.filter(t => t.status === "open").length;
  const inProgress = tickets.filter(t => t.status === "in_progress").length;
  const resolved   = tickets.filter(t => t.status === "resolved" || t.status === "closed").length;

  const items = [
    { label: "Total",       value: total,      color: "text-gray-800 dark:text-white",           bg: "bg-gray-50 dark:bg-white/[0.04]",           border: "border-gray-200 dark:border-white/[0.07]" },
    { label: "Abiertos",    value: open,        color: "text-blue-700 dark:text-blue-300",         bg: "bg-blue-50 dark:bg-blue-500/10",             border: "border-blue-200 dark:border-blue-500/20"  },
    { label: "En progreso", value: inProgress,  color: "text-amber-700 dark:text-amber-300",       bg: "bg-amber-50 dark:bg-amber-500/10",           border: "border-amber-200 dark:border-amber-500/20"},
    { label: "Resueltos",   value: resolved,    color: "text-emerald-700 dark:text-emerald-300",   bg: "bg-emerald-50 dark:bg-emerald-500/10",       border: "border-emerald-200 dark:border-emerald-500/20" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          className={`rounded-2xl border p-4 ${item.bg} ${item.border}`}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{item.label}</p>
          <p className={`mt-1.5 text-3xl font-black tabular-nums ${item.color}`}>{item.value}</p>
          <p className="mt-0.5 text-xs text-gray-400">tickets</p>
        </motion.div>
      ))}
    </div>
  );
}

// ─── New Ticket Modal ─────────────────────────────────────────────────────────

interface NewTicketModalProps {
  onClose: () => void;
  onCreate: (input: CreateTicketInput) => Promise<CompanyTicket | null>;
}

function NewTicketModal({ onClose, onCreate }: NewTicketModalProps) {
  const [form, setForm] = useState<CreateTicketInput>({ title: "", description: "", priority: "medium", category: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim()) { setError("El título y la descripción son obligatorios."); return; }
    setSaving(true); setError(null);
    const result = await onCreate({ ...form, category: form.category || undefined });
    setSaving(false);
    if (result) onClose();
    else setError("No se pudo crear el ticket. Inténtalo de nuevo.");
  };

  const inputCls = "w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-4 py-2.5 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[#465fff] focus:outline-none focus:ring-2 focus:ring-[#465fff]/20 transition";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }}
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1320] shadow-2xl"
      >
        <div className="h-1 w-full bg-[#465fff]" />
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-white/[0.06] px-4 pb-4 pt-5 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#465fff]">Soporte</p>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">Nuevo ticket</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <IconX size={15} />
          </button>
        </div>

        <div className="px-4 py-5 sm:px-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Título <span className="text-red-400">*</span></label>
            <input className={inputCls} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Describe el problema brevemente" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Descripción <span className="text-red-400">*</span></label>
            <textarea rows={4} className={`${inputCls} resize-none`} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Explica el problema con el mayor detalle posible" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Prioridad</label>
              <div className="relative">
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as TicketPriority }))} className={`${inputCls} appearance-none pr-8 cursor-pointer`}>
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><IconChevronDown /></span>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Categoría</label>
              <input className={inputCls} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Ej: Facturación, Técnico…" />
            </div>
          </div>
          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex flex-col-reverse items-stretch gap-2 border-t border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button onClick={onClose} className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#465fff] px-5 py-2 text-sm font-semibold text-white hover:bg-[#3451d1] disabled:opacity-50 transition-colors active:scale-95">
            {saving ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            ) : <IconSend size={14} />}
            {saving ? "Creando…" : "Crear ticket"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Ticket Drawer ────────────────────────────────────────────────────────────

interface TicketDrawerProps {
  ticket: CompanyTicket;
  messages: TicketMessage[];
  onClose: () => void;
  onSendMessage: (ticketId: number, body: string) => Promise<TicketMessage | null>;
}

function TicketDrawer({ ticket, messages, onClose, onSendMessage }: TicketDrawerProps) {
  const [localMessages, setLocalMessages] = useState(messages);
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const s = STATUS_CFG[ticket.status];

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [localMessages]);

  const handleSend = async () => {
    const body = messageBody.trim();
    if (!body) return;
    setSending(true);
    const msg = await onSendMessage(ticket.id, body);
    if (msg) { setLocalMessages(prev => [...prev, msg]); setMessageBody(""); }
    setSending(false);
  };

  const isClosed = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 280 }}
      className="fixed inset-y-0 right-0 w-full max-w-xl z-50 flex flex-col bg-white dark:bg-[#0B1120] border-l border-gray-200 dark:border-white/[0.06] shadow-2xl"
    >
      {/* color accent top bar */}
      <div className={`h-1 w-full ${s.dot}`} />

      {/* Header */}
      <div className="flex items-start gap-4 px-5 py-4 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mb-1">{ticket.ticketNumber}</p>
          <h2 className="text-sm font-bold text-gray-800 dark:text-white leading-snug line-clamp-2">{ticket.title}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
        </div>
        <button onClick={onClose} className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors mt-0.5">
          <IconX size={15} />
        </button>
      </div>

      {/* Meta strip */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-2.5 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
        <span className="flex items-center gap-1 text-[11px] text-gray-400">
          <IconClock size={11} />{formatDate(ticket.createdAt)}
        </span>
        {ticket.assignedToName && (
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <IconUser size={11} />{ticket.assignedToName}
          </span>
        )}
        {ticket.category && (
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <IconTag size={11} />{ticket.category}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {localMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-300 dark:text-gray-600">
            <IconInbox size={32} />
            <p className="text-xs text-gray-400">Sin mensajes aún</p>
          </div>
        )}
        {localMessages.map((msg, i) => {
          const isPlatform = msg.authorRole === "platform";
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`flex ${isPlatform ? "justify-start" : "justify-end"}`}
            >
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                isPlatform
                  ? "bg-blue-50 dark:bg-[#465fff]/10 border border-blue-100 dark:border-[#465fff]/20"
                  : "bg-gray-100 dark:bg-white/[0.07] border border-gray-200 dark:border-white/[0.08]"
              }`}>
                <p className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${isPlatform ? "text-blue-500 dark:text-blue-400" : "text-gray-400"}`}>
                  {isPlatform ? `Soporte — ${msg.authorName}` : msg.authorName}
                </p>
                <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">{msg.body}</p>
                <p className="text-[10px] mt-1.5 text-gray-400">{formatDate(msg.createdAt)}</p>
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply area */}
      <div className="px-5 py-4 border-t border-gray-100 dark:border-white/[0.06] shrink-0 bg-gray-50 dark:bg-white/[0.02]">
        {isClosed ? (
          <div className="flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-gray-200 dark:border-white/[0.08]">
            <p className="text-xs text-gray-400">Ticket {STATUS_LABELS[ticket.status].toLowerCase()} — no se pueden agregar mensajes</p>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              rows={2}
              value={messageBody}
              onChange={e => setMessageBody(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Escribe un mensaje… (Enter para enviar)"
              className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-4 py-2.5 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[#465fff] focus:outline-none focus:ring-2 focus:ring-[#465fff]/20 transition"
            />
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={handleSend}
              disabled={sending || !messageBody.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#465fff] text-white hover:bg-[#3451d1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <IconSend size={15} />
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Ticket Row ───────────────────────────────────────────────────────────────

function TicketRow({ ticket, index, onClick }: { ticket: CompanyTicket; index: number; onClick: () => void }) {
  const s = STATUS_CFG[ticket.status];
  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onClick}
      className="group cursor-pointer transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.025]"
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full shrink-0 ${s.dot}`} />
          <span className="font-mono text-xs text-gray-400 dark:text-gray-500">{ticket.ticketNumber}</span>
        </div>
      </td>
      <td className="px-5 py-3.5 max-w-[220px]">
        <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{ticket.title}</p>
        {ticket.category && (
          <span className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
            <IconTag size={10} />{ticket.category}
          </span>
        )}
      </td>
      <td className="px-5 py-3.5"><StatusBadge status={ticket.status} /></td>
      <td className="px-5 py-3.5"><PriorityBadge priority={ticket.priority} /></td>
      <td className="px-5 py-3.5 text-xs text-gray-400 dark:text-gray-500">
        {ticket.assignedToName ? (
          <span className="flex items-center gap-1"><IconUser size={11} />{ticket.assignedToName}</span>
        ) : "—"}
      </td>
      <td className="px-5 py-3.5 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
        {formatDateShort(ticket.createdAt)}
      </td>
      <td className=" px-5 py-3.5">
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-semibold text-[#465fff] border border-[#465fff]/30 bg-[#465fff]/5 px-2 py-1 rounded-lg">
          Ver
        </span>
      </td>
    </motion.tr>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 gap-4"
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", damping: 14, stiffness: 200, delay: 0.1 }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.03] text-gray-300 dark:text-gray-600"
      >
        <IconInbox size={32} />
      </motion.div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sin tickets de soporte</p>
        <p className="text-xs text-gray-400 mt-1">Crea uno cuando necesites ayuda con la plataforma</p>
      </div>
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={onNew}
        className="inline-flex items-center gap-2 rounded-xl bg-[#465fff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3451d1] transition-colors"
      >
        <IconPlus size={14} />
        Crear primer ticket
      </motion.button>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SoportePage() {
  const { tickets, loading, loadDetail, createTicket, sendMessage } = useCompanyTickets();
  const [showNewModal, setShowNewModal] = useState(false);
  const [drawerTicket, setDrawerTicket] = useState<CompanyTicket | null>(null);
  const [drawerMessages, setDrawerMessages] = useState<TicketMessage[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const openDrawer = async (ticket: CompanyTicket) => {
    setDrawerTicket(ticket);
    setDrawerMessages([]);
    setDrawerLoading(true);
    const detail = await loadDetail(ticket.id);
    if (detail) { setDrawerTicket(detail.ticket); setDrawerMessages(detail.messages); }
    setDrawerLoading(false);
  };

  const closeDrawer = () => { setDrawerTicket(null); setDrawerMessages([]); };

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#465fff] mb-1">Plataforma</p>
          <h1 className="text-2xl font-black text-gray-800 dark:text-white">Soporte</h1>
          <p className="text-sm text-gray-400 mt-1">Tus solicitudes con el equipo de la plataforma</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#465fff] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3451d1] transition-colors shadow-sm shadow-[#465fff]/20"
        >
          <IconPlus size={15} />
          Nuevo ticket
        </motion.button>
      </motion.div>

      {/* KPIs */}
      {!loading && tickets.length > 0 && <KpiStrip tickets={tickets} />}

      {/* Table card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03]"
      >
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/[0.06] px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Historial de tickets</h3>
            <p className="text-xs text-gray-400">{tickets.length} {tickets.length === 1 ? "solicitud" : "solicitudes"}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="text-sm">Cargando tickets…</span>
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState onNew={() => setShowNewModal(true)} />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                {["Nº", "Título", "Estado", "Prioridad", "Asignado", "Creado", ""].map((h, i, arr) => {
                  const isLast = i === arr.length - 1;
                  return (
                    <th
                      key={i}
                      className={
                        isLast
                          ? ""
                          : "px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400"
                      }
                    >
                      {h}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {tickets.map((ticket, i) => (
                <TicketRow key={ticket.id} ticket={ticket} index={i} onClick={() => openDrawer(ticket)} />
              ))}
            </tbody>
          </table>
          </div>
        )}
      </motion.div>

      {/* Modals */}
      <AnimatePresence>
        {showNewModal && (
          <NewTicketModal onClose={() => setShowNewModal(false)} onCreate={createTicket} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawerTicket && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDrawer}
              className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
            />
            {drawerLoading ? (
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 280 }}
                className="fixed inset-y-0 right-0 w-full max-w-xl z-50 flex items-center justify-center bg-white dark:bg-[#0B1120] border-l border-gray-200 dark:border-white/[0.06]"
              >
                <svg className="animate-spin h-6 w-6 text-[#465fff]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              </motion.div>
            ) : (
              <TicketDrawer
                ticket={drawerTicket}
                messages={drawerMessages}
                onClose={closeDrawer}
                onSendMessage={sendMessage}
              />
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}