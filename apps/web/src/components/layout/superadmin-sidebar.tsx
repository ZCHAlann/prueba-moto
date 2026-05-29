"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppLogo } from "@/components/layout/app-logo";
import { useAuth } from "@/components/providers/auth-provider";
import { filterSuperadminNavigation } from "@/lib/access-control";
import { masterNavigation } from "@/lib/master-navigation";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SuperadminSidebar() {
  const pathname = usePathname();
  const { session } = useAuth();
  const sections = filterSuperadminNavigation(masterNavigation, session?.role ?? null);

  return (
    <aside className="app-sidebar hidden min-h-screen w-[286px] shrink-0 border-r border-zinc-800 bg-zinc-950 px-3 py-3 text-white lg:flex lg:flex-col">
      <div className="mb-4 rounded-lg border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(14,25,42,0.98),rgba(9,16,28,0.94))] px-2 py-2">
        <AppLogo
          href="/master"
          name="ApliSmart Motors"
          tagline="Panel master y comercial"
          theme="dark"
          compact
          mark="full"
          showTagline={false}
        />
      </div>

      <nav className="space-y-3 overflow-y-auto pr-1">
        {sections.map((section) => (
          <section key={section.label} className="rounded-lg border border-white/8 bg-white/[0.03]">
            <div className="border-b border-white/8 px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{section.label}</p>
            </div>
            <div className="space-y-1 px-2 py-2">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 transition ${active ? "bg-cyan-300 text-zinc-950 shadow-[0_18px_40px_-22px_rgba(34,211,238,0.95)]" : "text-zinc-300 hover:bg-white/10 hover:text-white"}`}
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold ${active ? "bg-zinc-950/10 text-zinc-950" : "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/20"}`}>
                      {item.icon}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className={`mt-0.5 block text-[11px] ${active ? "text-zinc-900/70" : "text-zinc-500"}`}>
                        {item.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="mt-3 rounded-lg border border-cyan-400/15 bg-cyan-400/10 px-3.5 py-3">
        <p className="text-sm font-semibold text-white">Capa ejecutiva</p>
        <p className="mt-1 text-xs leading-5 text-zinc-300">
          Comercial, empresas, planes, facturacion y control general del producto.
        </p>
      </div>
    </aside>
  );
}
