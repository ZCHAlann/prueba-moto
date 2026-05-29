"use client";

import { useEffect, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { SectionHeading, SurfaceCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import type { MarketingFaq, MarketingFlyer, MarketingTestimonial, PublicContentSnapshot } from "@/types/platform";

const booleanOptions = [
  { value: "true", label: "Si" },
  { value: "false", label: "No" },
];

const flyerToneOptions = [
  { value: "teal", label: "Teal" },
  { value: "sky", label: "Sky" },
  { value: "amber", label: "Amber" },
  { value: "rose", label: "Rose" },
];

const flyerStatusOptions = [
  { value: "Activo", label: "Activo" },
  { value: "Borrador", label: "Borrador" },
];

const DEFAULT_FLYER_IMAGE = "https://images.pexels.com/photos/380769/pexels-photo-380769.jpeg?auto=compress&cs=tinysrgb&w=1400";

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No pudimos leer la imagen seleccionada."));
    reader.readAsDataURL(file);
  });
}

export function ContentPage() {
  const { confirmAction, notifyError } = useFeedback();
  const {
    marketingContent,
    faqs,
    flyers,
    testimonials,
    settings,
    savePublicContent,
  } = usePlatform();
  const [marketingForm, setMarketingForm] = useState(marketingContent);
  const [publicSettingsForm, setPublicSettingsForm] = useState(settings);
  const [faqDrafts, setFaqDrafts] = useState<MarketingFaq[]>(faqs);
  const [flyerDrafts, setFlyerDrafts] = useState<MarketingFlyer[]>(flyers);
  const [testimonialDrafts, setTestimonialDrafts] = useState<MarketingTestimonial[]>(testimonials);

  const buildPublicSnapshot = (): PublicContentSnapshot => ({
    marketingContent: marketingForm,
    faqs: faqDrafts,
    testimonials: testimonialDrafts,
    flyers: flyerDrafts,
    settings: {
      brandName: publicSettingsForm.brandName,
      brandTagline: publicSettingsForm.brandTagline,
      supportEmail: publicSettingsForm.supportEmail,
      supportPhone: publicSettingsForm.supportPhone,
      publicUrl: publicSettingsForm.publicUrl,
      defaultLanguage: publicSettingsForm.defaultLanguage,
      defaultTimezone: publicSettingsForm.defaultTimezone,
      allowDemoAccess: publicSettingsForm.allowDemoAccess,
      showPublicPricing: publicSettingsForm.showPublicPricing,
      rememberSessionDefault: publicSettingsForm.rememberSessionDefault,
    },
    updatedAt: new Date().toISOString(),
  });

  useEffect(() => {
    setMarketingForm(marketingContent);
  }, [marketingContent]);

  useEffect(() => {
    setPublicSettingsForm(settings);
  }, [settings]);

  useEffect(() => {
    setFaqDrafts(faqs);
  }, [faqs]);

  useEffect(() => {
    setFlyerDrafts(flyers);
  }, [flyers]);

  useEffect(() => {
    setTestimonialDrafts(testimonials);
  }, [testimonials]);

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Panel master"
        title="Contenido publico y branding"
        subtitle="Edicion del mensaje comercial, CTA, FAQ, testimonios y ajustes visibles de la landing."
        accent="cyan"
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <SurfaceCard className="p-4">
          <SectionHeading title="Mensaje comercial" description="Hero, diferenciales y bloques clave de la landing." />
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const confirmed = await confirmAction({
                title: "Guardar contenido comercial",
                description: "La landing publica reflejara inmediatamente el nuevo mensaje comercial.",
                confirmLabel: "Guardar contenido",
                accent: "cyan",
                successTitle: "Contenido actualizado",
                successDescription: "La capa publica ya quedo actualizada.",
                summary: [
                  { label: "Hero", value: marketingForm.heroTitle.slice(0, 50) },
                  { label: "CTA principal", value: marketingForm.heroPrimaryCta },
                  { label: "CTA secundario", value: marketingForm.heroSecondaryCta },
                ],
                action: async () => {
                  await savePublicContent(buildPublicSnapshot());
                },
              });
              if (!confirmed) {
                return;
              }
            }}
          >
            <InputField label="Hero title" value={marketingForm.heroTitle} onChange={(value) => setMarketingForm((current) => ({ ...current, heroTitle: value }))} accent="cyan" />
            <TextareaField label="Hero subtitle" value={marketingForm.heroSubtitle} onChange={(value) => setMarketingForm((current) => ({ ...current, heroSubtitle: value }))} accent="cyan" rows={4} />
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField label="CTA principal" value={marketingForm.heroPrimaryCta} onChange={(value) => setMarketingForm((current) => ({ ...current, heroPrimaryCta: value }))} accent="cyan" />
              <InputField label="CTA secundario" value={marketingForm.heroSecondaryCta} onChange={(value) => setMarketingForm((current) => ({ ...current, heroSecondaryCta: value }))} accent="cyan" />
            </div>
            <InputField label="Titulo de confianza" value={marketingForm.trustTitle} onChange={(value) => setMarketingForm((current) => ({ ...current, trustTitle: value }))} accent="cyan" />
            <TextareaField label="Subtitulo de confianza" value={marketingForm.trustSubtitle} onChange={(value) => setMarketingForm((current) => ({ ...current, trustSubtitle: value }))} accent="cyan" rows={3} />
            <InputField label="Titulo diferenciales" value={marketingForm.differentiatorTitle} onChange={(value) => setMarketingForm((current) => ({ ...current, differentiatorTitle: value }))} accent="cyan" />
            <TextareaField label="Subtitulo diferenciales" value={marketingForm.differentiatorSubtitle} onChange={(value) => setMarketingForm((current) => ({ ...current, differentiatorSubtitle: value }))} accent="cyan" rows={3} />
            <InputField label="Titulo planes" value={marketingForm.plansTitle} onChange={(value) => setMarketingForm((current) => ({ ...current, plansTitle: value }))} accent="cyan" />
            <TextareaField label="Subtitulo planes" value={marketingForm.plansSubtitle} onChange={(value) => setMarketingForm((current) => ({ ...current, plansSubtitle: value }))} accent="cyan" rows={3} />
            <InputField label="Titulo FAQ" value={marketingForm.faqTitle} onChange={(value) => setMarketingForm((current) => ({ ...current, faqTitle: value }))} accent="cyan" />
            <TextareaField label="Subtitulo FAQ" value={marketingForm.faqSubtitle} onChange={(value) => setMarketingForm((current) => ({ ...current, faqSubtitle: value }))} accent="cyan" rows={3} />
            <InputField label="Tagline footer" value={marketingForm.footerTagline} onChange={(value) => setMarketingForm((current) => ({ ...current, footerTagline: value }))} accent="cyan" />
            <div className="flex justify-end">
              <Button type="submit" tone="cyan" variant="solid">
                Guardar contenido
              </Button>
            </div>
          </form>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <SectionHeading title="Branding publico" description="Marca, soporte y opciones visibles de la capa publica." />
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const confirmed = await confirmAction({
                title: "Guardar branding publico",
                description: "Los cambios se aplicaran en header, footer y flujo comercial publico.",
                confirmLabel: "Guardar branding",
                accent: "cyan",
                successTitle: "Branding actualizado",
                successDescription: "La identidad publica ya quedo actualizada.",
                summary: [
                  { label: "Marca", value: publicSettingsForm.brandName },
                  { label: "Correo soporte", value: publicSettingsForm.supportEmail },
                  { label: "Demo visible", value: publicSettingsForm.allowDemoAccess ? "Si" : "No" },
                ],
                action: async () => {
                  await savePublicContent(buildPublicSnapshot());
                },
              });
              if (!confirmed) {
                return;
              }
            }}
          >
            <InputField label="Marca" value={publicSettingsForm.brandName} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, brandName: value }))} accent="cyan" />
            <InputField label="Tagline" value={publicSettingsForm.brandTagline} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, brandTagline: value }))} accent="cyan" />
            <InputField label="Correo soporte" type="email" value={publicSettingsForm.supportEmail} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, supportEmail: value }))} accent="cyan" />
            <InputField label="Telefono soporte" value={publicSettingsForm.supportPhone} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, supportPhone: value }))} accent="cyan" />
            <InputField label="URL publica" value={publicSettingsForm.publicUrl} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, publicUrl: value }))} accent="cyan" />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Mostrar pricing" value={String(publicSettingsForm.showPublicPricing)} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, showPublicPricing: value === "true" }))} accent="cyan" options={booleanOptions} />
              <SelectField label="Permitir demo" value={String(publicSettingsForm.allowDemoAccess)} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, allowDemoAccess: value === "true" }))} accent="cyan" options={booleanOptions} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Recordar sesion por defecto" value={String(publicSettingsForm.rememberSessionDefault)} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, rememberSessionDefault: value === "true" }))} accent="cyan" options={booleanOptions} />
              <InputField label="Idioma base" value={publicSettingsForm.defaultLanguage} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, defaultLanguage: value }))} accent="cyan" />
            </div>
            <InputField label="Zona horaria" value={publicSettingsForm.defaultTimezone} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, defaultTimezone: value }))} accent="cyan" />
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4">
              <p className="text-sm font-semibold text-neutral-950">Vista previa rapida</p>
              <p className="mt-2 text-base font-semibold text-neutral-950">{publicSettingsForm.brandName}</p>
              <p className="mt-1 text-sm text-neutral-600">{publicSettingsForm.brandTagline}</p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" tone="cyan" variant="solid">
                Guardar branding
              </Button>
            </div>
          </form>
        </SurfaceCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SurfaceCard className="p-4">
          <SectionHeading title="FAQ editable" description="Preguntas frecuentes visibles en la landing." />
          <div className="mt-4 space-y-4">
            {faqDrafts.map((faq, index) => (
              <div key={faq.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="grid gap-4">
                  <InputField
                    label={`Pregunta ${index + 1}`}
                    value={faq.question}
                    onChange={(value) =>
                      setFaqDrafts((current) =>
                        current.map((item) => (item.id === faq.id ? { ...item, question: value } : item))
                      )
                    }
                    accent="cyan"
                  />
                  <TextareaField
                    label="Respuesta"
                    value={faq.answer}
                    onChange={(value) =>
                      setFaqDrafts((current) =>
                        current.map((item) => (item.id === faq.id ? { ...item, answer: value } : item))
                      )
                    }
                    accent="cyan"
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button
                      tone="cyan"
                      variant="outline"
                      className="px-3 py-2"
                      onClick={async () => {
                        const confirmed = await confirmAction({
                          title: "Guardar FAQ",
                          description: "La respuesta se actualizara en la landing publica.",
                          confirmLabel: "Guardar FAQ",
                          accent: "cyan",
                          successTitle: "FAQ actualizada",
                          successDescription: "La seccion publica ya refleja el cambio.",
                          summary: [{ label: "Pregunta", value: faq.question.slice(0, 60) }],
                          action: async () => {
                            await savePublicContent(buildPublicSnapshot());
                          },
                        });
                        if (!confirmed) {
                          return;
                        }
                      }}
                    >
                      Guardar FAQ
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <SectionHeading title="Testimonios" description="Bloque de confianza visible para la parte comercial." />
          <div className="mt-4 space-y-4">
            {testimonialDrafts.map((testimonial, index) => (
              <div key={testimonial.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <InputField
                      label={`Nombre ${index + 1}`}
                      value={testimonial.name}
                      onChange={(value) =>
                        setTestimonialDrafts((current) =>
                          current.map((item) => (item.id === testimonial.id ? { ...item, name: value } : item))
                        )
                      }
                      accent="cyan"
                    />
                    <InputField
                      label="Cargo"
                      value={testimonial.role}
                      onChange={(value) =>
                        setTestimonialDrafts((current) =>
                          current.map((item) => (item.id === testimonial.id ? { ...item, role: value } : item))
                        )
                      }
                      accent="cyan"
                    />
                  </div>
                  <InputField
                    label="Empresa"
                    value={testimonial.company}
                    onChange={(value) =>
                      setTestimonialDrafts((current) =>
                        current.map((item) => (item.id === testimonial.id ? { ...item, company: value } : item))
                      )
                    }
                    accent="cyan"
                  />
                  <TextareaField
                    label="Testimonio"
                    value={testimonial.quote}
                    onChange={(value) =>
                      setTestimonialDrafts((current) =>
                        current.map((item) => (item.id === testimonial.id ? { ...item, quote: value } : item))
                      )
                    }
                    accent="cyan"
                    rows={4}
                  />
                  <div className="flex justify-end">
                    <Button
                      tone="cyan"
                      variant="outline"
                      className="px-3 py-2"
                      onClick={async () => {
                        const confirmed = await confirmAction({
                          title: "Guardar testimonio",
                          description: "El bloque de confianza publico mostrara la version actualizada.",
                          confirmLabel: "Guardar testimonio",
                          accent: "cyan",
                          successTitle: "Testimonio actualizado",
                          successDescription: "La landing ya refleja el nuevo contenido.",
                          summary: [{ label: "Autor", value: testimonial.name }],
                          action: async () => {
                            await savePublicContent(buildPublicSnapshot());
                          },
                        });
                        if (!confirmed) {
                          return;
                        }
                      }}
                    >
                      Guardar testimonio
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>

      <SurfaceCard className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            title="Flyers publicitarios"
            description="Promociones, servicios o mensajes comerciales visibles en landing y app movil."
          />
          <Button
            tone="cyan"
            variant="outline"
            className="px-3 py-2"
            onClick={() =>
              setFlyerDrafts((current) => [
                ...current,
                {
                  id: `flyer-${Date.now()}`,
                  title: "Nuevo flyer",
                  subtitle: "Describe aqui el servicio o producto a promocionar.",
                  audience: "Nueva audiencia",
                  ctaLabel: "Conocer mas",
                  ctaHref: "/solicitar-demo",
                  imageUrl: DEFAULT_FLYER_IMAGE,
                  tone: "teal",
                  status: "Borrador",
                },
              ])
            }
          >
            Agregar flyer
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          {flyerDrafts.map((flyer, index) => (
            <div key={flyer.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <InputField
                    label={`Titulo ${index + 1}`}
                    value={flyer.title}
                    onChange={(value) =>
                      setFlyerDrafts((current) =>
                        current.map((item) => (item.id === flyer.id ? { ...item, title: value } : item))
                      )
                    }
                    accent="cyan"
                  />
                  <InputField
                    label="Audiencia"
                    value={flyer.audience}
                    onChange={(value) =>
                      setFlyerDrafts((current) =>
                        current.map((item) => (item.id === flyer.id ? { ...item, audience: value } : item))
                      )
                    }
                    accent="cyan"
                  />
                  <SelectField
                    label="Tono"
                    value={flyer.tone}
                    onChange={(value) =>
                      setFlyerDrafts((current) =>
                        current.map((item) => (item.id === flyer.id ? { ...item, tone: value as MarketingFlyer["tone"] } : item))
                      )
                    }
                    accent="cyan"
                    options={flyerToneOptions}
                  />
                  <SelectField
                    label="Estado"
                    value={flyer.status}
                    onChange={(value) =>
                      setFlyerDrafts((current) =>
                        current.map((item) => (item.id === flyer.id ? { ...item, status: value as MarketingFlyer["status"] } : item))
                      )
                    }
                    accent="cyan"
                    options={flyerStatusOptions}
                  />
                </div>

                <TextareaField
                  label="Mensaje"
                  value={flyer.subtitle}
                  onChange={(value) =>
                    setFlyerDrafts((current) =>
                      current.map((item) => (item.id === flyer.id ? { ...item, subtitle: value } : item))
                    )
                  }
                  accent="cyan"
                  rows={3}
                />

                <div className="grid gap-4 sm:grid-cols-3">
                  <InputField
                    label="Texto CTA"
                    value={flyer.ctaLabel}
                    onChange={(value) =>
                      setFlyerDrafts((current) =>
                        current.map((item) => (item.id === flyer.id ? { ...item, ctaLabel: value } : item))
                      )
                    }
                    accent="cyan"
                  />
                  <InputField
                    label="Enlace CTA"
                    value={flyer.ctaHref}
                    onChange={(value) =>
                      setFlyerDrafts((current) =>
                        current.map((item) => (item.id === flyer.id ? { ...item, ctaHref: value } : item))
                      )
                    }
                    accent="cyan"
                  />
                  <InputField
                    label="URL imagen"
                    value={flyer.imageUrl}
                    onChange={(value) =>
                      setFlyerDrafts((current) =>
                        current.map((item) => (item.id === flyer.id ? { ...item, imageUrl: value } : item))
                      )
                    }
                    accent="cyan"
                  />
                </div>

                <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                  <p className="text-sm font-medium text-neutral-700">Subir imagen</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    Puedes cargar una imagen JPG, PNG o WEBP para reemplazar la URL actual del flyer.
                  </p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="mt-3 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-2 file:font-medium file:text-white hover:file:bg-cyan-700"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }

                      try {
                        const imageUrl = await readFileAsDataUrl(file);
                        setFlyerDrafts((current) =>
                          current.map((item) => (item.id === flyer.id ? { ...item, imageUrl } : item))
                        );
                      } catch (error) {
                        notifyError(
                          "No pudimos cargar la imagen",
                          error instanceof Error ? error.message : "Selecciona otra imagen e intenta nuevamente."
                        );
                      } finally {
                        event.target.value = "";
                      }
                    }}
                  />
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    tone="neutral"
                    variant="outline"
                    className="px-3 py-2"
                    onClick={() =>
                      setFlyerDrafts((current) => current.filter((item) => item.id !== flyer.id))
                    }
                  >
                    Eliminar
                  </Button>
                  <Button
                    tone="cyan"
                    variant="solid"
                    className="px-3 py-2"
                    onClick={async () => {
                      const confirmed = await confirmAction({
                        title: "Publicar flyer",
                        description: "Este flyer quedara disponible para la landing y la app movil.",
                        confirmLabel: "Publicar flyer",
                        accent: "cyan",
                        successTitle: "Flyer publicado",
                        successDescription: "La promocion ya forma parte del contenido publico.",
                        summary: [
                          { label: "Titulo", value: flyer.title },
                          { label: "Audiencia", value: flyer.audience },
                          { label: "Estado", value: flyer.status },
                        ],
                        action: async () => {
                          await savePublicContent(buildPublicSnapshot());
                        },
                      });
                      if (!confirmed) {
                        return;
                      }
                    }}
                  >
                    Guardar flyer
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}

