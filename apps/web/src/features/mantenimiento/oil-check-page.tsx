"use client";

import { useRef, useState } from "react";
import { useAssets } from "@/hooks/useAssets";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/form-controls";
import { SurfaceCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";

// ─── Types ────────────────────────────────────────────────────────────────────

type OilCheckResult = {
  id: string;
  nivel: string;
  color: string;
  confianza: string;
  puede_salir: boolean;
  observaciones: string;
  accion_recomendada: string;
  photo_url: string;
};

type CheckStatus = "idle" | "loading" | "success" | "error";

// ─── Helper ───────────────────────────────────────────────────────────────────

// ─── Result card ──────────────────────────────────────────────────────────────

function OilResultCard({ result }: { result: OilCheckResult }) {
  const ok = result.puede_salir;

  return (
    <div
      className={[
        "rounded-2xl border-2 p-5 space-y-4 transition-all",
        ok
          ? "border-green-400 bg-green-50"
          : "border-red-400 bg-red-50",
      ].join(" ")}
    >
      {/* Veredicto principal */}
      <div className="flex items-center gap-3">
        <span
          className={[
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl font-bold",
            ok ? "bg-green-500 text-white" : "bg-red-500 text-white",
          ].join(" ")}
        >
          {ok ? "✓" : "✗"}
        </span>
        <div>
          <p
            className={[
              "text-xl font-extrabold leading-tight",
              ok ? "text-green-800" : "text-red-800",
            ].join(" ")}
          >
            {ok ? "PUEDE SALIR" : "NO PUEDE SALIR"}
          </p>
          <p
            className={[
              "text-sm font-medium",
              ok ? "text-green-700" : "text-red-700",
            ].join(" ")}
          >
            Confianza del análisis: {result.confianza}
          </p>
        </div>
      </div>

      {/* Datos técnicos */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/70 px-4 py-3 border border-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Nivel</p>
          <p className="mt-1 text-lg font-bold text-neutral-900 capitalize">{result.nivel}</p>
        </div>
        <div className="rounded-xl bg-white/70 px-4 py-3 border border-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Color</p>
          <p className="mt-1 text-lg font-bold text-neutral-900 capitalize">{result.color}</p>
        </div>
      </div>

      {/* Observaciones */}
      <div className="rounded-xl bg-white/70 px-4 py-3 border border-white space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Observaciones</p>
        <p className="text-sm font-medium text-neutral-800 leading-relaxed">{result.observaciones}</p>
      </div>

      {/* Acción recomendada */}
      <div
        className={[
          "rounded-xl px-4 py-3 border space-y-1",
          ok
            ? "bg-green-100 border-green-300"
            : "bg-red-100 border-red-300",
        ].join(" ")}
      >
        <p
          className={[
            "text-xs font-semibold uppercase tracking-wide",
            ok ? "text-green-700" : "text-red-700",
          ].join(" ")}
        >
          Acción recomendada
        </p>
        <p
          className={[
            "text-sm font-semibold leading-relaxed",
            ok ? "text-green-900" : "text-red-900",
          ].join(" ")}
        >
          {result.accion_recomendada}
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OilCheckPage() {
  const { assets } = useAssets();
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : "";
  const technicianId = session?.id ? String(session.id) : "";
  const currentUser = { name: session?.name ?? "Técnico" };
  const currentTenant = { name: session?.companyName ?? "" };

  const [selectedAssetId, setSelectedAssetId] = useState<string>(assets[0]?.id ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckStatus>("idle");
  const [result, setResult] = useState<OilCheckResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    // Limpiar resultado anterior al seleccionar nueva foto
    setResult(null);
    setStatus("idle");
    setErrorMsg("");
  }

  async function handleSubmit() {
    if (!selectedAssetId) {
      setErrorMsg("Selecciona un vehículo.");
      return;
    }
    if (!photo) {
      setErrorMsg("Adjunta una foto del nivel de aceite.");
      return;
    }

    setStatus("loading");
    setResult(null);
    setErrorMsg("");

    try {
      const formData = new FormData();
      formData.append("photo", photo);

      const params = new URLSearchParams({
        vehicleId: selectedAssetId,
        technicianId,
        companyId,
      });

      const response = await fetch(
        `/api/oil-check?${params.toString()}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          (payload as { message?: string }).message ?? `Error ${response.status}`
        );
      }

      const data = (await response.json()) as OilCheckResult;
      setResult(data);
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error al analizar la foto.");
      setStatus("error");
    }
  }

  const assetOptions = assets.map((asset) => ({
    value: asset.id,
    label: `${asset.plate} / ${asset.brand} ${asset.model}`,
  }));

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Mantenimiento"
        title="Verificación de aceite"
        subtitle="Toma una foto del nivel de aceite para que la IA analice si el vehículo puede salir a operación."
        accent="amber"
      />

      {/* Contenedor centrado para uso en móvil y desktop */}
      <div className="mx-auto w-full max-w-[480px] space-y-4">

        {/* Selector de vehículo */}
        <SurfaceCard className="px-4 py-4">
          <SelectField
            label="Vehículo"
            value={selectedAssetId}
            onChange={(value) => {
              setSelectedAssetId(value);
              setResult(null);
              setStatus("idle");
            }}
            accent="amber"
            options={assetOptions.length > 0 ? assetOptions : [{ value: "", label: "Sin vehículos registrados" }]}
          />
          {/* Contexto de sesión — útil para el técnico en campo */}
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 border border-neutral-100">
            <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
            <p className="text-xs text-neutral-500">
              Técnico:{" "}
              <span className="font-semibold text-neutral-700">{currentUser.name}</span>
              {" · "}
              <span className="font-medium">{currentTenant.name}</span>
            </p>
          </div>
        </SurfaceCard>

        {/* Foto */}
        <SurfaceCard className="px-4 py-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-neutral-800">Foto del nivel de aceite</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              Apunta la cámara a la varilla o visor de nivel con buena iluminación.
            </p>
          </div>

          {/* Input oculto — en móvil abre cámara trasera directamente */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          {preview ? (
            <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Vista previa del aceite"
                className="w-full object-cover"
                style={{ maxHeight: "260px" }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="absolute bottom-3 right-3 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:scale-95"
              >
                Cambiar foto
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 py-10 transition hover:border-amber-400 hover:bg-amber-50 active:scale-[0.98]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-neutral-400"
              >
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              <span className="text-sm font-semibold text-neutral-600">
                Tomar foto del aceite
              </span>
              <span className="text-xs text-neutral-400">
                Se abrirá la cámara trasera
              </span>
            </button>
          )}
        </SurfaceCard>

        {/* Error */}
        {(status === "error" || errorMsg) && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">
              {errorMsg || "Error al procesar la imagen."}
            </p>
          </div>
        )}

        {/* Botón de envío */}
        <Button
          tone="amber"
          variant="solid"
          onClick={handleSubmit}
          disabled={status === "loading" || !photo || !selectedAssetId}
          className="w-full py-4 text-base font-bold"
        >
          {status === "loading" ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Analizando imagen…
            </span>
          ) : (
            "Analizar aceite"
          )}
        </Button>

        {/* Resultado */}
        {status === "success" && result && (
          <OilResultCard result={result} />
        )}

        {/* Espacio inferior para que en móvil no quede pegado al borde */}
        <div className="h-6" />
      </div>
    </div>
  );
} 