// components/features/pdf/TollListPdf.tsx
// PDF client-side del listado de peajes usando @react-pdf/renderer.
// Estilo empresarial: header con título + período, tabla con bandas, totales.

import { pdf, Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ApiTollEntry } from "../../hooks/useToll";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#000",
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 32,
  },
  title:        { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2, textAlign: "center", letterSpacing: 0.5 },
  subtitle:     { fontSize: 8, color: "#666", textAlign: "center", marginBottom: 14 },
  meta:         { fontSize: 8, color: "#555", marginBottom: 8 },
  metaLabel:    { fontFamily: "Helvetica-Bold" },
  table:        { width: "100%", marginTop: 6 },
  row:          { flexDirection: "row", borderBottom: "0.5pt solid #ccc", minHeight: 22, alignItems: "center" },
  header:       { flexDirection: "row", backgroundColor: "#1f2937", color: "#fff", minHeight: 24, alignItems: "center" },
  cell:         { padding: 4, fontSize: 8 },
  cellHeader:   { padding: 5, fontSize: 8, fontFamily: "Helvetica-Bold", color: "#fff" },
  cellRight:    { textAlign: "right" },
  footerRow:    { flexDirection: "row", backgroundColor: "#f3f4f6", minHeight: 26, alignItems: "center" },
  footerLabel:  { padding: 5, fontSize: 9, fontFamily: "Helvetica-Bold" },
  footerAmount: { padding: 5, fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "right" },
  pageNumber:   { position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center", fontSize: 8, color: "#888" },
  empty:        { textAlign: "center", padding: 30, color: "#999" },
});

const fmtDate = (ymd?: string | null) => {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
};
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

interface Range { from: string; to: string }

function TollListPdfDocument({ rows, range }: { rows: ApiTollEntry[]; range: Range }) {
  const total = rows.reduce((acc, r) => acc + Number(r.amount ?? 0), 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>REPORTE DE PEAJES</Text>
        <Text style={s.subtitle}>Período: {fmtDate(range.from)} — {fmtDate(range.to)}</Text>
        <Text style={s.meta}>
          <Text style={s.metaLabel}>Total registros: </Text>{rows.length}
          {"    "}
          <Text style={s.metaLabel}>Monto total: </Text>{fmtMoney(total)}
        </Text>

        {/* Encabezado */}
        <View style={s.table}>
          <View style={s.header}>
            <Text style={[s.cellHeader, { width: "9%"  }]}>Fecha</Text>
            <Text style={[s.cellHeader, { width: "22%" }]}>Peaje</Text>
            <Text style={[s.cellHeader, { width: "11%" }]}>Vehículo</Text>
            <Text style={[s.cellHeader, { width: "18%" }]}>Ruta</Text>
            <Text style={[s.cellHeader, { width: "12%" }]}>Categoría</Text>
            <Text style={[s.cellHeader, { width: "12%" }]}>Pago</Text>
            <Text style={[s.cellHeader, { width: "16%", textAlign: "right" }]}>Monto</Text>
          </View>

          {rows.length === 0 ? (
            <Text style={s.empty}>Sin peajes en el período seleccionado.</Text>
          ) : (
            rows.map((t) => (
              <View key={t.id} style={s.row}>
                <Text style={[s.cell, { width: "9%"  }]}>{fmtDate(t.date)}</Text>
                <Text style={[s.cell, { width: "22%" }]}>{t.tollName || "—"}</Text>
                <Text style={[s.cell, { width: "11%" }]}>{t.assetPlate ?? "—"}</Text>
                <Text style={[s.cell, { width: "18%" }]}>{t.route ?? "—"}</Text>
                <Text style={[s.cell, { width: "12%" }]}>{t.category ?? "—"}</Text>
                <Text style={[s.cell, { width: "12%" }]}>{t.paymentMethod ?? "—"}</Text>
                <Text style={[s.cell, s.cellRight, { width: "16%" }]}>{fmtMoney(t.amount)}</Text>
              </View>
            ))
          )}

          {/* Fila totales */}
          {rows.length > 0 && (
            <View style={s.footerRow}>
              <Text style={[s.footerLabel, { width: "84%", textAlign: "right" }]}>TOTAL</Text>
              <Text style={[s.footerAmount, { width: "16%" }]}>{fmtMoney(total)}</Text>
            </View>
          )}
        </View>

        <Text
          style={s.pageNumber}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function generateTollListPdf(rows: ApiTollEntry[], range: Range): Promise<Blob> {
  const doc = <TollListPdfDocument rows={rows} range={range} />;
  const blob = await pdf(doc).toBlob();
  return blob;
}
