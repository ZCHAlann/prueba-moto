import { VehicleDetailPage } from "@/features/flotas/vehicle-detail-page";

type FlotasDetailRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function FlotasDetailRoute({ params }: FlotasDetailRouteProps) {
  const { id } = await params;
  return <VehicleDetailPage vehicleId={id} />;
}