import { BillingPage } from "@/features/superadmin/billing-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SuperadminBillingPage() {
  return <BillingPage />;
}
