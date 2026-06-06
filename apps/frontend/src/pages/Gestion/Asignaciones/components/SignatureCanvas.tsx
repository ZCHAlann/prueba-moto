import { useEffect, useRef, useState } from "react";

type Props = {
  onSave: (dataUrl: string) => void;
  existingDataUrl?: string | null;
};

/** Pinta el fondo blanco directamente en el canvas (no via CSS).
 *  Esto tiene dos efectos:
 *  1. El trazo negro es visible en modo oscuro (el canvas siempre es blanco).
 *  2. html2canvas nunca lee colores oklch de Tailwind sobre este canvas,
 *     eliminando el error "unsupported color function oklch".
 */
function fillWhite(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

export function SignatureCanvas({ onSave, existingDataUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const [saved, setSaved]           = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  // Inicializar fondo blanco al montar
  useEffect(() => {
    if (canvasRef.current) {
      fillWhite(canvasRef.current);
    }
  }, []);

  // Cargar firma existente (si la hay) sobre el fondo blanco
  useEffect(() => {
    if (existingDataUrl && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d")!;
      fillWhite(canvasRef.current);
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = existingDataUrl;
      setSaved(true);
      setHasStrokes(true);
    }
  }, [existingDataUrl]);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect   = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width  / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    setSaved(false);
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Trazo siempre negro — visible sobre el fondo blanco en cualquier modo
    ctx.strokeStyle = "#111111";
    ctx.lineWidth   = e.pointerType === "pen" ? Math.max(1, e.pressure * 3) : 2;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineWidth = e.pointerType === "pen" ? Math.max(1, e.pressure * 3) : 2;
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStrokes(true);
  }

  function onPointerUp() {
    drawing.current = false;
  }

  function clear() {
    if (!canvasRef.current) return;
    fillWhite(canvasRef.current); // limpiar vuelve a poner fondo blanco
    setSaved(false);
    setHasStrokes(false);
  }

  function save() {
    if (!hasStrokes) return;
    // toDataURL captura el fondo blanco + trazo negro → PNG limpio para el PDF
    const dataUrl = canvasRef.current!.toDataURL("image/png");
    onSave(dataUrl);
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 
        El borde y el wrapper siguen usando clases Tailwind para el estilo visual,
        pero el fondo del canvas en sí es blanco pintado con fillRect,
        no con bg-white/dark:bg-gray-900 — así html2canvas nunca lee oklch.
      */}
      <div
        className="relative rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden"
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          width={700}
          height={200}
          className="w-full cursor-crosshair block"
          // Sin bg-* de Tailwind aquí — el fondo lo gestiona fillWhite()
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {!hasStrokes && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <p className="text-gray-400 text-sm font-medium">
              Firme aquí — mouse, touch o pizarra digital
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Limpiar
        </button>

        <button
          type="button"
          onClick={save}
          disabled={!hasStrokes}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium
            bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saved ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Guardada
            </>
          ) : "Guardar firma"}
        </button>

        {saved && (
          <span className="ml-auto flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd" />
            </svg>
            Firma capturada
          </span>
        )}
      </div>
    </div>
  );
}