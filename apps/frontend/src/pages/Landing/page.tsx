// src/pages/Landing/page.tsx
// Landing interactiva con animaciones de verdad: 3D tilt en cards, shine en CTAs,
// scan effect en stats, fondo con grid parallax, navbar progress bar, y reveal
// al scroll. Inspirado en la plantilla Redsun, con acento verde esmeralda.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import LaptopMockup from "../../components/landing/LaptopMockup";
import CountUp from "../../components/landing/CountUp";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import { faqs, flyers, marketingContent, testimonials } from "../../data/public-content";
import { usePublicPlans } from "../../hooks/usePlatformPlans";
import type { PublicPlan } from "../../types/platform";

/* -------------------------------------------------------------------------- */
/*                              Reveal primitive                              */
/* -------------------------------------------------------------------------- */

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: keyof React.JSX.IntrinsicElements;
}

function Reveal({ children, className = "", delay = 0, as = "div" }: RevealProps) {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>({ threshold: 0.12 });
  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        isVisible ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-6 blur-sm"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

/* -------------------------------------------------------------------------- */
/*                              3D Tilt Card Hook                              */
/* -------------------------------------------------------------------------- */

function useTilt3D<T extends HTMLElement>(strength: number = 8) {
  const ref = useRef<T>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const onMouseMove = (e: React.MouseEvent<T>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * strength;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -strength;
    setTilt({ x, y });
  };
  const onMouseLeave = () => setTilt({ x: 0, y: 0 });

  return { ref, tilt, onMouseMove, onMouseLeave };
}

/* -------------------------------------------------------------------------- */
/*                              Scroll Progress Bar                           */
/* -------------------------------------------------------------------------- */

function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? (scrollTop / docHeight) * 100 : 0);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-cyan-400 transition-[width] duration-150"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Shine Button                                  */
/* -------------------------------------------------------------------------- */

function ShineButton({
  to,
  children,
  variant = "primary",
}: {
  to: string;
  children: React.ReactNode;
  variant?: "primary" | "outline";
}) {
  const base =
    "group relative inline-flex items-center justify-center overflow-hidden rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-300";
  const styles =
    variant === "primary"
      ? "bg-emerald-500 text-gray-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 hover:shadow-emerald-400/40 hover:-translate-y-0.5"
      : "border border-white/20 bg-white/[0.02] text-white hover:bg-white/5 hover:border-white/30 hover:-translate-y-0.5";
  return (
    <Link to={to} className={`${base} ${styles}`}>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      {/* Shine sweep on hover */}
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Page                                      */
/* -------------------------------------------------------------------------- */

export default function LandingPage() {
  return (
    <>
      <ScrollProgress />
      <HeroSection />
      <LaptopSection />
      <StatsSection />
      <BenefitsSection />
      <FeaturesSection />
      <FlyersSection />
      <TestimonialsSection />
      <PricingSection />
      <FaqSection />
      <CtaSection />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Hero                                      */
/* -------------------------------------------------------------------------- */

function HeroSection() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Reactive background grid that follows mouse
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX / window.innerWidth - 0.5) * 30,
        y: (e.clientY / window.innerHeight - 0.5) * 30,
      });
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  return (
    <section
      id="hero"
      className="relative flex min-h-[calc(100vh-4rem)] items-start overflow-hidden bg-gray-950 pb-16 pt-2 md:pb-20 md:pt-0"
    >
      {/* Reactive dot grid background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: `radial-gradient(circle at center, rgba(16,185,129,0.15) 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
          transform: `translate(${mousePos.x}px, ${mousePos.y}px)`,
          transition: "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />

      {/* Radial gradient center */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.18),_transparent_55%)]"
      />

      {/* Top divider */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
      />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-start gap-10 px-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10 lg:px-6">
        {/* Left column — text (slides in from the left, with stagger) */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center text-center lg:items-start lg:text-left"
        >
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Control vehicular y equipos de campo
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 max-w-xl text-balance text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl lg:text-5xl xl:text-6xl"
          >
            {marketingContent.heroTitle}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.1, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 max-w-md text-pretty text-base text-gray-300 sm:text-lg"
          >
            {marketingContent.heroSubtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-7 flex flex-col items-center gap-3 sm:flex-row lg:items-start"
          >
            <ShineButton to="/solicitar-demo" variant="primary">
              {marketingContent.heroPrimaryCta}
              <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </ShineButton>
            <ShineButton to="/signin" variant="outline">
              {marketingContent.heroSecondaryCta}
            </ShineButton>
          </motion.div>
        </motion.div>

        {/* Right column — fleet image (slides in from the right) */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-center"
        >
          <img
            src="/images/fleet-vans.png"
            alt="Camionetas de flota ApliSmart Motors"
            className="mx-auto block h-auto w-full max-w-md object-contain md:max-w-xl lg:max-w-3xl"
          />
        </motion.div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Laptop mockup                                */
/* -------------------------------------------------------------------------- */

function LaptopSection() {
  return (
    <section className="relative overflow-hidden bg-gray-950 pb-20 pt-12 md:pb-28 md:pt-20">
      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 lg:px-6">
        <LaptopMockup />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Stats                                      */
/* -------------------------------------------------------------------------- */

interface Stat {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
}

const stats: Stat[] = [
  { value: 500, prefix: "+", label: "Vehiculos gestionados" },
  { value: 98, suffix: "%", label: "Uptime garantizado" },
  { value: 24, suffix: "/7", label: "Monitoreo continuo" },
  { value: 50, prefix: "+", label: "Empresas confiando" },
];

function StatsSection() {
  return (
    <section id="stats" className="relative border-y border-white/5 bg-gray-900/30 py-14">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-8 px-4 sm:grid-cols-4 lg:px-6">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 100}>
            <StatCard stat={s} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function StatCard({ stat }: { stat: Stat }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="group relative text-center">
      {/* Scan light effect */}
      {isVisible && (
        <div
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-lg"
          aria-hidden="true"
        >
          <div className="absolute inset-y-0 -left-full w-1/2 animate-[scan_2s_ease-out_forwards] bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
        </div>
      )}
      <p className="text-4xl font-bold text-emerald-400 transition-all group-hover:scale-110 sm:text-5xl">
        <CountUp
          end={stat.value}
          prefix={stat.prefix ?? ""}
          suffix={stat.suffix ?? ""}
          duration={2000}
        />
      </p>
      <p className="mt-2 text-xs font-medium uppercase tracking-wider text-gray-400 sm:text-sm">
        {stat.label}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Benefits                                     */
/* -------------------------------------------------------------------------- */

const benefits = [
  {
    title: "Flota vehicular",
    description: "Camionetas, autos y camiones en control diario con mantenimiento, combustible y alertas.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
        <path d="M3 13l2-5h14l2 5M3 13v6h2v-2h14v2h2v-6M3 13h18" />
        <circle cx="7" cy="17" r="1.5" fill="currentColor" />
        <circle cx="17" cy="17" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: "Motores y generadores",
    description: "Equipos críticos con seguimiento de estado, mantenimiento y alertas en tiempo real.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
        <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>
    ),
  },
  {
    title: "Operación de campo",
    description: "Conductores, sedes, combustible y checklist en una sola vista operativa.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
];

function BenefitsSection() {
  return (
    <section id="beneficios" className="bg-gray-950 py-20 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 lg:px-6">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">
              {marketingContent.trustTitle}
            </h2>
            <p className="mt-4 text-base text-gray-400 sm:text-lg">
              {marketingContent.trustSubtitle}
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b, i) => (
            <Reveal key={b.title} delay={i * 120}>
              <TiltCard className="group h-full rounded-2xl border border-white/10 bg-gray-900/50 p-8 backdrop-blur-sm transition-all duration-500 hover:border-emerald-500/50 hover:bg-gray-900/70 hover:shadow-2xl hover:shadow-emerald-500/10">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 transition-all duration-500 group-hover:scale-110 group-hover:bg-emerald-500/20 group-hover:shadow-lg group-hover:shadow-emerald-500/30">
                  {b.icon}
                </div>
                <h3 className="mt-5 text-xl font-semibold text-white">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{b.description}</p>
                {/* Arrow that appears on hover */}
                <div className="mt-4 flex items-center gap-1 text-sm font-medium text-emerald-400 opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100">
                  Conocer más
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Tilt Card                                     */
/* -------------------------------------------------------------------------- */

function TiltCard({
  children,
  className = "",
  strength = 6,
}: {
  children: React.ReactNode;
  className?: string;
  strength?: number;
}) {
  const { ref, tilt, onMouseMove, onMouseLeave } = useTilt3D<HTMLDivElement>(strength);
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={className}
      style={{
        transform: `perspective(1000px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
        transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Features                                      */
/* -------------------------------------------------------------------------- */

const features = [
  {
    badge: "Control total",
    title: "Todo tu parque automotor en una sola vista",
    description:
      "Camionetas, camiones, motores y generadores con mantenimiento, combustible, alertas y disponibilidad en tiempo real.",
    bullets: ["Estado en tiempo real", "Historial completo", "Asignación por sede y responsable"],
    image: flyers[0]?.imageUrl ?? "",
  },
  {
    badge: "Mantenimiento inteligente",
    title: "Adelántate a las fallas, no las persigas",
    description:
      "Alertas automáticas por kilometraje, horas de uso o checklists vencidos. Tu equipo sabe qué hacer antes de que pase.",
    bullets: ["Alertas configurables", "Checklist por equipo", "Reprogramación de servicios"],
    image: flyers[1]?.imageUrl ?? "",
  },
  {
    badge: "Reportes claros",
    title: "Datos que se traducen en decisiones",
    description:
      "Reportes operativos y financieros que tu gerencia entiende. Exporta a Excel o comparte por correo en un click.",
    bullets: ["Reportes automáticos", "Exportación a Excel", "Comparativas por periodo"],
    image: flyers[2]?.imageUrl ?? "",
  },
];

function FeaturesSection() {
  return (
    <section id="features" className="bg-gray-950 py-20 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 lg:px-6">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/20">
              Funcionalidades
            </span>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl md:text-5xl">
              {marketingContent.differentiatorTitle}
            </h2>
            <p className="mt-4 text-base text-gray-400 sm:text-lg">
              {marketingContent.differentiatorSubtitle}
            </p>
          </div>
        </Reveal>

        <div className="mt-16 space-y-20">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 80}>
              <div
                className={`grid items-center gap-10 lg:gap-16 ${
                  i % 2 === 0 ? "lg:grid-cols-2" : "lg:grid-cols-2"
                }`}
              >
                {/* Image */}
                <div
                  className={`relative overflow-hidden rounded-2xl border border-white/10 transition-all duration-500 hover:border-emerald-500/40 hover:shadow-2xl hover:shadow-emerald-500/10 ${
                    i % 2 === 1 ? "lg:order-2" : ""
                  }`}
                >
                  <img
                    src={f.image}
                    alt={f.title}
                    loading="lazy"
                    className="h-72 w-full object-cover transition-transform duration-700 hover:scale-110 lg:h-96"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-transparent to-transparent" />
                </div>
                {/* Text */}
                <div>
                  <span className="inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/20">
                    {f.badge}
                  </span>
                  <h3 className="mt-4 text-2xl font-bold text-white sm:text-3xl">{f.title}</h3>
                  <p className="mt-3 text-base text-gray-400">{f.description}</p>
                  <ul className="mt-5 space-y-2">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-gray-300">
                        <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Flyers                                        */
/* -------------------------------------------------------------------------- */

function FlyersSection() {
  return (
    <section id="modulos" className="border-y border-white/5 bg-gray-900/30 py-20 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 lg:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {flyers.map((f, i) => (
            <Reveal key={f.id} delay={i * 120}>
              <TiltCard strength={5} className="group h-full">
                <div className="relative h-96 overflow-hidden rounded-2xl border border-white/10">
                  <img
                    src={f.imageUrl}
                    alt={f.title}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/70 to-transparent" />
                  <div className="relative flex h-full flex-col justify-end p-6">
                    <span className="mb-2 inline-flex w-fit rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30">
                      {f.audience}
                    </span>
                    <h3 className="text-xl font-bold text-white">{f.title}</h3>
                    <p className="mt-1 text-sm text-gray-300">{f.subtitle}</p>
                    <Link
                      to={f.ctaHref}
                      className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-semibold text-emerald-300 transition group-hover:gap-2"
                    >
                      {f.ctaLabel}
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M13 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Testimonials                                  */
/* -------------------------------------------------------------------------- */

function TestimonialsSection() {
  return (
    <section className="bg-gray-950 py-20 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 lg:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          {testimonials.map((t, i) => (
            <Reveal key={t.id} delay={i * 120}>
              <TiltCard strength={4} className="group h-full rounded-2xl border border-white/10 bg-gray-900/50 p-8 backdrop-blur-sm transition-all hover:border-emerald-500/40 hover:shadow-2xl hover:shadow-emerald-500/5">
                <svg viewBox="0 0 24 24" className="h-10 w-10 fill-emerald-400/30 transition-all group-hover:fill-emerald-400/50" aria-hidden="true">
                  <path d="M9 7H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v3l4-3v-6a2 2 0 0 0-2-2zm10 0h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v3l4-3v-6a2 2 0 0 0-2-2z" />
                </svg>
                <p className="mt-4 text-lg leading-relaxed text-gray-200">"{t.quote}"</p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.role}, {t.company}</p>
                  </div>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Pricing                                       */
/* -------------------------------------------------------------------------- */

interface PlanCardData {
  id: string;
  name: string;
  description: string;
  price: string;
  features: string[];
  popular?: boolean;
}

// Fallback mientras no llegan los planes de la API (offline / 1ra carga)
const FALLBACK_PLANS: PlanCardData[] = [
  {
    id: "starter", name: "Starter", price: "29",
    description: "Para equipos pequeños que recién ordenan su operación.",
    features: [
      "Hasta 10 usuarios y 30 vehículos",
      "Gestión de flotas y conductores",
      "Combustible y alertas básicas",
      "Reportes operativos estándar",
    ],
  },
  {
    id: "pro", name: "Pro", price: "89", popular: true,
    description: "El más elegido. Para empresas con varias sedes.",
    features: [
      "Hasta 30 usuarios y 200 vehículos",
      "Mantenimiento y checklist",
      "Autorizaciones de salida con IA",
      "Motores, generadores y aires acondicionados",
    ],
  },
  {
    id: "business", name: "Business", price: "199",
    description: "Operaciones grandes con caja chica, finanzas y roles a medida.",
    features: [
      "Hasta 100 usuarios y 1000 vehículos",
      "Finanzas: facturas, caja chica y transacciones",
      "Roles personalizados por empresa",
      "Asistente IA Jarvis",
    ],
  },
  {
    id: "enterprise", name: "Enterprise", price: "499",
    description: "Todo habilitado + soporte dedicado.",
    features: [
      "Usuarios y activos ilimitados",
      "Onboarding dedicado y gerente de cuenta",
      "SLA personalizado",
      "White-label opcional",
    ],
  },
];

function fmtMoney(n: string | number | undefined | null): string {
  if (n === null || n === undefined) return "0";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "0";
  if (num === 0) return "0";
  // si no es entero, mostrar 2 decimales
  return num.toLocaleString("es-EC", { minimumFractionDigits: num % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}

function publicPlanToCardData(plan: PublicPlan): PlanCardData {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: fmtMoney(plan.monthlyPrice),
    features: plan.features ?? [],
    popular: plan.isPopular,
  };
}

function PricingSection() {
  const { plans: livePlans, loading: plansLoading } = usePublicPlans();

  // Si por alguna razón la API no responde, mantenemos fallback mínimo
  const cards: PlanCardData[] =
    livePlans.length > 0
      ? livePlans.map(publicPlanToCardData)
      : FALLBACK_PLANS;

  return (
    <section id="planes" className="border-y border-white/5 bg-gray-900/30 py-20 md:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 lg:px-6">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">
              {marketingContent.plansTitle}
            </h2>
            <p className="mt-4 text-base text-gray-400 sm:text-lg">
              {marketingContent.plansSubtitle}
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((p, i) => (
            <Reveal key={p.id} delay={i * 100}>
              <TiltCard
                strength={5}
                className={`group relative h-full rounded-2xl border p-7 backdrop-blur-sm transition-all duration-500 ${
                  p.popular
                    ? "border-emerald-500/60 bg-gray-900/80 shadow-2xl shadow-emerald-500/10"
                    : "border-white/10 bg-gray-900/40 hover:border-emerald-500/40"
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-gray-950 shadow-lg shadow-emerald-500/30">
                    Más popular
                  </span>
                )}
                <h3 className="text-2xl font-bold text-white">{p.name}</h3>
                <p className="mt-2 text-sm text-gray-400">{p.description}</p>

                {/* Precio */}
                <div className="mt-6 flex items-baseline gap-1">
                  {Number(p.price) > 0 && <span className="text-base text-gray-400">$</span>}
                  <span className="text-3xl font-bold text-emerald-400">
                    {Number(p.price) > 0 ? p.price : "Gratis"}
                  </span>
                  {Number(p.price) > 0 && (
                    <span className="text-sm text-gray-400">/mes</span>
                  )}
                </div>

                <ul className="mt-6 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                      <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  to="/solicitar-demo"
                  className={`mt-8 block rounded-xl px-4 py-3 text-center text-sm font-semibold transition ${
                    p.popular
                      ? "bg-emerald-500 text-gray-950 hover:bg-emerald-400"
                      : "border border-white/20 text-white hover:bg-white/5"
                  }`}
                >
                  Solicitar demo
                </Link>
              </TiltCard>
            </Reveal>
          ))}
        </div>

        {plansLoading && cards.length === 0 && (
          <p className="mt-6 text-center text-xs text-gray-500">Cargando planes…</p>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                              FAQ                                           */
/* -------------------------------------------------------------------------- */

function FaqSection() {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section id="faq" className="bg-gray-950 py-20 md:py-28">
      <div className="mx-auto w-full max-w-3xl px-4 lg:px-6">
        <Reveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">
              {marketingContent.faqTitle}
            </h2>
            <p className="mt-4 text-base text-gray-400 sm:text-lg">
              {marketingContent.faqSubtitle}
            </p>
          </div>
        </Reveal>

        <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
          {faqs.map((faq, i) => {
            const open = openId === faq.id;
            return (
              <Reveal key={faq.id} delay={i * 60}>
                <div>
                  <button
                    onClick={() => setOpenId(open ? null : faq.id)}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left transition hover:text-emerald-300"
                    aria-expanded={open}
                  >
                    <span className="text-base font-medium text-white">{faq.question}</span>
                    <span
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/10 transition-all duration-500 ${
                        open ? "rotate-45 border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "text-gray-400"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-500 ease-in-out"
                    style={{
                      maxHeight: open ? "500px" : "0",
                      opacity: open ? 1 : 0,
                    }}
                  >
                    <p className="pb-5 pr-10 text-sm leading-relaxed text-gray-400">{faq.answer}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                              CTA                                           */
/* -------------------------------------------------------------------------- */

function CtaSection() {
  return (
    <section className="relative overflow-hidden bg-gray-950 py-20 md:py-28">
      {/* Background mesh */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.15),_transparent_60%)]"
      />

      <div className="relative mx-auto w-full max-w-5xl px-4 lg:px-6">
        <Reveal>
          <TiltCard
            strength={4}
            className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-gray-900 to-gray-900 p-10 text-center shadow-2xl shadow-emerald-500/10 md:p-16"
          >
            {/* Animated corner glows */}
            <div className="pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-full bg-emerald-500/30 blur-3xl animate-pulse" />
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-cyan-500/20 blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }} />

            <h2 className="relative text-3xl font-bold text-white sm:text-4xl md:text-5xl">
              Lleva el control de tu operación hoy
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-base text-gray-300 sm:text-lg">
              Solicita una demo y descubre cómo ApliSmart Motors te ayuda a
              tener tu flota, motores y generadores bajo control.
            </p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ShineButton to="/solicitar-demo" variant="primary">
                Solicitar demo
                <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </ShineButton>
              <ShineButton to="/signin" variant="outline">
                Ingresar
              </ShineButton>
            </div>
          </TiltCard>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Global keyframes                              */
/* -------------------------------------------------------------------------- */

// Inject keyframes once
if (typeof document !== "undefined") {
  const id = "landing-keyframes";
  if (!document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes scan {
        0% { left: -50%; }
        100% { left: 150%; }
      }
    `;
    document.head.appendChild(style);
  }
}
