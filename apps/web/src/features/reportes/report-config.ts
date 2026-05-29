export const reportCatalog = [
  { id: "rep-001", slug: "general", label: "Reporte General", description: "Vista consolidada de unidades y estado" },
  { id: "rep-002", slug: "vehiculos-asignados", label: "Vehiculos Asignados", description: "Relacion entre conductor y vehiculo" },
  { id: "rep-003", slug: "gastos-realizados", label: "Gastos Realizados!", description: "Combustible y mantenimiento acumulado" },
  { id: "rep-004", slug: "checklist", label: "Reporte Checklist", description: "Inspecciones y evidencia operativa" },
  { id: "rep-005", slug: "combustible", label: "Reporte Combustible", description: "Cargas, kilometraje y estaciones" },
  { id: "rep-006", slug: "alertas-conductores", label: "Alertas Enviadas por Conductores", description: "Seguimiento a reportes levantados en ruta" },
  { id: "rep-007", slug: "inventarios", label: "Reporte Inventarios", description: "Stock y movimientos de repuestos" },
  { id: "rep-008", slug: "generadores", label: "Reporte Generadores", description: "Estado y mantenimientos de generadores" },
] as const;

export const reportSlugToId = Object.fromEntries(reportCatalog.map((report) => [report.slug, report.id])) as Record<
  (typeof reportCatalog)[number]["slug"],
  (typeof reportCatalog)[number]["id"]
>;
