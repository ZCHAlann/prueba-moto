// hooks/useInvoiceReviews.ts
//
// jul 2026 v5 — Hook para el sistema de revisión contable de facturas
// de caja chica (migración 0051).
//
// Endpoints (todos en /api/company/:companyId/finance/invoice-reviews):
//   GET    ?tab=pending_review|seen|under_review|correction_requested|approved|all
//   GET    /:id
//   POST   /:id/seen
//   POST   /:id/start
//   POST   /:id/approve        body: { checks: { ... } }
//   POST   /:id/send-to-correction body: { note, failedChecks? }
//   POST   /:id/reupload       body: { fileUrl, fileMimeType }
//   GET    /:id/timeline

import { useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";

export type InvoiceReviewStatus =
  | "pending_review"
  | "seen"
  | "under_review"
  | "correction_requested"
  | "approved"
  | "not_required";

export type ReviewCheckKey =
  | "sello_autorizacion"
  | "no_caducada"
  | "check_3"
  | "check_4"
  | "nombre_ruc_empresa";

export type ReviewChecks = Record<ReviewCheckKey, boolean>;

// jul 2026 v5 — Textos del checklist (definidos con el dueño).
//   sello_autorizacion  — el SRI autorizó la factura
//   no_caducada         — la factura no pasó su fecha de caducidad
//   monto_coincide      — el subtotal+IVA coincide con el vale aprobado
//   fecha_coherente     — la fecha de la factura es razonable vs la fecha
//                          de la compra (no de hace 2 años ni de mañana)
//   nombre_ruc_empresa  — la factura está a nombre de la empresa
export const REVIEW_CHECK_LABELS: Record<ReviewCheckKey, string> = {
  sello_autorizacion:  "La factura cuenta con el sello de autorización del SRI",
  no_caducada:         "La factura no ha caducado",
  check_3:             "El monto de la factura coincide con el monto del vale aprobado",
  check_4:             "La fecha de la factura es coherente con la fecha de la compra",
  nombre_ruc_empresa:  "El nombre y RUC de la empresa están correctos",
};

export interface ReviewVoucher {
  id: string;
  numericId: number;
  issuedAmount: number;
  closedActualAmount: number | null;
  purpose: "repuesto" | "otro" | null;
  siteId: number;
  siteName: string | null;
}

export interface ReviewInvoice {
  id: string;
  numericId: number;
  invoiceNumber: string;
  fileUrl: string | null;
  fileMimeType: string | null;
  total: number;
  supplierName: string | null;
}

export interface InvoiceReviewRow {
  id: string;
  numericId: number;
  status: InvoiceReviewStatus;
  lastCorrectionNote: string | null;
  lastCorrectionAt: string | null;
  approvedAt: string | null;
  approvedBy: number | null;
  currentReviewerId: number | null;
  currentReviewerName: string | null;
  voucher: ReviewVoucher;
  invoice: ReviewInvoice;
  requesterName: string | null;
}

export interface TimelineEvent {
  id: number;
  kind:
    | "created"
    | "reviewer_seen"
    | "reviewer_started"
    | "correction_requested"
    | "photo_reuploaded"
    | "approved";
  actorUserId: number | null;
  actorName: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type MutationResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Helper: mapea el mensaje crudo del backend ("Transición inválida:
// pending_review → approved") a algo entendible para el user final. Si
// el mensaje no matchea ninguno de los patrones conocidos, lo devuelve
// tal cual. Exportado para que CajaChicaPage lo use al armar el toast.
export function friendlyInvoiceReviewError(
  rawError: string,
  ctx: "approve" | "send-to-correction" | "reupload" | "mark-seen" | "mark-start" | "general" = "general",
): string {
  const m = rawError.match(/Transición inválida:\s*(\w+)\s*→\s*(\w+)/);
  if (!m) return rawError;

  const [, from] = m;
  // Mensajes por acción + estado origen. Cubre los casos típicos donde
  // el user saltea un paso del flujo y termina con un toast feo tipo
  // "Transición inválida: pending_review → approved".
  const guide: Record<string, string> = {
    "approve:seen":                 "Primero abrí el checklist haciendo click en \"Revisar factura\" antes de aprobar.",
    "approve:pending_review":       "Tenés que abrir la factura y el checklist antes de aprobar.",
    "approve:correction_requested": "La factura está en corrección. Esperá a que el operador suba la nueva foto.",
    "approve:approved":             "La factura ya estaba aprobada.",
    "send-to-correction:seen":                 "Estás a un paso — abrí el checklist y desmarcá los checks que fallan.",
    "send-to-correction:pending_review":       "Abrí la factura y el checklist primero (pasos: Ver factura → Revisar factura).",
    "send-to-correction:under_review":         "Estás revisando — desmarcá los checks que fallan y agregá la nota.",
    "send-to-correction:correction_requested": "Ya está marcada para corrección. Esperá la nueva foto del operador.",
    "send-to-correction:approved":             "La factura ya estaba aprobada.",
    "reupload:pending_review":         "Esta factura no está marcada para corrección. Pasale al revisor.",
    "reupload:under_review":           "Aún no se marcó para corrección. Esperá a que el revisor la marque.",
    "reupload:approved":               "La factura ya está aprobada, no hay nada que re-subir.",
    "mark-seen:seen":                  "Ya la habías abierto antes.",
    "mark-seen:under_review":          "Ya está bajo revisión.",
    "mark-seen:correction_requested":  "Está marcada para corrección.",
    "mark-seen:approved":              "La factura ya está aprobada.",
    "mark-start:pending_review":       "Primero abrí la factura (click en \"Ver factura\").",
    "mark-start:under_review":         "Ya estás revisando.",
    "mark-start:correction_requested":  "Está en corrección, no se puede abrir el checklist hasta que llegue la nueva foto.",
    "mark-start:approved":             "La factura ya está aprobada.",
  };
  return guide[`${ctx}:${from}`] ?? `Acción no permitida en el estado actual (${from}).`;
}

export function useInvoiceReviews() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  return useMemo(() => {
    // ─── LIST ────────────────────────────────────────────────────────────
    const list = async (params: {
      tab?: InvoiceReviewStatus | "all";
      siteId?: number;
    } = {}): Promise<InvoiceReviewRow[]> => {
      if (!companyId) return [];
      const qs = new URLSearchParams();
      if (params.tab) qs.set("tab", params.tab);
      if (params.siteId) qs.set("siteId", String(params.siteId));
      const q = qs.toString();
      const res = await fetch(
        `/api/company/${companyId}/finance/invoice-reviews${q ? `?${q}` : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      }
      const json = await res.json();
      return (json.reviews ?? []) as InvoiceReviewRow[];
    };

    // ─── DETAIL ──────────────────────────────────────────────────────────
    const get = async (numericId: number): Promise<InvoiceReviewRow> => {
      if (!companyId) throw new Error("Sesión inválida");
      const res = await fetch(
        `/api/company/${companyId}/finance/invoice-reviews/${numericId}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      }
      return (await res.json()) as InvoiceReviewRow;
    };

    // ─── SEEN ────────────────────────────────────────────────────────────
    // El revisor abrió la foto. pending_review → seen.
    const markSeen = async (numericId: number): Promise<MutationResult<{ status: "seen" }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const res = await fetch(
        `/api/company/${companyId}/finance/invoice-reviews/${numericId}/seen`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      return { ok: true, data: await res.json() };
    };

    // ─── START ───────────────────────────────────────────────────────────
    // El revisor abrió el checklist. seen → under_review.
    const markStart = async (numericId: number): Promise<MutationResult<{ status: "under_review" }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const res = await fetch(
        `/api/company/${companyId}/finance/invoice-reviews/${numericId}/start`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      return { ok: true, data: await res.json() };
    };

    // ─── APPROVE ─────────────────────────────────────────────────────────
    const approve = async (
      numericId: number,
      checks: ReviewChecks,
    ): Promise<MutationResult<{ status: "approved" }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const res = await fetch(
        `/api/company/${companyId}/finance/invoice-reviews/${numericId}/approve`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checks }),
        },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      return { ok: true, data: await res.json() };
    };

    // ─── SEND TO CORRECTION ──────────────────────────────────────────────
    const sendToCorrection = async (
      numericId: number,
      note: string,
      failedChecks: string[] = [],
    ): Promise<MutationResult<{ status: "correction_requested" }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const res = await fetch(
        `/api/company/${companyId}/finance/invoice-reviews/${numericId}/send-to-correction`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note, failedChecks }),
        },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      return { ok: true, data: await res.json() };
    };

    // ─── REUPLOAD ────────────────────────────────────────────────────────
    const reupload = async (
      numericId: number,
      fileUrl: string,
      fileMimeType: string,
    ): Promise<MutationResult<{ status: "pending_review" }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const res = await fetch(
        `/api/company/${companyId}/finance/invoice-reviews/${numericId}/reupload`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileUrl, fileMimeType }),
        },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      return { ok: true, data: await res.json() };
    };

    // ─── TIMELINE ────────────────────────────────────────────────────────
    const timeline = async (numericId: number): Promise<TimelineEvent[]> => {
      if (!companyId) return [];
      const res = await fetch(
        `/api/company/${companyId}/finance/invoice-reviews/${numericId}/timeline`,
        { credentials: "include" },
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      }
      const json = await res.json();
      return (json.events ?? []) as TimelineEvent[];
    };

    return {
      list,
      get,
      markSeen,
      markStart,
      approve,
      sendToCorrection,
      reupload,
      timeline,
    };
  }, [companyId]);
}

// ─── Helpers de presentación ─────────────────────────────────────────────────

/**
 * Devuelve el label legible del estado.
 */
export const REVIEW_STATUS_LABEL: Record<InvoiceReviewStatus, string> = {
  pending_review:        "Pendiente de revisar",
  seen:                  "Vista por revisor",
  under_review:          "En revisión",
  correction_requested:  "Enviada a corrección",
  approved:              "Aprobada",
  not_required:          "No requiere revisión",
};

/**
 * Devuelve la clase CSS (Tailwind) del color del semáforo.
 */
export const REVIEW_STATUS_PILL: Record<InvoiceReviewStatus, string> = {
  pending_review:
    "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30",
  seen:
    "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/30",
  under_review:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  correction_requested:
    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
  approved:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  not_required:
    "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-400 dark:ring-white/[0.10]",
};

/**
 * Color sólido (hex) para usar en la barrita del semáforo.
 */
export const REVIEW_STATUS_DOT: Record<InvoiceReviewStatus, string> = {
  pending_review:        "#3b82f6", // blue-500
  seen:                  "#f97316", // orange-500
  under_review:          "#f59e0b", // amber-500
  correction_requested:  "#ef4444", // red-500
  approved:              "#10b981", // emerald-500
  not_required:          "#94a3b8", // slate-400
};

// ─── Plazo de corrección (jul 2026 v5) ───────────────────────────────────────
//
// El operador tiene 24h desde que se manda a corrección para subir
// una nueva foto. Pasado ese plazo, el reupload se rechaza.

export const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 día

export function getCorrectionDeadline(lastCorrectionAt: string | null | undefined): Date | null {
  if (!lastCorrectionAt) return null;
  const d = new Date(lastCorrectionAt);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + CORRECTION_WINDOW_MS);
}

export function isCorrectionExpired(lastCorrectionAt: string | null | undefined, now: number = Date.now()): boolean {
  const deadline = getCorrectionDeadline(lastCorrectionAt);
  if (!deadline) return false;
  return now > deadline.getTime();
}

/**
 * Devuelve el tiempo restante en ms (positivo) o ya vencido (negativo).
 * Devuelve null si no hay deadline.
 */
export function getCorrectionRemainingMs(
  lastCorrectionAt: string | null | undefined,
  now: number = Date.now(),
): number | null {
  const deadline = getCorrectionDeadline(lastCorrectionAt);
  if (!deadline) return null;
  return deadline.getTime() - now;
}

/**
 * Formatea una diferencia de tiempo en formato corto "Xh Ym" o "Xm Ys"
 * (sin días porque el plazo es 1 día). Si es negativo, devuelve
 * "vencido hace Xh Ym".
 */
export function formatRemaining(ms: number): string {
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const fmt = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return ms >= 0 ? `Restante: ${fmt}` : `Vencido hace ${fmt}`;
}
