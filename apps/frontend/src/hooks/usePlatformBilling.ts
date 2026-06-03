import { useState, useEffect, useCallback } from 'react';

const API = '/api/platform/billing';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BillingInvoice {
  id:            number;
  invoiceNumber: string;
  status:        'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  cycle:         'monthly' | 'annual';
  amount:        string;
  tax:           string;
  total:         string;
  issuedAt:      string;
  dueAt:         string;
  paidAt:        string | null;
  notes:         string | null;
  createdAt:     string;
  companyId:     number;
  companyName:   string | null;
  companySlug:   string | null;
  planId:        string | null;
  planName:      string | null;
}

export interface ByMonthRow {
  month:    string;   // 'YYYY-MM'
  revenue:  number;
  invoices: number;
}

export interface ByPlanRow {
  plan:     string;
  revenue:  number;
  invoices: number;
}

export interface BillingStats {
  totalRevenue: number;
  totalPending: number;
  totalOverdue: number;
  countPaid:    number;
  countPending: number;
  countOverdue: number;
  byMonth:      ByMonthRow[];
  byPlan:       ByPlanRow[];
}

export interface BillingSnapshot {
  invoices: BillingInvoice[];
  stats:    BillingStats;
}

export interface CreateInvoiceInput {
  companyId: number;
  planId?:   string;
  cycle:     'monthly' | 'annual';
  amount:    number;
  tax?:      number;
  issuedAt:  string;
  dueAt:     string;
  notes?:    string;
}

export interface UpdateInvoiceInput {
  status?: BillingInvoice['status'];
  paidAt?: string;
  notes?:  string;
}

export interface BillingFilters {
  from?:      string;
  to?:        string;
  status?:    string;
  companyId?: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePlatformBilling(initialFilters: BillingFilters = {}) {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [stats,    setStats]    = useState<BillingStats | null>(null);
  const [filters,  setFiltersState] = useState<BillingFilters>(initialFilters);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const buildQuery = useCallback((f: BillingFilters) => {
    const params = new URLSearchParams();
    if (f.from)      params.set('from',      f.from);
    if (f.to)        params.set('to',        f.to);
    if (f.status)    params.set('status',    f.status);
    if (f.companyId) params.set('companyId', String(f.companyId));
    return params.toString();
  }, []);

  const load = useCallback(async (f: BillingFilters) => {
    setLoading(true);
    setError(null);
    try {
      const qs  = buildQuery(f);
      const res = await fetch(`${API}${qs ? `?${qs}` : ''}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: BillingSnapshot = await res.json();
      setInvoices(data.invoices);
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar facturación');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { load(filters); }, [load, filters]);

  const setFilters = useCallback((patch: Partial<BillingFilters>) => {
    setFiltersState(prev => ({ ...prev, ...patch }));
  }, []);

  const reload = useCallback(() => load(filters), [load, filters]);

  const createInvoice = useCallback(async (input: CreateInvoiceInput): Promise<BillingInvoice> => {
    const res = await fetch(API, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error ?? `Error ${res.status}`);
    }
    const created: BillingInvoice = await res.json();
    await load(filters);
    return created;
  }, [filters, load]);

  const updateInvoice = useCallback(async (id: number, input: UpdateInvoiceInput): Promise<BillingInvoice> => {
    const res = await fetch(`${API}/${id}`, {
      method:      'PUT',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error ?? `Error ${res.status}`);
    }
    const updated: BillingInvoice = await res.json();
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, ...updated } : inv));
    await load(filters);
    return updated;
  }, [filters, load]);

  const deleteInvoice = useCallback(async (id: number): Promise<void> => {
    const res = await fetch(`${API}/${id}`, {
      method:      'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error ?? `Error ${res.status}`);
    }
    setInvoices(prev => prev.filter(inv => inv.id !== id));
    await load(filters);
  }, [filters, load]);

  return {
    invoices,
    stats,
    filters,
    loading,
    error,
    setFilters,
    reload,
    createInvoice,
    updateInvoice,
    deleteInvoice,
  };
}