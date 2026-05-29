"use client";

import { useMemo, useState } from "react";
import { useAssetCenter } from "@/components/providers/asset-center-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAssets } from "@/hooks/useAssets";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";

const emptyOilType = {
  name: "",
  brand: "",
  viscosity: "",
  application: "",
  unit: "gal",
  stock: 0,
  minStock: 0,
  notes: "",
};

export function OilManagementPage() {
  const { confirmAction } = useFeedback();
  const { assets } = useAssets();
  const {
    oilTypes,
    oilChanges,
    createOilType,
    updateOilType,
    deleteOilType,
    createOilChange,
    deleteOilChange,
  } = useAssetCenter();

  const [editingOilTypeId, setEditingOilTypeId] = useState<string | null>(null);
  const [oilTypeForm, setOilTypeForm] = useState(emptyOilType);
  const [oilChangeForm, setOilChangeForm] = useState({
    assetId: assets[0]?.id ?? "",
    oilTypeId: oilTypes[0]?.id ?? "",
    date: new Date().toISOString().slice(0, 10),
    reading: 0,
    nextReading: 0,
    quantity: 0,
    technician: "",
    notes: "",
  });

  const lowStock = useMemo(() => oilTypes.filter((item) => item.stock <= item.minStock), [oilTypes]);

  const changeRows = useMemo(() => {
    return oilChanges
      .map((item) => {
        const asset = assets.find((assetEntry) => assetEntry.id === item.assetId);
        const oilType = oilTypes.find((oilEntry) => oilEntry.id === item.oilTypeId);
        return {
          ...item,
          assetCode: asset?.code ?? item.assetId,
          oilName: oilType?.name ?? item.oilTypeId,
        };
      })
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [assets, oilChanges, oilTypes]);

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Lubricacion"
        title="Aceites y cambios"
        subtitle="Controla tipos de aceite, stock minimo y registros de cambio por activo."
        accent="amber"
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Tipos de aceite" value={oilTypes.length.toString()} detail="Catalogo activo" tone="info" />
        <StatCard label="Stock bajo" value={lowStock.length.toString()} detail="Revisar reposicion" tone="warning" />
        <StatCard label="Cambios" value={oilChanges.length.toString()} detail="Historial acumulado" tone="success" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await confirmAction({
                title: editingOilTypeId ? "Actualizar tipo de aceite" : "Crear tipo de aceite",
                description:
                  "El catalogo de lubricacion se actualizara para dejar la base lista para backend real.",
                confirmLabel: editingOilTypeId ? "Confirmar actualizacion" : "Confirmar creacion",
                accent: "amber",
                successTitle: editingOilTypeId ? "Tipo actualizado" : "Tipo creado",
                successDescription: "El catalogo de aceite quedo actualizado correctamente.",
                summary: [
                  { label: "Nombre", value: oilTypeForm.name },
                  { label: "Marca", value: oilTypeForm.brand },
                  { label: "Viscosidad", value: oilTypeForm.viscosity },
                  { label: "Aplicacion", value: oilTypeForm.application },
                ],
                action: async () => {
                  if (editingOilTypeId) {
                    updateOilType(editingOilTypeId, oilTypeForm);
                  } else {
                    createOilType(oilTypeForm);
                  }
                  setEditingOilTypeId(null);
                  setOilTypeForm(emptyOilType);
                },
              });
            }}
          >
            <SurfaceCard className="p-5">
              <h2 className="text-lg font-semibold text-neutral-950">
                {editingOilTypeId ? "Editar tipo de aceite" : "Nuevo tipo de aceite"}
              </h2>
              <div className="mt-5 space-y-4">
                <InputField label="Nombre" value={oilTypeForm.name} onChange={(value) => setOilTypeForm((current) => ({ ...current, name: value }))} accent="amber" />
                <InputField label="Marca" value={oilTypeForm.brand} onChange={(value) => setOilTypeForm((current) => ({ ...current, brand: value }))} accent="amber" />
                <InputField label="Viscosidad" value={oilTypeForm.viscosity} onChange={(value) => setOilTypeForm((current) => ({ ...current, viscosity: value }))} accent="amber" />
                <InputField label="Aplicacion" value={oilTypeForm.application} onChange={(value) => setOilTypeForm((current) => ({ ...current, application: value }))} accent="amber" />
                <div className="grid gap-4 sm:grid-cols-3">
                  <InputField label="Unidad" value={oilTypeForm.unit} onChange={(value) => setOilTypeForm((current) => ({ ...current, unit: value }))} accent="amber" />
                  <InputField label="Stock" type="number" value={String(oilTypeForm.stock)} onChange={(value) => setOilTypeForm((current) => ({ ...current, stock: Number(value || "0") }))} accent="amber" />
                  <InputField label="Minimo" type="number" value={String(oilTypeForm.minStock)} onChange={(value) => setOilTypeForm((current) => ({ ...current, minStock: Number(value || "0") }))} accent="amber" />
                </div>
                <TextareaField label="Notas" value={oilTypeForm.notes} onChange={(value) => setOilTypeForm((current) => ({ ...current, notes: value }))} accent="amber" rows={4} />
                <div className="flex gap-3">
                  <Button type="submit" tone="amber" variant="solid">
                    {editingOilTypeId ? "Guardar cambios" : "Crear tipo"}
                  </Button>
                  {editingOilTypeId ? (
                    <Button
                      tone="neutral"
                      variant="outline"
                      onClick={() => {
                        setEditingOilTypeId(null);
                        setOilTypeForm(emptyOilType);
                      }}
                    >
                      Cancelar edicion
                    </Button>
                  ) : null}
                </div>
              </div>
            </SurfaceCard>
          </form>

          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const selectedAsset = assets.find((asset) => asset.id === oilChangeForm.assetId);
              const selectedOil = oilTypes.find((oil) => oil.id === oilChangeForm.oilTypeId);

              await confirmAction({
                title: "Registrar cambio de aceite",
                description:
                  "El historial de lubricacion del activo se actualizara con el nuevo servicio realizado.",
                confirmLabel: "Confirmar cambio",
                accent: "amber",
                successTitle: "Cambio registrado",
                successDescription: "El servicio de lubricacion ya forma parte del historial tecnico.",
                summary: [
                  { label: "Activo", value: selectedAsset ? `${selectedAsset.code} / ${selectedAsset.name}` : oilChangeForm.assetId },
                  { label: "Aceite", value: selectedOil?.name ?? oilChangeForm.oilTypeId },
                  { label: "Cantidad", value: `${oilChangeForm.quantity} ${selectedOil?.unit ?? "un"}` },
                  { label: "Lectura", value: `${oilChangeForm.reading} / proximo ${oilChangeForm.nextReading}` },
                ],
                action: async () => {
                  createOilChange(oilChangeForm);
                  setOilChangeForm((current) => ({
                    ...current,
                    reading: 0,
                    nextReading: 0,
                    quantity: 0,
                    technician: "",
                    notes: "",
                  }));
                },
              });
            }}
          >
            <SurfaceCard className="p-5">
              <h2 className="text-lg font-semibold text-neutral-950">Nuevo cambio de aceite</h2>
              <div className="mt-5 space-y-4">
                <SelectField label="Activo" value={oilChangeForm.assetId} onChange={(value) => setOilChangeForm((current) => ({ ...current, assetId: value }))} accent="amber" options={assets.map((asset) => ({ value: asset.id, label: `${asset.code} / ${asset.name}` }))} />
                <SelectField label="Tipo de aceite" value={oilChangeForm.oilTypeId} onChange={(value) => setOilChangeForm((current) => ({ ...current, oilTypeId: value }))} accent="amber" options={oilTypes.map((oil) => ({ value: oil.id, label: `${oil.name} / ${oil.viscosity}` }))} />
                <InputField label="Fecha" type="date" value={oilChangeForm.date} onChange={(value) => setOilChangeForm((current) => ({ ...current, date: value }))} accent="amber" />
                <div className="grid gap-4 sm:grid-cols-3">
                  <InputField label="Lectura" type="number" value={String(oilChangeForm.reading)} onChange={(value) => setOilChangeForm((current) => ({ ...current, reading: Number(value || "0") }))} accent="amber" />
                  <InputField label="Proxima lectura" type="number" value={String(oilChangeForm.nextReading)} onChange={(value) => setOilChangeForm((current) => ({ ...current, nextReading: Number(value || "0") }))} accent="amber" />
                  <InputField label="Cantidad" type="number" value={String(oilChangeForm.quantity)} onChange={(value) => setOilChangeForm((current) => ({ ...current, quantity: Number(value || "0") }))} accent="amber" />
                </div>
                <InputField label="Tecnico" value={oilChangeForm.technician} onChange={(value) => setOilChangeForm((current) => ({ ...current, technician: value }))} accent="amber" />
                <TextareaField label="Notas" value={oilChangeForm.notes} onChange={(value) => setOilChangeForm((current) => ({ ...current, notes: value }))} accent="amber" rows={4} />
                <Button type="submit" tone="amber" variant="solid">Registrar cambio</Button>
              </div>
            </SurfaceCard>
          </form>
        </div>

        <div className="space-y-4">
          <TableCard title="Catalogo de aceites" description="Base funcional de lubricantes con stock y acciones CRUD.">
            {oilTypes.length === 0 ? (
              <EmptyState title="Sin aceites" description="Todavia no hay tipos de aceite registrados." />
            ) : (
              <Table minWidth="min-w-[900px]">
                <TableHead>
                  <tr>
                    <th className="px-5 py-3 font-semibold">Nombre</th>
                    <th className="px-5 py-3 font-semibold">Marca</th>
                    <th className="px-5 py-3 font-semibold">Aplicacion</th>
                    <th className="px-5 py-3 font-semibold">Stock</th>
                    <th className="px-5 py-3 font-semibold">Acciones</th>
                  </tr>
                </TableHead>
                <TableBody>
                  {oilTypes.map((oil) => (
                    <tr key={oil.id} className="hover:bg-neutral-50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-neutral-950">{oil.name}</p>
                        <p className="mt-1 text-xs text-neutral-500">{oil.viscosity}</p>
                      </td>
                      <td className="px-5 py-4">{oil.brand}</td>
                      <td className="px-5 py-4">{oil.application}</td>
                      <td className="px-5 py-4">{oil.stock} {oil.unit}</td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <Button
                            tone="amber"
                            variant="outline"
                            className="px-3 py-1.5 text-xs"
                            onClick={() => {
                              setEditingOilTypeId(oil.id);
                              setOilTypeForm({
                                name: oil.name,
                                brand: oil.brand,
                                viscosity: oil.viscosity,
                                application: oil.application,
                                unit: oil.unit,
                                stock: oil.stock,
                                minStock: oil.minStock,
                                notes: oil.notes,
                              });
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            tone="danger"
                            variant="outline"
                            className="px-3 py-1.5 text-xs"
                            onClick={async () => {
                              await confirmAction({
                                title: "Eliminar tipo de aceite",
                description: "El aceite saldra del catalogo activo de la empresa.",
                                confirmLabel: "Eliminar tipo",
                                accent: "rose",
                                successTitle: "Tipo eliminado",
                                successDescription: "El catalogo se actualizo correctamente.",
                                summary: [
                                  { label: "Nombre", value: oil.name },
                                  { label: "Marca", value: oil.brand },
                                  { label: "Stock", value: `${oil.stock} ${oil.unit}` },
                                ],
                                action: async () => {
                                  deleteOilType(oil.id);
                                  if (editingOilTypeId === oil.id) {
                                    setEditingOilTypeId(null);
                                    setOilTypeForm(emptyOilType);
                                  }
                                },
                              });
                            }}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableCard>

          <TableCard title="Historial de cambios de aceite" description="Registro tecnico por activo, tipo y lectura de servicio.">
            <Table minWidth="min-w-[900px]">
              <TableHead>
                <tr>
                  <th className="px-5 py-3 font-semibold">Activo</th>
                  <th className="px-5 py-3 font-semibold">Aceite</th>
                  <th className="px-5 py-3 font-semibold">Fecha</th>
                  <th className="px-5 py-3 font-semibold">Lectura</th>
                  <th className="px-5 py-3 font-semibold">Acciones</th>
                </tr>
              </TableHead>
              <TableBody>
                {changeRows.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-4 font-semibold text-neutral-950">{item.assetCode}</td>
                    <td className="px-5 py-4">{item.oilName}</td>
                    <td className="px-5 py-4">{item.date}</td>
                    <td className="px-5 py-4">{item.reading} / proximo {item.nextReading}</td>
                    <td className="px-5 py-4">
                      <Button
                        tone="danger"
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        onClick={async () => {
                          await confirmAction({
                            title: "Eliminar cambio de aceite",
                            description: "El registro tecnico se retirara del historial del activo.",
                            confirmLabel: "Eliminar registro",
                            accent: "rose",
                            successTitle: "Registro eliminado",
                            successDescription: "El historial tecnico se actualizo correctamente.",
                            summary: [
                              { label: "Activo", value: item.assetCode },
                              { label: "Aceite", value: item.oilName },
                              { label: "Fecha", value: item.date },
                            ],
                            action: async () => {
                              deleteOilChange(item.id);
                            },
                          });
                        }}
                      >
                        Eliminar
                      </Button>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </div>
      </section>
    </div>
  );
}
