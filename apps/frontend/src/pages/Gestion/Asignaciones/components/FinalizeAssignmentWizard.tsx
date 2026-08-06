// pages/Gestion/Asignaciones/components/FinalizeAssignmentWizard.tsx
//
// jul 2026 v5 — Wizard de FINALIZACIÓN de asignación. Modal APARTE
// del `HandoverWizard` (que es solo para alta). Se abre desde el botón
// "Finalizar" del drawer de detalle de la asignación.
//
// Flujo:
//   1) Cabecera + estado del vehículo: ciudad, fecha, hora, km al
//      regresar, combustible, estado general.
//   2) Fotos del vehículo al regreso (opcional, para anexo en el PDF).
//   3) Novedades: 9 checks + textarea libre para detalles.
//   4) Accesorios: 11 checks (con tristate para extintor y botiquín) +
//      textarea libre. Multas (opcional, textarea).
//   5) Firmas: encargado de logística (current user) + chofer.
//   6) Vista previa del PDF + botón "Finalizar asignación y guardar acta".
//
// Al confirmar: sube fotos, sube firmas, genera el PDF de devolución,
// llama al endpoint `POST /assignments/:id/finalize` con el PDF y los
// datos del acta. El backend pasa la asignación a status="Finalizada"
// y guarda el `returnHandoverUrl` (independiente del `handoverUrl`
// original — NO se sobreescribe el acta de entrega).

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Download, Loader2, X,
  ClipboardList, Camera, AlertTriangle, Package, PenTool, Eye,
  Check, FileText,
} from "lucide-react";
import {
  useFinalizeActaWizard,
  type FinalizeNovedad,
  type FinalizeAccesorio,
} from "../../../../hooks/useFinalizeActaWizard";
import { generateReturnActaPdf } from "./ActaPdf";
import { SignatureCanvas } from "./SignatureCanvas";
import type { ApiAssignment, HandoverPayload } from "../../../../hooks/useAssignments";

// ─── Tipos ────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  assignmentId: string;
  driver: { firstName: string; lastName: string; dni?: string | null };
  asset: {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    year?: string | null;
  };
  /** Km al entregar, de la asignación original. */
  odometerInitial: string | null;
  companyCity?: string;
  // jul 2026 v7 — Company name para el header del PDF de Devolución.
  // Viene desde page.tsx → session.companyName.
  companyName?: string;
  onClose: () => void;
  onComplete: (assignment: ApiAssignment) => void;
  /**
   * Backend: `POST /assignments/:id/finalize`. Body con la metadata
   * del acta de devolución. El backend se encarga de pasar la
   * asignación a Finalizada.
   */
  finalizeAssignment: (id: string, body: FinalizeBackendBody) => Promise<ApiAssignment>;
};

/** Shape del body que espera el endpoint de finalize. Lo tipeamos
 *  inline para no acoplar el frontend al schema exacto del backend. */
export type FinalizeBackendBody = {
  endDate: string;
  returnHandoverUrl: string;
  returnOdometer: string;
  fuelLevel: string;
  condition: string;
  novedades: FinalizeNovedad;
  novedadesText: string;
  accesorios: FinalizeAccesorio;
  accesoriosOtros: string;
  multasText: string;
  photoUrls: string[];
  signatureLogUrl: string | null;
  signatureRespUrl: string | null;
};

const STEPS = [
  { id: "header",   label: "Cabecera y estado",  Icon: ClipboardList },
  { id: "photos",   label: "Fotos",              Icon: Camera },
  { id: "nov",      label: "Novedades",          Icon: AlertTriangle },
  { id: "acc",      label: "Accesorios",         Icon: Package },
  { id: "sign",     label: "Firmas",             Icon: PenTool },
  { id: "preview",  label: "Vista previa",       Icon: Eye },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────

const fadeY = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const } },
  exit:    { opacity: 0, x: -24, transition: { duration: 0.2,  ease: [0.4, 0, 1, 1]    as const } },
};

const NOV_LABELS: Array<{ key: keyof FinalizeNovedad; label: string }> = [
  { key: "sinNovedades",          label: "Sin novedades" },
  { key: "lucesDanadas",          label: "Luces dañadas" },
  { key: "faltanAccesorios",      label: "Faltan accesorios" },
  { key: "fallaMecanica",         label: "Falla mecánica" },
  { key: "llantasMalEstado",      label: "Llantas en mal estado" },
  { key: "requiereMantenimiento", label: "Requiere mantenimiento" },
  { key: "choqueAccidente",       label: "Choque / accidente" },
  { key: "golpes",                label: "Golpes" },
  { key: "interiorSucio",         label: "Interior sucio" },
  { key: "multas",                label: "Multas / infracciones" },
];

const ACC_LABELS: Array<{ key: keyof FinalizeAccesorio; label: string; tristate?: boolean }> = [
  { key: "matricula",      label: "Matrícula" },
  { key: "llaveRepuesto",  label: "Llave de repuesto" },
  { key: "triangulos",     label: "Triángulos" },
  { key: "herramientas",   label: "Herramientas básicas" },
  { key: "seguro",         label: "Seguro / póliza" },
  { key: "gata",           label: "Gata" },
  { key: "extintor",       label: "Extintor", tristate: true },
  { key: "radio",          label: "Radio / GPS" },
  { key: "llavePrincipal", label: "Llave principal" },
  { key: "llaveRuedas",    label: "Llave de ruedas" },
  { key: "botiquin",       label: "Botiquín", tristate: true },
];

// ─── Componente principal ───────────────────────────────────────────────

export function FinalizeAssignmentWizard({
  open,
  assignmentId,
  driver,
  asset,
  odometerInitial,
  companyCity,
  companyName,
  onClose,
  onComplete,
  finalizeAssignment,
}: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [, setPdfBlob]                    = useState<Blob | null>(null);

  const {
    data, setField, reset, uploading,
    uploadPhotos, uploadSignature, uploadPdf,
  } = useFinalizeActaWizard({ driver, asset, odometerInitial, companyCity });

  // Reset al abrir/cerrar
  useEffect(() => {
    if (open) {
      reset();
      setStep(0);
      setPdfPreviewUrl(null);
      setPdfBlob(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Autogenerar PDF al entrar al paso 6 (preview)
  useEffect(() => {
    let cancelled = false;
    if (step !== 5) return;
    (async () => {
      try {
        const blob = await generateReturnActaPdf({
          actaDate:        data.actaDate,
          actaTime:        data.actaTime,
          actaPlace:       data.actaPlace,
          // jul 2026 v7 — Company name desde prop (vía session).
          companyName:     companyName ?? "",
          driverName:      `${driver.firstName} ${driver.lastName}`,
          driverDni:       driver.dni ?? "",
          vehiclePlate:    data.vehiclePlate,
          vehicleBrand:    data.vehicleBrand,
          vehicleModel:    data.vehicleModel,
          vehicleColor:    data.vehicleColor,
          vehicleYear:     data.vehicleYear,
          odometerInitial: data.odometerInitial,
          odometerReturn:  data.odometerReturn,
          fuelLevel:       data.fuelLevel,
          condition:       data.condition,
          novedades:       data.novedades,
          novedadesText:   data.novedadesText,
          accesorios:      data.accesorios,
          accesoriosOtros: data.accesoriosOtros,
          pdfUrl:          null,
          signatoryName:   data.signatoryName,
          signatoryDni:    data.signatoryDni,
          odometerReturnPhotoUrl: null,
          multasText:      data.multasText,
          photoUrls:       [],
        } as never, data.photos);  // type cast: el template solo usa un subset
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPdfBlob(blob);
        setPdfPreviewUrl(url);
      } catch (e) {
        if (!cancelled) {
          toast.error("No se pudo generar la vista previa");
          console.error(e);
        }
      }
    })();
    return () => {
      cancelled = true;
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPdfBlob(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!open) return null;

  function goNext() {
    setError(null);
    if (step === 0) {
      if (!data.actaPlace.trim()) return setError("La ciudad es requerida.");
      if (!data.actaDate)         return setError("La fecha es requerida.");
      if (!data.actaTime)         return setError("La hora es requerida.");
      if (!data.odometerReturn.trim()) return setError("Indicá el km al regresar.");
      if (!data.fuelLevel.trim())      return setError("Indicá el nivel de combustible.");
      if (!data.condition.trim())      return setError("Indicá el estado general del vehículo.");
    }
    if (step === 2) {
      // Novedades: si no marcó ninguna, avisamos pero no bloqueamos.
      const anyNov = Object.values(data.novedades).some(Boolean);
      if (!anyNov) return setError("Marcá al menos una opción en Novedades (si todo está bien, tildá 'Sin novedades').");
    }
    if (step === 3) {
      // Accesorios: validación análoga.
      const allTrue = Object.entries(data.accesorios).every(([_, v]) => v === true);
      if (!allTrue) return setError("Confirmá todos los accesorios (los que no están usá 'NO' o 'NO TIENE' según corresponda).");
    }
    if (step === 4) {
      if (!data.signatureLogDataUrl)  return setError("Falta la firma del encargado (Logística).");
      if (!data.signatureRespDataUrl) return setError("Falta la firma del chofer.");
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function onFinalizeAndSave() {
    setSaving(true);
    setError(null);
    try {
      // 1. Subir fotos (si hay)
      const photoUrls = await uploadPhotos();

      // 2. Subir firmas
      const sigTasks: Promise<unknown>[] = [];
      if (data.signatureLogDataUrl && !data.signatureLogUrl) {
        sigTasks.push(uploadSignature("log", data.signatureLogDataUrl));
      }
      if (data.signatureRespDataUrl && !data.signatureRespUrl) {
        sigTasks.push(uploadSignature("resp", data.signatureRespDataUrl));
      }
      await Promise.all(sigTasks);

      // 3. Generar el PDF final (con las fotos ya subidas, no reusar el
      //    preview: ahí solo están los Files locales) y subirlo
      const finalBlob = await generateReturnActaPdf({
        actaDate:        data.actaDate,
        actaTime:        data.actaTime,
        actaPlace:       data.actaPlace,
        companyName:     companyName ?? "",
        driverName:      `${driver.firstName} ${driver.lastName}`,
        driverDni:       driver.dni ?? "",
        vehiclePlate:    data.vehiclePlate,
        vehicleBrand:    data.vehicleBrand,
        vehicleModel:    data.vehicleModel,
        vehicleColor:    data.vehicleColor,
        vehicleYear:     data.vehicleYear,
        odometerInitial: data.odometerInitial,
        odometerReturn:  data.odometerReturn,
        fuelLevel:       data.fuelLevel,
        condition:       data.condition,
        novedades:       data.novedades,
        novedadesText:   data.novedadesText,
        accesorios:      data.accesorios,
        accesoriosOtros: data.accesoriosOtros,
        pdfUrl:          null,
        signatoryName:   data.signatoryName,
        signatoryDni:    data.signatoryDni,
        odometerReturnPhotoUrl: null,
        multasText:      data.multasText,
        photoUrls,       // URLs remotas recién subidas
      } as never);
      const pdfUrl = await uploadPdf(finalBlob);

      // 4. Llamar al endpoint de finalización con el body completo
      const endDate = `${data.actaDate}T${data.actaTime || "00:00"}:00`;
      const result = await finalizeAssignment(assignmentId, {
        endDate,
        returnHandoverUrl: pdfUrl,
        returnOdometer:    data.odometerReturn,
        fuelLevel:         data.fuelLevel,
        condition:         data.condition,
        novedades:         data.novedades,
        novedadesText:     data.novedadesText,
        accesorios:        data.accesorios,
        accesoriosOtros:   data.accesoriosOtros,
        multasText:        data.multasText,
        photoUrls,
        signatureLogUrl:   data.signatureLogUrl,
        signatureRespUrl:  data.signatureRespUrl,
      });
      toast.success("Asignación finalizada y acta de devolución guardada");
      onComplete(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al finalizar";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/70 backdrop-blur-sm">
      <div className="flex h-[min(88vh,800px)] w-[min(900px,96vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-300">
              <FileText size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-800 dark:text-white">
                Acta de devolución
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Finalizar asignación · {asset.plate || "—"}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06]">
            <X size={16} />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50/60 px-4 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
          {STEPS.map((s, idx) => {
            const state = idx < step ? "done" : idx === step ? "active" : "inactive";
            return (
              <div key={s.id} className="flex items-center gap-1.5">
                <div className={`flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-bold ${
                  state === "active" ? "bg-rose-500 text-white"
                  : state === "done"   ? "bg-emerald-500 text-white"
                  : "bg-gray-200 text-gray-500 dark:bg-white/[0.06]"
                }`}>
                  {state === "done" ? "✓" : idx + 1}
                </div>
                <span className={`text-[10px] font-semibold ${
                  state === "active" ? "text-rose-700 dark:text-rose-300"
                  : state === "done"   ? "text-emerald-700 dark:text-emerald-300"
                  : "text-gray-500 dark:text-gray-400"
                }`}>{s.label}</span>
                {idx < STEPS.length - 1 && <ChevronRight size={10} className="text-gray-300" />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {error && (
            <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div key={step} {...fadeY}>
              {step === 0 && <Step1Header data={data} setField={setField} odometerInitial={odometerInitial} />}
              {step === 1 && <Step2Photos data={data} setField={setField} />}
              {step === 2 && <Step3Novedades data={data} setField={setField} />}
              {step === 3 && <Step4Accesorios data={data} setField={setField} />}
              {step === 4 && <Step5Signatures data={data} setField={setField} />}
              {step === 5 && <Step6Preview pdfPreviewUrl={pdfPreviewUrl} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 dark:border-white/[0.06]">
          <button type="button" onClick={goBack} disabled={step === 0 || saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-brand-400 disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200">
            <ChevronLeft size={12} /> Atrás
          </button>
          <div className="flex items-center gap-2">
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={goNext} disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:opacity-40">
                Siguiente <ChevronRight size={12} />
              </button>
            ) : (
              <button type="button" onClick={onFinalizeAndSave}
                disabled={saving || uploading || !pdfPreviewUrl}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Finalizar y guardar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Paso 1: Cabecera + estado del vehículo ───────────────────────────────

function Step1Header({ data, setField, odometerInitial }: {
  data: ReturnType<typeof useFinalizeActaWizard>["data"];
  setField: ReturnType<typeof useFinalizeActaWizard>["setField"];
  odometerInitial: string | null;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Cabecera</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Ciudad" value={data.actaPlace} onChange={(v) => setField("actaPlace", v)} required />
          <Field label="Fecha"  type="date" value={data.actaDate} onChange={(v) => setField("actaDate", v)} required />
          <Field label="Hora"   type="time" value={data.actaTime} onChange={(v) => setField("actaTime", v)} required />
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Estado al regresar</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field
            label={odometerInitial ? `Km al regresar (inicial: ${odometerInitial})` : "Km al regresar"}
            type="number"
            value={data.odometerReturn}
            onChange={(v) => setField("odometerReturn", v)}
            required
          />
          <Field
            label="Combustible"
            value={data.fuelLevel}
            onChange={(v) => setField("fuelLevel", v)}
            placeholder="Ej: Lleno, 3/4, 1/2, 1/4"
            required
          />
          <Field
            label="Estado general"
            value={data.condition}
            onChange={(v) => setField("condition", v)}
            placeholder="Ej: Bueno, Rayones, Golpes, etc"
            required
          />
        </div>
      </div>
    </div>
  );
}

// ─── Paso 2: Fotos ────────────────────────────────────────────────────────

function Step2Photos({ data, setField }: {
  data: ReturnType<typeof useFinalizeActaWizard>["data"];
  setField: ReturnType<typeof useFinalizeActaWizard>["setField"];
}) {
  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setField("photos", [...data.photos, ...files]);
    e.target.value = "";
  }
  function remove(i: number) {
    setField("photos", data.photos.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Fotos del vehículo al regreso (opcional)
      </h3>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Subí fotos que documenten el estado del vehículo al momento
        de la devolución: odómetro, daños visibles, faltantes, etc.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {data.photos.map((file, i) => (
          <PhotoThumb key={i} file={file} onRemove={() => remove(i)} />
        ))}
        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/50 text-xs text-gray-500 transition hover:border-rose-400 hover:bg-rose-50/30 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-400 dark:hover:border-rose-500/50">
          <Camera size={20} className="mb-1" />
          Subir foto
          <input type="file" accept="image/*" multiple onChange={onPick} className="hidden" />
        </label>
      </div>
    </div>
  );
}

function PhotoThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-white/[0.08]">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
      <button type="button" onClick={onRemove}
        className="absolute right-1 top-1 rounded-md bg-rose-500/90 p-1 text-white opacity-0 transition group-hover:opacity-100">
        <X size={12} />
      </button>
    </div>
  );
}

// ─── Paso 3: Novedades ───────────────────────────────────────────────────

function Step3Novedades({ data, setField }: {
  data: ReturnType<typeof useFinalizeActaWizard>["data"];
  setField: ReturnType<typeof useFinalizeActaWizard>["setField"];
}) {
  function setNov<K extends keyof FinalizeNovedad>(k: K, v: FinalizeNovedad[K]) {
    setField("novedades", { ...data.novedades, [k]: v });
  }
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Daños / Novedades observadas al regreso
      </h3>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {NOV_LABELS.map(({ key, label }) => (
          <label key={key}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition ${
              data.novedades[key]
                ? "border-rose-400 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10"
                : "border-gray-200 bg-white hover:border-gray-300 dark:border-white/[0.08] dark:bg-white/[0.02]"
            }`}>
            <input type="checkbox" checked={data.novedades[key]}
              onChange={(e) => setNov(key, e.target.checked as FinalizeNovedad[K])}
              className="h-3.5 w-3.5 accent-rose-500"
            />
            <span className="text-xs text-gray-700 dark:text-gray-200">{label}</span>
          </label>
        ))}
      </div>
      <div>
        <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Detalle / Observaciones (opcional)
        </h4>
        <textarea
          value={data.novedadesText}
          onChange={(e) => setField("novedadesText", e.target.value)}
          rows={3}
          placeholder="Ej: Rayón en paragolpes trasero derecho. Pequeño bollito en capó. Neumático delantero izquierdo con presión baja."
          className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-rose-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
        />
      </div>
    </div>
  );
}

// ─── Paso 4: Accesorios + multas ──────────────────────────────────────────

function Step4Accesorios({ data, setField }: {
  data: ReturnType<typeof useFinalizeActaWizard>["data"];
  setField: ReturnType<typeof useFinalizeActaWizard>["setField"];
}) {
  function setAcc<K extends keyof FinalizeAccesorio>(k: K, v: FinalizeAccesorio[K]) {
    setField("accesorios", { ...data.accesorios, [k]: v });
  }
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Accesorios / Documentos devueltos
      </h3>
      <p className="text-[10px] text-gray-500 dark:text-gray-400">
        Marcá Sí / No / No tiene para cada accesorio. Esto queda asentado en el acta.
      </p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {ACC_LABELS.map(({ key, label, tristate }) => (
          <TriStateRow
            key={key}
            label={label}
            value={data.accesorios[key]}
            tristate={tristate}
            onChange={(v) => setAcc(key, v as FinalizeAccesorio[K])}
          />
        ))}
      </div>
      <div>
        <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Otros accesorios (opcional)
        </h4>
        <textarea
          value={data.accesoriosOtros}
          onChange={(e) => setField("accesoriosOtros", e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-rose-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
        />
      </div>
      <div>
        <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Multas / infracciones (opcional)
        </h4>
        <textarea
          value={data.multasText}
          onChange={(e) => setField("multasText", e.target.value)}
          rows={2}
          placeholder="Si hubo multas durante el período de la asignación, indicá número y fecha."
          className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-rose-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
        />
      </div>
    </div>
  );
}

function TriStateRow({ label, value, tristate, onChange }: {
  label: string;
  value: boolean | "noTiene";
  tristate?: boolean;
  onChange: (v: boolean | "noTiene") => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.02]">
      <span className="flex-1 text-xs text-gray-700 dark:text-gray-200">{label}</span>
      <TriButton active={value === true}     onClick={() => onChange(true)}>Sí</TriButton>
      <TriButton active={value === false}    onClick={() => onChange(false)}>No</TriButton>
      {tristate && (
        <TriButton active={value === "noTiene"} onClick={() => onChange("noTiene")}>N/T</TriButton>
      )}
    </div>
  );
}

function TriButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`h-6 min-w-[28px] rounded-md border px-1.5 text-[10px] font-bold uppercase transition ${
        active
          ? "border-rose-500 bg-rose-500 text-white"
          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400"
      }`}>
      {children}
    </button>
  );
}

// ─── Paso 5: Firmas ───────────────────────────────────────────────────────

function Step5Signatures({ data, setField }: {
  data: ReturnType<typeof useFinalizeActaWizard>["data"];
  setField: ReturnType<typeof useFinalizeActaWizard>["setField"];
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Firmas
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
          <div className="mb-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-200">
            Departamento Logístico
          </div>
          <SignatureCanvas
            onSave={(v) => setField("signatureLogDataUrl", v)}
            existingDataUrl={data.signatureLogDataUrl}
          />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
          <div className="mb-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-200">
            Conductor
          </div>
          <SignatureCanvas
            onSave={(v) => setField("signatureRespDataUrl", v)}
            existingDataUrl={data.signatureRespDataUrl}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Paso 6: Vista previa ───────────────────────────────────────────────

function Step6Preview({ pdfPreviewUrl }: { pdfPreviewUrl: string | null }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Vista previa del acta de devolución
      </h3>
      {pdfPreviewUrl ? (
        <iframe
          src={pdfPreviewUrl}
          className="h-full min-h-[480px] w-full rounded-xl border border-gray-200 bg-white dark:border-white/[0.08]"
          title="Vista previa del acta de devolución"
        />
      ) : (
        <div className="flex h-full min-h-[480px] items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-white/[0.08]">
          <Loader2 className="animate-spin text-gray-400" size={20} />
        </div>
      )}
    </div>
  );
}

// ─── Helpers UI ───────────────────────────────────────────────────────────

function Field({ label, value, onChange, type = "text", placeholder, required }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date" | "time" | "number";
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}{required ? " *" : ""}
      </span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs outline-none focus:border-rose-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
      />
    </label>
  );
}
