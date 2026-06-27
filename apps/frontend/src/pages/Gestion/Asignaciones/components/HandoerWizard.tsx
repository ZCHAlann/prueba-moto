import { useEffect, useState } from "react";
import { useHandoverWizard } from "../../../../hooks/useHandoverWizard";
import { SignatureCanvas }   from "./SignatureCanvas";
import { generateActaPdf }   from "./ActaPdf";
import {
  Step0Confirm,
  Step1ActaInfo,
  Step2DriverData,
  Step3VehicleData,
  Step4Novedades,
  Step5Accesorios,
  Step6Photos,
} from "./wizard-steps/Steps";
import type { ApiAssignment, HandoverPayload } from "../../../../hooks/useAssignments";
import type { ExistingHandoverData, WizardData } from "../../../../hooks/useHandoverWizard";

type Props = {
  open: boolean;
  driverId: string;
  assetId: string;
  driver: {
    firstName: string;
    lastName: string;
    phone?: string | null;
  };
  asset: {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    year?: string | null;
  };
  assignmentCount: number;
  onClose: () => void;
  onComplete: (assignment: ApiAssignment) => void;
  createAssignment: (payload: { assetId: string; driverId: string; startDate: string }) => Promise<ApiAssignment>;
  updateHandover: (id: string, payload: HandoverPayload) => Promise<ApiAssignment>;
  /** Modo edición: salta el step 0 (Confirmación). */
  editMode?: boolean;
  /** Modo finalización: salta el step 0 + el step 2 (Conductor, heredado).
   *  Llama a `finalizeAssignment` en vez de `updateHandover`. */
  finalizeMode?: boolean;
  existingAssignmentId?: string;
  existingData?: ExistingHandoverData | null;
  finalizeAssignment?: (id: string, endDate: string, handoverData?: Partial<HandoverPayload>) => Promise<ApiAssignment>;
};

// Steps según modo. En finalizeMode saltamos el step 2 (Conductor)
// porque los datos del conductor ya están en la asignación original.
const STEPS_CREATE = [
  "Confirmación",
  "Datos del acta",
  "Conductor",
  "Vehículo",
  "Novedades",
  "Accesorios",
  "Fotos",
  "Firma Logística",
  "Firma Responsable",
  "Vista previa",
];
const STEPS_FINALIZE = [
  "Confirmación",
  "Datos del acta",
  "Vehículo",
  "Novedades",
  "Accesorios",
  "Fotos",
  "Firma Logística",
  "Firma Responsable",
  "Vista previa",
];

const FIRST_STEP_CREATE = 0;
const FIRST_STEP_EDIT   = 1;

// ─── Patrones de validación (espejo del backend) ──────────────────────────────

const DIGITS_10    = /^\d{10}$/;
const PLATE_PATTERN = /^[A-Z]{3}-?\d{3,4}$/;
const NAME_PATTERN  = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s'-]+$/;
const TIME_PATTERN  = /^\d{2}:\d{2}(:\d{2})?$/;
const DATE_PATTERN  = /^\d{4}-\d{2}-\d{2}$/;

// ─── Validación por step ──────────────────────────────────────────────────────
// Cada función devuelve el primer error encontrado o null si todo está bien.

function validateStep1(data: WizardData): string | null {
  if (!data.actaDate || !DATE_PATTERN.test(data.actaDate))
    return "La fecha del acta es requerida (YYYY-MM-DD).";
  if (data.actaTime && !TIME_PATTERN.test(data.actaTime))
    return "La hora tiene formato inválido (HH:MM).";
  return null;
}

function validateStep2(data: WizardData): string | null {
  if (data.driverName && !NAME_PATTERN.test(data.driverName))
    return "El nombre del conductor no puede contener números ni caracteres especiales.";
  if (data.driverDni && !DIGITS_10.test(data.driverDni))
    return "La cédula debe tener exactamente 10 dígitos numéricos.";
  if (data.driverPhone && !DIGITS_10.test(data.driverPhone))
    return "El teléfono debe tener exactamente 10 dígitos numéricos.";
  return null;
}

function validateStep3(data: WizardData): string | null {
  if (data.vehiclePlate && !PLATE_PATTERN.test(data.vehiclePlate.toUpperCase()))
    return "Formato de placa inválido. Debe ser como ABC-1234 o ABC1234.";
  if (data.vehicleYear) {
    const y = Number(data.vehicleYear);
    if (!Number.isFinite(y) || y < 1900 || y > new Date().getFullYear() + 1)
      return `El año del vehículo debe estar entre 1900 y ${new Date().getFullYear() + 1}.`;
  }
  if (data.vehicleOdometer) {
    const km = Number(data.vehicleOdometer);
    if (!Number.isFinite(km) || km < 0)
      return "El odómetro debe ser un número positivo.";
  }
  return null;
}

// Validación global antes del PUT (todos los steps juntos)
function validateAll(data: WizardData): string | null {
  return validateStep1(data) ?? validateStep2(data) ?? validateStep3(data);
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function HandoverWizard({
  open,
  driverId,
  assetId,
  driver,
  asset,
  assignmentCount,
  onClose,
  onComplete,
  createAssignment,
  updateHandover,
  editMode = false,
  finalizeMode = false,
  existingAssignmentId,
  existingData,
  finalizeAssignment,
}: Props) {

  // En finalizeMode: arranca en step 1 (Acta info, ya hay datos), saltando
  // también el step del conductor. El array de steps es distinto.
  const STEPS = finalizeMode ? STEPS_FINALIZE : STEPS_CREATE;
  const firstStep = (editMode || finalizeMode) ? FIRST_STEP_EDIT : FIRST_STEP_CREATE;

  const [step, setStep]                       = useState(firstStep);
  const [saving, setSaving]                   = useState(false);
  const [pdfBlob, setPdfBlob]                 = useState<Blob | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl]     = useState<string | null>(null);
  const [done, setDone]                       = useState(false);
  const [finalAssignment, setFinalAssignment] = useState<ApiAssignment | null>(null);

  const {
    data, setField, uploading, error, setError,
    uploadPhotos, uploadSignature, uploadPdf, uploadOdometerPhoto, reset,
  } = useHandoverWizard(driver, asset, assignmentCount, existingData, finalizeMode);

  // Validación reactiva del step actual — declarada DESPUÉS de useHandoverWizard
  // para que siempre tenga acceso al `data` más reciente.
  const stepError = (() => {
    switch (step) {
      case 1: return validateStep1(data);
      case 2: return validateStep2(data);
      case 3: return validateStep3(data);
      default: return null;
    }
  })();

  useEffect(() => {
    if (open) {
      reset(existingData, finalizeMode);
      setStep(firstStep);
      setPdfBlob(null);
      setPdfPreviewUrl(null);
      setDone(false);
      setFinalAssignment(null);
    }
  }, [open]); // eslint-disable-line

  if (!open) return null;

  // ── Validación por step al avanzar ─────────────────────────────────────────
  function getStepError(): string | null {
    switch (step) {
      case 1: return validateStep1(data);
      case 2: return validateStep2(data);
      case 3: return validateStep3(data);
      default: return null;
    }
  }

  async function next() {
    setError(null);

    // Validar el step actual antes de avanzar
    const stepError = getStepError();
    if (stepError) {
      setError(stepError);
      return;
    }

    try {
      if (step === 6 && data.vehiclePhotos.length > 0 && !data.vehiclePhotoUrls.length) {
        await uploadPhotos();
      }
      if (step === 7 && data.signatureLogDataUrl && !data.signatureLogUrl) {
        await uploadSignature("log", data.signatureLogDataUrl);
      }
      if (step === 8 && data.signatureRespDataUrl && !data.signatureRespUrl) {
        await uploadSignature("resp", data.signatureRespDataUrl);
      }
      if (step === 8) {
        const blob = await generateActaPdf(data, data.vehiclePhotos, {
          mode: finalizeMode ? "finalizacion" : "alta",
          initialData: finalizeMode ? existingData ?? null : null,
        });
        setPdfBlob(blob);
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
      }
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar");
    }
  }

  function prev() {
    setError(null);
    setStep((s) => Math.max(s - 1, firstStep));
  }

  async function confirm() {
    if (!pdfBlob) return;

    // ── Validación global antes del PUT ───────────────────────────────────
    const validationError = validateAll(data);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    let assignmentId: string | null = null;

    try {
      if (finalizeMode && existingAssignmentId) {
        assignmentId = existingAssignmentId;
      } else if (editMode && existingAssignmentId) {
        assignmentId = existingAssignmentId;
      } else {
        const today = new Date().toISOString().split("T")[0];
        const assignment = await createAssignment({ assetId, driverId, startDate: today });
        assignmentId = assignment.id;
      }

      const pdfUrl = await uploadPdf(pdfBlob);

      // Subir foto del odómetro al regreso si hay una nueva.
      // Si el usuario ya tenía una URL persistida y no cambió el file, se
      // respeta la URL existente.
      const odometerUrl = data.returnOdometerPhoto
        ? await uploadOdometerPhoto(data.returnOdometerPhoto)
        : data.returnOdometerPhotoUrl ?? null;

      // Limpiar campos vacíos que podrían fallar validaciones estrictas del backend.
      // Los validators del backend aceptan "" → null gracias a .or(z.literal('').transform(() => null))
      // pero nos aseguramos de mandar null explícito en vez de "" para campos opcionales.
      const clean = (v: string | null | undefined) =>
        v === "" || v === undefined ? null : v;

      const handoverPayload: HandoverPayload = {
        actaNumber:       clean(data.actaNumber),
        actaDate:         clean(data.actaDate),
        actaTime:         clean(data.actaTime),
        actaPlace:        clean(data.actaPlace),
        actaArea:         clean(data.actaArea),
        driverDni:        clean(data.driverDni),
        driverPhone:      clean(data.driverPhone),
        driverRole:       clean(data.driverRole),
        vehicleOdometer:  clean(data.vehicleOdometer),
        vehicleFuelLevel: clean(data.vehicleFuelLevel),
        vehicleCondition: clean(data.vehicleCondition),
        novedades:        data.novedades as Record<string, unknown>,
        accesorios:       data.accesorios as Record<string, unknown>,
        novedadesText:    clean(data.novedadesText),
        signatureLogUrl:  clean(data.signatureLogUrl),
        signatureRespUrl: clean(data.signatureRespUrl),
        vehiclePhotoUrls: data.vehiclePhotoUrls,
        handoverUrl:      pdfUrl,
        // Campos específicos del acta de DEVOLUCIÓN (solo finalize).
        // Se envían también al backend en el alta por compat, pero el backend
        // los persiste solo en finalize porque las columnas asociadas son
        // propias del estado de devolución.
        returnOdometerPhotoUrl: odometerUrl,
        multasText:            clean(data.multasText),
      };

      let updated: ApiAssignment;
      if (finalizeMode && existingAssignmentId && finalizeAssignment) {
        const today = new Date().toISOString().split("T")[0];
        // El backend persiste el acta y marca status=Finalizada en una sola
        // llamada. El acta de devolución reemplaza la inicial.
        updated = await finalizeAssignment(existingAssignmentId, today, handoverPayload);
      } else {
        updated = await updateHandover(assignmentId, handoverPayload);
      }

      setFinalAssignment(updated);
      setDone(true);
    } catch (e) {
      // Si la asignación ya se creó pero falló el handover, marcamos done igual
      // para no dejar al usuario en un estado inconsistente.
      if (assignmentId) {
        setDone(true);
        setFinalAssignment({ id: assignmentId } as ApiAssignment);
      } else {
        setError(e instanceof Error ? e.message : "Error al guardar");
      }
    } finally {
      setSaving(false);
    }
  }

  function downloadPdf() {
    if (!pdfBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(pdfBlob);
    a.download = `${data.actaNumber}.pdf`;
    a.click();
  }

  // ── Helpers locales para steps que se reutilizan en múltiples modos ──────────

  function SignatureStep({
    variant, data, onChange,
  }: {
    variant: "log" | "resp";
    data: WizardData;
    onChange: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  }) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {variant === "log"
            ? <>Firma del <strong>Departamento Logístico</strong></>
            : <>Firma del <strong>Responsable</strong> (conductor)</>}
        </p>
        <SignatureCanvas
          existingDataUrl={variant === "log" ? data.signatureLogDataUrl : data.signatureRespDataUrl}
          onSave={(url) => onChange(variant === "log" ? "signatureLogDataUrl" : "signatureRespDataUrl", url as never)}
        />
      </div>
    );
  }

  function PreviewStep({
    pdfPreviewUrl, mode,
  }: {
    pdfPreviewUrl: string | null;
    mode: "edit" | "finalize";
  }) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {mode === "finalize"
            ? "Revisa el acta de devolución antes de confirmar. Puedes regresar para editar cualquier dato."
            : "Revisa el acta antes de confirmar. Puedes regresar para editar cualquier dato."}
        </p>
        {pdfPreviewUrl ? (
          <iframe
            src={pdfPreviewUrl}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
            style={{ height: 360 }}
            title="Preview acta"
          />
        ) : (
          <div className="flex items-center justify-center h-40 rounded-lg bg-gray-50 dark:bg-gray-900">
            <p className="text-sm text-gray-400">Generando preview…</p>
          </div>
        )}
      </div>
    );
  }

  function renderStep() {
    if (done && finalAssignment) {
      return (
        <div className="flex flex-col items-center gap-6 py-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {finalizeMode
                ? "¡Asignación finalizada!"
                : editMode
                ? "¡Acta actualizada!"
                : "¡Acta generada!"}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {finalizeMode
                ? "El acta de devolución y la finalización se guardaron correctamente."
                : editMode
                ? "El acta ha sido actualizada correctamente."
                : "La asignación y el acta han sido guardadas correctamente."}
            </p>
          </div>
          <button
            type="button"
            onClick={downloadPdf}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Descargar PDF
          </button>
        </div>
      );
    }

    switch (step) {
      case 0: return <Step0Confirm data={data} mode={finalizeMode ? "finalize" : editMode ? "edit" : "create"} />;
      case 1: return <Step1ActaInfo data={data} onChange={setField} />;
      case 2:
        // En finalizeMode saltamos el step del conductor: vamos directo a vehículo.
        if (finalizeMode) return <Step3VehicleData data={data} onChange={setField} mode="finalize" />;
        return <Step2DriverData data={data} onChange={setField} />;
      case 3:
        if (finalizeMode) return <Step4Novedades data={data} onChange={setField} mode="finalizacion" initialData={existingData ?? null} />;
        return <Step3VehicleData data={data} onChange={setField} />;
      case 4:
        if (finalizeMode) return <Step5Accesorios data={data} onChange={setField} />;
        return <Step4Novedades data={data} onChange={setField} />;
      case 5:
        if (finalizeMode) return <Step6Photos data={data} onChange={setField} />;
        return <Step5Accesorios data={data} onChange={setField} />;
      case 6:
        if (finalizeMode) return <SignatureStep variant="log" data={data} onChange={setField} />;
        return <Step6Photos data={data} onChange={setField} />;
      case 7:
        if (finalizeMode) return <SignatureStep variant="resp" data={data} onChange={setField} />;
        return <SignatureStep variant="log" data={data} onChange={setField} />;
      case 8:
        if (finalizeMode) return <PreviewStep pdfPreviewUrl={pdfPreviewUrl} mode="finalize" />;
        return <SignatureStep variant="resp" data={data} onChange={setField} />;
      case 9:
        return <PreviewStep pdfPreviewUrl={pdfPreviewUrl} mode={finalizeMode ? "finalize" : "edit"} />;
      default: return null;
    }
  }

  const isLast    = step === STEPS.length - 1;
  const isBusy    = uploading || saving;
  const canFinish = isLast && pdfPreviewUrl && !done && !stepError;
  const canNext   = !stepError && !isLast;
  const stepTitle = done ? "¡Listo!" : STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="w-full max-w-xl bg-white dark:bg-gray-950 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {stepTitle}
              </h2>
              {editMode && !done && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                  Editando acta
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (done && finalAssignment) onComplete(finalAssignment);
                else onClose();
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {!done && (
            <div className="flex gap-1">
              {STEPS.map((_, i) => {
                const isComplete = i < firstStep || i <= step;
                const isSkipped  = editMode && i < firstStep;
                return (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                      isSkipped
                        ? "bg-gray-200 dark:bg-gray-800"
                        : isComplete
                        ? "bg-blue-500"
                        : "bg-gray-200 dark:bg-gray-800"
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </div>
          )}
          {renderStep()}
        </div>

        {/* Footer */}
        {!done && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <button
              type="button"
              onClick={prev}
              disabled={step === firstStep || isBusy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400
                border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Atrás
            </button>
            <span className="text-xs text-gray-400">
              {step + 1} / {STEPS.length}
            </span>
            {canFinish ? (
              <button
                type="button"
                onClick={confirm}
                disabled={isBusy}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium
                  bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Guardando…" : editMode ? "Actualizar acta" : "Confirmar y guardar"}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                disabled={isBusy || !canNext}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium
                  bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isBusy ? "Procesando…" : isLast ? "Generar PDF" : "Siguiente"}
                {!isBusy && !isLast && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            )}
          </div>
        )}

        {done && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={() => { if (finalAssignment) onComplete(finalAssignment); }}
              className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}