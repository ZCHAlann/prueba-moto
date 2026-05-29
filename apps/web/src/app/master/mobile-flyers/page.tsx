import { MobileFlyersPage } from "@/features/superadmin/mobile-flyers-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MasterMobileFlyersRoute() {
  return <MobileFlyersPage />;
}
