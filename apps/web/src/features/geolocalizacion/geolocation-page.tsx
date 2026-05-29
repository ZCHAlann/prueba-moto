"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useAssets } from "@/hooks/useAssets";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { DataExportToolbar, type ExportColumn, type ExportRow } from "@/components/ui/data-export-toolbar";
import { InputField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";

type TrackingBlueprint = {
  assetId: string;
  top: string;
  left: string;
  zone: string;
  route: string;
  status: "En ruta" | "En patio" | "En supervision";
  lastSignal: string;
  speed: string;
};

const trackingBlueprints: TrackingBlueprint[] = [
  {
    assetId: "asset-001",
    top: "24%",
    left: "72%",
    zone: "Corredor Duran - Yaguachi",
    route: "Ruta minera norte",
    status: "En ruta",
    lastSignal: "2026-04-15 09:12",
    speed: "43 km/h",
  },
  {
    assetId: "asset-005",
    top: "52%",
    left: "64%",
    zone: "Base Costa / patio comercial",
    route: "Cobertura comercial costa",
    status: "En supervision",
    lastSignal: "2026-04-15 09:06",
    speed: "18 km/h",
  },
  {
    assetId: "asset-006",
    top: "67%",
    left: "81%",
    zone: "Cuenca Planta Sur",
    route: "Traslado de cuadrillas",
    status: "En patio",
    lastSignal: "2026-04-15 08:58",
    speed: "0 km/h",
  },
];

const exportColumns: ExportColumn[] = [
  { key: "plate", label: "Placa" },
  { key: "unit", label: "Unidad" },
  { key: "zone", label: "Zona" },
  { key: "status", label: "Estado" },
  { key: "lastSignal", label: "Ultima senal" },
  { key: "speed", label: "Velocidad" },
  { key: "responsible", label: "Responsable" },
];

export function GeolocationPage() {
  const { assets } = useAssets();
  const { settings } = usePlatform();
  const { canAccessCurrentPath } = useAuth();
  const [query, setQuery] = useState("");
  const trackedUnits = useMemo(() => {
    return trackingBlueprints
      .map((item) => {
        const asset = assets.find((entry) => entry.id === item.assetId);
        if (!asset) {
          return null;
        }

        return {
          ...item,
          plate: asset.plate,
          unit: `${asset.brand} ${asset.model}`,
          responsible: asset.responsible,
          site: asset.site,
          assetStatus: asset.status,
        };
      })
      .filter(Boolean) as Array<TrackingBlueprint & {
      plate: string;
      unit: string;
      responsible: string;
      site: string;
      assetStatus: string;
    }>;
  }, [assets]);

  const filteredUnits = useMemo(() => {
    const value = query.trim().toLowerCase();
    return trackedUnits.filter((unit) => {
      return (
        value.length === 0 ||
        unit.plate.toLowerCase().includes(value) ||
        unit.unit.toLowerCase().includes(value) ||
        unit.zone.toLowerCase().includes(value) ||
        unit.site.toLowerCase().includes(value) ||
        unit.responsible.toLowerCase().includes(value)
      );
    });
  }, [query, trackedUnits]);

  const [selectedAssetId, setSelectedAssetId] = useState<string>(trackingBlueprints[0]?.assetId ?? "");
  const resolvedSelectedAssetId = filteredUnits.some((unit) => unit.assetId === selectedAssetId)
    ? selectedAssetId
    : filteredUnits[0]?.assetId ?? "";
  const selectedUnit =
    filteredUnits.find((unit) => unit.assetId === resolvedSelectedAssetId) ?? filteredUnits[0] ?? null;

  const exportRows = useMemo<ExportRow[]>(
    () =>
      filteredUnits.map((unit) => ({
        plate: unit.plate,
        unit: unit.unit,
        zone: unit.zone,
        status: unit.status,
        lastSignal: unit.lastSignal,
        speed: unit.speed,
        responsible: unit.responsible,
      })),
    [filteredUnits]
  );

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Geolocalizacion"
        title="Monitoreo de unidades"
        subtitle="Mapa operacional ampliado con busqueda rapida por placa, foco visual por vehiculo y salida exportable del seguimiento reciente."
        accent="teal"
      />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Unidades visibles" value={trackedUnits.length.toString()} detail="Con posicion reciente" tone="info" />
        <StatCard label="En ruta" value={trackedUnits.filter((unit) => unit.status === "En ruta").length.toString()} detail="Movimiento operativo activo" tone="success" />
        <StatCard label="En supervision" value={trackedUnits.filter((unit) => unit.status === "En supervision").length.toString()} detail="Cobertura de campo" tone="warning" />
        <StatCard label="En patio" value={trackedUnits.filter((unit) => unit.status === "En patio").length.toString()} detail="Esperando salida o cierre" tone="neutral" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.65fr_0.75fr]">
        <SurfaceCard className="overflow-hidden">
          <div className="border-b border-neutral-200 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-950">Mapa operacional</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Busca por placa, unidad, sede o responsable para ubicar rapidamente un vehiculo.
                </p>
              </div>
              <div className="w-full lg:w-[360px]">
                <InputField
                  label="Ubicacion rapida"
                  type="search"
                  value={query}
                  onChange={setQuery}
                  accent="teal"
                  placeholder="Ej. PBC-2204, Volvo, Cuenca o responsable"
                />
              </div>
            </div>
          </div>

          <div className="relative min-h-[620px] overflow-hidden bg-[linear-gradient(180deg,_rgba(233,248,246,0.98),_rgba(255,255,255,0.98)),radial-gradient(circle_at_top_left,_rgba(45,212,191,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.12),_transparent_34%)]">
            <div className="absolute inset-0 opacity-60">
              <div className="absolute left-[8%] top-[10%] h-[3px] w-[38%] rotate-[22deg] rounded-full bg-teal-300/70" />
              <div className="absolute left-[24%] top-[36%] h-[3px] w-[42%] rotate-[-12deg] rounded-full bg-sky-300/70" />
              <div className="absolute left-[48%] top-[54%] h-[3px] w-[36%] rotate-[18deg] rounded-full bg-orange-300/70" />
              <div className="absolute left-[12%] top-[56%] h-[2px] w-[52%] rounded-full bg-emerald-200/80" />
              <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
            </div>

            <div className="absolute left-6 top-6 rounded-lg border border-white/80 bg-white/90 px-4 py-3 shadow-lg shadow-slate-900/10 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-600">ApliSmart Motors Tracking</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">Corredor Costa - Sierra</p>
              <p className="mt-1 text-sm text-slate-500">Cobertura operacional simulada con foco rapido por unidad.</p>
            </div>

            <div className="absolute bottom-6 left-6 rounded-lg border border-white/80 bg-white/90 px-4 py-3 shadow-lg shadow-slate-900/10 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Referencias</p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-700">
                <LegendDot color="bg-emerald-500" label="En ruta" />
                <LegendDot color="bg-amber-500" label="En supervision" />
                <LegendDot color="bg-slate-500" label="En patio" />
              </div>
            </div>

            {filteredUnits.map((unit) => {
              const isSelected = selectedUnit?.assetId === unit.assetId;
              const markerTone =
                unit.status === "En ruta"
                  ? "bg-emerald-500"
                  : unit.status === "En supervision"
                    ? "bg-amber-500"
                    : "bg-slate-500";

              return (
                <button
                  key={unit.assetId}
                  type="button"
                  onClick={() => setSelectedAssetId(unit.assetId)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-left"
                  style={{ top: unit.top, left: unit.left }}
                >
                  <span className={`relative flex h-5 w-5 items-center justify-center rounded-full border-4 border-white shadow-lg shadow-slate-900/20 ${markerTone} ${isSelected ? "scale-125" : "scale-100"}`}>
                    <span className={`absolute inset-0 rounded-full ${markerTone} opacity-30 ${isSelected ? "animate-ping" : ""}`} />
                  </span>
                  {isSelected ? (
                    <span className="absolute left-6 top-1/2 min-w-[240px] -translate-y-1/2 rounded-lg border border-white/80 bg-white/96 px-4 py-3 shadow-xl shadow-slate-900/12 backdrop-blur">
                      <span className="block text-sm font-semibold text-slate-950">{unit.plate} / {unit.unit}</span>
                      <span className="mt-1 block text-xs text-slate-500">{unit.zone} / {unit.lastSignal}</span>
                    </span>
                  ) : null}
                </button>
              );
            })}

            <div className="absolute right-6 top-6 flex flex-col gap-3 rounded-lg border border-white/80 bg-white/90 px-3 py-3 shadow-lg shadow-slate-900/10 backdrop-blur">
              <button type="button" className="rounded-lg border border-neutral-200 px-3 py-2 text-lg font-bold text-slate-700">+</button>
              <button type="button" className="rounded-lg border border-neutral-200 px-3 py-2 text-lg font-bold text-slate-700">-</button>
            </div>
          </div>
        </SurfaceCard>

        <div className="space-y-4">
          <SurfaceCard className="p-5">
            <h2 className="text-lg font-semibold text-neutral-950">Integracion de mapa</h2>
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-950">{settings.mapsProvider}</p>
                <p className="mt-1 text-sm text-neutral-500">
                  {settings.mapsApiKey
                    ? "API key configurada. La pantalla ya esta lista para conectar Google Maps cuando actives la integracion real."
                    : "Sin API key cargada. Se mantiene el mapa de respaldo enriquecido para no dejar la geolocalizacion vacia."}
                </p>
              </div>
              <MetaRow label="API key" value={settings.mapsApiKey ? "Configurada" : "Pendiente"} />
              <MetaRow label="Fallback visual" value={settings.mapsFallbackEnabled ? "Activo" : "Inactivo"} />
              <MetaRow label="Dominio sugerido" value="motors.aplismart.com" />
              {canAccessCurrentPath("/configuracion") ? (
                <Link href="/configuracion" className="inline-flex">
                  <Button tone="teal" variant="outline">
                    Configurar integracion
                  </Button>
                </Link>
              ) : null}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <h2 className="text-lg font-semibold text-neutral-950">Unidad seleccionada</h2>
            {selectedUnit ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                  <p className="text-sm font-semibold text-neutral-950">{selectedUnit.plate} / {selectedUnit.unit}</p>
                  <p className="mt-1 text-sm text-neutral-500">{selectedUnit.zone}</p>
                </div>
                <MetaRow label="Estado GPS" value={selectedUnit.status} />
                <MetaRow label="Ultima senal" value={selectedUnit.lastSignal} />
                <MetaRow label="Velocidad" value={selectedUnit.speed} />
                <MetaRow label="Responsable" value={selectedUnit.responsible} />
                <MetaRow label="Sede" value={selectedUnit.site} />
                <MetaRow label="Estado operativo" value={selectedUnit.assetStatus} />
              </div>
            ) : (
              <EmptyState
                title="Sin coincidencias"
                description="Ajusta la busqueda para ubicar rapidamente otra unidad dentro del mapa."
              />
            )}
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <h2 className="text-lg font-semibold text-neutral-950">Resultados rapidos</h2>
            <div className="mt-4 space-y-3">
              {filteredUnits.map((unit) => (
                <button
                  key={unit.assetId}
                  type="button"
                  onClick={() => setSelectedAssetId(unit.assetId)}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition ${selectedUnit?.assetId === unit.assetId ? "border-teal-300 bg-teal-50" : "border-neutral-200 hover:bg-neutral-50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-neutral-950">{unit.plate}</p>
                      <p className="mt-1 text-sm text-neutral-500">{unit.unit}</p>
                    </div>
                    <StatusPill
                      label={unit.status}
                      tone={unit.status === "En ruta" ? "success" : unit.status === "En supervision" ? "warning" : "neutral"}
                    />
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">{unit.zone}</p>
                </button>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </div>

      <TableCard title="Actividad reciente" description="Seguimiento exportable de la telemetria de respaldo por unidad.">
        <DataExportToolbar
          title="geolocalizacion-unidades"
          columns={exportColumns}
          rows={exportRows}
          accent="teal"
        />
        <Table minWidth="min-w-[1040px]">
          <TableHead>
            <tr>
              <th className="px-5 py-3 font-semibold">Unidad</th>
              <th className="px-5 py-3 font-semibold">Zona</th>
              <th className="px-5 py-3 font-semibold">Estado</th>
              <th className="px-5 py-3 font-semibold">Ultima senal</th>
              <th className="px-5 py-3 font-semibold">Velocidad</th>
              <th className="px-5 py-3 font-semibold">Responsable</th>
            </tr>
          </TableHead>
          <TableBody>
            {filteredUnits.map((unit) => (
              <tr key={unit.assetId} className="hover:bg-neutral-50">
                <td className="px-5 py-4">
                  <p className="font-semibold text-neutral-950">{unit.plate}</p>
                  <p className="mt-1 text-xs text-neutral-500">{unit.unit}</p>
                </td>
                <td className="px-5 py-4">{unit.zone}</td>
                <td className="px-5 py-4">
                  <StatusPill
                    label={unit.status}
                    tone={unit.status === "En ruta" ? "success" : unit.status === "En supervision" ? "warning" : "neutral"}
                  />
                </td>
                <td className="px-5 py-4">{unit.lastSignal}</td>
                <td className="px-5 py-4">{unit.speed}</td>
                <td className="px-5 py-4">{unit.responsible}</td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-200 pb-3 text-sm last:border-b-0 last:pb-0">
      <span className="font-medium text-neutral-500">{label}</span>
      <span className="text-right font-semibold text-neutral-950">{value}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span>{label}</span>
    </span>
  );
}
