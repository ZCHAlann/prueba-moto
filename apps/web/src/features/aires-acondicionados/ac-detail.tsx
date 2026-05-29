"use client";

import { useState } from "react";
import { useAcUnits } from "@/hooks/useAcUnits";
import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import type { AcServiceKind } from "@/types/fleet";

type AcDetailProps = {
  unitId: string;
  onBack: () => void;
};

export function AcDetail({ unitId, onBack }: AcDetailProps) {
  const { units, services, refrigerantLogs, createService, createRefrigerantLog } = useAcUnits();
  const unit = units.find((u) => u.id === unitId);
  const unitServices = services.filter((s) => s.unitId === unitId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const refLogs = refrigerantLogs.filter((l) => l.unitId === unitId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const [activeTab, setActiveTab] = useState<"info" | "services" | "refrigerant">("info");
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceForm, setServiceForm] = useState({
    date: "", kind: "Limpieza" as AcServiceKind,
    technician: unit?.technician ?? "", cost: "", findings: "", notes: "",
  });
  const [showRefForm, setShowRefForm] = useState(false);
  const [refForm, setRefForm] = useState({
    date: "", refrigerantType: unit?.refrigerantType ?? "",
    quantity: "", unit: "kg" as "kg" | "lb" | "oz", technician: unit?.technician ?? "", reason: "", notes: "",
  });

  if (!unit) return <div>Unidad no encontrada. <Button onClick={onBack}>Volver</Button></div>;

  const handleCreateService = async () => {
    if (!serviceForm.date || !serviceForm.technician) return;
    await createService({ unitId, photoUrls: [], ...serviceForm });
    setShowServiceForm(false);
    setServiceForm({ date: "", kind: "Limpieza", technician: unit.technician, cost: "", findings: "", notes: "" });
  };

  const handleCreateRefLog = async () => {
    if (!refForm.date || !refForm.quantity) return;
    await createRefrigerantLog({ unitId, ...refForm });
    setShowRefForm(false);
    setRefForm({ date: "", refrigerantType: unit.refrigerantType, quantity: "", unit: "kg", technician: unit.technician, reason: "", notes: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>← Volver</Button>
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
            {unit.name}
            <StatusPill label={unit.status} tone={unit.status === "Operativo" ? "success" : unit.status === "Fuera de servicio" ? "danger" : "warning"} />
          </h2>
          <p className="text-sm text-neutral-500 dark:text-slate-400">
            {unit.code} • {unit.site}{unit.floor ? ` - ${unit.floor}` : ""}{unit.area ? ` (${unit.area})` : ""}
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-neutral-200 dark:border-slate-700">
        {(["info", "services", "refrigerant"] as const).map((tab) => (
          <button
            key={tab}
            className={`px-4 py-2 border-b-2 font-medium text-sm transition-colors ${activeTab === tab ? "border-cyan-500 text-cyan-700 dark:text-cyan-400" : "border-transparent text-neutral-500 hover:text-neutral-700 dark:text-slate-400"}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "info" ? "Ficha Técnica" : tab === "services" ? `Historial de Servicios (${unitServices.length})` : `Control Refrigerante (${refLogs.length})`}
          </button>
        ))}
      </div>

      {activeTab === "info" && (
        <SurfaceCard className="p-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { label: "Marca / Modelo", value: `${unit.brand || "N/A"} / ${unit.model || "N/A"}` },
              { label: "No. de Serie", value: unit.serial || "N/A" },
              { label: "Tipo de Equipo", value: unit.type },
              { label: "Capacidad (BTU/TR)", value: unit.capacityBtu || "N/A" },
              { label: "Eléctrico", value: `${unit.voltage || "N/A"} / ${unit.amperage || "N/A"}A` },
              { label: "Refrigerante Instalado", value: unit.refrigerantType || "N/A" },
              { label: "Técnico Responsable", value: unit.technician },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-neutral-500 dark:text-slate-400">{label}</p>
                <p className="font-medium text-neutral-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>
      )}

      {activeTab === "services" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-neutral-900 dark:text-white">Mantenimientos y Reparaciones</h3>
            <Button tone="cyan" onClick={() => setShowServiceForm(!showServiceForm)}>
              {showServiceForm ? "Cancelar" : "Nuevo Servicio"}
            </Button>
          </div>
          {showServiceForm && (
            <SurfaceCard className="p-5 border-cyan-200 dark:border-cyan-800">
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <InputField label="Fecha" type="date" value={serviceForm.date} onChange={(v) => setServiceForm({ ...serviceForm, date: v })} accent="cyan" />
                <SelectField label="Tipo de Servicio" value={serviceForm.kind} onChange={(v) => setServiceForm({ ...serviceForm, kind: v as AcServiceKind })} accent="cyan" options={[{ value: "Limpieza", label: "Limpieza" }, { value: "Preventivo", label: "Preventivo" }, { value: "Correctivo", label: "Correctivo" }, { value: "Reparacion", label: "Reparación" }, { value: "Recarga", label: "Recarga" }]} />
                <InputField label="Técnico" value={serviceForm.technician} onChange={(v) => setServiceForm({ ...serviceForm, technician: v })} accent="cyan" />
                <InputField label="Costo" value={serviceForm.cost} onChange={(v) => setServiceForm({ ...serviceForm, cost: v })} accent="cyan" placeholder="Ej. $150.00" />
              </div>
              <TextareaField label="Hallazgos" value={serviceForm.findings} onChange={(v) => setServiceForm({ ...serviceForm, findings: v })} accent="cyan" rows={2} />
              <div className="mt-4 flex justify-end">
                <Button tone="cyan" onClick={handleCreateService}>Guardar Servicio</Button>
              </div>
            </SurfaceCard>
          )}
          {unitServices.length === 0 ? (
            <p className="text-sm text-neutral-500 p-4 border rounded-lg text-center">No hay servicios registrados para este equipo.</p>
          ) : (
            <div className="space-y-3">
              {unitServices.map((svc) => (
                <SurfaceCard key={svc.id} className="p-4 flex flex-col sm:flex-row gap-4 justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-neutral-900 dark:text-white">{svc.date}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300">{svc.kind}</span>
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-slate-300 mb-2">{svc.findings || "Sin hallazgos documentados."}</p>
                    <p className="text-xs text-neutral-500">Técnico: {svc.technician}</p>
                  </div>
                  {svc.cost && <div className="text-right sm:text-left"><span className="text-sm font-semibold text-neutral-900 dark:text-white">{svc.cost}</span></div>}
                </SurfaceCard>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "refrigerant" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-neutral-900 dark:text-white">Log de Recargas de Refrigerante</h3>
            <Button tone="sky" onClick={() => setShowRefForm(!showRefForm)}>
              {showRefForm ? "Cancelar" : "Registrar Recarga"}
            </Button>
          </div>
          {showRefForm && (
            <SurfaceCard className="p-5 border-sky-200 dark:border-sky-800">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <InputField label="Fecha" type="date" value={refForm.date} onChange={(v) => setRefForm({ ...refForm, date: v })} accent="sky" />
                <InputField label="Tipo de Gas" value={refForm.refrigerantType} onChange={(v) => setRefForm({ ...refForm, refrigerantType: v })} accent="sky" />
                <div className="flex gap-2 items-end">
                  <div className="flex-1"><InputField label="Cantidad" type="number" step="0.1" value={refForm.quantity} onChange={(v) => setRefForm({ ...refForm, quantity: v })} accent="sky" /></div>
                  <div className="w-24"><SelectField label="Unidad" value={refForm.unit} onChange={(v) => setRefForm({ ...refForm, unit: v as "kg" | "lb" | "oz" })} accent="sky" options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }, { value: "oz", label: "oz" }]} /></div>
                </div>
                <InputField label="Motivo" value={refForm.reason} onChange={(v) => setRefForm({ ...refForm, reason: v })} accent="sky" />
                <InputField label="Técnico" value={refForm.technician} onChange={(v) => setRefForm({ ...refForm, technician: v })} accent="sky" />
              </div>
              <div className="mt-4 flex justify-end">
                <Button tone="sky" onClick={handleCreateRefLog}>Guardar Registro</Button>
              </div>
            </SurfaceCard>
          )}
          {refLogs.length === 0 ? (
            <p className="text-sm text-neutral-500 p-4 border rounded-lg text-center">No hay registros de refrigerante.</p>
          ) : (
            <div className="space-y-3">
              {refLogs.map((log) => (
                <SurfaceCard key={log.id} className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-neutral-900 dark:text-white">{log.date}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300">{log.refrigerantType}</span>
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-slate-300">Motivo: {log.reason}</p>
                    <p className="text-xs text-neutral-500 mt-1">Técnico: {log.technician}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-sky-600 dark:text-sky-400">+{log.quantity} {log.unit}</span>
                  </div>
                </SurfaceCard>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}