"use client";

import { useEffect, useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { EmptyState, SectionHeading, StatCard, SurfaceCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import type { MarketingFlyer, PublicContentSnapshot } from "@/types/platform";

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

function createFlyer(): MarketingFlyer {
  return {
    id: `flyer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: "Nuevo flyer",
    subtitle: "Describe aqui la promocion, servicio o anuncio destacado para la app movil.",
    audience: "Usuarios operativos",
    ctaLabel: "Conocer mas",
    ctaHref: "/solicitar-demo",
    imageUrl: DEFAULT_FLYER_IMAGE,
    tone: "teal",
    status: "Borrador",
  };
}

export function MobileFlyersManager({ showHeader = false }: { showHeader?: boolean }) {
  const { confirmAction, notifyError } = useFeedback();
  const {
    marketingContent,
    faqs,
    flyers,
    testimonials,
    settings,
    savePublicContent,
  } = usePlatform();
  const [flyerDrafts, setFlyerDrafts] = useState<MarketingFlyer[]>(flyers);

  useEffect(() => {
    setFlyerDrafts(flyers);
  }, [flyers]);

  const activeCount = useMemo(
    () => flyerDrafts.filter((flyer) => flyer.status === "Activo").length,
    [flyerDrafts]
  );
  const draftCount = useMemo(
    () => flyerDrafts.filter((flyer) => flyer.status === "Borrador").length,
    [flyerDrafts]
  );

  const buildPublicSnapshot = (): PublicContentSnapshot => ({
    marketingContent,
    faqs,
    testimonials,
    flyers: flyerDrafts,
    settings: {
      brandName: settings.brandName,
      brandTagline: settings.brandTagline,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone,
      publicUrl: settings.publicUrl,
      defaultLanguage: settings.defaultLanguage,
      defaultTimezone: settings.defaultTimezone,
      allowDemoAccess: settings.allowDemoAccess,
      showPublicPricing: settings.showPublicPricing,
      rememberSessionDefault: settings.rememberSessionDefault,
    },
    updatedAt: new Date().toISOString(),
  });

  const saveFlyers = async (summaryTitle: string, summaryCount: string) => {
    if (!flyerDrafts.length) {
      notifyError("Sin flyers", "Agrega al menos un flyer antes de guardar el catalogo movil.");
      return;
    }

    await confirmAction({
      title: "Guardar flyers moviles",
      description: "Estos flyers quedaran visibles en la landing publica y en la app movil.",
      confirmLabel: "Guardar flyers",
      accent: "cyan",
      successTitle: "Flyers actualizados",
      successDescription: "El catalogo comercial ya quedo disponible para web y movil.",
      summary: [
        { label: "Bloque", value: summaryTitle },
        { label: "Total", value: `${flyerDrafts.length}` },
        { label: "Activos", value: summaryCount },
      ],
      action: async () => {
        await savePublicContent(buildPublicSnapshot());
      },
    });
  };

  return (
    <div className="space-y-4">
      {showHeader ? (
        <ModulePageHeader
          badge="App movil"
          title="Flyers de la app movil"
          subtitle="Administra promociones, mensajes y piezas visuales visibles dentro de la experiencia Android, iPhone y landing publica."
          accent="cyan"
          action={
            <Button
              tone="cyan"
              variant="solid"
              className="px-3 py-2"
              onClick={() => setFlyerDrafts((current) => [...current, createFlyer()])}
            >
              Nuevo flyer
            </Button>
          }
        />
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Flyers" value={`${flyerDrafts.length}`} detail="Piezas cargadas en el catalogo movil." tone="info" />
        <StatCard label="Activos" value={`${activeCount}`} detail="Promociones visibles para el usuario final." tone="success" />
        <StatCard label="Borradores" value={`${draftCount}`} detail="Piezas en edicion antes de publicarse." tone="warning" />
        <StatCard label="Canales" value="Web + App" detail="Sincronizacion en landing y experiencia movil." tone="neutral" />
      </section>

      <SurfaceCard className="p-0">
        <SectionHeading
          title="Catalogo de flyers"
          description="Cada flyer puede llevar imagen, mensaje, audiencia, CTA y estado de publicacion."
          action={
            <Button
              tone="cyan"
              variant="outline"
              className="px-3 py-2"
              onClick={() => void saveFlyers("Catalogo movil", `${activeCount} activos`)}
            >
              Guardar catalogo
            </Button>
          }
        />

        {!flyerDrafts.length ? (
          <EmptyState
            title="Sin flyers cargados"
            description="Crea el primer flyer para promocionar funciones, planes o campanas dentro de la app movil."
            action={
              <Button
                tone="cyan"
                variant="solid"
                className="px-3 py-2"
                onClick={() => setFlyerDrafts([createFlyer()])}
              >
                Crear primer flyer
              </Button>
            }
          />
        ) : (
          <div className="space-y-4 p-4">
            {flyerDrafts.map((flyer, index) => (
              <div key={flyer.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-4">
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
                            current.map((item) =>
                              item.id === flyer.id ? { ...item, tone: value as MarketingFlyer["tone"] } : item
                            )
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
                            current.map((item) =>
                              item.id === flyer.id ? { ...item, status: value as MarketingFlyer["status"] } : item
                            )
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
                        Puedes cargar una imagen JPG, PNG o WEBP. Si subes una imagen nueva, reemplazara la URL actual.
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
                        onClick={() => void saveFlyers(flyer.title, flyer.status)}
                      >
                        Guardar flyer
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Vista previa</p>
                    <div
                      className="mt-3 h-40 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-950 bg-cover bg-center"
                      style={{ backgroundImage: `url(${flyer.imageUrl})` }}
                      aria-label={flyer.title}
                    />
                    <div className="mt-3 rounded-lg bg-white p-3 shadow-sm ring-1 ring-neutral-200">
                      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600">{flyer.audience}</p>
                      <p className="mt-2 text-base font-semibold text-neutral-950">{flyer.title}</p>
                      <p className="mt-1 text-sm leading-6 text-neutral-600">{flyer.subtitle}</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200">
                          {flyer.status}
                        </span>
                        <span className="text-xs font-semibold text-neutral-500">{flyer.ctaLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
