import { MasterOperationsPage } from "@/features/master/master-operations-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MasterOperationModuleRouteProps = {
  params: Promise<{ slug: string }>;
};

export default async function MasterOperationModuleRoute({
  params,
}: MasterOperationModuleRouteProps) {
  const { slug } = await params;
  return <MasterOperationsPage selectedSlug={slug} />;
}
