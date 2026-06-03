import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TicketIcon,
  PlusIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import {
  useCompanyTickets,
  type CompanyTicket,
  type TicketMessage,
  type TicketStatus,
  type TicketPriority,
  type CreateTicketInput,
} from "@/hooks/useCompanyTickets";

// ─── Badge helpers ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Abierto",
  in_progress: "En progreso",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const STATUS_CLASS: Record<TicketStatus, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  closed: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

const PRIORITY_CLASS: Record<TicketPriority, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_CLASS[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── New Ticket Modal ──────────────────────────────────────────────────────────

interface NewTicketModalProps {
  onClose: () => void;
  onCreate: (input: CreateTicketInput) => Promise<CompanyTicket | null>;
}

function NewTicketModal({ onClose, onCreate }: NewTicketModalProps) {
  const [form, setForm] = useState<CreateTicketInput>({
    title: "",
    description: "",
    priority: "medium",
    category: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      setError("El título y la descripción son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await onCreate({ ...form, category: form.category || undefined });
    setSaving(false);
    if (result) onClose();
    else setError("No se pudo crear el ticket. Inténtalo de nuevo.");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 280 }}
        className="w-full max-w-lg dark:bg-[#0F172A] bg-white rounded-2xl border dark:border-white/[0.06] border-slate-200 shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold dark:text-white text-slate-800">Nuevo ticket de soporte</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg dark:hover:bg-white/10 hover:bg-slate-100 dark:text-slate-400 text-slate-500 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium dark:text-slate-400 text-slate-500 mb-1.5">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Describe el problema brevemente"
              className="w-full text-sm rounded-xl dark:bg-white/[0.05] bg-slate-50 dark:text-slate-100 text-slate-800 placeholder:dark:text-slate-500 placeholder:text-slate-400 border dark:border-white/[0.06] border-slate-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#465fff]/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium dark:text-slate-400 text-slate-500 mb-1.5">
              Descripción <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Explica el problema con el mayor detalle posible"
              className="w-full resize-none text-sm rounded-xl dark:bg-white/[0.05] bg-slate-50 dark:text-slate-100 text-slate-800 placeholder:dark:text-slate-500 placeholder:text-slate-400 border dark:border-white/[0.06] border-slate-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#465fff]/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div>
              <label className="block text-xs font-medium dark:text-slate-400 text-slate-500 mb-1.5">Prioridad</label>
              <div className="relative">
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TicketPriority }))}
                  className="w-full appearance-none pl-3 pr-8 py-2.5 text-sm rounded-xl dark:bg-white/[0.05] bg-slate-50 dark:text-slate-200 text-slate-700 border dark:border-white/[0.06] border-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
                <ChevronDownIcon className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 dark:text-slate-400 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium dark:text-slate-400 text-slate-500 mb-1.5">Categoría</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Ej: Facturación, Técnico…"
                className="w-full text-sm rounded-xl dark:bg-white/[0.05] bg-slate-50 dark:text-slate-100 text-slate-800 placeholder:dark:text-slate-500 placeholder:text-slate-400 border dark:border-white/[0.06] border-slate-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#465fff]/50"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl dark:bg-white/[0.05] bg-slate-100 dark:text-slate-300 text-slate-600 hover:dark:bg-white/10 hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-xl bg-[#465fff] text-white hover:bg-[#3451d1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {saving ? "Creando…" : "Crear ticket"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Ticket Drawer ─────────────────────────────────────────────────────────────

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  const handleSend = async () => {
    const body = messageBody.trim();
    if (!body) return;
    setSending(true);
    const msg = await onSendMessage(ticket.id, body);
    if (msg) {
      setLocalMessages((prev) => [...prev, msg]);
      setMessageBody("");
    }
    setSending(false);
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
      className="fixed inset-y-0 right-0 w-full max-w-xl z-50 flex flex-col dark:bg-[#0B1120] bg-white shadow-2xl border-l dark:border-white/[0.06] border-slate-200"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b dark:border-white/[0.06] border-slate-200 shrink-0">
        <div className="flex-1 min-w-0 pr-4">
          <p className="text-xs font-mono dark:text-slate-400 text-slate-500 mb-1">{ticket.ticketNumber}</p>
          <h2 className="text-base font-semibold dark:text-white text-slate-800 leading-snug line-clamp-2">
            {ticket.title}
          </h2>
          <div className="flex gap-2 mt-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg dark:hover:bg-white/10 hover:bg-slate-100 dark:text-slate-400 text-slate-500 transition-colors shrink-0"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Meta */}
      <div className="px-5 py-3 border-b dark:border-white/[0.06] border-slate-200 shrink-0">
        <div className="flex gap-4 text-[11px] dark:text-slate-500 text-slate-400">
          <span>Creado: {formatDate(ticket.createdAt)}</span>
          {ticket.assignedToName && <span>Asignado a: {ticket.assignedToName}</span>}
          {ticket.category && <span>Cat.: {ticket.category}</span>}
          {ticket.resolvedAt && <span>Resuelto: {formatDate(ticket.resolvedAt)}</span>}
        </div>
      </div>

      {/* Messages thread */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {localMessages.length === 0 && (
          <p className="text-center text-xs dark:text-slate-500 text-slate-400 py-8">
            Sin mensajes aún. Puedes enviar un mensaje para agregar más información.
          </p>
        )}
        {localMessages.map((msg) => {
          const isPlatform = msg.authorRole === "platform";
          return (
            <div key={msg.id} className={`flex ${isPlatform ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                isPlatform
                  ? "dark:bg-[#465fff]/20 bg-blue-50 dark:text-blue-200 text-blue-800"
                  : "dark:bg-white/[0.06] bg-slate-100 dark:text-slate-200 text-slate-700"
              }`}>
                <p className={`text-[10px] font-medium mb-1 ${isPlatform ? "dark:text-blue-300 text-blue-600" : "dark:text-slate-400 text-slate-500"}`}>
                  {isPlatform ? `Soporte — ${msg.authorName}` : msg.authorName}
                </p>
                <p className="text-sm leading-relaxed">{msg.body}</p>
                <p className={`text-[10px] mt-1 ${isPlatform ? "dark:text-blue-400/60 text-blue-400" : "dark:text-slate-500 text-slate-400"}`}>
                  {formatDate(msg.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply input — disabled if resolved/closed */}
      <div className="px-5 py-4 border-t dark:border-white/[0.06] border-slate-200 shrink-0">
        {ticket.status === "resolved" || ticket.status === "closed" ? (
          <p className="text-xs text-center dark:text-slate-500 text-slate-400 py-2">
            Este ticket está {STATUS_LABELS[ticket.status].toLowerCase()}. No se pueden agregar más mensajes.
          </p>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              rows={2}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Escribe un mensaje… (Enter para enviar)"
              className="flex-1 resize-none rounded-xl text-sm dark:bg-white/[0.05] bg-slate-50 dark:text-slate-100 text-slate-800 placeholder:dark:text-slate-500 placeholder:text-slate-400 border dark:border-white/[0.06] border-slate-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#465fff]/50"
            />
            <button
              onClick={handleSend}
              disabled={sending || !messageBody.trim()}
              className="p-2.5 rounded-xl bg-[#465fff] text-white hover:bg-[#3451d1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SoportePage() {
  const { tickets, loading, reload, loadDetail, createTicket, sendMessage } = useCompanyTickets();

  const [showNewModal, setShowNewModal] = useState(false);
  const [drawerTicket, setDrawerTicket] = useState<CompanyTicket | null>(null);
  const [drawerMessages, setDrawerMessages] = useState<TicketMessage[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const openDrawer = async (ticket: CompanyTicket) => {
    setDrawerTicket(ticket);
    setDrawerMessages([]);
    setDrawerLoading(true);
    const detail = await loadDetail(ticket.id);
    if (detail) {
      setDrawerTicket(detail.ticket);
      setDrawerMessages(detail.messages);
    }
    setDrawerLoading(false);
  };

  const closeDrawer = () => {
    setDrawerTicket(null);
    setDrawerMessages([]);
  };

  return (
    <div className="p-6 min-h-screen dark:bg-[#0d1117]">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold dark:text-white text-slate-800">Soporte</h1>
          <p className="text-sm dark:text-slate-400 text-slate-500 mt-1">
            Tus solicitudes de soporte con el equipo de la plataforma
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#465fff] text-white text-sm font-medium rounded-xl hover:bg-[#3451d1] transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Nuevo ticket
        </button>
      </motion.div>

      {/* Ticket list */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="dark:bg-[#0F172A] bg-white border dark:border-white/[0.06] border-slate-200 rounded-xl overflow-hidden"
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#465fff] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <TicketIcon className="w-10 h-10 dark:text-slate-600 text-slate-300" />
            <p className="text-sm dark:text-slate-400 text-slate-500">No tienes tickets aún</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="text-sm text-[#465fff] hover:underline"
            >
              Crear tu primer ticket
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-white/[0.06] border-slate-200">
                {["Nº Ticket", "Título", "Estado", "Prioridad", "Asignado", "Creado"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-medium dark:text-slate-400 text-slate-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-white/[0.04] divide-slate-100">
              {tickets.map((ticket, i) => (
                <motion.tr
                  key={ticket.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => openDrawer(ticket)}
                  className="cursor-pointer dark:hover:bg-white/[0.03] hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs dark:text-slate-400 text-slate-500 whitespace-nowrap">
                    {ticket.ticketNumber}
                  </td>
                  <td className="px-4 py-3 dark:text-white text-slate-800 max-w-xs truncate">
                    {ticket.title}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={ticket.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={ticket.priority} />
                  </td>
                  <td className="px-4 py-3 dark:text-slate-400 text-slate-500 text-xs">
                    {ticket.assignedToName ?? "—"}
                  </td>
                  <td className="px-4 py-3 dark:text-slate-400 text-slate-500 text-xs whitespace-nowrap">
                    {new Date(ticket.createdAt).toLocaleDateString("es-EC", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.div>

      {/* Modals / Drawer */}
      <AnimatePresence>
        {showNewModal && (
          <NewTicketModal
            onClose={() => setShowNewModal(false)}
            onCreate={createTicket}
          />
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
              className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            />
            {drawerLoading ? (
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 260 }}
                className="fixed inset-y-0 right-0 w-full max-w-xl z-50 flex items-center justify-center dark:bg-[#0B1120] bg-white"
              >
                <div className="w-6 h-6 border-2 border-[#465fff] border-t-transparent rounded-full animate-spin" />
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