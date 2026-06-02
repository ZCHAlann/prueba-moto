import type { ReactNode } from "react";

// Clases base reutilizables — expórtelas para casos especiales (ej. input con icono)
export const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-700 " +
  "outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 " +
  "dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 dark:placeholder:text-gray-500";

export const labelCls =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500";

// ── Input ──────────────────────────────────────────────────────────────────────
interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  prefix?: ReactNode;   // icono a la izquierda
  colSpan?: "full";
}

export function InputField({ label, prefix, colSpan, className, ...rest }: InputFieldProps) {
  return (
    <div className={colSpan === "full" ? "sm:col-span-2" : ""}>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {prefix}
          </span>
        )}
        <input
          {...rest}
          className={`${inputCls} ${prefix ? "pl-9" : ""} ${className ?? ""}`}
        />
      </div>
    </div>
  );
}

// ── Select ─────────────────────────────────────────────────────────────────────
interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  colSpan?: "full";
  children: ReactNode;
}

export function SelectField({ label, colSpan, children, className, ...rest }: SelectFieldProps) {
  return (
    <div className={colSpan === "full" ? "sm:col-span-2" : ""}>
      <label className={labelCls}>{label}</label>
      <select {...rest} className={`${inputCls} ${className ?? ""}`}>
        {children}
      </select>
    </div>
  );
}

// ── Textarea ───────────────────────────────────────────────────────────────────
interface TextareaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  colSpan?: "full";
}

export function TextareaField({ label, colSpan, className, ...rest }: TextareaFieldProps) {
  return (
    <div className={colSpan === "full" ? "sm:col-span-2" : ""}>
      <label className={labelCls}>{label}</label>
      <textarea
        {...rest}
        className={`w-full resize-none rounded-xl border border-gray-200 bg-white px-3.5 py-2.5
          text-sm text-gray-700 outline-none transition
          focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10
          dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200
          dark:placeholder:text-gray-500 ${className ?? ""}`}
      />
    </div>
  );
}