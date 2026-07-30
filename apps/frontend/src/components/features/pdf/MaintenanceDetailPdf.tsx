// components/features/pdf/MaintenanceDetailPdf.tsx
//
// jul 2026 v5 — PDF del mantenimiento al estilo FACTURA clásica.
//
// Filosofía: una factura real, en blanco y negro, con tipografía
// serif (Times-Roman) para que se vea empresarial y no de "AI".
// Sin colores brillantes, sin badges de colores, sin membrete
// exagerado. Solo estructura limpia.
//
//   - Cabecera con "FACTURA" grande en serif + folio
//   - Cuadro de "Cliente / Vehículo" a la derecha
//   - Tabla de items con descuento (% o $) y totales
//   - Bloque de totales clásico a la derecha
//   - NO recalculamos: leemos subtotal/iva/total directo de la DB
//     (el backend ya recalcula en lectura, así que si había datos
//     viejos, el response los corrige).

import { pdf, Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { Maintenance } from "../../../hooks/useMaintenancesV2";
import { fmtDateTimeEc } from "@/lib/datetime";

// Paleta 100 % blanco y negro. Sin acentos.
const COLOR = {
  ink:        "#000000",
  inkSoft:    "#1f1f1f",
  label:      "#555555",
  muted:      "#888888",
  line:       "#cccccc",
  lineStrong: "#000000",
  surface:    "#f5f5f5",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: COLOR.ink,
    paddingTop: 45,
    paddingBottom: 45,
    paddingHorizontal: 50,
    lineHeight: 1.4,
  },

  // ── Cabecera ────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  // Empresa (placeholder) + número de factura.
  brandCol: { width: "55%" },
  brandName: {
    fontSize: 17,
    fontFamily: "Helvetica-Bold",
    color: COLOR.ink,
    letterSpacing: 0.5,
  },
  brandMeta: {
    fontSize: 8.5,
    color: COLOR.label,
    fontFamily: "Helvetica-Oblique",
    marginTop: 2,
  },
  // "FACTURA" + folio a la derecha.
  invoiceCol: { width: "45%", alignItems: "flex-end" },
  invoiceLabel: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: COLOR.ink,
    letterSpacing: 3,
  },
  invoiceFolio: {
    fontSize: 9.5,
    color: COLOR.label,
    fontFamily: "Helvetica",
    marginTop: 4,
  },

  headerDivider: {
    borderBottom: `1.5pt solid ${COLOR.ink}`,
    marginTop: 14,
    marginBottom: 18,
  },

  // ── Bloque cliente / vehículo ───────────────────────────────────────
  blocksRow: {
    flexDirection: "row",
    gap: 30,
    marginBottom: 18,
  },
  block: {
    flex: 1,
    borderTop: `0.75pt solid ${COLOR.ink}`,
    paddingTop: 5,
  },
  blockTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: COLOR.ink,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  blockRow: { flexDirection: "row", marginBottom: 2 },
  blockLabel: { width: 80, fontSize: 9, color: COLOR.label, fontFamily: "Helvetica" },
  blockValue: { flex: 1, fontSize: 9.5, color: COLOR.ink, fontFamily: "Helvetica-Bold" },

  // ── Tabla de items (estilo factura real) ────────────────────────────
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLOR.ink,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 4,
  },

  tableHead: {
    flexDirection: "row",
    borderTop: `1.25pt solid ${COLOR.ink}`,
    borderBottom: `0.5pt solid ${COLOR.ink}`,
    paddingTop: 5,
    paddingBottom: 5,
  },
  tableHeadText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLOR.ink,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 3,
  },
  itemRow: {
    flexDirection: "row",
    borderBottom: `0.4pt solid ${COLOR.line}`,
    paddingVertical: 6,
    alignItems: "flex-start",
  },
  itemNum:      { width: 22,  fontSize: 9,  textAlign: "center", color: COLOR.label, fontFamily: "Helvetica", paddingTop: 1 },
  itemNameCell: { flex: 4, paddingRight: 8, paddingLeft: 4 },
  itemName:     { fontSize: 10, fontFamily: "Helvetica-Bold", color: COLOR.ink },
  itemSupplier: { fontSize: 8, fontFamily: "Helvetica-Oblique", color: COLOR.label, marginTop: 1 },
  itemQty:      { width: 38, fontSize: 10, textAlign: "right", fontFamily: "Helvetica" },
  itemUnit:     { width: 70, fontSize: 10, textAlign: "right", fontFamily: "Helvetica" },
  itemDisc:     { width: 70, fontSize: 10, textAlign: "right", fontFamily: "Helvetica-Oblique", color: COLOR.inkSoft },
  itemSub:      { width: 80, fontSize: 10, textAlign: "right", fontFamily: "Helvetica" },
  itemIva:      { width: 60, fontSize: 10, textAlign: "right", fontFamily: "Helvetica" },
  itemTot:      { width: 80, fontSize: 10, textAlign: "right", fontFamily: "Helvetica-Bold" },

  // ── Bloque de totales ───────────────────────────────────────────────
  totalsBlock: { marginTop: 14, alignItems: "flex-end" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 290,
    paddingVertical: 3,
  },
  totalsLabel:      { fontSize: 10, fontFamily: "Helvetica", color: COLOR.ink },
  totalsValue:      { fontSize: 10, fontFamily: "Helvetica-Bold", color: COLOR.ink },
  totalsRowFinal: {
    borderTop: `1.25pt solid ${COLOR.ink}`,
    marginTop: 4,
    paddingTop: 6,
  },
  totalsLabelFinal: { fontSize: 12, fontFamily: "Helvetica-Bold", color: COLOR.ink, textTransform: "uppercase", letterSpacing: 1 },
  totalsValueFinal: { fontSize: 14, fontFamily: "Helvetica-Bold", color: COLOR.ink },

  // ── Avisos (reprogramado / corrección) ──────────────────────────────
  noticeBox: {
    borderLeft: "2pt solid #000",
    paddingLeft: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  noticeTitle: { fontSize: 8.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  noticeText:  { fontSize: 9.5, fontFamily: "Helvetica-Oblique", color: COLOR.inkSoft, marginBottom: 2 },
  noticeMeta:  { fontSize: 8, color: COLOR.muted, fontFamily: "Helvetica-Oblique" },

  // ── Texto libre (descripción, lavada, adjuntos) ────────────────────
  bodyText: { fontSize: 10, color: COLOR.ink, fontFamily: "Helvetica", lineHeight: 1.45 },
  divider: { borderBottom: `0.5pt solid ${COLOR.line}`, marginVertical: 6 },

  // ── Fotografías ─────────────────────────────────────────────────────
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  photoBox:  { width: 130 },
  photoImg:  { width: 130, height: 95, objectFit: "cover", borderRadius: 0, border: `0.5pt solid ${COLOR.line}` },
  photoTag: {
    alignSelf: "flex-start",
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#ffffff",
    backgroundColor: COLOR.ink,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    marginBottom: 3,
  },
  photoCaption: { fontSize: 7.5, color: COLOR.label, fontFamily: "Helvetica-Oblique", marginTop: 3 },

  // ── Footer ──────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 22,
    left: 55,
    right: 55,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `0.5pt solid ${COLOR.line}`,
    paddingTop: 6,
    fontSize: 8,
    color: COLOR.muted,
    fontFamily: "Helvetica-Oblique",
  },
});

const fmtDateTime = (iso?: string | null) => fmtDateTimeEc(iso);
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

// Formatea el descuento de un item según `discountType`.
//   "percent" → "10 %"
//   "amount"  → "$5.00"
//   sin valor → "—"
function fmtItemDiscount(
  discountType: string | null | undefined,
  discountValue: number | null | undefined,
): string {
  const value = Number(discountValue ?? 0);
  if (!value || value <= 0) return "—";
  return discountType === "percent" ? `${value} %` : fmtMoney(value);
}

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(url);
}

function FieldRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={s.blockRow}>
      <Text style={s.blockLabel}>{label}</Text>
      <Text style={[s.blockValue, muted && { color: COLOR.muted, fontFamily: "Helvetica-Oblique" }]}>{value}</Text>
    </View>
  );
}

function MaintenanceDetailDocument({ m }: { m: Maintenance }) {
  const isLavada = m.type === "Lavada";

  // ── Totales leídos de la DB (NO recalculamos) ───────────────────────
  const itemsArr = m.items ?? [];
  const laborCost = Number(m.laborCost ?? 0);

  const itemsSubtotal = itemsArr.reduce(
    (acc, it) => acc + Number(it.subtotal ?? 0),
    0,
  );
  const itemsIva = itemsArr.reduce(
    (acc, it) => acc + Number(it.ivaAmount ?? 0),
    0,
  );
  // Descuento total: leemos cada item y resolvemos su descuento efectivo
  // según discountType (amount o percent) sobre el subtotal pre-desc.
  const itemsDiscount = itemsArr.reduce((acc, it) => {
    const dVal = Number(it.discountValue ?? 0);
    if (!dVal) return acc;
    const subtotalPre = Number(it.quantity ?? 0) * Number(it.unitCost ?? 0);
    if (it.discountType === "percent") {
      return acc + (subtotalPre * dVal) / 100;
    }
    return acc + dVal;
  }, 0);

  const total = Number(m.totalCost ?? 0);

  // ── Fotos ───────────────────────────────────────────────────────────
  const itemPhotos = itemsArr
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
  const nonImageAttachments = (m.attachments ?? []).filter((a) => !isImageUrl(a.url));

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Cabecera ─────────────────────────────────────────────── */}
        <View style={s.headerRow}>
          <View style={s.brandCol}>
            <Text style={s.brandName}>ApliSmart Motors</Text>
            <Text style={s.brandMeta}>Sistema de gestión vehicular</Text>
            <Text style={[s.brandMeta, { marginTop: 6 }]}>
              {m.title ?? "Mantenimiento"}
            </Text>
            <Text style={[s.brandMeta, { fontSize: 8, marginTop: 2 }]}>
              {TYPE_LABEL[m.type] ?? m.type}
              {m.status ? `  ·  ${m.status}` : ""}
              {m.isReprogrammed ? `  ·  REPROGRAMADO${m.reprogramCount > 1 ? ` ×${m.reprogramCount}` : ""}` : ""}
              {m.lastReauthorizationId ? "  ·  REAUTORIZADO" : ""}
            </Text>
          </View>
          <View style={s.invoiceCol}>
            <Text style={s.invoiceLabel}>FACTURA</Text>
            <Text style={s.invoiceFolio}>
              N° {String(m.id).replace(/^m-/, "").padStart(6, "0")}
            </Text>
            <Text style={[s.invoiceFolio, { fontSize: 9, marginTop: 8 }]}>
              Fecha: {fmtDateTime(m.executedAt ?? m.scheduledFor ?? m.completedAt)}
            </Text>
          </View>
        </View>
        <View style={s.headerDivider} />

        {/* ── Avisos ──────────────────────────────────────────────── */}
        {m.isReprogrammed && m.reprogramReason && (
          <View style={s.noticeBox}>
            <Text style={s.noticeTitle}>Reprogramado{m.reprogramCount > 1 ? ` — ${m.reprogramCount} veces` : ""}</Text>
            <Text style={s.noticeText}>{m.reprogramReason}</Text>
            {m.reprogrammedAt && <Text style={s.noticeMeta}>{fmtDateTime(m.reprogrammedAt)}</Text>}
          </View>
        )}
        {m.lastReauthorizationId && (
          <View style={s.noticeBox}>
            <Text style={s.noticeTitle}>Reautorizado</Text>
            <Text style={s.noticeText}>
              El mantenimiento pasó por una solicitud de reautorización aprobada.
            </Text>
            {m.lastReauthorizationAt && <Text style={s.noticeMeta}>Aprobado el {fmtDateTime(m.lastReauthorizationAt)}</Text>}
          </View>
        )}
        {m.correctionReason && (
          <View style={s.noticeBox}>
            <Text style={s.noticeTitle}>Motivo de la corrección</Text>
            <Text style={s.noticeText}>{m.correctionReason}</Text>
            {m.correctionRequestedAt && <Text style={s.noticeMeta}>{fmtDateTime(m.correctionRequestedAt)}</Text>}
          </View>
        )}

        {/* ── Cliente / Vehículo + Programación ────────────────────── */}
        <View style={s.blocksRow}>
          <View style={s.block}>
            <Text style={s.blockTitle}>Cliente / Vehículo</Text>
            <FieldRow label="Placa"      value={m.assetPlate ?? "—"} />
            <FieldRow label="Vehículo"   value={m.assetName ?? "—"} />
            {!isLavada && <FieldRow label="Taller"    value={m.workshopName ?? "Sin taller"} muted={!m.workshopName} />}
            {isLavada  && m.carwashLocation && <FieldRow label="Lugar"   value={m.carwashLocation} />}
            {isLavada  && m.carwashProvider && <FieldRow label="Encargado" value={m.carwashProvider} />}
            <FieldRow label="Asignado a" value={m.assignedUserName ?? "Sin asignar"} muted={!m.assignedUserName} />
            {m.odometerKm != null && <FieldRow label="Odómetro" value={`${m.odometerKm.toLocaleString("es-CO")} km`} />}
          </View>
          <View style={s.block}>
            <Text style={s.blockTitle}>Programación</Text>
            <FieldRow label="Programado" value={fmtDateTime(m.scheduledFor)} />
            <FieldRow label="Ejecutado"  value={fmtDateTime(m.executedAt) ?? "—"} muted={!m.executedAt} />
            <FieldRow label="Completado" value={fmtDateTime(m.completedAt) ?? "—"} muted={!m.completedAt} />
          </View>
        </View>

        {/* ── Tabla de items ──────────────────────────────────────── */}
        {itemsArr.length > 0 && (
          <>
            <Text style={s.sectionTitle}>
              {isLavada ? "Adicionales" : "Repuestos y servicios"}
            </Text>
            <View style={s.tableHead}>
              <Text style={[s.tableHeadText, { width: 22, textAlign: "center" }]}>#</Text>
              <Text style={[s.tableHeadText, { flex: 4 }]}>Descripción</Text>
              <Text style={[s.tableHeadText, { width: 38, textAlign: "right" }]}>Cant.</Text>
              <Text style={[s.tableHeadText, { width: 70, textAlign: "right" }]}>P. Unit.</Text>
              <Text style={[s.tableHeadText, { width: 70, textAlign: "right" }]}>Desc.</Text>
              <Text style={[s.tableHeadText, { width: 80, textAlign: "right" }]}>Subtotal</Text>
              <Text style={[s.tableHeadText, { width: 60, textAlign: "right" }]}>IVA</Text>
              <Text style={[s.tableHeadText, { width: 80, textAlign: "right" }]}>Total</Text>
            </View>
            {itemsArr.map((it, idx) => {
              // Leemos directo de la DB. NO recalculamos.
              const subtotal  = Number(it.subtotal ?? 0);
              const ivaAmount = Number(it.ivaAmount ?? 0);
              const totalItem = Number(it.total ?? subtotal + ivaAmount);
              return (
                <View key={it.id} style={s.itemRow}>
                  <Text style={s.itemNum}>{idx + 1}</Text>
                  <View style={s.itemNameCell}>
                    <Text style={s.itemName}>{it.name}</Text>
                    {it.supplierName && <Text style={s.itemSupplier}>{it.supplierName}</Text>}
                  </View>
                  <Text style={s.itemQty}>{Number(it.quantity ?? 0)}</Text>
                  <Text style={s.itemUnit}>{fmtMoney(it.unitCost)}</Text>
                  <Text style={s.itemDisc}>{fmtItemDiscount(it.discountType, it.discountValue)}</Text>
                  <Text style={s.itemSub}>{fmtMoney(subtotal)}</Text>
                  <Text style={s.itemIva}>{fmtMoney(ivaAmount)}</Text>
                  <Text style={s.itemTot}>{fmtMoney(totalItem)}</Text>
                </View>
              );
            })}
          </>
        )}

        {/* ── Totales ─────────────────────────────────────────────── */}
        <View style={s.totalsBlock}>
          {itemsArr.length > 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>
                {isLavada ? "Subtotal adicionales" : "Subtotal repuestos"}
              </Text>
              <Text style={s.totalsValue}>{fmtMoney(itemsSubtotal)}</Text>
            </View>
          )}
          {itemsDiscount > 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Descuento</Text>
              <Text style={s.totalsValue}>- {fmtMoney(itemsDiscount)}</Text>
            </View>
          )}
          {!isLavada && laborCost > 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Mano de obra</Text>
              <Text style={s.totalsValue}>{fmtMoney(laborCost)}</Text>
            </View>
          )}
          {itemsIva > 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>IVA</Text>
              <Text style={s.totalsValue}>{fmtMoney(itemsIva)}</Text>
            </View>
          )}
          <View style={[s.totalsRow, s.totalsRowFinal]}>
            <Text style={s.totalsLabelFinal}>Total</Text>
            <Text style={s.totalsValueFinal}>{fmtMoney(total)}</Text>
          </View>
        </View>

        {/* ── Descripción ────────────────────────────────────────── */}
        {m.description && (
          <>
            <View style={{ marginTop: 18 }}>
              <Text style={s.sectionTitle}>Descripción</Text>
              <View style={s.divider} />
              <Text style={s.bodyText}>{m.description}</Text>
            </View>
          </>
        )}

        {/* ── Notas de lavada ────────────────────────────────────── */}
        {isLavada && m.carwashNotes && (
          <>
            <View style={{ marginTop: 18 }}>
              <Text style={s.sectionTitle}>Notas de la lavada</Text>
              <View style={s.divider} />
              <Text style={s.bodyText}>{m.carwashNotes}</Text>
            </View>
          </>
        )}

        {/* ── Adjuntos no incrustables ────────────────────────────── */}
        {nonImageAttachments.length > 0 && (
          <>
            <View style={{ marginTop: 18 }}>
              <Text style={s.sectionTitle}>Documentos adjuntos</Text>
              <View style={s.divider} />
              {nonImageAttachments.map((a, idx) => (
                <Text key={idx} style={[s.bodyText, { marginBottom: 2 }]}>
                  {a.label}{a.uploadedAt ? `  ·  ${fmtDateTime(a.uploadedAt)}` : ""}
                </Text>
              ))}
            </View>
          </>
        )}

        {/* ── Fotografías ────────────────────────────────────────── */}
        {allPhotos.length > 0 && (
          <>
            <View style={{ marginTop: 18 }}>
              <Text style={s.sectionTitle}>Fotografías</Text>
              <View style={s.divider} />
              <View style={s.photoGrid}>
                {allPhotos.map((p, idx) => (
                  <View key={idx} style={s.photoBox}>
                    {p.kind === "invoice" && <Text style={s.photoTag}>Factura</Text>}
                    {p.kind === "evidence" && <Text style={s.photoTag}>Evidencia</Text>}
                    <Image src={p.url} style={s.photoImg} />
                    <Text style={s.photoCaption}>{p.caption}</Text>
                  </View>
                ))}
              </View>
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

// Mapa de tipo de mantenimiento (definido al final para que el JSX
// de arriba pueda referenciarlo sin chocar con la definición de StyleSheet).
const TYPE_LABEL: Record<string, string> = {
  Correctivo: "Correctivo",
  Programado: "Programado",
  Lavada:     "Lavada",
};

export async function generateMaintenanceDetailPdf(m: Maintenance): Promise<Blob> {
  const doc = <MaintenanceDetailDocument m={m} />;
  const blob = await pdf(doc).toBlob();
  return blob;
}
