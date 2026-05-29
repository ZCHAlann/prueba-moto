import { DashboardOverview } from "@/features/dashboard/dashboard-overview";
import { getBackendMessage } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const backendMessage = await getBackendMessage();

  return <DashboardOverview backendMessage={backendMessage} />;
}
