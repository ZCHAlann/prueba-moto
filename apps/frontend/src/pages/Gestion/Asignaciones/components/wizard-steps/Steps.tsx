import type { WizardData, NovedadesState, AccesoriosState } from "../../../../../hooks/useHandoverWizard";
import { DatePicker } from "../../../../../components/ui/date-picker/DatePicker";

// ─── Shared field components ──────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, type = "text", noDigits, digitsOnly, maxLength, toUpperCase,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  noDigits?: boolean; digitsOnly?: boolean; maxLength?: number; toUpperCase?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
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
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900
            px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2
            focus:ring-blue-500/40 transition"
        />
      )}
    </div>
  );
}

// ─── Step 0: Confirm ──────────────────────────────────────────────────────────

export function Step0Confirm({
  data,
}: {
  data: WizardData;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
        <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">¿Confirmar asignación?</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Se generará el acta de entrega digital
        </p>
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
        <Field label="Acta N.°"      value={data.actaNumber} onChange={(v) => onChange("actaNumber", v)} maxLength={60} />
        <Field label="Fecha"         value={data.actaDate}   onChange={(v) => onChange("actaDate", v)}   type="date" />
        <Field label="Hora"          value={data.actaTime}   onChange={(v) => onChange("actaTime", v)}   type="time" />
        <Field label="Lugar"         value={data.actaPlace}  onChange={(v) => onChange("actaPlace", v)}  placeholder="Ciudad / instalación" maxLength={200} />
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
        <Field label="Nombre completo" value={data.driverName}  onChange={(v) => onChange("driverName", v)} noDigits maxLength={80} />
      </div>
      <Field label="Cédula / DNI (10 dígitos)"    value={data.driverDni}   onChange={(v) => onChange("driverDni", v)}   placeholder="0000000000" digitsOnly maxLength={10} />
      <Field label="Teléfono (10 dígitos)"        value={data.driverPhone} onChange={(v) => onChange("driverPhone", v)} placeholder="0990000000" digitsOnly maxLength={10} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Cargo"         value={data.driverRole}  onChange={(v) => onChange("driverRole", v)}  placeholder="Ej. Conductor principal" maxLength={120} />
      </div>
    </div>
  );
}

// ─── Step 3: Vehicle data ─────────────────────────────────────────────────────

export function Step3VehicleData({
  data, onChange,
}: {
  data: WizardData;
  onChange: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Placa"           value={data.vehiclePlate}    onChange={(v) => onChange("vehiclePlate", v)} toUpperCase maxLength={8} />
      <Field label="Marca"           value={data.vehicleBrand}    onChange={(v) => onChange("vehicleBrand", v)} maxLength={80} />
      <Field label="Modelo"          value={data.vehicleModel}    onChange={(v) => onChange("vehicleModel", v)} maxLength={80} />
      <Field label="Color"           value={data.vehicleColor}    onChange={(v) => onChange("vehicleColor", v)} maxLength={40} />
      <Field label="Año"             value={data.vehicleYear}     onChange={(v) => onChange("vehicleYear", v)} digitsOnly maxLength={4} />
      <Field label="Km al entregar"  value={data.vehicleOdometer} onChange={(v) => onChange("vehicleOdometer", v)} placeholder="Ej. 45230" digitsOnly maxLength={9} />
      <Field label="Nivel de combustible" value={data.vehicleFuelLevel} onChange={(v) => onChange("vehicleFuelLevel", v)} placeholder="Ej. 3/4" maxLength={10} />
      <Field label="Estado general"  value={data.vehicleCondition} onChange={(v) => onChange("vehicleCondition", v)} placeholder="Ej. Bueno" maxLength={500} />
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
  data, onChange,
}: {
  data: WizardData;
  onChange: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  function toggle(key: keyof NovedadesState, val: boolean) {
    onChange("novedades", { ...data.novedades, [key]: val });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {NOVEDADES_LABELS.map(([key, label]) => (
          <ToggleCard
            key={key}
            label={label}
            value={data.novedades[key]}
            onToggle={(v) => toggle(key, v)}
            trueIsGood={false}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Otros / Descripción
        </label>
        <textarea
          rows={3}
          maxLength={2000}
          value={data.novedadesText}
          onChange={(e) => onChange("novedadesText", e.target.value.slice(0, 2000))}
          placeholder="Describa novedades adicionales..."
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