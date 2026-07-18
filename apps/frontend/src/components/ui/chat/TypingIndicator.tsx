// components/ui/chat/TypingIndicator.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Indicador "X está escribiendo..." al fondo del thread.
// Muestra hasta 3 avatares (los que están tipeando) + texto + 3 puntitos
// animados tipo chat clásico.
// ─────────────────────────────────────────────────────────────────────────────

import { MessageAvatar } from "./MessageAvatar";

interface TypingIndicatorProps {
  /** user_ids + nombres de los users que están tipeando AHORA. */
  typing: Array<{ user_id: number; name: string }>;
}

export function TypingIndicator({ typing }: TypingIndicatorProps) {
  if (typing.length === 0) return null;

  // Texto según cantidad.
  let label: string;
  if (typing.length === 1) {
    label = `${typing[0]!.name} está escribiendo`;
  } else if (typing.length === 2) {
    label = `${typing[0]!.name} y ${typing[1]!.name} están escribiendo`;
  } else {
    label = `${typing.length} personas están escribiendo`;
  }

  return (
    <div className="flex items-end gap-1.5 px-4 py-1.5">
      {/* Avatares (max 3) */}
      <div className="flex -space-x-1.5">
        {typing.slice(0, 3).map(t => (
          <MessageAvatar key={t.user_id} name={t.name} size="sm" />
        ))}
      </div>

      {/* Bubble con los 3 puntos */}
      <div className="bg-gray-100 dark:bg-white/[0.06] rounded-2xl rounded-bl-md px-3 py-2 inline-flex items-center gap-1">
        <Dot delay="0s" />
        <Dot delay="0.15s" />
        <Dot delay="0.3s" />
      </div>

      <span className="text-[10px] text-gray-400 dark:text-white/40 ml-1.5 mb-1 truncate">
        {label}…
      </span>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="block h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-white/50"
      style={{
        animation: "chatTypingBounce 1.2s infinite ease-in-out",
        animationDelay: delay,
      }}
    />
  );
}
