// pages/Motores/[id]/cards/VehicleMaintenancesPanel.tsx
// Lista compacta de mantenimientos del vehículo dentro del cockpit de Motores.
// Reutiliza el módulo unificado de /mantenimiento (v3) — sin lógica de módulo viejo.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wrench, Calendar, Loader2, ChevronRight, AlertCircle,
  CheckCircle2, Clock, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import {
  useMaintenancesList,
  useDeleteMaintenance,
  useTakeMaintenance,
  useFinalizeMaintenance,
  useCancelRescheduleMaintenance,
  type Maintenance,
  type MaintenanceStatus,
} from '../../../../hooks/useMaintenancesV2';
import { usePermissions } from '../../../../hooks/usePermissions';
import { MaintenanceFormModal } from '../../../Mantenimientos/components/MaintenanceFormModal';
import { ReprogramDialog } from '../../../Mantenimientos/components/ReprogramDialog';
import { MaintenanceDetailDrawer } from '../../../Mantenimientos/components/MaintenanceDetailDrawer';

interface Props {
  assetId: string;       // ej: "asset-123"
  companyId: string;     // ej: "company-1"
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  'Programado':   'Programado',
  'En proceso':   'En proceso',
  'Completado':   'Completado',
};

const TYPE_LABEL: Record<string, string> = {
  Preventivo:  'Preventivo',
  Correctivo:  'Correctivo',
  Programado:  'Programado',
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusTone(s: MaintenanceStatus, dark: boolean) {
  if (s === 'En proceso') {
    return { fg: dark ? '#fbbf24' : '#b45309', bg: dark ? 'rgba(251,191,36,0.12)' : 'rgba(245,158,11,0.14)', border: dark ? 'rgba(251,191,36,0.3)' : 'rgba(245,158,11,0.35)' };
  }
  if (s === 'Completado') {
    return { fg: dark ? '#4ade80' : '#15803d', bg: dark ? 'rgba(74,222,128,0.12)' : 'rgba(22,163,74,0.14)', border: dark ? 'rgba(74,222,128,0.3)' : 'rgba(22,163,74,0.35)' };
  }
  // Programado
  return { fg: dark ? '#a5b4fc' : '#4338ca', bg: dark ? 'rgba(165,180,252,0.12)' : 'rgba(99,102,241,0.14)', border: dark ? 'rgba(165,180,252,0.3)' : 'rgba(99,102,241,0.35)' };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VehicleMaintenancesPanel({ assetId, companyId }: Props) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const { can } = usePermissions();

  const isFullAccess = role === 'owner_empresa' || role === 'admin_empresa' || role === 'supervisor';
  const canCreate    = can('mantenimiento', 'execution', 'crear') || isFullAccess;
  const meId         = useMemo<number | null>(() => {
    if (!user?.id) return null;
    const m = String(user.id).match(/(\d+)/);
    return m ? Number(m[1]) : null;
  }, [user?.id]);

  // ─── Datos ────────────────────────────────────────────────────────────────
  const { data, isLoading, error, refetch } = useMaintenancesList({ assetId });
  const list: Maintenance[] = (data ?? []) as Maintenance[];

  // Ordenar: Programado / En proceso primero (próximos), luego Completado (recientes)
  const sorted = useMemo(() => {
    const weight: Record<MaintenanceStatus, number> = {
      'En proceso': 0,
      'Programado': 1,
      'Completado': 2,
    };
    return [...list].sort((a, b) => {
      const wa = weight[a.status as MaintenanceStatus] ?? 9;
      const wb = weight[b.status as MaintenanceStatus] ?? 9;
      if (wa !== wb) return wa - wb;
      // dentro del grupo, los más recientes arriba
      return new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime();
    });
  }, [list]);

  const counts = useMemo(() => {
    const c = { Programado: 0, 'En proceso': 0, Completado: 0 } as Record<MaintenanceStatus, number>;
    list.forEach((m) => { if (m.status in c) c[m.status as MaintenanceStatus]++; });
    return c;
  }, [list]);

  // ─── UI state ─────────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen]     = useState(false);
  const [editing, setEditing]           = useState<Maintenance | null>(null);
  const [detailId, setDetailId]         = useState<string | null>(null);
  const [reprogramTarget, setReprogram] = useState<Maintenance | null>(null);

  // ─── Mutations ────────────────────────────────────────────────────────────
  const delMut         = useDeleteMaintenance();
  const takeMut        = useTakeMaintenance();
  const finalizeMut    = useFinalizeMaintenance();
  const rescheduleMut  = useCancelRescheduleMaintenance();

  const onTake = async (m: Maintenance) => {
    try { await takeMut.mutateAsync(m.id); toast.success('Mantenimiento iniciado'); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onFinalize = async (m: Maintenance) => {
    if (!confirm(`¿Marcar "${m.title}" como completado?`)) return;
    try { await finalizeMut.mutateAsync(m.id); toast.success('Mantenimiento completado'); refetch(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onReschedule = async (newScheduledFor: string, reason: string) => {
    if (!reprogramTarget) return;
    try {
      await rescheduleMut.mutateAsync({ id: reprogramTarget.id, newScheduledFor, reason });
      toast.success('Mantenimiento reprogramado', { description: `Nueva fecha: ${fmtDate(newScheduledFor)}` });
      setReprogram(null);
      refetch();
    } catch (e) { toast.error((e as Error).message); }
  };
  const onDelete = async (m: Maintenance) => {
    if (!confirm(`¿Eliminar el mantenimiento "${m.title}"?`)) return;
    try { await delMut.mutateAsync(m.id); toast.success('Mantenimiento eliminado'); refetch(); }
    catch (e) { toast.error((e as Error).message); }
  };

  // ─── Theme colors ─────────────────────────────────────────────────────────
  const c = {
    cardBg:        dark ? 'rgba(255,255,255,0.03)' : '#fff',
    cardBorder:    dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
    title:         dark ? '#f1f5f9' : '#0f172a',
    text:          dark ? '#cbd5e1' : '#334155',
    muted:         dark ? '#94a3b8' : '#64748b',
    label:         dark ? '#64748b' : '#94a3b8',
    divider:       dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
    rowBg:         dark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
    rowBgHover:    dark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
    actionBg:      dark ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
    actionBorder:  dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
    iconColor:     dark ? '#a5b4fc' : '#4f46e5',
    accent:        dark ? '#a5b4fc' : '#4f46e5',
  };

  return (
    <div
      style={{
        background: c.cardBg,
        border: `1px solid ${c.cardBorder}`,
        borderRadius: 14,
        padding: '14px 16px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: c.actionBg, border: `1px solid ${c.actionBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: c.iconColor,
          }}>
            <Wrench size={14} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: c.title, letterSpacing: '0.01em' }}>
              Mantenimientos del vehículo
            </h3>
            <p style={{ margin: 0, fontSize: 11, color: c.muted }}>
              {list.length === 0
                ? 'Sin mantenimientos registrados'
                : `${list.length} en total · ${counts['En proceso']} en proceso · ${counts.Programado} programado${counts.Programado === 1 ? '' : 's'} · ${counts.Completado} completado${counts.Completado === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {canCreate && (
            <button
              onClick={() => { setEditing(null); setCreateOpen(true); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: c.accent, color: '#fff', border: 'none',
                borderRadius: 8, padding: '6px 11px', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
              }}
            >
              <Calendar size={12} /> Programar
            </button>
          )}
          <button
            onClick={() => navigate(`/mantenimiento?assetId=${encodeURIComponent(assetId)}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: c.actionBg, color: c.text,
              border: `1px solid ${c.actionBorder}`,
              borderRadius: 8, padding: '6px 11px', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
            }}
          >
            Ver todos <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0', color: c.muted, fontSize: 12, gap: 8 }}>
          <Loader2 size={14} className="animate-spin" /> Cargando mantenimientos…
        </div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0', color: '#ef4444', fontSize: 12, gap: 8 }}>
          <AlertCircle size={14} /> Error al cargar mantenimientos.
        </div>
      ) : list.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '24px 0', color: c.muted, fontSize: 12, gap: 10,
        }}>
          <Wrench size={22} style={{ opacity: 0.4 }} />
          <p style={{ margin: 0 }}>Este vehículo aún no tiene mantenimientos registrados.</p>
          {canCreate && (
            <button
              onClick={() => { setEditing(null); setCreateOpen(true); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'transparent', color: c.accent, border: `1px dashed ${c.actionBorder}`,
                borderRadius: 8, padding: '7px 13px', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
              }}
            >
              <Calendar size={12} /> Agendar el primero
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sorted.slice(0, 6).map((m) => {
            const tone = statusTone(m.status as MaintenanceStatus, dark);
            const isReagendado = m.isReprogrammed;
            const canTakeRow =
              m.status === 'Programado' &&
              (isFullAccess || m.assignedUserId === meId);
            return (
              <button
                key={m.id}
                onClick={() => setDetailId(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: c.rowBg,
                  border: `1px solid ${c.divider}`,
                  borderLeft: `3px solid ${tone.fg}`,
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: c.text,
                  width: '100%',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = c.rowBgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = c.rowBg)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: c.title, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.title}
                    </p>
                    {isReagendado && (
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        color: dark ? '#fcd34d' : '#92400e',
                        background: dark ? 'rgba(252,211,77,0.12)' : 'rgba(245,158,11,0.14)',
                        border: dark ? '1px solid rgba(252,211,77,0.3)' : '1px solid rgba(245,158,11,0.3)',
                        padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        Re-agendado
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10.5, color: c.muted, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Calendar size={10} /> {fmtDate(m.scheduledFor)}
                    </span>
                    {m.type && (
                      <span style={{ color: c.label, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                        {TYPE_LABEL[m.type] ?? m.type}
                      </span>
                    )}
                    {m.assignedUserName && (
                      <span style={{ color: c.label }}>
                        → {m.assignedUserName}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {canTakeRow && m.status === 'Programado' && !m.assignedUserId && isFullAccess && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onTake(m); refetch(); }}
                      title="Iniciar este mantenimiento"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'transparent', color: tone.fg,
                        border: `1px solid ${tone.border}`,
                        borderRadius: 6, padding: '3px 7px', cursor: 'pointer',
                        fontSize: 10.5, fontWeight: 600,
                      }}
                    >
                      <Clock size={10} /> Iniciar
                    </button>
                  )}
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: tone.fg, background: tone.bg,
                    border: `1px solid ${tone.border}`,
                    padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {STATUS_LABEL[m.status as MaintenanceStatus] ?? m.status}
                  </span>
                  {m.status === 'Completado' ? (
                    <CheckCircle2 size={13} style={{ color: tone.fg, flexShrink: 0 }} />
                  ) : (
                    <ChevronRight size={13} style={{ color: c.label, flexShrink: 0 }} />
                  )}
                </div>
              </button>
            );
          })}
          {list.length > 6 && (
            <button
              onClick={() => navigate(`/mantenimiento?assetId=${encodeURIComponent(assetId)}`)}
              style={{
                marginTop: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                background: 'transparent', color: c.accent,
                border: 'none', borderRadius: 6, padding: '7px',
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
              }}
            >
              Ver {list.length - 6} más <ArrowRight size={11} />
            </button>
          )}
        </div>
      )}

      {/* ── Modals / Drawer / Dialog ─────────────────────────────────────── */}
      <AnimatePresence>
        {createOpen && (
          <MaintenanceFormModal
            open={createOpen}
            onClose={() => { setCreateOpen(false); refetch(); }}
            prefill={{ assetId }}
            maintenance={editing}
            hideTypeSelector={!editing}
          />
        )}
        {detailId && (
          <MaintenanceDetailDrawer
            id={detailId}
            isFullAccess={isFullAccess}
            meId={meId}
            onClose={() => { setDetailId(null); refetch(); }}
            onEdit={(m) => { setDetailId(null); setEditing(m); setCreateOpen(true); }}
            onTake={onTake}
            onFinalize={onFinalize}
            onReschedule={(m) => { setReprogram(m); }}
          />
        )}
        {reprogramTarget && (
          <ReprogramDialog
            open={!!reprogramTarget}
            target={reprogramTarget}
            saving={rescheduleMut.isPending}
            onClose={() => setReprogram(null)}
            onConfirm={onReschedule}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
