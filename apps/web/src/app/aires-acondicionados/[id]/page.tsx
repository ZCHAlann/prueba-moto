"use client";

import { useRouter } from "next/navigation";
import { AcDetail } from "@/features/aires-acondicionados/ac-detail";

export default function AcDetailRoute({ params }: { params: { id: string } }) {
  const router = useRouter();
  
  return (
    <AcDetail 
      unitId={params.id} 
      onBack={() => router.push("/aires-acondicionados")} 
    />
  );
}
