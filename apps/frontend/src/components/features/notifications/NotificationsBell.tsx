// components/features/notifications/NotificationsBell.tsx
//
// Campanita en el header con:
//  - Badge de no-leídas
//  - Popover al hacer click con las últimas 10
//  - Drawer completo al hacer click en "Ver todas"
//  - WebSocket en tiempo real (escucha { type: 'notification' })

import { useEffect, useState } from "react";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from "../../../hooks/useNotifications";
import { useAuth } from "../../../context/AuthContext";
import { toast } from "sonner";

interface Props {
  /** Empresa actual (para construir el WS) */
  companyId: number | null;
  /** Si es admin, ve scope=all (todas las de la empresa) */
  isAdmin?: boolean;
}

const KIND_LABEL: Record<string, { label: string; emoji: string }> = {
  maintenance_due:          { label: 'Mantenimiento vencido',  emoji: '⏰' },
  maintenance_scheduled:   { label: 'Mantenimiento reagendado', emoji: '🔁' },
  maintenance_completed:   { label: 'Mantenimiento completado', emoji: '✅' },
  maintenance_overshoot_km:{ label: 'Mantenimiento por km',   emoji: '🛣️' },
  workshop_assigned:       { label: 'Asignado a taller',      emoji: '🔧' },
  supplier_invoice:        { label: 'Compra a proveedor',     emoji: '🧾' },
  system:                  { label: 'Sistema',                emoji: '⚙️' },
};

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

export function NotificationsBell({ companyId, isAdmin = false }: Props) {
  const [open, setOpen] = useState(false);
  const { data: unread } = useUnreadCount();
  const { data: list, refetch } = useNotifications({ unreadOnly: false, scopeAll: isAdmin, limit: 10 });
  const markRead  = useMarkRead();
  const markAll   = useMarkAllRead();

  // ── WebSocket: escuchar notificaciones en vivo ────────────────────────────
  useEffect(() => {
    if (!companyId) return;
    // Construimos el WS igual que el resto de la app
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.hostname}:5000/ws?companyId=${companyId}`;
    let ws: WebSocket | null = null;
    let alive = true;
    try {
      ws = new WebSocket(url);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type === 'notification') {
            // Sonido opcional
            try { new Audio('/notification.mp3').play().catch(() => {}); } catch {}
            // Refetch
            refetch();
            // Toast
            const label = KIND_LABEL[msg.data?.kind]?.label ?? 'Notificación';
            toast(`${label}: ${msg.data?.title ?? ''}`, {
              description: msg.data?.body,
              duration: 5000,
            });
          }
        } catch {}
      };
    } catch {
      // ignore
    }
    return () => {
      alive = false;
      try { ws?.close(); } catch {}
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
                <button
                  key={n.id}
                  onClick={() => { if (!n.readAt) markRead.mutate(n.id); }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-white/[0.04] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition flex gap-3 ${!n.readAt ? 'bg-blue-50/40 dark:bg-blue-500/5' : ''}`}
                >
                  <div className="text-xl leading-none mt-0.5">
                    {KIND_LABEL[n.kind]?.emoji ?? '🔔'}
                  </div>
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
                  {!n.readAt && <div className="h-2 w-2 rounded-full bg-blue-500 mt-2" />}
                </button>
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
