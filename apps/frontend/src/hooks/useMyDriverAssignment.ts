"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { ActaCardData } from "../components/features/drivers/DriverActa";

/**
 * Carga el acta de asignación del conductor logueado (la activa, o la última
 * cerrada si no tiene activa). Pensado para ProfilePage: el conductor consulta
 * su propia acta sin tener permisos administrativos sobre `gestion.conductores`.
 *
 * Devuelve:
 *   - `loading` mientras hace fetch
 *   - `notFound` true si el usuario logueado no tiene perfil de conductor
 *   - `acta` con los datos del acta (o `null` si nunca tuvo asignaciones)
 *   - `refresh()` para reintentar (p. ej. cuando el usuario cierra una
 *     asignación y vuelve a abrir el perfil).
 *
 * No lanza errores visibles: un 404 significa "no soy conductor" y eso lo
 * maneja el componente padre ocultando la card (no es un fallo).
 */
export function useMyDriverAssignment() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [acta, setActa]     = useState<ActaCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch(`/api/company/${companyId}/drivers/me/acta`);
      if (res.status === 404) {
        setActa(null);
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setActa((json?.data?.acta as ActaCardData | null) ?? null);
    } catch {
      // Silencioso: si falla, mantenemos acta=null. El card no se muestra.
      setActa(null);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, notFound, acta, refresh };
}
