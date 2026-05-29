"use client";

import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";

export interface DonutPieChartProps {
  title: string;
  subtitle?: string;
  /** Array de { name, value } */
  data: { name: string; value: number }[];
  /** Paleta de colores opcionales */
  colors?: string[];
  height?: number;
  /** Si true, muestra rosquilla; si false, pastel sólido */
  donut?: boolean;
}

const DEFAULT_COLORS = [
  "#10b981", "#f59e0b", "#ef4444", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

export function DonutPieChart({
  title,
  subtitle,
  data,
  colors = DEFAULT_COLORS,
  height = 280,
  donut = true,
}: DonutPieChartProps) {
  const labels = data.map((d) => d.name);
  const series = data.map((d) => d.value);
  const total = series.reduce((a, b) => a + b, 0);

  const options: ApexOptions = {
    chart: {
      type: donut ? "donut" : "pie",
      background: "transparent",
      fontFamily: "inherit",
      toolbar: { show: false },
    },
    colors,
    labels,
    legend: {
      position: "bottom",
      fontSize: "12px",
      labels: { colors: "#9ca3af" },
      markers: { offsetX: -2 },
      itemMargin: { horizontal: 8, vertical: 4 },
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number) => `${val.toFixed(1)}%`,
      style: { fontSize: "11px", fontWeight: "600" },
      dropShadow: { enabled: false },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "62%",
          labels: {
            show: donut,
            total: {
              show: true,
              label: "Total",
              fontSize: "13px",
              color: "#9ca3af",
              formatter: () => String(total),
            },
            value: {
              fontSize: "22px",
              fontWeight: "700",
              color: "#f9fafb",
              offsetY: 4,
            },
          },
        },
        expandOnClick: true,
      },
    },
    stroke: { width: 2, colors: ["transparent"] },
    tooltip: {
      theme: "dark",
      y: { formatter: (v) => `${v} unidades` },
    },
    states: {
      hover: { filter: { type: "lighten" } },
      active: { filter: { type: "darken" } },
    },
  };

  if (total === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-white/[0.03] p-5 md:p-6 flex flex-col">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        <div className="flex flex-1 items-center justify-center h-40 text-sm text-gray-400">
          Sin datos disponibles
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white dark:bg-white/[0.03] p-5 md:p-6">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      <ReactApexChart
        options={options}
        series={series}
        type={donut ? "donut" : "pie"}
        height={height}
      />
    </div>
  );
}