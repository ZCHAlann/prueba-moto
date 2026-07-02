// hooks/useGeolocation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Wrapper de navigator.geolocation con:
//   - Timeout duro (default 8s) — no cuelga al usuario si el GPS tarda.
//   - Manejo de permiso denegado / GPS no disponible — degrada con gracia.
//   - Sin retries infinitos: una sola medición, status expuesto al caller.
//
// Diseñado para que el flujo de negocio (ej. "Solicitar salida") NUNCA
// se bloquee por falta de GPS. El caller decide si abortar o seguir
// sin geo según status === 'denied' | 'error' | 'timeout'.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useRef } from 'react';

export type GeolocationStatus =
  | 'idle'        // todavía no se pidió
  | 'loading'     // pidiendo al navegador
  | 'granted'     // éxito
  | 'denied'      // usuario negó permiso
  | 'unavailable' // navigator.geolocation no existe (HTTP sin HTTPS, browser viejo)
  | 'timeout'     // pasó el timeout
  | 'error';      // otro error (GPS apagado, etc.)

export interface GeolocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;  // metros
  timestamp: number; // ms desde epoch
}

export interface UseGeolocationOptions {
  /** Default 8000ms */
  timeoutMs?: number;
  /** Si true, dispara la medición automáticamente al montar. Default true. */
  autoRequest?: boolean;
  /** Máximo tiempo de vida del resultado en cache (ms). Default 5min. */
  maxAgeMs?: number;
}

export interface UseGeolocation {
  status: GeolocationStatus;
  position: GeolocationResult | null;
  error: string | null;
  /** Pide al usuario permiso y obtiene la posición. */
  request: () => void;
  /** Limpia el estado. Útil al cerrar el wizard. */
  reset: () => void;
}

export function useGeolocation(opts: UseGeolocationOptions = {}): UseGeolocation {
  const { timeoutMs = 8_000, autoRequest = true, maxAgeMs = 5 * 60 * 1_000 } = opts;

  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [position, setPosition] = useState<GeolocationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref para evitar doble-request en StrictMode (React 18+ dev)
  const requestedRef = useRef(false);
  const mountedRef = useRef(true);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      setError('Tu navegador no soporta geolocalización.');
      return;
    }
    setStatus('loading');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mountedRef.current) return;
        // Filtrar resultados muy viejos si el navegador los devuelve del cache
        const ageMs = Date.now() - pos.timestamp;
        if (ageMs > maxAgeMs) {
          setStatus('error');
          setError('La ubicación obtenida es demasiado antigua.');
          return;
        }
        setPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
        setStatus('granted');
      },
      (err) => {
        if (!mountedRef.current) return;
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Permiso de ubicación denegado.');
        } else if (err.code === err.TIMEOUT) {
          setStatus('timeout');
          setError('La solicitud de ubicación tardó demasiado.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus('unavailable');
          setError('No se pudo determinar la ubicación (GPS sin señal).');
        } else {
          setStatus('error');
          setError(err.message || 'Error desconocido al obtener ubicación.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0, // siempre medición fresca; el filtro de edad está del lado nuestro
      },
    );
  }, [timeoutMs, maxAgeMs]);

  useEffect(() => {
    mountedRef.current = true;
    if (autoRequest && !requestedRef.current) {
      requestedRef.current = true;
      request();
    }
    return () => { mountedRef.current = false; };
  }, [autoRequest, request]);

  const reset = useCallback(() => {
    setStatus('idle');
    setPosition(null);
    setError(null);
    requestedRef.current = false;
  }, []);

  return { status, position, error, request, reset };
}
