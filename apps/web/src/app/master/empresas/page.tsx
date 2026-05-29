import { CompaniesPage } from "@/features/superadmin/companies-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SuperadminCompaniesPage() {
  return <CompaniesPage />;
}
