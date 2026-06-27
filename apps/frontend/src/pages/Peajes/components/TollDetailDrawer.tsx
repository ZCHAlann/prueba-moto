"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X, Banknote, Truck, Route, Calendar, Hash, Camera, MapPin,
  CreditCard, Pencil, FileText, Loader2,
} from "lucide-react";
import type { ApiTollEntry } from "../../../hooks/useToll";
import { fmtDateTimeEc } from "@/lib/datetime";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function fmtDateTime(ymd: string) {
  return fmtDateTimeEc(ymd);
}

function fmtDate(ymd: string) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

export function TollDetailDrawer({
  entry, onClose, onEdit,
}: {
  entry: ApiTollEntry | null;
  onClose: () => void;
  onEdit: (t: ApiTollEntry) => void;
}) {
  return (
    <AnimatePresence>
      {entry && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl dark:bg-gray-900"
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="relative border-l-4 border-l-amber-500 border-b border-gray-200 dark:border-white/[0.06] px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {entry.category && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                          {entry.category}
                        </span>
                      )}
                      {entry.paymentMethod && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-700 dark:bg-white/[0.05] dark:text-gray-300">
                          <CreditCard size={10} />
                          {entry.paymentMethod}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 text-lg font-bold text-gray-800 dark:text-white truncate">
                      {entry.tollName}
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 font-mono">
                      #{entry.id}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
                {/* Monto destacado */}
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">Monto del cruce</p>
                  <p className="mt-0.5 text-3xl font-bold text-amber-700 dark:text-amber-200">{fmtMoney(entry.amount)}</p>
                </div>

                <Section title="Vehículo">
                  <Row icon={<Truck size={13} />}  label="Placa"    value={entry.assetPlate ?? "—"} />
                  <Row icon={<Hash size={13} />}   label="Marca"    value={`${entry.assetBrand ?? "—"} ${entry.assetModel ?? ""}`.trim()} />
                </Section>

                <Section title="Cruce">
                  <Row icon={<Calendar size={13} />} label="Fecha"     value={fmtDate(entry.date)} />
                  <Row icon={<Route size={13} />}    label="Ruta"      value={entry.route ?? "—"} />
                  <Row icon={<MapPin size={13} />}   label="Categoría" value={entry.category ?? "—"} />
                  <Row icon={<CreditCard size={13} />} label="Pago"     value={entry.paymentMethod ?? "—"} />
                  {entry.axes != null && (
                    <Row icon={<Hash size={13} />} label="Ejes" value={`${entry.axes}`} />
                  )}
                </Section>

                {entry.odometer != null && (
                  <Section title="Vehículo">
                    <Row icon={<Hash size={13} />} label="Odómetro al cruce" value={`${entry.odometer.toLocaleString("es-CO")} km`} />
                  </Section>
                )}

                {entry.notes && (
                  <Section title="Notas">
                    <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-200 whitespace-pre-wrap">
                      {entry.notes}
                    </p>
                  </Section>
                )}

                {entry.photoUrl && (
                  <Section title="Tiquete / Foto">
                    <a href={entry.photoUrl} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={entry.photoUrl}
                        alt="Tiquete de peaje"
                        className="w-full max-h-72 rounded-lg border border-gray-200 object-contain dark:border-white/[0.08]"
                      />
                    </a>
                  </Section>
                )}

                <Section title="Auditoría">
                  <Row icon={<Calendar size={13} />} label="Creado"      value={fmtDateTime(entry.createdAt)} />
                  <Row icon={<Calendar size={13} />} label="Actualizado" value={fmtDateTime(entry.updatedAt)} />
                </Section>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-white/[0.06] px-5 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(entry)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-amber-500/20 transition"
                >
                  <Pencil size={13} /> Editar
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{title}</p>
      <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] divide-y divide-gray-100 dark:divide-white/[0.04]">
        {children}
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </span>
      <span className="text-right text-gray-800 dark:text-white">{value}</span>
    </div>
  );
}
