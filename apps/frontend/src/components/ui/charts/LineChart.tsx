"use client";

import { useMemo, useRef, useState, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import type { ApiFuelEntry } from "../../../hooks/useFuel";
import type { Asset } from "../../../types/activo";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  fuelEntries: ApiFuelEntry[];
  assets: Asset[];
  /** "liters" | "cost" */
  mode?: "liters" | "cost";
};

type Point = { label: string; value: number; raw: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMonth(ymd: string) {
  const [y, m] = ymd.split("-");
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${months[Number(m) - 1]} ${y.slice(2)}`;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("es-EC", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, mode }: any) {
  if (!active || !payload?.length) return null;
  const val  = payload[0].value as number;
  const color = payload[0].stroke as string;
  return (
    <div style={{
      background: "var(--bg2, #0f1117)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 12,
      padding: "10px 14px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
    }}>
      <p style={{ fontSize: 10, color: "var(--text3, #5A5A7A)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>
        {mode === "cost" ? `$${fmt(val)}` : `${fmt(val, 0)} L`}
      </p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function LineChartExp({ fuelEntries, assets: _assets, mode = "liters" }: Props) {
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Aggregate by month
  const allData: Point[] = useMemo(() => {
    const map = new Map<string, number>();
    fuelEntries.forEach((e) => {
      const key = e.date.slice(0, 7); // "YYYY-MM"
      const val  = mode === "cost" ? e.cost : e.liters;
      map.set(key, (map.get(key) ?? 0) + val);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([raw, value]) => ({ raw, label: fmtMonth(raw + "-01"), value }));
  }, [fuelEntries, mode]);

  // Zoom: show last N points (min 3, max all)
  const visible = useMemo(() => {
    const total = allData.length;
    const count = Math.max(3, Math.round(total * zoom));
    return allData.slice(total - count);
  }, [allData, zoom]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(1, Math.max(0.2, z + (e.deltaY < 0 ? 0.05 : -0.05))));
  }, []);

  const color  = mode === "cost" ? "#00D084" : "#4F6EF7";
  const gradId = `fuel-line-grad-${mode}`;

  const maxVal  = Math.max(...visible.map((d) => d.value), 0);
  const total   = visible.reduce((s, d) => s + d.value, 0);
  const avg     = visible.length > 0 ? total / visible.length : 0;

  if (allData.length === 0) {
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
        {[
          { label: mode === "cost" ? "Total" : "Total litros", value: mode === "cost" ? `$${fmt(total)}` : `${fmt(total, 0)} L` },
          { label: "Promedio/mes",                             value: mode === "cost" ? `$${fmt(avg)}` : `${fmt(avg, 0)} L` },
          { label: "Período visible",                          value: `${visible.length} meses` },
        ].map((p) => (
          <div key={p.label} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "4px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
            <span style={{ fontSize: 10, color: "var(--text3, #5A5A7A)", fontFamily: "'JetBrains Mono',monospace" }}>{p.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{p.value}</span>
          </div>
        ))}
      </div>

      {/* Zoom hint */}
      <p style={{ fontSize: 10, color: "var(--text3, #5A5A7A)", fontFamily: "'JetBrains Mono',monospace", margin: 0 }}>
        🖱 Rueda del mouse para hacer zoom · mostrando {visible.length} de {allData.length} meses
      </p>

      {/* Chart */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        style={{ cursor: "ns-resize", userSelect: "none" }}
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={visible} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0}    />
              </linearGradient>
            </defs>
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
              cursor={{ stroke: `${color}40`, strokeWidth: 1, strokeDasharray: "4 4" }}
              wrapperStyle={{ outline: "none", background: "transparent", border: "none" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
            />
          </AreaChart>
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
          style={{ flex: 1, accentColor: color }}
        />
        <span style={{ fontSize: 10, color, fontFamily: "'JetBrains Mono',monospace", minWidth: 32, textAlign: "right" }}>
          {Math.round(zoom * 100)}%
        </span>
      </div>
    </div>
  );
}