import { useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext";

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
  vehicleOdometer:  string;
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
  driver: { firstName: string; lastName: string; phone?: string | null },
  asset: {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    year?: string | null;
  },
  companyName: string,
  assignmentCount: number,
): WizardData {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const year    = now.getFullYear();

  return {
    actaNumber:    `ACTA-${year}-${String(assignmentCount + 1).padStart(4, "0")}`,
    actaDate:      dateStr,
    actaTime:      timeStr,
    actaPlace:     "",
    actaArea:      "",
    companyName,
    driverName:    `${driver.firstName} ${driver.lastName}`,
    driverDni:     "",
    driverPhone:   driver.phone ?? "",
    driverRole:    "",
    vehiclePlate:  asset.plate   ?? "",
    vehicleBrand:  asset.brand   ?? "",
    vehicleModel:  asset.model   ?? "",
    vehicleColor:  asset.color   ?? "",
    vehicleYear:   asset.year    ?? "",
    vehicleOdometer:  "",
    vehicleFuelLevel: "",
    vehicleCondition: "",
    novedades:        { ...DEFAULT_NOVEDADES },
    novedadesText:    "",
    accesorios:       { ...DEFAULT_ACCESORIOS },
    accesoriosOtros:  "",
    vehiclePhotos:    [],
    vehiclePhotoUrls: [],
    signatureLogDataUrl:  null,
    signatureLogUrl:      null,
    signatureRespDataUrl: null,
    signatureRespUrl:     null,
    pdfUrl: null,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHandoverWizard(
  driver: { firstName: string; lastName: string; phone?: string | null } | null,
  asset: {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    year?: string | null;
  } | null,
  assignmentCount: number,
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
    )
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Re-initialize when driver/asset change
  const reinitialize = useCallback(() => {
    setData(buildInitialData(
      driver ?? { firstName: "", lastName: "" },
      asset  ?? {},
      companyName,
      assignmentCount,
    ));
    setError(null);
  }, [driver, asset, companyName, assignmentCount]);

  const setField = useCallback(<K extends keyof WizardData>(key: K, value: WizardData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Upload vehicle photos → returns urls
  const uploadPhotos = useCallback(async (): Promise<string[]> => {
    if (!data.vehiclePhotos.length) return [];
    setUploading(true);
    try {
      const form = new FormData();
      data.vehiclePhotos.forEach((f) => form.append("photos", f));
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

  // Upload a signature dataUrl → returns server url
  const uploadSignature = useCallback(
    async (type: "log" | "resp", dataUrl: string): Promise<string> => {
      setUploading(true);
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `sig-${type}-${Date.now()}.png`, { type: "image/png" });
        const form = new FormData();
        form.append("photos", file);
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

  // Upload PDF blob → returns server url
  const uploadPdf = useCallback(async (blob: Blob): Promise<string> => {
    setUploading(true);
    try {
      const form = new FormData();
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

  const reset = useCallback(() => {
    reinitialize();
  }, [reinitialize]);

  return { data, setField, uploading, error, setError, uploadPhotos, uploadSignature, uploadPdf, reset };
}