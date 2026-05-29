import { type ReactNode } from "react";
import { SidebarProvider, useSidebar } from "@/components/context/SidebarContext";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

type DashboardShellProps = { children: ReactNode };

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <SidebarProvider>
      <div className="app-panel-shell min-h-screen">
        <Sidebar />
        <LayoutContent>{children}</LayoutContent>
      </div>
    </SidebarProvider>
  );
}

function LayoutContent({ children }: { children: ReactNode }) {
  const { isExpanded } = useSidebar();

  return (
    <div
      className={`sidebar-content-area flex min-h-screen flex-col overflow-hidden
        ${isExpanded ? "lg:ml-[290px]" : "lg:ml-[90px]"}`}
    >
      <Topbar />
      <main className="flex-1 px-3 py-4 sm:px-4 lg:px-5 lg:py-5">
        <div className="mx-auto w-full max-w-[1440px]">{children}</div>
      </main>
    </div>
  );
}