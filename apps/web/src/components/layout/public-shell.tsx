"use client";

import Link from "next/link";
import { AppLogo } from "@/components/layout/app-logo";
import { useAuth } from "@/components/providers/auth-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";

const publicLinks = [
  { label: "Beneficios", href: "/#beneficios" },
  { label: "Modulos", href: "/#modulos" },
  { label: "Planes", href: "/#planes" },
  { label: "FAQ", href: "/#faq" },
];

export function PublicShell({ children }: { children: React.ReactNode }) {
  const { settings, marketingContent } = usePlatform();
  const { session, getHomePath } = useAuth();

  return (
    <div className="min-h-screen bg-white text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <AppLogo
            href="/"
            name={settings.brandName}
            tagline={settings.brandTagline}
            theme="light"
            mark="full"
            showTagline={false}
            fullWidthClass="w-[190px] md:w-[220px]"
          />
          <nav className="hidden items-center gap-5 md:flex">
            {publicLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm font-medium text-neutral-600 transition hover:text-neutral-950">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {session ? (
              <Link href={getHomePath()} className="hidden sm:inline-flex">
                <Button tone="cyan" variant="outline" className="px-3 py-2">
                  Abrir mi panel
                </Button>
              </Link>
            ) : null}
            <Link href="/solicitar-demo" className="hidden sm:inline-flex">
              <Button tone="teal" variant="outline" className="px-3 py-2">
                {marketingContent.heroPrimaryCta}
              </Button>
            </Link>
            <Link href="/login" className="inline-flex">
              <Button tone="neutral" variant="solid" className="px-3 py-2">
                {session ? "Cambiar acceso" : marketingContent.heroSecondaryCta}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-neutral-200 bg-neutral-950 text-white">
        <div className="mx-auto grid w-full max-w-[1280px] gap-8 px-4 py-10 lg:grid-cols-[1.3fr_0.8fr_0.8fr] lg:px-6">
          <div>
            <AppLogo
              href="/"
              name={settings.brandName}
              tagline={marketingContent.footerTagline}
              theme="dark"
              mark="full"
              showTagline={false}
              fullWidthClass="w-[210px] md:w-[240px]"
            />
          </div>
          <div>
            <p className="text-sm font-semibold">Accesos</p>
            <div className="mt-3 space-y-2 text-sm text-zinc-300">
              <Link href="/login" className="block hover:text-white">Ingresar</Link>
              <Link href="/solicitar-demo" className="block hover:text-white">Solicitar demo</Link>
              <Link href="/forgot-password" className="block hover:text-white">Recuperar acceso</Link>
              <Link href="/politica-privacidad" className="block hover:text-white">Politica de privacidad</Link>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">Contacto</p>
            <div className="mt-3 space-y-2 text-sm text-zinc-300">
              <p>{settings.supportEmail}</p>
              <p>{settings.supportPhone}</p>
              <p>{settings.publicUrl}</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
