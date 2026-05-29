"use client";

import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";

export interface AreaLineChartProps {
  title: string;
  subtitle?: string;
  categories: string[];
  series: { name: string; data: number[] }[];
  /** Color hex para la línea/área. Default emerald */
  color?: string;
  height?: number;
  /** Prefijo de valor en tooltip, ej: "$" */
  prefix?: string;
  /** Sufijo de valor en tooltip, ej: " L" */
  suffix?: string;
}

export function AreaLineChart({
  title,
  subtitle,
  categories,
  series,
  color = "#10b981",
  height = 220,
  prefix = "",
  suffix = "",
}: AreaLineChartProps) {
  const options: ApexOptions = {
    chart: {
      type: "area",
      toolbar: { show: false },
      sparkline: { enabled: false },
      background: "transparent",
      fontFamily: "inherit",
    },
    colors: [color],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.02,
        stops: [0, 100],
      },
    },
    stroke: { curve: "smooth", width: 2 },
    dataLabels: { enabled: false },
    xaxis: {
      categories,
      labels: {
        style: { fontSize: "11px", colors: "#9ca3af" },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { fontSize: "11px", colors: "#9ca3af" },
        formatter: (v) => `${prefix}${Math.round(v).toLocaleString("es-EC")}${suffix}`,
      },
    },
    grid: {
      borderColor: "rgba(156,163,175,0.12)",
      strokeDashArray: 4,
      yaxis: { lines: { show: true } },
      xaxis: { lines: { show: false } },
    },
    tooltip: {
      theme: "dark",
      y: {
        formatter: (v) => `${prefix}${v.toLocaleString("es-EC")}${suffix}`,
      },
    },
    markers: {
      size: 3,
      strokeWidth: 0,
      hover: { size: 5 },
    },
  };

  return (
    <div className="rounded-xl bg-white dark:bg-white/[0.03] p-5 md:p-6">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      <ReactApexChart
        options={options}
        series={series}
        type="area"
        height={height}
      />
    </div>
  );
}