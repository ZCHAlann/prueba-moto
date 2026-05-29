import { ModulesPage } from "@/features/superadmin/modules-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SuperadminModulesPage() {
  return <ModulesPage />;
}
