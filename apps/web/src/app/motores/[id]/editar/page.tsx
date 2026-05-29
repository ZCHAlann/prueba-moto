import { MotorFormPage } from "@/features/motores/motor-form-page";

type MotorEditRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function MotorEditRoute({ params }: MotorEditRouteProps) {
  const { id } = await params;
  return <MotorFormPage mode="edit" motorId={id} />;
}