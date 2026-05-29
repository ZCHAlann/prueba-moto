import { Suspense } from "react";
import { MaintenanceFormPage } from "@/features/mantenimiento/maintenance-form-page";

type MaintenanceEditRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function MaintenanceEditRoute({ params }: MaintenanceEditRouteProps) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <MaintenanceFormPage mode="edit" maintenanceId={id} />
    </Suspense>
  );
}
