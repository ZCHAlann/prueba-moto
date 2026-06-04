import React, { useState, useRef, useEffect } from 'react';
import { useGeo } from '../../GeoContext';
import { Vehicle } from '../../types/geo.types';

const STATUS_COLOR: Record<string, string> = {
  active:  'var(--geo-active)',
  idle:    'var(--geo-idle)',
  offline: 'var(--geo-offline)',
  blocked: 'var(--geo-blocked)',
};

const STATUS_LABEL: Record<string, string> = {
  active:  'ACTIVO',
  idle:    'IDLE',
  offline: 'APAGADO',
  blocked: 'BLOQUEADO',
};

const StatusDot: React.FC<{ status: string }> = ({ status }) => (
  <span style={{
    display: 'inline-block',
    width: 9, height: 9,
    borderRadius: '50%',
    background: STATUS_COLOR[status],
    flexShrink: 0,
    boxShadow: status === 'active' ? `0 0 6px ${STATUS_COLOR[status]}` : 'none',
    animation: status === 'active' ? 'geo-pulse 2s ease-in-out infinite' : 'none',
  }}/>
);

const VehicleListItem: React.FC<{ vehicle: Vehicle; onSelect: () => void }> = ({ vehicle, onSelect }) => {
  const [hovered, setHovered] = useState(false);
  const isClickable = vehicle.status !== 'offline';

  const relativeTime = (d: Date) => {
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return `Hace ${diff}s`;
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)}min`;
    return `Hace ${Math.floor(diff / 3600)}h`;
  };

  return (
    <div
      onClick={isClickable ? onSelect : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 16px',
        cursor: isClickable ? 'pointer' : 'default',
        opacity: vehicle.status === 'offline' ? 0.55 : 1,
        background: hovered && isClickable ? 'var(--geo-bg-hover)' : 'transparent',
        borderLeft: hovered && isClickable ? '2px solid var(--geo-selected)' : '2px solid transparent',
        transition: 'all 150ms ease',
        borderBottom: '1px solid var(--geo-border)',
      }}
    >
      <StatusDot status={vehicle.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{
            fontFamily: 'DM Mono', fontWeight: 600, fontSize: 13,
            color: 'var(--geo-text-primary)',
          }}>{vehicle.plate}</span>
          <span style={{
            fontFamily: 'Outfit', fontSize: 10, fontWeight: 500,
            color: STATUS_COLOR[vehicle.status],
            background: `${STATUS_COLOR[vehicle.status]}18`,
            border: `1px solid ${STATUS_COLOR[vehicle.status]}40`,
            borderRadius: 100, padding: '1px 7px',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>{STATUS_LABEL[vehicle.status]}</span>
        </div>
        <div style={{ fontFamily: 'Outfit', fontSize: 11, color: 'var(--geo-text-secondary)', marginTop: 2 }}>
          {vehicle.driverName ?? 'Sin conductor'}
        </div>
        <div style={{ fontFamily: 'Outfit', fontSize: 10, color: 'var(--geo-text-muted)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="9" height="9" viewBox="0 0 9 9" fill="var(--geo-text-muted)">
            <path d="M4.5 0C2.567 0 1 1.567 1 3.5c0 2.625 3.5 5.5 3.5 5.5S8 6.125 8 3.5C8 1.567 6.433 0 4.5 0zm0 4.75a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z"/>
          </svg>
          {relativeTime(vehicle.lastSeen)}
        </div>
      </div>
    </div>
  );
};

export const VehicleSelector: React.FC = () => {
  const { vehicles, selectedVehicleId, selectVehicle, clearSelection } = useGeo();
  const [open, setOpen] = useState(false);
  const [hoverTrigger, setHoverTrigger] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

  const counts = {
    active:  vehicles.filter(v => v.status === 'active').length,
    idle:    vehicles.filter(v => v.status === 'idle').length,
    offline: vehicles.filter(v => v.status === 'offline').length,
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'absolute', top: 16, left: 16, zIndex: 1000 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Trigger */}
        <button
          onClick={() => setOpen(o => !o)}
          onMouseEnter={() => setHoverTrigger(true)}
          onMouseLeave={() => setHoverTrigger(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--geo-bg-glass)',
            backdropFilter: 'blur(12px) saturate(180%)',
            border: `1px solid ${hoverTrigger ? 'var(--geo-border-accent)' : 'var(--geo-border-strong)'}`,
            borderRadius: 10,
            padding: '9px 16px',
            color: 'var(--geo-text-primary)',
            cursor: 'pointer',
            boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
            transition: '200ms ease',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
            <rect x="2" y="5" width="13" height="8" rx="2.5" fill={hoverTrigger ? 'var(--geo-accent)' : 'var(--geo-text-secondary)'} opacity="0.9"/>
            <rect x="5" y="3.5" width="7" height="3" rx="1.5" fill={hoverTrigger ? 'var(--geo-accent)' : 'var(--geo-text-secondary)'} opacity="0.7"/>
            <circle cx="4.5" cy="13.5" r="1.5" fill={hoverTrigger ? 'var(--geo-accent)' : 'var(--geo-text-secondary)'}/>
            <circle cx="12.5" cy="13.5" r="1.5" fill={hoverTrigger ? 'var(--geo-accent)' : 'var(--geo-text-secondary)'}/>
          </svg>
          <span style={{ fontFamily: 'Outfit', fontWeight: 500, fontSize: 14 }}>Vehículos</span>
          <span style={{
            fontFamily: 'DM Mono', fontSize: 11,
            background: 'var(--geo-accent-dim)', color: 'var(--geo-accent)',
            borderRadius: 100, padding: '2px 8px',
          }}>{vehicles.length}</span>
        </button>

        {/* Clear selection button */}
        {selectedVehicle && (
          <button
            onClick={() => { clearSelection(); setOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(248,81,73,0.1)',
              border: '1px solid rgba(248,81,73,0.3)',
              borderRadius: 10,
              padding: '9px 14px',
              color: '#f85149',
              cursor: 'pointer',
              fontFamily: 'Outfit', fontWeight: 500, fontSize: 12,
              backdropFilter: 'blur(12px)',
              transition: '150ms ease',
              animation: 'geo-fade-in 200ms ease-out',
            }}
          >
            ✕ <span style={{ fontFamily: 'DM Mono', fontSize: 11 }}>{selectedVehicle.plate}</span>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          marginTop: 8,
          width: 320,
          maxHeight: 420,
          overflowY: 'auto',
          background: 'var(--geo-bg-panel)',
          border: '1px solid var(--geo-border-strong)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)',
          animation: 'geo-fade-in 200ms cubic-bezier(0.16,1,0.3,1)',
        }} className="geo-scrollbar">
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--geo-border)' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 13, color: 'var(--geo-text-primary)', marginBottom: 8 }}>
              Todos los vehículos
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { count: counts.active, color: 'var(--geo-active)', label: `${counts.active} activos` },
                { count: counts.idle,   color: 'var(--geo-idle)',   label: `${counts.idle} idle` },
                { count: counts.offline,color: 'var(--geo-offline)',label: `${counts.offline} apagados` },
              ].map(({ color, label }) => (
                <span key={label} style={{
                  fontFamily: 'Outfit', fontSize: 10, fontWeight: 500,
                  color, background: `${color}18`,
                  border: `1px solid ${color}35`,
                  borderRadius: 100, padding: '2px 8px',
                }}>{label}</span>
              ))}
            </div>
          </div>
          {/* List */}
          {vehicles.map(v => (
            <VehicleListItem
              key={v.id}
              vehicle={v}
              onSelect={() => { selectVehicle(v.id); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
};