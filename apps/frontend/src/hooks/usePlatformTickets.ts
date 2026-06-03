import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "critical";

export interface PlatformTicket {
  id: number;
  ticketNumber: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  companyId: number;
  companyName: string;
  companySlug: string;
  assignedToId: number | null;
  assignedToName: string | null;
  createdByName: string | null;
}

export interface TicketMessage {
  id: number;
  ticketId: number;
  authorName: string;
  authorRole: "platform" | "company";
  body: string;
  createdAt: string;
}

export interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  critical: number;
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  companyId?: number;
}

export interface TicketDetail {
  ticket: PlatformTicket;
  messages: TicketMessage[];
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: number | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePlatformTickets() {
  const [tickets, setTickets] = useState<PlatformTicket[]>([]);
  const [stats, setStats] = useState<TicketStats>({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    critical: 0,
  });
  const [filters, setFilters] = useState<TicketFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.companyId) params.set("companyId", String(filters.companyId));

      const res = await fetch(`/api/platform/tickets?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar tickets");
      const data = await res.json();
      setTickets(data.tickets ?? []);
      setStats(data.stats ?? { total: 0, open: 0, inProgress: 0, resolved: 0, critical: 0 });
    } catch (err: any) {
      setError(err.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Load detail (ticket + messages) ────────────────────────────────────────
  const loadDetail = useCallback(async (id: number): Promise<TicketDetail | null> => {
    try {
      const res = await fetch(`/api/platform/tickets/${id}`);
      if (!res.ok) throw new Error("Error al cargar detalle");
      return await res.json();
    } catch (err: any) {
      setError(err.message ?? "Error desconocido");
      return null;
    }
  }, []);

  // ── Update ticket (status / priority / assignedTo) ──────────────────────────
  const updateTicket = useCallback(
    async (id: number, input: UpdateTicketInput): Promise<PlatformTicket | null> => {
      try {
        const res = await fetch(`/api/platform/tickets/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error("Error al actualizar ticket");
        const updated: PlatformTicket = await res.json();
        setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
        return updated;
      } catch (err: any) {
        setError(err.message ?? "Error desconocido");
        return null;
      }
    },
    []
  );

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (ticketId: number, body: string): Promise<TicketMessage | null> => {
      try {
        const res = await fetch(`/api/platform/tickets/${ticketId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (!res.ok) throw new Error("Error al enviar mensaje");
        return await res.json();
      } catch (err: any) {
        setError(err.message ?? "Error desconocido");
        return null;
      }
    },
    []
  );

  return {
    tickets,
    stats,
    filters,
    setFilters,
    loading,
    error,
    reload,
    loadDetail,
    updateTicket,
    sendMessage,
  };
}