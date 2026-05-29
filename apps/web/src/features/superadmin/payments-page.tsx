"use client";

import { useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { SectionHeading, StatCard, SurfaceCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";

const boolOptions = [
  { value: "true", label: "Si" },
  { value: "false", label: "No" },
];

const gatewayModeOptions = [
  { value: "sandbox", label: "Sandbox" },
  { value: "produccion", label: "Produccion" },
];

export function PaymentsPage() {
  const { confirmAction } = useFeedback();
  const { settings, plans, updateSystemSettings } = usePlatform();
  const [form, setForm] = useState(settings);

  const activeGateways = [
    form.paymentGateways.stripeEnabled,
    form.paymentGateways.paypalEnabled,
    form.paymentGateways.payphoneEnabled,
    form.paymentGateways.bankTransferEnabled,
  ].filter(Boolean).length;

  const checkoutPlans = plans.filter((plan) => plan.checkoutUrl.trim()).length;

  const saveSection = async (title: string, description: string, summary: Array<{ label: string; value: string }>) => {
    const confirmed = await confirmAction({
      title,
      description,
      confirmLabel: "Guardar cambios",
      accent: "cyan",
      successTitle: "Configuracion guardada",
      successDescription: "La configuracion comercial ya quedo actualizada.",
      summary,
      action: async () => {
        updateSystemSettings(form);
      },
    });

    return confirmed;
  };

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Panel master"
        title="Pagos y pasarelas"
        subtitle="Checkout comercial, medios de pago, correo de cobros y parametros de activacion para vender ApliSmart Motors."
        accent="cyan"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Checkout" value={form.paymentCheckoutEnabled ? "Activo" : "Pausado"} detail="Cobro web disponible" tone="info" />
        <StatCard label="Pasarelas" value={activeGateways.toString()} detail="Canales habilitados" tone="success" />
        <StatCard label="Planes" value={checkoutPlans.toString()} detail="Con compra directa" tone="warning" />
        <StatCard label="Cobros" value={form.paymentNotificationEmail || "No definido"} detail="Correo de cobros" tone="danger" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SurfaceCard className="p-4">
          <SectionHeading
            title="Checkout y cobro comercial"
            description="Controla moneda, impuestos, aprobacion manual, correo de cobros y mensajes visibles para clientes."
          />
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await saveSection(
                "Guardar checkout comercial",
                "Estos datos se usaran como base para activaciones, enlaces de compra y seguimiento comercial.",
                [
                  { label: "Moneda", value: form.paymentCurrency },
                  { label: "Impuesto", value: `${form.paymentTaxRate}%` },
                  { label: "Checkout", value: form.paymentCheckoutEnabled ? "Activo" : "Inactivo" },
                  { label: "Correo cobros", value: form.paymentNotificationEmail || "No definido" },
                ]
              );
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <InputField
                label="Moneda"
                value={form.paymentCurrency}
                onChange={(value) => setForm((current) => ({ ...current, paymentCurrency: value }))}
                accent="cyan"
                placeholder="USD"
              />
              <InputField
                label="Impuesto (%)"
                value={form.paymentTaxRate}
                onChange={(value) => setForm((current) => ({ ...current, paymentTaxRate: value }))}
                accent="cyan"
                placeholder="15"
              />
              <InputField
                label="Dias de prueba"
                value={form.paymentTrialDays}
                onChange={(value) => setForm((current) => ({ ...current, paymentTrialDays: value }))}
                accent="cyan"
                placeholder="7"
              />
              <InputField
                label="Prefijo de factura"
                value={form.paymentInvoicePrefix}
                onChange={(value) => setForm((current) => ({ ...current, paymentInvoicePrefix: value }))}
                accent="cyan"
                placeholder="APL"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Checkout habilitado"
                value={String(form.paymentCheckoutEnabled)}
                onChange={(value) => setForm((current) => ({ ...current, paymentCheckoutEnabled: value === "true" }))}
                accent="cyan"
                options={boolOptions}
              />
              <SelectField
                label="Aprobacion manual"
                value={String(form.paymentManualApproval)}
                onChange={(value) => setForm((current) => ({ ...current, paymentManualApproval: value === "true" }))}
                accent="cyan"
                options={boolOptions}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Correo de cobros"
                type="email"
                value={form.paymentNotificationEmail}
                onChange={(value) => setForm((current) => ({ ...current, paymentNotificationEmail: value }))}
                accent="cyan"
                placeholder="cobros@aplismartmotors.app"
              />
              <InputField
                label="URL de exito"
                value={form.paymentSuccessUrl}
                onChange={(value) => setForm((current) => ({ ...current, paymentSuccessUrl: value }))}
                accent="cyan"
                placeholder="https://motors.aplismart.com/master/clientes"
              />
            </div>

            <InputField
              label="URL de cancelacion"
              value={form.paymentCancelUrl}
              onChange={(value) => setForm((current) => ({ ...current, paymentCancelUrl: value }))}
              accent="cyan"
              placeholder="https://motors.aplismart.com/solicitar-demo"
            />

            <TextareaField
              label="Mensaje de exito"
              value={form.paymentSuccessMessage}
              onChange={(value) => setForm((current) => ({ ...current, paymentSuccessMessage: value }))}
              accent="cyan"
              rows={3}
            />
            <TextareaField
              label="Mensaje de fallo"
              value={form.paymentFailureMessage}
              onChange={(value) => setForm((current) => ({ ...current, paymentFailureMessage: value }))}
              accent="cyan"
              rows={3}
            />
            <TextareaField
              label="Instrucciones de cobro"
              value={form.paymentInstructions}
              onChange={(value) => setForm((current) => ({ ...current, paymentInstructions: value }))}
              accent="cyan"
              rows={4}
            />

            <div className="flex justify-end">
              <Button type="submit" tone="cyan" variant="solid">
                Guardar checkout
              </Button>
            </div>
          </form>
        </SurfaceCard>

        <div className="space-y-4">
          <SurfaceCard className="p-4">
            <SectionHeading
              title="Stripe"
              description="Cobro online con tarjeta para checkout directo por plan."
            />
            <form
              className="mt-4 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                await saveSection(
                  "Guardar pasarela Stripe",
                  "Stripe quedara configurado como opcion de cobro para planes y renovaciones.",
                  [
                    { label: "Estado", value: form.paymentGateways.stripeEnabled ? "Activo" : "Inactivo" },
                    { label: "Modo", value: form.paymentGateways.stripeMode },
                    { label: "Clave publica", value: form.paymentGateways.stripePublicKey ? "Cargada" : "No cargada" },
                  ]
                );
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Habilitado"
                  value={String(form.paymentGateways.stripeEnabled)}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      paymentGateways: { ...current.paymentGateways, stripeEnabled: value === "true" },
                    }))
                  }
                  accent="cyan"
                  options={boolOptions}
                />
                <SelectField
                  label="Modo"
                  value={form.paymentGateways.stripeMode}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      paymentGateways: { ...current.paymentGateways, stripeMode: value as "sandbox" | "produccion" },
                    }))
                  }
                  accent="cyan"
                  options={gatewayModeOptions}
                />
              </div>
              <InputField
                label="Public key"
                value={form.paymentGateways.stripePublicKey}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    paymentGateways: { ...current.paymentGateways, stripePublicKey: value },
                  }))
                }
                accent="cyan"
              />
              <InputField
                label="Secret key"
                type="password"
                value={form.paymentGateways.stripeSecretKey}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    paymentGateways: { ...current.paymentGateways, stripeSecretKey: value },
                  }))
                }
                accent="cyan"
              />
              <InputField
                label="Webhook secret"
                type="password"
                value={form.paymentGateways.stripeWebhookSecret}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    paymentGateways: { ...current.paymentGateways, stripeWebhookSecret: value },
                  }))
                }
                accent="cyan"
              />
              <div className="flex justify-end">
                <Button type="submit" tone="cyan" variant="outline">
                  Guardar Stripe
                </Button>
              </div>
            </form>
          </SurfaceCard>

          <SurfaceCard className="p-4">
            <SectionHeading
              title="PayPal y PayPhone"
              description="Canales alternos para cobro internacional y pagos locales."
            />
            <form
              className="mt-4 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                await saveSection(
                  "Guardar pasarelas alternas",
                  "Estas pasarelas quedaran listas como opcion secundaria dentro del flujo comercial.",
                  [
                    { label: "PayPal", value: form.paymentGateways.paypalEnabled ? "Activo" : "Inactivo" },
                    { label: "PayPhone", value: form.paymentGateways.payphoneEnabled ? "Activo" : "Inactivo" },
                    { label: "Transferencia", value: form.paymentGateways.bankTransferEnabled ? "Activa" : "Inactiva" },
                  ]
                );
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="PayPal habilitado"
                  value={String(form.paymentGateways.paypalEnabled)}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      paymentGateways: { ...current.paymentGateways, paypalEnabled: value === "true" },
                    }))
                  }
                  accent="cyan"
                  options={boolOptions}
                />
                <SelectField
                  label="Modo PayPal"
                  value={form.paymentGateways.paypalMode}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      paymentGateways: { ...current.paymentGateways, paypalMode: value as "sandbox" | "produccion" },
                    }))
                  }
                  accent="cyan"
                  options={gatewayModeOptions}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Client ID PayPal"
                  value={form.paymentGateways.paypalClientId}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      paymentGateways: { ...current.paymentGateways, paypalClientId: value },
                    }))
                  }
                  accent="cyan"
                />
                <InputField
                  label="Secret PayPal"
                  type="password"
                  value={form.paymentGateways.paypalSecret}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      paymentGateways: { ...current.paymentGateways, paypalSecret: value },
                    }))
                  }
                  accent="cyan"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField
                  label="PayPhone habilitado"
                  value={String(form.paymentGateways.payphoneEnabled)}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      paymentGateways: { ...current.paymentGateways, payphoneEnabled: value === "true" },
                    }))
                  }
                  accent="cyan"
                  options={boolOptions}
                />
                <InputField
                  label="Store ID"
                  value={form.paymentGateways.payphoneStoreId}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      paymentGateways: { ...current.paymentGateways, payphoneStoreId: value },
                    }))
                  }
                  accent="cyan"
                />
                <InputField
                  label="Token PayPhone"
                  type="password"
                  value={form.paymentGateways.payphoneToken}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      paymentGateways: { ...current.paymentGateways, payphoneToken: value },
                    }))
                  }
                  accent="cyan"
                />
              </div>

              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-semibold text-neutral-950">Transferencia bancaria</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Habilitada"
                    value={String(form.paymentGateways.bankTransferEnabled)}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        paymentGateways: { ...current.paymentGateways, bankTransferEnabled: value === "true" },
                      }))
                    }
                    accent="cyan"
                    options={boolOptions}
                  />
                  <InputField
                    label="Banco"
                    value={form.paymentGateways.bankName}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        paymentGateways: { ...current.paymentGateways, bankName: value },
                      }))
                    }
                    accent="cyan"
                  />
                  <InputField
                    label="Titular"
                    value={form.paymentGateways.bankAccountName}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        paymentGateways: { ...current.paymentGateways, bankAccountName: value },
                      }))
                    }
                    accent="cyan"
                  />
                  <InputField
                    label="Numero de cuenta"
                    value={form.paymentGateways.bankAccountNumber}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        paymentGateways: { ...current.paymentGateways, bankAccountNumber: value },
                      }))
                    }
                    accent="cyan"
                  />
                </div>
                <TextareaField
                  label="Instrucciones bancarias"
                  value={form.paymentGateways.bankInstructions}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      paymentGateways: { ...current.paymentGateways, bankInstructions: value },
                    }))
                  }
                  accent="cyan"
                  rows={3}
                  className="mt-4"
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" tone="cyan" variant="outline">
                  Guardar pasarelas
                </Button>
              </div>
            </form>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
