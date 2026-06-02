import { usePlatformStats } from "@/hooks/usePlatformStats";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { KpiCard } from "@/components/dashboard/kpi-card";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { ArrowUpRight, ArrowDownRight, Clock, TrendingUp } from "lucide-react";

// ============= CHART CARD COMPONENT =============
interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

function ChartCard({ title, children, className = "" }: ChartCardProps) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/5 to-transparent dark:from-white/[0.02] px-5 pb-5 pt-5 ${className}`}
    >
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ============= CHART OPTIONS (APEX) =============
const baseChartOptions: ApexOptions = {
  chart: {
    background: "transparent",
    fontFamily: "Outfit, sans-serif",
    toolbar: { show: false },
  },
  tooltip: {
    theme: "dark",
  },
  grid: {
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
};

// ============= MAIN DASHBOARD COMPONENT =============
export default function PlatformDashboard() {
  const { session } = useAuth();
  const { data, loading, error } = usePlatformStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            Cargando datos de plataforma...
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-error-500 mb-4">
            {error || "No se pudieron cargar los datos"}
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.07,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35 },
    },
  };

  // ============= KPI DATA =============
  const activeCompanies = data.companies.active;
  const trialCompanies = data.companies.trial;
  const leadsInPipeline =
    data.leads.byStatus.nuevo +
    data.leads.byStatus.contactado +
    data.leads.byStatus.demoAgendada +
    data.leads.byStatus.propuestaEnviada;

  const monthLabels = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
  ];

  // ============= SERIES DATA PARA GRÁFICAS =============

  // Línea: Companies new + Leads new (últimos 12 meses)
  const lineChartSeries = [
    {
      name: "Empresas nuevas",
      data: data.companies.newByMonth || [],
    },
    {
      name: "Leads nuevos",
      data: data.leads.newByMonth || [],
    },
  ];

  const lineChartOptions: ApexOptions = {
    ...baseChartOptions,
    chart: {
      ...baseChartOptions.chart,
      type: "line",
    },
    stroke: {
      curve: "smooth",
      width: 2.5,
    },
    colors: ["#465fff", "#7a5af8"],
    xaxis: {
      categories: monthLabels,
      labels: { style: { colors: "rgba(255,255,255,0.5)" } },
    },
    yaxis: { labels: { style: { colors: "rgba(255,255,255,0.5)" } } },
    legend: { position: "top", horizontalAlign: "left" },
  };

  // Donut: Empresas por plan
  const donutChartSeries = data.companies.byPlan?.map(p => p.total) || [];
  const donutChartLabels = data.companies.byPlan?.map(p => p.planName) || [];
  
  const donutChartOptions: ApexOptions = {
    ...baseChartOptions,
    chart: {
      ...baseChartOptions.chart,
      type: "donut",
    },
    colors: ["#465fff", "#7a5af8", "#ee46bc", "#fdb022"],
    labels: donutChartLabels,
    legend: { position: "bottom", horizontalAlign: "center" },
    plotOptions: {
      pie: {
        donut: {
          size: "65%",
        },
      },
    },
  };

  // Barras verticales dobles: Empresas (activas vs trial)
  const companiesBarSeries = [
    { name: "Activas", data: [activeCompanies] },
    { name: "En trial", data: [trialCompanies] },
  ];
  
  const companiesBarOptions: ApexOptions = {
    ...baseChartOptions,
    chart: {
      ...baseChartOptions.chart,
      type: "bar",
    },
    colors: ["#465fff", "#7a5af8"],
    xaxis: { categories: ["Empresas"] },
    yaxis: { labels: { style: { colors: "rgba(255,255,255,0.5)" } } },
    plotOptions: {
      bar: { columnWidth: "50%", horizontal: false },
    },
    legend: { position: "top", horizontalAlign: "left" },
  };

  // Barras verticales dobles: Leads (en pipeline vs ganados)
  const leadsBarSeries = [
    { name: "En pipeline", data: [leadsInPipeline] },
    {
      name: "Ganados",
      data: [data.leads.byStatus.ganado],
    },
  ];
  
  const leadsBarOptions: ApexOptions = {
    ...baseChartOptions,
    chart: {
      ...baseChartOptions.chart,
      type: "bar",
    },
    colors: ["#465fff", "#12b76a"],
    xaxis: { categories: ["Leads"] },
    yaxis: { labels: { style: { colors: "rgba(255,255,255,0.5)" } } },
    plotOptions: {
      bar: { columnWidth: "50%", horizontal: false },
    },
    legend: { position: "top", horizontalAlign: "left" },
  };

  // Barras horizontales: Leads por status
  const leadsStatusSeries = [
    {
      name: "Leads",
      data: [
        data.leads.byStatus.nuevo,
        data.leads.byStatus.contactado,
        data.leads.byStatus.demoAgendada,
        data.leads.byStatus.propuestaEnviada,
        data.leads.byStatus.ganado,
        data.leads.byStatus.perdido,
      ],
    },
  ];
  
  const leadsStatusOptions: ApexOptions = {
    ...baseChartOptions,
    chart: {
      ...baseChartOptions.chart,
      type: "bar",
    },
    colors: ["#465fff"],
    xaxis: {
      categories: ["Nuevo", "Contactado", "Demo", "Propuesta", "Ganado", "Perdido"],
    },
    yaxis: { labels: { style: { colors: "rgba(255,255,255,0.5)" } } },
    plotOptions: {
      bar: { columnWidth: "50%", horizontal: true },
    },
  };

  // ============= RENDER =============
  return (
    <div className="w-full">
      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-8 flex items-end justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Panel de plataforma
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Visión general del negocio SaaS y métricas clave
          </p>
        </div>
        <Badge variant="secondary" className="text-xs px-3 py-1.5">
          🔐 Superadmin
        </Badge>
      </motion.div>

      <Separator className="mb-8 bg-white/5" />

      {/* KPI CARDS */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        <motion.div variants={itemVariants}>
          <KpiCard
            label="Empresas activas"
            value={String(activeCompanies)}
            icon={<TrendingUp className="w-4 h-4" />}
            badge={data.companies.growthMoM ? `${data.companies.growthMoM > 0 ? '+' : ''}${data.companies.growthMoM}%` : undefined}
            tone={data.companies.growthMoM && data.companies.growthMoM > 0 ? "success" : "error"}
        />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard
            label="Empresas en trial"
            value={String(trialCompanies)}
            icon={<Clock className="w-4 h-4" />}
            tone="warning"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard
            label="Leads en pipeline"
            value={String(leadsInPipeline)}
            icon={<TrendingUp className="w-4 h-4" />}
            tone="brand"
          />

        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard
            label="Tasa de conversión"
            value={`${data.leads.conversionRate.toFixed(1)}%`}
            icon={<TrendingUp className="w-4 h-4" />}
            tone={data.leads.conversionRate > 20 ? "success" : "warning"}
          />
        </motion.div>
      </motion.div>

      {/* GROWTH SECTION */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8"
      >
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <ChartCard title="Crecimiento últimos 12 meses">
            <ReactApexChart
              type="line"
              series={lineChartSeries}
              options={lineChartOptions}
              height={320}
            />
          </ChartCard>
        </motion.div>
        <motion.div variants={itemVariants}>
          <ChartCard title="Distribución por plan">
            <ReactApexChart
              type="donut"
              series={donutChartSeries}
              options={donutChartOptions}
              height={320}
            />
          </ChartCard>
        </motion.div>
      </motion.div>

      {/* COMPARATIVE ANALYSIS SECTION */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8"
      >
        <motion.div variants={itemVariants}>
          <ChartCard title="Empresas hoy">
            <ReactApexChart
              type="bar"
              series={companiesBarSeries}
              options={companiesBarOptions}
              height={280}
            />
          </ChartCard>
        </motion.div>
        <motion.div variants={itemVariants}>
          <ChartCard title="Leads hoy">
            <ReactApexChart
              type="bar"
              series={leadsBarSeries}
              options={leadsBarOptions}
              height={280}
            />
          </ChartCard>
        </motion.div>
      </motion.div>

      {/* LEADS STATUS SECTION */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-4 mb-8"
      >
        <motion.div variants={itemVariants}>
          <ChartCard title="Leads por estado del pipeline">
            <ReactApexChart
              type="bar"
              series={leadsStatusSeries}
              options={leadsStatusOptions}
              height={280}
            />
          </ChartCard>
        </motion.div>
      </motion.div>

      {/* ALERTS TABLE SECTION */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-4"
      >
        <motion.div variants={itemVariants}>
          <ChartCard title="Alertas: Trials próximos a vencer">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-400">
                      Empresa
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-400">
                      Email
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-400">
                      Vence el
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-400">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.alerts?.trialExpiringSoon?.length ? (
                    data.alerts.trialExpiringSoon.map((alert, idx) => {
                      const expiresDate = new Date(alert.trialEndsAt || Date.now());
                      const now = new Date();
                      const daysLeft = Math.ceil(
                        (expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                      );

                      return (
                        <tr
                          key={idx}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors"
                        >
                          <td className="py-3 px-4 text-gray-900 dark:text-white">
                            {alert.name}
                          </td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                            {alert.contactEmail || "—"}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={
                                daysLeft <= 3 ? "destructive" : "secondary"
                              }
                            >
                              {daysLeft} días
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                            >
                              Contactar
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 px-4 text-center text-gray-500">
                        Sin alertas críticas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </motion.div>
      </motion.div>

      {/* RECENT COMPANIES SECTION */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-4 mt-8"
      >
        <motion.div variants={itemVariants}>
          <ChartCard title="Últimas empresas agregadas">
            <div className="space-y-3">
              {data.recent?.companies?.length ? (
                data.recent.companies.map((company, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {company.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        {new Date(company.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {company.planId || "—"}
                      </Badge>
                      <Badge
                        variant={company.status === "active" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {company.status}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-6">
                  Sin empresas agregadas
                </p>
              )}
            </div>
          </ChartCard>
        </motion.div>
      </motion.div>
    </div>
  );
}