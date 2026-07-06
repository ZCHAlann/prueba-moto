import { useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { compressIfImage, COMPRESS_OPTS_EVIDENCE } from "../lib/mediaCompress";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NovedadesState = {
  sinNovedades:         boolean;
  lucesDanadas:         boolean;
  faltanAccesorios:     boolean;
  fallaMecanica:        boolean;
  llantasMalEstado:     boolean;
  requiereMantenimiento:boolean;
  choqueAccidente:      boolean;
  golpes:               boolean;
  interiorSucio:        boolean;
  multas:               boolean;
};

export type AccesoriosState = {
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

export type WizardData = {
  // Step 1
  actaNumber:    string;
  actaDate:      string;
  actaTime:      string;
  actaPlace:     string;
  actaArea:      string;
  companyName:   string;
  // Step 2
  driverName:    string;
  driverDni:     string;
  driverPhone:   string;
  driverRole:    string;
  // Step 3
  vehiclePlate:  string;
  vehicleBrand:  string;
  vehicleModel:  string;
  vehicleColor:  string;
  vehicleYear:   string;
  /** Km al devolver (entrega) en modo alta. En modo finalize es el km de regreso (usuario lo ingresa). */
  vehicleOdometer:  string;
  /** Km originales al momento de la entrega — se muestra como referencia en finalize. */
  vehicleOdometerDelivery: string;
  vehicleFuelLevel: string;
  vehicleCondition: string;
  // Step 4
  novedades:     NovedadesState;
  novedadesText: string;
  // Step 5
  accesorios:       AccesoriosState;
  accesoriosOtros:  string;
  // Step 6
  vehiclePhotos:    File[];
  vehiclePhotoUrls: string[];
  // Step 7 & 8
  signatureLogDataUrl:  string | null;
  signatureLogUrl:      string | null;
  signatureRespDataUrl: string | null;
  signatureRespUrl:     string | null;
  // PDF
  pdfUrl: string | null;
  logisticsName: string;
  logisticsDni:  string;
  // ── Campos específicos del acta de DEVOLUCIÓN (solo finalize) ─────────────
  returnOdometerPhotoUrl: string | null;
  /** File local del odómetro al regreso, antes de subir. */
  returnOdometerPhoto:    File | null;
  multasText:            string;
};

// Datos que vienen del acta existente (edit mode)
export type ExistingHandoverData = {
  actaNumber?:       string | null;
  actaDate?:         string | null;
  actaTime?:         string | null;
  actaPlace?:        string | null;
  actaArea?:         string | null;
  driverDni?:        string | null;
  driverPhone?:      string | null;
  driverRole?:       string | null;
  vehicleOdometer?:  string | null;
  vehicleFuelLevel?: string | null;
  vehicleCondition?: string | null;
  novedades?:        Record<string, unknown> | null;
  accesorios?:       Record<string, unknown> | null;
  novedadesText?:    string | null;
  signatureLogUrl?:  string | null;
  signatureRespUrl?: string | null;
  vehiclePhotoUrls?: string[];
  handoverUrl?:      string | null;
  // Datos del acta de devolución (si la asignación ya fue finalizada).
  returnOdometerPhotoUrl?: string | null;
  multasText?:            string | null;
};

const DEFAULT_NOVEDADES: NovedadesState = {
  sinNovedades:          false,
  lucesDanadas:          false,
  faltanAccesorios:      false,
  fallaMecanica:         false,
  llantasMalEstado:      false,
  requiereMantenimiento: false,
  choqueAccidente:       false,
  golpes:                false,
  interiorSucio:         false,
  multas:                false,
};

const DEFAULT_ACCESORIOS: AccesoriosState = {
  matricula:      true,
  llaveRepuesto:  true,
  triangulos:     true,
  herramientas:   true,
  seguro:         true,
  gata:           true,
  extintor:       true,
  radio:          true,
  llavePrincipal: true,
  llaveRuedas:    true,
  botiquin:       true,
};

function buildInitialData(
  driver: { firstName: string; lastName: string; phone?: string | null; dni?: string | null },
  asset: {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    year?: string | null;
  },
  companyName: string,
  assignmentCount: number,
  existing?: ExistingHandoverData | null,
  finalizeMode = false,
  currentUser?: { name?: string | null; dni?: string | null } | null,
): WizardData {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const year    = now.getFullYear();

  // Si hay datos existentes, los usamos; si no, valores por defecto
  return {
    actaNumber:    existing?.actaNumber    ?? `ACTA-${year}-${String(assignmentCount + 1).padStart(4, "0")}`,
    actaDate:      existing?.actaDate      ?? dateStr,
    actaTime:      existing?.actaTime      ?? timeStr,
    actaPlace:     existing?.actaPlace     ?? "",
    actaArea:      existing?.actaArea      ?? "",
    companyName,
    driverName:    `${driver.firstName} ${driver.lastName}`,
    // jun 2026 — autorrellenamos el DNI desde el perfil del conductor.
    // Prioridad: existingData (acta editada) > driver.dni (columna
    // dedicada del conductor en company_drivers, migración 0040).
    // Antes había que tipearlo a mano cada vez.
    driverDni:     existing?.driverDni     ?? driver.dni ?? "",
    driverPhone:   existing?.driverPhone   ?? driver.phone ?? "",
    driverRole:    existing?.driverRole    ?? "",
    vehiclePlate:  asset.plate  ?? "",
    vehicleBrand:  asset.brand  ?? "",
    vehicleModel:  asset.model  ?? "",
    vehicleColor:  asset.color  ?? "",
    vehicleYear:   asset.year   ?? "",
    // En finalizeMode: guardamos el km original en vehicleOdometerDelivery
    // y dejamos vehicleOdometer vacío para que el usuario ingrese el de regreso.
    vehicleOdometer: finalizeMode ? "" : (existing?.vehicleOdometer ?? ""),
    vehicleOdometerDelivery: existing?.vehicleOdometer ?? "",
    vehicleFuelLevel: existing?.vehicleFuelLevel ?? "",
    vehicleCondition: existing?.vehicleCondition ?? "",
    novedades:     (existing?.novedades as NovedadesState) ?? { ...DEFAULT_NOVEDADES },
    novedadesText: existing?.novedadesText ?? "",
    accesorios:    (existing?.accesorios as AccesoriosState) ?? { ...DEFAULT_ACCESORIOS },
    accesoriosOtros:  "",
    vehiclePhotos:    [],
    vehiclePhotoUrls: existing?.vehiclePhotoUrls ?? [],
    signatureLogDataUrl:  existing?.signatureLogUrl  ?? null,  // precarga URL como dataUrl visual
    signatureLogUrl:      existing?.signatureLogUrl  ?? null,
    signatureRespDataUrl: existing?.signatureRespUrl ?? null,
    signatureRespUrl:     existing?.signatureRespUrl ?? null,
    pdfUrl: existing?.handoverUrl ?? null,
    logisticsName: currentUser?.name ?? "",
    logisticsDni:  currentUser?.dni  ?? "",
    returnOdometerPhotoUrl: existing?.returnOdometerPhotoUrl ?? null,
    returnOdometerPhoto:    null,
    multasText:            existing?.multasText ?? "",
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHandoverWizard(
  driver: { firstName: string; lastName: string; phone?: string | null; dni?: string | null } | null,
  asset: {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    year?: string | null;
  } | null,
  assignmentCount: number,
  existing?: ExistingHandoverData | null,
  finalizeMode = false,
) {
  const { session } = useAuth();
  const companyName = (session as Record<string, unknown>)?.companyName as string ?? "";
  const companyId   = session?.companyId;

  const [data, setData] = useState<WizardData>(() =>
    buildInitialData(
      driver ?? { firstName: "", lastName: "" },
      asset  ?? {},
      companyName,
      assignmentCount,
      existing,
      finalizeMode,
      { name: session?.name ?? null, dni: session?.dni ?? null },
    )
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const reinitialize = useCallback((existingOverride?: ExistingHandoverData | null, isFinalize?: boolean) => {
    setData(buildInitialData(
      driver ?? { firstName: "", lastName: "" },
      asset  ?? {},
      companyName,
      assignmentCount,
      existingOverride ?? existing,
      isFinalize ?? finalizeMode,
    ));
    setError(null);
  }, [driver, asset, companyName, assignmentCount, existing, finalizeMode]);

  const setField = useCallback(<K extends keyof WizardData>(key: K, value: WizardData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const uploadPhotos = useCallback(async (): Promise<string[]> => {
    if (!data.vehiclePhotos.length) return [];
    setUploading(true);
    try {
      const form = new FormData();
      // Comprimir cada foto antes de subirla
      const compressed = await Promise.all(
        data.vehiclePhotos.map((f) => compressIfImage(f, COMPRESS_OPTS_EVIDENCE))
      );
      compressed.forEach((f) => form.append("photos", f));
      const res = await fetch(
        `/api/upload/assignment-photos?companyId=${companyId}`,
        { method: "POST", body: form },
      );
      if (!res.ok) throw new Error("Error al subir fotos");
      const { urls } = await res.json();
      setData((prev) => ({ ...prev, vehiclePhotoUrls: urls }));
      return urls as string[];
    } finally {
      setUploading(false);
    }
  }, [data.vehiclePhotos, companyId]);

  const uploadSignature = useCallback(
    async (type: "log" | "resp", dataUrl: string): Promise<string> => {
      setUploading(true);
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `sig-${type}-${Date.now()}.png`, { type: "image/png" });
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
        if (type === "log") setData((prev) => ({ ...prev, signatureLogUrl: url }));
        else                setData((prev) => ({ ...prev, signatureRespUrl: url }));
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
      // PDF: no se comprime (compressIfImage lo dejaría igual por no ser imagen)
      form.append("pdf", blob, `acta-${Date.now()}.pdf`);
      const res = await fetch(
        `/api/upload/handover-pdf?companyId=${companyId}`,
        { method: "POST", body: form },
      );
      if (!res.ok) throw new Error("Error al subir PDF");
      const { url } = await res.json();
      setData((prev) => ({ ...prev, pdfUrl: url as string }));
      return url as string;
    } finally {
      setUploading(false);
    }
  }, [companyId]);

  /**
   * Sube la foto del odómetro al regreso y devuelve la URL persistida.
   * Devuelve string vacío si no hay foto (sin upload).
   */
  const uploadOdometerPhoto = useCallback(async (file: File | null): Promise<string | null> => {
    if (!file) return null;
    setUploading(true);
    try {
      const toUpload = await compressIfImage(file, COMPRESS_OPTS_EVIDENCE);
      const form = new FormData();
      form.append("photos", toUpload);
      const res = await fetch(
        `/api/upload/assignment-photos?companyId=${companyId}`,
        { method: "POST", body: form },
      );
      if (!res.ok) throw new Error("Error al subir foto del odómetro");
      const { urls } = await res.json();
      const url = urls[0] as string;
      setData((prev) => ({ ...prev, returnOdometerPhotoUrl: url }));
      return url;
    } finally {
      setUploading(false);
    }
  }, [companyId]);

  const reset = useCallback((existingOverride?: ExistingHandoverData | null, isFinalize?: boolean) => {
    reinitialize(existingOverride, isFinalize);
  }, [reinitialize]);

  return { data, setField, uploading, error, setError, uploadPhotos, uploadSignature, uploadPdf, uploadOdometerPhoto, reset };
}