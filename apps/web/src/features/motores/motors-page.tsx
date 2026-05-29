"use client";

import Link from "next/link";
import { useEffect, useRef, useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useMotors } from "@/hooks/useMotors";
import { StatusPill } from "@/components/ui/status-pill";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { Search, Plus, MoreVertical, Eye, Pencil, Trash2 } from "lucide-react";
import { MotorCreateModal } from "@/features/motores/motor-create-modal";
import { MotorEditModal } from "@/features/motores/motor-editar-modal";
import type { Asset } from "@/types/activo";

/* ── Stat card ── */
function StatCard({ label, value, detail, tone }: {
  label: string; value: string; detail: string;
  tone: "info" | "success" | "warning" | "neutral";
}) {
  const toneMap = {
    info:    { bg: "bg-blue-50 dark:bg-blue-500/10",       text: "text-blue-600 dark:text-blue-400"       },
    success: { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
    warning: { bg: "bg-amber-50 dark:bg-amber-500/10",     text: "text-amber-600 dark:text-amber-400"     },
    neutral: { bg: "bg-gray-100 dark:bg-white/[0.05]",     text: "text-gray-500 dark:text-gray-400"       },
  };
  const t = toneMap[tone];
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className={`mb-3 inline-flex rounded-xl p-2.5 ${t.bg}`}>
        <span className={`text-xs font-bold uppercase tracking-widest ${t.text}`}>{label[0]}</span>
      </div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <h4 className="mt-1 text-2xl font-bold text-gray-800 dark:text-white">{value}</h4>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{detail}</p>
    </div>
  );
}

  /* ── Row actions dropdown ── */
  function RowActions({ motor, onDelete, onEdit }: { motor: Asset; onDelete: (m: Asset) => void; onEdit: (m: Asset) => void;   }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative flex justify-end">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Acciones"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700 dark:border-white/[0.08] dark:hover:bg-white/[0.05] dark:hover:text-gray-300"
      >
        <MoreVertical size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-white/[0.08] dark:bg-gray-900">
          <Link
            href={`/motores/${motor.id}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            <Eye size={14} className="text-gray-400" />
            Ver detalle
          </Link>
          <button
            type="button"
            onClick={() => { setOpen(false); onEdit(motor); }} 
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            <Pencil size={14} className="text-gray-400" />
            Editar
          </button>
          <div className="mx-3 border-t border-gray-100 dark:border-white/[0.06]" />
          <button
            type="button"
            onClick={() => { setOpen(false); onDelete(motor); }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
          >
            <Trash2 size={14} />
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main page ── */
export function MotorsPage() {
  const { motors, deleteMotor } = useMotors();
  const { confirmAction } = useFeedback();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [showModal, setShowModal] = useState(false);
  const [motorToEdit, setMotorToEdit] = useState<Asset | null>(null);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return motors.filter((motor) => {
      const matchesQuery =
        value.length === 0 ||
        motor.code.toLowerCase().includes(value) ||
        (motor.serial ?? "").toLowerCase().includes(value) ||
        (motor.brand ?? "").toLowerCase().includes(value) ||
        (motor.model ?? "").toLowerCase().includes(value);
      const matchesStatus = status === "Todos" || motor.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [motors, query, status]);

  const statusTone = (s: string) =>
    s === "Operativo" ? "success" : s === "En mantenimiento" ? "warning" : "danger";

  const handleDelete = async (motor: Asset) => {
    await confirmAction({
      title: "Eliminar motor",
      description: "El motor saldrá del inventario técnico de la empresa activa.",
      confirmLabel: "Eliminar motor",
      accent: "rose",
      successTitle: "Motor eliminado",
      successDescription: "El registro técnico fue retirado correctamente.",
      summary: [
        { label: "Código",    value: motor.code          },
        { label: "Serie",     value: motor.serial ?? "-" },
        { label: "Estado",    value: motor.status        },
        { label: "Ubicación", value: motor.location ?? "-" },
      ],
      action: async () => { await deleteMotor(motor.id); },
    });
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Dominio técnico"
        title="Motores"
        subtitle="Inventario técnico de motores registrados en la empresa."
        accent="orange"
        action={
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 active:scale-95"
          >
            <Plus size={16} />
            Nuevo motor
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:gap-6 xl:grid-cols-4">
        <StatCard label="Total"         value={motors.length.toString()}                                               detail="Base técnica registrada"  tone="info"    />
        <StatCard label="Operativos"    value={motors.filter(m => m.status === "Operativo").length.toString()}         detail="Listos para uso"          tone="success" />
        <StatCard label="Mantenimiento" value={motors.filter(m => m.status === "En mantenimiento").length.toString()}  detail="Intervenidos por taller"  tone="warning" />
        <StatCard label="Fuera de servicio" value={motors.filter(m => m.status === "Fuera de servicio").length.toString()} detail="Fuera de operación"   tone="neutral" />
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Código, serie, marca o modelo..."
              className="h-10 w-full rounded-lg border border-gray-200 bg-transparent pl-9 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 dark:border-white/[0.08] dark:text-white dark:placeholder:text-gray-500"
            />
          </div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-orange-400 focus:outline-none dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300"
          >
            {["Todos", "Operativo", "En mantenimiento", "Fuera de servicio"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white">Lista de motores</h3>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sin motores</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">No hay coincidencias para los filtros actuales.</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    {["Código", "Serie", "Motor", "Aceite", "Ubicación", "Estado", ""].map((h, i) => (
                      <th key={i} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {filtered.map(motor => (
                    <tr key={motor.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                      <td className="px-5 py-4 text-sm font-semibold text-gray-800 dark:text-white">{motor.code}</td>
                      <td className="px-5 py-4 font-mono text-sm text-gray-500 dark:text-gray-400">{motor.serial ?? "-"}</td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{motor.brand} {motor.model}</p>
                        <p className="mt-0.5 text-xs text-gray-400">{motor.year}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {motor.oilType ?? "-"} / {motor.oilCapacity ?? "-"}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{motor.location ?? "-"}</td>
                      <td className="px-5 py-4">
                        <StatusPill label={motor.status} tone={statusTone(motor.status)} />
                      </td>
                      <td className="px-5 py-4">
                        <RowActions motor={motor} onDelete={handleDelete} onEdit={setMotorToEdit} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="divide-y divide-gray-100 dark:divide-white/[0.04] md:hidden">
              {filtered.map(motor => (
                <div key={motor.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-gray-800 dark:text-white">{motor.code}</p>
                      <p className="mt-0.5 font-mono text-xs text-gray-400">{motor.serial ?? "-"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill label={motor.status} tone={statusTone(motor.status)} />
                      <RowActions motor={motor} onDelete={handleDelete} onEdit={setMotorToEdit} />
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{motor.brand} {motor.model}</p>
                  <p className="text-xs text-gray-400">{motor.oilType} · {motor.oilCapacity} · {motor.year}</p>
                  <p className="text-xs text-gray-400">{motor.location ?? "-"}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showModal && <MotorCreateModal onClose={() => setShowModal(false)} />}
      {motorToEdit && (
        <MotorEditModal motor={motorToEdit} onClose={() => setMotorToEdit(null)} />
      )}
    </div>
  );
}