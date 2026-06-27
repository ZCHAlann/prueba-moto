// ChecklistPdf.tsx — Generador de PDF para un checklist completado
// Header: logo + título + fecha | Bloques: vehículo / conductor / inspección
// Tabla de items (Correcto / Incorrecto) con observación y foto.
// Páginas adicionales para anexos fotográficos.

import { pdf, Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { Checklist, ChecklistInspectionItem } from "../../../../hooks/useChecklists";
import { fmtDateTimeEc } from "@/lib/datetime";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    color: "#000",
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 18,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header:  { flexDirection: "row", alignItems: "center", marginBottom: 10, borderBottom: "1.5pt solid #10b981", paddingBottom: 6 },
  logoBox: { width: 38, height: 38, borderRadius: 6, backgroundColor: "#10b981", alignItems: "center", justifyContent: "center", marginRight: 10 },
  logoTxt: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 13 },
  h1:     { fontSize: 14, fontFamily: "Helvetica-Bold" },
  hSub:   { fontSize: 7, color: "#555", marginTop: 1 },
  meta:   { fontSize: 7, color: "#555", textAlign: "right" },

  // ── Status banner ───────────────────────────────────────────────────────────
  statusBar:      { flexDirection: "row", alignItems: "center", padding: 6, marginBottom: 6, borderRadius: 4 },
  statusAprobado: { backgroundColor: "#dcfce7", border: "0.75pt solid #16a34a" },
  statusObservado:{ backgroundColor: "#fef3c7", border: "0.75pt solid #d97706" },
  statusTxt:     { fontFamily: "Helvetica-Bold", fontSize: 9, marginRight: 8 },
  statusMeta:    { fontSize: 7, color: "#374151" },

  // ── Tablas ──────────────────────────────────────────────────────────────────
  table:    { width: "100%", marginTop: 3 },
  row:      { flexDirection: "row" },
  cell:     { border: "0.75pt solid #000", padding: 3, flex: 1, fontSize: 7.5 },
  cellLabel:{ border: "0.75pt solid #000", padding: 3, width: "24%", fontFamily: "Helvetica-Bold", fontSize: 7.5 },
  sectionTitle: {
    border: "0.75pt solid #000", padding: 3,
    fontFamily: "Helvetica-Bold", fontSize: 8,
    textTransform: "uppercase", flex: 1,
    backgroundColor: "#f3f4f6",
  },

  // ── Items table ─────────────────────────────────────────────────────────────
  itemHeader: {
    flexDirection: "row", backgroundColor: "#0f172a", color: "#fff",
    fontFamily: "Helvetica-Bold", fontSize: 7.5,
  },
  itemHeaderCell: { padding: 4, color: "#fff" },
  itemRow:        { flexDirection: "row", borderBottom: "0.5pt solid #d4d4d8" },
  itemRowAlert:   { backgroundColor: "#fef2f2" },
  itemCell:       { padding: 4, fontSize: 7.5, flex: 1, borderRight: "0.5pt solid #d4d4d8" },
  itemCellLast:   { padding: 4, fontSize: 7.5, flex: 1 },
  siBox:    { width: 9, height: 9, border: "0.75pt solid #000", alignItems: "center", justifyContent: "center", marginRight: 3 },
  siBoxOn:  { width: 9, height: 9, border: "0.75pt solid #000", backgroundColor: "#16a34a", alignItems: "center", justifyContent: "center", marginRight: 3 },
  noBoxOn:  { width: 9, height: 9, border: "0.75pt solid #000", backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center", marginRight: 3 },
  chkMark:  { color: "#fff", fontSize: 7, fontFamily: "Helvetica-Bold" },
  inlineRow:{ flexDirection: "row", alignItems: "center" },

  // ── Anexos (fotos) ──────────────────────────────────────────────────────────
  annexPage:  { fontFamily: "Helvetica", fontSize: 9, color: "#000", paddingTop: 24, paddingBottom: 24, paddingHorizontal: 24 },
  annexTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 14 },
  annexItem:  { marginBottom: 18, borderBottom: "0.5pt solid #d4d4d8", paddingBottom: 10 },
  annexLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 4 },
  annexComment: { fontSize: 8, color: "#374151", marginBottom: 6, fontStyle: "italic" },
  annexPhoto: { width: "70%", height: 220, objectFit: "contain", marginTop: 4 },

  footer: { marginTop: 8, textAlign: "center", fontSize: 6.5, color: "#666" },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SiNo({ si }: { si: boolean }) {
  return (
    <View style={s.inlineRow}>
      <View style={si ? s.siBoxOn : s.siBox}>
        {si && <Text style={s.chkMark}>✓</Text>}
      </View>
      <Text style={{ fontSize: 7 }}>SI</Text>
      <View style={{ width: 8 }} />
      <View style={!si ? s.noBoxOn : s.siBox}>
        {!si && <Text style={s.chkMark}>✓</Text>}
      </View>
      <Text style={{ fontSize: 7 }}>NO</Text>
    </View>
  );
}

function fmtDate(iso: string | null | undefined) {
  return fmtDateTimeEc(iso);
}

function evidenceForItem(it: ChecklistInspectionItem): string | null {
  return it.photoUrl ?? null;
}

// ─── Documento ────────────────────────────────────────────────────────────────

function ChecklistPdfDocument({ checklist, evidenceByItem }: {
  checklist: Checklist;
  evidenceByItem: Record<string, string | null>;
}) {
  const total = checklist.items.length;
  const correct = checklist.items.filter((i) => i.hasItem === "SI").length;
  const incorrect = total - correct;
  const isOk = checklist.status === "Aprobado";

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.logoBox}>
            <Text style={s.logoTxt}>CK</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.h1}>CHECKLIST DE INSPECCIÓN</Text>
            <Text style={s.hSub}>{checklist.categoryName ?? "Inspección operativa"}</Text>
          </View>
          <View style={s.meta}>
            <Text>ID: {checklist.id}</Text>
            <Text>Fecha: {fmtDate(checklist.date)}</Text>
            <Text>Estado: {checklist.status}</Text>
          </View>
        </View>

        {/* Status banner */}
        <View style={[s.statusBar, isOk ? s.statusAprobado : s.statusObservado]}>
          <Text style={s.statusTxt}>{isOk ? "APROBADO" : "OBSERVADO"}</Text>
          <Text style={s.statusMeta}>
            {correct} correcto{correct !== 1 ? "s" : ""} · {incorrect} con hallazgo · {total} revisado{total !== 1 ? "s" : ""}
          </Text>
        </View>

        {/* Vehículo */}
        <View style={s.table}>
          <View style={s.row}><Text style={s.sectionTitle}>DATOS DEL VEHÍCULO</Text></View>
          <View style={s.row}>
            <Text style={s.cellLabel}>Etiqueta</Text>
            <Text style={s.cell}>{checklist.targetLabel ?? "—"}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.cellLabel}>Placa</Text>
            <Text style={s.cell}>{checklist.assetName ?? "—"}</Text>
            <Text style={s.cellLabel}>Tipo</Text>
            <Text style={s.cell}>{checklist.targetKind}</Text>
          </View>
        </View>

        {/* Conductor */}
        <View style={s.table}>
          <View style={s.row}><Text style={s.sectionTitle}>CONDUCTOR</Text></View>
          <View style={s.row}>
            <Text style={s.cellLabel}>Nombre</Text>
            <Text style={s.cell}>{checklist.driverName ?? "Sin asignación activa"}</Text>
          </View>
        </View>

        {/* Items inspeccionados */}
        <View style={s.table}>
          <View style={s.row}><Text style={s.sectionTitle}>ÍTEMS INSPECCIONADOS</Text></View>
          <View style={s.itemHeader}>
            <Text style={[s.itemHeaderCell, { width: "8%" }]}>#</Text>
            <Text style={[s.itemHeaderCell, { width: "44%" }]}>Punto de inspección</Text>
            <Text style={[s.itemHeaderCell, { width: "18%" }]}>Tiene</Text>
            <Text style={[s.itemHeaderCell, { width: "30%" }]}>Observación</Text>
          </View>
          {checklist.items.length === 0 ? (
            <View style={s.itemRow}>
              <Text style={[s.itemCell, { width: "100%" }]}>Sin ítems registrados</Text>
            </View>
          ) : (
            checklist.items.map((it, i) => {
              const alert = it.hasItem === "NO";
              return (
                <View key={`${it.itemName}-${i}`} style={[s.itemRow, alert ? s.itemRowAlert : {}]}>
                  <Text style={[s.itemCell, { width: "8%" }]}>{i + 1}</Text>
                  <Text style={[s.itemCell, { width: "44%" }]}>{it.itemName}</Text>
                  <View style={[s.itemCell, { width: "18%" }]}>
                    <SiNo si={it.hasItem === "SI"} />
                  </View>
                  <Text style={[s.itemCellLast, { width: "30%" }]}>{it.comment || "—"}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Hallazgos consolidados */}
        {checklist.findings && (
          <View style={s.table}>
            <View style={s.row}><Text style={s.sectionTitle}>HALLAZGOS CONSOLIDADOS</Text></View>
            <View style={s.row}>
              <View style={[s.cell, { flex: 1 }]}>
                <Text style={{ fontSize: 7.5 }}>{checklist.findings}</Text>
              </View>
            </View>
          </View>
        )}

        <Text style={s.footer}>
          Documento generado automáticamente · Aplismart Motors · Uso interno
        </Text>
      </Page>

      {/* Página de anexos (fotos) */}
      {checklist.items.some((it) => !!evidenceByItem[it.itemName]) && (
        <Page size="A4" style={s.annexPage}>
          <Text style={s.annexTitle}>ANEXOS — EVIDENCIA FOTOGRÁFICA</Text>
          {checklist.items
            .filter((it) => !!evidenceByItem[it.itemName])
            .map((it, i) => (
              <View key={`ev-${i}`} style={s.annexItem}>
                <Text style={s.annexLabel}>{i + 1}. {it.itemName}</Text>
                {it.comment && <Text style={s.annexComment}>“{it.comment}”</Text>}
                <Image src={evidenceByItem[it.itemName] as string} style={s.annexPhoto} />
              </View>
            ))}
        </Page>
      )}
    </Document>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function generateChecklistPdf(
  checklist: Checklist,
  evidenceByItem: Record<string, string | null> = {}
): Promise<Blob> {
  // Si el backend no nos dio photoUrl explícito, intenta inferirlo
  const evidence: Record<string, string | null> = { ...evidenceByItem };
  for (const it of checklist.items) {
    if (evidence[it.itemName] === undefined) {
      evidence[it.itemName] = evidenceForItem(it);
    }
  }
  return pdf(<ChecklistPdfDocument checklist={checklist} evidenceByItem={evidence} />).toBlob();
}
