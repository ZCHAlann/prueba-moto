"use client";

import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";

export interface HorizontalBarChartProps {
  title: string;
  subtitle?: string;
  /** Array de { name, value } ordenado de mayor a menor */
  data: { name: string; value: number }[];
  color?: string;
  height?: number;
  prefix?: string;
  suffix?: string;
}

export function HorizontalBarChart({
  title,
  subtitle,
  data,
  color = "#3b82f6",
  height,
  prefix = "",
  suffix = "",
}: HorizontalBarChartProps) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const computedHeight = height ?? Math.max(160, sorted.length * 44);

  const options: ApexOptions = {
    chart: {
      type: "bar",
      background: "transparent",
      fontFamily: "inherit",
      toolbar: { show: false },
    },
    colors: [color],
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        barHeight: "55%",
        dataLabels: { position: "bottom" },
      },
    },
    dataLabels: {
      enabled: true,
      textAnchor: "start",
      offsetX: 8,
      style: { fontSize: "11px", colors: ["#9ca3af"] },
      formatter: (v) => `${prefix}${Number(v).toLocaleString("es-EC")}${suffix}`,
    },
    xaxis: {
      labels: {
        style: { fontSize: "11px", colors: "#9ca3af" },
        formatter: (v) => `${prefix}${Number(v).toLocaleString("es-EC")}${suffix}`,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { fontSize: "12px", colors: "#9ca3af" },
        maxWidth: 140,
      },
    },
    grid: {
      borderColor: "rgba(156,163,175,0.12)",
      strokeDashArray: 4,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
    },
    tooltip: {
      theme: "dark",
      y: { formatter: (v) => `${prefix}${v.toLocaleString("es-EC")}${suffix}` },
    },
  };

  if (data.length === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-white/[0.03] p-5 md:p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        <div className="flex items-center justify-center h-24 text-sm text-gray-400">
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
        series={[{ name: title, data: sorted.map((d) => d.value) }]}
        type="bar"
        height={computedHeight}
      />
    </div>
  );
}