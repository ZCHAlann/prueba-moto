// components/ui/chat/MessageStatus.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Indicador de estado de un mensaje enviado por el user actual.
// Versión "texto" (no íconos): "Enviando..." / "Enviado" / "Entregado" / "Leído".
// Estados:
//   - "sending"   → "Enviando..." (gris, con dot pulsante)
//   - "sent"      → "Enviado" (gris)
//   - "delivered" → "Entregado" (gris)
//   - "read"      → "Leído" (azul)
//   - "failed"    → "No enviado · Reintentar" (rojo, clickeable)
//
// Estilo: pequeño texto al lado del timestamp. En una línea: "14:23 · Enviado".
// ─────────────────────────────────────────────────────────────────────────────

import { Check, Loader2 } from "lucide-react";

export type MessageEstado = "sending" | "sent" | "delivered" | "read" | "failed";

interface MessageStatusProps {
  estado: MessageEstado;
  /** Si estado === 'failed', handler para reintentar. */
  onRetry?: () => void;
  /** Color de fondo del bubble (para que el texto tenga el contraste correcto). */
  variant?: "mine" | "theirs";
  /** Si true, muestra el dot coloreado al lado del texto. */
  showDot?: boolean;
}

export function MessageStatus({
  estado,
  onRetry,
  variant = "mine",
  showDot = true,
}: MessageStatusProps) {
  // mine = fondo azul. theirs = fondo gris.
  // Texto blanco/80 en mine, gris en theirs.
  const baseColor = variant === "mine" ? "text-white/80" : "text-gray-500 dark:text-white/45";
  const readColor = "text-blue-100 dark:text-blue-300 font-medium";
  const failedColor = "text-red-200 dark:text-red-300 font-medium";

  // Texto del estado
  const label: string = (() => {
    switch (estado) {
      case "sending":   return "Enviando…";
      case "sent":      return "Enviado";
      case "delivered": return "Entregado";
      case "read":      return "Leído";
      case "failed":    return "No enviado";
      default:          return "";
    }
  })();

  // Color del dot
  const dotColor = (() => {
    switch (estado) {
      case "sending":   return "bg-white/60 dark:bg-white/40";
      case "sent":      return "bg-white/60 dark:bg-white/40";
      case "delivered": return "bg-white/60 dark:bg-white/40";
      case "read":      return "bg-blue-200 dark:bg-blue-300";
      case "failed":    return "bg-red-300 dark:bg-red-400";
      default:          return "bg-transparent";
    }
  })();

  // En failed: es clickeable.
  if (estado === "failed") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={[
          "inline-flex items-center gap-1 transition-colors hover:underline",
          failedColor,
        ].join(" ")}
        title="Click para reintentar el envío"
        aria-label="Reintentar envío"
      >
        {showDot && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />}
        <span>{label} · reintentar</span>
      </button>
    );
  }

  // En sending: spinner animado al lado del texto.
  if (estado === "sending") {
    return (
      <span className={`inline-flex items-center gap-1 ${baseColor}`} aria-label="Enviando">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        <span>{label}</span>
      </span>
    );
  }

  // Para sent/delivered/read: dot + texto.
  const textColor = estado === "read" ? readColor : baseColor;
  return (
    <span
      className={`inline-flex items-center gap-1 ${textColor}`}
      title={
        estado === "sent"      ? "Enviado al servidor" :
        estado === "delivered" ? "Entregado al destinatario" :
        estado === "read"      ? "Leído por el destinatario" : ""
      }
      aria-label={label}
    >
      {showDot && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />}
      <span>{label}</span>
    </span>
  );
}
