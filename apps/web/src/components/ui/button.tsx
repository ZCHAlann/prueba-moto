"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { AppAccent } from "@/lib/navigation";

type ButtonTone = AppAccent | "neutral" | "danger" | "brand";
type ButtonVariant = "solid" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: ButtonTone;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
};

/* ─── Solid ──────────────────────────────────────────────────────────────── */
const solidToneStyles: Record<ButtonTone, string> = {
  brand:   "bg-brand-500 text-white hover:bg-brand-600 focus-visible:ring-brand-300 shadow-theme-xs",
  neutral: "bg-gray-800 text-white hover:bg-gray-700 focus-visible:ring-gray-300 shadow-theme-xs dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200",
  danger:  "bg-error-500 text-white hover:bg-error-600 focus-visible:ring-error-300 shadow-theme-xs",
  amber:   "bg-warning-500 text-white hover:bg-warning-600 focus-visible:ring-warning-300 shadow-theme-xs",
  cyan:    "bg-cyan-500 text-white hover:bg-cyan-600 focus-visible:ring-cyan-200 shadow-theme-xs",
  emerald: "bg-success-500 text-white hover:bg-success-600 focus-visible:ring-success-300 shadow-theme-xs",
  lime:    "bg-lime-500 text-white hover:bg-lime-600 focus-visible:ring-lime-200 shadow-theme-xs",
  orange:  "bg-orange-500 text-white hover:bg-orange-600 focus-visible:ring-orange-200 shadow-theme-xs",
  rose:    "bg-error-500 text-white hover:bg-error-600 focus-visible:ring-error-300 shadow-theme-xs",
  sky:     "bg-brand-400 text-white hover:bg-brand-500 focus-visible:ring-brand-200 shadow-theme-xs",
  teal:    "bg-teal-500 text-white hover:bg-teal-600 focus-visible:ring-teal-200 shadow-theme-xs",
};

/* ─── Outline ─────────────────────────────────────────────────────────────── */
const outlineToneStyles: Record<ButtonTone, string> = {
  brand:   "border-brand-300 text-brand-700 hover:bg-brand-50 focus-visible:ring-brand-200 dark:border-brand-600 dark:text-brand-400 dark:hover:bg-brand-900/20",
  neutral: "border-gray-300 text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-200 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700",
  danger:  "border-error-300 text-error-700 hover:bg-error-50 focus-visible:ring-error-200 dark:border-error-600 dark:text-error-400 dark:hover:bg-error-900/20",
  amber:   "border-warning-300 text-warning-700 hover:bg-warning-50 focus-visible:ring-warning-200 dark:border-warning-600 dark:text-warning-400",
  cyan:    "border-cyan-200 text-cyan-700 hover:bg-cyan-50 focus-visible:ring-cyan-200 dark:border-cyan-600 dark:text-cyan-300",
  emerald: "border-success-300 text-success-700 hover:bg-success-50 focus-visible:ring-success-200 dark:border-success-600 dark:text-success-400",
  lime:    "border-lime-200 text-lime-700 hover:bg-lime-50 focus-visible:ring-lime-200 dark:border-lime-600 dark:text-lime-300",
  orange:  "border-orange-200 text-orange-700 hover:bg-orange-50 focus-visible:ring-orange-200 dark:border-orange-600 dark:text-orange-300",
  rose:    "border-error-200 text-error-700 hover:bg-error-50 focus-visible:ring-error-200 dark:border-error-600 dark:text-error-400",
  sky:     "border-brand-200 text-brand-700 hover:bg-brand-50 focus-visible:ring-brand-200 dark:border-brand-600 dark:text-brand-300",
  teal:    "border-teal-200 text-teal-700 hover:bg-teal-50 focus-visible:ring-teal-200 dark:border-teal-600 dark:text-teal-300",
};

/* ─── Ghost ───────────────────────────────────────────────────────────────── */
const ghostToneStyles: Record<ButtonTone, string> = {
  brand:   "text-brand-600 hover:bg-brand-50 focus-visible:ring-brand-200 dark:text-brand-400 dark:hover:bg-brand-900/20",
  neutral: "text-gray-600 hover:bg-gray-100 focus-visible:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700",
  danger:  "text-error-600 hover:bg-error-50 focus-visible:ring-error-200 dark:text-error-400 dark:hover:bg-error-900/20",
  amber:   "text-warning-600 hover:bg-warning-50 focus-visible:ring-warning-200 dark:text-warning-400",
  cyan:    "text-cyan-600 hover:bg-cyan-50 focus-visible:ring-cyan-200 dark:text-cyan-300",
  emerald: "text-success-600 hover:bg-success-50 focus-visible:ring-success-200 dark:text-success-400",
  lime:    "text-lime-600 hover:bg-lime-50 focus-visible:ring-lime-200 dark:text-lime-300",
  orange:  "text-orange-600 hover:bg-orange-50 focus-visible:ring-orange-200 dark:text-orange-300",
  rose:    "text-error-600 hover:bg-error-50 focus-visible:ring-error-200 dark:text-error-400",
  sky:     "text-brand-500 hover:bg-brand-50 focus-visible:ring-brand-200 dark:text-brand-300",
  teal:    "text-teal-600 hover:bg-teal-50 focus-visible:ring-teal-200 dark:text-teal-300",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2.5 text-sm gap-2",
  lg: "px-5 py-3 text-base gap-2",
};

export function Button({
  children,
  tone = "neutral",
  variant = "solid",
  size = "md",
  loading = false,
  disabled,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const variantStyles =
    variant === "solid"
      ? solidToneStyles[tone]
      : variant === "outline"
        ? outlineToneStyles[tone]
        : ghostToneStyles[tone];

  const borderStyle =
    variant === "ghost"
      ? "border-transparent"
      : variant === "outline"
        ? "border"
        : "border border-transparent";

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={[
        "ui-button",
        `ui-button-${variant}`,
        `ui-button-${tone}`,
        "inline-flex items-center justify-center rounded-lg font-semibold",
        "transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-60",
        borderStyle,
        variantStyles,
        sizeStyles[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      <span>{children}</span>
    </button>
  );
}