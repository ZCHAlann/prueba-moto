import { MasterOperationsPage } from "@/features/master/master-operations-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MasterOperationRoute() {
  return <MasterOperationsPage />;
}
