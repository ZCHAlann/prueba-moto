"use client";

import { useState } from "react";
import { useAssetCenter } from "@/components/providers/asset-center-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import type { OdometerUnit } from "@/types/activo";

type AssetTechnicalPanelProps = {
  assetId: string;
};

export function AssetTechnicalPanel({ assetId }: AssetTechnicalPanelProps) {
  const { confirmAction } = useFeedback();
  const {
    odometerRecords,
    oilTypes,
    oilChanges,
    createOdometerRecord,
    deleteOdometerRecord,
    createOilChange,
    deleteOilChange,
  } = useAssetCenter();

  const relatedOdometer = odometerRecords.filter((item) => item.assetId === assetId);
  const relatedOilChanges = oilChanges.filter((item) => item.assetId === assetId);

  const [odometerForm, setOdometerForm] = useState({
    assetId,
    recordedAt: new Date().toISOString().slice(0, 10),
    reading: 0,
    unit: "Kilometraje" as OdometerUnit,
    source: "Control operativo",
    notes: "",
  });

  const [oilChangeForm, setOilChangeForm] = useState({
    assetId,
    oilTypeId: oilTypes[0]?.id ?? "",
    date: new Date().toISOString().slice(0, 10),
    reading: 0,
    nextReading: 0,
    quantity: 0,
    technician: "",
    notes: "",
  });

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-2">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            await confirmAction({
              title: "Registrar lectura",
              description: "La lectura de kilometraje u horometro se agregara al historial tecnico del activo.",
              confirmLabel: "Guardar lectura",
              accent: "sky",
              successTitle: "Lectura registrada",
              successDescription: "El historial tecnico fue actualizado correctamente.",
              summary: [
                { label: "Unidad", value: odometerForm.unit },
                { label: "Lectura", value: odometerForm.reading.toString() },
                { label: "Fuente", value: odometerForm.source },
                { label: "Fecha", value: odometerForm.recordedAt },
              ],
              action: async () => {
                createOdometerRecord(odometerForm);
                setOdometerForm((current) => ({ ...current, reading: 0, notes: "" }));
              },
            });
          }}
        >
          <SurfaceCard className="p-5">
            <h2 className="text-lg font-semibold text-neutral-950">Kilometraje / horometro</h2>
            <div className="mt-5 space-y-4">
              <SelectField label="Unidad" value={odometerForm.unit} onChange={(value) => setOdometerForm((current) => ({ ...current, unit: value as typeof odometerForm.unit }))} accent="sky" options={[{ value: "Kilometraje", label: "Kilometraje" }, { value: "Horometro", label: "Horometro" }]} />
              <InputField label="Fecha" type="date" value={odometerForm.recordedAt} onChange={(value) => setOdometerForm((current) => ({ ...current, recordedAt: value }))} accent="sky" />
              <InputField label="Lectura" type="number" value={String(odometerForm.reading)} onChange={(value) => setOdometerForm((current) => ({ ...current, reading: Number(value || "0") }))} accent="sky" />
              <InputField label="Fuente" value={odometerForm.source} onChange={(value) => setOdometerForm((current) => ({ ...current, source: value }))} accent="sky" />
              <TextareaField label="Notas" value={odometerForm.notes} onChange={(value) => setOdometerForm((current) => ({ ...current, notes: value }))} accent="sky" rows={4} />
              <Button type="submit" tone="sky" variant="solid">Registrar lectura</Button>
            </div>
          </SurfaceCard>
        </form>

        <TableCard title="Lecturas recientes" description="Trazabilidad del uso del activo para control tecnico y combustible.">
          <Table minWidth="min-w-[860px]">
            <TableHead>
              <tr>
                <th className="px-5 py-3 font-semibold">Fecha</th>
                <th className="px-5 py-3 font-semibold">Lectura</th>
                <th className="px-5 py-3 font-semibold">Fuente</th>
                <th className="px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </TableHead>
            <TableBody>
              {relatedOdometer.map((item) => (
                <tr key={item.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-4">{item.recordedAt}</td>
                  <td className="px-5 py-4 font-semibold text-neutral-950">{item.reading} / {item.unit}</td>
                  <td className="px-5 py-4">{item.source}</td>
                  <td className="px-5 py-4">
                    <Button tone="danger" variant="outline" className="px-3 py-1.5 text-xs" onClick={async () => { await confirmAction({ title: "Eliminar lectura", description: "La lectura se retirara del historial tecnico del activo.", confirmLabel: "Eliminar lectura", accent: "rose", successTitle: "Lectura eliminada", successDescription: "El historial tecnico ya fue actualizado.", summary: [{ label: "Lectura", value: `${item.reading} / ${item.unit}` }, { label: "Fecha", value: item.recordedAt }, { label: "Fuente", value: item.source }], action: async () => { deleteOdometerRecord(item.id); } }); }}>Eliminar</Button>
                  </td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const selectedOil = oilTypes.find((oil) => oil.id === oilChangeForm.oilTypeId);
            await confirmAction({
              title: "Registrar cambio de aceite",
              description: "El servicio de lubricacion se agregara al historial tecnico del activo.",
              confirmLabel: "Guardar servicio",
              accent: "sky",
              successTitle: "Cambio registrado",
              successDescription: "El historial de lubricacion se actualizo correctamente.",
              summary: [
                { label: "Aceite", value: selectedOil?.name ?? oilChangeForm.oilTypeId },
                { label: "Cantidad", value: `${oilChangeForm.quantity} ${selectedOil?.unit ?? "un"}` },
                { label: "Lectura", value: `${oilChangeForm.reading} / proximo ${oilChangeForm.nextReading}` },
                { label: "Tecnico", value: oilChangeForm.technician },
              ],
              action: async () => {
                createOilChange(oilChangeForm);
                setOilChangeForm((current) => ({ ...current, reading: 0, nextReading: 0, quantity: 0, technician: "", notes: "" }));
              },
            });
          }}
        >
          <SurfaceCard className="p-5">
            <h2 className="text-lg font-semibold text-neutral-950">Cambios de aceite</h2>
            <div className="mt-5 space-y-4">
              <SelectField label="Tipo de aceite" value={oilChangeForm.oilTypeId} onChange={(value) => setOilChangeForm((current) => ({ ...current, oilTypeId: value }))} accent="sky" options={oilTypes.map((oil) => ({ value: oil.id, label: `${oil.name} / ${oil.viscosity}` }))} />
              <InputField label="Fecha" type="date" value={oilChangeForm.date} onChange={(value) => setOilChangeForm((current) => ({ ...current, date: value }))} accent="sky" />
              <div className="grid gap-4 sm:grid-cols-3">
                <InputField label="Lectura" type="number" value={String(oilChangeForm.reading)} onChange={(value) => setOilChangeForm((current) => ({ ...current, reading: Number(value || "0") }))} accent="sky" />
                <InputField label="Proxima lectura" type="number" value={String(oilChangeForm.nextReading)} onChange={(value) => setOilChangeForm((current) => ({ ...current, nextReading: Number(value || "0") }))} accent="sky" />
                <InputField label="Cantidad" type="number" value={String(oilChangeForm.quantity)} onChange={(value) => setOilChangeForm((current) => ({ ...current, quantity: Number(value || "0") }))} accent="sky" />
              </div>
              <InputField label="Tecnico" value={oilChangeForm.technician} onChange={(value) => setOilChangeForm((current) => ({ ...current, technician: value }))} accent="sky" />
              <TextareaField label="Notas" value={oilChangeForm.notes} onChange={(value) => setOilChangeForm((current) => ({ ...current, notes: value }))} accent="sky" rows={4} />
              <Button type="submit" tone="sky" variant="solid">Registrar cambio</Button>
            </div>
          </SurfaceCard>
        </form>

        <TableCard title="Historial de lubricacion" description="Servicios, lecturas y accion directa sobre cada cambio de aceite.">
          <Table minWidth="min-w-[860px]">
            <TableHead>
              <tr>
                <th className="px-5 py-3 font-semibold">Fecha</th>
                <th className="px-5 py-3 font-semibold">Aceite</th>
                <th className="px-5 py-3 font-semibold">Lecturas</th>
                <th className="px-5 py-3 font-semibold">Tecnico</th>
                <th className="px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </TableHead>
            <TableBody>
              {relatedOilChanges.map((item) => {
                const oilType = oilTypes.find((oil) => oil.id === item.oilTypeId);
                return (
                  <tr key={item.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-4">{item.date}</td>
                    <td className="px-5 py-4 font-semibold text-neutral-950">{oilType?.name ?? item.oilTypeId}</td>
                    <td className="px-5 py-4">{item.reading} / proximo {item.nextReading}</td>
                    <td className="px-5 py-4">{item.technician}</td>
                    <td className="px-5 py-4">
                      <Button tone="danger" variant="outline" className="px-3 py-1.5 text-xs" onClick={async () => { await confirmAction({ title: "Eliminar cambio de aceite", description: "El registro se retirara del historial tecnico del activo.", confirmLabel: "Eliminar registro", accent: "rose", successTitle: "Registro eliminado", successDescription: "El historial tecnico ya fue actualizado.", summary: [{ label: "Fecha", value: item.date }, { label: "Aceite", value: oilType?.name ?? item.oilTypeId }, { label: "Tecnico", value: item.technician }], action: async () => { deleteOilChange(item.id); } }); }}>Eliminar</Button>
                    </td>
                  </tr>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      </section>
    </div>
  );
}
