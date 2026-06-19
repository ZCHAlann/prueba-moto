// components/features/pdf/MaintenanceListPdf.tsx
// PDF client-side de mantenimientos usando @react-pdf/renderer (mismo motor
// que el ActaPdf de Asignaciones). Estilo empresarial: header con título +
// rango, tabla con bandas, totales, paginación.

import { pdf, Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Maintenance } from "../../../hooks/useMaintenancesV2";

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

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const STATUS_LABEL: Record<string, string> = {
  Programado:   "Programado",
  "En proceso": "En proceso",
  Completado:   "Completado",
};

interface Range { from: string; to: string }

function MaintenanceListPdfDocument({ rows, range }: { rows: Maintenance[]; range: Range }) {
  const total = rows.reduce((acc, r) => acc + Number(r.totalCost ?? 0), 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>REPORTE DE MANTENIMIENTOS</Text>
        <Text style={s.subtitle}>Período: {fmtDate(range.from)} — {fmtDate(range.to)}</Text>
        <Text style={s.meta}>
          <Text style={s.metaLabel}>Total registros: </Text>{rows.length}
        </Text>

        <View style={s.table}>
          {/* Header */}
          <View style={s.header}>
            <Text style={[s.cellHeader, { width: "9%"  }]}>Fecha</Text>
            <Text style={[s.cellHeader, { width: "8%"  }]}>Placa</Text>
            <Text style={[s.cellHeader, { width: "13%" }]}>Vehículo</Text>
            <Text style={[s.cellHeader, { width: "8%"  }]}>Tipo</Text>
            <Text style={[s.cellHeader, { width: "13%" }]}>Categoría</Text>
            <Text style={[s.cellHeader, { width: "9%"  }]}>Estado</Text>
            <Text style={[s.cellHeader, { width: "14%" }]}>Taller</Text>
            <Text style={[s.cellHeader, { width: "20%" }]}>Título</Text>
            <Text style={[s.cellHeader, { width: "6%", textAlign: "right" }]}>Costo</Text>
          </View>

          {rows.length === 0 ? (
            <Text style={s.empty}>Sin mantenimientos en el período.</Text>
          ) : (
            rows.map((m) => (
              <View key={m.id} style={s.row}>
                <Text style={[s.cell, { width: "9%"  }]}>{fmtDate(m.scheduledFor)}</Text>
                <Text style={[s.cell, { width: "8%"  }]}>{m.assetPlate ?? "—"}</Text>
                <Text style={[s.cell, { width: "13%" }]}>{m.assetName ?? "—"}</Text>
                <Text style={[s.cell, { width: "8%"  }]}>{m.type}</Text>
                <Text style={[s.cell, { width: "13%" }]}>{m.category}</Text>
                <Text style={[s.cell, { width: "9%"  }]}>{STATUS_LABEL[m.status] ?? m.status}</Text>
                <Text style={[s.cell, { width: "14%" }]}>{m.workshopName ?? "—"}</Text>
                <Text style={[s.cell, { width: "20%" }]}>{m.title ?? "—"}</Text>
                <Text style={[s.cell, s.cellRight, { width: "6%" }]}>{fmtMoney(Number(m.totalCost))}</Text>
              </View>
            ))
          )}

          {rows.length > 0 && (
            <View style={s.footerRow}>
              <Text style={[s.footerLabel, { width: "94%" }]}>TOTAL</Text>
              <Text style={[s.footerAmount, { width: "6%" }]}>{fmtMoney(total)}</Text>
            </View>
          )}
        </View>

        <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

export async function generateMaintenanceListPdf(rows: Maintenance[], range: Range): Promise<Blob> {
  const doc = <MaintenanceListPdfDocument rows={rows} range={range} />;
  const blob = await pdf(doc).toBlob();
  return blob;
}
