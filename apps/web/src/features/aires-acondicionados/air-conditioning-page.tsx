"use client";

import { useState } from "react";
import { useFleetOps } from "@/components/providers/fleetops-provider";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { AcDashboard } from "./ac-dashboard";
import { AcInventory } from "./ac-inventory";
import { AcDetail } from "./ac-detail";

export function AirConditioningPage() {
  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="A/C Pro"
        title="Aires Acondicionados"
        subtitle="Gestión de equipos fijos, mantenimientos y recargas de refrigerante."
        accent="cyan"
      />
      <AcDashboard />
      <AcInventory />
    </div>
  );
}
