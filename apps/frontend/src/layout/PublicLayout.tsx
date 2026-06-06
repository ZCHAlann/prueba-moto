// src/layout/PublicLayout.tsx

import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { marketingContent, publicSettings } from "../data/public-content";

const publicLinks = [
  { label: "Beneficios", href: "/#beneficios" },
  { label: "Modulos", href: "/#modulos" },
  { label: "Planes", href: "/#planes" },
  { label: "FAQ", href: "/#faq" },
];

const footerLinks = [
  { label: "Ingresar", to: "/signin" },
  { label: "Solicitar demo", to: "/solicitar-demo" },
  { label: "Politica de privacidad", to: "/politica-privacidad" },
];

export default function PublicLayout() {
  const { getHomePath, isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lock body scroll when mobile menu open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Navbar ── */}
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
          scrolled
            ? "border-b border-white/10 bg-gray-950/80 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            <img
              src="/images/logo/logo.png"
              className="h-8"
              alt={`${publicSettings.brandName}`}
            />
          </Link>

          {/* Center links — desktop */}
          <nav className="hidden items-center gap-7 md:flex">
            {publicLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-gray-400 transition hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right CTAs — desktop */}
          <div className="hidden items-center gap-2 md:flex">
            {isAuthenticated ? (
              <Link
                to={getHomePath()}
                className="rounded-lg border border-emerald-500/60 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/10"
              >
                Abrir mi panel
              </Link>
            ) : (
              <Link
                to="/solicitar-demo"
                className="rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/5"
              >
                {marketingContent.heroPrimaryCta}
              </Link>
            )}
            <Link
              to="/signin"
              className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-950 transition hover:bg-gray-200"
            >
              {isAuthenticated ? "Cambiar acceso" : marketingContent.heroSecondaryCta}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Cerrar menu" : "Abrir menu"}
            aria-expanded={mobileOpen}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white md:hidden"
          >
            {mobileOpen ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu panel */}
        {mobileOpen && (
          <div className="border-t border-white/10 bg-gray-950/95 backdrop-blur-xl md:hidden">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-4">
              {publicLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-3 text-base font-medium text-gray-300 transition hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </a>
              ))}
              <div className="my-2 h-px w-full bg-white/10" />
              {isAuthenticated ? (
                <Link
                  to={getHomePath()}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg border border-emerald-500/60 px-3 py-3 text-center text-base font-medium text-emerald-300"
                >
                  Abrir mi panel
                </Link>
              ) : (
                <Link
                  to="/solicitar-demo"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg border border-white/20 px-3 py-3 text-center text-base font-medium text-white"
                >
                  {marketingContent.heroPrimaryCta}
                </Link>
              )}
              <Link
                to="/signin"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg bg-white px-3 py-3 text-center text-base font-medium text-gray-950"
              >
                {isAuthenticated ? "Cambiar acceso" : marketingContent.heroSecondaryCta}
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Spacer to offset the fixed navbar */}
      <div aria-hidden="true" className="h-16" />

      {/* ── Page content ── */}
      <main>
        <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 bg-gray-950">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 md:grid-cols-3 lg:px-6">
          {/* Col 1 — Branding */}
          <div>
            <img
              src="/images/logo/logo.png"
              className="h-8"
              alt={publicSettings.brandName}
            />
            <p className="mt-4 text-sm leading-6 text-gray-400">{marketingContent.footerTagline}</p>
          </div>

          {/* Col 2 — Accesos */}
          <div>
            <p className="text-sm font-semibold text-white">Accesos</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-400">
              {footerLinks.map((link) => (
                <li key={link.to}>
                  <NavLink to={link.to} className="transition hover:text-white">
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — Contacto */}
          <div>
            <p className="text-sm font-semibold text-white">Contacto</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-400">
              <li>
                <a href={`mailto:${publicSettings.supportEmail}`} className="transition hover:text-white">
                  {publicSettings.supportEmail}
                </a>
              </li>
              <li>
                <a href={`tel:${publicSettings.supportPhone.replace(/\s/g, "")}`} className="transition hover:text-white">
                  {publicSettings.supportPhone}
                </a>
              </li>
              <li>{publicSettings.publicUrl}</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-gray-500 sm:flex-row lg:px-6">
            <p>
              &copy; {new Date().getFullYear()} {publicSettings.brandName}. Todos los derechos reservados.
            </p>
            <p>{publicSettings.brandTagline}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
