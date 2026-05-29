import { VehicleFormPage } from "@/features/flotas/vehicle-form-page";

type FlotasEditRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function FlotasEditRoute({ params }: FlotasEditRouteProps) {
  const { id } = await params;
  return <VehicleFormPage mode="edit" vehicleId={id} />;
}