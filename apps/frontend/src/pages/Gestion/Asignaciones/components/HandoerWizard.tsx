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

// ─── Types ────────────────────────────────────────────────────────────────────

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
};

const STEPS = [
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

// ─── Component ────────────────────────────────────────────────────────────────

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
}: Props) {

  const [step, setStep]                     = useState(0);
  const [saving, setSaving]                 = useState(false);
  const [pdfBlob, setPdfBlob]               = useState<Blob | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl]   = useState<string | null>(null);
  const [done, setDone]                     = useState(false);
  const [finalAssignment, setFinalAssignment] = useState<ApiAssignment | null>(null);

  const {
    data, setField, uploading, error, setError,
    uploadPhotos, uploadSignature, uploadPdf, reset,
  } = useHandoverWizard(driver, asset, assignmentCount);

  // Re-init on open
  useEffect(() => {
    if (open) {
      reset();
      setStep(0);
      setPdfBlob(null);
      setPdfPreviewUrl(null);
      setDone(false);
      setFinalAssignment(null);
    }
  }, [open]); // eslint-disable-line

  if (!open) return null;

  // ── Navigation ──────────────────────────────────────────────────────────────

  async function next() {
    setError(null);
    try {
      // Subir fotos al salir del step 6
      if (step === 6 && data.vehiclePhotos.length > 0 && !data.vehiclePhotoUrls.length) {
        await uploadPhotos();
      }
      // Subir firmas al salir de sus steps
      if (step === 7 && data.signatureLogDataUrl && !data.signatureLogUrl) {
        await uploadSignature("log", data.signatureLogDataUrl);
      }
      if (step === 8 && data.signatureRespDataUrl && !data.signatureRespUrl) {
        await uploadSignature("resp", data.signatureRespDataUrl);
      }
      // Generar PDF al llegar al step 9 (vista previa)
      if (step === 8) {
        const blob = await generateActaPdf(data, data.vehiclePhotos);
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
    setStep((s) => Math.max(s - 1, 0));
  }

  // ── Final save ──────────────────────────────────────────────────────────────

  async function confirm() {
    if (!pdfBlob) return;
    setSaving(true);
    setError(null);
    try {
      const today = new Date().toISOString().split("T")[0];

      // 1. Crear asignación
      const assignment = await createAssignment({
        assetId,
        driverId,
        startDate: today,
      });

      // 2. Subir PDF
      const pdfUrl = await uploadPdf(pdfBlob);

      // 3. Guardar datos del acta
      const updated = await updateHandover(assignment.id, {
        actaNumber:       data.actaNumber,
        actaDate:         data.actaDate,
        actaTime:         data.actaTime,
        actaPlace:        data.actaPlace,
        actaArea:         data.actaArea,
        driverDni:        data.driverDni,
        driverPhone:      data.driverPhone,
        driverRole:       data.driverRole,
        vehicleOdometer:  data.vehicleOdometer,
        vehicleFuelLevel: data.vehicleFuelLevel,
        vehicleCondition: data.vehicleCondition,
        novedades:        data.novedades as Record<string, unknown>,
        accesorios:       data.accesorios as Record<string, unknown>,
        novedadesText:    data.novedadesText,
        signatureLogUrl:  data.signatureLogUrl,
        signatureRespUrl: data.signatureRespUrl,
        vehiclePhotoUrls: data.vehiclePhotoUrls,
        handoverUrl:      pdfUrl,
      });

      setFinalAssignment(updated);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
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

  // ── Step content ────────────────────────────────────────────────────────────

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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">¡Acta generada!</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              La asignación y el acta han sido guardadas correctamente.
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
      case 0: return <Step0Confirm data={data} />;
      case 1: return <Step1ActaInfo data={data} onChange={setField} />;
      case 2: return <Step2DriverData data={data} onChange={setField} />;
      case 3: return <Step3VehicleData data={data} onChange={setField} />;
      case 4: return <Step4Novedades data={data} onChange={setField} />;
      case 5: return <Step5Accesorios data={data} onChange={setField} />;
      case 6: return <Step6Photos data={data} onChange={setField} />;

      case 7:
        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Firma del <strong>Departamento Logístico</strong>
            </p>
            <SignatureCanvas
              existingDataUrl={data.signatureLogDataUrl}
              onSave={(url) => setField("signatureLogDataUrl", url)}
            />
          </div>
        );

      case 8:
        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Firma del <strong>Responsable</strong> (conductor)
            </p>
            <SignatureCanvas
              existingDataUrl={data.signatureRespDataUrl}
              onSave={(url) => setField("signatureRespDataUrl", url)}
            />
          </div>
        );

      case 9:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Revisa el acta antes de confirmar. Puedes regresar para editar cualquier dato.
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

      default: return null;
    }
  }

  const isLast    = step === STEPS.length - 1;
  const isBusy    = uploading || saving;
  const canFinish = isLast && pdfPreviewUrl && !done;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="w-full max-w-xl bg-white dark:bg-gray-950 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {done ? "¡Listo!" : STEPS[step]}
            </h2>
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

          {/* Barra de progreso */}
          {!done && (
            <div className="flex gap-1">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-300
                    ${i <= step ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-800"}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
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
              disabled={step === 0 || isBusy}
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
                {saving ? "Guardando…" : "Confirmar y guardar"}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                disabled={isBusy}
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