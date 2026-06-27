// components/features/pdf/MaintenanceListPdf.tsx
// PDF client-side de mantenimientos usando @react-pdf/renderer (mismo motor
// que el ActaPdf de Asignaciones). Estilo empresarial: header con título +
// rango, tabla con bandas, totales, paginación. Si se pasa `costBreakdown`,
// agrega una sección final con el desglose por taller y proveedor.

import { pdf, Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Maintenance } from "../../../hooks/useMaintenancesV2";
import { fmtDateShortEc } from "@/lib/datetime";

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
  // ── Sección de desglose ──
  breakdownSection:  { marginTop: 14, padding: 10, borderTop: "1pt solid #999" },
  breakdownTitle:    { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 8, color: "#1f2937" },
  breakdownTotals:   { flexDirection: "row", borderBottom: "0.5pt solid #999", paddingBottom: 6, marginBottom: 8 },
  breakdownTotalCol: { padding: 4, fontSize: 9 },
  breakdownTotalNum: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  breakdownSubtitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 4, color: "#374151" },
  breakdownRow:      { flexDirection: "row", borderBottom: "0.5pt solid #e5e7eb", paddingVertical: 3 },
  breakdownFootnote: { fontSize: 7.5, color: "#6b7280", marginTop: 8, fontStyle: "italic" },
});

const fmtDate = (iso?: string | null) => fmtDateShortEc(iso);
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const STATUS_LABEL: Record<string, string> = {
  Programado:   "Programado",
  "En proceso": "En proceso",
  Completado:   "Completado",
};

interface Range { from: string; to: string }

// ─── Tipo del desglose ──────────────────────────────────────────────
// Igual al que devuelve el backend GET /cost-breakdown.
// Lo declaramos acá para no acoplar el PDF al módulo de Mantenimientos.

export type CostBreakdownData = {
  rango:    { desde: string; hasta: string };
  filtros:  { workshopId: number | null; supplierId: number | null };
  totals:   { manoObra: number; repuestos: number; total: number };
  byWorkshop: Array<{
    workshopId:   number;
    workshopName: string;
    total:        number;
    count:        number;
  }>;
  bySupplier: Array<{
    supplierId:   number;
    supplierName: string;
    total:        number;
    itemsCount:   number;
  }>;
};

// ─── Sección de desglose ────────────────────────────────────────────

function BreakdownSection({ data }: { data: CostBreakdownData }) {
  return (
    <View style={s.breakdownSection} wrap={false}>
      <Text style={s.breakdownTitle}>
        Desglose de costos · {data.rango.desde} — {data.rango.hasta}
      </Text>

      {/* Totales 3 columnas */}
      <View style={s.breakdownTotals}>
        <View style={{ width: "33%" }}>
          <Text style={s.breakdownTotalCol}>Mano de obra</Text>
          <Text style={s.breakdownTotalNum}>{fmtMoney(data.totals.manoObra)}</Text>
        </View>
        <View style={{ width: "33%" }}>
          <Text style={s.breakdownTotalCol}>Repuestos</Text>
          <Text style={s.breakdownTotalNum}>{fmtMoney(data.totals.repuestos)}</Text>
        </View>
        <View style={{ width: "34%" }}>
          <Text style={s.breakdownTotalCol}>Total</Text>
          <Text style={s.breakdownTotalNum}>{fmtMoney(data.totals.total)}</Text>
        </View>
      </View>

      {/* Por taller */}
      {data.byWorkshop.length > 0 && (
        <>
          <Text style={s.breakdownSubtitle}>Por taller</Text>
          <View>
            <View style={s.breakdownRow}>
              <Text style={[s.cell, { width: "60%"  , fontFamily: "Helvetica-Bold" }]}>Taller</Text>
              <Text style={[s.cell, { width: "25%" , textAlign: "right", fontFamily: "Helvetica-Bold" }]}>OT</Text>
              <Text style={[s.cell, { width: "15%" , textAlign: "right", fontFamily: "Helvetica-Bold" }]}>Total</Text>
            </View>
            {data.byWorkshop.map((w) => (
              <View key={w.workshopId} style={s.breakdownRow}>
                <Text style={[s.cell, { width: "60%" }]}>{w.workshopName}</Text>
                <Text style={[s.cell, { width: "25%", textAlign: "right" }]}>{w.count}</Text>
                <Text style={[s.cell, { width: "15%", textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
                  {fmtMoney(w.total)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Por proveedor */}
      {data.bySupplier.length > 0 && (
        <>
          <Text style={s.breakdownSubtitle}>Por proveedor</Text>
          <View>
            <View style={s.breakdownRow}>
              <Text style={[s.cell, { width: "55%" , fontFamily: "Helvetica-Bold" }]}>Proveedor</Text>
              <Text style={[s.cell, { width: "20%" , textAlign: "right", fontFamily: "Helvetica-Bold" }]}>Repuestos</Text>
              <Text style={[s.cell, { width: "25%" , textAlign: "right", fontFamily: "Helvetica-Bold" }]}>Total</Text>
            </View>
            {data.bySupplier.map((sp) => (
              <View key={sp.supplierId} style={s.breakdownRow}>
                <Text style={[s.cell, { width: "55%" }]}>{sp.supplierName}</Text>
                <Text style={[s.cell, { width: "20%", textAlign: "right" }]}>{sp.itemsCount}</Text>
                <Text style={[s.cell, { width: "25%", textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
                  {fmtMoney(sp.total)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Nota al pie */}
      <Text style={s.breakdownFootnote}>
        {data.filtros.supplierId != null
          ? "Los repuestos reflejan solo el proveedor seleccionado."
          : data.filtros.workshopId != null
            ? "La mano de obra corresponde al taller seleccionado. Los repuestos incluyen todos los proveedores."
            : "Mano de obra y repuestos sin filtros activos."}
      </Text>
    </View>
  );
}

// ─── Documento principal ────────────────────────────────────────────

function MaintenanceListPdfDocument({
  rows,
  range,
  costBreakdown,
}: {
  rows: Maintenance[];
  range: Range;
  costBreakdown?: CostBreakdownData;
}) {
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

        {/* Sección de desglose de costos al final */}
        {costBreakdown && <BreakdownSection data={costBreakdown} />}

        <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

export async function generateMaintenanceListPdf(
  rows: Maintenance[],
  range: Range,
  costBreakdown?: CostBreakdownData,
): Promise<Blob> {
  const doc = <MaintenanceListPdfDocument rows={rows} range={range} costBreakdown={costBreakdown} />;
  const blob = await pdf(doc).toBlob();
  return blob;
}