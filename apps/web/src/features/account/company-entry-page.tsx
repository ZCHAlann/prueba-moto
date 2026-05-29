"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { AppLoadingState } from "@/components/ui/access-state";
import { usePlatform } from "@/components/providers/platform-provider";


export function CompanyEntryPage({ slug }: { slug: string }) {
  const router = useRouter();
  const { ready, session, getHomePath } = useAuth();
  const { companies } = usePlatform();

  useEffect(() => {
    if (!ready) return;

    if (!session) {
      router.replace(`/login?redirect=/${slug}`);
      return;
    }

    const company = companies.find((item) => item.slug === slug);
    if (!company) {
      router.replace(getHomePath());
      return;
    }

    if (session.role !== "superadmin" && session.companyId !== company.id) {
      router.replace(getHomePath());
      return;
    }

    router.replace("/dashboard");
  }, [companies, getHomePath, ready, router, session, slug]);

  return (
    <AppLoadingState
      title="Abriendo la empresa"
      description="Estamos preparando el panel operativo correspondiente a esta empresa."
    />
  );
}