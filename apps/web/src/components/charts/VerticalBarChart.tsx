"use client";

import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";

export interface VerticalBarChartProps {
  title: string;
  subtitle?: string;
  categories: string[];
  series: { name: string; data: number[]; color?: string }[];
  height?: number;
  prefix?: string;
  suffix?: string;
  /** Si true, apila las barras */
  stacked?: boolean;
}

export function VerticalBarChart({
  title,
  subtitle,
  categories,
  series,
  height = 220,
  prefix = "",
  suffix = "",
  stacked = false,
}: VerticalBarChartProps) {
  const colors = series.map((s, i) =>
    s.color ?? ["#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6"][i % 5]
  );

  const options: ApexOptions = {
    chart: {
      type: "bar",
      stacked,
      background: "transparent",
      fontFamily: "inherit",
      toolbar: { show: false },
    },
    colors,
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: series.length > 1 ? "60%" : "40%",
        dataLabels: { position: "top" },
      },
    },
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
    legend: {
      show: series.length > 1,
      position: "top",
      fontSize: "12px",
      labels: { colors: "#9ca3af" },
    },
    tooltip: {
      theme: "dark",
      y: {
        formatter: (v) => `${prefix}${v.toLocaleString("es-EC")}${suffix}`,
      },
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
        series={series.map(({ name, data }) => ({ name, data }))}
        type="bar"
        height={height}
      />
    </div>
  );
}