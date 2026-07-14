import { usePlatformStats } from "@/hooks/usePlatformStats";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartEmptyState } from "@/components/dashboard/chart-empty-state";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { ArrowUpRight, ArrowDownRight, Clock, TrendingUp } from "lucide-react";
import { fmtDateShortEc } from "@/lib/datetime";

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
  // jul 2026 v6 — Los KPIs ahora reflejan el dominio real (empresas +
  // usuarios + estado de salud), no leads. Los leads del CRM no se
  // usan, así que se removieron del dashboard.
  const totalCompanies  = data.companies.total;
  const activeCompanies = data.companies.active;
  const trialCompanies  = data.companies.trial;
  const suspendedCompanies = data.companies.suspended;
  const inactiveCompanies  = data.companies.inactive;
  const newThisMonth    = data.companies.newThisMonth;
  const growthMoM       = data.companies.growthMoM;
  const totalUsers       = data.users.total;
  const activeUsers      = data.users.active;
  const trialExpiringSoon = data.alerts.trialExpiringSoon.length;

  // Las labels de los 12 meses vienen del backend (`/platform/stats`)
  // y reflejan la ventana real "hace 11 meses → mes actual", NO un
  // año calendario fijo. Si el backend no las manda (compat), caemos
  // a un fallback Ene..Dic — pero el backend SIEMPRE las manda desde
  // jul 2026 v6+.
  const monthLabels: string[] =
    (data as any).monthLabels ?? [
      "Ene", "Feb", "Mar", "Abr", "May", "Jun",
      "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
    ];

  // ============= SERIES DATA PARA GRÁFICAS =============

  // Línea: Crecimiento de empresas en los últimos 12 meses.
  const lineChartSeries = [
    {
      name: "Empresas nuevas",
      data: data.companies.newByMonth || [],
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
    colors: ["#465fff"],
    xaxis: {
      categories: monthLabels,
      labels: { style: { colors: "rgba(255,255,255,0.5)" } },
    },
    yaxis: {
      labels: { style: { colors: "rgba(255,255,255,0.5)" } },
      forceNiceScale: true,
    },
    legend: { position: "top", horizontalAlign: "left" },
    dataLabels: { enabled: false },
  };

  // Donut: Empresas por plan (Free / Starter / Pro / Enterprise).
  // Este sí tiene sentido — refleja la distribución comercial de la base.
  const donutChartSeries = data.companies.byPlan?.map(p => p.total) || [];
  const donutChartLabels = data.companies.byPlan?.map(p => p.planName) || [];

  const donutChartOptions: ApexOptions = {
    ...baseChartOptions,
    chart: {
      ...baseChartOptions.chart,
      type: "donut",
    },
    colors: ["#465fff", "#7a5af8", "#ee46bc", "#fdb022", "#12b76a"],
    labels: donutChartLabels,
    legend: { position: "bottom", horizontalAlign: "center" },
    plotOptions: {
      pie: { donut: { size: "65%" } },
    },
  };

  // Barras verticales: distribución de empresas por estado. Esto es lo
  // que el superadmin mira en realidad — cuántas están activas, cuántas
  // en trial, cuántas suspendidas/inactivas (pérdida de revenue).
  const statusBarSeries = [
    {
      name: "Empresas",
      data: [activeCompanies, trialCompanies, suspendedCompanies, inactiveCompanies],
    },
  ];

  const statusBarOptions: ApexOptions = {
    ...baseChartOptions,
    chart: {
      ...baseChartOptions.chart,
      type: "bar",
    },
    colors: ["#465fff"],
    xaxis: {
      categories: ["Activas", "En trial", "Suspendidas", "Inactivas"],
      labels: { style: { colors: "rgba(255,255,255,0.5)" } },
    },
    yaxis: {
      labels: { style: { colors: "rgba(255,255,255,0.5)" } },
      forceNiceScale: true,
    },
    plotOptions: {
      bar: { columnWidth: "55%", horizontal: false, borderRadius: 4 },
    },
    legend: { show: false },
    dataLabels: {
      enabled: true,
      style: { fontSize: "11px", fontWeight: 600, colors: ["#fff"] },
    },
  };

  // Stacked bar: altas vs bajas del último año (proxy de revenue churn).
  // Si `data.companies.newByMonth` viene de los últimos 12 meses, las
  // "bajas" las estimamos como `newByMonth.shift() - newThisMonth`
  // (desgaste natural). Si no hay datos, el chart se muestra vacío
  // y el ChartEmptyState lo cubre.
  const churnSeries = [
    {
      name: "Nuevas",
      data: data.companies.newByMonth || Array(12).fill(0),
    },
    {
      name: "Perdidas (est.)",
      // estimación simple: diferencia con el mes anterior cuando es negativa.
      // Si no se puede estimar, queda en 0.
      data: (data.companies.newByMonth || []).map((v, i, arr) => {
        if (i === 0) return 0;
        const prev = arr[i - 1] ?? 0;
        return prev > v ? prev - v : 0;
      }),
    },
  ];

  const churnOptions: ApexOptions = {
    ...baseChartOptions,
    chart: {
      ...baseChartOptions.chart,
      type: "bar",
      stacked: true,
    },
    colors: ["#12b76a", "#f04438"],
    xaxis: {
      categories: monthLabels,
      labels: { style: { colors: "rgba(255,255,255,0.5)" } },
    },
    yaxis: {
      labels: { style: { colors: "rgba(255,255,255,0.5)" } },
      forceNiceScale: true,
    },
    plotOptions: {
      bar: { columnWidth: "55%", horizontal: false, borderRadius: 4 },
    },
    legend: { position: "top", horizontalAlign: "left" },
    dataLabels: { enabled: false },
  };

  // (Las series/charts se derivan arriba. Bloque legacy leads
  // removido: ya no usamos `data.leads.*` en el dashboard de
  // superadmin — el módulo Comercial fue retirado.)

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
          Superadmin
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
            badge={
              growthMoM !== null
                ? `${growthMoM > 0 ? '+' : ''}${growthMoM}%`
                : undefined
            }
            tone={growthMoM !== null && growthMoM > 0 ? "success" : "error"}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard
            label="Empresas en trial"
            value={String(trialCompanies)}
            icon={<Clock className="w-4 h-4" />}
            badge={
              trialExpiringSoon > 0
                ? `${trialExpiringSoon} por vencer`
                : undefined
            }
            tone="warning"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard
            label="Usuarios totales"
            value={String(totalUsers)}
            icon={<TrendingUp className="w-4 h-4" />}
            badge={
              totalUsers > 0
                ? `${activeUsers} activos`
                : undefined
            }
            tone="brand"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard
            label="Empresas suspendidas"
            value={String(suspendedCompanies + inactiveCompanies)}
            icon={<TrendingUp className="w-4 h-4" />}
            tone={
              suspendedCompanies + inactiveCompanies > 0
                ? "error"
                : "success"
            }
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
          <ChartCard title="Empresas nuevas (últimos 12 meses)">
            {lineChartSeries[0].data.some(v => v > 0) ? (
              <ReactApexChart
                type="line"
                series={lineChartSeries}
                options={lineChartOptions}
                height={320}
              />
            ) : (
              <ChartEmptyState
                message="Sin altas en los últimos 12 meses"
                hint="Las nuevas empresas aparecerán acá cuando se registren."
                minHeight={320}
              />
            )}
          </ChartCard>
        </motion.div>
        <motion.div variants={itemVariants}>
          <ChartCard title="Distribución por plan">
            {donutChartSeries.length > 0 && donutChartSeries.some(v => v > 0) ? (
              <ReactApexChart
                type="donut"
                series={donutChartSeries}
                options={donutChartOptions}
                height={320}
              />
            ) : (
              <ChartEmptyState
                message="Sin empresas asignadas a planes"
                hint="Cuando asignes planes a empresas, vas a ver la distribución acá."
                minHeight={320}
              />
            )}
          </ChartCard>
        </motion.div>
      </motion.div>

      {/* STATUS + CHURN SECTION */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8"
      >
        <motion.div variants={itemVariants}>
          <ChartCard title="Estado de las empresas">
            {totalCompanies > 0 ? (
              <ReactApexChart
                type="bar"
                series={statusBarSeries}
                options={statusBarOptions}
                height={280}
              />
            ) : (
              <ChartEmptyState
                message="Sin empresas registradas"
                hint="Las altas de empresas se reflejarán acá."
                minHeight={280}
              />
            )}
          </ChartCard>
        </motion.div>
        <motion.div variants={itemVariants}>
          <ChartCard title="Altas vs bajas (estimado)">
            {newThisMonth > 0 ||
            (data.companies.newByMonth || []).some(v => v > 0) ? (
              <ReactApexChart
                type="bar"
                series={churnSeries}
                options={churnOptions}
                height={280}
              />
            ) : (
              <ChartEmptyState
                message="Sin movimiento en los últimos 12 meses"
                hint="Las altas y bajas mensuales aparecerán acá."
                minHeight={280}
              />
            )}
          </ChartCard>
        </motion.div>
      </motion.div>

      {/* (El chart "Leads por estado del pipeline" se removió:
          el módulo Comercial fue retirado y ya no hay leads. El
          foco del superadmin es empresas/planes/usuarios/churn.) */}

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
                          <td className="bg-transparent group-hover:bg-white/5 py-3 px-4">
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
                        {fmtDateShortEc(company.createdAt)}
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