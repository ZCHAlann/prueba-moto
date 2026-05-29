import type { ReactNode } from "react";
import { MasterSidebar } from "@/components/layout/master-sidebar";
import { MasterTopbar } from "@/components/layout/master-topbar";

export function SuperadminShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-panel-shell min-h-screen bg-neutral-100 text-neutral-950 lg:flex">
      <MasterSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <MasterTopbar />
        <main className="app-panel-main flex-1 px-2.5 py-3 sm:px-3 lg:px-4 lg:py-4">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
