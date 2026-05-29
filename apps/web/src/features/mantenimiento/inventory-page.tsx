"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useInventory } from "@/hooks/useInventory";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/ui/form-controls";
import { StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";

export function InventoryPage() {
  const { confirmAction } = useFeedback();
  const { inventory, createItem } = useInventory();
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "",
    stock: 0,
    minStock: 0,
    location: "",
    unit: "un",
  });

  const lowStock = useMemo(() => inventory.filter((item) => item.stock <= item.minStock), [inventory]);

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Inventario"
        title="Repuestos e inventario"
        subtitle="Controla repuestos con validacion, confirmacion y visibilidad de stock minimo."
        accent="amber"
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Items" value={inventory.length.toString()} detail="Base actual registrada" tone="info" />
        <StatCard label="Stock bajo" value={lowStock.length.toString()} detail="Requiere reposicion" tone="warning" />
        <StatCard label="Ubicaciones" value={new Set(inventory.map((item) => item.location)).size.toString()} detail="Cobertura de bodegas" tone="success" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <SurfaceCard className="p-5">
          <h2 className="text-lg font-semibold text-neutral-950">Nuevo repuesto</h2>
          <div className="mt-5 space-y-4">
            <InputField label="Codigo" value={form.code} onChange={(value) => setForm((current) => ({ ...current, code: value }))} accent="amber" />
            <InputField label="Nombre" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} accent="amber" />
            <InputField label="Categoria" value={form.category} onChange={(value) => setForm((current) => ({ ...current, category: value }))} accent="amber" />
            <div className="grid gap-4 sm:grid-cols-3">
              <InputField label="Stock" type="number" value={String(form.stock)} onChange={(value) => setForm((current) => ({ ...current, stock: Number(value || "0") }))} accent="amber" />
              <InputField label="Minimo" type="number" value={String(form.minStock)} onChange={(value) => setForm((current) => ({ ...current, minStock: Number(value || "0") }))} accent="amber" />
              <InputField label="Unidad" value={form.unit} onChange={(value) => setForm((current) => ({ ...current, unit: value }))} accent="amber" />
            </div>
            <InputField label="Ubicacion" value={form.location} onChange={(value) => setForm((current) => ({ ...current, location: value }))} accent="amber" />
            <Button
              tone="amber"
              variant="solid"
              onClick={async () => {
                await confirmAction({
                  title: "Guardar repuesto",
                  description: "El item se agregara al inventario de la empresa y quedara disponible para control de stock.",
                  confirmLabel: "Confirmar registro",
                  accent: "amber",
                  successTitle: "Repuesto guardado",
                  successDescription: "El inventario ya refleja el nuevo item.",
                  summary: [
                    { label: "Codigo", value: form.code },
                    { label: "Nombre", value: form.name },
                    { label: "Categoria", value: form.category },
                    { label: "Stock", value: `${form.stock} ${form.unit}` },
                  ],
                  action: async () => {
                    await createItem({
                      code: form.code,
                      name: form.name,
                      category: form.category,
                      stock: form.stock,
                      minStock: form.minStock,
                      location: form.location,
                      unit: form.unit,
                    });
                    setForm({ code: "", name: "", category: "", stock: 0, minStock: 0, location: "", unit: "un" });
                  },
                });
              }}
            >
              Guardar repuesto
            </Button>
          </div>
        </SurfaceCard>

        <TableCard title="Inventario actual" description="Stock, categoria y ubicacion visibles para planificacion de taller.">
          <Table minWidth="min-w-[860px]">
            <TableHead>
              <tr>
                <th className="px-5 py-3 font-semibold">Codigo</th>
                <th className="px-5 py-3 font-semibold">Nombre</th>
                <th className="px-5 py-3 font-semibold">Categoria</th>
                <th className="px-5 py-3 font-semibold">Stock</th>
                <th className="px-5 py-3 font-semibold">Ubicacion</th>
              </tr>
            </TableHead>
            <TableBody>
              {inventory.map((item) => (
                <tr key={item.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-4 font-semibold text-neutral-950">{item.code}</td>
                  <td className="px-5 py-4">{item.name}</td>
                  <td className="px-5 py-4">{item.category}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span>{item.stock} {item.unit}</span>
                      {item.stock <= item.minStock ? <StatusPill label="Bajo" tone="warning" /> : null}
                    </div>
                  </td>
                  <td className="px-5 py-4">{item.location}</td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      </section>
    </div>
  );
}