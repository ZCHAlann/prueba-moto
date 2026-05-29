import { SuperadminDashboardPage } from "@/features/superadmin/superadmin-dashboard-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SuperadminPage() {
  return <SuperadminDashboardPage />;
}
