"use client";

import { useMemo, useState } from "react";
import { useAssetCenter } from "@/components/providers/asset-center-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAssets } from "@/hooks/useAssets";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import type { AssetDocumentStatus } from "@/types/activo";

const emptyForm: {
  assetId: string;
  insurer: string;
  policyNumber: string;
  coverage: string;
  startDate: string;
  endDate: string;
  status: AssetDocumentStatus;
  notes: string;
} = {
  assetId: "",
  insurer: "",
  policyNumber: "",
  coverage: "",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  status: "Vigente",
  notes: "",
};

export function InsuranceManagementPage() {
  const { assets } = useAssets();
  const { confirmAction } = useFeedback();
  const { insurancePolicies, createInsurancePolicy, updateInsurancePolicy, deleteInsurancePolicy } = useAssetCenter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm, assetId: assets[0]?.id ?? "" });
  const rows = useMemo(() => insurancePolicies.map((item) => ({ ...item, asset: assets.find((asset) => asset.id === item.assetId) })), [assets, insurancePolicies]);

  return (
    <div className="space-y-6">
      <ModulePageHeader badge="Gestion" title="Seguros vehiculares" subtitle="Control central de polizas por vehiculo con alta, edicion y baja bajo confirmacion global." accent="sky" />
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Polizas" value={insurancePolicies.length.toString()} detail="Base vigente de la empresa" tone="info" />
        <StatCard label="Vigentes" value={insurancePolicies.filter((item) => item.status === "Vigente").length.toString()} detail="Cobertura operativa" tone="success" />
        <StatCard label="Por vencer" value={insurancePolicies.filter((item) => item.status === "Por vencer").length.toString()} detail="Atencion prioritaria" tone="warning" />
      </section>
      <section className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); const selectedAsset = assets.find((item) => item.id === form.assetId); await confirmAction({ title: editingId ? "Actualizar seguro vehicular" : "Crear seguro vehicular", description: "La poliza quedara visible en el control central de seguros.", confirmLabel: editingId ? "Guardar seguro" : "Crear seguro", accent: "sky", successTitle: editingId ? "Seguro actualizado" : "Seguro creado", successDescription: "La poliza ya forma parte del control de seguros.", summary: [{ label: "Vehiculo", value: selectedAsset ? `${selectedAsset.plate} / ${selectedAsset.brand} ${selectedAsset.model}` : form.assetId }, { label: "Aseguradora", value: form.insurer }, { label: "Poliza", value: form.policyNumber }, { label: "Estado", value: form.status }], action: async () => { if (editingId) { updateInsurancePolicy(editingId, form); } else { createInsurancePolicy(form); } setEditingId(null); setForm({ ...emptyForm, assetId: assets[0]?.id ?? "" }); } }); }}>
          <SurfaceCard className="p-5">
            <h2 className="text-lg font-semibold text-neutral-950">{editingId ? "Editar poliza" : "Nueva poliza"}</h2>
            <div className="mt-5 space-y-4">
              <SelectField label="Vehiculo" value={form.assetId} onChange={(value) => setForm((current) => ({ ...current, assetId: value }))} accent="sky" options={assets.map((asset) => ({ value: asset.id, label: `${asset.plate} / ${asset.brand} ${asset.model}` }))} />
              <InputField label="Compania" value={form.insurer} onChange={(value) => setForm((current) => ({ ...current, insurer: value }))} accent="sky" />
              <InputField label="Poliza" value={form.policyNumber} onChange={(value) => setForm((current) => ({ ...current, policyNumber: value }))} accent="sky" />
              <InputField label="Cobertura" value={form.coverage} onChange={(value) => setForm((current) => ({ ...current, coverage: value }))} accent="sky" />
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Inicio" type="date" value={form.startDate} onChange={(value) => setForm((current) => ({ ...current, startDate: value }))} accent="sky" />
                <InputField label="Vencimiento" type="date" value={form.endDate} onChange={(value) => setForm((current) => ({ ...current, endDate: value }))} accent="sky" />
              </div>
              <SelectField label="Estado" value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value as AssetDocumentStatus }))} accent="sky" options={[{ value: "Vigente", label: "Vigente" }, { value: "Por vencer", label: "Por vencer" }, { value: "Vencido", label: "Vencido" }]} />
              <TextareaField label="Notas" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} accent="sky" rows={4} />
              <div className="flex gap-3">
                <Button type="submit" tone="sky" variant="solid">{editingId ? "Guardar cambios" : "Crear seguro"}</Button>
                {editingId ? <Button type="button" tone="neutral" variant="outline" onClick={() => { setEditingId(null); setForm({ ...emptyForm, assetId: assets[0]?.id ?? "" }); }}>Cancelar</Button> : null}
              </div>
            </div>
          </SurfaceCard>
        </form>
        <TableCard title="Polizas registradas" description="Visibilidad centralizada de seguros por vehiculo.">
          {rows.length === 0 ? <EmptyState title="Sin polizas" description="Todavia no hay seguros registrados para la flota activa." /> : (
            <Table minWidth="min-w-[980px]">
              <TableHead><tr><th className="px-5 py-3 font-semibold">Vehiculo</th><th className="px-5 py-3 font-semibold">Compania</th><th className="px-5 py-3 font-semibold">Poliza</th><th className="px-5 py-3 font-semibold">Vence</th><th className="px-5 py-3 font-semibold">Estado</th><th className="px-5 py-3 font-semibold">Acciones</th></tr></TableHead>
              <TableBody>
                {rows.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-4"><p className="font-semibold text-neutral-950">{item.asset?.plate ?? item.assetId}</p><p className="mt-1 text-xs text-neutral-500">{item.asset ? `${item.asset.brand} ${item.asset.model}` : "Vehiculo"}</p></td>
                    <td className="px-5 py-4">{item.insurer}</td>
                    <td className="px-5 py-4">{item.policyNumber}</td>
                    <td className="px-5 py-4">{item.endDate}</td>
                    <td className="px-5 py-4"><StatusPill label={item.status} tone={item.status === "Vigente" ? "success" : item.status === "Por vencer" ? "warning" : "danger"} /></td>
                    <td className="px-5 py-4"><div className="flex gap-2"><Button tone="sky" variant="outline" className="px-3 py-1.5 text-xs" onClick={() => { setEditingId(item.id); setForm({ assetId: item.assetId, insurer: item.insurer, policyNumber: item.policyNumber, coverage: item.coverage, startDate: item.startDate, endDate: item.endDate, status: item.status, notes: item.notes }); }}>Editar</Button><Button tone="danger" variant="outline" className="px-3 py-1.5 text-xs" onClick={async () => { await confirmAction({ title: "Eliminar poliza", description: "La poliza se retirara del control central de seguros.", confirmLabel: "Eliminar poliza", accent: "rose", successTitle: "Poliza eliminada", successDescription: "La base de seguros ya fue actualizada.", summary: [{ label: "Vehiculo", value: item.asset?.plate ?? item.assetId }, { label: "Compania", value: item.insurer }, { label: "Poliza", value: item.policyNumber }], action: async () => { deleteInsurancePolicy(item.id); } }); }}>Eliminar</Button></div></td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </section>
    </div>
  );
}
