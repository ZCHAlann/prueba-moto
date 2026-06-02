"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { ApiFuelEntry } from "../../../hooks/useFuel";
import type { Asset } from "../../../types/activo";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  fuelEntries: ApiFuelEntry[];
  assets: Asset[];
};

type Mode = "liters" | "cost" | "entries";

const COLS = ["#4F6EF7", "#00D084", "#F5A623", "#9B6DFF", "#00C8D7", "#F24E4E"];

function fmt(n: number, d = 1) {
  return n.toLocaleString("es-EC", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, mode }: any) {
  if (!active || !payload?.length) return null;
  const val   = payload[0].value as number;
  const color = payload[0].fill  as string;
  const display =
    mode === "liters"  ? `${fmt(val, 0)} L`  :
    mode === "cost"    ? `$${fmt(val)}` :
    `${val} cargas`;
  return (
    <div style={{
      background: "var(--bg2, #0f1117)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 12,
      padding: "10px 14px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
    }}>
      <p style={{ fontSize: 10, color: "var(--text3, #5A5A7A)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{display}</p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function BarChartExp({ fuelEntries, assets }: Props) {
  const [mode, setMode] = useState<Mode>("liters");
  const [hovIdx, setHovIdx] = useState<number | null>(null);

  const data = useMemo(() => {
    const map = new Map<string, { liters: number; cost: number; entries: number }>();
    fuelEntries.forEach((e) => {
      const cur = map.get(e.assetId) ?? { liters: 0, cost: 0, entries: 0 };
      map.set(e.assetId, {
        liters:  cur.liters  + e.liters,
        cost:    cur.cost    + e.cost,
        entries: cur.entries + 1,
      });
    });

    return assets
      .map((a) => {
        const d = map.get(a.id);
        if (!d || d.entries === 0) return null;
        return { id: a.id, plate: a.plate, unit: `${a.brand} ${a.model}`, ...d };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b[mode] - a[mode]) as {
        id: string; plate: string; unit: string;
        liters: number; cost: number; entries: number;
      }[];
  }, [fuelEntries, assets, mode]);

  const MODES: { key: Mode; label: string }[] = [
    { key: "liters",  label: "Litros"  },
    { key: "cost",    label: "Costo"   },
    { key: "entries", label: "Cargas"  },
  ];

  if (data.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: "var(--text3, #5A5A7A)", fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
        Sin datos
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            style={{
              padding: "5px 14px", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace",
              transition: "all .12s",
              background: mode === key ? "#4F6EF7" : "transparent",
              color:      mode === key ? "#fff"    : "var(--text3, #5A5A7A)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
          barCategoryGap="40%"
          onMouseLeave={() => setHovIdx(null)}
        >
          <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="plate"
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
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            wrapperStyle={{ outline: "none", background: "transparent", border: "none" }}
          />
          <Bar dataKey={mode} radius={[6, 6, 0, 0]}
            onMouseEnter={(_: any, index: number) => setHovIdx(index)}>
            {data.map((_, i) => {
              const col   = COLS[i % COLS.length];
              const isHov = hovIdx === i;
              return (
                <Cell
                  key={i}
                  fill={col}
                  fillOpacity={hovIdx !== null && !isHov ? 0.35 : 1}
                  style={{
                    filter: isHov ? `drop-shadow(0 0 8px ${col}90)` : "none",
                    transition: "fill-opacity .15s",
                  }}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Mini legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {data.map((d, i) => {
          const col   = COLS[i % COLS.length];
          const isHov = hovIdx === i;
          const val   = mode === "liters" ? `${fmt(d.liters, 0)} L` : mode === "cost" ? `$${fmt(d.cost)}` : `${d.entries}`;
          return (
            <div key={d.id} onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(null)}
              style={{
                display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                padding: "3px 10px", borderRadius: 20, transition: "all .12s",
                border: `1px solid ${isHov ? col : "rgba(255,255,255,0.08)"}`,
                background: isHov ? `${col}18` : "transparent",
              }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: col }} />
              <span style={{ fontSize: 10, color: isHov ? col : "var(--text2, #9090B0)", fontFamily: "'JetBrains Mono',monospace", fontWeight: isHov ? 700 : 400 }}>
                {d.plate}
              </span>
              <span style={{ fontSize: 10, color: col, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>
                {val}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}