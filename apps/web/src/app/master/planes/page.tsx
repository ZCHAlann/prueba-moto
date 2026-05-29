import { PlansPage } from "@/features/superadmin/plans-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SuperadminPlansPage() {
  return <PlansPage />;
}
