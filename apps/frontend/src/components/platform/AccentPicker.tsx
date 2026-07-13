// components/platform/AccentPicker.tsx
//
// Selector visual de acentos (paleta de colores del sistema). Cada
// opción es un "key" (ej. "emerald") que se persiste tal cual en la
// DB. La UI (sidebar, cards, badges) traduce ese key a clases Tailwind
// vía `navPalettes` en lib/navigation.ts.
//
// Props:
//   value:    key del acento actual (ej. "emerald") o string vacío.
//   onChange: callback con el nuevo key.
//   label:    opcional, etiqueta del campo.

import { useState } from "react";

// Misma paleta que `navPalettes` en lib/navigation.ts. Si agregás
// un acento nuevo al sistema, agregalo acá también para que aparezca
// en el picker.
export interface AccentOption {
  key: string;
  label: string;
  // Sólido para el dot de preview. Es un color Tailwind 400-500.
  swatch: string;
  // Para el ring/check cuando está seleccionado.
  ring: string;
}

export const ACCENTS: AccentOption[] = [
  { key: "brand",   label: "Brand",   swatch: "bg-brand-500",   ring: "ring-brand-500"   },
  { key: "emerald", label: "Esmeralda", swatch: "bg-emerald-500", ring: "ring-emerald-500" },
  { key: "sky",     label: "Celeste",   swatch: "bg-sky-500",     ring: "ring-sky-500"     },
  { key: "violet",  label: "Violeta",   swatch: "bg-violet-500",  ring: "ring-violet-500"  },
  { key: "rose",    label: "Rosa",      swatch: "bg-rose-500",    ring: "ring-rose-500"    },
  { key: "orange",  label: "Naranja",   swatch: "bg-orange-500",  ring: "ring-orange-500"  },
  { key: "amber",   label: "Ámbar",     swatch: "bg-amber-500",   ring: "ring-amber-500"   },
  { key: "teal",    label: "Teal",      swatch: "bg-teal-500",    ring: "ring-teal-500"    },
  { key: "lime",    label: "Lima",      swatch: "bg-lime-500",    ring: "ring-lime-500"    },
  { key: "cyan",    label: "Cian",      swatch: "bg-cyan-500",    ring: "ring-cyan-500"    },
];

interface AccentPickerProps {
  value: string;
  onChange: (key: string) => void;
  label?: string;
}

export function AccentPicker({ value, onChange, label = "Acento" }: AccentPickerProps) {
  const [advanced, setAdvanced] = useState(false);
  const current = ACCENTS.find((a) => a.key === value);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
        {label}
      </p>

      <div className="grid grid-cols-5 gap-2">
        {ACCENTS.map((opt) => {
          const selected = opt.key === value;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              title={opt.label}
              aria-pressed={selected}
              className={
                selected
                  ? `flex flex-col items-center gap-1 rounded-lg border-2 ${opt.ring} border-transparent bg-white p-2 shadow-sm transition dark:bg-white/[0.05]`
                  : "flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white p-2 transition hover:border-gray-300 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:border-white/15 dark:hover:bg-white/[0.04]"
              }
            >
              <span className={`h-6 w-6 rounded-full ${opt.swatch} ring-2 ring-white dark:ring-white/10`} />
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>

      {current && (
        <p className="mt-2 text-[10px] text-gray-400">
          Seleccionado: <span className="font-mono text-gray-600 dark:text-gray-300">{current.key}</span> · {current.label}
        </p>
      )}

      {/* Modo avanzado: input libre por si en el futuro se agregan
          acentos custom que no están en la lista curada. */}
      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        {advanced ? "Ocultar" : "Mostrar"} modo avanzado
      </button>
      {advanced && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="brand | emerald | sky | violet | rose | orange | amber | teal | lime | cyan"
          className="mt-1.5 h-8 w-full rounded-lg border border-gray-200 bg-white px-2 font-mono text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
        />
      )}
    </div>
  );
}
