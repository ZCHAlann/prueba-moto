import type { WizardData, NovedadesState, AccesoriosState } from "../../../../../hooks/useHandoverWizard";
import { DatePicker } from "../../../../../components/ui/date-picker/DatePicker";

// ─── Validation helpers ───────────────────────────────────────────────────────

type ValidationError = string | null;

function validateDigits10(label: string, value: string): ValidationError {
  if (!value) return null; // optional field
  return /^\d{10}$/.test(value) ? null : `${label} debe tener 10 dígitos numéricos.`;
}

function validateOdometer(value: string): ValidationError {
  if (!value) return null;
  const n = Number(value);
  return (!isNaN(n) && n >= 0) ? null : "El km debe ser un número positivo.";
}

function validateYear(value: string): ValidationError {
  if (!value) return null;
  const n = Number(value);
  const currentYear = new Date().getFullYear();
  return (!isNaN(n) && n >= 1900 && n <= currentYear + 1) ? null : `El año debe estar entre 1900 y ${currentYear + 1}.`;
}

function validateName(value: string): ValidationError {
  if (!value) return null;
  return /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s'-]+$/.test(value) ? null : "No puede contener números ni caracteres especiales.";
}

// jun 2026 — validación inline de placa. Antes el campo Placa en
// `Step3VehicleData` no tenía `validate`, así que si tipeabas algo como
// "SADA" el `validateStep3` del wizard devolvía error, el botón "Siguiente"
// quedaba disabled (canNext = !stepError), y NO aparecía ningún mensaje —
// la UI se quedaba congelada sin contexto. Ahora el campo muestra el
// error rojo abajo de sí mismo apenas pierde foco el usuario.
const PLATE_PATTERN_INLINE = /^[A-Z]{3}-?\d{3,4}$/;
function validatePlate(value: string): ValidationError {
  if (!value) return "La placa es obligatoria.";
  return PLATE_PATTERN_INLINE.test(value.toUpperCase())
    ? null
    : "Formato de placa inválido. Debe ser como ABC-1234 o ABC1234.";
}

// ─── Shared field components ──────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, type = "text", noDigits, digitsOnly, maxLength, toUpperCase,
  required, validate, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  noDigits?: boolean; digitsOnly?: boolean; maxLength?: number; toUpperCase?: boolean;
  required?: boolean;
  validate?: (v: string) => ValidationError;
  hint?: string;
}) {
  const error = validate ? validate(value) : null;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
        {required && <span className="ml-0.5 text-error-500">*</span>}
        {hint && <span className="ml-1 text-gray-300 normal-case tracking-normal font-normal">({hint})</span>}
      </label>
      {type === "date" ? (
        <DatePicker
          value={value}
          onChange={onChange}
          placeholder={placeholder ?? "Seleccionar fecha"}
        />
      ) : (
        <input
          type={type}
          value={value}
          maxLength={maxLength}
          onKeyDown={(e) => {
            if (noDigits && /\d/.test(e.key)) e.preventDefault();
            if (digitsOnly && !/[0-9]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'].includes(e.key)) e.preventDefault();
          }}
          onChange={(e) => {
            let v = e.target.value;
            if (toUpperCase) v = v.toUpperCase();
            if (maxLength) v = v.slice(0, maxLength);
            onChange(v);
          }}
          placeholder={placeholder}
          className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-white
            bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 transition
            ${error
              ? "border-red-400 dark:border-red-600 focus:ring-red-400/40"
              : "border-gray-200 dark:border-gray-700 focus:ring-blue-500/40"
            }`}
        />
      )}
      {error && (
        <p className="text-[11px] text-red-500 flex items-center gap-1">
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Step 0: Confirm ──────────────────────────────────────────────────────────

export function Step0Confirm({
  data,
  mode = "create",
}: {
  data: WizardData;
  mode?: "create" | "edit" | "finalize";
}) {
  const title =
    mode === "finalize"
      ? `¿Finalizar asignación de ${data.vehiclePlate || "este vehículo"}?`
      : mode === "edit"
      ? "¿Editar acta existente?"
      : "¿Confirmar asignación?";
  const subtitle =
    mode === "finalize"
      ? "Se generará el acta de devolución digital con fotos y firmas."
      : mode === "edit"
      ? "Estás editando los datos del acta."
      : "Se generará el acta de entrega digital";
  const iconBg = mode === "finalize" ? "bg-rose-50 dark:bg-rose-900/30" : "bg-blue-50 dark:bg-blue-900/30";
  const iconColor = mode === "finalize" ? "text-rose-600" : "text-blue-600";

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className={`w-16 h-16 rounded-full ${iconBg} flex items-center justify-center`}>
        <svg className={`w-8 h-8 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
      </div>
      <div className="w-full rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Conductor</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{data.driverName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 17l4 4 4-4m0-5l-4-4-4 4" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Vehículo</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {data.vehiclePlate} — {data.vehicleBrand} {data.vehicleModel}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Acta info ────────────────────────────────────────────────────────

export function Step1ActaInfo({
  data, onChange,
}: {
  data: WizardData;
  onChange: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Acta N.°"  value={data.actaNumber} onChange={(v) => onChange("actaNumber", v)} maxLength={60} />
        <Field label="Fecha"     value={data.actaDate}   onChange={(v) => onChange("actaDate", v)}   type="date" required />
        <Field label="Hora"      value={data.actaTime}   onChange={(v) => onChange("actaTime", v)}   type="time" hint="opcional" />
        <Field label="Lugar"     value={data.actaPlace}  onChange={(v) => onChange("actaPlace", v)}  placeholder="Ciudad / instalación" maxLength={200} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Área / Cuadrilla" value={data.actaArea} onChange={(v) => onChange("actaArea", v)} placeholder="Ej. Cuadrilla Sur" maxLength={200} />
      </div>
    </div>
  );
}

// ─── Step 2: Driver data ──────────────────────────────────────────────────────

export function Step2DriverData({
  data, onChange,
}: {
  data: WizardData;
  onChange: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <Field label="Nombre completo" value={data.driverName}  onChange={(v) => onChange("driverName", v)} noDigits maxLength={80}
          required validate={validateName} />
      </div>
      <Field label="Cédula / DNI"      value={data.driverDni}   onChange={(v) => onChange("driverDni", v)}   placeholder="0000000000" digitsOnly maxLength={10}
        validate={(v) => validateDigits10("La cédula", v)} />
      <Field label="Teléfono"          value={data.driverPhone} onChange={(v) => onChange("driverPhone", v)} placeholder="0990000000" digitsOnly maxLength={10}
        validate={(v) => validateDigits10("El teléfono", v)} />
      <div className="col-span-2">
        <Field label="Cargo" value={data.driverRole} onChange={(v) => onChange("driverRole", v)} placeholder="Ej. Conductor principal" maxLength={120} />
      </div>
    </div>
  );
}

// ─── Step 3: Vehicle data ─────────────────────────────────────────────────────

export function Step3VehicleData({
  data, onChange, mode = "create",
}: {
  data: WizardData;
  onChange: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  mode?: "create" | "finalize";
}) {
  const isFinalize = mode === "finalize";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Placa"             value={data.vehiclePlate}    onChange={(v) => onChange("vehiclePlate", v)} toUpperCase maxLength={8} required validate={validatePlate} />
        <Field label="Marca"             value={data.vehicleBrand}    onChange={(v) => onChange("vehicleBrand", v)} maxLength={80} />
        <Field label="Modelo"            value={data.vehicleModel}    onChange={(v) => onChange("vehicleModel", v)} maxLength={80} />
        <Field label="Color"             value={data.vehicleColor}    onChange={(v) => onChange("vehicleColor", v)} maxLength={40} />
        <Field label="Año"               value={data.vehicleYear}     onChange={(v) => onChange("vehicleYear", v)} digitsOnly maxLength={4}
          validate={validateYear} />
        <Field
          label={isFinalize ? "Km al regresar" : "Km al entregar"}
          value={data.vehicleOdometer}
          onChange={(v) => onChange("vehicleOdometer", v)}
          placeholder="Ej. 45230"
          digitsOnly
          maxLength={9}
          required
          validate={validateOdometer}
        />
        <Field label="Nivel de combustible" value={data.vehicleFuelLevel} onChange={(v) => onChange("vehicleFuelLevel", v)} placeholder="Ej. 3/4" maxLength={10} />
        <Field label="Estado general"      value={data.vehicleCondition} onChange={(v) => onChange("vehicleCondition", v)} placeholder="Ej. Bueno" maxLength={500} />
      </div>
      {isFinalize && data.vehicleOdometerDelivery && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/[0.06] px-3 py-2 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Km al entregar (original): <strong>{Number(data.vehicleOdometerDelivery).toLocaleString("es-EC")} km</strong>
        </div>
      )}
      {isFinalize && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <strong>Datos propios de la devolución.</strong> Solo aplica a la finalización de la asignación.
        </div>
      )}
      {isFinalize && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Foto del odómetro al regreso
            </label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                onChange("returnOdometerPhoto", file);
              }}
              className="block w-full text-xs text-gray-700 dark:text-gray-200
                file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0
                file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100 dark:file:bg-blue-500/10 dark:file:text-blue-300"
            />
            {data.returnOdometerPhotoUrl && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">📷 Foto ya cargada</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Multas / infracciones del período
            </label>
            <textarea
              rows={3}
              maxLength={2000}
              value={data.multasText}
              onChange={(e) => onChange("multasText", e.target.value.slice(0, 2000))}
              placeholder="Detalle multas o comparendos recibidos durante la asignación..."
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900
                px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Toggle card for novedades / accesorios ───────────────────────────────────

function ToggleCard({
  label, value, onToggle, trueIsGood,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  trueIsGood: boolean; // accesorios: SI=green; novedades: SI=red
}) {
  return (
    <div className={`rounded-xl border-2 p-3 transition-all cursor-pointer select-none
      ${value
        ? trueIsGood
          ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
          : "border-red-400 bg-red-50 dark:bg-red-900/20"
        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
      }`}
    >
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 leading-tight">{label}</p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onToggle(true)}
          className={`flex-1 py-1 rounded-md text-xs font-bold transition-colors
            ${value
              ? trueIsGood
                ? "bg-emerald-500 text-white"
                : "bg-red-500 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500"
            }`}
        >
          SI
        </button>
        <button
          type="button"
          onClick={() => onToggle(false)}
          className={`flex-1 py-1 rounded-md text-xs font-bold transition-colors
            ${!value
              ? "bg-gray-600 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500"
            }`}
        >
          NO
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Novedades ────────────────────────────────────────────────────────

const NOVEDADES_LABELS: [keyof NovedadesState, string][] = [
  ["sinNovedades",          "Sin novedades visibles"],
  ["lucesDanadas",          "Luces dañadas"],
  ["faltanAccesorios",      "Faltan accesorios"],
  ["fallaMecanica",         "Falla mecánica"],
  ["llantasMalEstado",      "Llantas en mal estado"],
  ["requiereMantenimiento", "Requiere mantenimiento"],
  ["choqueAccidente",       "Choque / accidente"],
  ["golpes",                "Golpes"],
  ["interiorSucio",         "Interior sucio"],
  ["multas",                "Multas reportadas"],
];

export function Step4Novedades({
  data, onChange, mode = "alta", initialData,
}: {
  data: WizardData;
  onChange: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  mode?: "alta" | "finalizacion";
  initialData?: Partial<WizardData> | null;
}) {
  function toggle(key: keyof NovedadesState, val: boolean) {
    onChange("novedades", { ...data.novedades, [key]: val });
  }

  const isFinalizacion = mode === "finalizacion";

  // Detecta novedades NUEVAS comparando con el alta. Útil para que el supervisor
  // marque solo lo que cambió desde la entrega.
  const novedadesIniciales = initialData?.novedades as Partial<NovedadesState> | null | undefined;
  function esNuevo(key: keyof NovedadesState): boolean {
    if (!isFinalizacion || !novedadesIniciales) return false;
    const inicial = !!novedadesIniciales[key];
    const ahora   = data.novedades[key];
    return !inicial && ahora; // pasó de NO a SI
  }

  return (
    <div className="flex flex-col gap-4">
      {isFinalizacion && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Marca solo los <strong>daños o novedades nuevas</strong> que aparecieron durante la asignación.
          Las marcadas con borde rojo son las que difieren del acta de entrega.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {NOVEDADES_LABELS.map(([key, label]) => (
          <div
            key={key}
            className={esNuevo(key) ? "ring-2 ring-rose-400/60 rounded-xl" : ""}
          >
            <ToggleCard
              label={label}
              value={data.novedades[key]}
              onToggle={(v) => toggle(key, v)}
              trueIsGood={false}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {isFinalizacion ? "Descripción de novedades al regreso" : "Otros / Descripción"}
        </label>
        <textarea
          rows={3}
          maxLength={2000}
          value={data.novedadesText}
          onChange={(e) => onChange("novedadesText", e.target.value.slice(0, 2000))}
          placeholder={isFinalizacion ? "Detalle de daños nuevos, golpes, rayones..." : "Describa novedades adicionales..."}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900
            px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </div>
    </div>
  );
}

// ─── Step 5: Accesorios ───────────────────────────────────────────────────────

const ACCESORIOS_LABELS: [keyof AccesoriosState, string][] = [
  ["matricula",      "Matrícula"],
  ["llaveRepuesto",  "Llave de repuesto"],
  ["triangulos",     "Triángulos"],
  ["herramientas",   "Herramientas básicas"],
  ["seguro",         "Seguro / póliza"],
  ["gata",           "Gata"],
  ["extintor",       "Extintor"],
  ["radio",          "Radio / GPS"],
  ["llavePrincipal", "Llave principal"],
  ["llaveRuedas",    "Llave de ruedas"],
  ["botiquin",       "Botiquín"],
];

export function Step5Accesorios({
  data, onChange,
}: {
  data: WizardData;
  onChange: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  function toggle(key: keyof AccesoriosState, val: boolean) {
    onChange("accesorios", { ...data.accesorios, [key]: val });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {ACCESORIOS_LABELS.map(([key, label]) => (
          <ToggleCard
            key={key}
            label={label}
            value={Boolean(data.accesorios[key])}
            onToggle={(v) => toggle(key, v)}
            trueIsGood={true}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Otros accesorios
        </label>
        <input
          type="text"
          maxLength={200}
          value={data.accesoriosOtros}
          onChange={(e) => onChange("accesoriosOtros", e.target.value.slice(0, 200))}
          placeholder="Ej. Chaleco reflectivo, conos..."
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900
            px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </div>
    </div>
  );
}

// ─── Step 6: Photos ───────────────────────────────────────────────────────────

export function Step6Photos({
  data, onChange,
}: {
  data: WizardData;
  onChange: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  const previews = data.vehiclePhotos.map((f) => URL.createObjectURL(f));

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    onChange("vehiclePhotos", [...data.vehiclePhotos, ...arr]);
  }

  function remove(idx: number) {
    onChange("vehiclePhotos", data.vehiclePhotos.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-4">
      <label
        className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
          border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-8 cursor-pointer
          hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Arrastra fotos o <span className="text-blue-600 font-medium">selecciona archivos</span>
        </p>
        <p className="text-xs text-gray-400">Se adjuntarán como anexos en el PDF</p>
        <input type="file" multiple accept="image/*" className="hidden"
          onChange={(e) => handleFiles(e.target.files)} />
      </label>

      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previews.map((src, i) => (
            <div key={i} className="relative group rounded-lg overflow-hidden aspect-video bg-gray-100">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white
                  opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {previews.length === 0 && (
        <p className="text-center text-sm text-gray-400">Sin fotos aún — puedes continuar sin ellas</p>
      )}
    </div>
  );
}