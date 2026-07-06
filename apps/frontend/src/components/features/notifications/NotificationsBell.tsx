// components/features/notifications/NotificationsBell.tsx
//
// Campanita en el header con:
//  - Badge de no-leídas
//  - Popover al hacer click con las últimas 10
//  - Drawer completo al hacer click en "Ver todas"
//  - WebSocket en tiempo real (escucha { type: 'notification' })

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, Clock, Trash2, X } from "lucide-react";
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead, useDeleteNotification } from "../../../hooks/useNotifications";
import { useAuth } from "../../../context/AuthContext";
import { toast } from "sonner";

interface Props {
  /** Empresa actual (para construir el WS) */
  companyId: number | null;
  /** Si es admin, ve scope=all (todas las de la empresa) */
  isAdmin?: boolean;
}

// Meta por kind: ícono (lucide-react) + color de acento + label legible.
// `color` es un nombre de paleta de Tailwind (rose / amber / emerald / blue / gray).
const KIND_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  // Mantenimientos
  maintenance_due:             { icon: Clock, color: 'rose',    label: 'Mantenimiento atrasado' },
  maintenance_scheduled:       { icon: Bell,  color: 'amber',   label: 'Mantenimiento reagendado' },
  maintenance_completed:       { icon: Check, color: 'emerald', label: 'Mantenimiento completado' },
  maintenance_overshoot_km:    { icon: Bell,  color: 'amber',   label: 'Mantenimiento por km' },
  maintenance_created:         { icon: Bell,  color: 'blue',    label: 'Mantenimiento creado' },
  maintenance_assigned:        { icon: Bell,  color: 'blue',    label: 'Mantenimiento asignado' },
  maintenance_taken:           { icon: Check, color: 'emerald', label: 'Mantenimiento tomado' },
  maintenance_free_pool:       { icon: Bell,  color: 'amber',   label: 'Mantenimiento disponible' },
  maintenance_status_changed:  { icon: Bell,  color: 'blue',    label: 'Cambio de estado' },
  // Checklists
  checklist_created:            { icon: Check, color: 'emerald', label: 'Checklist registrado' },
  checklist_overdue:           { icon: Clock, color: 'rose',    label: 'Checklist vencido' },
  checklist_reauth_requested:  { icon: Bell,  color: 'amber',   label: 'Reautorización solicitada' },
  checklist_reauth_decided:    { icon: Check, color: 'emerald', label: 'Reautorización resuelta' },
  // Accesos
  user_created:                { icon: Bell,  color: 'blue',    label: 'Nuevo usuario' },
  user_updated:                { icon: Bell,  color: 'gray',    label: 'Usuario actualizado' },
  user_deleted:                { icon: Bell,  color: 'rose',    label: 'Usuario eliminado' },
  user_inactive:               { icon: Bell,  color: 'amber',   label: 'Usuario inactivado' },
  role_created:                { icon: Bell,  color: 'blue',    label: 'Rol creado' },
  role_updated:                { icon: Bell,  color: 'gray',    label: 'Rol actualizado' },
  role_deleted:                { icon: Bell,  color: 'rose',    label: 'Rol eliminado' },
  // Gestión genérico
  entity_created:              { icon: Bell,  color: 'blue',    label: 'Registro creado' },
  entity_updated:              { icon: Bell,  color: 'gray',    label: 'Registro actualizado' },
  entity_deleted:              { icon: Bell,  color: 'rose',    label: 'Registro eliminado' },
  // Alertas operativas
  alert_created:               { icon: Bell,  color: 'amber',   label: 'Nueva alerta' },
  alert_updated:               { icon: Bell,  color: 'gray',    label: 'Alerta actualizada' },
  alert_closed:                { icon: Check, color: 'emerald', label: 'Alerta cerrada' },
  // Anomalías IA
  anomaly_detected:            { icon: Bell,  color: 'rose',    label: 'Anomalía detectada' },
  // Sistema
  workshop_assigned:           { icon: Bell,  color: 'blue',    label: 'Asignado a taller' },
  supplier_invoice:            { icon: Bell,  color: 'amber',   label: 'Compra a proveedor' },
  system:                      { icon: Bell,  color: 'gray',    label: 'Sistema' },
};

const COLOR_CLASSES: Record<string, { fg: string; bg: string }> = {
  rose:    { fg: 'text-rose-500',                       bg: 'bg-rose-50 dark:bg-rose-500/10' },
  amber:   { fg: 'text-amber-500',                      bg: 'bg-amber-50 dark:bg-amber-500/10' },
  emerald: { fg: 'text-emerald-500',                    bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  blue:    { fg: 'text-blue-500',                       bg: 'bg-blue-50 dark:bg-blue-500/10' },
  gray:    { fg: 'text-gray-500 dark:text-gray-400',    bg: 'bg-gray-100 dark:bg-white/[0.06]' },
};

function kindAccent(kind?: string) {
  const meta = kind ? KIND_META[kind] : undefined;
  const color = meta?.color ?? 'gray';
  return COLOR_CLASSES[color] ?? COLOR_CLASSES.gray;
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  const days = Math.floor(h / 24);
  return `hace ${days}d`;
}

// Deep-linking: dado un kind y payload, devuelve la ruta interna a navegar.
// Si no hay match, devuelve null → no se navega (sólo marca leído).
function routeForKind(kind: string, payload: Record<string, unknown> | undefined): string | null {
  const maintenanceId = (payload?.maintenanceId ?? payload?.id) as string | number | undefined;
  const checklistId = (payload?.checklistId ?? payload?.id) as string | number | undefined;
  const userId = payload?.userId as string | number | undefined;
  const roleId = payload?.roleId as string | number | undefined;
  const alertId = payload?.alertId as string | number | undefined;
  const reauthId = payload?.reauthRequestId as string | number | undefined;
  const entityId = payload?.entityId as string | number | undefined;

  switch (kind) {
    case 'maintenance_due':
    case 'maintenance_scheduled':
    case 'maintenance_completed':
    case 'maintenance_overshoot_km':
    case 'maintenance_created':
    case 'maintenance_assigned':
    case 'maintenance_taken':
    case 'maintenance_free_pool':
    case 'maintenance_status_changed':
      return maintenanceId ? `/mantenimiento/${maintenanceId}` : '/mantenimiento';
    case 'checklist_created':
    case 'checklist_overdue':
      return checklistId ? `/checklist/${checklistId}` : '/checklist';
    case 'checklist_reauth_requested':
    case 'checklist_reauth_decided':
      return '/checklist/reauth';
    case 'user_created':
    case 'user_updated':
    case 'user_deleted':
    case 'user_inactive':
      return '/accesos/usuarios' + (userId ? `?id=${userId}` : '');
    case 'role_created':
    case 'role_updated':
    case 'role_deleted':
      return '/accesos/roles' + (roleId ? `?id=${roleId}` : '');
    case 'entity_created':
    case 'entity_updated':
    case 'entity_deleted':
      // Resuelve por entityKey (Taller, Sede, Vehículo, etc.)
      const ek = (payload?.entityKey as string | undefined)?.toLowerCase() ?? '';
      if (ek.includes('taller')) return '/gestion/talleres' + (entityId ? `?id=${entityId}` : '');
      if (ek.includes('proveedor')) return '/gestion/proveedores' + (entityId ? `?id=${entityId}` : '');
      if (ek.includes('sede')) return '/flotas/sedes' + (entityId ? `?id=${entityId}` : '');
      if (ek.includes('garaje')) return '/flotas/garajes' + (entityId ? `?id=${entityId}` : '');
      if (ek.includes('conductor')) return '/gestion/conductores' + (entityId ? `?id=${entityId}` : '');
      if (ek.includes('activo') || ek.includes('veh')) return '/flotas/vehiculos' + (entityId ? `?id=${entityId}` : '');
      if (ek.includes('combustible')) return '/combustible' + (entityId ? `?id=${entityId}` : '');
      if (ek.includes('peaje')) return '/peajes' + (entityId ? `?id=${entityId}` : '');
      if (ek.includes('póliza') || ek.includes('seguro')) return '/gestion/seguros' + (entityId ? `?id=${entityId}` : '');
      return null;
    case 'alert_created':
    case 'alert_updated':
    case 'alert_closed':
      return '/alertas' + (alertId ? `?id=${alertId}` : '');
    case 'anomaly_detected':
      return '/estadisticas/anomalias';
    default:
      return null;
  }
}

export function NotificationsBell({ companyId, isAdmin = false }: Props) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: unread } = useUnreadCount();
  const { data: list, refetch } = useNotifications({ unreadOnly: false, scopeAll: isAdmin, limit: 10 });
  const markRead  = useMarkRead();
  const markAll   = useMarkAllRead();
  const delNotif  = useDeleteNotification();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  // ── WebSocket: escuchar notificaciones en vivo ────────────────────────────
  // Importante: el browser NO envía cookies automáticamente en conexiones
  // WebSocket, por eso mandamos el JWT como query ?token=<jwt>. El backend
  // lo lee, valida y deja al cliente suscrito a su companyId/userId.
  useEffect(() => {
    if (!companyId) return;

    // Obtenemos el token desde una fuente cualquiera: por query param
    // que pasemos al cargar la app, o desde localStorage (lo guardaremos
    // en login). Por compatibilidad con sesiones viejas, también aceptamos
    // el token del AuthContext si existe.
    const token =
      sessionStorage.getItem('wsToken')
      || new URLSearchParams(window.location.search).get('wstoken')
      || '';

    function connect() {
      try {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const url = `${proto}://${window.location.hostname}:5000/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
        // eslint-disable-next-line no-console
        console.log('[WS] connecting to', url.replace(/token=[^&]+/, 'token=***'));
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => {
          // eslint-disable-next-line no-console
          console.log('[WS] connected');
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg?.type === 'notification') {
              // Sonido opcional
              try { new Audio('/notification.mp3').play().catch(() => {}); } catch {}
              // Refetch de la lista y del contador.
              refetch();
              qc?.invalidateQueries?.({ queryKey: ['notifications-unread'] });
              // Toast
              const label = KIND_META[msg.data?.kind]?.label ?? 'Notificación';
              toast(`${label}: ${msg.data?.title ?? ''}`, {
                description: msg.data?.body,
                duration: 5000,
              });
            }
          } catch {}
        };
        ws.onclose = (ev) => {
          // eslint-disable-next-line no-console
          console.warn('[WS] closed', { code: ev.code, reason: ev.reason });
          wsRef.current = null;
          // Reconexión con backoff (1s, 2s, 5s, max 10s).
          const delay = Math.min(1000 * Math.pow(2, Math.min(3, Math.floor(Math.random() * 3))), 10_000);
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        };
        ws.onerror = (ev) => {
          // eslint-disable-next-line no-console
          console.warn('[WS] error', ev);
        };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[WS] connect failed', err);
      }
    }
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [companyId, refetch]);

  const unreadCount = unread?.count ?? 0;
  const items = list?.data ?? [];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-9 w-9 place-items-center rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06] transition"
        aria-label="Notificaciones"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Popover */}
          <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#1a1f2e] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/[0.06]">
              <div className="font-semibold text-sm">Notificaciones</div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAll.mutate()}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <CheckCheck size={12} /> Marcar todas
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 text-gray-500 hover:text-gray-700">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  Sin notificaciones por ahora.
                </div>
              ) : items.map((n) => (
                <div
                  key={n.id}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-white/[0.04] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition flex gap-3 ${!n.readAt ? 'bg-blue-50/40 dark:bg-blue-500/5' : ''}`}
                >
                  {/* Cuerpo clickeable: marca como leída al click. */}
                  <button
                    type="button"
                    onClick={() => {
                      // jun 2026 — antes esto navegaba a routeForKind(n.kind,
                      // n.payload), pero muchos routes del payload apuntan a
                      // IDs / rutas que ya no existen. Por ahora NO navegamos:
                      // el usuario ve la notificación acá y la cerramos. Para
                      // profundizar en la entidad, el admin navega manualmente
                      // desde el módulo correspondiente.
                      if (!n.readAt) markRead.mutate(n.id);
                    }}
                    className="flex flex-1 min-w-0 gap-3 text-left"
                  >
                    {(() => {
                      const meta = KIND_META[n.kind];
                      if (!meta) {
                        // jun 2026 — sin emoji 🔔 (campana unicode). Usamos el
                        // mismo icono vector que la campanita del header, en
                        // gris neutro para mantener consistencia.
                        return (
                          <div className="h-7 w-7 shrink-0 rounded-full grid place-items-center bg-gray-100 dark:bg-white/[0.06]">
                            <Bell size={14} className="text-gray-500 dark:text-gray-400" />
                          </div>
                        );
                      }
                      const Icon = meta.icon;
                      const accent = kindAccent(n.kind);
                      return (
                        <div className={`h-7 w-7 shrink-0 rounded-full grid place-items-center ${accent.bg}`}>
                          <Icon size={14} className={accent.fg} />
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">
                          {n.body}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400 mt-1">{relTime(n.createdAt)}</div>
                    </div>
                  </button>
                  {/* jun 2026 — botón papelera. Antes NO existía endpoint DELETE
                      y NO había UI; el usuario no podía borrar notificaciones.
                      Ahora: click → DELETE /notifications/:id. Si falla,
                      onError del hook loguea y `qc.invalidateQueries`
                      mantiene el estado de la lista. */}
                  <button
                    type="button"
                    aria-label="Eliminar notificación"
                    title="Eliminar"
                    onClick={(e) => {
                      e.stopPropagation();
                      // jun 2026 — sin confirm(). El usuario pidió borrado
                      // directo (un click). El `isPending` deshabilita el
                      // botón mientras viaja el DELETE, previniendo
                      // doble-click accidental. Si falla, la query queda
                      // invalidada igualmente.
                      delNotif.mutate(n.id);
                    }}
                    disabled={delNotif.isPending}
                    className="shrink-0 self-start mt-1 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                  {!n.readAt && <div className="h-2 w-2 rounded-full bg-blue-500 mt-2" />}
                </div>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-gray-200 dark:border-white/[0.06] text-center">
              <span className="text-xs text-gray-500">
                {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
