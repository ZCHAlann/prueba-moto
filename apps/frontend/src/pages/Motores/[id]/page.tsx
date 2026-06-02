import { useParams } from "react-router";
import { useAuth } from "../../../context/AuthContext";
import VehicleCockpit from "../components/VehicleCockpit.tsx";

export default function MotorCockpitPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();

  return (
    // Escapa el padding/margin del AppLayout (pt-24 p-4 md:p-6)
    // y ocupa todo el viewport disponible debajo del header
    <div className="-mt-24 -mx-4 md:-mx-6 h-screen">
      <VehicleCockpit
        assetId={String(id)}
        companyId={session?.companyId ?? ""}
      />
    </div>
  );
}