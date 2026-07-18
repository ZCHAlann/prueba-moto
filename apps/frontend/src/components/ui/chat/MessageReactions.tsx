// components/ui/chat/MessageReactions.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Picker + display de reacciones emoji sobre un mensaje.
//
// Funcionalidad:
//   - Agrupa reacciones por emoji con count y lista de user_ids que reaccionaron.
//   - Si el user actual ya reaccionó con ese emoji, se resalta.
//   - Click en una reacción existente → toggle (agregar/quitar).
//   - Hover en el mensaje → aparece un botón "+" que muestra un picker con
//     los 6 emojis más comunes (👍 ❤️ 😂 😮 😢 🔥).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Plus, Smile } from "lucide-react";

export interface Reaccion {
  usuario_id: number;
  emoji: string;
  creado_en?: string;
}

interface MessageReactionsProps {
  reacciones: Reaccion[];
  myUserId: number;
  onToggle: (emoji: string) => void;
  /** Si la barra debe mostrarse siempre (en failed) o solo al hover (mensajes normales). */
  alwaysVisible?: boolean;
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export function MessageReactions({
  reacciones,
  myUserId,
  onToggle,
  alwaysVisible = false,
}: MessageReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  // Agrupar por emoji.
  const grouped = new Map<string, Reaccion[]>();
  for (const r of reacciones) {
    const arr = grouped.get(r.emoji) ?? [];
    arr.push(r);
    grouped.set(r.emoji, arr);
  }

  const handleQuickReact = (emoji: string) => {
    onToggle(emoji);
    setPickerOpen(false);
  };

  return (
    <div
      className={[
        "flex items-center gap-1 mt-1 -mb-1",
        alwaysVisible ? "" : "opacity-0 group-hover/bubble:opacity-100 transition-opacity",
      ].join(" ")}
    >
      {/* Reacciones existentes */}
      {Array.from(grouped.entries()).map(([emoji, users]) => {
        const iReacted = users.some(u => u.usuario_id === myUserId);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            className={[
              "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-medium transition-colors",
              iReacted
                ? "bg-blue-100 dark:bg-blue-500/20 border border-blue-300 dark:border-blue-400/50"
                : "bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.1]",
            ].join(" ")}
            aria-label={`${users.length} reaccionaron con ${emoji}`}
          >
            <span>{emoji}</span>
            <span className="text-gray-600 dark:text-white/60">{users.length}</span>
          </button>
        );
      })}

      {/* Botón para abrir el picker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen(v => !v)}
          className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors"
          aria-label="Agregar reacción"
        >
          {pickerOpen ? <Smile className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>

        {pickerOpen && (
          <div
            className="absolute bottom-full mb-1 left-0 z-10 flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-white/[0.08] shadow-lg"
            role="menu"
          >
            {QUICK_EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleQuickReact(emoji)}
                className="h-7 w-7 inline-flex items-center justify-center rounded-full text-base hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
