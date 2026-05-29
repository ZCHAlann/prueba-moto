"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useFleetOps } from "@/components/providers/fleetops-provider";
import { useDrivers } from "@/hooks/useDrivers";
import { Button } from "@/components/ui/button";
import {
  DataExportToolbar,
  type ExportColumn,
  type ExportRow,
} from "@/components/ui/data-export-toolbar";
import { ImageGalleryField } from "@/components/ui/image-gallery-field";
import { SelectField, TextareaField, InputField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";

const exportColumns: ExportColumn[] = [
  { key: "licenseNumber", label: "# Licencia" },
  { key: "firstName", label: "Nombres" },
  { key: "lastName", label: "Apellidos" },
  { key: "licenseType", label: "Tipo licencia" },
  { key: "licenseExpiry", label: "Vigencia" },
  { key: "licensePoints", label: "Puntos" },
  { key: "email", label: "Correo" },
  { key: "phone", label: "Telefono" },
  { key: "site", label: "Sede" },
  { key: "status", label: "Estado" },
];

type FluidLevel = "1/4" | "1/2" | "3/4" | "Lleno";

type DriverInvoiceDraft = {
  receiptNumber: string;
  description: string;
  photoName: string;
};

type DriverReport = {
  id: string;
  driverId: string;
  driverName: string;
  createdAt: string;
  fuelLevel: FluidLevel;
  fuelPhotoName: string;
  oilLevel: FluidLevel;
  oilPhotoName: string;
  vehicleFaults: string;
  faultPhotoNames: string[];
  invoices: DriverInvoiceDraft[];
};

type ReportFormState = {
  driverId: string;
  fuelLevel: FluidLevel;
  fuelPhotoName: string;
  oilLevel: FluidLevel;
  oilPhotoName: string;
  vehicleFaults: string;
  faultPhotoNames: string[];
  invoices: DriverInvoiceDraft[];
};

const REPORT_STORAGE_KEY = "aplismart-driver-reports-v1";
const levelOptions: Array<{ value: FluidLevel; label: string }> = [
  { value: "1/4", label: "1/4" },
  { value: "1/2", label: "1/2" },
  { value: "3/4", label: "3/4" },
  { value: "Lleno", label: "Lleno" },
];

function createReportForm(driverId = ""): ReportFormState {
  return {
    driverId,
    fuelLevel: "1/2",
    fuelPhotoName: "",
    oilLevel: "1/2",
    oilPhotoName: "",
    vehicleFaults: "",
    faultPhotoNames: [],
    invoices: [{ receiptNumber: "", description: "", photoName: "" }],
  };
}

function nowStamp() {
  const date = new Date();
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  const h = `${date.getHours()}`.padStart(2, "0");
  const min = `${date.getMinutes()}`.padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}

export function DriversPage() {
  // ── nuevo hook ──────────────────────────────────────────────────────────────
  const { drivers, loading, deleteDriver } = useDrivers();

  // ── solo can() del provider viejo ───────────────────────────────────────────
  const { can } = useFleetOps();

  const { confirmAction, notifyError } = useFeedback();
  const [query, setQuery] = useState("");
  const [reports, setReports] = useState<DriverReport[]>([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportForm, setReportForm] = useState<ReportFormState>(() => createReportForm());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REPORT_STORAGE_KEY);
      setReports(raw ? (JSON.parse(raw) as DriverReport[]) : []);
    } catch {
      setReports([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(reports));
  }, [reports]);

  const filteredDrivers = useMemo(() => {
    const value = query.trim().toLowerCase();
    return drivers.filter((driver) =>
      value.length === 0 ||
      driver.code.toLowerCase().includes(value) ||
      driver.name.toLowerCase().includes(value) ||
      driver.firstName.toLowerCase().includes(value) ||
      driver.lastName.toLowerCase().includes(value) ||
      driver.licenseNumber.toLowerCase().includes(value) ||
      driver.email.toLowerCase().includes(value) ||
      driver.site.toLowerCase().includes(value) ||
      driver.licenseType.toLowerCase().includes(value) ||
      driver.phone.toLowerCase().includes(value)
    );
  }, [drivers, query]);

  const exportRows = filteredDrivers.map<ExportRow>((driver) => ({
    licenseNumber: driver.licenseNumber,
    firstName: driver.firstName,
    lastName: driver.lastName,
    licenseType: driver.licenseType,
    licenseExpiry: driver.licenseExpiry,
    licensePoints: String(driver.licensePoints),
    email: driver.email,
    phone: driver.phone,
    site: driver.site,
    status: driver.status,
  }));

  const recentReports = useMemo(
    () => reports.filter((r) => drivers.some((d) => d.id === r.driverId)).slice(0, 8),
    [drivers, reports]
  );

  const openReportModal = (driverId = filteredDrivers[0]?.id ?? "") => {
    if (drivers.length === 0) {
      notifyError("Sin conductores", "Primero registra un conductor para crear reportes operativos.");
      return;
    }
    setReportForm(createReportForm(driverId || drivers[0]?.id || ""));
    setIsReportModalOpen(true);
  };

  const updateInvoice = (index: number, patch: Partial<DriverInvoiceDraft>) => {
    setReportForm((current) => ({
      ...current,
      invoices: current.invoices.map((inv, i) => (i === index ? { ...inv, ...patch } : inv)),
    }));
  };

  const saveDriverReport = async () => {
    const selectedDriver = drivers.find((d) => d.id === reportForm.driverId);
    if (!selectedDriver) {
      notifyError("Selecciona un conductor", "El reporte debe estar vinculado a un conductor activo.");
      return;
    }
    if (!reportForm.vehicleFaults.trim()) {
      notifyError("Describe la novedad", "Escribe si hay fallas del vehículo o registra que no se encontraron fallas.");
      return;
    }
    await confirmAction({
      title: "Crear reporte del conductor",
      description: "Se registrará el estado operativo informado por el conductor.",
      confirmLabel: "Guardar reporte",
      accent: "cyan",
      successTitle: "Reporte creado",
      successDescription: "El reporte ya quedó asociado al conductor.",
      summary: [
        { label: "Conductor", value: selectedDriver.name },
        { label: "Combustible", value: reportForm.fuelLevel },
        { label: "Aceite", value: reportForm.oilLevel },
        { label: "Facturas", value: String(reportForm.invoices.filter((inv) => inv.receiptNumber || inv.description || inv.photoName).length) },
      ],
      action: async () => {
        const report: DriverReport = {
          id: `driver-report-${Date.now()}`,
          driverId: selectedDriver.id,
          driverName: selectedDriver.name,
          createdAt: nowStamp(),
          fuelLevel: reportForm.fuelLevel,
          fuelPhotoName: reportForm.fuelPhotoName,
          oilLevel: reportForm.oilLevel,
          oilPhotoName: reportForm.oilPhotoName,
          vehicleFaults: reportForm.vehicleFaults.trim(),
          faultPhotoNames: reportForm.faultPhotoNames,
          invoices: reportForm.invoices.filter(
            (inv) => inv.receiptNumber.trim() || inv.description.trim() || inv.photoName.trim()
          ),
        };
        setReports((current) => [report, ...current]);
        setIsReportModalOpen(false);
      },
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <ModulePageHeader badge="Modulo operativo" title="Conductores" subtitle="Cargando conductores…" accent="cyan" />
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Modulo operativo"
        title="Conductores"
        subtitle="Vista compacta para alta, consulta y control del personal asignable."
        accent="cyan"
      />

      <section className="grid gap-3 md:grid-cols-3">
        <StatCard label="Conductores" value={drivers.length.toString()} detail="Base total de la empresa" tone="info" />
        <StatCard label="Activos" value={drivers.filter((d) => d.status === "Activo").length.toString()} detail="Disponibles para asignacion" tone="success" />
        <StatCard label="Inactivos" value={drivers.filter((d) => d.status === "Inactivo").length.toString()} detail="Fuera de operacion" tone="warning" />
      </section>

      <TableCard title="Listado de conductores" description="Busqueda, exportacion y acciones por fila.">
        <DataExportToolbar
          title="conductores-apli-smart-motors"
          columns={exportColumns}
          rows={exportRows}
          accent="cyan"
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Buscar por licencia, nombre, correo o sede"
          leadingContent={
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/operaciones/conductores/nuevo" className="inline-flex">
                <Button tone="cyan" variant="solid" className="px-3 py-2">Nuevo conductor</Button>
              </Link>
              <Button tone="cyan" variant="outline" className="px-3 py-2" onClick={() => openReportModal()}>
                Crear reporte
              </Button>
              <Link href="/gestion/sedes" className="inline-flex">
                <Button tone="neutral" variant="outline" className="px-3 py-2">Gestionar sedes</Button>
              </Link>
            </div>
          }
        />

        {filteredDrivers.length === 0 ? (
          <EmptyState title="Sin conductores" description="No hay coincidencias para los filtros actuales." />
        ) : (
          <Table minWidth="min-w-[1120px]">
            <TableHead>
              <tr>
                <th className="px-4 py-3 font-semibold"># Licencia</th>
                <th className="px-4 py-3 font-semibold">Chofer</th>
                <th className="px-4 py-3 font-semibold">Tipo / vigencia</th>
                <th className="px-4 py-3 font-semibold">Puntos</th>
                <th className="px-4 py-3 font-semibold">Contacto</th>
                <th className="px-4 py-3 font-semibold">Sede</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </TableHead>
            <TableBody>
              {filteredDrivers.map((driver) => (
                <tr key={driver.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3.5 font-semibold text-neutral-950">{driver.licenseNumber}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-neutral-950">{driver.firstName} {driver.lastName}</p>
                    <p className="mt-1 text-xs text-neutral-500">{driver.notes}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p>{driver.licenseType}</p>
                    <p className="mt-1 text-xs text-neutral-500">{driver.licenseExpiry}</p>
                  </td>
                  <td className="px-4 py-3.5">{driver.licensePoints}</td>
                  <td className="px-4 py-3.5">
                    <p>{driver.phone}</p>
                    <p className="mt-1 text-xs text-neutral-500">{driver.email || "Sin correo"}</p>
                  </td>
                  <td className="px-4 py-3.5">{driver.site}</td>
                  <td className="px-4 py-3.5">
                    <StatusPill label={driver.status} tone={driver.status === "Activo" ? "success" : "warning"} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      <Link
                        href={`/operaciones/conductores/${driver.id}/editar`}
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-cyan-300 hover:text-cyan-700"
                      >
                        Editar
                      </Link>
                      <button
                        type="button"
                        onClick={() => openReportModal(driver.id)}
                        className="rounded-lg border border-cyan-200 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
                      >
                        Reporte
                      </button>
                      <button
                        type="button"
                        disabled={!can("drivers.manage")}
                        onClick={async () => {
                          if (!can("drivers.manage")) return;
                          await confirmAction({
                            title: "Eliminar conductor",
                            description: "Se retirara el conductor de la empresa y se cerraran sus asignaciones vigentes.",
                            confirmLabel: "Confirmar eliminacion",
                            accent: "rose",
                            successTitle: "Conductor eliminado",
                            successDescription: "El conductor ya no forma parte de la base operativa.",
                            summary: [
                              { label: "# licencia", value: driver.licenseNumber },
                              { label: "Nombre", value: driver.name },
                              { label: "Licencia", value: `${driver.licenseType} / ${driver.licenseExpiry}` },
                              { label: "Sede", value: driver.site },
                            ],
                            action: async () => { await deleteDriver(driver.id); },
                          });
                        }}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>

      <TableCard title="Reportes creados por conductores" description="Registro visible para seguimiento operativo.">
        {recentReports.length === 0 ? (
          <EmptyState title="Sin reportes de conductores" description="Cuando un conductor registre combustible, aceite, fallas o facturas aparecerá aquí." />
        ) : (
          <Table minWidth="min-w-[980px]">
            <TableHead>
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Conductor</th>
                <th className="px-4 py-3 font-semibold">Combustible</th>
                <th className="px-4 py-3 font-semibold">Aceite</th>
                <th className="px-4 py-3 font-semibold">Fallas</th>
                <th className="px-4 py-3 font-semibold">Facturas</th>
              </tr>
            </TableHead>
            <TableBody>
              {recentReports.map((report) => (
                <tr key={report.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3.5 font-medium text-neutral-950">{report.createdAt}</td>
                  <td className="px-4 py-3.5">{report.driverName}</td>
                  <td className="px-4 py-3.5">
                    <p>{report.fuelLevel}</p>
                    <p className="mt-1 text-xs text-neutral-500">{report.fuelPhotoName || "Sin foto"}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p>{report.oilLevel}</p>
                    <p className="mt-1 text-xs text-neutral-500">{report.oilPhotoName || "Sin foto"}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="line-clamp-2">{report.vehicleFaults}</p>
                    <p className="mt-1 text-xs text-neutral-500">{report.faultPhotoNames.length} foto(s)</p>
                  </td>
                  <td className="px-4 py-3.5">{report.invoices.length}</td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>

      {isReportModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/45 px-4 py-5 backdrop-blur-sm">
          <SurfaceCard className="max-h-[88vh] w-full max-w-4xl overflow-y-auto border-neutral-200">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
              <div>
                <h2 className="text-xl font-bold text-neutral-950">Crear reporte del conductor</h2>
                <p className="mt-1 text-sm text-neutral-500">Registra combustible, aceite, fallas y facturas en un solo flujo.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-50"
              >
                Cerrar
              </button>
            </div>
            <form className="space-y-4 px-5 py-5" onSubmit={async (e) => { e.preventDefault(); await saveDriverReport(); }}>
              <SelectField
                label="Conductor"
                value={reportForm.driverId}
                onChange={(value) => setReportForm((c) => ({ ...c, driverId: value }))}
                accent="cyan"
                options={drivers.map((d) => ({ value: d.id, label: `${d.name} / ${d.licenseNumber}` }))}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <SurfaceCard className="p-4">
                  <div className="grid gap-4">
                    <SelectField label="Nivel de combustible" value={reportForm.fuelLevel} onChange={(v) => setReportForm((c) => ({ ...c, fuelLevel: v as FluidLevel }))} accent="cyan" options={levelOptions} />
                    <ImageGalleryField label="Foto de combustible" values={reportForm.fuelPhotoName ? [reportForm.fuelPhotoName] : []} onChange={(urls) => setReportForm((c) => ({ ...c, fuelPhotoName: urls[0] ?? "" }))} uploadEndpoint="driver-photos" maxFiles={1} accent="cyan" />
                  </div>
                </SurfaceCard>
                <SurfaceCard className="p-4">
                  <div className="grid gap-4">
                    <SelectField label="Nivel de aceite" value={reportForm.oilLevel} onChange={(v) => setReportForm((c) => ({ ...c, oilLevel: v as FluidLevel }))} accent="cyan" options={levelOptions} />
                    <ImageGalleryField label="Foto de aceite" values={reportForm.oilPhotoName ? [reportForm.oilPhotoName] : []} onChange={(urls) => setReportForm((c) => ({ ...c, oilPhotoName: urls[0] ?? "" }))} uploadEndpoint="driver-photos" maxFiles={1} accent="cyan" />
                  </div>
                </SurfaceCard>
              </div>
              <SurfaceCard className="p-4">
                <TextareaField label="Fallas del vehículo" value={reportForm.vehicleFaults} onChange={(v) => setReportForm((c) => ({ ...c, vehicleFaults: v }))} accent="cyan" rows={4} placeholder="Describe las fallas encontradas o escribe Sin novedades." />
                <ImageGalleryField label="Fotos de fallas" values={reportForm.faultPhotoNames} onChange={(urls) => setReportForm((c) => ({ ...c, faultPhotoNames: urls }))} uploadEndpoint="driver-photos" maxFiles={10} accent="cyan" hint="Puedes subir varias fotos de las novedades encontradas." />
              </SurfaceCard>
              <SurfaceCard className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-neutral-950">Facturas</h3>
                    <p className="text-sm text-neutral-500">Puedes agregar más de una factura al mismo reporte.</p>
                  </div>
                  <Button type="button" tone="cyan" variant="outline" onClick={() => setReportForm((c) => ({ ...c, invoices: [...c.invoices, { receiptNumber: "", description: "", photoName: "" }] }))}>
                    Agregar factura
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  {reportForm.invoices.map((inv, index) => (
                    <div key={index} className="grid gap-3 rounded-lg border border-neutral-200 p-3 lg:grid-cols-[1fr_1.4fr_1fr_auto]">
                      <InputField label="Número de comprobante" value={inv.receiptNumber} onChange={(v) => updateInvoice(index, { receiptNumber: v })} accent="cyan" />
                      <InputField label="Descripción" value={inv.description} onChange={(v) => updateInvoice(index, { description: v })} accent="cyan" />
                      <ImageGalleryField label="Foto de factura" values={inv.photoName ? [inv.photoName] : []} onChange={(urls) => updateInvoice(index, { photoName: urls[0] ?? "" })} uploadEndpoint="driver-photos" maxFiles={1} accent="cyan" />
                      <button type="button" onClick={() => setReportForm((c) => ({ ...c, invoices: c.invoices.filter((_, i) => i !== index) }))} className="self-end rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
              <div className="flex justify-end gap-3 border-t border-neutral-200 pt-4">
                <Button type="button" tone="neutral" variant="outline" onClick={() => setIsReportModalOpen(false)}>Cancelar</Button>
                <Button type="submit" tone="cyan" variant="solid">Guardar reporte</Button>
              </div>
            </form>
          </SurfaceCard>
        </div>
      ) : null}
    </div>
  );
}