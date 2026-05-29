import { MotorDetailPage } from "@/features/motores/motor-detail-page";

type MotorDetailRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function MotorDetailRoute({ params }: MotorDetailRouteProps) {
  const { id } = await params;
  return <MotorDetailPage motorId={id} />;
}