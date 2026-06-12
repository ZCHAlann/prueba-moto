import { JSX, useState } from 'react';
import { CockpitData } from '../hooks/useVehicleCockpit';
import { useTheme } from '@/context/ThemeContext';
import CardLocation from '../cards/CardLocation';
import CardAcciones from '../cards/CardAcciones';
import CardDailyUsage from '../cards/CardDailyUsage';
import ModalAgendarMantenimiento from '../modals/ModalAgendarMantenimiento';
import ModalSeguros from '../modals/ModalSeguros';
import ModalConductor from '../modals/ModalConductor';
import ModalNotas from '../modals/ModalNotas';
import ModalConfigVehiculo from '../modals/ModalConfigVehiculo';
import { usePermissions } from "../../../../hooks/usePermissions";

type Props = {
  data: CockpitData;
  companyId: string;
  onRefresh: () => void;
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconWrench() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}
function IconZap() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}
function IconNote() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  );
}

// AI_ACTIONS are now built dynamically inside the component using live data

// ─── Insurance status helper ─────────────────────────────────────────────────

function insuranceStatus(insurance: import('../hooks/useVehicleCockpit').Insurance): {
  label: string; color: string; bg: string;
} {
  if (!insurance) return { label: 'Sin seguro', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
  const today = new Date();
  const end   = new Date(insurance.endDate);
  const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
  const s = (insurance.status ?? '').toLowerCase();
  if (s === 'vencido' || daysLeft < 0)
    return { label: 'Vencido',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
  if (daysLeft <= 30)
    return { label: `Vence en ${daysLeft}d`, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  return { label: 'Vigente', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' };
}

// ─── Detail rows helper ───────────────────────────────────────────────────────

type DetailItem = { label: string; value: string | null | undefined };

// ─── Component ────────────────────────────────────────────────────────────────

export default function TabVehiculo({ data, companyId, onRefresh }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [modal, setModal] = useState<'mantenimiento' | 'seguros' | 'conductor' | 'notas' | 'config' | null>(null);
  const [detailTab, setDetailTab] = useState<'vehiculo' | 'mantenimientos'>('vehiculo');
  const [toggling, setToggling] = useState(false);
  const { can } = usePermissions();
  const canEdit   = can("motores", "lista_motores", "editar");

  const a = data.asset;
  const photo = a.photoUrls?.[0];

  const c = isDark
    ? {
        heroBg:        '#0d1321',
        heroEmptyBg:   'radial-gradient(ellipse at 35% 60%, #1e293b 0%, #0f172a 70%)',
        panelBg:       '#111827',
        panelBorder:   'rgba(255,255,255,0.07)',
        text:          '#f4f4f5',
        muted:         '#a1a1aa',
        mutedLight:    '#71717a',
        iconColor:     '#a1a1aa',
        actionBg:      'rgba(255,255,255,0.04)',
        actionBgHover: 'rgba(255,255,255,0.08)',
        actionBorder:  'rgba(255,255,255,0.08)',
        tabActive:     '#16a34a',
        tabActiveTxt:  '#fff',
        tabInactive:   'transparent',
        tabInactiveTxt:'#71717a',
        divider:       'rgba(255,255,255,0.07)',
        labelColor:    '#52525b',
        valueColor:    '#e4e4e7',
        noteBg:        'rgba(255,255,255,0.04)',
      }
    : {
        heroBg:        '#f0f4f8',
        heroEmptyBg:   'radial-gradient(ellipse at 35% 60%, #d4dce8 0%, #e8edf4 70%)',
        panelBg:       '#ffffff',
        panelBorder:   '#e2e8f0',
        text:          '#0f172a',
        muted:         '#64748b',
        mutedLight:    '#94a3b8',
        iconColor:     '#475569',
        actionBg:      '#f8fafc',
        actionBgHover: '#f1f5f9',
        actionBorder:  '#e2e8f0',
        tabActive:     '#16a34a',
        tabActiveTxt:  '#fff',
        tabInactive:   'transparent',
        tabInactiveTxt:'#94a3b8',
        divider:       '#e2e8f0',
        labelColor:    '#94a3b8',
        valueColor:    '#0f172a',
        noteBg:        '#f8fafc',
      };

  // ── Detail rows ──────────────────────────────────────────────────────────────
  const vehicleDetails: DetailItem[] = [
    { label: 'Código',       value: a.code },
    { label: 'Tipo',         value: a.assetType },
    { label: 'Categoría',    value: a.category },
    { label: 'Placa',        value: a.plate },
    { label: 'Serie',        value: a.serial },
    { label: 'Color',        value: a.color },
    { label: 'Carga máx.',   value: a.maxLoad },
    { label: 'Combustible',  value: a.fuelType },
    { label: 'Aceite',       value: a.oilType },
    { label: 'Cap. aceite',  value: a.oilCapacity },
    { label: 'Estado',       value: a.status },
    { label: 'Disponib.',    value: a.availability },
  ].filter(d => d.value);

  const maintenanceDetails: DetailItem[] = data.maintenances?.length
    ? data.maintenances.slice(0, 8).map(m => ({
        label: m.scheduledDate ?? m.createdAt ?? '—',
        value: `${m.title} · ${m.status}`,
      }))
    : [{ label: 'Sin registros', value: 'No hay mantenimientos' }];

  const activeDetails = detailTab === 'vehiculo' ? vehicleDetails : maintenanceDetails;

  // ── Toggle asset status ──────────────────────────────────────────────────────
  const handleToggle = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/company/${companyId}/assets/${a.id}/toggle`, { method: 'PATCH' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onRefresh();
    } catch (err) {
      console.error('Error al cambiar estado del activo:', err);
      alert('No se pudo cambiar el estado. Intenta de nuevo.');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

      {/* ── TOP ROW: Photo (left) + Details panel (right) ─────────────────── */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_380px] md:gap-3.5" style={{ alignItems: 'stretch' }}>

        {/* ── LEFT: Vehicle photo ──────────────────────────────────────────── */}
        <div style={{
          position: 'relative',
          borderRadius: '18px',
          overflow: 'hidden',
          background: c.heroBg,
          minHeight: '340px',
        }}>
          {photo ? (
            <img
              src={photo}
              alt={a.name}
              style={{
                width: '100%', height: '100%',
                objectFit: 'contain',
                objectPosition: 'center 35%',
                display: 'block',
              }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              minHeight: '340px',
              background: c.heroEmptyBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 48, opacity: 0.2 }}>🚗</span>
            </div>
          )}

          {/* Settings button — top right corner of photo */}
          {canEdit && (
            <button
              onClick={() => setModal('config')}
              style={{
                position: 'absolute', top: 14, right: 14,
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(8px)',
                border: 'none', borderRadius: '10px',
                width: 34, height: 34,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#fff',
              }}
            >
              <IconSettings />
            </button>
          )}
        </div>

        {/* ── RIGHT: Details panel ─────────────────────────────────────────── */}
        <div style={{
          borderRadius: '18px',
          background: c.panelBg,
          border: `1px solid ${c.panelBorder}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>

          {/* Tab bar */}
          <div style={{
            display: 'flex',
            borderBottom: `1px solid ${c.divider}`,
            padding: '10px 14px 0',
            gap: 4,
          }}>
            {(['vehiculo', 'mantenimientos'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setDetailTab(t)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px 8px 0 0',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  background: detailTab === t ? c.tabActive : c.tabInactive,
                  color: detailTab === t ? c.tabActiveTxt : c.tabInactiveTxt,
                  transition: 'all 0.12s',
                  letterSpacing: '0.01em',
                }}
              >
                {t === 'vehiculo' ? 'Vehículo' : 'Mantenimientos'}
              </button>
            ))}
          </div>

          {/* Title */}
          <div style={{ padding: '14px 16px 10px' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.text }}>
              {detailTab === 'vehiculo' ? 'Detalles del vehículo' : 'Historial de mantenimientos'}
            </p>
          </div>

          {/* Detail rows — scrollable */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}>
            {activeDetails.map((d, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  padding: '7px 0',
                  borderBottom: i < activeDetails.length - 1 ? `1px solid ${c.divider}` : 'none',
                }}
              >
                <span style={{
                  fontSize: 11,
                  color: c.labelColor,
                  fontWeight: 500,
                  minWidth: 90,
                  flexShrink: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  {d.label}
                </span>
                <span style={{
                  fontSize: 12,
                  color: c.valueColor,
                  fontWeight: 500,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {d.value}
                </span>
              </div>
            ))}
          </div>

          {/* Actions grid — pinned to bottom */}
          {(() => {
            const driverName = data.driver
              ? `${data.driver.firstName} ${data.driver.lastName}`
              : 'Sin conductor';

            const ins = insuranceStatus(data.insurance);

            const assetActive = a.status === 'Operativo';
            const estadoLabel  = assetActive ? 'Operativo'     : a.status === 'En mantenimiento' ? 'En mant.' : 'Fuera serv.';
            const estadoColor  = assetActive ? '#16a34a'        : a.status === 'En mantenimiento' ? '#f59e0b'  : '#ef4444';
            const estadoBg     = assetActive ? 'rgba(22,163,74,0.12)' : a.status === 'En mantenimiento' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';

            const ACTIONS: {
              id: string;
              icon: JSX.Element;
              label: string;
              badge: string;
              badgeColor: string;
              badgeBg: string;
            }[] = [
              {
                id: 'mantenimiento',
                icon: <IconWrench />,
                label: 'Mantenimiento',
                badge: 'Agendar',
                badgeColor: c.mutedLight,
                badgeBg: 'transparent',
              },
              {
                id: 'seguros',
                icon: <IconShield />,
                label: 'Seguros',
                badge: ins.label,
                badgeColor: ins.color,
                badgeBg: ins.bg,
              },
              {
                id: 'conductor',
                icon: <IconUser />,
                label: 'Conductor',
                badge: driverName,
                badgeColor: data.driver ? '#16a34a' : '#ef4444',
                badgeBg: data.driver ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)',
              },
              {
                id: 'toggle',
                icon: <IconZap />,
                label: 'Estado',
                badge: toggling ? 'Cambiando...' : estadoLabel,
                badgeColor: toggling ? '#6366f1' : estadoColor,
                badgeBg: toggling ? 'rgba(99,102,241,0.12)' : estadoBg,
              },
            ];

            return (
              <div style={{
                borderTop: `1px solid ${c.divider}`,
                padding: '12px 14px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}>
                {ACTIONS.map((ac) => (
                  <button
                    key={ac.id}
                    onClick={() => {
                      if (ac.id === 'toggle') { handleToggle(); return; }
                      setModal(ac.id as 'mantenimiento' | 'seguros' | 'conductor');
                    }}
                    disabled={toggling && ac.id === 'toggle'}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5,
                      padding: '9px 11px',
                      borderRadius: '10px',
                      background: c.actionBg,
                      border: `1px solid ${c.actionBorder}`,
                      cursor: toggling && ac.id === 'toggle' ? 'wait' : 'pointer',
                      opacity: toggling && ac.id === 'toggle' ? 0.7 : 1,
                      transition: 'background 0.12s',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = c.actionBgHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = c.actionBg)}
                  >
                    <span style={{ color: c.iconColor }}>{ac.icon}</span>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: c.text, lineHeight: 1.2 }}>
                      {ac.label}
                    </p>
                    {/* Contextual badge */}
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: ac.badgeColor,
                      background: ac.badgeBg,
                      borderRadius: '4px',
                      padding: ac.badgeBg !== 'transparent' ? '1px 5px' : '0',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                      letterSpacing: '0.02em',
                    }}>
                      {ac.badge}
                    </span>
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Note button */}
          <div style={{ padding: '0 14px 14px' }}>
            <button
              onClick={() => setModal('notas')}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: c.noteBg,
                border: `1px solid ${c.actionBorder}`,
                borderRadius: '10px',
                padding: '9px',
                cursor: 'pointer',
                fontSize: 12, fontWeight: 500, color: c.muted,
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = c.actionBgHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = c.noteBg)}
            >
              <IconNote />
              Registrar nota
            </button>
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW: 3 Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <CardLocation
          assetId={a.id}
          companyId={companyId}
          fallbackText={a.location ?? 'Sin coordenadas GPS'}
        />
        <CardAcciones
          assetId={a.id}
          companyId={companyId}
          engineOn={a.engineOn}
          locked={a.locked}
          onChange={onRefresh}
        />
        <CardDailyUsage assetId={a.id} companyId={companyId} />
      </div>

      {/* ── Modals ── */}
      <ModalAgendarMantenimiento
        open={modal === 'mantenimiento'}
        onClose={() => setModal(null)}
        assetId={a.id}
        companyId={companyId}
      />
      <ModalSeguros
        open={modal === 'seguros'}
        onClose={() => setModal(null)}
        insurance={data.insurance}
        assetId={a.id}
        companyId={companyId}
        onSaved={onRefresh}
      />
      <ModalConductor
        open={modal === 'conductor'}
        onClose={() => setModal(null)}
        driver={data.driver}
        activeAssignment={data.activeAssignment}
        companyId={companyId}
        onChanged={onRefresh}
      />
      <ModalNotas
        open={modal === 'notas'}
        onClose={() => setModal(null)}
        assetId={a.id}
        companyId={companyId}
      />
      <ModalConfigVehiculo
        open={modal === 'config'}
        onClose={() => setModal(null)}
        asset={a}
        companyId={companyId}
        onSaved={onRefresh}
      />
    </div>
  );
}