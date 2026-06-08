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

const AI_ACTIONS: { id: string; label: string; sublabel: string; icon: JSX.Element }[] = [
  { id: 'mantenimiento', label: 'Mantenimiento', sublabel: 'Agendar',       icon: <IconWrench /> },
  { id: 'seguros',       label: 'Seguros',       sublabel: 'Ver plan',      icon: <IconShield /> },
  { id: 'conductor',     label: 'Conductor',     sublabel: 'Gestionar',     icon: <IconUser />   },
  { id: 'toggle',        label: 'Estado',        sublabel: 'Activar / Des', icon: <IconZap />    },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function TabVehiculo({ data, companyId, onRefresh }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [modal, setModal] = useState<'mantenimiento' | 'seguros' | 'conductor' | 'notas' | 'config' | null>(null);

  const a = data.asset;
  const photo = a.photoUrls?.[0];

  // Solo cambian colores — posiciones, gaps, paddings, sizes se mantienen
  const c = isDark
    ? {
        heroBg:         '#0f172a',
        heroEmptyBg:    'radial-gradient(ellipse at 35% 60%, #1e293b 0%, #0f172a 70%)',
        vignette:       'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 50%)',
        glass:          'rgba(22,27,44,0.85)',
        glassBorder:    'rgba(255,255,255,0.08)',
        text:           '#f4f4f5',
        muted:          '#a1a1aa',
        iconColor:      '#a1a1aa',
        actionBg:       'rgba(255,255,255,0.04)',
        actionBgHover:  'rgba(255,255,255,0.08)',
        actionBorder:   'rgba(255,255,255,0.08)',
        actionLabel:    '#f4f4f5',
        actionSub:      '#71717a',
      }
    : {
        heroBg:         '#f6f9fc',
        heroEmptyBg:    'radial-gradient(ellipse at 35% 60%, #d4dce8 0%, #e8edf4 70%)',
        vignette:       'linear-gradient(135deg, rgba(0,0,0,0.04) 0%, transparent 50%)',
        glass:          'rgba(255,255,255,0.88)',
        glassBorder:    'transparent',
        text:           '#0f172a',
        muted:          '#64748b',
        iconColor:      '#475569',
        actionBg:       '#f8fafc',
        actionBgHover:  '#f1f5f9',
        actionBorder:   '#e2e8f0',
        actionLabel:    '#0f172a',
        actionSub:      '#94a3b8',
      };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

      {/* ── HERO ─────────────────────────────────────────────────────────────
          Photo as background. Name pill top-left. Settings top-right.
          AI 2x2 grid + Notes button anchored to right side.
          Cards are NOT here — they live below in normal flow.
      ──────────────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        borderRadius: '22px',
        height: '80vh',
        overflow: 'hidden',
        background: c.heroBg,
      }}>

        {/* Background photo */}
        {photo ? (
          <img
            src={photo}
            alt={a.name}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 30%'
            }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            background: c.heroEmptyBg,
          }} />
        )}

        {/* Subtle vignette */}
        <div style={{
          position: 'absolute', inset: 0,
          background: c.vignette,
          pointerEvents: 'none',
        }} />

        {/* ── Name pill — top left ── */}
        <div style={{
          position: 'absolute', top: 20, left: 20, zIndex: 10,
          background: c.glass,
          backdropFilter: 'blur(10px)',
          border: `1px solid ${c.glassBorder}`,
          borderRadius: '14px',
          padding: '10px 16px',
          boxShadow: isDark ? '0 2px 16px rgba(0,0,0,0.4)' : '0 2px 16px rgba(0,0,0,0.08)',
        }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: c.text }}>{a.name}</p>
          <p style={{ margin: 0, fontSize: 11, color: c.muted, marginTop: 2 }}>
            {a.brand} {a.model} · {a.year}
          </p>
        </div>

        {/* ── Settings — top right ── */}
        <button
          onClick={() => setModal('config')}
          style={{
            position: 'absolute', top: 20, right: 20, zIndex: 10,
            background: c.glass,
            backdropFilter: 'blur(8px)',
            border: 'none', borderRadius: '12px',
            width: 38, height: 38,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: c.muted,
            boxShadow: isDark ? '0 1px 6px rgba(0,0,0,0.3)' : '0 1px 6px rgba(0,0,0,0.08)',
          }}
        >
          <IconSettings />
        </button>

        {/* ── AI panel — right side, vertically centered ── */}
        <div style={{
          position: 'absolute',
          top: '50%', right: 20,
          transform: 'translateY(-50%)',
          zIndex: 10,
          width: 236,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {/* 2×2 grid */}
          <div style={{
            background: c.glass,
            backdropFilter: 'blur(12px)',
            border: `1px solid ${c.glassBorder}`,
            borderRadius: '18px',
            padding: '14px',
            boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.5)' : '0 4px 24px rgba(0,0,0,0.10)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}>
            {AI_ACTIONS.map((ac) => (
              <button
                key={ac.id}
                onClick={() => {
                  if (ac.id === 'toggle') { alert('Activar / Desactivar — pendiente'); return; }
                  setModal(ac.id as 'mantenimiento' | 'seguros' | 'conductor');
                }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: c.actionBg,
                  border: `1px solid ${c.actionBorder}`,
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = c.actionBgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = c.actionBg)}
              >
                <span style={{ color: c.iconColor }}>{ac.icon}</span>
                <div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: c.actionLabel, lineHeight: 1.2 }}>{ac.label}</p>
                  <p style={{ margin: 0, fontSize: 10, color: c.actionSub, marginTop: 1 }}>{ac.sublabel}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Notes button */}
          <button
            onClick={() => setModal('notas')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              background: c.glass,
              backdropFilter: 'blur(8px)',
              border: `1px solid ${c.glassBorder}`,
              borderRadius: '12px',
              padding: '10px',
              cursor: 'pointer',
              fontSize: 12, fontWeight: 500, color: c.text,
              boxShadow: isDark ? '0 1px 6px rgba(0,0,0,0.3)' : '0 1px 6px rgba(0,0,0,0.06)',
              width: '100%',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = c.actionBgHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = c.glass)}
          >
            <IconNote />
            Registrar nota
          </button>
        </div>
      </div>

      {/* ── 3 CARDS — normal flow, below the hero ────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 14,
      }}>
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