// components/features/pdf/MaintenanceDetailPdf.tsx
// PDF individual de un mantenimiento (un solo OT, con timeline, items y
// resumen financiero). Estilo empresarial, sin emojis.

import { pdf, Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Maintenance, MaintenanceEvent } from "../../hooks/useMaintenancesV2";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#0f172a",
    paddingTop: 30,
    paddingBottom: 30,
    paddingHorizontal: 36,
  },
  title:    { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 9,  color: "#475569", marginBottom: 14 },
  divider:  { borderBottom: "1pt solid #cbd5e1", marginBottom: 12 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginTop: 14,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row:        { flexDirection: "row", marginBottom: 3 },
  label:      { width: 130, color: "#64748b" },
  value:      { flex: 1, color: "#0f172a" },
  itemRow:    { flexDirection: "row", borderBottom: "0.5pt solid #e2e8f0", paddingVertical: 4, alignItems: "center" },
  itemName:   { flex: 2, fontSize: 9 },
  itemQty:    { width: 50, fontSize: 9, textAlign: "right" },
  itemUnit:   { width: 80, fontSize: 9, textAlign: "right" },
  itemSub:    { width: 90, fontSize: 9, textAlign: "right", fontFamily: "Helvetica-Bold" },
  totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#0f172a" },
  totalAmount:{ fontFamily: "Helvetica-Bold", fontSize: 14, color: "#0f172a", textAlign: "right" },
  timelineEntry: { flexDirection: "row", marginBottom: 4 },
  timelineDot:   { width: 10, color: "#3b82f6" },
  timelineDate:  { width: 130, fontSize: 8, color: "#475569" },
  timelineText:  { flex: 1, fontSize: 9, color: "#0f172a" },
  footer:        { position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", fontSize: 8, color: "#94a3b8" },
});

const STATUS_LABEL: Record<string, string> = {
  Programado:   "Programado",
  "En proceso": "En proceso",
  Completado:   "Completado",
};

const TYPE_LABEL: Record<string, string> = {
  Preventivo: "Preventivo",
  Correctivo: "Correctivo",
  Programado: "Programado",
};

const EVENT_LABEL: Record<string, string> = {
  created:         "Mantenimiento creado",
  assigned:        "Asignado a un operador",
  reassigned:       "Reasignado",
  taken:           "Operador tomo el mantenimiento",
  item_added:      "Repuestos agregados",
  note_added:      "Nota agregada",
  photo_uploaded:  "Foto subida",
  cancelled:       "Cancelado y reprogramado",
  finalized:       "Finalizado como completado",
  viewed:          "Visualizado por un usuario",
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtDateTime = (iso?: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

function MaintenanceDetailDocument({ m }: { m: Maintenance }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{m.title ?? "Mantenimiento"}</Text>
        <Text style={s.subtitle}>
          Folio {m.id}  ·  {STATUS_LABEL[m.status] ?? m.status}  ·  {TYPE_LABEL[m.type] ?? m.type}
          {m.isReprogrammed ? `  ·  REPROGRAMADO${m.reprogramCount > 1 ? ` (${m.reprogramCount}x)` : ""}` : ""}
        </Text>
        <View style={s.divider} />

        <Text style={s.sectionTitle}>Vehiculo y programacion</Text>
        <View style={s.row}><Text style={s.label}>Placa:</Text>          <Text style={s.value}>{m.assetPlate ?? "—"}</Text></View>
        <View style={s.row}><Text style={s.label}>Nombre:</Text>         <Text style={s.value}>{m.assetName ?? "—"}</Text></View>
        <View style={s.row}><Text style={s.label}>Taller:</Text>         <Text style={s.value}>{m.workshopName ?? "—"}</Text></View>
        <View style={s.row}><Text style={s.label}>Asignado a:</Text>     <Text style={s.value}>{m.assignedUserName ?? "—"}</Text></View>
        <View style={s.row}><Text style={s.label}>Programado:</Text>     <Text style={s.value}>{fmtDateTime(m.scheduledFor)}</Text></View>
        <View style={s.row}><Text style={s.label}>Ejecutado:</Text>      <Text style={s.value}>{fmtDateTime(m.executedAt)}</Text></View>
        <View style={s.row}><Text style={s.label}>Completado:</Text>     <Text style={s.value}>{fmtDateTime(m.completedAt)}</Text></View>
        {m.odometerKm != null && (
          <View style={s.row}><Text style={s.label}>Odometro:</Text><Text style={s.value}>{m.odometerKm.toLocaleString("es-CO")} km</Text></View>
        )}

        {m.isReprogrammed && m.reprogramReason && (
          <>
            <Text style={s.sectionTitle}>Reprogramacion</Text>
            <Text style={{ fontSize: 9, marginBottom: 4, color: "#92400e" }}>
              Motivo: {m.reprogramReason}
            </Text>
            {m.reprogrammedAt && (
              <Text style={{ fontSize: 8, color: "#64748b", marginBottom: 4 }}>
                Reprogramado el {fmtDateTime(m.reprogrammedAt)} {m.reprogramCount > 1 ? ` (${m.reprogramCount} veces)` : ""}
              </Text>
            )}
          </>
        )}

        {m.description && (
          <>
            <Text style={s.sectionTitle}>Descripcion</Text>
            <Text style={{ fontSize: 9, marginBottom: 4 }}>{m.description}</Text>
          </>
        )}

        <Text style={s.sectionTitle}>Repuestos y servicios</Text>
        {m.items && m.items.length > 0 ? (
          <>
            <View style={s.itemRow}>
              <Text style={s.itemName}>Repuesto</Text>
              <Text style={s.itemQty}>Cant.</Text>
              <Text style={s.itemUnit}>Unitario</Text>
              <Text style={s.itemSub}>Subtotal</Text>
            </View>
            {m.items.map((it) => (
              <View key={it.id} style={s.itemRow}>
                <Text style={s.itemName}>
                  {it.name}{it.supplierName ? ` — ${it.supplierName}` : ""}
                </Text>
                <Text style={s.itemQty}>{it.quantity}</Text>
                <Text style={s.itemUnit}>{fmtMoney(it.unitCost)}</Text>
                <Text style={s.itemSub}>{fmtMoney(it.subtotal)}</Text>
              </View>
            ))}
            <View style={[s.row, { marginTop: 6, alignItems: "center" }]}>
              <Text style={[s.totalLabel, { flex: 1, textAlign: "right", marginRight: 8 }]}>Total</Text>
              <Text style={[s.totalAmount, { width: 90 }]}>{fmtMoney(m.totalCost)}</Text>
            </View>
          </>
        ) : (
          <Text style={{ fontSize: 9, color: "#64748b" }}>Sin repuestos registrados.</Text>
        )}

        {m.events && m.events.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Linea de tiempo</Text>
            {m.events.map((e) => (
              <View key={e.id} style={s.timelineEntry}>
                <Text style={s.timelineDot}>·</Text>
                <Text style={s.timelineDate}>{fmtDateTime(e.createdAt)}</Text>
                <Text style={s.timelineText}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{EVENT_LABEL[e.kind] ?? e.kind}</Text>
                  {e.actorName ? `  —  ${e.actorName}` : ""}
                  {e.kind === "cancelled" && (e.payload as any)?.reason ? `  ·  Motivo: ${(e.payload as any).reason}` : ""}
                  {e.kind === "item_added" ? `  ·  ${(e.payload as any).count ?? 0} item(s) — ${fmtMoney((e.payload as any).totalAdded ?? 0)}` : ""}
                </Text>
              </View>
            ))}
          </>
        )}

        <Text style={s.footer} render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} de ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

export async function generateMaintenanceDetailPdf(m: Maintenance): Promise<Blob> {
  const doc = <MaintenanceDetailDocument m={m} />;
  const blob = await pdf(doc).toBlob();
  return blob;
}
