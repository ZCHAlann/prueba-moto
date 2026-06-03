import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "critical";

export interface CompanyTicket {
  id: number;
  ticketNumber: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedToName: string | null;
}

export interface TicketMessage {
  id: number;
  ticketId: number;
  authorName: string;
  authorRole: "platform" | "company";
  body: string;
  createdAt: string;
}

export interface CompanyTicketDetail {
  ticket: CompanyTicket;
  messages: TicketMessage[];
}

export interface CreateTicketInput {
  title: string;
  description: string;
  priority: TicketPriority;
  category?: string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCompanyTickets() {
  const [tickets, setTickets] = useState<CompanyTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/company/tickets");
      if (!res.ok) throw new Error("Error al cargar tickets");
      const data = await res.json();
      setTickets(data.tickets ?? data ?? []);
    } catch (err: any) {
      setError(err.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Load detail ─────────────────────────────────────────────────────────────
  const loadDetail = useCallback(async (id: number): Promise<CompanyTicketDetail | null> => {
    try {
      const res = await fetch(`/api/company/tickets/${id}`);
      if (!res.ok) throw new Error("Error al cargar detalle");
      return await res.json();
    } catch (err: any) {
      setError(err.message ?? "Error desconocido");
      return null;
    }
  }, []);

  // ── Create ticket ───────────────────────────────────────────────────────────
  const createTicket = useCallback(
    async (input: CreateTicketInput): Promise<CompanyTicket | null> => {
      try {
        const res = await fetch("/api/company/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error("Error al crear ticket");
        const created: CompanyTicket = await res.json();
        setTickets((prev) => [created, ...prev]);
        return created;
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
        const res = await fetch(`/api/company/tickets/${ticketId}/messages`, {
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
    loading,
    error,
    reload,
    loadDetail,
    createTicket,
    sendMessage,
  };
}