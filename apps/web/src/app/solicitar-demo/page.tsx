import { RequestDemoPage } from "@/features/public/request-demo-page";

export default function RequestDemoRoute({
  searchParams,
}: {
  searchParams?: {
    intent?: string | string[];
    plan?: string | string[];
  };
}) {
  return (
    <RequestDemoPage
      mode="demo"
      initialIntent={typeof searchParams?.intent === "string" ? searchParams.intent : ""}
      initialPlanId={typeof searchParams?.plan === "string" ? searchParams.plan : ""}
    />
  );
}
