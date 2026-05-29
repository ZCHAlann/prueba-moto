import { SuperadminSettingsPage } from "@/features/superadmin/superadmin-settings-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SuperadminConfiguracionRoute() {
  return <SuperadminSettingsPage />;
}
