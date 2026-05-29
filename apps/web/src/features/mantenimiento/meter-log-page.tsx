"use client";

import { useState } from "react";
import { useAssetCenter } from "@/components/providers/asset-center-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { StatCard, SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import type { OdometerUnit } from "@/types/activo";
import { useAssets } from "@/hooks/useAssets";

export function MeterLogPage() {
  const { assets } = useAssets();
  const { confirmAction } = useFeedback();
  const { odometerRecords, createOdometerRecord, deleteOdometerRecord } = useAssetCenter();
  const [form, setForm] = useState({
    assetId: assets[0]?.id ?? "",
    recordedAt: new Date().toISOString().slice(0, 10),
    reading: 0,
    unit: "Kilometraje" as OdometerUnit,
    source: "Control operativo",
    notes: "",
  });

  return (
    <div className="space-y-6">
      <ModulePageHeader badge="Mantenimiento" title="Kilometraje / horometro" subtitle="Lecturas centralizadas para control tecnico, consumo y mantenimientos por uso real." accent="amber" />
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Lecturas" value={odometerRecords.length.toString()} detail="Historial acumulado" tone="info" />
        <StatCard label="Kilometraje" value={odometerRecords.filter((item) => item.unit === "Kilometraje").length.toString()} detail="Registros por odometro" tone="success" />
        <StatCard label="Horometro" value={odometerRecords.filter((item) => item.unit === "Horometro").length.toString()} detail="Registros por horas" tone="warning" />
      </section>
      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); const vehicle = assets.find((item) => item.id === form.assetId); await confirmAction({ title: "Registrar lectura", description: "La lectura quedara disponible para control tecnico y mantenimiento.", confirmLabel: "Guardar lectura", accent: "amber", successTitle: "Lectura registrada", successDescription: "El control tecnico ya fue actualizado.", summary: [{ label: "Unidad", value: vehicle ? `${vehicle.plate} / ${vehicle.brand} ${vehicle.model}` : form.assetId }, { label: "Tipo", value: form.unit }, { label: "Lectura", value: form.reading.toString() }, { label: "Fecha", value: form.recordedAt }], action: async () => { createOdometerRecord(form); setForm((current) => ({ ...current, reading: 0, notes: "" })); } }); }}>
          <SurfaceCard className="p-5">
            <h2 className="text-lg font-semibold text-neutral-950">Nueva lectura</h2>
            <div className="mt-5 space-y-4">
              <SelectField label="Vehiculo" value={form.assetId} onChange={(value) => setForm((current) => ({ ...current, assetId: value }))} accent="amber" options={assets.map((asset) => ({ value: asset.id, label: `${asset.plate} / ${asset.brand} ${asset.model}` }))} />
              <SelectField label="Tipo" value={form.unit} onChange={(value) => setForm((current) => ({ ...current, unit: value as OdometerUnit }))} accent="amber" options={[{ value: "Kilometraje", label: "Kilometraje" }, { value: "Horometro", label: "Horometro" }]} />
              <InputField label="Fecha" type="date" value={form.recordedAt} onChange={(value) => setForm((current) => ({ ...current, recordedAt: value }))} accent="amber" />
              <InputField label="Lectura" type="number" value={String(form.reading)} onChange={(value) => setForm((current) => ({ ...current, reading: Number(value || "0") }))} accent="amber" />
              <InputField label="Fuente" value={form.source} onChange={(value) => setForm((current) => ({ ...current, source: value }))} accent="amber" />
              <TextareaField label="Notas" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} accent="amber" rows={4} />
              <Button type="submit" tone="amber" variant="solid">Guardar lectura</Button>
            </div>
          </SurfaceCard>
        </form>
        <TableCard title="Historial de lecturas" description="Lecturas recientes por unidad con accion directa de eliminacion.">
          <Table minWidth="min-w-[980px]">
            <TableHead><tr><th className="px-5 py-3 font-semibold">Vehiculo</th><th className="px-5 py-3 font-semibold">Fecha</th><th className="px-5 py-3 font-semibold">Lectura</th><th className="px-5 py-3 font-semibold">Fuente</th><th className="px-5 py-3 font-semibold">Acciones</th></tr></TableHead>
            <TableBody>
              {odometerRecords.map((item) => {
                const asset = assets.find((entry) => entry.id === item.assetId);
                return (
                  <tr key={item.id} className="hover:bg-neutral-50"><td className="px-5 py-4"><p className="font-semibold text-neutral-950">{asset?.plate ?? item.assetId}</p><p className="mt-1 text-xs text-neutral-500">{asset ? `${asset.brand} ${asset.model}` : "Unidad"}</p></td><td className="px-5 py-4">{item.recordedAt}</td><td className="px-5 py-4">{item.reading} / {item.unit}</td><td className="px-5 py-4">{item.source}</td><td className="px-5 py-4"><Button tone="danger" variant="outline" className="px-3 py-1.5 text-xs" onClick={async () => { await confirmAction({ title: "Eliminar lectura", description: "La lectura se retirara del historial tecnico.", confirmLabel: "Eliminar lectura", accent: "rose", successTitle: "Lectura eliminada", successDescription: "El historial tecnico ya fue actualizado.", summary: [{ label: "Vehiculo", value: asset?.plate ?? item.assetId }, { label: "Lectura", value: `${item.reading} / ${item.unit}` }, { label: "Fecha", value: item.recordedAt }], action: async () => { deleteOdometerRecord(item.id); } }); }}>Eliminar</Button></td></tr>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      </section>
    </div>
  );
}
