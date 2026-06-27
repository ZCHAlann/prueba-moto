"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ApiFuelEntry } from "../../../hooks/useFuel";
import type { Asset } from "../../../types/activo";

// ─── Types ───────────────────────────────────────────────────────────────────

type Props = {
  fuelEntries: ApiFuelEntry[];
  assets:      Asset[];
  /** "gallons" | "cost" */
  mode?: "gallons" | "cost";
};

type SeriesPoint = {
  month: string;        // "YYYY-MM"  (dataKey del eje X)
  label: string;        // "Jul 2025" (mostrar)
  [vehicleKey: string]: number | string; // valor por vehículo (dynamic keys)
};

// ─── Palette (mismo orden que BarChart para consistencia) ───────────────────

const COLORS = ["#4F6EF7", "#00D084", "#F5A623", "#9B6DFF", "#00C8D7", "#F24E4E", "#FF7AB6", "#22C55E", "#EAB308", "#A78BFA", "#FB7185", "#38BDF8"];

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTHS_ES[Number(m) - 1]} ${y.slice(2)}`;
}

function fmt(n: number, d = 1) {
  return n.toLocaleString("es-EC", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function plateOf(entries: ApiFuelEntry[], assetId: string): string {
  return entries.find((e) => e.assetId === assetId)?.assetPlate ?? assetId;
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, mode }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
  return (
    <div style={{
      background: "var(--bg2, #0f1117)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 12,
      padding: "10px 14px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
      minWidth: 160,
    }}>
      <p style={{ fontSize: 10, color: "var(--text3, #5A5A7A)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 8 }}>{label}</p>
      {sorted.map((p: any) => (
        <p key={p.dataKey} style={{ fontSize: 12, fontWeight: 600, color: p.color, fontFamily: "'JetBrains Mono',monospace", display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span>{p.dataKey}</span>
          <span style={{ fontWeight: 700 }}>
            {mode === "cost" ? `$${fmt(Number(p.value))}` : `${fmt(Number(p.value), 2)} gal`}
          </span>
        </p>
      ))}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function MultiLineChartByVehicle({ fuelEntries, assets, mode = "gallons" }: Props) {
  const [zoom, setZoom] = useState(1);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Determinar los vehículos que tienen al menos una entry
  const activeAssets = useMemo(() => {
    const ids = new Set<string>();
    fuelEntries.forEach((e) => ids.add(e.assetId));
    return assets
      .filter((a) => ids.has(a.id))
      .map((a) => ({ id: a.id, plate: a.plate, label: `${a.brand} ${a.model}`.trim() || a.plate }))
      .sort((a, b) => a.plate.localeCompare(b.plate));
  }, [fuelEntries, assets]);

  // 2. Construir la serie: { "Jul 2025": { "ABC123": 120, "XYZ987": 80 }, ... }
  const data: SeriesPoint[] = useMemo(() => {
    const monthSet = new Set<string>();
    const buckets = new Map<string, Map<string, number>>(); // month -> assetId -> value

    for (const e of fuelEntries) {
      const month = e.date.slice(0, 7); // YYYY-MM
      monthSet.add(month);
      if (!buckets.has(month)) buckets.set(month, new Map());
      const m = buckets.get(month)!;
      const v = mode === "cost" ? e.cost : e.gallons;
      m.set(e.assetId, (m.get(e.assetId) ?? 0) + v);
    }

    const months = [...monthSet].sort();
    return months.map((month) => {
      const row: SeriesPoint = { month, label: fmtMonth(month) };
      const m = buckets.get(month);
      for (const asset of activeAssets) {
        row[asset.id] = m?.get(asset.id) ?? 0;
      }
      return row;
    });
  }, [fuelEntries, activeAssets, mode]);

  // 3. Zoom: mostrar últimos N puntos
  const visible = useMemo(() => {
    const total = data.length;
    const count = Math.max(3, Math.round(total * zoom));
    return data.slice(total - count);
  }, [data, zoom]);

  // 4. Calcular totales para los pills del summary
  const totals = useMemo(() => {
    return activeAssets.map((a) => {
      const sum = visible.reduce((s, row) => s + Number(row[a.id] ?? 0), 0);
      return { ...a, total: sum };
    }).sort((a, b) => b.total - a.total);
  }, [activeAssets, visible]);

  const grandTotal = totals.reduce((s, t) => s + t.total, 0);
  const monthsShown = visible.length;

  // 5. Wheel zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(1, Math.max(0.2, z + (e.deltaY < 0 ? 0.05 : -0.05))));
  }, []);

  // 6. Click en leyenda para ocultar/mostrar
  const toggleSeries = (assetId: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  if (data.length === 0 || activeAssets.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: "var(--text3, #5A5A7A)", fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
        Sin datos
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Summary pills */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "4px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
          <span style={{ fontSize: 10, color: "var(--text3, #5A5A7A)", fontFamily: "'JetBrains Mono',monospace" }}>
{mode === "cost" ? "Costo total" : "Total galones"}
              </p>
              <p style={{ fontSize: 20, fontWeight: 700, color: "#4F6EF7", fontFamily: "'JetBrains Mono',monospace" }}>
                {mode === "cost" ? `$${fmt(grandTotal)}` : `${fmt(grandTotal, 2)} gal`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "4px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
          <span style={{ fontSize: 10, color: "var(--text3, #5A5A7A)", fontFamily: "'JetBrains Mono',monospace" }}>Período visible</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF", fontFamily: "'JetBrains Mono',monospace" }}>{monthsShown} meses</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "4px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
          <span style={{ fontSize: 10, color: "var(--text3, #5A5A7A)", fontFamily: "'JetBrains Mono',monospace" }}>Vehículos</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF", fontFamily: "'JetBrains Mono',monospace" }}>{activeAssets.length - hidden.size}</span>
        </div>
      </div>

      {/* Zoom hint */}
      <p style={{ fontSize: 10, color: "var(--text3, #5A5A7A)", fontFamily: "'JetBrains Mono',monospace", margin: 0 }}>
        Rueda del mouse para hacer zoom · mostrando {monthsShown} de {data.length} meses
      </p>

      {/* Chart */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        style={{ cursor: "ns-resize", userSelect: "none" }}
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={visible} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--text3, #5A5A7A)", fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "var(--text3, #5A5A7A)", fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<ChartTooltip mode={mode} />}
              cursor={{ stroke: "rgba(255,255,255,0.10)", strokeWidth: 1, strokeDasharray: "4 4" }}
              wrapperStyle={{ outline: "none", background: "transparent", border: "none" }}
            />
            <Legend
              verticalAlign="top"
              height={28}
              iconType="plainline"
              iconSize={14}
              wrapperStyle={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "var(--text3, #5A5A7A)" }}
              onClick={(e: any) => toggleSeries(e.dataKey)}
              formatter={(value: string) => {
                const isHidden = hidden.has(value);
                return <span style={{ color: isHidden ? "var(--text3, #5A5A7A)" : undefined, textDecoration: isHidden ? "line-through" : undefined, cursor: "pointer" }}>{plateOf(fuelEntries, value)}</span>;
              }}
            />
            {activeAssets.map((a, i) => {
              const color = COLORS[i % COLORS.length];
              const isHidden = hidden.has(a.id);
              return (
                <Line
                  key={a.id}
                  type="monotone"
                  dataKey={a.id}
                  name={a.plate}
                  stroke={color}
                  strokeWidth={isHidden ? 0 : 2.25}
                  strokeOpacity={isHidden ? 0 : 1}
                  dot={false}
                  activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Zoom slider */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 10, color: "var(--text3, #5A5A7A)", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>Zoom</span>
        <input
          type="range"
          min={20}
          max={100}
          value={Math.round(zoom * 100)}
          onChange={(e) => setZoom(Number(e.target.value) / 100)}
          style={{ flex: 1, accentColor: "#4F6EF7" }}
        />
        <span style={{ fontSize: 10, color: "#4F6EF7", fontFamily: "'JetBrains Mono',monospace", minWidth: 32, textAlign: "right" }}>
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Mini leyenda — muestra los totales por vehículo, clickable */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {totals.map((t, i) => {
          const color = COLORS[activeAssets.findIndex((a) => a.id === t.id) % COLORS.length];
          const isHidden = hidden.has(t.id);
          return (
            <div
              key={t.id}
              onClick={() => toggleSeries(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                padding: "3px 10px", borderRadius: 20, transition: "all .12s",
                border: `1px solid ${isHidden ? "rgba(255,255,255,0.06)" : color + "55"}`,
                background: isHidden ? "transparent" : color + "10",
                opacity: isHidden ? 0.4 : 1,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
              <span style={{ fontSize: 10, color: isHidden ? "var(--text3, #5A5A7A)" : color, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, textDecoration: isHidden ? "line-through" : undefined }}>
                {t.plate}
              </span>
              <span style={{ fontSize: 10, color: "var(--text2, #9090B0)", fontFamily: "'JetBrains Mono',monospace" }}>
                {mode === "cost" ? `$${fmt(t.total)}` : `${fmt(t.total, 2)} gal`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
