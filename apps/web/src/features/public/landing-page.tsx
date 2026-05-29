"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";

const landingImages = {
  hero: "https://images.pexels.com/photos/164634/pexels-photo-164634.jpeg?auto=compress&cs=tinysrgb&w=1800",
  fleet: "https://images.pexels.com/photos/164634/pexels-photo-164634.jpeg?auto=compress&cs=tinysrgb&w=1400",
  serviceVan: "https://images.pexels.com/photos/6174460/pexels-photo-6174460.jpeg?auto=compress&cs=tinysrgb&w=1400",
  generator: "https://images.pexels.com/photos/35042792/pexels-photo-35042792.jpeg?auto=compress&cs=tinysrgb&w=1400",
  engine: "https://images.pexels.com/photos/8985972/pexels-photo-8985972.jpeg?auto=compress&cs=tinysrgb&w=1400",
  logistics: "https://images.pexels.com/photos/164634/pexels-photo-164634.jpeg?auto=compress&cs=tinysrgb&w=1400",
};

const flyerImageFallbacks: Record<string, string> = {
  "flyer-isp": "https://images.pexels.com/photos/380769/pexels-photo-380769.jpeg?auto=compress&cs=tinysrgb&w=1400",
  "flyer-logistica": "https://images.pexels.com/photos/2199293/pexels-photo-2199293.jpeg?auto=compress&cs=tinysrgb&w=1400",
  "flyer-energia": "https://images.pexels.com/photos/35042792/pexels-photo-35042792.jpeg?auto=compress&cs=tinysrgb&w=1400",
};

function resolveFlyerImage(id: string, imageUrl: string) {
  if (!imageUrl.trim() || imageUrl.startsWith("/images/landing/")) {
    return flyerImageFallbacks[id] ?? landingImages.hero;
  }

  return imageUrl;
}

function FlyerImage({
  flyerId,
  title,
  imageUrl,
}: {
  flyerId: string;
  title: string;
  imageUrl: string;
}) {
  const [src, setSrc] = useState(resolveFlyerImage(flyerId, imageUrl));

  return (
    <Image
      src={src}
      alt={title}
      width={720}
      height={420}
      className="h-52 w-full object-cover"
      loading="lazy"
      sizes="(min-width: 1024px) 33vw, 100vw"
      unoptimized
      onError={() => {
        const fallback = flyerImageFallbacks[flyerId] ?? landingImages.hero;
        if (src !== fallback) {
          setSrc(fallback);
        }
      }}
    />
  );
}

const industries = [
  {
    title: "Empresas con flota vehicular",
    description:
      "Mejor control de camionetas, autos, camiones y unidades de apoyo para supervisar responsables, mantenimiento y disponibilidad.",
    image: landingImages.logistics,
    alt: "Camiones y vehiculos de distribucion en una operacion logistica",
  },
  {
    title: "Proveedores de internet y cuadrillas tecnicas",
    description:
      "Organiza vehiculos de servicio, tecnicos en campo, rutas, alertas y seguimiento diario para empresas con operacion de calle.",
    image: landingImages.serviceVan,
    alt: "Van de servicio para cuadrillas tecnicas y operaciones de campo",
  },
  {
    title: "Generadores y equipos de respaldo",
    description:
      "Mantiene control sobre generadores a motor, respaldo tradicional, mantenimientos, estado operativo y ubicacion por sede.",
    image: landingImages.generator,
    alt: "Generador industrial a motor con tablero electrico abierto",
  },
];

const differentiators = [
  "Mejor control de flota vehicular por sede, responsable y estado operativo.",
  "Seguimiento claro para motores y generadores sin perder contexto.",
  "Alertas, checklist, combustible y reportes en una experiencia simple.",
  "Informacion ordenada para operaciones, administracion y gerencia.",
];

const salesPillars = [
  {
    title: "Vehiculos de trabajo",
    detail: "Camionetas, autos, camiones y unidades de soporte en una sola vista.",
  },
  {
    title: "Motores y generadores",
    detail: "Equipos criticos controlados con historial, alertas y mantenimiento.",
  },
  {
    title: "Reportes y control",
    detail: "Checklist, combustible, asignaciones y reportes para tomar decisiones.",
  },
];

const visualModules = [
  {
    title: "Flotas, camionetas y camiones",
    detail: "Control de unidades, responsables, sedes, asignaciones y disponibilidad diaria.",
    image: landingImages.logistics,
    alt: "Flota de camiones y vehiculos operativos para empresas de distribucion",
  },
  {
    title: "Motores y mantenimiento",
    detail: "Historial tecnico, alertas, ordenes de trabajo y seguimiento por equipo.",
    image: landingImages.engine,
    alt: "Motor diesel y componentes mecanicos para mantenimiento",
  },
  {
    title: "Generadores electricos",
    detail: "Equipos de respaldo, capacidad, aceite, combustible, vencimientos y estado operativo.",
    image: landingImages.generator,
    alt: "Generador electrico industrial de respaldo",
  },
];

const heroVisuals = [
  {
    title: "Flota vehicular",
    detail: "Camionetas, autos y camiones en control diario.",
    image: landingImages.fleet,
    alt: "Camionetas y camiones de operacion",
  },
  {
    title: "Motores de apoyo",
    detail: "Motores de campo y respaldo con seguimiento tecnico.",
    image: landingImages.engine,
    alt: "Motor industrial de apoyo",
  },
  {
    title: "Generadores",
    detail: "Equipos de respaldo electrico y contingencia.",
    image: landingImages.generator,
    alt: "Generador electrico industrial",
  },
];

export function LandingPage() {
  const { marketingContent, modules, plans, testimonials, faqs, settings, flyers } = usePlatform();
  const featuredModules = modules.filter((module) =>
    ["flotas", "motores", "generadores", "mantenimiento", "alertas", "reportes", "combustible"].includes(module.key)
  );
  const activeFlyers = flyers.filter((flyer) => flyer.status === "Activo");
  const getPurchaseHref = (planId: string, checkoutUrl: string) =>
    checkoutUrl.trim().length > 0 ? checkoutUrl : `/solicitar-demo?intent=compra&plan=${encodeURIComponent(planId)}`;

  return (
    <div className="bg-white">
      <section className="relative min-h-[560px] overflow-hidden border-b border-neutral-200 text-white sm:min-h-[590px] lg:min-h-[620px]">
        <Image
          src={landingImages.hero}
          alt="Flota vehicular, equipos de campo y generadores operativos"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
          unoptimized
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,18,19,0.76)_0%,rgba(8,18,19,0.54)_46%,rgba(8,18,19,0.18)_100%)]" />
        <div className="mx-auto grid w-full max-w-[1280px] items-center gap-8 px-4 pb-10 pt-12 sm:pt-14 lg:min-h-[620px] lg:grid-cols-[0.92fr_0.78fr] lg:px-6">
          <div className="relative z-10 max-w-2xl">
            <span className="inline-flex rounded-lg bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/20">
              Control vehicular y equipos de campo
            </span>
            <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">{marketingContent.heroTitle}</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-100 sm:text-base">{marketingContent.heroSubtitle}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/solicitar-demo" className="inline-flex">
                <Button tone="teal" variant="solid" className="px-5 py-3 text-sm">
                  {marketingContent.heroPrimaryCta}
                </Button>
              </Link>
              <Link href="/login" className="inline-flex">
                <Button tone="neutral" variant="outline" className="border-white/30 bg-white/10 px-5 py-3 text-sm text-white hover:bg-white/20 hover:text-white">
                  {marketingContent.heroSecondaryCta}
                </Button>
              </Link>
            </div>

            <div className="mt-10 flex flex-col items-center sm:items-start">
              <h3 className="text-lg font-bold text-white mb-1 text-center sm:text-left">Lleva ApliSmart en Dispositivo Movil.</h3>
              <p className="text-sm font-medium text-zinc-400 mb-5 text-center sm:text-left">Descarga la App:</p>
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-[320px] sm:max-w-none">
                <a 
                  href="/downloads/aplismart-motors.apk" 
                  className="flex items-center justify-center gap-3 rounded-2xl bg-[#3DDC84] px-6 py-4 text-lg font-bold text-slate-900 transition-transform hover:scale-105 shadow-[0_0_20px_rgba(61,220,132,0.3)] w-full sm:w-auto"
                >
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.6 9.28l1.84-3.18c.16-.27.07-.62-.2-.78-.27-.16-.62-.07-.78.2l-1.9 3.28C15.2 8.21 13.66 7.8 12 7.8s-3.2.41-4.56 1.02L5.54 5.54c-.16-.27-.51-.36-.78-.2-.27.16-.36.51-.2.78l1.84 3.18C3.76 10.74 2 13.68 2 17h20c0-3.32-1.76-6.26-4.4-7.72zM8.25 14.5c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25zm7.5 0c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z"/>
                  </svg>
                  Android
                </a>
                <a 
                  href="/downloads/aplismart-motors.ipa" 
                  className="flex items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 text-lg font-bold text-slate-950 transition-transform hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.2)] w-full sm:w-auto"
                >
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.365 2.052c.866-1.056 1.448-2.583 1.288-4.104-1.32.053-2.915.879-3.805 1.954-.795.94-1.488 2.502-1.298 3.992 1.483.115 2.951-.784 3.815-1.842zm-1.826 4.316c-1.385-.028-2.656.848-3.37.848-.716 0-1.765-.795-2.911-.773-1.492.023-2.871.868-3.639 2.197-1.558 2.698-.398 6.689 1.117 8.878.739 1.066 1.611 2.253 2.766 2.213 1.118-.042 1.545-.722 2.906-.722 1.357 0 1.745.722 2.927.697 1.198-.024 1.94-.1087 2.655-2.148 1.157-1.688 1.632-3.327 1.656-3.411-.035-.015-3.197-1.226-3.23-4.88-.029-3.053 2.49-4.521 2.607-4.593-1.428-2.091-3.631-2.378-4.484-2.406z"/>
                  </svg>
                  iOS
                </a>
              </div>
            </div>
            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              {salesPillars.map((pillar) => (
                <div key={pillar.title} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-sm">
                  <p className="text-sm font-semibold">{pillar.title}</p>
                  <p className="mt-1 hidden text-xs leading-5 text-zinc-100 sm:block">{pillar.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:hidden">
              {heroVisuals.map((visual) => (
                <article key={visual.title} className="overflow-hidden rounded-lg border border-white/15 bg-black/20 backdrop-blur-sm">
                  <Image
                    src={visual.image}
                    alt={visual.alt}
                    width={360}
                    height={220}
                    unoptimized
                    className="h-28 w-full object-cover"
                  />
                  <div className="p-3">
                    <p className="text-sm font-semibold text-white">{visual.title}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-100">{visual.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="relative z-10 hidden lg:grid lg:grid-cols-2 lg:gap-4">
            <article className="overflow-hidden rounded-lg border border-white/15 bg-black/20 shadow-lg backdrop-blur-sm lg:col-span-2">
              <Image
                src={heroVisuals[0].image}
                alt={heroVisuals[0].alt}
                width={960}
                height={520}
                unoptimized
                className="h-56 w-full object-cover"
              />
              <div className="p-4">
                <p className="text-lg font-semibold text-white">{heroVisuals[0].title}</p>
                <p className="mt-1 text-sm leading-6 text-zinc-100">{heroVisuals[0].detail}</p>
              </div>
            </article>
            {heroVisuals.slice(1).map((visual) => (
              <article key={visual.title} className="overflow-hidden rounded-lg border border-white/15 bg-black/20 shadow-lg backdrop-blur-sm">
                <Image
                  src={visual.image}
                  alt={visual.alt}
                  width={480}
                  height={340}
                  unoptimized
                  className="h-40 w-full object-cover"
                />
                <div className="p-4">
                  <p className="text-base font-semibold text-white">{visual.title}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-100">{visual.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="beneficios" className="border-b border-neutral-200 bg-white">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-16 lg:px-6">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-lg bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Beneficios clave</span>
            <h2 className="mt-4 text-3xl font-bold text-neutral-950">{marketingContent.trustTitle}</h2>
            <p className="mt-3 text-base leading-7 text-neutral-900">{marketingContent.trustSubtitle}</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredModules.map((module) => (
              <article key={module.key} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
                <span className="inline-flex rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200">{module.category}</span>
                <h3 className="mt-4 text-lg font-semibold text-neutral-950">{module.name}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-900">{module.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="modulos" className="border-b border-neutral-200 bg-neutral-50">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-16 lg:px-6">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <span className="inline-flex rounded-lg bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">Modulos principales</span>
              <h2 className="mt-4 text-3xl font-bold text-neutral-950">{marketingContent.differentiatorTitle}</h2>
              <p className="mt-3 text-base leading-7 text-neutral-900">{marketingContent.differentiatorSubtitle}</p>
              <div className="mt-6 space-y-3">
                {differentiators.map((item) => (
                  <div key={item} className="flex gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-sm">
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <p className="text-sm leading-6 text-neutral-900">{item}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4">
              {visualModules.map((module) => (
                <article key={module.title} className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
                  <div className="grid sm:grid-cols-[190px_1fr]">
                    <Image
                      src={module.image}
                      alt={module.alt}
                      width={480}
                      height={320}
                      className="h-48 w-full object-cover sm:h-full"
                      loading="lazy"
                      sizes="(min-width: 640px) 190px, 100vw"
                      unoptimized
                    />
                    <div className="p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-900">Operacion real</p>
                      <h3 className="mt-2 text-xl font-semibold text-neutral-950">{module.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-neutral-900">{module.detail}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-16 lg:px-6">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-lg bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Casos de uso</span>
            <h2 className="mt-4 text-3xl font-bold text-neutral-950">Sectores donde ApliSmart Motors aporta valor desde el primer dia</h2>
            <p className="mt-3 text-base leading-7 text-neutral-900">
              Ideal para empresas con flota vehicular, cuadrillas de servicio, motores de apoyo y generadores de respaldo.
            </p>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {industries.map((industry) => (
              <article key={industry.title} className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
                <Image
                  src={industry.image}
                  alt={industry.alt}
                  width={720}
                  height={420}
                  className="h-52 w-full object-cover"
                  loading="lazy"
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  unoptimized
                />
                <div className="p-5">
                  <h3 className="text-xl font-semibold text-neutral-950">{industry.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-900">{industry.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {activeFlyers.length > 0 ? (
        <section className="border-b border-neutral-200 bg-neutral-950 text-white">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-16 lg:px-6">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-200">Promociones y servicios</span>
              <h2 className="mt-4 text-3xl font-bold">Campanas visibles para tus clientes y aliados</h2>
              <p className="mt-3 text-base leading-7 text-zinc-200">
                Usa el panel master para publicar flyers comerciales y mostrar servicios, productos o novedades de ApliSmart Motors.
              </p>
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {activeFlyers.map((flyer) => (
                <article key={flyer.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/5 shadow-xl backdrop-blur-sm">
                  <FlyerImage flyerId={flyer.id} title={flyer.title} imageUrl={flyer.imageUrl} />
                  <div className="p-5">
                    <span className="inline-flex rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">{flyer.audience}</span>
                    <h3 className="mt-3 text-xl font-semibold text-white">{flyer.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-200">{flyer.subtitle}</p>
                    <div className="mt-5">
                      <Link href={flyer.ctaHref} className="inline-flex">
                        <Button tone="teal" variant="solid" className="px-4 py-3">
                          {flyer.ctaLabel}
                        </Button>
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section id="planes" className="border-b border-neutral-200 bg-neutral-50">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-16 lg:px-6">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-lg bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-700">Planes</span>
            <h2 className="mt-4 text-3xl font-bold text-neutral-950">{marketingContent.plansTitle}</h2>
            <p className="mt-3 text-base leading-7 text-neutral-900">{marketingContent.plansSubtitle}</p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <article key={plan.id} className={`rounded-lg border bg-white p-5 shadow-sm ${plan.id === "pro" ? "border-cyan-300 ring-2 ring-cyan-100" : "border-neutral-200"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-neutral-950">{plan.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-neutral-900">{plan.description}</p>
                  </div>
                  {plan.id === "pro" ? <span className="rounded-lg bg-cyan-100 px-2.5 py-1 text-xs font-semibold text-cyan-700">Mas elegido</span> : null}
                </div>
                <div className="mt-6">
                  <p className="text-2xl font-bold text-neutral-950">{plan.monthlyPrice}</p>
                  <p className="mt-1 text-sm text-neutral-900">Anual: {plan.annualPrice}</p>
                </div>
                <div className="mt-6 space-y-2 text-sm text-neutral-900">
                  <p>{plan.limits.users}</p>
                  <p>{plan.limits.assets}</p>
                  <p>{plan.limits.sites}</p>
                </div>
                <div className="mt-6 space-y-2">
                  {plan.modules.slice(0, 5).map((moduleKey) => {
                    const moduleEntry = modules.find((item) => item.key === moduleKey);
                    return <p key={moduleKey} className="text-sm text-neutral-900">- {moduleEntry?.name ?? moduleKey}</p>;
                  })}
                </div>
                <div className="mt-8">
                  <div className="grid gap-2">
                    <Link
                      href={getPurchaseHref(plan.id, plan.checkoutUrl)}
                      className="inline-flex w-full"
                      target={plan.checkoutUrl.trim() ? "_blank" : undefined}
                      rel={plan.checkoutUrl.trim() ? "noreferrer" : undefined}
                    >
                      <Button tone={plan.id === "pro" ? "teal" : "neutral"} variant="solid" className="w-full px-4 py-3">
                        Comprar
                      </Button>
                    </Link>
                    <Link href={`/solicitar-demo?intent=demo&plan=${encodeURIComponent(plan.id)}`} className="inline-flex w-full">
                      <Button tone={plan.id === "pro" ? "teal" : "neutral"} variant="outline" className="w-full px-4 py-3">
                        Solicitar demo
                      </Button>
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-4 py-16 lg:grid-cols-[1fr_1fr] lg:px-6">
          <div>
            <span className="inline-flex rounded-lg bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">Confianza</span>
            <h2 className="mt-4 text-3xl font-bold text-neutral-950">Empresas que quieren ordenar su operacion diaria</h2>
            <div className="mt-6 space-y-4">
              {testimonials.map((testimonial) => (
                <article key={testimonial.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-5">
                  <p className="text-base leading-7 text-neutral-700">&ldquo;{testimonial.quote}&rdquo;</p>
                  <p className="mt-4 text-sm font-semibold text-neutral-950">{testimonial.name}</p>
                  <p className="text-sm text-neutral-900">{testimonial.role} - {testimonial.company}</p>
                </article>
              ))}
            </div>
          </div>
          <div id="faq">
            <span className="inline-flex rounded-lg bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">FAQ</span>
            <h2 className="mt-4 text-3xl font-bold text-neutral-950">{marketingContent.faqTitle}</h2>
            <p className="mt-3 text-base leading-7 text-neutral-900">{marketingContent.faqSubtitle}</p>
            <div className="mt-6 space-y-4">
              {faqs.map((faq) => (
                <article key={faq.id} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-neutral-950">{faq.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-900">{faq.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-neutral-950 text-white">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-start gap-5 px-4 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-emerald-300">{settings.brandName}</p>
            <h2 className="mt-3 text-3xl font-bold">Listo para organizar la operacion de tu empresa.</h2>
            <p className="mt-3 text-base leading-7 text-zinc-300">
              Solicita una demo y conoce una plataforma pensada para flota vehicular, motores, generadores y trabajo diario en campo.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/solicitar-demo" className="inline-flex">
              <Button tone="teal" variant="solid" className="px-5 py-3">Solicitar demo</Button>
            </Link>
            <Link href="/login" className="inline-flex">
              <Button tone="neutral" variant="outline" className="border-white/20 bg-white/10 px-5 py-3 text-white hover:bg-white/20 hover:text-white">Entrar al portal</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
