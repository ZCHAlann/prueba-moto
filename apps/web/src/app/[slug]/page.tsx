import { CompanyEntryPage } from "@/features/account/company-entry-page";

type CompanyEntryRouteProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanyEntryRoute({ params }: CompanyEntryRouteProps) {
  const { slug } = await params;

  return <CompanyEntryPage slug={slug} />;
}
