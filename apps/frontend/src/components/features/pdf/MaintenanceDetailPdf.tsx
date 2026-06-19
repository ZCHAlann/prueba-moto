// components/features/pdf/MaintenanceDetailPdf.tsx
// PDF individual de un mantenimiento (un solo OT, con items y resumen
// financiero). Estilo empresarial, sin emojis, con:
//   * Header corporativo (folio grande, status, tipo, reprogramado)
//   * Secciones con líneas separadoras y títulos en versalita
//   * Mano de obra separada de repuestos / adicionales
//   * Lavada: lugar, proveedor, adicionales
//   * Fotografías de repuestos y adjuntos
//   * Total destacado (calculado desde items + mano de obra)
//
// v3.2: se quitó la línea de tiempo del PDF (queda solo en el drawer
// de detalle dentro de la app), se agregó la galería de fotos, y el
// total ahora se calcula localmente desde items/laborCost en vez de
// depender únicamente del totalCost que llega del backend.

import { pdf, Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { Maintenance } from "../../../hooks/useMaintenancesV2";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#0f172a",
    paddingTop: 30,
    paddingBottom: 30,
    paddingHorizontal: 36,
  },
  // ── Header
  headerBand: { borderBottom: "3pt solid #7c3aed", paddingBottom: 8, marginBottom: 14 },
  title:    { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 9,  color: "#475569", marginBottom: 2 },
  folio:    { fontSize: 8,  color: "#94a3b8", fontFamily: "Courier" },
  // ── Secciones
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#475569",
    marginTop: 12,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  divider: { borderBottom: "0.5pt solid #cbd5e1", marginBottom: 6 },
  // ── Filas label/valor
  row:        { flexDirection: "row", marginBottom: 3 },
  label:      { width: 130, color: "#64748b" },
  value:      { flex: 1, color: "#0f172a" },
  // ── Tabla de repuestos
  itemRow:    { flexDirection: "row", borderBottom: "0.5pt solid #e2e8f0", paddingVertical: 4, alignItems: "center" },
  itemName:   { flex: 2, fontSize: 9 },
  itemQty:    { width: 50, fontSize: 9, textAlign: "right" },
  itemUnit:   { width: 80, fontSize: 9, textAlign: "right" },
  itemSub:    { width: 90, fontSize: 9, textAlign: "right", fontFamily: "Helvetica-Bold" },
  // ── Costos
  kpiBox:     { flexDirection: "row", gap: 8, marginBottom: 8 },
  kpiCard:    { flex: 1, border: "0.5pt solid #e2e8f0", borderRadius: 4, padding: 6, backgroundColor: "#f8fafc" },
  kpiLabel:   { fontSize: 7, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6 },
  kpiValue:   { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#0f172a", marginTop: 2 },
  // ── Fotografías
  photoGrid:  { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4, marginBottom: 6 },
  photoBox:   { width: 110 },
  photoImg:   { width: 110, height: 80, objectFit: "cover", borderRadius: 4, border: "0.5pt solid #e2e8f0" },
  photoCaption: { fontSize: 7, color: "#64748b", marginTop: 2, textAlign: "center" },
  // ── Reprogramación
  reprogBox: { border: "0.5pt solid #fbbf24", backgroundColor: "#fef3c7", padding: 6, borderRadius: 4, marginBottom: 6 },
  // ── Footer
  footer: { position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", fontSize: 8, color: "#94a3b8" },
});

const STATUS_LABEL: Record<string, string> = {
  Programado:   "Programado",
  "En proceso": "En proceso",
  Completado:   "Completado",
};

const TYPE_LABEL: Record<string, string> = {
  Correctivo: "Correctivo",
  Programado: "Programado",
  Lavada:     "Lavada",
};

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

// Devuelve true si la URL parece ser una imagen (no un PDF u otro
// archivo); @react-pdf/renderer solo puede incrustar imágenes.
function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(url);
}

function MaintenanceDetailDocument({ m }: { m: Maintenance }) {
  const isLavada = m.type === "Lavada";

  // ── Total calculado localmente ──────────────────────────────────────────
  // En vez de confiar ciegamente en m.totalCost (que puede haber quedado
  // desactualizado si el backend no recalculó tras una edición), suma los
  // subtotales de los items + mano de obra. Para Lavada no tenemos acceso
  // a los carwash-extras desde este componente, así que ahí seguimos
  // usando el totalCost que manda el backend.
  const itemsTotal = (m.items ?? []).reduce((acc, it) => acc + Number(it.subtotal ?? (it.quantity * it.unitCost) ?? 0), 0);
  const laborCost = Number(m.laborCost ?? 0);
  const computedTotal = laborCost + itemsTotal;
  const total = isLavada ? Number(m.totalCost ?? 0) : computedTotal;
  const partsCost = isLavada ? Math.max(0, total - laborCost) : itemsTotal;

  // ── Fotos a mostrar: repuestos con foto + adjuntos que sean imagen ──────
  const itemPhotos = (m.items ?? [])
    .filter((it) => !!it.photoUrl && isImageUrl(it.photoUrl as string))
    .map((it) => ({ url: it.photoUrl as string, caption: it.name }));
  const attachmentPhotos = (m.attachments ?? [])
    .filter((a) => isImageUrl(a.url))
    .map((a) => ({ url: a.url, caption: a.label }));
  const allPhotos = [...itemPhotos, ...attachmentPhotos];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ─── Header ─── */}
        <View style={s.headerBand}>
          <Text style={s.folio}>FOLIO {m.id}</Text>
          <Text style={s.title}>{m.title ?? "Mantenimiento"}</Text>
          <Text style={s.subtitle}>
            {STATUS_LABEL[m.status] ?? m.status}  ·  {TYPE_LABEL[m.type] ?? m.type}
            {m.isReprogrammed ? `  ·  REPROGRAMADO${m.reprogramCount > 1 ? ` (${m.reprogramCount}x)` : ""}` : ""}
          </Text>
        </View>

        {/* ─── Reprogramación (banner) ─── */}
        {m.isReprogrammed && m.reprogramReason && (
          <View style={s.reprogBox}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: "#92400e", marginBottom: 2 }}>
              REPROGRAMADO{m.reprogramCount > 1 ? ` (${m.reprogramCount} veces)` : ""}
            </Text>
            <Text style={{ fontSize: 9, color: "#78350f", marginBottom: 2 }}>Motivo: {m.reprogramReason}</Text>
            {m.reprogrammedAt && (
              <Text style={{ fontSize: 8, color: "#92400e" }}>Reprogramado el {fmtDateTime(m.reprogrammedAt)}</Text>
            )}
          </View>
        )}

        {/* ─── Vehículo y programación ─── */}
        <Text style={s.sectionTitle}>Vehículo y programación</Text>
        <View style={s.divider} />
        <View style={s.row}><Text style={s.label}>Placa:</Text>        <Text style={s.value}>{m.assetPlate ?? "—"}</Text></View>
        <View style={s.row}><Text style={s.label}>Nombre:</Text>       <Text style={s.value}>{m.assetName ?? "—"}</Text></View>
        {!isLavada && (
          <View style={s.row}><Text style={s.label}>Taller:</Text>     <Text style={s.value}>{m.workshopName ?? "—"}</Text></View>
        )}
        <View style={s.row}><Text style={s.label}>Asignado a:</Text>   <Text style={s.value}>{m.assignedUserName ?? "Libre — sin asignar"}</Text></View>
        <View style={s.row}><Text style={s.label}>Programado:</Text>   <Text style={s.value}>{fmtDateTime(m.scheduledFor)}</Text></View>
        <View style={s.row}><Text style={s.label}>Ejecutado:</Text>    <Text style={s.value}>{fmtDateTime(m.executedAt)}</Text></View>
        <View style={s.row}><Text style={s.label}>Completado:</Text>   <Text style={s.value}>{fmtDateTime(m.completedAt)}</Text></View>
        {m.odometerKm != null && (
          <View style={s.row}><Text style={s.label}>Odómetro:</Text><Text style={s.value}>{m.odometerKm.toLocaleString("es-CO")} km</Text></View>
        )}

        {/* ─── Lavada: datos específicos ─── */}
        {isLavada && (
          <>
            <Text style={s.sectionTitle}>Servicio de lavada</Text>
            <View style={s.divider} />
            <View style={s.row}><Text style={s.label}>Lugar:</Text>     <Text style={s.value}>{m.carwashLocation ?? "—"}</Text></View>
            <View style={s.row}><Text style={s.label}>Encargado:</Text> <Text style={s.value}>{m.carwashProvider ?? "—"}</Text></View>
            {m.carwashNotes && (
              <View style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 9, color: "#0f172a" }}>{m.carwashNotes}</Text>
              </View>
            )}
          </>
        )}

        {/* ─── Costo (mano de obra + repuestos + total) ─── */}
        <Text style={s.sectionTitle}>Resumen de costos</Text>
        <View style={s.divider} />
        <View style={s.kpiBox}>
          {!isLavada && (
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Mano de obra</Text>
              <Text style={s.kpiValue}>{fmtMoney(laborCost)}</Text>
            </View>
          )}
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>{isLavada ? "Adicionales" : "Repuestos"}</Text>
            <Text style={s.kpiValue}>{fmtMoney(partsCost)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Total</Text>
            <Text style={[s.kpiValue, { color: "#059669" }]}>{fmtMoney(total)}</Text>
          </View>
        </View>

        {/* ─── Repuestos / Adicionales ─── */}
        {m.items && m.items.length > 0 && (
          <>
            <Text style={s.sectionTitle}>{isLavada ? "Adicionales" : "Repuestos y servicios"}</Text>
            <View style={s.itemRow}>
              <Text style={s.itemName}>{isLavada ? "Adicional" : "Repuesto"}</Text>
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
            {/* Total de la tabla de repuestos, para que cuadre visualmente con el KPI de arriba */}
            <View style={[s.itemRow, { borderBottom: "none", borderTop: "0.5pt solid #cbd5e1" }]}>
              <Text style={[s.itemName, { fontFamily: "Helvetica-Bold" }]}>Subtotal repuestos</Text>
              <Text style={s.itemQty}></Text>
              <Text style={s.itemUnit}></Text>
              <Text style={[s.itemSub, { color: "#059669" }]}>{fmtMoney(itemsTotal)}</Text>
            </View>
          </>
        )}

        {/* ─── Descripción ─── */}
        {m.description && (
          <>
            <Text style={s.sectionTitle}>Descripción</Text>
            <Text style={{ fontSize: 9, marginBottom: 4 }}>{m.description}</Text>
          </>
        )}

        {/* ─── Fotografías (repuestos + adjuntos) ─── */}
        {allPhotos.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Fotografías</Text>
            <View style={s.divider} />
            <View style={s.photoGrid}>
              {allPhotos.map((p, idx) => (
                <View key={idx} style={s.photoBox}>
                  <Image src={p.url} style={s.photoImg} />
                  <Text style={s.photoCaption}>{p.caption}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={s.footer} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

export async function generateMaintenanceDetailPdf(m: Maintenance): Promise<Blob> {
  const doc = <MaintenanceDetailDocument m={m} />;
  const blob = await pdf(doc).toBlob();
  return blob;
}