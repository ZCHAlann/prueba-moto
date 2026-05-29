"use client";

import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface FleetBarChartProps {
  title: string;
  categories: string[];
  series: { name: string; data: number[] }[];
  height?: number;
}

export function FleetBarChart({ title, categories, series, height = 200 }: FleetBarChartProps) {
  const options: ApexOptions = {
    colors: ["#465fff"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      height,
      toolbar: { show: false },
      background: "transparent",
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "39%",
        borderRadius: 5,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 4, colors: ["transparent"] },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { colors: "#98a2b3", fontSize: "12px", fontFamily: "Outfit, sans-serif" },
      },
    },
    yaxis: {
      labels: {
        style: { colors: "#98a2b3", fontSize: "12px", fontFamily: "Outfit, sans-serif" },
      },
    },
    grid: {
      borderColor: "#e4e7ec",
      yaxis: { lines: { show: true } },
      xaxis: { lines: { show: false } },
    },
    fill: { opacity: 1 },
    tooltip: {
      x: { show: false },
      y: { formatter: (val: number) => `${val}` },
      theme: "dark",
    },
    legend: { show: false },
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-white px-5 pt-5 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mb-4">
        {title}
      </h3>
      <div className="max-w-full overflow-x-auto">
        <div className="-ml-5 min-w-[400px] xl:min-w-full pl-2">
          <ReactApexChart options={options} series={series} type="bar" height={height} />
        </div>
      </div>
    </div>
  );
}