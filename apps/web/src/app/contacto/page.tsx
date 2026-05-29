import { RequestDemoPage } from "@/features/public/request-demo-page";

export default function ContactRoute({
  searchParams,
}: {
  searchParams?: {
    intent?: string | string[];
    plan?: string | string[];
  };
}) {
  return (
    <RequestDemoPage
      mode="contacto"
      initialIntent={typeof searchParams?.intent === "string" ? searchParams.intent : ""}
      initialPlanId={typeof searchParams?.plan === "string" ? searchParams.plan : ""}
    />
  );
}
