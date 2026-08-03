// hooks/useHandoverWizard.ts
//
// jul 2026 v4 — Wizard simplificado. Los dos formatos de acta nuevos
// (Recepción y Entrega) son MUCHO más cortos que el modelo viejo:
//
//   - NO hay lista de 9 checks de Novedades
//   - NO hay lista de 11 checks de Accesorios
//   - NO hay Cargo, Teléfono, Combustible, Estado general
//   - NO hay N° de acta, Lugar, Área (la ciudad se mantiene para el
//     encabezado de la fecha en formato "En la ciudad de X, a los N
//     días del mes de M del año YYYY")
//   - NO hay bloque de Declaración legal largo (queda un párrafo
//     dentro de cada acta)
//   - NO hay campos de devolución en el alta (km, multas, foto
//     odómetro al regreso) — esas se manejan en el finalize
//
// El WizardData queda con lo mínimo indispensable para generar
// cualquiera de los dos PDFs. El `actaKind` (recepcion | entrega) se
// setea en el paso 1 del wizard y define qué plantilla se usa al
// generar el PDF.

import { useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { compressIfImage, COMPRESS_OPTS_EVIDENCE } from "../lib/mediaCompress";

// jul 2026 — Las fotos del acta se imprimen en el PDF, así que las
// guardamos con más resolución que las fotos de "evidencia" (1280px).
// Usamos el preset STANDARD (1600px, quality 0.82) para que cuando se
// rendereen a 220pt de alto en el PDF se vean nítidas y no borrosas.
const COMPRESS_OPTS_ACTA = {
  maxImageWidth: 1920,
  imageQuality: 0.88,
} as const;

// ─── Tipos ──────────────────────────────────────────────────────────────────

/** Tipo de acta que se va a generar. */
export type ActaKind = "recepcion" | "entrega";

export type WizardData = {
  /** Tipo de acta. Define el template del PDF. */
  actaKind: ActaKind;
  /** Ciudad donde se firma el acta (aparece en el encabezado de fecha). */
  actaPlace: string;
  /** Fecha del acta en formato "YYYY-MM-DD". */
  actaDate: string;
  /** Hora del acta en formato "HH:MM". */
  actaTime: string;
  /** Nombre de la empresa (sale de la sesión). */
  companyName: string;
  /** Tipo de vehículo (camioneta, sedan, etc.) — solo se muestra en
   *  el acta de Entrega. En Recepción es opcional. */
  vehicleType: string;

  // Datos del chofer (los trae el hook desde el conductor seleccionado)
  driverName:  string;
  driverDni:   string;

  // Datos del vehículo (los trae el hook desde el activo seleccionado)
  vehiclePlate: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleYear:  string;

  // Anexos: fotos del vehículo para incluir en el PDF
  vehiclePhotos:    File[];
  vehiclePhotoUrls: string[];

  // jul 2026 v5 — Texto libre de novedades / observaciones. Aparece
  // en AMBAS actas de alta (Recepción y Entrega) como un bloque
  // "OBSERVACIONES" debajo del cuerpo principal. El chofer puede
  // escribir cualquier cosa que encuentre en el vehículo al momento
  // de recibirlo (golpes, rayones, detalles, etc).
  novedadesText: string;

  // Firmas
  // jul 2026 v5.1 — Tanto en Recepción como en Entrega, el firmante
  // principal es el CHOFER (la firma va en `signatureRecibeDataUrl`).
  // En Entrega hay un SEGUNDO firmante (el encargado de logística) que
  // se guarda en `signatureEntregaDataUrl`. NO hay caso donde firme
  // el admin solo — en Recepción es el chofer.
  signatureEntregaDataUrl:  string | null;
  signatureEntregaUrl:      string | null;
  signatureRecibeDataUrl:   string | null;
  signatureRecibeUrl:       string | null;

  /** Nombre y DNI del encargado de la entrega (Departamento Logístico).
   *  Solo se usa en el acta de Entrega. Lo trae la sesión
   *  (current user). En el acta de Recepción, el único firmante es
   *  el chofer (ver `driverName` / `driverDni`). */
  signatoryName: string;
  signatoryDni:  string;

  /** PDF resultante (URL del storage una vez subido). */
  pdfUrl: string | null;
};

/** Datos pre-cargados al editar un acta existente. */
export type ExistingHandoverData = {
  actaKind?:          ActaKind | null;
  actaPlace?:         string | null;
  actaDate?:          string | null;
  actaTime?:          string | null;
  vehicleType?:       string | null;
  driverDni?:         string | null;
  signatureReceptorUrl?: string | null;
  signatureEntregaUrl?:  string | null;
  signatureRecibeUrl?:   string | null;
  vehiclePhotoUrls?:  string[];
  handoverUrl?:       string | null;
};

function buildInitialData(
  driver: { firstName: string; lastName: string; dni?: string | null },
  asset: {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    year?: string | null;
    category?: string | null;
  },
  companyName: string,
  currentUser: { name?: string | null; dni?: string | null },
  city: string,
  existing?: ExistingHandoverData | null,
): WizardData {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  return {
    actaKind:    existing?.actaKind    ?? "entrega",
    // jul 2026 v7 — `city` (default de cabecera) solo se usa si NO hay
    // un acta existente Y NO hay companyName. La ciudad por defecto
    // sale de la sesión del usuario, no de la empresa. Si la sesión
    // no la trae, queda en blanco para que el user la tipee.
    actaPlace:   existing?.actaPlace   ?? city,
    actaDate:    existing?.actaDate    ?? dateStr,
    actaTime:    existing?.actaTime    ?? timeStr,
    // jul 2026 v7 — companyName ahora viene como prop desde page.tsx
    // (session.companyName). Antes se leía con un cast raro y un
    // ternario bug que lo dejaba vacío, mostrando "EMPRESA" en el
    // header del PDF. Prioridad: prop > existing.handoverUrl no
    // aporta nada, así que solo el prop manda.
    companyName: companyName || "",
    vehicleType: existing?.vehicleType ?? asset.category ?? "",

    driverName:  `${driver.firstName} ${driver.lastName}`,
    driverDni:   existing?.driverDni ?? driver.dni ?? "",

    vehiclePlate: asset.plate ?? "",
    vehicleBrand: asset.brand ?? "",
    vehicleModel: asset.model ?? "",
    vehicleColor: asset.color ?? "",
    vehicleYear:  asset.year  ?? "",

    vehiclePhotos:    [],
    vehiclePhotoUrls: existing?.vehiclePhotoUrls ?? [],

    // jul 2026 v5 — Por defecto vacío, el chofer lo llena en el wizard.
    novedadesText: "",

    signatureEntregaDataUrl:  existing?.signatureEntregaUrl  ?? null,
    signatureEntregaUrl:      existing?.signatureEntregaUrl  ?? null,
    signatureRecibeDataUrl:   existing?.signatureRecibeUrl   ?? null,
    signatureRecibeUrl:       existing?.signatureRecibeUrl   ?? null,

    signatoryName: currentUser.name ?? "",
    signatoryDni:  currentUser.dni  ?? "",

    pdfUrl: existing?.handoverUrl ?? null,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useHandoverWizard(
  driver: { firstName: string; lastName: string; dni?: string | null } | null,
  asset: {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    year?: string | null;
    category?: string | null;
  } | null,
  existing?: ExistingHandoverData | null,
  // jul 2026 v7 — companyName ahora viene como prop desde el call site
  // (page.tsx lo levanta de `session.companyName`). Dejamos de leerlo
  // desde useAuth con el cast raro + ternario bug que lo dejaba vacío.
  companyNameOverride?: string,
) {
  const { session } = useAuth();
  const companyId = session?.companyId;

  // Resolver companyName: prop > sesión. El prop es la fuente primaria
  // porque el padre lo levanta con el typing correcto desde
  // useAuth; la sesión se mantiene como fallback por compat.
  const companyName = (companyNameOverride && companyNameOverride.trim())
    || session?.companyName
    || "";

  const [data, setData] = useState<WizardData>(() =>
    buildInitialData(
      driver ?? { firstName: "", lastName: "" },
      asset  ?? {},
      companyName,
      { name: session?.name ?? null, dni: session?.dni ?? null },
      "",  // city default — sin sede por defecto; el user lo tipea
      existing,
    )
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const reinitialize = useCallback((existingOverride?: ExistingHandoverData | null) => {
    setData(buildInitialData(
      driver ?? { firstName: "", lastName: "" },
      asset  ?? {},
      companyName,
      { name: session?.name ?? null, dni: session?.dni ?? null },
      "",
      existingOverride ?? existing,
    ));
    setError(null);
  }, [driver, asset, companyName, session?.name, session?.dni, existing]);

  const setField = useCallback(<K extends keyof WizardData>(key: K, value: WizardData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  // jul 2026 — Límite del backend = 50 fotos por acta. Lo validamos
  // acá también para no pegar al server si ya sabemos que va a tirar 400.
  // El toast lo dispara el caller (HandoerWizard) porque acá no usamos
  // sonner para mantener el hook genérico.
  const MAX_ASSIGNMENT_PHOTOS = 50;

  const uploadPhotos = useCallback(async (): Promise<string[]> => {
    if (!data.vehiclePhotos.length) return [];
    if (data.vehiclePhotos.length > MAX_ASSIGNMENT_PHOTOS) {
      throw new Error(
        `Máximo ${MAX_ASSIGNMENT_PHOTOS} fotos por acta. Tenés ${data.vehiclePhotos.length}. ` +
        `Quitá ${data.vehiclePhotos.length - MAX_ASSIGNMENT_PHOTOS} antes de continuar.`,
      );
    }
    setUploading(true);
    try {
      const form = new FormData();
      const compressed = await Promise.all(
        data.vehiclePhotos.map((f) => compressIfImage(f, COMPRESS_OPTS_ACTA))
      );
      compressed.forEach((f) => form.append("photos", f));
      const res = await fetch(
        `/api/upload/assignment-photos?companyId=${companyId}`,
        { method: "POST", body: form },
      );
      if (!res.ok) {
        // Intentamos leer el mensaje real del backend (cualquiera de
        // los formatos que el server use: {message}, {error}, {error:{message}}).
        const body = await res.json().catch(() => null);
        const backendMsg =
          body?.message
          ?? body?.error?.message
          ?? body?.error
          ?? `Error ${res.status} al subir fotos`;
        throw new Error(backendMsg);
      }
      const { urls } = await res.json();
      setData((prev) => ({ ...prev, vehiclePhotoUrls: urls }));
      return urls as string[];
    } finally {
      setUploading(false);
    }
  }, [data.vehiclePhotos, companyId]);

  const uploadSignature = useCallback(
    async (kind: "entrega" | "recibe", dataUrl: string): Promise<string> => {
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
        if (kind === "entrega") setData((p) => ({ ...p, signatureEntregaUrl: url }));
        else                     setData((p) => ({ ...p, signatureRecibeUrl: url }));
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

  const reset = useCallback((existingOverride?: ExistingHandoverData | null) => {
    reinitialize(existingOverride);
  }, [reinitialize]);

  return { data, setField, uploading, error, setError, uploadPhotos, uploadSignature, uploadPdf, reset };
}
