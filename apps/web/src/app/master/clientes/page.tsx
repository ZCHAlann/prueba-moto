import { ClientsPage } from "@/features/superadmin/clients-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SuperadminClientsPage() {
  return <ClientsPage />;
}
