// pages/Gestion/Asignaciones/components/ActaPdf.tsx
//
// jul 2026 v6 — Actas de Asignación, formato SIMPLE.
//
// User feedback v6:
//   - "No lo quiero colorido"
//   - "Lo quiero más simple"
//   - "Que quepa en una hoja"
//
// Entonces: monocromático (blanco/negro/gris), sin adornos, sin
// barras de color, sin logos placeholder. Una sola página para los
// tres documentos. Helvetica sans-serif, layout de documento
// formal pero limpio, con tipografía fuerte.
//
// Recepción y Entrega: 1 página cada uno.
// Devolución: 1 página.

import { pdf, Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { WizardData } from "../../../../hooks/useHandoverWizard";

// ─── Tipos ────────────────────────────────────────────────────────────────

export type ActaReturnData = {
  actaDate: string;
  actaTime: string;
  actaPlace: string;
  companyName: string;
  driverName: string;
  driverDni: string;
  vehiclePlate: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleYear: string;
  odometerInitial: string | null;
  odometerReturn:  string;
  fuelLevel:       string;
  condition:       string;
  novedades: {
    sinNovedades:        boolean;
    lucesDanadas:        boolean;
    faltanAccesorios:    boolean;
    fallaMecanica:       boolean;
    llantasMalEstado:    boolean;
    requiereMantenimiento:boolean;
    choqueAccidente:     boolean;
    golpes:              boolean;
    interiorSucio:       boolean;
    multas:              boolean;
  };
  novedadesText: string;
  accesorios: {
    matricula:      boolean;
    llaveRepuesto:  boolean;
    triangulos:     boolean;
    herramientas:   boolean;
    seguro:         boolean;
    gata:           boolean;
    extintor:       boolean | "noTiene";
    radio:          boolean;
    llavePrincipal: boolean;
    llaveRuedas:    boolean;
    botiquin:       boolean | "noTiene";
  };
  accesoriosOtros: string;
  signatureLogDataUrl: string | null;
  signatureRespDataUrl: string | null;
  pdfUrl: string | null;
  signatoryName: string;
  signatoryDni:  string;
  odometerReturnPhotoUrl: string | null;
  multasText:    string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function formatLongDate(iso: string): string {
  if (!iso) return "____";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `a los ${d} días del mes de ${MONTHS_ES[m - 1]} del año ${y}`;
}

function nonEmpty(v: string | null | undefined, fallback = "—") {
  return v && v.trim() ? v : fallback;
}

// ─── Estilos (monocromático) ─────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: "#000000",
    paddingTop: 36,
    paddingBottom: 32,
    paddingHorizontal: 50,
    lineHeight: 1.4,
  },

  // Header — sin color, solo tipo
  headerCompany: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    textAlign: "center",
    letterSpacing: 0.4,
    color: "#000000",
  },
  headerSub: {
    fontSize: 8.5,
    textAlign: "center",
    color: "#555555",
    marginBottom: 6,
  },
  headerRule: {
    borderBottom: "1pt solid #000000",
    marginBottom: 4,
  },
  headerRuleThin: {
    borderBottom: "0.4pt solid #999999",
    marginBottom: 14,
  },

  // Título del documento
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: 0.2,
  },

  // Lead / fecha
  lead: {
    fontSize: 10.5,
    marginBottom: 12,
    lineHeight: 1.5,
  },
  leadBold: { fontFamily: "Helvetica-Bold" },

  // Sección — sin barra de color, solo underline
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginTop: 10,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingBottom: 1,
    borderBottom: "0.5pt solid #000000",
  },

  // Tabla de datos (sin header de color)
  dataTable: {
    marginBottom: 6,
  },
  dataRow: {
    flexDirection: "row",
    borderBottom: "0.4pt solid #cccccc",
  },
  dataLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    padding: 4,
    width: "32%",
    color: "#000000",
  },
  dataValue: {
    fontSize: 10.5,
    padding: 4,
    flex: 1,
    color: "#000000",
  },

  // Texto legal / párrafo
  // jul 2026 v8 — `marginBottom: 4` (antes 6) y `lineHeight: 1.35`
  // (antes 1.45) para que el acta de Entrega (con 7 secciones) entre
  // en 1 sola hoja A4 sin desbordar. Tipografía sigue siendo
  // Helvetica 10.5pt — solo ajustamos el ritmo vertical.
  legal: {
    textAlign: "justify",
    marginBottom: 4,
    lineHeight: 1.35,
  },
  legalBold: { fontFamily: "Helvetica-Bold" },

  // jul 2026 v8 — Lista con bullets (•) para las prohibiciones /
  // cesión / notificación. Cada item es una línea, no un párrafo.
  // Entra mucho mejor en 1 página sin perder claridad.
  bulletList: {
    marginBottom: 4,
    paddingLeft: 0,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 2,
    lineHeight: 1.3,
  },
  bulletMark: {
    width: 10,
    fontSize: 10,
    color: "#000000",
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    color: "#000000",
  },

  // Observaciones — caja simple con border
  obsBox: {
    border: "0.5pt solid #000000",
    padding: 6,
    marginVertical: 6,
  },
  obsLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: "#000000",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  obsText: {
    fontSize: 10,
    lineHeight: 1.4,
    color: "#000000",
  },

  // Firmas (en fila, monocromático)
  sigBlock: {
    flexDirection: "row",
    marginTop: 16,
  },
  sigCol: {
    flex: 1,
    paddingHorizontal: 8,
  },
  sigBox: {
    border: "0.5pt solid #000000",
    height: 70,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
    marginBottom: 4,
  },
  // jul 2026 v8 — El Image del garabato quedaba pegado al borde
  // superior del sigBox porque `objectFit: contain` con `height: 74`
  // sobre una caja de 80 no respeta el centrado vertical. Ahora la
  // imagen tiene un alto explícito de 56 (cabe bien centrada) y un
  // `paddingTop: 6` en el box para empujarla al medio visual.
  sigImg: {
    width: "85%",
    height: 56,
    objectFit: "contain",
  },
  sigLabel: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sigName: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    marginBottom: 1,
  },
  sigDni: {
    fontSize: 9.5,
    color: "#555555",
  },

  // Checks (devolución)
  checkRow: { flexDirection: "row", alignItems: "center", marginBottom: 3, paddingVertical: 1 },
  checkLabel: { fontSize: 10, flex: 1, color: "#000000" },
  checkBox: {
    width: 11, height: 11, border: "0.6pt solid #000000",
    marginRight: 3, alignItems: "center", justifyContent: "center",
  },
  checkBoxFilled: {
    width: 11, height: 11, border: "0.6pt solid #000000",
    backgroundColor: "#000000", marginRight: 3,
    alignItems: "center", justifyContent: "center",
  },
  checkMark: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  checkOpt: { fontSize: 9, marginRight: 8, color: "#000000", fontFamily: "Helvetica-Bold" },
});

// ─── Componentes compartidos ─────────────────────────────────────────────

function Header({ companyName, docLabel }: { companyName: string; docLabel: string }) {
  return (
    <View>
      <Text style={s.headerCompany}>{nonEmpty(companyName, "EMPRESA").toUpperCase()}</Text>
      <Text style={s.headerSub}>{docLabel} · Documento de control interno</Text>
      <View style={s.headerRule} />
      <View style={s.headerRuleThin} />
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

function DataTable({ rows }: { rows: Array<[label: string, value: string]> }) {
  // 6 entradas → 2 columnas de 3
  const filled: Array<[string, string]> =
    rows.length >= 6
      ? rows
      : [
          ...rows,
          ...Array.from({ length: 6 - rows.length }, () => ["", "—"] as [string, string]),
        ];
  const colA = filled.slice(0, 3);
  const colB = filled.slice(3, 6);
  return (
    <View style={{ flexDirection: "row", marginBottom: 6 }}>
      <View style={{ flex: 1, marginRight: 4 }}>
        {colA.map(([k, v], i) => (
          <View key={`a${i}`} style={s.dataRow}>
            <Text style={s.dataLabel}>{k}</Text>
            <Text style={s.dataValue}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={{ flex: 1, marginLeft: 4 }}>
        {colB.map(([k, v], i) => (
          <View key={`b${i}`} style={s.dataRow}>
            <Text style={s.dataLabel}>{k}</Text>
            <Text style={s.dataValue}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ObsBox({ label, text }: { label: string; text: string }) {
  return (
    <View style={s.obsBox}>
      <Text style={s.obsLabel}>{label}</Text>
      <Text style={s.obsText}>{text}</Text>
    </View>
  );
}

function SigRow({ blocks }: {
  blocks: Array<{ title: string; dataUrl: string | null; name: string; dni?: string }>;
}) {
  return (
    <View style={s.sigBlock}>
      {blocks.map((b, i) => (
        <View key={i} style={s.sigCol}>
          <View style={s.sigBox}>
            {b.dataUrl ? <Image src={b.dataUrl} style={s.sigImg} /> : null}
          </View>
          <Text style={s.sigLabel}>{b.title}</Text>
          <Text style={s.sigName}>{b.name}</Text>
          {b.dni ? <Text style={s.sigDni}>Cédula: {b.dni}</Text> : null}
        </View>
      ))}
    </View>
  );
}

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
      <View style={si ? s.checkBoxFilled : s.checkBox}>{si && <Text style={s.checkMark}>✓</Text>}</View>
      <Text style={s.checkOpt}>Sí</Text>
      <View style={no ? s.checkBoxFilled : s.checkBox}>{no && <Text style={s.checkMark}>✓</Text>}</View>
      <Text style={s.checkOpt}>No</Text>
      {tristate && (
        <>
          <View style={nt ? s.checkBoxFilled : s.checkBox}>{nt && <Text style={s.checkMark}>✓</Text>}</View>
          <Text style={s.checkOpt}>N/T</Text>
        </>
      )}
    </View>
  );
}

// ─── Acta 1: RECEPCIÓN (1 página) ─────────────────────────────────────────

function ActaRecepcionDocument({ data }: { data: WizardData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header companyName={data.companyName} docLabel="Acta de Recepción de Vehículo" />

        <Text style={s.title}>Acta de Recepción de Vehículo</Text>

        <Text style={s.lead}>
          En la ciudad de <Text style={s.leadBold}>{nonEmpty(data.actaPlace, "____________")}</Text>, {formatLongDate(data.actaDate)}.
        </Text>

        <SectionTitle>Datos del vehículo</SectionTitle>
        <DataTable
          rows={[
            ["Marca",  nonEmpty(data.vehicleBrand)],
            ["Modelo", nonEmpty(data.vehicleModel)],
            ["Año",    nonEmpty(data.vehicleYear)],
            ["Color",  nonEmpty(data.vehicleColor)],
            ["Placa",  nonEmpty(data.vehiclePlate)],
            ["Tipo",   nonEmpty(data.vehicleType)],
          ]}
        />

        <SectionTitle>Declaración del receptor</SectionTitle>
        <Text style={s.legal}>
          Yo, <Text style={s.legalBold}>{nonEmpty(data.driverName, "______________________")}</Text>,
          portador de la cédula de identidad N.º{" "}
          <Text style={s.legalBold}>{nonEmpty(data.driverDni, "______________")}</Text>,
          declaro bajo constancia que recibo el vehículo antes descrito, habiendo verificado su
          estado general y revisado sus características. Cualquier observación, daño o detalle
          detectado al momento de la recepción queda asentado en el bloque siguiente.
        </Text>
        <Text style={s.legal}>
          Declaro que he revisado el vehículo conforme a lo descrito y firmo el presente documento
          en señal de conformidad.
        </Text>

        {data.novedadesText ? (
          <ObsBox label="Observaciones" text={data.novedadesText} />
        ) : null}

        <SectionTitle>Firma</SectionTitle>
        <SigRow
          blocks={[
            {
              title: "Firma del receptor",
              dataUrl: data.signatureRecibeDataUrl,
              name:   nonEmpty(data.driverName, "________________________"),
              dni:    nonEmpty(data.driverDni, "______________________"),
            },
          ]}
        />
      </Page>
    </Document>
  );
}

// ─── Acta 2: ENTREGA (1 página) ───────────────────────────────────────────

function ActaEntregaDocument({ data }: { data: WizardData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header companyName={data.companyName} docLabel="Entrega de Vehículo a Chofer" />

        <Text style={s.title}>Entrega de Vehículo a Chofer</Text>

        <Text style={s.lead}>
          En la ciudad de {nonEmpty(data.actaPlace, "____________")}, {formatLongDate(data.actaDate)}, comparecen:
        </Text>

        {/* jul 2026 v8 — Comparecencia compactada: de 8 líneas a 5.
            Quitamos el "Los comparecientes son mayores de edad…"
            (redundante) y achicamos las frases. */}
        <Text style={s.legal}>
          Por una parte el Área de Logística de Transporte, en adelante
          <Text style={s.legalBold}> "EL ÁREA LOGÍSTICA"</Text>, representada por{" "}
          <Text style={s.legalBold}>{nonEmpty(data.signatoryName, "______________________")}</Text>,
          con cédula N.º{" "}
          <Text style={s.legalBold}>{nonEmpty(data.signatoryDni, "______________")}</Text>; y por la otra{" "}
          <Text style={s.legalBold}>{nonEmpty(data.driverName, "______________________")}</Text>,
          con cédula N.º{" "}
          <Text style={s.legalBold}>{nonEmpty(data.driverDni, "______________")}</Text>, en calidad de trabajador.
        </Text>

        <SectionTitle>Características del vehículo</SectionTitle>
        <DataTable
          rows={[
            ["Marca",  nonEmpty(data.vehicleBrand)],
            ["Modelo", nonEmpty(data.vehicleModel)],
            ["Color",  nonEmpty(data.vehicleColor)],
            ["Placa",  nonEmpty(data.vehiclePlate)],
            ["Año",    nonEmpty(data.vehicleYear)],
            ["Tipo",   nonEmpty(data.vehicleType)],
          ]}
        />

        {/* jul 2026 v8 — Antes eran 3 secciones separadas
            (Prohibiciones / Cesión / Notificación) con `SectionTitle`
            propio cada una. Ahora se consolidan en una sola lista de
            bullets dentro de un único bloque "Compromisos del
            trabajador". Mucho más compacto: cabe en página 1 sin
            desbordar. */}
        <SectionTitle>Compromisos del trabajador</SectionTitle>
        <View style={s.bulletList}>
          <View style={s.bulletItem}>
            <Text style={s.bulletMark}>•</Text>
            <Text style={s.bulletText}>
              Asume total responsabilidad civil, penal y administrativa por el uso del vehículo,
              incluyendo multas, infracciones o daños a terceros.
            </Text>
          </View>
          <View style={s.bulletItem}>
            <Text style={s.bulletMark}>•</Text>
            <Text style={s.bulletText}>
              Queda prohibido conducir bajo efectos de alcohol, drogas o sustancias prohibidas.
            </Text>
          </View>
          <View style={s.bulletItem}>
            <Text style={s.bulletMark}>•</Text>
            <Text style={s.bulletText}>
              Se prohíbe ceder, prestar o entregar el vehículo a otra persona sin autorización
              escrita del empleador.
            </Text>
          </View>
          <View style={s.bulletItem}>
            <Text style={s.bulletMark}>•</Text>
            <Text style={s.bulletText}>
              En caso de accidente, robo o daño, notificará inmediatamente al empleador y a las
              autoridades competentes.
            </Text>
          </View>
        </View>

        <Text style={[s.legal, { fontSize: 9, fontStyle: "italic", marginTop: 2 }]}>
          Anexo: las fotografías adjuntas forman parte integral de la presente acta.
        </Text>

        {data.novedadesText ? (
          <ObsBox label="Observaciones" text={data.novedadesText} />
        ) : null}

        <SectionTitle>Firmas</SectionTitle>
        <SigRow
          blocks={[
            {
              title: "Encargado de entrega",
              dataUrl: data.signatureEntregaDataUrl,
              name:   nonEmpty(data.signatoryName, "________________________"),
              dni:    nonEmpty(data.signatoryDni, "______________________"),
            },
            {
              title: "Recibe conforme",
              dataUrl: data.signatureRecibeDataUrl,
              name:   nonEmpty(data.driverName, "________________________"),
              dni:    nonEmpty(data.driverDni, "______________________"),
            },
          ]}
        />
      </Page>
    </Document>
  );
}

// ─── Acta 3: DEVOLUCIÓN (1 página) ───────────────────────────────────────

function ActaDevolucionDocument({ data }: { data: ActaReturnData }) {
  const nov = data.novedades;
  const acc = data.accesorios;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header companyName={data.companyName} docLabel="Acta de Devolución de Vehículo" />

        <Text style={s.title}>Acta de Devolución de Vehículo</Text>

        <Text style={s.lead}>
          En la ciudad de {nonEmpty(data.actaPlace, "____________")}, {formatLongDate(data.actaDate)},
          siendo las {nonEmpty(data.actaTime, "____")} horas.
        </Text>

        <SectionTitle>Datos del vehículo</SectionTitle>
        <DataTable
          rows={[
            ["Marca",          nonEmpty(data.vehicleBrand)],
            ["Modelo",         nonEmpty(data.vehicleModel)],
            ["Año",            nonEmpty(data.vehicleYear)],
            ["Color",          nonEmpty(data.vehicleColor)],
            ["Placa",          nonEmpty(data.vehiclePlate)],
            ["Km al entregar", data.odometerInitial ? `${data.odometerInitial} km` : "—"],
          ]}
        />
        <View style={{ flexDirection: "row", marginBottom: 4 }}>
          <View style={{ flex: 1, marginRight: 4 }}>
            <Text style={s.legal}>
              <Text style={s.legalBold}>Km al regresar: </Text>
              {nonEmpty(data.odometerReturn)} km
            </Text>
          </View>
          <View style={{ flex: 1, marginRight: 4 }}>
            <Text style={s.legal}>
              <Text style={s.legalBold}>Combustible: </Text>
              {nonEmpty(data.fuelLevel)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.legal}>
              <Text style={s.legalBold}>Estado general: </Text>
              {nonEmpty(data.condition)}
            </Text>
          </View>
        </View>

        <SectionTitle>Daños y novedades al regreso</SectionTitle>
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, paddingRight: 6 }}>
            <CheckRow label="Sin novedades"           value={nov.sinNovedades} />
            <CheckRow label="Luces dañadas"            value={nov.lucesDanadas} />
            <CheckRow label="Faltan accesorios"        value={nov.faltanAccesorios} />
            <CheckRow label="Falla mecánica"           value={nov.fallaMecanica} />
            <CheckRow label="Llantas en mal estado"    value={nov.llantasMalEstado} />
          </View>
          <View style={{ flex: 1, paddingRight: 6 }}>
            <CheckRow label="Requiere mantenimiento"   value={nov.requiereMantenimiento} />
            <CheckRow label="Choque / accidente"       value={nov.choqueAccidente} />
            <CheckRow label="Golpes"                   value={nov.golpes} />
            <CheckRow label="Interior sucio"           value={nov.interiorSucio} />
            <CheckRow label="Multas / infracciones"    value={nov.multas} />
          </View>
        </View>
        {data.novedadesText ? (
          <ObsBox label="Detalle de novedades" text={data.novedadesText} />
        ) : null}

        <SectionTitle>Accesorios y documentos devueltos</SectionTitle>
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, paddingRight: 6 }}>
            <CheckRow label="Matrícula"            value={acc.matricula} />
            <CheckRow label="Llave de repuesto"    value={acc.llaveRepuesto} />
            <CheckRow label="Triángulos"           value={acc.triangulos} />
            <CheckRow label="Herramientas básicas" value={acc.herramientas} />
            <CheckRow label="Gata"                 value={acc.gata} />
          </View>
          <View style={{ flex: 1, paddingRight: 6 }}>
            <CheckRow label="Seguro / póliza"      value={acc.seguro} />
            <CheckRow label="Extintor"             value={acc.extintor} tristate />
            <CheckRow label="Radio / GPS"          value={acc.radio} />
            <CheckRow label="Llave principal"      value={acc.llavePrincipal} />
            <CheckRow label="Llave de ruedas"      value={acc.llaveRuedas} />
            <CheckRow label="Botiquín"             value={acc.botiquin} tristate />
          </View>
        </View>
        {data.accesoriosOtros ? (
          <ObsBox label="Otros accesorios" text={data.accesoriosOtros} />
        ) : null}
        {data.multasText ? (
          <ObsBox label="Multas e infracciones" text={data.multasText} />
        ) : null}

        <SectionTitle>Firmas de conformidad</SectionTitle>
        <SigRow
          blocks={[
            {
              title: "Departamento Logístico",
              dataUrl: data.signatureLogDataUrl,
              name:   nonEmpty(data.signatoryName, "________________________"),
              dni:    nonEmpty(data.signatoryDni, "______________________"),
            },
            {
              title: "Conductor",
              dataUrl: data.signatureRespDataUrl,
              name:   nonEmpty(data.driverName, "________________________"),
              dni:    nonEmpty(data.driverDni, "______________________"),
            },
          ]}
        />
      </Page>
    </Document>
  );
}

// ─── API pública ──────────────────────────────────────────────────────────

export type GenerateActaOptions = {
  kind?: "recepcion" | "entrega";
};

export async function generateActaPdf(
  data: WizardData,
  _photoFiles: File[] = [],
  options?: GenerateActaOptions,
): Promise<Blob> {
  const kind = options?.kind ?? data.actaKind;
  const doc = kind === "recepcion"
    ? <ActaRecepcionDocument data={data} />
    : <ActaEntregaDocument   data={data} />;
  return pdf(doc).toBlob();
}

export async function generateReturnActaPdf(data: ActaReturnData): Promise<Blob> {
  return pdf(<ActaDevolucionDocument data={data} />).toBlob();
}
