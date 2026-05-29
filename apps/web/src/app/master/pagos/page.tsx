import { PaymentsPage } from "@/features/superadmin/payments-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MasterPaymentsRoute() {
  return <PaymentsPage />;
}
