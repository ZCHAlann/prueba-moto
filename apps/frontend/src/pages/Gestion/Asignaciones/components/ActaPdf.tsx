// ActaPdf.tsx — todo el acta en UNA sola página A4, fotos en página 2+
import { pdf, Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { WizardData } from "../../../../hooks/useHandoverWizard";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 7.5,
    color: "#000",
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },

  // Título
  titleBlock: { alignItems: "center", marginBottom: 4 },
  titleH1:    { fontSize: 13, fontFamily: "Helvetica-Bold", letterSpacing: 0.4 },
  titleSub:   { fontSize: 7, marginTop: 1 },

  // Tablas
  table:    { width: "100%", marginTop: 3 },
  row:      { flexDirection: "row" },
  cell:     { border: "0.75pt solid #000", padding: 3, flex: 1 },
  cellLabel:{ border: "0.75pt solid #000", padding: 3, width: "22%", fontFamily: "Helvetica-Bold" },
  cellFull: { border: "0.75pt solid #000", padding: 3, flex: 1 },
  sectionTitle: {
    border: "0.75pt solid #000", padding: 3,
    fontFamily: "Helvetica-Bold", fontSize: 8,
    textTransform: "uppercase", flex: 1,
  },

  // ── Checks ──────────────────────────────────────────────────────────────────
  checkRow:     { flexDirection: "row", marginBottom: 3, alignItems: "center" },
  checkLabel:   { fontSize: 7, flex: 1 },
  checkGroup:   { flexDirection: "row", alignItems: "center", marginLeft: 3 },
  checkOption:  { flexDirection: "row", alignItems: "center", marginRight: 5 },
  // Caja más grande para que el ✓ se vea bien
  checkBox: {
    width: 9, height: 9,
    border: "1pt solid #000",
    marginRight: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxFilled: {
    width: 9, height: 9,
    border: "1pt solid #000",
    backgroundColor: "#000",   // caja rellena cuando está marcado
    marginRight: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark:     { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#fff" },
  checkOptLabel: { fontSize: 7 },

  // ── Firmas ── orden: imagen firma → Firma → Nombre → CI/Cédula ─────────────
  sigCell:       { border: "0.75pt solid #000", padding: 5, flex: 1, minHeight: 90 },
  sigHeader:     { fontFamily: "Helvetica-Bold", fontSize: 7, marginBottom: 4 },
  // Imagen de firma más grande
  sigImg:        { height: 55, maxWidth: 200, objectFit: "contain", marginBottom: 2 },
  sigImgPlaceholder: { height: 55, marginBottom: 2 },
  sigLine:       { borderBottom: "0.5pt solid #000", marginTop: 12, marginBottom: 1.5 },
  sigLineLabel:  { fontSize: 6.5, color: "#444" },

  footer: { marginTop: 5, textAlign: "center", fontSize: 6.5, color: "#555" },

  // ── Anexos ──────────────────────────────────────────────────────────────────
  annexPage:  {
    fontFamily: "Helvetica", fontSize: 9, color: "#000",
    paddingTop: 24, paddingBottom: 24, paddingHorizontal: 24,
  },
  annexTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 16 },
  photoGrid:  { flexDirection: "row", flexWrap: "wrap", gap: 14 },   // más separación
  photo:      { width: "46%", height: 110, objectFit: "cover" },
});

// ─── CheckRow ─────────────────────────────────────────────────────────────────

function CheckRow({ label, value, tristate = false }: {
  label: string;
  value: boolean | "noTiene";
  tristate?: boolean;
}) {
  const si = value === true;
  const no = value === false;
  const nt = value === "noTiene";

  return (
    <View style={s.checkRow}>
      <Text style={s.checkLabel}>{label}</Text>
      <View style={s.checkGroup}>
        {/* SI */}
        <View style={s.checkOption}>
          <View style={si ? s.checkBoxFilled : s.checkBox}>
            {si && <Text style={s.checkMark}>✓</Text>}
          </View>
          <Text style={s.checkOptLabel}>SI</Text>
        </View>
        {/* NO */}
        <View style={s.checkOption}>
          <View style={no ? s.checkBoxFilled : s.checkBox}>
            {no && <Text style={s.checkMark}>✓</Text>}
          </View>
          <Text style={s.checkOptLabel}>NO</Text>
        </View>
        {/* NO TIENE (tristate) */}
        {tristate && (
          <View style={s.checkOption}>
            <View style={nt ? s.checkBoxFilled : s.checkBox}>
              {nt && <Text style={s.checkMark}>✓</Text>}
            </View>
            <Text style={s.checkOptLabel}>NO TIENE</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Bloque de firma (orden: imagen → línea Firma → Nombre → CI/Cédula) ───────

function SigBlock({ title, dataUrl }: { title: string; dataUrl: string | null }) {
  return (
    <View style={s.sigCell}>
      <Text style={s.sigHeader}>{title}</Text>

      {/* Imagen de la firma */}
      {dataUrl
        ? <Image src={dataUrl} style={s.sigImg} />
        : <View style={s.sigImgPlaceholder} />
      }

      {/* Firma (línea debajo de la imagen) */}
      <View style={s.sigLine} /><Text style={s.sigLineLabel}>Firma</Text>

      <View style={{ marginTop: 10 }} />
      <View style={s.sigLine} /><Text style={s.sigLineLabel}>Nombre</Text>

      <View style={{ marginTop: 10 }} />
      <View style={s.sigLine} /><Text style={s.sigLineLabel}>CI / Cédula</Text>
    </View>
  );
}

// ─── Documento completo ───────────────────────────────────────────────────────

function ActaPdfDocument({
  data,
  photoDataUrls,
  /** Modo del PDF: "alta" (entrega) o "finalizacion" (devolución). */
  mode = "alta",
  /** Datos del alta original. Cuando mode="finalizacion", se muestran al lado
   *  de los datos al regreso para comparación (km inicial vs final, etc.). */
  initialData,
}: {
  data: WizardData;
  photoDataUrls: string[];
  mode?: "alta" | "finalizacion";
  initialData?: Partial<WizardData> | null;
}) {
  const { novedades: nov, accesorios: acc } = data;
  const isFinalizacion = mode === "finalizacion";

  return (
    <Document>
      {/* ══ PÁGINA 1: Acta ══ */}
      <Page size="A4" style={s.page}>

        <View style={s.titleBlock}>
          <Text style={s.titleH1}>
            {isFinalizacion ? "ACTA DE FINALIZACIÓN DE ASIGNACIÓN" : "ACTA DE ENTREGA DE VEHÍCULO"}
          </Text>
          <Text style={s.titleSub}>
            {isFinalizacion
              ? "Devolución del vehículo al departamento logístico de transporte"
              : "Entrega del vehículo por parte del departamento logístico de transporte"}
          </Text>
        </View>

        {/* Info general */}
        <View style={s.table}>
          <View style={s.row}>
            <Text style={s.cellLabel}>ACTA N.°</Text><Text style={s.cell}>{data.actaNumber}</Text>
            <Text style={s.cellLabel}>FECHA</Text><Text style={s.cell}>{data.actaDate}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.cellLabel}>HORA</Text><Text style={s.cell}>{data.actaTime}</Text>
            <Text style={s.cellLabel}>LUGAR</Text><Text style={s.cell}>{data.actaPlace}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.cellLabel}>EMPRESA</Text><Text style={s.cell}>{data.companyName}</Text>
            <Text style={s.cellLabel}>ÁREA / CUADRILLA</Text><Text style={s.cell}>{data.actaArea}</Text>
          </View>
        </View>

        {/* Conductor */}
        <View style={s.table}>
          <View style={s.row}><Text style={s.sectionTitle}>DATOS DEL CHOFER QUE RECIBE</Text></View>
          <View style={s.row}>
            <Text style={s.cellLabel}>Nombre</Text><Text style={s.cellFull}>{data.driverName}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.cellLabel}>Cédula</Text><Text style={s.cell}>{data.driverDni}</Text>
            <Text style={s.cellLabel}>Teléfono</Text><Text style={s.cell}>{data.driverPhone}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.cellLabel}>Cargo</Text><Text style={s.cellFull}>{data.driverRole}</Text>
          </View>
        </View>

        {/* Vehículo */}
        <View style={s.table}>
          <View style={s.row}><Text style={s.sectionTitle}>DATOS DEL VEHÍCULO</Text></View>
          <View style={s.row}>
            <Text style={s.cellLabel}>Placa</Text><Text style={s.cell}>{data.vehiclePlate}</Text>
            <Text style={s.cellLabel}>Marca</Text><Text style={s.cell}>{data.vehicleBrand}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.cellLabel}>Modelo</Text><Text style={s.cell}>{data.vehicleModel}</Text>
            <Text style={s.cellLabel}>Color</Text><Text style={s.cell}>{data.vehicleColor}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.cellLabel}>Año</Text><Text style={s.cell}>{data.vehicleYear}</Text>
            <Text style={s.cellLabel}>{isFinalizacion ? "Km al regresar" : "Km al devolver"}</Text><Text style={s.cell}>{data.vehicleOdometer}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.cellLabel}>Combustible</Text><Text style={s.cell}>{data.vehicleFuelLevel}</Text>
            <Text style={s.cellLabel}>Estado general</Text><Text style={s.cell}>{data.vehicleCondition}</Text>
          </View>
          {isFinalizacion && initialData?.vehicleOdometer && (
            <View style={s.row}>
              <Text style={s.cellLabel}>Km al entregar (ref.)</Text>
              <Text style={s.cell}>{initialData.vehicleOdometer}</Text>
              <Text style={s.cellLabel}>Diferencia</Text>
              <Text style={s.cell}>
                {(() => {
                  const init = Number(initialData.vehicleOdometer);
                  const fin  = Number(data.vehicleOdometer);
                  if (!Number.isFinite(init) || !Number.isFinite(fin)) return "—";
                  const diff = fin - init;
                  return `${diff >= 0 ? "+" : ""}${diff.toLocaleString("es-EC")} km`;
                })()}
              </Text>
            </View>
          )}
        </View>

        {/* Novedades */}
        <View style={s.table}>
          <View style={s.row}><Text style={s.sectionTitle}>DAÑOS / NOVEDADES VISIBLES</Text></View>
          <View style={s.row}>
            <View style={s.cell}>
              <CheckRow label="Sin novedades visibles"  value={nov.sinNovedades} />
              <CheckRow label="Luces dañadas"           value={nov.lucesDanadas} />
              <CheckRow label="Faltan accesorios"       value={nov.faltanAccesorios} />
              <CheckRow label="Falla mecánica"          value={nov.fallaMecanica} />
            </View>
            <View style={s.cell}>
              <CheckRow label="Llantas en mal estado"   value={nov.llantasMalEstado} />
              <CheckRow label="Requiere mantenimiento"  value={nov.requiereMantenimiento} />
              <CheckRow label="Choque / accidente"      value={nov.choqueAccidente} />
            </View>
            <View style={s.cell}>
              <CheckRow label="Golpes"                  value={nov.golpes} />
              <CheckRow label="Interior sucio"          value={nov.interiorSucio} />
              <CheckRow label="Multas / infracciones"   value={nov.multas} />
            </View>
          </View>
          <View style={s.row}>
            <View style={s.cellFull}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7, marginBottom: 1 }}>Otros:</Text>
              <Text style={{ minHeight: 14, fontSize: 7 }}>{data.novedadesText}</Text>
            </View>
          </View>
        </View>

        {/* Accesorios */}
        <View style={s.table}>
          <View style={s.row}><Text style={s.sectionTitle}>ACCESORIOS / DOCUMENTOS DEVUELTOS</Text></View>
          <View style={s.row}>
            <View style={s.cell}>
              <CheckRow label="Matrícula"            value={acc.matricula} />
              <CheckRow label="Llave de repuesto"    value={acc.llaveRepuesto} />
              <CheckRow label="Triángulos"           value={acc.triangulos} />
              <CheckRow label="Herramientas básicas" value={acc.herramientas} />
            </View>
            <View style={s.cell}>
              <CheckRow label="Seguro / póliza"      value={acc.seguro} />
              <CheckRow label="Gata"                 value={acc.gata} />
              <CheckRow label="Extintor"             value={acc.extintor} tristate />
              <CheckRow label="Radio / GPS"          value={acc.radio} />
            </View>
            <View style={s.cell}>
              <CheckRow label="Llave principal"      value={acc.llavePrincipal} />
              <CheckRow label="Llave de ruedas"      value={acc.llaveRuedas} />
              <CheckRow label="Botiquín"             value={acc.botiquin} tristate />
            </View>
          </View>
          <View style={s.row}>
            <View style={s.cellFull}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7, marginBottom: 1 }}>Otros:</Text>
              <Text style={{ minHeight: 10, fontSize: 7 }}>{data.accesoriosOtros}</Text>
            </View>
          </View>
        </View>

        {/* Novedades encontradas */}
        <View style={s.table}>
          <View style={s.row}><Text style={s.sectionTitle}>NOVEDADES ENCONTRADAS AL ENTREGAR</Text></View>
          <View style={s.row}>
            <View style={s.cellFull}>
              <Text style={{ minHeight: 22, fontSize: 7 }}>{data.novedadesText || " "}</Text>
            </View>
          </View>
        </View>

        {/* Declaración */}
        <View style={s.table}>
          <View style={s.row}><Text style={s.sectionTitle}>DECLARACIÓN</Text></View>
          <View style={s.row}>
            <View style={s.cellFull}>
              <Text style={{ lineHeight: 1.5, fontSize: 7 }}>
                El Departamento de Transporte entrega el vehículo a la persona indicada en esta acta,
                en las condiciones aquí descritas. Quien recibe el vehículo acepta la responsabilidad
                de su uso, cuidado, custodia y devolución, conforme a las políticas internas de la empresa.
              </Text>
            </View>
          </View>
        </View>

        {/* Firmas — orden: imagen firma → Firma → Nombre → CI/Cédula */}
        <View style={s.table}>
          <View style={s.row}><Text style={s.sectionTitle}>FIRMAS DE RESPONSABILIDAD</Text></View>
          <View style={s.row}>
            <SigBlock title="DEPARTAMENTO LOGÍSTICO"  dataUrl={data.signatureLogDataUrl} />
            <SigBlock title="RESPONSABLE (CONDUCTOR)" dataUrl={data.signatureRespDataUrl} />
          </View>
        </View>

        <Text style={s.footer}>Documento de control vehicular | Uso interno de la empresa</Text>
      </Page>

      {/* ══ PÁGINA 2+: Fotos más separadas ══ */}
      {photoDataUrls.length > 0 && (
        <Page size="A4" style={s.annexPage}>
          <Text style={s.annexTitle}>ANEXOS — Estado del vehículo</Text>
          <View style={s.photoGrid}>
            {photoDataUrls.map((uri, i) => (
              <Image key={i} src={uri} style={s.photo} />
            ))}
          </View>
        </Page>
      )}
    </Document>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function generateActaPdf(
  data: WizardData,
  photoFiles: File[],
  options?: { mode?: "alta" | "finalizacion"; initialData?: Partial<WizardData> | null },
): Promise<Blob> {
  const photoDataUrls = await Promise.all(
    photoFiles.map(
      (file) => new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      }),
    ),
  );
  return pdf(
    <ActaPdfDocument
      data={data}
      photoDataUrls={photoDataUrls}
      mode={options?.mode ?? "alta"}
      initialData={options?.initialData ?? null}
    />,
  ).toBlob();
}