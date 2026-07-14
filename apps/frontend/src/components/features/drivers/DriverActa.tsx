import { FileText, Pencil } from "lucide-react";

/**
 * Subset of fields returned by `serializeAssignment` that the Acta card needs.
 * Lives here (not in hooks/types) so the component is drop-in usable from
 * any page (Drivers list drawer, ProfilePage, Asignaciones drawer, etc.).
 */
export interface ActaCardData {
  actaNumber?: string | null;
  actaDate?: string | null;
  actaTime?: string | null;
  actaPlace?: string | null;
  actaArea?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  handoverUrl?: string | null;
  signatureLogUrl?: string | null;
  signatureRespUrl?: string | null;
  // jul 2026 — datos del vehículo expuesto en el root del acta (no sólo
  // dentro de vehicleSnapshot) para que pantallas como Alertas puedan
  // mostrarlos sin tener que mergear con un GET /assets/:id extra.
  assetId?:    string | null;
  plate?:      string | null;
  assetName?:  string | null;
  assetBrand?: string | null;
  assetModel?: string | null;
  vehicleSnapshot?: {
    id?: string | null;
    name?: string | null;
    plate?: string | null;
  } | null;
}

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Tarjeta "Acta de asignación" usada en:
 *   - Drawer de detalle de conductor (DriversPage).
 *   - ProfilePage (conductor consulta su propia acta).
 *
 * Recibe el `acta` ya serializado por backend (helper `resolveDriverActa`).
 */
export function DriverActa({ acta }: { acta: ActaCardData }) {
  const veh = acta.vehicleSnapshot;
  const items: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Fecha del acta", value: fmtDate(acta.actaDate) },
    { label: "Hora",           value: acta.actaTime || "—" },
    { label: "Lugar",          value: acta.actaPlace || "—" },
    { label: "Área",           value: acta.actaArea || "—" },
    { label: "Inicio",         value: fmtDate(acta.startDate) },
    { label: "Fin",            value: fmtDate(acta.endDate) },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.label} className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{it.label}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-gray-700 dark:text-gray-200">
              {it.value ?? "—"}
            </p>
          </div>
        ))}
        {veh && (veh.plate || veh.name) && (
          <div className="col-span-2 min-w-0 rounded-lg border border-gray-100 bg-white px-2.5 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Vehículo</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-gray-700 dark:text-gray-200">
              {veh.plate || "—"}{veh.name ? ` · ${veh.name}` : ""}
            </p>
          </div>
        )}
      </div>
      {(acta.handoverUrl || acta.signatureLogUrl || acta.signatureRespUrl) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {acta.handoverUrl && (
            <a
              href={acta.handoverUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
            >
              <FileText size={11} /> Acta
            </a>
          )}
          {acta.signatureLogUrl && (
            <a
              href={acta.signatureLogUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]"
            >
              <Pencil size={11} /> Firma logística
            </a>
          )}
          {acta.signatureRespUrl && (
            <a
              href={acta.signatureRespUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]"
            >
              <Pencil size={11} /> Firma responsable
            </a>
          )}
        </div>
      )}
    </>
  );
}

export default DriverActa;
