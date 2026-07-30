// hooks/useFinalizeActaWizard.ts
//
// jul 2026 v5 — Hook para el wizard de FINALIZACIÓN de asignación.
// Es completamente APARTE del `useHandoverWizard` (que es para alta):
// no comparte state ni PDF, ni tipos.
//
// Datos que captura:
//   - Cabecera: ciudad + fecha + hora (la finalización SÍ tiene hora, a
//     diferencia de las actas de alta).
//   - Km al entregar (referencia, viene de la asignación original),
//     km al regresar, combustible y estado general.
//   - Novedades: 9 checks + texto libre.
//   - Accesorios: 11 checks (con tristate para extintor y botiquín) + texto libre.
//   - Multas / infracciones: texto libre opcional.
//   - Fotos del vehículo al regreso (opcional).
//   - 2 firmas: encargado de logística (current user) + chofer.
//
// El PDF se genera con `generateReturnActaPdf(data)` que vive en
// `ActaPdf.tsx` (template `ActaDevolucionDocument`).

import { useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { compressIfImage, COMPRESS_OPTS_EVIDENCE } from "../lib/mediaCompress";

// ─── Tipos ────────────────────────────────────────────────────────────────

export type FinalizeNovedad = {
  sinNovedades:          boolean;
  lucesDanadas:          boolean;
  faltanAccesorios:      boolean;
  fallaMecanica:         boolean;
  llantasMalEstado:      boolean;
  requiereMantenimiento: boolean;
  choqueAccidente:       boolean;
  golpes:                boolean;
  interiorSucio:         boolean;
  multas:                boolean;
};

export type FinalizeAccesorio = {
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

export type FinalizeData = {
  // Cabecera
  actaDate:  string;
  actaTime:  string;
  actaPlace: string;
  // Vehículo (auto del hook desde la asignación)
  vehiclePlate: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleYear:  string;
  // Km + combustible + estado
  odometerInitial: string | null;   // km al entregar (de la asignación original)
  odometerReturn:  string;          // input del user
  fuelLevel:       string;          // input del user
  condition:       string;          // input del user
  // Novedades
  novedades:     FinalizeNovedad;
  novedadesText: string;
  // Accesorios
  accesorios:      FinalizeAccesorio;
  accesoriosOtros: string;
  // Multas
  multasText: string;
  // Fotos (opcional)
  photos:    File[];
  photoUrls: string[];
  // Firmas
  signatureLogDataUrl:  string | null;
  signatureLogUrl:      string | null;
  signatureRespDataUrl: string | null;
  signatureRespUrl:     string | null;
  // Metadata
  signatoryName: string;
  signatoryDni:  string;
  pdfUrl: string | null;
};

const DEFAULT_NOV: FinalizeNovedad = {
  sinNovedades: true, lucesDanadas: false, faltanAccesorios: false,
  fallaMecanica: false, llantasMalEstado: false, requiereMantenimiento: false,
  choqueAccidente: false, golpes: false, interiorSucio: false, multas: false,
};

const DEFAULT_ACC: FinalizeAccesorio = {
  matricula: true, llaveRepuesto: true, triangulos: true,
  herramientas: true, seguro: true, gata: true, extintor: true,
  radio: true, llavePrincipal: true, llaveRuedas: true, botiquin: true,
};

function buildInitial(opts: {
  driver: { firstName: string; lastName: string };
  asset: {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    year?: string | null;
  };
  /** Km al entregar, de la asignación original. null si no existe. */
  odometerInitial: string | null;
  companyName: string;
  signatory: { name?: string | null; dni?: string | null };
  city: string;
}): FinalizeData {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    actaDate:  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    actaTime:  `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    actaPlace: opts.city || "",
    vehiclePlate: opts.asset.plate ?? "",
    vehicleBrand: opts.asset.brand ?? "",
    vehicleModel: opts.asset.model ?? "",
    vehicleColor: opts.asset.color ?? "",
    vehicleYear:  opts.asset.year  ?? "",
    odometerInitial: opts.odometerInitial,
    odometerReturn:  "",
    fuelLevel:       "",
    condition:       "",
    novedades:     { ...DEFAULT_NOV },
    novedadesText: "",
    accesorios:    { ...DEFAULT_ACC },
    accesoriosOtros: "",
    multasText: "",
    photos:    [],
    photoUrls: [],
    signatureLogDataUrl:  null,
    signatureLogUrl:      null,
    signatureRespDataUrl: null,
    signatureRespUrl:     null,
    signatoryName: opts.signatory.name ?? "",
    signatoryDni:  opts.signatory.dni  ?? "",
    pdfUrl: null,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useFinalizeActaWizard(opts: {
  driver: { firstName: string; lastName: string };
  asset: {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    year?: string | null;
  };
  odometerInitial: string | null;
  companyCity?: string;
}) {
  const { session } = useAuth();
  const companyName = (session as Record<string, unknown>)?.companyName as string ?? "";
  const companyId   = session?.companyId;

  const [data, setData] = useState<FinalizeData>(() =>
    buildInitial({
      driver: opts.driver,
      asset:  opts.asset,
      odometerInitial: opts.odometerInitial,
      companyName,
      signatory: { name: session?.name ?? null, dni: session?.dni ?? null },
      city: opts.companyCity ?? "",
    })
  );
  const [uploading, setUploading] = useState(false);

  const setField = useCallback(<K extends keyof FinalizeData>(k: K, v: FinalizeData[K]) => {
    setData((p) => ({ ...p, [k]: v }));
  }, []);

  const reset = useCallback(() => {
    setData(buildInitial({
      driver: opts.driver,
      asset:  opts.asset,
      odometerInitial: opts.odometerInitial,
      companyName,
      signatory: { name: session?.name ?? null, dni: session?.dni ?? null },
      city: opts.companyCity ?? "",
    }));
  }, [
    opts.driver.firstName, opts.driver.lastName,
    opts.asset.plate, opts.asset.brand, opts.asset.model, opts.asset.color, opts.asset.year,
    opts.odometerInitial, opts.companyCity,
    companyName, session?.name, session?.dni,
  ]);

  const uploadPhotos = useCallback(async (): Promise<string[]> => {
    if (!data.photos.length) return [];
    setUploading(true);
    try {
      const form = new FormData();
      const compressed = await Promise.all(
        data.photos.map((f) => compressIfImage(f, COMPRESS_OPTS_EVIDENCE))
      );
      compressed.forEach((f) => form.append("photos", f));
      const res = await fetch(
        `/api/upload/assignment-photos?companyId=${companyId}`,
        { method: "POST", body: form },
      );
      if (!res.ok) throw new Error("Error al subir fotos");
      const { urls } = await res.json();
      setData((p) => ({ ...p, photoUrls: urls }));
      return urls as string[];
    } finally {
      setUploading(false);
    }
  }, [data.photos, companyId]);

  const uploadSignature = useCallback(
    async (kind: "log" | "resp", dataUrl: string): Promise<string> => {
      setUploading(true);
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `sig-${kind}-${Date.now()}.png`, { type: "image/png" });
        const toUpload = await compressIfImage(file, COMPRESS_OPTS_EVIDENCE);
        const form = new FormData();
        form.append("photos", toUpload);
        const res = await fetch(
          `/api/upload/assignment-photos?companyId=${companyId}`,
          { method: "POST", body: form },
        );
        if (!res.ok) throw new Error("Error al subir firma");
        const { urls } = await res.json();
        const url = urls[0] as string;
        if (kind === "log") setData((p) => ({ ...p, signatureLogUrl: url }));
        else               setData((p) => ({ ...p, signatureRespUrl: url }));
        return url;
      } finally {
        setUploading(false);
      }
    },
    [companyId],
  );

  const uploadPdf = useCallback(async (blob: Blob): Promise<string> => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("pdf", blob, `acta-devolucion-${Date.now()}.pdf`);
      const res = await fetch(
        `/api/upload/handover-pdf?companyId=${companyId}`,
        { method: "POST", body: form },
      );
      if (!res.ok) throw new Error("Error al subir PDF");
      const { url } = await res.json();
      setData((p) => ({ ...p, pdfUrl: url as string }));
      return url as string;
    } finally {
      setUploading(false);
    }
  }, [companyId]);

  return { data, setField, reset, uploading, uploadPhotos, uploadSignature, uploadPdf };
}
