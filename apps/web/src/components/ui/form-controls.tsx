import type { AppAccent } from "@/lib/navigation";

/* ─── Base input classes ─────────────────────────────────────────────────── */
const baseInput =
  "h-11 w-full rounded-lg border bg-white px-3.5 text-sm text-gray-800 outline-none transition" +
  " placeholder:text-gray-400" +
  " dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500";

const normalBorder =
  "border-gray-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" +
  " dark:border-gray-700 dark:focus:border-brand-400 dark:focus:ring-brand-500/10";

const errorBorder =
  "border-error-300 focus:border-error-500 focus:ring-4 focus:ring-error-500/10" +
  " dark:border-error-600 dark:focus:border-error-500";

/* ─── Shared types ────────────────────────────────────────────────────────── */
type SharedFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  accent?: AppAccent;
  error?: string;
  hint?: string;
  placeholder?: string;
  className?: string;
};

/* ─── InputField ──────────────────────────────────────────────────────────── */
type InputFieldProps = SharedFieldProps & {
  type?: "text" | "date" | "number" | "email" | "search" | "password" | "tel";
  min?: string;
  max?: string;
  step?: string;
};

export function InputField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  className = "",
  type = "text",
  min,
  max,
  step,
}: InputFieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${baseInput} ${error ? errorBorder : normalBorder}`}
      />
      {error ? (
        <p className="text-xs font-medium text-error-600 dark:text-error-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

/* ─── SelectField ─────────────────────────────────────────────────────────── */
type SelectFieldProps = SharedFieldProps & {
  options: ReadonlyArray<{ value: string; label: string }>;
};

export function SelectField({
  label,
  value,
  onChange,
  options,
  error,
  hint,
  className = "",
}: SelectFieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${baseInput} ${error ? errorBorder : normalBorder} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236B7280'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E")] bg-[right_0.75rem_center] bg-no-repeat pr-9`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error ? (
        <p className="text-xs font-medium text-error-600 dark:text-error-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

/* ─── TextareaField ───────────────────────────────────────────────────────── */
type TextareaFieldProps = SharedFieldProps & {
  rows?: number;
};

export function TextareaField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  className = "",
  rows = 4,
}: TextareaFieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={[
          "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-gray-800 outline-none transition",
          "placeholder:text-gray-400",
          "dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500",
          error ? errorBorder : normalBorder,
          className,
        ].join(" ")}
      />
      {error ? (
        <p className="text-xs font-medium text-error-600 dark:text-error-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

/* ─── FileField ───────────────────────────────────────────────────────────── */
type FileFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  accent?: AppAccent;
  error?: string;
  hint?: string;
  accept?: string;
  className?: string;
  buttonLabel?: string;
};

export function FileField({
  label,
  value,
  onChange,
  onClear,
  error,
  hint,
  accept,
  className = "",
  buttonLabel = "Seleccionar archivo",
}: FileFieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <div
        className={[
          "rounded-lg border bg-white px-3.5 py-2.5 text-sm",
          "dark:bg-gray-900",
          error
            ? `${errorBorder} border`
            : "border-gray-300 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10 dark:border-gray-700",
        ].join(" ")}
      >
        <input
          type="file"
          accept={accept}
          onChange={(e) => onChange(e.target.files?.[0]?.name ?? "")}
          aria-label={buttonLabel}
          className="w-full text-sm text-gray-600 dark:text-gray-300
            file:mr-3 file:rounded-lg file:border-0
            file:bg-gray-100 file:px-3 file:py-1.5
            file:text-xs file:font-semibold file:text-gray-700
            hover:file:bg-gray-200
            dark:file:bg-gray-700 dark:file:text-gray-200 dark:hover:file:bg-gray-600"
        />
        {value && (
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="truncate">{value}</span>
            <button
              type="button"
              onClick={() => (onClear ? onClear() : onChange(""))}
              aria-label="Eliminar archivo"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600 transition hover:bg-error-100 hover:text-error-600 dark:bg-gray-700 dark:text-gray-300"
            >
              <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {error ? (
        <p className="text-xs font-medium text-error-600 dark:text-error-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}