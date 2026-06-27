"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  FuelDetailDrawer
// ─────────────────────────────────────────────────────────────────────────────
//  Drawer lateral con el detalle de una carga de combustible.
//  Muestra todos los campos + foto (si hay) + botón "Descargar PDF" que
//  genera el comprobante vía @react-pdf/renderer (ver FuelDetailPdf).

import { motion, AnimatePresence } from "framer-motion";
import {
  X, Truck, User, Calendar, MapPin, Gauge, Droplets, FileDown, Image as ImageIcon,
} from "lucide-react";
import { useEffect } from "react";
import type { ApiFuelEntry } from "../../../hooks/useFuel";
import { useFuelDetailPdf } from "./FuelDetailPdf";

type Props = {
  entry: ApiFuelEntry | null;
  onClose: () => void;
};

function fmtNum(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(decimals);
}
function fmtMoney(n: number): string {
  return `${(Number.isFinite(n) ? n : 0).toFixed(2)} USD`;
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : s;
}

export function FuelDetailDrawer({ entry, onClose }: Props) {
  // entry may not fully match the shape expected by useFuelDetailPdf; cast to any to satisfy TS
  const download = useFuelDetailPdf(entry as any);

  useEffect(() => {
    if (!entry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, onClose]);

  return (
    <AnimatePresence>
      {entry && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-gray-950/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-gray-900"
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5 dark:border-white/[0.06]">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-warning-50 dark:bg-warning-500/[0.12]">
                    <Droplets size={15} className="text-warning-600 dark:text-warning-400" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                    Detalle de carga
                  </h2>
                </div>
                <p className="mt-1 ml-10 text-xs text-gray-400 dark:text-gray-500">
                  {entry.assetPlate ?? "—"} · {fmtDate(entry.date)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition hover:bg-gray-50 dark:border-white/[0.08] dark:hover:bg-white/[0.05]"
                aria-label="Cerrar"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-5 p-6">
              {/* Vehículo */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Vehículo
                </p>
                <Row icon={Truck} label="Placa" value={entry.assetPlate ?? "—"} />
                <Row icon={Truck} label="Unidad" value={`${entry.assetBrand ?? ""} ${entry.assetModel ?? ""}`.trim() || "—"} />
              </div>

              {/* Conductor */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Conductor
                </p>
                <Row icon={User} label="Nombre" value={"—"} />
              </div>

              {/* Carga */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Detalle de la carga
                </p>
                <Row icon={Calendar} label="Fecha"    value={fmtDate(entry.date)} />
                <Row icon={MapPin}   label="Estación" value={entry.station || "—"} />
                <Row icon={Gauge}    label="Odómetro" value={`${Number(entry.odometer || 0).toLocaleString()} km`} />
                <Row icon={Droplets} label="Galones"  value={`${fmtNum(entry.gallons, 2)} gal`} />
                <Row
                  icon={Droplets}
                  label="Precio unitario"
                  value={entry.gallons > 0 ? `${fmtMoney(entry.cost / entry.gallons)} / gal` : "—"}
                />
                <Row icon={Droplets} label="Costo total" value={fmtMoney(entry.cost)} highlight />
              </div>

              {/* Foto evidencia */}
              {entry.photoUrl ? (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Evidencia fotográfica
                  </p>
                  <a
                    href={entry.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={entry.photoUrl} alt="Evidencia" className="block h-auto w-full object-cover" />
                  </a>
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Evidencia fotográfica
                  </p>
                  <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.03]">
                    <ImageIcon size={14} />
                    Esta carga no tiene foto adjunta.
                  </div>
                </div>
              )}
            </div>

            {/* Footer con acción PDF */}
            <div className="sticky bottom-0 border-t border-gray-100 bg-white/95 px-6 py-4 backdrop-blur dark:border-white/[0.06] dark:bg-gray-900/95">
              <button
                type="button"
                onClick={download}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95"
              >
                <FileDown size={15} />
                Descargar comprobante PDF
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Row({
  icon: Icon, label, value, highlight,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-50 py-2 last:border-b-0 dark:border-white/[0.04]">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Icon size={12} className="shrink-0" />
        <span>{label}</span>
      </div>
      <span
        className={
          highlight
            ? "text-sm font-black text-gray-800 dark:text-white"
            : "text-sm font-semibold text-gray-700 dark:text-gray-200"
        }
      >
        {value}
      </span>
    </div>
  );
}
