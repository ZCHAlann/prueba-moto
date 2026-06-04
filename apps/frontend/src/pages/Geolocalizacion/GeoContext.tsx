import React, { createContext, useContext, useState, useCallback } from 'react';
import { Vehicle, RouteHistoryItem, GeoContextState, VehicleCommand } from './types/geo.types';
import { MOCK_VEHICLES } from './mockData';

const GeoContext = createContext<GeoContextState | null>(null);

export const GeoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>(MOCK_VEHICLES);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [ghostRoute, setGhostRoute] = useState<RouteHistoryItem | null>(null);

  const selectVehicle = useCallback((id: string) => {
    setSelectedVehicleId(id);
    setGhostRoute(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedVehicleId(null);
    setGhostRoute(null);
  }, []);

  const sendCommand = useCallback(async (vehicleId: string, command: VehicleCommand) => {
    await new Promise(res => setTimeout(res, 1500));
    setVehicles(prev => prev.map(v => {
      if (v.id !== vehicleId) return v;
      switch (command) {
        case 'engine_on':  return { ...v, status: 'active' as const };
        case 'engine_off': return { ...v, status: 'offline' as const, speed: 0 };
        case 'lock':       return { ...v, isLocked: true, status: 'blocked' as const };
        case 'unlock':     return { ...v, isLocked: false, status: v.speed > 0 ? 'active' as const : 'idle' as const };
        default:           return v;
      }
    }));
  }, []);

  return (
    <GeoContext.Provider value={{
      vehicles,
      selectedVehicleId,
      selectVehicle,
      clearSelection,
      ghostRoute,
      setGhostRoute,
      sendCommand,
    }}>
      {children}
    </GeoContext.Provider>
  );
};

export const useGeo = (): GeoContextState => {
  const ctx = useContext(GeoContext);
  if (!ctx) throw new Error('useGeo must be used inside GeoProvider');
  return ctx;
};