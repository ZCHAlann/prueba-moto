"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  FuelDetailPdf
// ─────────────────────────────────────────────────────────────────────────────
//  Comprobante de carga de combustible generado con @react-pdf/renderer.
//
//  Formato: una hoja A4 retrato con:
//    • Encabezado: empresa (si la sesión la provee) + título "Comprobante
//      de carga" + número de folio "CC-YYYYMMDD-<id>" a la derecha.
//    • Bloque "Datos de la carga": vehículo (placa + marca/modelo),
//      conductor, fecha, estación, odómetro y foto evidencia si existe.
//    • Tabla de importes: litros, precio unitario, costo total. Con
//      totales en negrita al pie.
//    • Notas (si hay).
//    • Pie con dos líneas de firma (registró / aprobó) y un sello con
//      la fecha de generación.
//
//  Se descarga vía un <Blob> + <a download>. Compatible con SSR porque
//  sólo se renderiza al hacer clic (cliente).

import {
  Document, Page, Text, View, StyleSheet, Image as PdfImage,
  pdf, Font,
} from "@react-pdf/renderer";
import { useAuth } from "../../../context/AuthContext";

export type FuelDetailPdfProps = {
  entry: {
    id: string;
    date: string;
    assetId: string;
    assetPlate: string | null;
    assetBrand: string | null;
    assetModel: string | null;
    driverId: string | null;
    driverName: string | null;
    liters: number;
    cost: number;
    odometer: number;
    station: string;
    notes: string;
    photoUrl: string | null;
  };
};

const s = StyleSheet.create({
  page: {
    paddingHorizontal: 36,
    paddingVertical: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1f2937",
    backgroundColor: "#ffffff",
  },
  // ── Header ────────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1.5,
    borderBottomColor: "#0f172a",
    paddingBottom: 12,
    marginBottom: 18,
  },
  brand: { fontSize: 14, fontWeight: 700, color: "#0f172a", letterSpacing: 0.5 },
  brandSub: { fontSize: 8, color: "#6b7280", marginTop: 2 },
  folioWrap: { alignItems: "flex-end" },
  folioLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 },
  folioValue: { fontSize: 10, fontWeight: 700, color: "#0f172a", marginTop: 2 },
  docTitle: {
    fontSize: 13, fontWeight: 700, color: "#0f172a", textTransform: "uppercase",
    letterSpacing: 1, marginTop: 12,
  },
  docSub: { fontSize: 8, color: "#6b7280", marginTop: 2 },
  // ── Section headings ─────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 9, fontWeight: 700, color: "#0f172a", textTransform: "uppercase",
    letterSpacing: 1, marginTop: 14, marginBottom: 6, paddingBottom: 3,
    borderBottomWidth: 0.7, borderBottomColor: "#e5e7eb",
  },
  // ── Data grid ────────────────────────────────────────────────────────────
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "50%", marginBottom: 6, paddingRight: 8 },
  cellLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 },
  cellValue: { fontSize: 10, color: "#0f172a", marginTop: 1 },
  // ── Imports table ────────────────────────────────────────────────────────
  tableWrap: { marginTop: 6, borderWidth: 0.5, borderColor: "#e5e7eb" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  trLast: { flexDirection: "row" },
  th: {
    backgroundColor: "#f1f5f9", paddingVertical: 6, paddingHorizontal: 8,
    fontSize: 8, fontWeight: 700, color: "#0f172a", textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  thQty:    { width: "20%", textAlign: "right" },
  thUnit:   { width: "30%", textAlign: "right" },
  thTotal:  { width: "30%", textAlign: "right" },
  td: { paddingVertical: 7, paddingHorizontal: 8, fontSize: 9.5, color: "#111827" },
  tdQty:    { width: "20%", textAlign: "right" },
  tdUnit:   { width: "30%", textAlign: "right" },
  tdTotal:  { width: "30%", textAlign: "right" },
  tdLabel:  { width: "20%", fontSize: 9, fontWeight: 700, color: "#0f172a" },
  // ── Notes ────────────────────────────────────────────────────────────────
  notesBox: {
    marginTop: 12, padding: 10, backgroundColor: "#f8fafc",
    borderLeftWidth: 3, borderLeftColor: "#6366f1",
  },
  notesLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  notesText:  { fontSize: 9, color: "#1f2937", lineHeight: 1.4 },
  // ── Photo evidence ───────────────────────────────────────────────────────
  photoWrap: { marginTop: 12 },
  photoBox: {
    width: 220, height: 165, borderWidth: 0.5, borderColor: "#e5e7eb",
    backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center",
  },
  photoLabel: { fontSize: 7, color: "#9ca3af", marginTop: 4 },
  // ── Footer / signatures ──────────────────────────────────────────────────
  footer: {
    position: "absolute", bottom: 28, left: 36, right: 36,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    borderTopWidth: 0.7, borderTopColor: "#e5e7eb", paddingTop: 10,
  },
  sigBlock: { width: "40%" },
  sigLine: {
    borderBottomWidth: 0.7, borderBottomColor: "#0f172a", height: 28,
    marginBottom: 4,
  },
  sigLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 },
  stamp: {
    borderWidth: 1, borderColor: "#6366f1", borderStyle: "solid", padding: 6,
    alignItems: "center",
  },
  stampText: { fontSize: 9, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: 0.6 },
  stampSub:  { fontSize: 7, color: "#6b7280", marginTop: 1 },
});

function fmtMoney(n: number): string {
  return `${n.toFixed(2)} USD`;
}
function fmtNum(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}
function fmtDate(s: string): string {
  // yyyy-mm-dd → dd/mm/yyyy
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function folioFromEntry(id: string, date: string): string {
  const num = id.replace(/\D/g, "").slice(-6) || "000000";
  const d  = date.replace(/-/g, "").slice(0, 8);
  return `CC-${d}-${num}`;
}

export function FuelDetailDocument({
  entry, companyName,
}: FuelDetailPdfProps & { companyName?: string | null }) {
  const unitPrice = entry.liters > 0 ? entry.cost / entry.liters : 0;
  const folio = folioFromEntry(entry.id, entry.date);

  return (
    <Document
      title={`Comprobante de carga ${folio}`}
      author={companyName ?? "Motors Aplismart"}
      subject="Comprobante de carga de combustible"
    >
      <Page size="A4" style={s.page} wrap>
        {/* ── Header ── */}
        <View style={s.headerRow} fixed>
          <View>
            <Text style={s.brand}>{companyName ?? "Motors Aplismart"}</Text>
            <Text style={s.brandSub}>Control de flota · Cargas de combustible</Text>
            <Text style={s.docTitle}>Comprobante de carga</Text>
            <Text style={s.docSub}>Documento no fiscal · generado desde Aplismart</Text>
          </View>
          <View style={s.folioWrap}>
            <Text style={s.folioLabel}>Folio</Text>
            <Text style={s.folioValue}>{folio}</Text>
            <Text style={[s.folioLabel, { marginTop: 6 }]}>Fecha de carga</Text>
            <Text style={s.folioValue}>{fmtDate(entry.date)}</Text>
          </View>
        </View>

        {/* ── Datos del vehículo y conductor ── */}
        <Text style={s.sectionTitle}>Datos del vehículo y conductor</Text>
        <View style={s.grid}>
          <View style={s.cell}>
            <Text style={s.cellLabel}>Vehículo (placa)</Text>
            <Text style={s.cellValue}>{entry.assetPlate ?? "—"}</Text>
          </View>
          <View style={s.cell}>
            <Text style={s.cellLabel}>Marca / modelo</Text>
            <Text style={s.cellValue}>
              {`${entry.assetBrand ?? ""} ${entry.assetModel ?? ""}`.trim() || "—"}
            </Text>
          </View>
          <View style={s.cell}>
            <Text style={s.cellLabel}>Conductor</Text>
            <Text style={s.cellValue}>{entry.driverName ?? "—"}</Text>
          </View>
          <View style={s.cell}>
            <Text style={s.cellLabel}>Estación de servicio</Text>
            <Text style={s.cellValue}>{entry.station || "—"}</Text>
          </View>
          <View style={s.cell}>
            <Text style={s.cellLabel}>Odómetro al cierre</Text>
            <Text style={s.cellValue}>{entry.odometer.toLocaleString()} km</Text>
          </View>
          <View style={s.cell}>
            <Text style={s.cellLabel}>Identificador interno</Text>
            <Text style={s.cellValue}>{entry.id}</Text>
          </View>
        </View>

        {/* ── Foto evidencia ── */}
        {entry.photoUrl ? (
          <>
            <Text style={s.sectionTitle}>Evidencia fotográfica</Text>
            <View style={s.photoWrap}>
              <PdfImage src={entry.photoUrl} style={s.photoBox} />
              <Text style={s.photoLabel}>Foto registrada al momento de la carga.</Text>
            </View>
          </>
        ) : null}

        {/* ── Importes ── */}
        <Text style={s.sectionTitle}>Detalle de la carga</Text>
        <View style={s.tableWrap}>
          <View style={s.tr}>
            <Text style={[s.th, { width: "20%" }]}>Concepto</Text>
            <Text style={[s.th, s.thQty]}>Litros</Text>
            <Text style={[s.th, s.thUnit]}>Precio unitario</Text>
            <Text style={[s.th, s.thTotal]}>Importe</Text>
          </View>
          <View style={s.trLast}>
            <Text style={s.tdLabel}>Carga de combustible</Text>
            <Text style={[s.td, s.tdQty]}>{fmtNum(entry.liters, 2)} L</Text>
            <Text style={[s.td, s.tdUnit]}>{fmtMoney(unitPrice)} / L</Text>
            <Text style={[s.td, s.tdTotal, { fontWeight: 700 }]}>{fmtMoney(entry.cost)}</Text>
          </View>
        </View>

        {/* ── Notas ── */}
        {entry.notes ? (
          <View style={s.notesBox} wrap={false}>
            <Text style={s.notesLabel}>Notas</Text>
            <Text style={s.notesText}>{entry.notes}</Text>
          </View>
        ) : null}

        {/* ── Footer / firmas ── */}
        <View style={s.footer} fixed>
          <View style={s.sigBlock}>
            <View style={s.sigLine} />
            <Text style={s.sigLabel}>Conductor que registró la carga</Text>
            <Text style={[s.sigLabel, { color: "#0f172a", marginTop: 2, textTransform: "none", letterSpacing: 0 }]}>
              {entry.driverName ?? "—"}
            </Text>
          </View>
          <View style={s.sigBlock}>
            <View style={s.sigLine} />
            <Text style={s.sigLabel}>Aprobado por</Text>
            <Text style={[s.sigLabel, { color: "#0f172a", marginTop: 2, textTransform: "none", letterSpacing: 0 }]}>
              {companyName ?? "Motors Aplismart"}
            </Text>
          </View>
          <View style={s.stamp}>
            <Text style={s.stampText}>Válido</Text>
            <Text style={s.stampSub}>Aplismart · {new Date().toLocaleDateString("es")}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Hook que devuelve un handler para descargar el PDF. */
export function useFuelDetailPdf(entry: FuelDetailPdfProps["entry"] | null) {
  const { session } = useAuth();
  const companyName = (session as unknown as { companyName?: string | null } | null)?.companyName ?? null;

  return async () => {
    if (!entry) return;
    const blob = await pdf(
      <FuelDetailDocument entry={entry} companyName={companyName} />,
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comprobante-carga-${entry.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
}
