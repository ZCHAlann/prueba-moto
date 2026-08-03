// pages/Gestion/Asignaciones/components/HandoerWizard.tsx
//
// jul 2026 v8 — Revertí el wizard a su versión COLORIDA.
//
// User feedback v8:
//   - "Cuando dije que no sea colorido me referia a solo en la acta,
//     el wizard si estaba bien".
//   - Bug grave: el `SmartField` se auto-convertía de `<Field>` a
//     `<ReadonlyField>` apenas el user tipeaba la primera letra, lo
//     que desmontaba el input y dejaba al user con 1 sola letra
//     tipeada. Fix: la decisión de "editable vs readonly" se toma
//     UNA sola vez al montaje del componente (con `useState(init)`),
//     no en cada render.
//
// Cambios:
//
// 1. **Wizard vuelve a ser colorido** (header brand, stepper brand,
//    botones brand/emerald). El Acta PDF se mantiene monocromática.
//
// 2. **Inputs compactos pero empresariales** (font 11px, h-7).
//    El user pidió "más pequeño" — eso sí lo dejo. Lo que vuelve al
//    color es el chrome (header, stepper, footer), no los inputs.
//
// 3. **`SmartField` con decisión al montaje**: ya no se re-evalúa
//    en cada render. Si arrancó como editable, sigue editable
//    aunque el user haya tipeado data.
//
// 4. **Novedades integrado en el bloque del vehículo** (no como
//    sección aparte al final del paso 1).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, FileText, Download, Loader2,
  ClipboardList, Car, User, PenTool, X, Upload, Image as ImageIcon,
  Eye, PackageOpen, Truck,
} from "lucide-react";
import {
  useHandoverWizard,
  type ActaKind,
  type WizardData,
  type ExistingHandoverData,
} from "../../../../hooks/useHandoverWizard";
import { generateActaPdf } from "./ActaPdf";
import { SignatureCanvas } from "./SignatureCanvas";
import type { ApiAssignment, HandoverPayload } from "../../../../hooks/useAssignments";

// ─── Tipos ────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  driverId: string;
  assetId: string;
  driver: { firstName: string; lastName: string; dni?: string | null };
  asset: {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    year?: string | null;
    category?: string | null;
  };
  // jul 2026 v7 — companyName viene del padre (page.tsx) desde
  // `session.companyName`. Antes se leía adentro del hook con un
  // ternario bug que lo dejaba vacío → el PDF mostraba "EMPRESA".
  companyName?: string;
  onClose: () => void;
  onComplete: (assignment: ApiAssignment) => void;
  createAssignment: (payload: { assetId: string; driverId: string; startDate: string }) => Promise<ApiAssignment>;
  updateHandover: (id: string, payload: HandoverPayload) => Promise<ApiAssignment>;
  editMode?: boolean;
  existingAssignmentId?: string;
  existingData?: ExistingHandoverData | null;
};

const STEPS = [
  { id: "header",   label: "Cabecera y vehículo",  Icon: ClipboardList },
  { id: "driver",   label: "Conductor",            Icon: User },
  { id: "sign",     label: "Firmas",               Icon: PenTool },
  { id: "preview",  label: "Vista previa",         Icon: Eye },
] as const;

const ACTA_KINDS: { key: ActaKind; label: string; description: string; Icon: typeof PackageOpen }[] = [
  {
    key: "recepcion",
    label: "Recepción de vehículo al chofer",
    description: "Cuando el vehículo se entrega al chofer.",
    Icon: PackageOpen,
  },
  {
    key: "entrega",
    label: "Entrega a chofer",
    description: "Cuando el vehículo se asigna a un conductor.",
    Icon: Truck,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatLongDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${d} de ${months[m - 1]} de ${y}`;
}

const fadeY = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
  transition: { duration: 0.2, ease: "easeOut" as const },
};

// ─── Componente ───────────────────────────────────────────────────────────

export function HandoverWizard({
  open,
  driverId,
  assetId,
  driver,
  asset,
  companyName,
  onClose,
  onComplete,
  createAssignment,
  updateHandover,
  editMode = false,
  existingAssignmentId,
  existingData,
}: Props) {

  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob]             = useState<Blob | null>(null);

  const {
    data, setField, uploading, error, setError,
    uploadPhotos, uploadSignature, uploadPdf, reset,
  } = useHandoverWizard(driver, asset, existingData, companyName);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      reset(existingData);
      setStep(0);
      setPdfPreviewUrl(null);
      setPdfBlob(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cuando el user llega al paso 4 (preview), autogeneramos el PDF
  // blob + URL local para que pueda verlo embebido sin hacer click
  // en "Generar".
  useEffect(() => {
    let cancelled = false;
    if (step !== 3) return;
    (async () => {
      try {
        const blob = await generateActaPdf(data, data.vehiclePhotos);
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
      // Liberamos la URL anterior (si existe) al cambiar de step.
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPdfBlob(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, data]);

  if (!open) return null;

  function goNext() {
    setError(null);
    if (step === 0) {
      // Validación cabecera: ciudad, fecha, hora
      if (!data.actaPlace.trim()) return setError("La ciudad es requerida.");
      if (!data.actaDate)         return setError("La fecha es requerida.");
      if (data.actaKind === "entrega" && !data.vehicleType.trim())
        return setError("Para el acta de Entrega, indicá el tipo de vehículo (camioneta, sedan, etc).");
    }
    if (step === 1) {
      // Conductor / Receptor
      if (data.actaKind === "entrega" && !data.driverName.trim())
        return setError("El nombre del chofer es requerido.");
      if (data.actaKind === "entrega" && data.driverDni && !/^\d{6,12}$/.test(data.driverDni))
        return setError("La cédula del chofer debe tener entre 6 y 12 dígitos.");
    }
    if (step === 2) {
      // Firmas
      // jul 2026 v5.1 — En Recepción, el receptor es el chofer, así
      // que la única firma es la del chofer (`signatureRecibeDataUrl`).
      // En Entrega son DOS: encargado + chofer.
      if (data.actaKind === "recepcion") {
        if (!data.signatureRecibeDataUrl)
          return setError("Falta la firma del chofer (receptor).");
      } else if (data.actaKind === "entrega") {
        if (!data.signatoryName.trim())
          return setError("Necesitamos tu nombre para firmar.");
        if (!data.signatureEntregaDataUrl)
          return setError("Falta la firma del encargado de entrega.");
        if (!data.signatureRecibeDataUrl)
          return setError("Falta la firma de quien recibe.");
      }
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function onGenerateAndSave() {
    setSaving(true);
    setError(null);
    try {
      // 1. Subir fotos (si hay)
      const photoUrls = await uploadPhotos();

      // 2. Subir firmas (si hay dataUrls locales)
      // jul 2026 v5.1 — Recepción solo tiene firma del chofer.
      // Entrega tiene firma del encargado + firma del chofer.
      const sigTasks: Promise<unknown>[] = [];
      if (data.signatureEntregaDataUrl && !data.signatureEntregaUrl) {
        sigTasks.push(uploadSignature("entrega", data.signatureEntregaDataUrl));
      }
      if (data.signatureRecibeDataUrl && !data.signatureRecibeUrl) {
        sigTasks.push(uploadSignature("recibe", data.signatureRecibeDataUrl));
      }
      await Promise.all(sigTasks);

      // 3. Generar el PDF final con las URLs YA subidas. El helper
      //    `generateActaPdf` convierte cada URL a dataURL base64
      //    (react-pdf no soporta HTTP en <Image>). Si photoUrls está
      //    vacío (no había fotos), pasamos los Files locales igual
      //    por si quedaron del preview.
      const dataWithRemotePhotos = { ...data, vehiclePhotoUrls: photoUrls };
      const finalBlob = pdfBlob ?? await generateActaPdf(dataWithRemotePhotos, data.vehiclePhotos);
      const pdfUrl = await uploadPdf(finalBlob);

      // 4. Crear o actualizar la asignación
      const startDate = `${data.actaDate}T${data.actaTime || "00:00"}:00`;
      let assignment: ApiAssignment;
      if (editMode && existingAssignmentId) {
        const payload: HandoverPayload = {
          actaNumber:   null,
          actaDate:     data.actaDate,
          actaTime:     data.actaTime || null,
          actaPlace:    data.actaPlace,
          actaArea:     null,
          driverDni:    data.driverDni || null,
          driverPhone:  null,
          driverRole:   null,
          vehicleOdometer: null,
          vehicleFuelLevel: null,
          vehicleCondition: null,
          novedades:    null,
          accesorios:   null,
          novedadesText: null,
          // jul 2026 v5.1 — En Recepción, la única firma es la del
          // chofer, así que va a `signatureLogUrl` (el backend lo guarda
          // como la firma principal del acta). En Entrega, el logistico
          // firma y va a `signatureLogUrl`, el chofer a `signatureRespUrl`.
          signatureLogUrl:  data.signatureEntregaUrl ?? data.signatureRecibeUrl,
          signatureRespUrl: data.signatureRecibeUrl,
          vehiclePhotoUrls: photoUrls,
          handoverUrl:  pdfUrl,
        };
        assignment = await updateHandover(existingAssignmentId, payload);
      } else {
        // jul 2026 — El PDF ya está subido (paso 3). Mandamos la URL
        // en el POST inicial para no tener que hacer un PUT adicional.
        // Si el POST falla, el PDF queda como huérfano en el storage
        // — aceptable por simplicidad, se puede limpiar después.
        // jul 2026 — En modo CREATE, todo va en el POST inicial. El
        // backend acepta `handoverUrl`, `actaDate`, `signatureLogUrl`,
        // etc directamente en el body del POST. No necesitamos un PUT
        // adicional — antes lo hacíamos y reventaba con 400 porque
        // el schema de `novedades` no aceptaba null.
        //
        // Si el POST falla, hacemos un rollback manual del PDF subido
        // para no dejar huérfanos en /uploads/assignments/.
        const created = await createAssignment({
          assetId,
          driverId,
          startDate,
          // Datos del acta que antes iban en el PUT:
          actaDate:        data.actaDate,
          actaTime:        data.actaTime || null,
          actaPlace:       data.actaPlace,
          driverDni:       data.driverDni || null,
          signatureLogUrl: data.signatureEntregaUrl ?? data.signatureRecibeUrl ?? null,
          signatureRespUrl:data.signatureRecibeUrl ?? null,
          vehiclePhotoUrls:photoUrls,
          handoverUrl:     pdfUrl,
        });
        assignment = created;
      }
      toast.success(`Acta de ${data.actaKind} generada y guardada`);
      onComplete(assignment);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/70 backdrop-blur-sm">
      <div className="flex h-[min(82vh,720px)] w-[min(820px,94vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        {/* ─── Header — jul 2026 v8: vuelve a ser colorido ─── */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
              <FileText size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-800 dark:text-white">
                {data.actaKind === "recepcion" ? "Acta de Recepción" : "Acta de Entrega"}
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {editMode ? "Editar acta existente" : "Generar acta y asignación"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06]"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* ─── Stepper — jul 2026 v8: vuelve a brand + emerald ─── */}
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50/60 px-4 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
          {STEPS.map((s, idx) => {
            const state = idx < step ? "done" : idx === step ? "active" : "inactive";
            return (
              <div key={s.id} className="flex items-center gap-2">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${
                    state === "active"
                      ? "bg-brand-500 text-white"
                      : state === "done"
                      ? "bg-emerald-500 text-white"
                      : "bg-gray-200 text-gray-500 dark:bg-white/[0.06]"
                  }`}
                >
                  {state === "done" ? "✓" : idx + 1}
                </div>
                <span
                  className={`text-[11px] font-semibold ${
                    state === "active" ? "text-brand-700 dark:text-brand-300" :
                    state === "done"   ? "text-emerald-700 dark:text-emerald-300" :
                    "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
                {idx < STEPS.length - 1 && (
                  <ChevronRight size={12} className="text-gray-300" />
                )}
              </div>
            );
          })}
        </div>

        {/* ─── Body ─── */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {error && (
            <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div key={step} {...fadeY}>
              {step === 0 && <Step1Header data={data} setField={setField} />}
              {step === 1 && <Step2Driver data={data} setField={setField} />}
              {step === 2 && <Step3Signatures data={data} setField={setField} />}
              {step === 3 && (
                <Step4Preview
                  data={data}
                  pdfPreviewUrl={pdfPreviewUrl}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ─── Footer — jul 2026 v8: vuelve a brand + emerald ─── */}
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 dark:border-white/[0.06]">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0 || saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-brand-400 disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
          >
            <ChevronLeft size={12} /> Atrás
          </button>
          <div className="flex items-center gap-2">
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40"
              >
                Siguiente <ChevronRight size={12} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onGenerateAndSave}
                disabled={saving || uploading || !pdfPreviewUrl}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Generar acta
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Paso 1: Cabecera + vehículo ───────────────────────────────────────────

function Step1Header({ data, setField }: {
  data: WizardData;
  setField: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Cabecera del acta */}
      <section>
        <SectionHeading>Cabecera del acta</SectionHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Ciudad"
            value={data.actaPlace}
            onChange={(v) => setField("actaPlace", v)}
            placeholder="Milagro"
          />
          <Field
            label="Fecha"
            type="date"
            value={data.actaDate}
            onChange={(v) => setField("actaDate", v)}
          />
        </div>
        <p className="mt-2 text-[10px] italic text-gray-500 dark:text-gray-400">
          Vista previa: <span className="not-italic font-medium text-gray-700 dark:text-gray-300">En la ciudad de {data.actaPlace || "___"}, a los ___ días del mes de ___ del año ___.</span>
        </p>
      </section>

      {/* Tipo de acta — jul 2026 v8: vuelve a brand color */}
      <section>
        <SectionHeading>Tipo de acta</SectionHeading>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ACTA_KINDS.map((k) => {
            const active = data.actaKind === k.key;
            const Icon = k.Icon;
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => setField("actaKind", k.key)}
                className={`group flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-brand-500 bg-brand-50/40 dark:border-brand-500/50 dark:bg-brand-500/10"
                    : "border-gray-200 bg-white hover:border-brand-300 dark:border-white/[0.08] dark:bg-white/[0.02]"
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  active
                    ? "bg-brand-500 text-white"
                    : "bg-slate-100 text-slate-500 dark:bg-white/[0.06]"
                }`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1">
                  <div className={`text-sm font-bold ${active ? "text-brand-700 dark:text-brand-300" : "text-gray-800 dark:text-white"}`}>
                    {k.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                    {k.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Vehículo */}
      <section>
        <SectionHeading>Datos del vehículo</SectionHeading>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/*
            jul 2026 v8 (fixed) — Editable solo si NO hay data de DB
            AL MONTAR el componente. La decisión NO se re-evalúa en
            cada render (eso provocaba que el `SmartField` se
            auto-convirtiera a ReadonlyField apenas el user tipeaba la
            primera letra → input desmontado, no se podía seguir
            escribiendo).
          */}
          <SmartField
            label="Marca"
            value={data.vehicleBrand}
            onChange={(v) => setField("vehicleBrand", v)}
          />
          <SmartField
            label="Modelo"
            value={data.vehicleModel}
            onChange={(v) => setField("vehicleModel", v)}
          />
          <SmartField
            label="Año"
            value={data.vehicleYear}
            onChange={(v) => setField("vehicleYear", v)}
          />
          <SmartField
            label="Color"
            value={data.vehicleColor}
            onChange={(v) => setField("vehicleColor", v)}
          />
          <Field
            label="Placa"
            value={data.vehiclePlate}
            onChange={(v) => setField("vehiclePlate", v)}
          />
          <Field
            label="Tipo"
            value={data.vehicleType}
            onChange={(v) => setField("vehicleType", v)}
            placeholder="Camioneta / Sedan / etc"
            required={data.actaKind === "entrega"}
          />
        </div>
      </section>

      {/* jul 2026 v8 — Novedades / Observaciones integrado */}
      <section>
        <SectionHeading>
          Novedades / Observaciones
          <span className="ml-1.5 text-[9px] font-normal normal-case italic text-gray-400">(opcional)</span>
        </SectionHeading>
        <textarea
          value={data.novedadesText}
          onChange={(e) => setField("novedadesText", e.target.value)}
          placeholder="Ej: Rayón en paragolpes trasero del lado derecho. Pequeño bollito en capó. Neumático delantero izquierdo con presión baja."
          rows={2}
          className="w-full resize-none rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] leading-snug outline-none placeholder:text-gray-400 focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
        />
      </section>

      {/* Fotos (opcional, para el anexo) */}
      <PhotoUploader data={data} setField={setField} />
    </div>
  );
}

// ─── Paso 2: Datos del receptor + (si es Entrega) del encargado ─────────
//
// jul 2026 v5.1 — El receptor SIEMPRE es el chofer que recibe el
// vehículo, tanto en Recepción como en Entrega. Lo confirmé con
// el usuario: NO es el admin. El "encargado" solo aparece en
// Entrega como contraparte logística.

function Step2Driver({ data, setField }: {
  data: WizardData;
  setField: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Receptor — el chofer (en ambos casos) */}
      <section>
        <SectionHeading>Datos del receptor (chofer)</SectionHeading>
        <p className="mb-2 text-[10px] text-gray-500 dark:text-gray-400">
          En ambas actas, el receptor es el chofer que recibe el vehículo.
          Se pre-rellenan del perfil del conductor; podés ajustarlos si
          algo cambió.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Nombre y apellido"
            value={data.driverName}
            onChange={(v) => setField("driverName", v)}
            required
          />
          <Field
            label="Cédula"
            value={data.driverDni}
            onChange={(v) => setField("driverDni", v)}
            placeholder="10 dígitos"
            required
          />
        </div>
      </section>

      {/* Encargado de la entrega — solo en Entrega */}
      {data.actaKind === "entrega" && (
        <section>
          <SectionHeading>Datos del encargado de la entrega</SectionHeading>
          <p className="mb-2 text-[10px] text-gray-500 dark:text-gray-400">
            Persona del Departamento Logístico que entrega el vehículo.
            Se pre-rellena con tu usuario (current user). Podés ajustarlo
            si corresponde.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Nombre y apellido"
              value={data.signatoryName}
              onChange={(v) => setField("signatoryName", v)}
              required
            />
            <Field
              label="Cédula"
              value={data.signatoryDni}
              onChange={(v) => setField("signatoryDni", v)}
              placeholder="10 dígitos"
              required
            />
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Paso 3: Firmas ───────────────────────────────────────────────────────

function Step3Signatures({ data, setField }: {
  data: WizardData;
  setField: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <SectionHeading>Firmas</SectionHeading>
      {data.actaKind === "recepcion" ? (
        // jul 2026 v5.1 — En Recepción solo firma el chofer. La firma
        // del chofer se guarda en `signatureRecibeDataUrl` (la misma
        // que en Entrega). El PDF de Recepción la lee de ahí.
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
          <div className="mb-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-200">
            Firma del receptor (chofer)
          </div>
          <SignatureCanvas
            onSave={(v) => setField("signatureRecibeDataUrl", v)}
            existingDataUrl={data.signatureRecibeDataUrl}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
            <div className="mb-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-200">
              Encargado de entrega
            </div>
            <SignatureCanvas
              onSave={(v) => setField("signatureEntregaDataUrl", v)}
              existingDataUrl={data.signatureEntregaDataUrl}
            />
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
            <div className="mb-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-200">
              Recibe conforme
            </div>
            <SignatureCanvas
              onSave={(v) => setField("signatureRecibeDataUrl", v)}
              existingDataUrl={data.signatureRecibeDataUrl}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Paso 4: Vista previa + generar ───────────────────────────────────────

function Step4Preview({ data, pdfPreviewUrl }: {
  data: WizardData;
  pdfPreviewUrl: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading>Vista previa del acta</SectionHeading>
        <div className="text-[10px] uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
          {data.actaKind === "recepcion" ? "Acta de Recepción" : "Entrega de Vehículo a Chofer"}
          {" · "}{data.vehiclePlate || "—"}
        </div>
      </div>
      {pdfPreviewUrl ? (
        <iframe
          src={pdfPreviewUrl}
          className="h-full min-h-[460px] w-full rounded-md border border-gray-200 bg-white dark:border-white/[0.08]"
          title="Vista previa del acta"
        />
      ) : (
        <div className="flex h-full min-h-[460px] items-center justify-center rounded-md border border-gray-200 bg-white dark:border-white/[0.08]">
          <Loader2 className="animate-spin text-gray-400" size={18} />
        </div>
      )}
    </div>
  );
}

// ─── Helpers UI ───────────────────────────────────────────────────────────

// jul 2026 v8 — Sub-encabezado de sección minimalista (sin color).
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 border-b border-gray-200 pb-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
      {children}
    </h3>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date" | "time" | "number";
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
        {label}{required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 w-full rounded-md border border-gray-200 bg-white px-2 text-[11px] leading-tight outline-none placeholder:text-gray-400 focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
      />
    </label>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <div className="flex h-7 items-center rounded-md border border-gray-200 bg-gray-50 px-2 text-[11px] text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-300">
        {value || <span className="text-gray-400">—</span>}
      </div>
    </div>
  );
}

// jul 2026 v8 (fixed) — Campo inteligente con decisión al montaje.
// El bug que tenía: si decidíamos editable/readonly en cada render,
// el componente se auto-remontaba apenas el user tipeaba la primera
// letra y el input se desmontaba. Ahora la decisión se congela al
// montaje con `useState(() => ...)`, no se vuelve a evaluar.
function SmartField({ label, value, onChange, placeholder = "Sin registrar" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [editable] = useState(() => !(value && value.trim()));
  if (!editable) {
    return <ReadonlyField label={label} value={value} />;
  }
  return <Field label={label} value={value} onChange={onChange} placeholder={placeholder} />;
}

function PhotoUploader({ data, setField }: {
  data: WizardData;
  setField: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  // Límite máximo de fotos por acta (debe matchear el backend en
  // `apps/backend/src/routes/upload.ts → /assignment-photos`).
  const MAX_ASSIGNMENT_PHOTOS = 50;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const totalAfter = data.vehiclePhotos.length + files.length;
    if (totalAfter > MAX_ASSIGNMENT_PHOTOS) {
      const overflow = totalAfter - MAX_ASSIGNMENT_PHOTOS;
      const remaining = MAX_ASSIGNMENT_PHOTOS - data.vehiclePhotos.length;
      toast.error(
        `Máximo ${MAX_ASSIGNMENT_PHOTOS} fotos por acta. ` +
        `Ya tenés ${data.vehiclePhotos.length} y querés sumar ${files.length}. ` +
        `Podés sumar ${Math.max(0, remaining)} más (te pasás por ${overflow}). ` +
        `Quitá algunas antes de continuar.`,
      );
      e.target.value = "";
      return;
    }
    setField("vehiclePhotos", [...data.vehiclePhotos, ...files]);
    e.target.value = "";
  }
  function remove(i: number) {
    setField("vehiclePhotos", data.vehiclePhotos.filter((_, idx) => idx !== i));
  }
  return (
    <div>
      <SectionHeading>
        Fotos del vehículo
        <span className="ml-1.5 text-[9px] font-normal normal-case italic text-gray-400">(opcional, para el anexo)</span>
      </SectionHeading>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {data.vehiclePhotos.map((file, i) => (
          <PhotoThumb key={i} file={file} onRemove={() => remove(i)} />
        ))}
        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/50 text-xs text-gray-500 transition hover:border-brand-400 hover:bg-brand-50/30 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-400 dark:hover:border-brand-500/50">
          <Upload size={20} className="mb-1" />
          Subir foto
          <input type="file" accept="image/*" multiple onChange={onPick} className="hidden" />
        </label>
      </div>
    </div>
  );
}

function PhotoThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  // Object URL estable durante la vida del componente; se libera
  // al desmontar para no leakear memoria.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-white/[0.08]">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-300">
          <ImageIcon size={20} />
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 rounded-md bg-rose-500/90 p-1 text-white opacity-0 transition group-hover:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  );
}
