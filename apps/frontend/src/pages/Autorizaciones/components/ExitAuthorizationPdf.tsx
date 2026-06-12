"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  ExitAuthorizationPdf
// ─────────────────────────────────────────────────────────────────────────────
//  Genera un PDF con la misma forma visual que las actas de entrega.
//  NO incluye el video (porque @react-pdf/renderer no soporta video embed).
//  Sí incluye todas las fotos (llantas + 5 puntos) y datos del vehículo,
//  conductor, decisor, fechas y notas.

import { pdf, Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { ExitAuthorization } from "../../../hooks/useExitAuthorizations";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: "#0f172a",
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 18,
  },

  // Header
  header: { flexDirection: "row", alignItems: "center", marginBottom: 8, borderBottom: "1.5pt solid #10b981", paddingBottom: 8 },
  logo: {
    width: 30, height: 30, borderRadius: 4, backgroundColor: "#10b981",
    color: "#fff", fontSize: 11, fontFamily: "Helvetica-Bold",
    textAlign: "center", padding: 9, marginRight: 8,
  },
  headerText: { flex: 1 },
  h1:   { fontSize: 13, fontFamily: "Helvetica-Bold", letterSpacing: 0.4 },
  hSub: { fontSize: 7.5, color: "#475569", marginTop: 1 },
  meta: { fontSize: 7, color: "#475569", textAlign: "right" },

  // Section
  sectionTitle: {
    backgroundColor: "#f1f5f9", padding: 4, marginTop: 8, marginBottom: 4,
    fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6,
  },

  // Tables
  table:    { width: "100%", marginTop: 2 },
  row:      { flexDirection: "row", borderBottom: "0.5pt solid #e2e8f0" },
  cell:     { flex: 1, padding: 3, fontSize: 7.5 },
  cellLabel:{ flex: 1, padding: 3, fontFamily: "Helvetica-Bold", backgroundColor: "#f8fafc", fontSize: 7.5 },

  // Evidence
  evidenceGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 2 },
  evidenceCell: { width: "48%", marginRight: "2%", marginBottom: 6 },
  evidenceFull: { width: "100%", marginBottom: 6 },
  photo:        { width: "100%", height: 130, objectFit: "cover", borderRadius: 3, marginBottom: 3 },
  photoLabel:   { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#334155", textTransform: "uppercase", letterSpacing: 0.4 },

  // Status
  statusBar: { padding: 5, marginTop: 4, marginBottom: 4, borderRadius: 3, flexDirection: "row", alignItems: "center" },
  statusText:{ fontSize: 10, fontFamily: "Helvetica-Bold" },
  statusAprob: { backgroundColor: "#dcfce7", color: "#166534" },
  statusRech:  { backgroundColor: "#fee2e2", color: "#991b1b" },
  statusPend:  { backgroundColor: "#fef3c7", color: "#92400e" },
  statusMeta: { fontSize: 7, marginLeft: "auto", color: "#475569" },

  // Notes
  notesBox: { border: "0.5pt solid #cbd5e1", padding: 4, borderRadius: 3, marginTop: 3, fontSize: 7.5 },
  notesTitle:{ fontFamily: "Helvetica-Bold", fontSize: 7, textTransform: "uppercase", color: "#64748b", marginBottom: 2 },
  notesReject: { borderColor: "#fca5a5", backgroundColor: "#fff1f2" },

  // Tires
  tiresGrid: { flexDirection: "row", flexWrap: "wrap" },
  tireCell:  { width: "24%", marginRight: "1%" },
  tirePhoto: { width: "100%", height: 70, objectFit: "cover", borderRadius: 3, marginBottom: 2 },
  tireLabel: { fontSize: 6.5, color: "#334155", textAlign: "center" },

  // Footer
  footer: { marginTop: 6, textAlign: "center", fontSize: 6.5, color: "#64748b" },
});

const PHOTO_LABELS: Array<{ key: keyof ExitAuthorization; label: string; full?: boolean }> = [
  { key: "coolantPhotoUrl",          label: "Líquido refrigerante" },
  { key: "brakeFluidPhotoUrl",       label: "Líquido de frenos" },
  { key: "windshieldWasherPhotoUrl", label: "Agua del limpia parabrisas" },
  { key: "lightsPhotoUrl",            label: "Luces" },
  { key: "batteryPhotoUrl",           label: "Batería" },
  { key: "jackPhotoUrl",              label: "Gato hidráulico" },
];

const TIRE_LABELS = ["Delantera izquierda", "Delantera derecha", "Trasera izquierda", "Trasera derecha"];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return String(iso).slice(0, 16).replace("T", " ");
}

function StatusBox({ status }: { status: ExitAuthorization["status"] }) {
  const toneMap = {
    Autorizada: s.statusAprob,
    Rechazada:  s.statusRech,
    Pendiente:  s.statusPend,
  };
  const label = {
    Autorizada: "AUTORIZADA",
    Rechazada:  "RECHAZADA",
    Pendiente:  "PENDIENTE",
  }[status];
  return (
    <View style={[s.statusBar, toneMap[status]]}>
      <Text style={s.statusText}>{label}</Text>
      <Text style={s.statusMeta}>ID: {String(status)}</Text>
    </View>
  );
}

function ExitAuthPdfDocument({ auth }: { auth: ExitAuthorization }) {
  const tires = (auth.tirePhotosUrl ?? []).slice(0, 4);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.logo}><Text>EA</Text></View>
          <View style={s.headerText}>
            <Text style={s.h1}>AUTORIZACIÓN DE SALIDA DE VEHÍCULO</Text>
            <Text style={s.hSub}>Inspección de pre-salida registrada por el conductor</Text>
          </View>
          <View style={s.meta}>
            <Text>ID: {auth.id}</Text>
            <Text>Solicitada: {fmtDate(auth.requestedAt)}</Text>
            {auth.decidedAt && <Text>Decidida: {fmtDate(auth.decidedAt)}</Text>}
          </View>
        </View>

        <StatusBox status={auth.status} />

        {/* Vehículo + Conductor */}
        <Text style={s.sectionTitle}>DATOS DEL VEHÍCULO</Text>
        <View style={s.table}>
          <View style={s.row}><Text style={s.cellLabel}>Placa</Text><Text style={s.cell}>{auth.assetPlate ?? "—"}</Text></View>
          <View style={s.row}><Text style={s.cellLabel}>Unidad</Text><Text style={s.cell}>{auth.assetName ?? "—"}</Text></View>
        </View>

        <Text style={s.sectionTitle}>CONDUCTOR</Text>
        <View style={s.table}>
          <View style={s.row}><Text style={s.cellLabel}>Nombre</Text><Text style={s.cell}>{auth.driverName ?? "—"}</Text></View>
        </View>

        {auth.decidedByName && (
          <>
            <Text style={s.sectionTitle}>DECISIÓN</Text>
            <View style={s.table}>
              <View style={s.row}><Text style={s.cellLabel}>Aprobada / Rechazada por</Text><Text style={s.cell}>{auth.decidedByName}</Text></View>
              <View style={s.row}><Text style={s.cellLabel}>Fecha decisión</Text><Text style={s.cell}>{fmtDate(auth.decidedAt)}</Text></View>
            </View>
          </>
        )}

        {/* Notas */}
        {auth.notes && (
          <View>
            <Text style={s.sectionTitle}>NOTAS DEL CONDUCTOR</Text>
            <View style={s.notesBox}>
              <Text style={s.notesTitle}>Comentarios</Text>
              <Text>{auth.notes}</Text>
            </View>
          </View>
        )}
        {auth.decisionNotes && (
          <View>
            <Text style={s.sectionTitle}>MOTIVO DE RECHAZO</Text>
            <View style={[s.notesBox, s.notesReject]}>
              <Text style={s.notesTitle}>Observaciones del aprobador</Text>
              <Text>{auth.decisionNotes}</Text>
            </View>
          </View>
        )}

        {/* Evidencias fotográficas (sin video) */}
        <Text style={s.sectionTitle}>REGISTRO FOTOGRÁFICO</Text>
        <View style={s.evidenceGrid}>
          {PHOTO_LABELS.map(({ key, label }) => {
            const url = (auth as Record<string, unknown>)[key] as string | null;
            if (!url) return null;
            return (
              <View key={key} style={s.evidenceCell}>
                <Image src={url} style={s.photo} />
                <Text style={s.photoLabel}>{label}</Text>
              </View>
            );
          })}
        </View>

        {/* Llantas */}
        {tires.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>LLANTAS</Text>
            <View style={s.tiresGrid}>
              {tires.map((url, i) => (
                <View key={i} style={s.tireCell}>
                  <Image src={url} style={s.tirePhoto} />
                  <Text style={s.tireLabel}>{TIRE_LABELS[i]}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={s.footer}>
          Documento generado automáticamente por Aplismart Motors · {fmtDate(auth.requestedAt)}
        </Text>
      </Page>
    </Document>
  );
}

export async function generateExitAuthPdf(auth: ExitAuthorization): Promise<Blob> {
  return pdf(<ExitAuthPdfDocument auth={auth} />).toBlob();
}
