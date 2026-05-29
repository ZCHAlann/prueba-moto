"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAssets } from "@/hooks/useAssets";
import { useFuel } from "@/hooks/useFuel";
import { Button } from "@/components/ui/button";
import { DataExportToolbar, type ExportColumn, type ExportRow } from "@/components/ui/data-export-toolbar";
import { InputField, SelectField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";

const exportColumns: ExportColumn[] = [
  { key: "plate", label: "Placa" },
  { key: "unit", label: "Unidad" },
  { key: "date", label: "Fecha" },
  { key: "liters", label: "Litros" },
  { key: "cost", label: "Costo" },
  { key: "station", label: "Estacion" },
  { key: "odometer", label: "Odometro" },
];

export function FuelPage() {
  const { confirmAction } = useFeedback();

  // ── hooks nuevos ─────────────────────────────────────────────────────────────
  const { assets, loading: assetsLoading } = useAssets();
  const { fuelEntries, loading: fuelLoading, createFuelEntry } = useFuel();

  const loading = assetsLoading || fuelLoading;

  const [query, setQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    assetId: "",
    date: new Date().toISOString().slice(0, 10),
    liters: 0,
    cost: 0,
    odometer: 0,
    station: "",
  });

  const openModal = () => {
    setForm((c) => ({ ...c, assetId: assets[0]?.id ?? "" }));
    setIsModalOpen(true);
  };

  const totalLiters = fuelEntries.reduce((acc, e) => acc + e.liters, 0);
  const totalCost = fuelEntries.reduce((acc, e) => acc + e.cost, 0);

  const performance = useMemo(() => {
    return assets
      .map((asset) => {
        const entries = fuelEntries.filter((e) => e.assetId === asset.id);
        const liters = entries.reduce((acc, e) => acc + e.liters, 0);
        const cost = entries.reduce((acc, e) => acc + e.cost, 0);
        return {
          assetId: asset.id,
          label: asset.plate,
          unit: `${asset.brand} ${asset.model}`,
          liters,
          avgCost: liters > 0 ? cost / liters : 0,
        };
      })
      .filter((item) => item.liters > 0)
      .sort((a, b) => b.liters - a.liters)
      .slice(0, 4);
  }, [assets, fuelEntries]);

  const rows = useMemo(() => {
    return fuelEntries
      .map((entry) => {
        const asset = assets.find((a) => a.id === entry.assetId);
        return {
          id: entry.id,
          plate: asset?.plate ?? entry.assetId,
          unit: asset ? `${asset.brand} ${asset.model}` : entry.assetId,
          date: entry.date,
          liters: `${entry.liters} L`,
          cost: `${entry.cost.toFixed(2)} USD`,
          station: entry.station,
          odometer: entry.odometer,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [assets, fuelEntries]);

  const filteredRows = useMemo(() => {
    const value = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        value.length === 0 ||
        row.plate.toLowerCase().includes(value) ||
        row.unit.toLowerCase().includes(value) ||
        row.station.toLowerCase().includes(value) ||
        String(row.date).toLowerCase().includes(value)
    );
  }, [query, rows]);

  if (loading) {
    return (
      <div className="space-y-4">
        <ModulePageHeader badge="Combustible" title="Combustible" subtitle="Cargando registros…" accent="orange" />
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Combustible"
        title="Combustible"
        subtitle="Registro de cargas y lectura de rendimiento bajo una vista compacta y operativa."
        accent="orange"
      />

      <section className="grid gap-3 md:grid-cols-3">
        <StatCard label="Registros" value={fuelEntries.length.toString()} detail="Cargas registradas" tone="info" />
        <StatCard label="Litros" value={totalLiters.toFixed(0)} detail="Consumo acumulado" tone="warning" />
        <StatCard label="Costo" value={`${totalCost.toFixed(2)} USD`} detail="Valor consolidado" tone="success" />
      </section>

      {performance.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {performance.map((item) => (
            <SurfaceCard key={item.assetId} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-950">{item.unit}</p>
                </div>
                <p className="text-xl font-bold text-neutral-950">{item.liters} L</p>
              </div>
              <p className="mt-2 text-xs text-neutral-500">Promedio {item.avgCost.toFixed(2)} USD/L</p>
            </SurfaceCard>
          ))}
        </div>
      ) : null}

      <TableCard
        title="Historial de combustible"
        description="Consulta, exporta y registra nuevas cargas sin perder espacio visual."
      >
        <DataExportToolbar
          title="combustible-apli-smart-motors"
          columns={exportColumns}
          rows={filteredRows as ExportRow[]}
          accent="orange"
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Buscar por placa, unidad o estacion"
          leadingContent={
            <Button tone="orange" variant="solid" onClick={openModal} className="px-3 py-2">
              Nuevo registro
            </Button>
          }
        />

        {filteredRows.length === 0 ? (
          <EmptyState title="Sin registros" description="No hay cargas para el filtro aplicado." />
        ) : (
          <Table minWidth="min-w-[980px]">
            <TableHead>
              <tr>
                <th className="px-4 py-3 font-semibold">Vehiculo</th>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Litros</th>
                <th className="px-4 py-3 font-semibold">Costo</th>
                <th className="px-4 py-3 font-semibold">Estacion</th>
                <th className="px-4 py-3 font-semibold">Odometro</th>
              </tr>
            </TableHead>
            <TableBody>
              {filteredRows.map((entry) => (
                <tr key={entry.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{entry.plate}</p>
                    <p className="mt-1 text-xs text-neutral-500">{entry.unit}</p>
                  </td>
                  <td className="px-4 py-3.5">{entry.date}</td>
                  <td className="px-4 py-3.5">{entry.liters}</td>
                  <td className="px-4 py-3.5">{entry.cost}</td>
                  <td className="px-4 py-3.5">{entry.station}</td>
                  <td className="px-4 py-3.5">{entry.odometer}</td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>

      {isModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/45 px-4 py-6 backdrop-blur-sm">
          <SurfaceCard className="w-full max-w-2xl overflow-hidden border-neutral-200">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
              <div>
                <h2 className="text-2xl font-bold text-neutral-950">Nuevo registro de combustible</h2>
                <p className="mt-1 text-sm text-neutral-500">Carga litros, costo y lectura en un formulario corto y claro.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-50"
              >
                Cerrar
              </button>
            </div>

            <form
              className="space-y-4 px-5 py-5"
              onSubmit={async (event) => {
                event.preventDefault();
                const selectedAsset = assets.find((a) => a.id === form.assetId);

                await confirmAction({
                  title: "Registrar consumo",
                  description: "Se guardara el abastecimiento del vehiculo y el rendimiento quedara visible en el historial.",
                  confirmLabel: "Confirmar registro",
                  accent: "orange",
                  successTitle: "Consumo registrado",
                  successDescription: "La carga ya forma parte del historial operativo.",
                  summary: [
                    { label: "Vehiculo", value: selectedAsset ? `${selectedAsset.plate} / ${selectedAsset.brand} ${selectedAsset.model}` : form.assetId },
                    { label: "Litros", value: `${form.liters} L` },
                    { label: "Costo", value: `${form.cost.toFixed(2)} USD` },
                    { label: "Lectura", value: form.odometer.toString() },
                  ],
                  action: async () => {
                    await createFuelEntry(form);
                    setForm((c) => ({ ...c, liters: 0, cost: 0, odometer: 0, station: "" }));
                    setIsModalOpen(false);
                  },
                });
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  label="Vehiculo"
                  value={form.assetId}
                  onChange={(v) => setForm((c) => ({ ...c, assetId: v }))}
                  accent="orange"
                  options={assets.map((a) => ({ value: a.id, label: `${a.plate} / ${a.brand} ${a.model}` }))}
                  className="md:col-span-2"
                />
                <InputField label="Fecha" type="date" value={form.date} onChange={(v) => setForm((c) => ({ ...c, date: v }))} accent="orange" />
                <InputField label="Estacion" value={form.station} onChange={(v) => setForm((c) => ({ ...c, station: v }))} accent="orange" />
                <InputField label="Litros" type="number" value={String(form.liters)} onChange={(v) => setForm((c) => ({ ...c, liters: Number(v || "0") }))} accent="orange" />
                <InputField label="Costo" type="number" value={String(form.cost)} onChange={(v) => setForm((c) => ({ ...c, cost: Number(v || "0") }))} accent="orange" />
                <InputField label="Odometro / horometro" type="number" value={String(form.odometer)} onChange={(v) => setForm((c) => ({ ...c, odometer: Number(v || "0") }))} accent="orange" className="md:col-span-2" />
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
                <Button type="button" tone="neutral" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" tone="orange" variant="solid">Guardar consumo</Button>
              </div>
            </form>
          </SurfaceCard>
        </div>
      ) : null}
    </div>
  );
}