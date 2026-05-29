import { Suspense } from "react";
import { MaintenanceFormPage } from "@/features/mantenimiento/maintenance-form-page";

export default function MaintenanceCreateRoute() {
  return (
    <Suspense fallback={null}>
      <MaintenanceFormPage mode="create" />
    </Suspense>
  );
}
