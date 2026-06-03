import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TicketIcon,
  InboxIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import {
  usePlatformTickets,
  type PlatformTicket,
  type TicketMessage,
  type TicketStatus,
  type TicketPriority,
  type UpdateTicketInput,
} from "@/hooks/usePlatformTickets";

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

// ─── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  delay?: number;
}

function KpiCard({ label, value, icon, color, delay = 0 }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="dark:bg-[#0F172A] bg-white border dark:border-white/[0.06] border-slate-200 rounded-xl p-5 flex items-center gap-4"
    >
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold dark:text-white text-slate-800">{value}</p>
        <p className="text-sm dark:text-slate-400 text-slate-500 mt-0.5">{label}</p>
      </div>
    </motion.div>
  );
}

// ─── Ticket Drawer ─────────────────────────────────────────────────────────────

interface TicketDrawerProps {
  ticket: PlatformTicket;
  messages: TicketMessage[];
  onClose: () => void;
  onUpdate: (id: number, input: UpdateTicketInput) => Promise<PlatformTicket | null>;
  onSendMessage: (ticketId: number, body: string) => Promise<TicketMessage | null>;
}

function TicketDrawer({ ticket, messages, onClose, onUpdate, onSendMessage }: TicketDrawerProps) {
  const [localTicket, setLocalTicket] = useState(ticket);
  const [localMessages, setLocalMessages] = useState(messages);
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  const handleUpdate = async (input: UpdateTicketInput) => {
    setUpdating(true);
    const updated = await onUpdate(localTicket.id, input);
    if (updated) setLocalTicket(updated);
    setUpdating(false);
  };

  const handleSend = async () => {
    const body = messageBody.trim();
    if (!body) return;
    setSending(true);
    const msg = await onSendMessage(localTicket.id, body);
    if (msg) {
      setLocalMessages((prev) => [...prev, msg]);
      setMessageBody("");
      // If ticket was open, it'll transition to in_progress server-side — reflect locally
      if (localTicket.status === "open") {
        setLocalTicket((prev) => ({ ...prev, status: "in_progress" }));
      }
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
          <p className="text-xs font-mono dark:text-slate-400 text-slate-500 mb-1">{localTicket.ticketNumber}</p>
          <h2 className="text-base font-semibold dark:text-white text-slate-800 leading-snug line-clamp-2">
            {localTicket.title}
          </h2>
          <p className="text-xs dark:text-slate-400 text-slate-500 mt-1">{localTicket.companyName}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg dark:hover:bg-white/10 hover:bg-slate-100 dark:text-slate-400 text-slate-500 transition-colors shrink-0"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 px-5 py-3 border-b dark:border-white/[0.06] border-slate-200 shrink-0">
        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium dark:text-slate-500 text-slate-400 uppercase tracking-wider">Estado</label>
          <div className="relative">
            <select
              disabled={updating}
              value={localTicket.status}
              onChange={(e) => handleUpdate({ status: e.target.value as TicketStatus })}
              className="appearance-none pl-3 pr-7 py-1.5 text-xs rounded-lg dark:bg-white/5 bg-slate-100 dark:text-slate-200 text-slate-700 border dark:border-white/[0.06] border-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="open">Abierto</option>
              <option value="in_progress">En progreso</option>
              <option value="resolved">Resuelto</option>
              <option value="closed">Cerrado</option>
            </select>
            <ChevronDownIcon className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 dark:text-slate-400 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Priority */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium dark:text-slate-500 text-slate-400 uppercase tracking-wider">Prioridad</label>
          <div className="relative">
            <select
              disabled={updating}
              value={localTicket.priority}
              onChange={(e) => handleUpdate({ priority: e.target.value as TicketPriority })}
              className="appearance-none pl-3 pr-7 py-1.5 text-xs rounded-lg dark:bg-white/5 bg-slate-100 dark:text-slate-200 text-slate-700 border dark:border-white/[0.06] border-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="critical">Crítica</option>
            </select>
            <ChevronDownIcon className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 dark:text-slate-400 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-end gap-2 ml-auto">
          <StatusBadge status={localTicket.status} />
          <PriorityBadge priority={localTicket.priority} />
        </div>
      </div>

      {/* Description */}
      <div className="px-5 py-3 border-b dark:border-white/[0.06] border-slate-200 shrink-0">
        <p className="text-xs dark:text-slate-400 text-slate-500 leading-relaxed">{localTicket.description}</p>
        <div className="flex gap-4 mt-2 text-[10px] dark:text-slate-500 text-slate-400">
          <span>Creado: {formatDate(localTicket.createdAt)}</span>
          {localTicket.assignedToName && <span>Asignado: {localTicket.assignedToName}</span>}
          {localTicket.category && <span>Cat.: {localTicket.category}</span>}
        </div>
      </div>

      {/* Messages thread */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {localMessages.length === 0 && (
          <p className="text-center text-xs dark:text-slate-500 text-slate-400 py-8">Sin mensajes aún.</p>
        )}
        {localMessages.map((msg) => {
          const isPlatform = msg.authorRole === "platform";
          return (
            <div key={msg.id} className={`flex ${isPlatform ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                isPlatform
                  ? "dark:bg-[#465fff]/20 bg-blue-50 dark:text-blue-200 text-blue-800"
                  : "dark:bg-white/[0.06] bg-slate-100 dark:text-slate-200 text-slate-700"
              }`}>
                <p className={`text-[10px] font-medium mb-1 ${isPlatform ? "dark:text-blue-300 text-blue-600" : "dark:text-slate-400 text-slate-500"}`}>
                  {msg.authorName}
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

      {/* Reply input */}
      <div className="px-5 py-4 border-t dark:border-white/[0.06] border-slate-200 shrink-0">
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
            placeholder="Escribe una respuesta… (Enter para enviar)"
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
      </div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PlatformTicketsPage() {
  const { tickets, stats, filters, setFilters, loading, reload, loadDetail, updateTicket, sendMessage } =
    usePlatformTickets();

  const [drawerTicket, setDrawerTicket] = useState<PlatformTicket | null>(null);
  const [drawerMessages, setDrawerMessages] = useState<TicketMessage[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const openDrawer = async (ticket: PlatformTicket) => {
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

  // Sync drawer ticket when list updates (e.g. after updateTicket)
  const handleUpdate = async (id: number, input: UpdateTicketInput) => {
    const updated = await updateTicket(id, input);
    return updated;
  };

  return (
    <div className="p-6 min-h-screen ">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold dark:text-white text-slate-800">Tickets de soporte</h1>
        <p className="text-sm dark:text-slate-400 text-slate-500 mt-1">
          Gestión de solicitudes de soporte de las empresas
        </p>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Total"
          value={stats.total}
          icon={<TicketIcon className="w-5 h-5 text-white" />}
          color="bg-[#465fff]"
          delay={0}
        />
        <KpiCard
          label="Abiertos"
          value={stats.open}
          icon={<InboxIcon className="w-5 h-5 text-white" />}
          color="bg-blue-500"
          delay={0.05}
        />
        <KpiCard
          label="En progreso"
          value={stats.inProgress}
          icon={<ClockIcon className="w-5 h-5 text-white" />}
          color="bg-amber-500"
          delay={0.1}
        />
        <KpiCard
          label="Críticos"
          value={stats.critical}
          icon={<ExclamationTriangleIcon className="w-5 h-5 text-white" />}
          color="bg-red-500"
          delay={0.15}
        />
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap gap-3 mb-4"
      >
        {/* Status filter */}
        <div className="relative">
          <select
            value={filters.status ?? ""}
            onChange={(e) =>
              setFilters((f) => ({ ...f, status: (e.target.value as TicketStatus) || undefined }))
            }
            className="appearance-none pl-3 pr-8 py-2 text-sm rounded-xl dark:bg-[#0F172A] bg-white dark:text-slate-300 text-slate-700 border dark:border-white/[0.06] border-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="">Todos los estados</option>
            <option value="open">Abierto</option>
            <option value="in_progress">En progreso</option>
            <option value="resolved">Resuelto</option>
            <option value="closed">Cerrado</option>
          </select>
          <ChevronDownIcon className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 dark:text-slate-400 text-slate-500 pointer-events-none" />
        </div>

        {/* Priority filter */}
        <div className="relative">
          <select
            value={filters.priority ?? ""}
            onChange={(e) =>
              setFilters((f) => ({ ...f, priority: (e.target.value as TicketPriority) || undefined }))
            }
            className="appearance-none pl-3 pr-8 py-2 text-sm rounded-xl dark:bg-[#0F172A] bg-white dark:text-slate-300 text-slate-700 border dark:border-white/[0.06] border-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="">Todas las prioridades</option>
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
          <ChevronDownIcon className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 dark:text-slate-400 text-slate-500 pointer-events-none" />
        </div>

        <button
          onClick={reload}
          className="ml-auto text-sm px-4 py-2 rounded-xl dark:bg-white/[0.05] bg-slate-100 dark:text-slate-300 text-slate-600 hover:dark:bg-white/10 hover:bg-slate-200 transition-colors"
        >
          Actualizar
        </button>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="dark:bg-[#0F172A] bg-white border dark:border-white/[0.06] border-slate-200 rounded-xl overflow-hidden"
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#465fff] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <TicketIcon className="w-10 h-10 dark:text-slate-600 text-slate-300" />
            <p className="text-sm dark:text-slate-400 text-slate-500">No hay tickets con los filtros aplicados</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-white/[0.06] border-slate-200">
                {["Nº Ticket", "Empresa", "Título", "Estado", "Prioridad", "Asignado", "Creado"].map((h) => (
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
                  <td className="px-4 py-3 dark:text-slate-300 text-slate-600 whitespace-nowrap">
                    {ticket.companyName}
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

      {/* Drawer overlay */}
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
                onUpdate={handleUpdate}
                onSendMessage={sendMessage}
              />
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}