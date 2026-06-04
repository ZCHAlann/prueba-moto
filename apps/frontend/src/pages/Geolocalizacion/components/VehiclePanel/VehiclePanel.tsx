import React from 'react';
import { useGeo } from '../../GeoContext';
import { PanelActions } from './PanelActions/PanelActions';
import { PanelTabs } from './PanelTabs/PanelTabs';

interface VehiclePanelProps {
  canControl?: boolean;
}

export const VehiclePanel: React.FC<VehiclePanelProps> = ({ canControl = true }) => {
  const { vehicles, selectedVehicleId } = useGeo();
  const vehicle = vehicles.find(v => v.id === selectedVehicleId);

  const isVisible = !!vehicle;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 280,
      background: 'var(--geo-bg-panel)',
      borderTop: '1px solid var(--geo-border-strong)',
      boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
      zIndex: 1200,
      display: 'flex',
      flexDirection: 'column',
      transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
      transition: isVisible
        ? 'transform 400ms cubic-bezier(0.16,1,0.3,1)'
        : 'transform 250ms ease-in',
      pointerEvents: isVisible ? 'all' : 'none',
    }}>
      {/* Drag handle */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
        <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--geo-border-strong)' }}/>
      </div>

      {vehicle && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <PanelActions vehicle={vehicle} canControl={canControl} />
          <PanelTabs vehicle={vehicle} />
        </div>
      )}
    </div>
  );
};