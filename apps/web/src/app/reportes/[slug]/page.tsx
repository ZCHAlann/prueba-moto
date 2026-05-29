import { notFound } from "next/navigation";
import { ReportsPage } from "@/features/reportes/reports-page";
import { reportSlugToId } from "@/features/reportes/report-config";

type ReportSlugRouteProps = {
  params: Promise<{ slug: keyof typeof reportSlugToId }>;
};

export default async function ReportSlugRoute({ params }: ReportSlugRouteProps) {
  const { slug } = await params;
  const reportId = reportSlugToId[slug];

  if (!reportId) {
    notFound();
  }

  return <ReportsPage initialReportId={reportId} />;
}
