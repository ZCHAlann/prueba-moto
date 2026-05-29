import { LeadsPage } from "@/features/superadmin/leads-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SuperadminLeadsPage() {
  return <LeadsPage />;
}
