import { AuditPage } from "@/features/superadmin/audit-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SuperadminAuditPage() {
  return <AuditPage />;
}
