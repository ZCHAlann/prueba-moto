import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/api";

/**
 * POST /api/oil-check
 *
 * Proxy hacia el backend NestJS en POST /oil-check.
 * Reenvía el FormData con la foto y los query params
 * vehicleId, technicianId y companyId tal como los recibe.
 *
 * No se añade Content-Type manualmente — fetch lo pone
 * automáticamente con el boundary correcto al recibir un FormData.
 */
export async function POST(request: NextRequest) {
  const vehicleId = request.nextUrl.searchParams.get("vehicleId");
  const technicianId = request.nextUrl.searchParams.get("technicianId");
  const companyId = request.nextUrl.searchParams.get("companyId");

  if (!vehicleId || !technicianId || !companyId) {
    return NextResponse.json(
      { message: "vehicleId, technicianId y companyId son requeridos." },
      { status: 400 }
    );
  }

  // Leer el FormData que viene del cliente (contiene el campo "photo")
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { message: "No se pudo leer el formulario con la foto." },
      { status: 400 }
    );
  }

  const photo = formData.get("photo");
  if (!photo) {
    return NextResponse.json(
      { message: "La foto es requerida." },
      { status: 400 }
    );
  }

  // Construir la URL del backend con los query params
  const params = new URLSearchParams({ vehicleId, technicianId, companyId });
  const backendUrl = `${getBackendBaseUrl()}/oil-check?${params.toString()}`;

  // Reenviar el FormData directamente — no tocar Content-Type
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000); // 30s para análisis con IA

  try {
    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    const payload = await backendResponse.json().catch(() => ({
      message: "Respuesta inválida del servidor.",
    }));

    return NextResponse.json(payload, { status: backendResponse.status });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      {
        message: isTimeout
          ? "El análisis tardó demasiado. Intenta nuevamente."
          : "Error al conectar con el servidor de análisis.",
      },
      { status: 503 }
    );
  } finally {
    clearTimeout(timeout);
  }
}