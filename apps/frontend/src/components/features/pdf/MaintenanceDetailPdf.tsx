// components/features/pdf/MaintenanceDetailPdf.tsx
// PDF individual de un mantenimiento (un solo OT, con items y resumen
// financiero). Estilo empresarial, sin emojis, con:
//   * Header corporativo (folio, status, tipo, reprogramado)
//   * Secciones con líneas separadoras y títulos en versalita
//   * Mano de obra separada de repuestos / adicionales
//   * Lavada: lugar, proveedor, adicionales
//   * Fotografías de repuestos y adjuntos
//   * Total destacado (calculado desde items + mano de obra)
//
// v3.3: rediseño visual completo — paleta monocromática con un solo
// acento de color (en vez de violeta/ámbar/esmeralda compitiendo entre
// sí), tabla real de datos clave en dos columnas, badges de estado más
// discretos, banners de aviso reducidos a una línea de borde lateral en
// vez de cajas de alerta tipo spreadsheet. Funcionalmente idéntico a
// v3.2 (mismos campos, mismo cálculo de total).

import { pdf, Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { Maintenance } from "../../../hooks/useMaintenancesV2";

// ─── Paleta ───────────────────────────────────────────────────────────────────
// Un solo acento (slate oscuro casi negro) para títulos/cifras importantes,
// grises neutros para todo lo demás. El color solo aparece para distinguir
// estado (puntos pequeños) y el total final.
const COLOR = {
  ink:       "#111827", // texto principal / cifras
  inkSoft:   "#1f2937",
  label:     "#6b7280", // labels secundarios
  muted:     "#9ca3af", // texto terciario / folio
  line:      "#e5e7eb", // líneas divisorias
  lineSoft:  "#f0f1f3",
  surface:   "#fafafa", // fondo de tarjetas
  accent:    "#0f172a", // acento principal (casi negro azulado)
  total:     "#065f46", // verde apagado solo para el total final
  warn:      "#92400e", // texto de aviso (reprogramado / corrección)
  warnBar:   "#d97706",
  danger:    "#9f1239",
  dangerBar: "#e11d48",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COLOR.ink,
    paddingTop: 34,
    paddingBottom: 36,
    paddingHorizontal: 40,
  },

  // ── Header ─────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  folio: {
    fontSize: 7.5,
    color: COLOR.muted,
    fontFamily: "Courier",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontFamily: "Helvetica-Bold",
    color: COLOR.ink,
    marginBottom: 6,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 2,
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    border: `0.75pt solid ${COLOR.line}`,
  },
  badgeDot: { width: 4, height: 4, borderRadius: 2 },
  badgeText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.4, textTransform: "uppercase" },
  metaSep: { fontSize: 8, color: COLOR.muted },

  headerDivider: { borderBottom: `1.25pt solid ${COLOR.ink}`, marginBottom: 16 },

  // ── Secciones ──────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLOR.label,
    marginTop: 16,
    marginBottom: 7,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  sectionTitleFirst: { marginTop: 0 },
  divider: { borderBottom: `0.75pt solid ${COLOR.line}`, marginBottom: 8 },

  // ── Grilla de datos clave (2 columnas) ────────────────────────────────
  dataGrid: { flexDirection: "row", flexWrap: "wrap" },
  dataCell: { width: "50%", flexDirection: "row", marginBottom: 7, paddingRight: 10 },
  dataLabel: { width: 70, fontSize: 8, color: COLOR.label },
  dataValue: { flex: 1, fontSize: 9, color: COLOR.ink, fontFamily: "Helvetica-Bold" },
  dataValueMuted: { flex: 1, fontSize: 9, color: COLOR.muted, fontFamily: "Helvetica" },

  // ── Tabla de repuestos ─────────────────────────────────────────────────
  tableHead: {
    flexDirection: "row",
    borderBottom: `1pt solid ${COLOR.ink}`,
    paddingBottom: 5,
    marginBottom: 2,
  },
  tableHeadText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: COLOR.label, textTransform: "uppercase", letterSpacing: 0.6 },
  itemRow: {
    flexDirection: "row",
    borderBottom: `0.5pt solid ${COLOR.lineSoft}`,
    paddingVertical: 5.5,
    alignItems: "center",
  },
  itemThumbCell: { width: 30, paddingRight: 6 },
  itemThumb:    { width: 24, height: 24, borderRadius: 2, objectFit: "cover", border: `0.5pt solid ${COLOR.line}` },
  itemThumbPlaceholder: {
    width: 24, height: 24, borderRadius: 2,
    border: `0.5pt dashed ${COLOR.line}`,
  },
  itemNameCell: { flex: 2 },
  itemName:   { fontSize: 9, color: COLOR.ink },
  itemSupplier: { fontSize: 7.5, color: COLOR.muted },
  itemQty:    { width: 44, fontSize: 9, textAlign: "right", color: COLOR.inkSoft },
  itemUnit:   { width: 78, fontSize: 9, textAlign: "right", color: COLOR.inkSoft },
  itemSub:    { width: 88, fontSize: 9, textAlign: "right", fontFamily: "Helvetica-Bold", color: COLOR.ink },

  // ── Bloque final de totales (debajo de la tabla de repuestos) ─────────
  totalsBlock: { marginTop: 4, alignItems: "flex-end" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 220,
    paddingVertical: 3.5,
  },
  totalsRowFinal: {
    borderTop: `1pt solid ${COLOR.ink}`,
    marginTop: 3,
    paddingTop: 6,
  },
  totalsLabel: { fontSize: 8.5, color: COLOR.label },
  totalsLabelFinal: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: COLOR.ink },
  totalsValue: { fontSize: 9, color: COLOR.inkSoft, fontFamily: "Helvetica-Bold" },
  totalsValueFinal: { fontSize: 12, fontFamily: "Helvetica-Bold", color: COLOR.total },

  // ── Costos (resumen destacado) ────────────────────────────────────────
  kpiBox: { flexDirection: "row", gap: 10, marginBottom: 4 },
  kpiCard: {
    flex: 1,
    borderTop: `2pt solid ${COLOR.line}`,
    paddingTop: 7,
  },
  kpiCardTotal: { borderTopColor: COLOR.total },
  kpiLabel: { fontSize: 7, color: COLOR.label, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 3 },
  kpiValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: COLOR.ink },
  kpiValueTotal: { color: COLOR.total },

  // ── Fotografías ────────────────────────────────────────────────────────
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 },
  photoBox:  { width: 112 },
  photoImg:  { width: 112, height: 82, objectFit: "cover", borderRadius: 2, border: `0.75pt solid ${COLOR.line}` },
  photoTag: {
    alignSelf: "flex-start",
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#ffffff",
    backgroundColor: COLOR.ink,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 2,
    marginBottom: 3,
  },
  photoTagInvoice: { backgroundColor: "#9a3412" },
  photoCaption: { fontSize: 7, color: COLOR.label, marginTop: 3 },

  // ── Avisos (reprogramado / corrección) — barra lateral, no caja ──────
  noticeBox: {
    borderLeft: "2.5pt solid",
    paddingLeft: 10,
    paddingVertical: 2,
    marginBottom: 14,
  },
  noticeTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  noticeText: { fontSize: 8.5, color: COLOR.inkSoft, marginBottom: 2 },
  noticeMeta: { fontSize: 7.5, color: COLOR.muted },

  // ── Descripción / notas ───────────────────────────────────────────────
  bodyText: { fontSize: 9, color: COLOR.inkSoft, lineHeight: 1.4 },

  // ── Footer ─────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `0.5pt solid ${COLOR.line}`,
    paddingTop: 6,
    fontSize: 7,
    color: COLOR.muted,
  },
});

const STATUS_LABEL: Record<string, string> = {
  Programado:   "Programado",
  "En proceso": "En proceso",
  Completado:   "Completado",
  Correccion:   "Corrección",
};

const STATUS_COLOR: Record<string, string> = {
  Programado:   "#7c3aed",
  "En proceso": "#0284c7",
  Completado:   "#059669",
  Correccion:   "#e11d48",
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

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={s.badge}>
      <View style={[s.badgeDot, { backgroundColor: color }]} />
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function DataCell({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={s.dataCell}>
      <Text style={s.dataLabel}>{label}</Text>
      <Text style={muted ? s.dataValueMuted : s.dataValue}>{value}</Text>
    </View>
  );
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
  // Cada foto lleva un "kind" para distinguir visualmente facturas de
  // evidencias/repuestos en la galería. El kind de los adjuntos se
  // infiere del label (que la persona elige explícitamente al subir:
  // "Factura · ..." o "Evidencia · ..."), no de la extensión del
  // archivo — una factura puede perfectamente ser un .jpg.
  const itemPhotos = (m.items ?? [])
    .filter((it) => !!it.photoUrl && isImageUrl(it.photoUrl as string))
    .map((it) => ({ url: it.photoUrl as string, caption: it.name, kind: "part" as const }));
  const attachmentPhotos = (m.attachments ?? [])
    .filter((a) => isImageUrl(a.url))
    .map((a) => ({
      url: a.url,
      caption: a.label,
      kind: /^factura/i.test(a.label) ? ("invoice" as const) : ("evidence" as const),
    }));
  const allPhotos = [...itemPhotos, ...attachmentPhotos];

  // Adjuntos que NO son imagen (ej. facturas en PDF) — no se pueden incrustar
  // pero igual se listan por nombre para que quede constancia en el documento.
  const nonImageAttachments = (m.attachments ?? []).filter((a) => !isImageUrl(a.url));

  const statusColor = STATUS_COLOR[m.status] ?? COLOR.label;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ─── Header ─── */}
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.folio}>FOLIO {m.id}</Text>
            <Text style={s.title}>{m.title ?? "Mantenimiento"}</Text>
            <View style={s.metaRow}>
              <Badge label={STATUS_LABEL[m.status] ?? m.status} color={statusColor} />
              <Badge label={TYPE_LABEL[m.type] ?? m.type} color={COLOR.label} />
              {m.isReprogrammed && (
                <Badge label={`Reprogramado${m.reprogramCount > 1 ? ` ×${m.reprogramCount}` : ""}`} color={COLOR.warnBar} />
              )}
            </View>
          </View>
        </View>
        <View style={s.headerDivider} />

        {/* ─── Reprogramación (aviso) ─── */}
        {m.isReprogrammed && m.reprogramReason && (
          <View style={[s.noticeBox, { borderLeftColor: COLOR.warnBar }]}>
            <Text style={[s.noticeTitle, { color: COLOR.warn }]}>
              Reprogramado{m.reprogramCount > 1 ? ` — ${m.reprogramCount} veces` : ""}
            </Text>
            <Text style={s.noticeText}>{m.reprogramReason}</Text>
            {m.reprogrammedAt && (
              <Text style={s.noticeMeta}>{fmtDateTime(m.reprogrammedAt)}</Text>
            )}
          </View>
        )}

        {/* ─── Corrección (aviso) ─── */}
        {m.correctionReason && (
          <View style={[s.noticeBox, { borderLeftColor: COLOR.dangerBar }]}>
            <Text style={[s.noticeTitle, { color: COLOR.danger }]}>Motivo de la corrección</Text>
            <Text style={s.noticeText}>{m.correctionReason}</Text>
            {m.correctionRequestedAt && (
              <Text style={s.noticeMeta}>{fmtDateTime(m.correctionRequestedAt)}</Text>
            )}
          </View>
        )}

        {/* ─── Vehículo y programación ─── */}
        <Text style={[s.sectionTitle, s.sectionTitleFirst]}>Vehículo y programación</Text>
        <View style={s.divider} />
        <View style={s.dataGrid}>
          <DataCell label="Placa"      value={m.assetPlate ?? "—"} />
          <DataCell label="Vehículo"   value={m.assetName ?? "—"} />
          {!isLavada && <DataCell label="Taller" value={m.workshopName ?? "Sin taller asignado"} muted={!m.workshopName} />}
          <DataCell label="Asignado a" value={m.assignedUserName ?? "Sin asignar"} muted={!m.assignedUserName} />
          <DataCell label="Programado" value={fmtDateTime(m.scheduledFor)} />
          <DataCell label="Ejecutado"  value={fmtDateTime(m.executedAt)} muted={!m.executedAt} />
          <DataCell label="Completado" value={fmtDateTime(m.completedAt)} muted={!m.completedAt} />
          {m.odometerKm != null && (
            <DataCell label="Odómetro" value={`${m.odometerKm.toLocaleString("es-CO")} km`} />
          )}
        </View>

        {/* ─── Lavada: datos específicos ─── */}
        {isLavada && (
          <>
            <Text style={s.sectionTitle}>Servicio de lavada</Text>
            <View style={s.divider} />
            <View style={s.dataGrid}>
              <DataCell label="Lugar"     value={m.carwashLocation ?? "—"} />
              <DataCell label="Encargado" value={m.carwashProvider ?? "—"} muted={!m.carwashProvider} />
            </View>
            {m.carwashNotes && (
              <Text style={[s.bodyText, { marginTop: 2 }]}>{m.carwashNotes}</Text>
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
          <View style={[s.kpiCard, s.kpiCardTotal]}>
            <Text style={s.kpiLabel}>Total</Text>
            <Text style={[s.kpiValue, s.kpiValueTotal]}>{fmtMoney(total)}</Text>
          </View>
        </View>

        {/* ─── Repuestos / Adicionales ─── */}
        {m.items && m.items.length > 0 && (
          <>
            <Text style={s.sectionTitle}>{isLavada ? "Adicionales" : "Repuestos y servicios"}</Text>
            <View style={s.tableHead}>
              <Text style={{ width: 30 }}></Text>
              <Text style={[s.tableHeadText, { flex: 2 }]}>{isLavada ? "Adicional" : "Repuesto"}</Text>
              <Text style={[s.tableHeadText, { width: 44, textAlign: "right" }]}>Cant.</Text>
              <Text style={[s.tableHeadText, { width: 78, textAlign: "right" }]}>Unitario</Text>
              <Text style={[s.tableHeadText, { width: 88, textAlign: "right" }]}>Subtotal</Text>
            </View>
            {m.items.map((it) => (
              <View key={it.id} style={s.itemRow}>
                <View style={s.itemThumbCell}>
                  {it.photoUrl && isImageUrl(it.photoUrl) ? (
                    <Image src={it.photoUrl} style={s.itemThumb} />
                  ) : (
                    <View style={s.itemThumbPlaceholder} />
                  )}
                </View>
                <View style={s.itemNameCell}>
                  <Text style={s.itemName}>{it.name}</Text>
                  {it.supplierName && <Text style={s.itemSupplier}>{it.supplierName}</Text>}
                </View>
                <Text style={s.itemQty}>{it.quantity}</Text>
                <Text style={s.itemUnit}>{fmtMoney(it.unitCost)}</Text>
                <Text style={s.itemSub}>{fmtMoney(it.subtotal)}</Text>
              </View>
            ))}

            {/* Bloque final: mano de obra + subtotal repuestos + total,
                para que el documento cuadre solo (sin tener que mirar el
                resumen de arriba) justo debajo de la tabla. */}
            <View style={s.totalsBlock}>
              {!isLavada && (
                <View style={s.totalsRow}>
                  <Text style={s.totalsLabel}>Mano de obra</Text>
                  <Text style={s.totalsValue}>{fmtMoney(laborCost)}</Text>
                </View>
              )}
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>{isLavada ? "Subtotal adicionales" : "Subtotal repuestos"}</Text>
                <Text style={s.totalsValue}>{fmtMoney(itemsTotal)}</Text>
              </View>
              <View style={[s.totalsRow, s.totalsRowFinal]}>
                <Text style={s.totalsLabelFinal}>Total</Text>
                <Text style={s.totalsValueFinal}>{fmtMoney(total)}</Text>
              </View>
            </View>
          </>
        )}

        {/* ─── Descripción ─── */}
        {m.description && (
          <>
            <Text style={s.sectionTitle}>Descripción</Text>
            <View style={s.divider} />
            <Text style={s.bodyText}>{m.description}</Text>
          </>
        )}

        {/* ─── Facturas no incrustables (PDF, etc.) ─── */}
        {nonImageAttachments.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Documentos adjuntos</Text>
            <View style={s.divider} />
            {nonImageAttachments.map((a, idx) => (
              <Text key={idx} style={[s.bodyText, { marginBottom: 2 }]}>
                {a.label}{a.uploadedAt ? `  ·  ${fmtDateTime(a.uploadedAt)}` : ""}
              </Text>
            ))}
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
                  {p.kind === "invoice" && <Text style={[s.photoTag, s.photoTagInvoice]}>Factura</Text>}
                  {p.kind === "evidence" && <Text style={s.photoTag}>Evidencia</Text>}
                  <Image src={p.url} style={s.photoImg} />
                  <Text style={s.photoCaption}>{p.caption}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={s.footer} fixed>
          <Text>ApliSmart Motors</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function generateMaintenanceDetailPdf(m: Maintenance): Promise<Blob> {
  const doc = <MaintenanceDetailDocument m={m} />;
  const blob = await pdf(doc).toBlob();
  return blob;
}