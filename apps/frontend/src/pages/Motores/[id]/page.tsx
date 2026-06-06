import { useParams } from 'react-router-dom';
import { useAuth } from './../../../context/AuthContext';
import VehicleCockpit from './VehicleCockpit';

export default function VehicleCockpitPage() {
  const params = useParams<{ id: string }>();
  const { session } = useAuth();

  const rawCompanyId = session?.companyId ?? null;
  const assetId      = params.id ? `${params.id}` : null;
  const companyId    = rawCompanyId ? `${rawCompanyId}` : '';

  if (!assetId) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Vehículo no especificado</div>;
  }
  if (!companyId) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Sin empresa activa</div>;
  }

  return <VehicleCockpit assetId={assetId} companyId={companyId} />;
}