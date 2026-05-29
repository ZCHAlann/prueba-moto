"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAssets } from "@/hooks/useAssets";
import { useDrivers } from "@/hooks/useDrivers";
import { useAssignments } from "@/hooks/useAssignments";
import { useMaintenances } from "@/hooks/useMaintenances";
import { useChecklists } from "@/hooks/useChecklists";
import { useAlerts } from "@/hooks/useAlerts";
import { useFuel } from "@/hooks/useFuel";
import { useInventory } from "@/hooks/useInventory";
import { Button } from "@/components/ui/button";
import { DataExportToolbar, type ExportColumn, type ExportRow } from "@/components/ui/data-export-toolbar";
import { InputField } from "@/components/ui/form-controls";
import { EmptyState, StatCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { defaultInsurancePolicies } from "@/features/activos/mock-data";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { defaultGenerators } from "@/features/generadores/mock-data";
import { reportCatalog } from "@/features/reportes/report-config";
import { defaultReports } from "@/features/reportes/mock-data";

type PreviewSummary = {
  label: string;
  value: string;
  detail: string;
  tone: "info" | "success" | "warning" | "danger" | "neutral";
};

type ReportPreview = {
  title: string;
  description: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  summary: PreviewSummary[];
};

type AppliedRange = {
  from: string;
  to: string;
};

type DriverReport = {
  id: string;
  driverId: string;
  driverName: string;
  createdAt: string;
  fuelLevel: string;
  fuelPhotoName: string;
  oilLevel: string;
  oilPhotoName: string;
  vehicleFaults: string;
  faultPhotoNames: string[];
  invoices: Array<{ receiptNumber: string; description: string; photoName: string }>;
};

const DRIVER_REPORT_STORAGE_KEY = "aplismart-driver-reports-v1";

function readStoredDriverReports() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DRIVER_REPORT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DriverReport[]) : [];
  } catch {
    return [];
  }
}

function isInRange(value: string | undefined, range: AppliedRange) {
  if (!value) {
    return true;
  }

  const normalized = value.slice(0, 10);
  if (range.from && normalized < range.from) {
    return false;
  }
  if (range.to && normalized > range.to) {
    return false;
  }
  return true;
}

function formatCurrency(amount: number) {
  return `${amount.toFixed(2)} USD`;
}

function filterRows(rows: ExportRow[], columns: ExportColumn[], query: string) {
  const value = query.trim().toLowerCase();
  if (!value) {
    return rows;
  }

  return rows.filter((row) => columns.some((column) => String(row[column.key] ?? "").toLowerCase().includes(value)));
}

type ReportsPageProps = {
  initialReportId?: string;
};

export function ReportsPage({ initialReportId }: ReportsPageProps) {
  const { confirmAction, notifySuccess } = useFeedback();
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;

  // Hooks del nuevo backend
  const { assets }       = useAssets();
  const { drivers }      = useDrivers();
  const { assignments }  = useAssignments();
  const { maintenances } = useMaintenances();
  const { checklists }   = useChecklists();
  const { alerts }       = useAlerts();
  const { fuelEntries }  = useFuel();
  const { inventory }    = useInventory();

  // reports sigue siendo estático (catálogo de plantillas, no datos del backend)
  const reports = defaultReports;

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [tableQuery, setTableQuery] = useState("");
  const [draftRange, setDraftRange] = useState<AppliedRange>({ from: "", to: "" });
  const [appliedRange, setAppliedRange] = useState<AppliedRange>({ from: "", to: "" });
  const [driverReports] = useState<DriverReport[]>(() => readStoredDriverReports());

  const activeReportId = selectedReportId ?? initialReportId ?? reports[0]?.id ?? "rep-001";
  const activeReport = reports.find((report) => report.id === activeReportId) ?? reports[0];

  const preview = useMemo<ReportPreview>(() => {
    if (!activeReport) {
      return { title: "Sin reporte", description: "No hay reportes disponibles.", columns: [], rows: [], summary: [] };
    }

    if (activeReport.id === "rep-001") {
      const columns: ExportColumn[] = [
        { key: "type", label: "Tipo" },
        { key: "brand", label: "Marca" },
        { key: "plate", label: "Placa" },
        { key: "insuranceExpiry", label: "Fecha Vencimiento Seguro" },
        { key: "insurer", label: "Compania de Seguros" },
        { key: "maintenanceType", label: "Tipo Mantenimiento" },
        { key: "nextMaintenance", label: "Fecha Prox. Mantenimiento" },
        { key: "comments", label: "Comentarios" },
      ];

      const rows = assets.map((asset) => {
        const policy = defaultInsurancePolicies.find((item) => item.assetId === asset.id);
        const maintenance = maintenances.find((item) => item.assetId === asset.id);
        return {
          type: asset.category,
          brand: asset.brand,
          plate: asset.plate,
          insuranceExpiry: policy?.endDate ?? "Sin poliza cargada",
          insurer: policy?.insurer ?? "Pendiente",
          maintenanceType: maintenance?.kind ?? "Preventivo",
          nextMaintenance: asset.nextMaintenance,
          comments: asset.observations,
          __date: asset.nextMaintenance,
        };
      });

      return {
        title: "Reporte gerencial detallado",
        description: "Vista similar a una salida ejecutiva real con seguros, mantenimiento y estado por unidad.",
        columns,
        rows,
        summary: [
          { label: "Unidades", value: assets.length.toString(), detail: "Base actual", tone: "info" },
          { label: "Con poliza", value: rows.filter((row) => String(row.insurer) !== "Pendiente").length.toString(), detail: "Seguro visible", tone: "success" },
          { label: "Criticas", value: assets.filter((asset) => asset.status !== "Operativo").length.toString(), detail: "Requieren accion", tone: "warning" },
        ],
      };
    }

    if (activeReport.id === "rep-002") {
      const columns: ExportColumn[] = [
        { key: "document", label: "Nro. Documento" },
        { key: "name", label: "Nombres" },
        { key: "licenseType", label: "Categoria Licencia" },
        { key: "phone", label: "Nro. Celular" },
        { key: "plate", label: "Nro. Placa" },
        { key: "type", label: "Tipo" },
        { key: "brand", label: "Marca" },
        { key: "status", label: "Estado Asignacion" },
        { key: "date", label: "Fecha Asignacion" },
      ];

      const rows = assignments.map((assignment) => {
        const driver = drivers.find((item) => item.id === assignment.driverId);
        const asset = assets.find((item) => item.id === assignment.assetId);
        return {
          document: driver?.code ?? "Sin codigo",
          name: driver?.name ?? "Sin conductor",
          licenseType: driver?.licenseType ?? "Sin categoria",
          phone: driver?.phone ?? "Sin telefono",
          plate: asset?.plate ?? "Sin placa",
          type: asset?.category ?? "Sin tipo",
          brand: asset?.brand ?? "Sin marca",
          status: assignment.status,
          date: assignment.startDate,
          __date: assignment.startDate,
        };
      });

      return {
        title: "Historial de asignacion de vehiculos a conductores",
        description: "Cruce visible entre conductor, placa y estado de la relacion asignada.",
        columns,
        rows,
        summary: [
          { label: "Asignaciones", value: assignments.length.toString(), detail: "Base historica", tone: "info" },
          { label: "Activas", value: assignments.filter((item) => item.status === "Activa").length.toString(), detail: "En curso", tone: "success" },
          { label: "Con acta", value: assignments.filter((item) => item.handoverFileName).length.toString(), detail: "Soporte PDF", tone: "warning" },
        ],
      };
    }

    if (activeReport.id === "rep-003") {
      const columns: ExportColumn[] = [
        { key: "plate", label: "Placa" },
        { key: "type", label: "Tipo" },
        { key: "brand", label: "Marca" },
        { key: "expenseType", label: "Tipo Gasto" },
        { key: "amount", label: "Importe" },
        { key: "status", label: "Estado" },
        { key: "date", label: "Fecha del Gasto" },
      ];

      const fuelRows = fuelEntries.map((entry) => {
        const asset = assets.find((item) => item.id === entry.assetId);
        return {
          plate: asset?.plate ?? "Sin placa",
          type: asset?.category ?? "Sin tipo",
          brand: asset?.brand ?? "Sin marca",
          expenseType: "Combustible",
          amount: formatCurrency(entry.cost),
          status: "Validado",
          date: entry.date,
          __date: entry.date,
        };
      });

      const maintenanceRows = maintenances.map((entry) => {
        const asset = assets.find((item) => item.id === entry.assetId);
        return {
          plate: asset?.plate ?? "Sin placa",
          type: asset?.category ?? "Sin tipo",
          brand: asset?.brand ?? "Sin marca",
          expenseType: `Mantenimiento ${entry.kind}`,
          amount: formatCurrency(entry.kind === "Correctivo" ? 780 : 340),
          status: entry.status,
          date: entry.scheduledDate,
          __date: entry.scheduledDate,
        };
      });

      const rows = [...fuelRows, ...maintenanceRows].sort((left, right) => String(right.date).localeCompare(String(left.date)));

      return {
        title: "Reporte detallado de gastos vehiculares",
        description: "Salida operativa compacta con gastos por mantenimiento y combustible.",
        columns,
        rows,
        summary: [
          { label: "Movimientos", value: rows.length.toString(), detail: "Registros totales", tone: "info" },
          { label: "Combustible", value: fuelEntries.length.toString(), detail: "Cargas incluidas", tone: "warning" },
          { label: "Mantenimiento", value: maintenances.length.toString(), detail: "OT incluidas", tone: "success" },
        ],
      };
    }

    if (activeReport.id === "rep-004") {
      const columns: ExportColumn[] = [
        { key: "targetKind", label: "Tipo equipo" },
        { key: "equipment", label: "Equipo" },
        { key: "category", label: "Categoria" },
        { key: "status", label: "Estado" },
        { key: "finding", label: "Tiene novedades" },
        { key: "comments", label: "Comentarios" },
        { key: "inspector", label: "Realizado Por" },
        { key: "date", label: "Fecha Checklist" },
      ];

      const rows = checklists.map((entry) => {
        const asset = assets.find((item) => item.id === entry.assetId);
        const issues = entry.items.filter((item) => item.hasItem === "NO" || item.condition !== "Bueno");
        return {
          targetKind: entry.targetKind ?? "Vehiculo",
          equipment: entry.targetLabel || asset?.plate || asset?.name || "Sin equipo",
          category: entry.categoryName || asset?.category || "Sin categoria",
          status: entry.status,
          finding: issues.length > 0 ? `Si (${issues.length})` : "No",
          comments: entry.findings || entry.summary,
          inspector: entry.inspector,
          date: entry.date,
          __date: entry.date,
        };
      });

      return {
        title: "Reporte historico de checklist",
        description: "Inspecciones, resultado y responsable en una sola vista exportable.",
        columns,
        rows,
        summary: [
          { label: "Checklists", value: checklists.length.toString(), detail: "Inspecciones", tone: "info" },
          { label: "Aprobados", value: checklists.filter((item) => item.status === "Aprobado").length.toString(), detail: "Sin observacion", tone: "success" },
          { label: "Observados", value: checklists.filter((item) => item.status === "Observado").length.toString(), detail: "Con hallazgos", tone: "warning" },
        ],
      };
    }

    if (activeReport.id === "rep-005") {
      const columns: ExportColumn[] = [
        { key: "invoice", label: "Factura" },
        { key: "plate", label: "Nro. Placa" },
        { key: "kmStart", label: "Km. Inicial" },
        { key: "kmEnd", label: "Km. Final" },
        { key: "unitPrice", label: "Precio Unitario" },
        { key: "total", label: "Importe Total" },
        { key: "date", label: "Fecha Carga" },
        { key: "station", label: "Estacion" },
      ];

      const rows = fuelEntries.map((entry, index) => {
        const asset = assets.find((item) => item.id === entry.assetId);
        const unitPrice = entry.cost / entry.liters;
        return {
          invoice: `FAC-${String(index + 1).padStart(4, "0")}`,
          plate: asset?.plate ?? "Sin placa",
          kmStart: Math.max(entry.odometer - 420, 0),
          kmEnd: entry.odometer,
          unitPrice: `${unitPrice.toFixed(2)} USD`,
          total: formatCurrency(entry.cost),
          date: entry.date,
          station: entry.station,
          __date: entry.date,
        };
      });

      const driverReportRows = driverReports.map((report, index) => ({
        invoice: `COND-${String(index + 1).padStart(4, "0")}`,
        plate: "Reporte conductor",
        kmStart: "N/A",
        kmEnd: "N/A",
        unitPrice: "N/A",
        total: `${report.invoices.length} factura(s)`,
        date: report.createdAt,
        station: `Combustible ${report.fuelLevel} / Aceite ${report.oilLevel}`,
        __date: report.createdAt,
      }));

      return {
        title: "Reporte historico de cargas de combustible",
        description: "Carga, kilometraje, costo y estacion en estructura similar a reporteria real.",
        columns,
        rows: [...rows, ...driverReportRows],
        summary: [
          { label: "Cargas", value: (fuelEntries.length + driverReports.length).toString(), detail: "Registros emitidos", tone: "info" },
          { label: "Litros", value: fuelEntries.reduce((total, item) => total + item.liters, 0).toFixed(0), detail: "Volumen total", tone: "warning" },
          { label: "Costo", value: formatCurrency(fuelEntries.reduce((total, item) => total + item.cost, 0)), detail: "Acumulado", tone: "success" },
        ],
      };
    }

    if (activeReport.id === "rep-006") {
      const columns: ExportColumn[] = [
        { key: "plate", label: "Nro. Placa" },
        { key: "recordDate", label: "Fecha Registro" },
        { key: "comments", label: "Comentarios" },
        { key: "evidence", label: "Evidencia" },
      ];

      const rows = alerts.map((entry) => {
        const asset = assets.find((item) => item.id === entry.assetId);
        return {
          plate: asset?.plate ?? "Sin placa",
          recordDate: entry.dueDate,
          comments: `${entry.title} / ${entry.notes}`,
          evidence: entry.status === "Cerrada" ? "Gestion completada" : "Seguimiento en curso",
          __date: entry.dueDate,
        };
      });

      const driverReportRows = driverReports.map((report) => ({
        plate: "Reporte conductor",
        recordDate: report.createdAt,
        comments: `${report.driverName}: ${report.vehicleFaults}`,
        evidence: report.faultPhotoNames.length > 0 ? `${report.faultPhotoNames.length} foto(s)` : "Sin evidencia",
        __date: report.createdAt,
      }));

      return {
        title: "Alertas enviadas por conductores",
        description: "Seguimiento de reportes levantados desde ruta o desde la operacion diaria.",
        columns,
        rows: [...rows, ...driverReportRows],
        summary: [
          { label: "Alertas", value: (alerts.length + driverReports.length).toString(), detail: "Base total", tone: "info" },
          { label: "Abiertas", value: alerts.filter((item) => item.status === "Abierta").length.toString(), detail: "Pendientes", tone: "warning" },
          { label: "Cerradas", value: alerts.filter((item) => item.status === "Cerrada").length.toString(), detail: "Resueltas", tone: "success" },
        ],
      };
    }

    const columns: ExportColumn[] = [
      { key: "movementId", label: "ID Mov." },
      { key: "code", label: "Codigo" },
      { key: "description", label: "Descripcion" },
      { key: "location", label: "Ubicacion" },
      { key: "vehicle", label: "Vehiculo (Placa)" },
      { key: "movementType", label: "Tipo Movimiento" },
      { key: "quantity", label: "Cantidad" },
      { key: "movementDate", label: "Fecha Movimiento" },
      { key: "remainingStock", label: "Stock Remanente" },
    ];

    const rows = inventory.map((entry, index) => ({
      movementId: index + 1,
      code: entry.code,
      description: entry.name,
      location: entry.location,
      vehicle: assets[index % assets.length]?.plate ?? "N/A",
      movementType: index % 2 === 0 ? "Stock actual" : "Salida por mantenimiento",
      quantity: index % 2 === 0 ? entry.stock : 1,
      movementDate: `2026-04-${String(10 + index).padStart(2, "0")}`,
      remainingStock: entry.stock,
      __date: `2026-04-${String(10 + index).padStart(2, "0")}`,
    }));

    if (activeReport.id === "rep-008") {
      const columns: ExportColumn[] = [
        { key: "code", label: "Codigo" },
        { key: "name", label: "Equipo" },
        { key: "category", label: "Categoria" },
        { key: "power", label: "Potencia" },
        { key: "fuelType", label: "Combustible" },
        { key: "site", label: "Sede" },
        { key: "responsible", label: "Responsable" },
        { key: "status", label: "Estado" },
        { key: "hours", label: "Horas" },
        { key: "nextMaintenance", label: "Proximo mantenimiento" },
      ];

      const rows = defaultGenerators.map((generator) => ({
        code: generator.code,
        name: generator.name,
        category: generator.category,
        power: generator.power,
        fuelType: generator.fuelType,
        site: generator.site,
        responsible: generator.responsible,
        status: generator.status,
        hours: generator.runtimeHours,
        nextMaintenance: generator.nextMaintenance,
        __date: generator.nextMaintenance,
      }));

      return {
        title: "Reporte generadores",
        description: "Estado, horas de uso y proximos servicios de generadores electricos y equipos de respaldo.",
        columns,
        rows,
        summary: [
          { label: "Equipos", value: defaultGenerators.length.toString(), detail: "Generadores registrados", tone: "info" },
          { label: "Operativos", value: defaultGenerators.filter((item) => item.status === "Operativo").length.toString(), detail: "Listos para respaldo", tone: "success" },
          { label: "Con servicio cercano", value: defaultGenerators.filter((item) => item.nextMaintenance <= "2026-04-30").length.toString(), detail: "Atencion prioritaria", tone: "warning" },
        ],
      };
    }

    return {
      title: "Reporte detallado de inventario y uso de materiales",
      description: "Movimientos de repuestos y stock remanente bajo una vista compacta y exportable.",
      columns,
      rows,
      summary: [
        { label: "Items", value: inventory.length.toString(), detail: "Catalogo actual", tone: "info" },
        { label: "Bajo minimo", value: inventory.filter((item) => item.stock <= item.minStock).length.toString(), detail: "Requieren reposicion", tone: "warning" },
        { label: "Stock total", value: inventory.reduce((total, item) => total + item.stock, 0).toString(), detail: "Unidades acumuladas", tone: "success" },
      ],
    };
  }, [activeReport, alerts, assets, assignments, checklists, driverReports, drivers, fuelEntries, inventory, maintenances]);

  const rangedRows = useMemo(() =>
    preview.rows.filter((row) => isInRange(String(row.__date ?? ""), appliedRange)),
    [appliedRange, preview.rows]
  );
  const visibleRows = useMemo(() =>
    filterRows(rangedRows, preview.columns, tableQuery),
    [preview.columns, rangedRows, tableQuery]
  );

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Reportes"
        title="Reportes"
        subtitle="Centro de reportes con accesos directos, filtros y exportacion para la operacion diaria."
        accent="teal"
      />

      <section className="grid gap-3 md:grid-cols-3">
        {preview.summary.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} detail={item.detail} tone={item.tone} />
        ))}
      </section>

      <TableCard title={preview.title} description={preview.description}>
        <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {reportCatalog.map((report) => (
              <Button key={report.id} tone="teal"
                variant={activeReport.id === report.id ? "solid" : "outline"}
                className="px-3 py-2"
                onClick={() => setSelectedReportId(report.id)}>
                {report.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-[220px_220px_auto]">
              <InputField label="Desde" type="date" value={draftRange.from}
                onChange={(value) => setDraftRange((current) => ({ ...current, from: value }))} accent="teal" />
              <InputField label="Hasta" type="date" value={draftRange.to}
                onChange={(value) => setDraftRange((current) => ({ ...current, to: value }))} accent="teal" />
              <div className="flex items-end gap-3">
                <Button tone="teal" variant="solid" className="px-4 py-2.5"
                  onClick={async () => {
                    await confirmAction({
                      title: "Consultar reporte",
                      description: "Se aplicara el rango de fechas actual al reporte visible.",
                      confirmLabel: "Consultar",
                      accent: "teal",
                      successTitle: "Reporte consultado",
                      successDescription: "La salida ya refleja el rango seleccionado.",
                      summary: [
                        { label: "Reporte", value: preview.title },
                        { label: "Desde", value: draftRange.from || "Inicio abierto" },
                        { label: "Hasta", value: draftRange.to || "Fin abierto" },
                      ],
                      action: async () => {
                        setAppliedRange(draftRange);
                        notifySuccess("Consulta aplicada", "El reporte ya se actualizo.");
                      },
                    });
                  }}>
                  Consultar
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              <p className="font-semibold text-neutral-900">Rango aplicado</p>
              <p className="mt-1">{appliedRange.from || "Inicio abierto"} / {appliedRange.to || "Fin abierto"}</p>
            </div>
          </div>
        </div>

        <DataExportToolbar
          title={preview.title}
          filenameBase={activeReport?.name || preview.title}
          subtitle={`${preview.description} Rango: ${appliedRange.from || "Inicio abierto"} a ${appliedRange.to || "Fin abierto"}.`}
          columns={preview.columns}
          rows={visibleRows}
          summaryItems={preview.summary}
          accent="teal"
          searchValue={tableQuery}
          onSearchChange={setTableQuery}
          searchPlaceholder="Buscar dentro del reporte"
        />

        {visibleRows.length === 0 ? (
          <EmptyState title="Sin registros" description="No existen filas para el rango o filtro actual." />
        ) : (
          <Table minWidth={preview.columns.length > 8 ? "min-w-[1480px]" : "min-w-[1120px]"}>
            <TableHead>
              <tr>
                {preview.columns.map((column) => (
                  <th key={column.key} className="px-4 py-3 font-semibold">{column.label}</th>
                ))}
              </tr>
            </TableHead>
            <TableBody>
              {visibleRows.map((row, index) => (
                <tr key={`${String(row[preview.columns[0]?.key] ?? "row")}-${index}`} className="hover:bg-neutral-50">
                  {preview.columns.map((column) => (
                    <td key={column.key} className="px-4 py-3.5 text-neutral-700">{String(row[column.key] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}

