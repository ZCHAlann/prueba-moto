"use client";

// components/maintenance/AttachmentFacturaModal.tsx
//
// jul 2026 v3 — Pregunta "¿factura o solo evidencia?" al subir un archivo
// dentro de "Facturas y evidencias" del drawer de mantenimiento.
//
// Si el operador elige "Factura", el modal además pregunta:
//   • Tipo:          [Repuesto | Mano de obra | Lavada]   (solo 3)
//   • Proveedor/Taller/Lavador: dinámico según el Tipo:
//       - Repuesto    -> dropdown proveedores (catalog company_suppliers)
//       - Mano de obra-> input texto libre "Taller"
//       - Lavada      -> input texto libre "Lavador"
//   • N° factura:    AUTO-generado por backend (NO se muestra input).
//   • Subtotal:      calculado auto = Σ(items.subtotal).
//   • IVA USD:       input manual (lo que ya le cobraron).
//   • Total:         calculado = subtotal + iva.
//   • Items:         sub-tabla editable con desc / cant / p.unit / subtotal.
//                    Cada item tiene upload de imagen QUE NO SE GUARDA HASTA
//                    QUE SE APRIETE "Guardar factura" — la imagen queda en
//                    estado "pendiente" (imagePending=true, imageUrl=null).
//                    Al guardar la factura, subimos TODAS las imágenes
//                    pendientes al storage en paralelo y reemplazamos.
//
// Si elige "Evidencia", devuelve:
//   { url: string, isInvoice: false }  (sin modal extra)

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  X, Save, Plus, Trash2, Loader2, FileText, Image as ImageIcon,
  Receipt as ReceiptIcon, Eye, Camera,
} from "lucide-react";
import { toast } from "sonner";
import { useSuppliers } from "../../../hooks/useSuppliers";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type AttachmentMode = "factura" | "evidencia";

export type InvoiceKind = "repuesto" | "mano_obra" | "lavada";

export interface ItemRow {
  /** Local: el id temporal de fila. */
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  /** Imagen pendiente: si hay File, imagePending=true y imageUrl=null. */
  imageFile?: File | null;
  imageUrl?: string | null;
  imagePending?: boolean;
}

export interface AttachmentFacturaResult {
  url: string;
  isInvoice: boolean;
  // Solo cuando isInvoice=true:
  kind?: InvoiceKind | null;
  supplierId?: number | null;
  /** Para kind='mano_obra'. Texto libre. */
  workshopName?: string | null;
  /** Para kind='lavada'. Texto libre. */
  workerName?: string | null;
  /** IVA en USD (lo que ya le cobraron). */
  ivaAmount?: number | null;
  /** Total final de la factura (subtotal + iva). */
  total?: number | null;
  items?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    imageUrl?: string | null;
    imagePending?: boolean;
  }>;
}

export interface AttachmentFacturaModalProps {
  fileUrl:        string;
  fileMimeType?:  string | null;
  fileLabel?:     string;
  onClose:        () => void;
  onSubmit:       (result: AttachmentFacturaResult) => Promise<void>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const KIND_OPTIONS: Array<{ value: InvoiceKind; label: string; color: string }> = [
  { value: "repuesto",  label: "Repuesto",     color: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30" },
  { value: "mano_obra", label: "Mano de obra", color: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30" },
  { value: "lavada",    label: "Lavada",       color: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30" },
];

const inputCls =
  "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200";

const labelCls =
  "mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500";

const newRow = (): ItemRow => ({
  id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  description: "", quantity: 1, unitPrice: 0, subtotal: 0,
  imageFile: null, imageUrl: null, imagePending: false,
});

// ─── Modal ──────────────────────────────────────────────────────────────────

export function AttachmentFacturaModal(props: AttachmentFacturaModalProps) {
  const [mode, setMode] = useState<AttachmentMode>("factura");

  // ── Header del comprobante ──
  const [kind, setKind]               = useState<InvoiceKind>("repuesto");
  const [supplierId, setSupplierId]   = useState<string>("");
  const [workshopName, setWorkshopName] = useState<string>("");
  const [workerName, setWorkerName]     = useState<string>("");
  const [ivaAmount, setIvaAmount]     = useState<string>("");
  const [items, setItems]             = useState<ItemRow[]>([]);
  const [submitting, setSubmitting]   = useState(false);

  const { suppliers, loading: suppliersLoading } = useSuppliers();

  // Subtotal auto desde items
  const subtotal = useMemo(
    () => +items.reduce((acc, it) => acc + (it.subtotal || 0), 0).toFixed(2),
    [items],
  );
  const ivaNum = useMemo(() => {
    const n = parseFloat(ivaAmount);
    return Number.isFinite(n) && n >= 0 ? +n.toFixed(2) : 0;
  }, [ivaAmount]);
  const total = useMemo(() => +(subtotal + ivaNum).toFixed(2), [subtotal, ivaNum]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const addItem = useCallback(() => {
    setItems((prev) => [...prev, newRow()]);
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateItem = useCallback((idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next: ItemRow = { ...it, ...patch };
        if ('quantity' in patch || 'unitPrice' in patch) {
          next.subtotal = +(next.quantity * next.unitPrice).toFixed(2);
        }
        return next;
      }),
    );
  }, []);

  /** Adjunta imagen a un item — se queda en memoria hasta "Guardar factura". */
  const setItemImage = useCallback((idx: number, file: File | null) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        return {
          ...it,
          imageFile:    file,
          imageUrl:     file ? null : (file === null ? null : it.imageUrl),
          imagePending: !!file,
        };
      }),
    );
  }, []);

  /** Sube al storage todas las imágenes pendientes; devuelve los items con
   *  imageUrl ya materializado y imagePending=false. */
  const uploadPendingImages = useCallback(async (): Promise<AttachmentFacturaResult["items"]> => {
    const cleaned: NonNullable<AttachmentFacturaResult["items"]> = [];
    for (const it of items) {
      const clean: NonNullable<AttachmentFacturaResult["items"]>[number] = {
        description: it.description.trim(),
        quantity:    it.quantity,
        unitPrice:   it.unitPrice,
        subtotal:    it.subtotal,
        imageUrl:    it.imageUrl ?? null,
        imagePending: false,
      };
      if (it.imagePending && it.imageFile) {
        try {
          const url = await uploadOneImage(it.imageFile);
          clean.imageUrl = url;
        } catch (err) {
          toast.warning(`No se pudo subir imagen de "${it.description || 'item'}": ${(err as Error).message}`);
          clean.imagePending = true; // queda pendiente para próximo intento
        }
      }
      if (clean.description.length > 0 || clean.imageUrl) cleaned.push(clean);
    }
    return cleaned;
  }, [items]);

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (mode === "evidencia") {
        await props.onSubmit({ url: props.fileUrl, isInvoice: false });
        return;
      }

      // ── Validación "Factura" ───────────────────────────────────────────
      if (kind === "repuesto" && !supplierId) {
        // No es estrictamente requerido, pero el dueño del dominio lo prefiere.
        toast.error("Selecciona un proveedor.");
        return;
      }
      if (kind === "mano_obra" && !workshopName.trim()) {
        toast.error("Indica el nombre del taller.");
        return;
      }
      if (kind === "lavada" && !workerName.trim()) {
        toast.error("Indica el nombre del lavador.");
        return;
      }

      const cleanedItems = await uploadPendingImages();

      await props.onSubmit({
        url:           props.fileUrl,
        isInvoice:     true,
        kind,
        supplierId:    kind === "repuesto" && supplierId ? Number(supplierId) : null,
        workshopName:  kind === "mano_obra" ? workshopName.trim() : null,
        workerName:    kind === "lavada"    ? workerName.trim()   : null,
        ivaAmount:     ivaNum,
        total,
        items:         cleanedItems,
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting, mode, kind, supplierId, workshopName, workerName,
    ivaNum, total, items, uploadPendingImages, props,
  ]);

  const isImage = props.fileMimeType?.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(props.fileUrl);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.06] dark:bg-[#0b0f1a]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <ReceiptIcon size={16} className="text-emerald-600 dark:text-emerald-300" />
            <h2 className="text-sm font-bold text-gray-800 dark:text-white">
              {mode === "factura" ? "Datos de la factura" : "¿Qué es este archivo?"}
            </h2>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs Factura vs Evidencia */}
        <div className="flex border-b border-gray-200 dark:border-white/[0.06]">
          <button
            type="button"
            onClick={() => setMode("factura")}
            className={`flex-1 px-4 py-2.5 text-xs font-semibold transition ${
              mode === "factura"
                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-b-2 border-emerald-600 dark:border-emerald-400"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
            }`}
          >
            <ReceiptIcon size={12} className="inline mr-1.5" />
            Es factura (genera comprobante)
          </button>
          <button
            type="button"
            onClick={() => setMode("evidencia")}
            className={`flex-1 px-4 py-2.5 text-xs font-semibold transition ${
              mode === "evidencia"
                ? "bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 border-b-2 border-slate-400"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
            }`}
          >
            <Eye size={12} className="inline mr-1.5" />
            Solo evidencia (no genera comprobante)
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Preview del archivo */}
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
            {isImage ? (
              <img src={props.fileUrl} alt="adjunto" className="h-14 w-14 rounded-md object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-md bg-gray-100 text-gray-500 dark:bg-white/[0.06]">
                <FileText size={18} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-gray-800 dark:text-white">
                {props.fileLabel ?? "Comprobante"}
              </p>
              <a
                href={props.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-emerald-600 dark:text-emerald-300 hover:underline"
              >
                Ver archivo original ↗
              </a>
            </div>
          </div>

          {mode === "evidencia" ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03] p-4 text-center">
              <p className="text-xs text-slate-700 dark:text-slate-300">
                Este archivo se guardará solo como <strong>evidencia visual</strong> del mantenimiento.
                No generará comprobante en el módulo Finanzas.
              </p>
              <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                Útil para fotos del trabajo, vehículo, antes/después, etc.
              </p>
            </div>
          ) : (
            <>
              {/* Cabecera de la factura */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Tipo</label>
                  <select
                    value={kind}
                    onChange={(e) => {
                      const next = e.target.value as InvoiceKind;
                      setKind(next);
                      // Al cambiar de tipo, limpiamos los campos del otro tipo.
                      if (next === "repuesto") { setWorkshopName(""); setWorkerName(""); }
                      if (next === "mano_obra") { setSupplierId(""); setWorkerName(""); }
                      if (next === "lavada")    { setSupplierId(""); setWorkshopName(""); }
                    }}
                    className={inputCls}
                  >
                    {KIND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Campo dinámico según TIPO */}
                {kind === "repuesto" && (
                  <div>
                    <label className={labelCls}>Proveedor</label>
                    <select
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      disabled={suppliersLoading}
                      className={inputCls}
                    >
                      <option value="">{suppliersLoading ? "Cargando proveedores…" : "(proveedor libre)"}</option>
                      {suppliers.map((s: { id: string; name: string }) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {kind === "mano_obra" && (
                  <div>
                    <label className={labelCls}>Taller</label>
                    <input
                      type="text"
                      value={workshopName}
                      onChange={(e) => setWorkshopName(e.target.value)}
                      placeholder="Nombre del taller"
                      className={inputCls}
                    />
                  </div>
                )}
                {kind === "lavada" && (
                  <div>
                    <label className={labelCls}>Lavador</label>
                    <input
                      type="text"
                      value={workerName}
                      onChange={(e) => setWorkerName(e.target.value)}
                      placeholder="Nombre del lavador"
                      className={inputCls}
                    />
                  </div>
                )}

                {/* N° Factura: AUTO — NO se muestra input. Lo explica el placeholder de N° */}
                <div>
                  <label className={labelCls}>N° factura</label>
                  <div className="h-10 w-full rounded-lg border border-dashed border-gray-200 bg-gray-50 dark:border-white/[0.06] dark:bg-white/[0.03] px-3 text-xs flex items-center text-gray-500 dark:text-gray-400">
                    Se asignará automáticamente al guardar (ej: MTT-001).
                  </div>
                </div>

                <div>
                  <label className={labelCls}>IVA (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ivaAmount}
                    onChange={(e) => setIvaAmount(e.target.value)}
                    placeholder="0.00"
                    className={inputCls}
                  />
                </div>

                {/* Subtotal y total: solo lectura */}
                <div>
                  <label className={labelCls}>Subtotal (calculado)</label>
                  <div className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 dark:border-white/[0.06] dark:bg-white/[0.02] px-3 text-sm tabular-nums flex items-center text-gray-700 dark:text-gray-200">
                    ${subtotal.toFixed(2)}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Total factura (subtotal + IVA)</label>
                  <div className="h-10 w-full rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 px-3 text-sm tabular-nums font-bold flex items-center text-emerald-800 dark:text-emerald-200">
                    ${total.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Sub-tabla items — sin upload, se hace en modal aparte? No.
                  Cada item tiene upload INLINE que se guarda al cerrar. */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className={labelCls + " mb-0"}>Items de la factura</p>
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-600 hover:bg-sky-700 px-2 py-1 text-[10px] font-semibold text-white transition"
                  >
                    <Plus size={11} /> Item
                  </button>
                </div>

                {items.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-3 rounded-lg border border-dashed border-gray-200 dark:border-white/[0.08]">
                    Sin items. La factura se registra solo con el total.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {items.map((it, idx) => (
                      <div
                        key={it.id}
                        className="rounded-lg border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.02] p-2"
                      >
                        <div className="flex items-center gap-1.5">
                          {/* Imagen pendiente */}
                          <label className="shrink-0 cursor-pointer">
                            {it.imageUrl || it.imagePending ? (
                              <div className="relative h-8 w-8 rounded-md overflow-hidden border border-gray-200 dark:border-white/[0.08]">
                                {it.imageUrl ? (
                                  <img src={it.imageUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center bg-amber-50 dark:bg-amber-500/10">
                                    <Loader2 size={11} className="text-amber-500 animate-spin" />
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setItemImage(idx, null);
                                  }}
                                  className="absolute top-0 right-0 bg-black/60 text-white p-0.5"
                                  title="Quitar imagen"
                                >
                                  <X size={9} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-gray-300 dark:border-white/[0.08] text-gray-400 hover:border-sky-400 hover:text-sky-500 transition">
                                <Camera size={12} />
                              </div>
                            )}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0] ?? null;
                                setItemImage(idx, f);
                                e.target.value = ""; // permite re-seleccionar la misma imagen
                              }}
                            />
                          </label>
                          <input
                            type="text"
                            value={it.description}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                            placeholder="Descripción"
                            className="flex-1 h-8 rounded-md border border-gray-200 bg-white px-2 text-xs dark:border-white/[0.08] dark:bg-white/[0.05]"
                          />
                          <input
                            type="number"
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                            step="0.01"
                            min="0"
                            className="w-16 h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-right dark:border-white/[0.08] dark:bg-white/[0.05]"
                          />
                          <input
                            type="number"
                            value={it.unitPrice}
                            onChange={(e) => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                            step="0.01"
                            min="0"
                            className="w-20 h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-right dark:border-white/[0.08] dark:bg-white/[0.05]"
                          />
                          <span className="w-16 text-right text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                            ${it.subtotal.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                  Los items quedan atados a esta factura. Al guardar, las imágenes de cada item se suben al storage. Luego Finanzas registra una sola factura con todos los items en <code>company_invoices.items</code>, y el repuesto aparece automáticamente en el drawer de mantenimiento.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-white/[0.06]">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.04]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white"
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {mode === "factura"
              ? (submitting ? "Guardando…" : "Guardar factura")
              : "Guardar evidencia"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers de upload ──────────────────────────────────────────────────────

async function uploadOneImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("photos", file);
  const res = await fetch(`/upload/photos`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${t || res.statusText}`);
  }
  const json = (await res.json()) as { urls?: string[] };
  const url = json.urls?.[0];
  if (!url) throw new Error("El servidor no devolvió la URL del archivo.");
  return url;
}

/**
 * Helper: unifica el upload al storage + el modal "¿factura o evidencia?".
 * Devuelve la URL tras subir el archivo. El padre abre el modal con esa URL.
 *
 * Esta función NO es un hook React — se llama desde eventos del drawer padre.
 */
export async function uploadAttachmentBeforeModal(opts: {
  url: string;
  file: File;
  category?: string;
}): Promise<string> {
  // Solo se mantiene por compatibilidad — la lógica real va por uploadOneImage.
  return uploadOneImage(opts.file);
}

// Silenciar import no usado (ImageIcon está disponible si querés, pero el
// branch actual usa solo FileText + un <img> directo).
void ImageIcon;
