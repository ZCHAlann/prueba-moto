"use client";

import { useParams } from "next/navigation";
import { DriverFormPage } from "@/features/operaciones/driver-form-page";

export default function DriverEditRoute() {
  const params = useParams<{ id: string }>();

  return <DriverFormPage mode="edit" driverId={params.id} />;
}
