import { GlobalUsersPage } from "@/features/superadmin/global-users-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SuperadminUsersPage() {
  return <GlobalUsersPage />;
}
