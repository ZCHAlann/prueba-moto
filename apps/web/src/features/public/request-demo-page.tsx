"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { SurfaceCard } from "@/components/ui/surface";
import { privacyPolicySections } from "@/features/public/privacy-policy-content";

const industryOptions = [
  "Proveedores de internet",
  "Logistica y distribucion",
  "Energia y respaldo",
  "Servicios tecnicos",
  "Transporte terrestre",
  "Flota corporativa",
];

type RequestDemoPageProps = {
  mode?: "demo" | "contacto";
  initialIntent?: string;
  initialPlanId?: string;
};

export function RequestDemoPage({
  mode = "demo",
  initialIntent = "",
  initialPlanId = "",
}: RequestDemoPageProps) {
  const { notifyError, notifySuccess } = useFeedback();
  const { submitDemoRequest, settings, plans } = usePlatform();
  const initialObjective =
    mode === "demo"
      ? initialIntent === "compra"
        ? "Compra de plan"
        : "Demo comercial"
      : "Contacto general";
  const defaultPlan = plans.find((plan) => plan.id === initialPlanId) ?? null;
  const [form, setForm] = useState(() => ({
    name: "",
    company: "",
    email: "",
    phone: "",
    industry: industryOptions[0],
    objective: initialObjective,
    planId: defaultPlan?.id ?? "",
    message:
      initialIntent === "compra" && defaultPlan
        ? `Quiero recibir informacion para comprar el plan ${defaultPlan.name} y conocer tiempos de implementacion, activacion y cobro.`
        : "",
  }));
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === form.planId) ?? null,
    [form.planId, plans]
  );

  const handleSubmit = () => {
    if (!form.name.trim() || !form.company.trim() || !form.email.trim()) {
      notifyError("Formulario incompleto", "Completa nombre, empresa y correo antes de enviar la solicitud.");
      return;
    }

    if (!acceptedPrivacy) {
      notifyError(
        "Aceptacion requerida",
        "Debes aceptar la Politica de Privacidad para poder enviar la solicitud."
      );
      return;
    }

    submitDemoRequest({
      name: form.name,
      company: form.company,
      email: form.email,
      phone: form.phone,
      industry: form.industry,
      notes: `${form.objective}${selectedPlan ? ` / Plan: ${selectedPlan.name}` : ""}${form.message.trim() ? `\n\n${form.message.trim()}` : ""}`,
      source:
        mode === "demo"
          ? form.objective === "Compra de plan"
            ? "Compra web"
            : "Landing"
          : "Contacto",
    });
    notifySuccess("Solicitud registrada", "Tu solicitud ya quedo registrada para seguimiento comercial.");
    setForm({
      name: "",
      company: "",
      email: "",
      phone: "",
      industry: industryOptions[0],
      objective: initialObjective,
      planId: defaultPlan?.id ?? "",
      message:
        initialIntent === "compra" && defaultPlan
          ? `Quiero recibir informacion para comprar el plan ${defaultPlan.name} y conocer tiempos de implementacion, activacion y cobro.`
          : "",
    });
    setAcceptedPrivacy(false);
  };

  return (
    <div className="bg-neutral-100 px-4 py-14 lg:px-6">
      <div className="mx-auto grid w-full max-w-[1180px] gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <section>
          <span className="inline-flex rounded-lg bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-700">
            {mode === "demo" ? "Solicitar demo" : "Contacto"}
          </span>
          <h1 className="mt-4 text-4xl font-bold text-neutral-950">
            {mode === "demo"
              ? form.objective === "Compra de plan"
                ? "Solicita tu compra guiada y activa el plan correcto para tu empresa"
                : "Agenda una demo para conocer el control total de tu operacion"
              : "Conversemos sobre tu operacion y tus necesidades de control"}
          </h1>
          <p className="mt-4 text-base leading-7 text-neutral-600">
            {form.objective === "Compra de plan"
              ? "Comparte tu empresa, el plan de interes y el alcance operativo. Asi podremos ayudarte a cerrar compra, activacion y configuracion inicial."
              : "Cuentanos tu industria, tu empresa y el alcance esperado. Con esta informacion podremos preparar una demostracion alineada con tu flota vehicular, tus motores y tus generadores."}
          </p>

          <div className="mt-8 space-y-4">
            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-neutral-950">Que recibiras despues de enviar tu solicitud</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-600">
                <li>- Contacto comercial inicial por correo o telefono.</li>
                <li>- Revision del tipo de flota, motores, generadores o sedes que quieres controlar.</li>
                <li>- {form.objective === "Compra de plan" ? "Ruta de compra, activacion y configuracion inicial del servicio." : "Propuesta de demo alineada con tu operacion real."}</li>
              </ul>
            </div>

            {selectedPlan ? (
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-5 shadow-sm">
                <p className="text-sm font-semibold text-neutral-950">Plan seleccionado</p>
                <p className="mt-2 text-base font-semibold text-neutral-950">{selectedPlan.name}</p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{selectedPlan.description}</p>
                <p className="mt-3 text-sm text-neutral-700">
                  {selectedPlan.monthlyPrice} mensual / {selectedPlan.annualPrice} anual
                </p>
              </div>
            ) : null}

            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-neutral-950">Privacidad y tratamiento de datos</p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                La informacion enviada no se publica en la web. Solo se usa para responder tu solicitud,
                preparar una propuesta y mantener seguimiento comercial interno.
              </p>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-neutral-950">Canal de respuesta</p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Responderemos desde {settings.supportEmail} o desde el correo SMTP configurado en el panel master.
              </p>
            </div>
          </div>
        </section>

        <SurfaceCard className="p-6 lg:p-8">
          <h2 className="text-2xl font-bold text-neutral-950">
            {mode === "demo"
              ? form.objective === "Compra de plan"
                ? "Solicitud de compra"
                : "Solicitud comercial"
              : "Formulario de contacto"}
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <InputField
              label="Nombre"
              value={form.name}
              onChange={(value) => setForm((current) => ({ ...current, name: value }))}
              accent="teal"
            />
            <InputField
              label="Empresa"
              value={form.company}
              onChange={(value) => setForm((current) => ({ ...current, company: value }))}
              accent="teal"
            />
            <InputField
              label="Correo"
              type="email"
              value={form.email}
              onChange={(value) => setForm((current) => ({ ...current, email: value }))}
              accent="teal"
            />
            <InputField
              label="Telefono"
              value={form.phone}
              onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
              accent="teal"
            />
            <SelectField
              label="Objetivo"
              value={form.objective}
              onChange={(value) => setForm((current) => ({ ...current, objective: value }))}
              accent="teal"
              options={[
                { value: "Demo comercial", label: "Demo comercial" },
                { value: "Compra de plan", label: "Compra de plan" },
                { value: "Cotizacion", label: "Cotizacion" },
              ]}
            />
            <SelectField
              label="Plan de interes"
              value={form.planId}
              onChange={(value) => setForm((current) => ({ ...current, planId: value }))}
              accent="teal"
              options={[
                { value: "", label: "Aun no definido" },
                ...plans.map((plan) => ({ value: plan.id, label: `${plan.name} · ${plan.monthlyPrice}` })),
              ]}
            />
            <SelectField
              label="Industria"
              value={form.industry}
              onChange={(value) => setForm((current) => ({ ...current, industry: value }))}
              accent="teal"
              options={industryOptions.map((industry) => ({ value: industry, label: industry }))}
              className="md:col-span-2"
            />
            <TextareaField
              label="Mensaje"
              value={form.message}
              onChange={(value) => setForm((current) => ({ ...current, message: value }))}
              accent="teal"
              rows={5}
              className="md:col-span-2"
            />
            <div className="md:col-span-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4">
              <label className="flex items-start gap-3 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={acceptedPrivacy}
                  onChange={(event) => setAcceptedPrivacy(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-neutral-300"
                />
                <span className="leading-6">
                  Acepto el uso de mis datos personales para recibir informacion comercial y seguimiento de mi
                  solicitud, conforme a la{" "}
                  <button
                    type="button"
                    onClick={() => setShowPrivacyModal(true)}
                    className="font-semibold text-teal-700 underline underline-offset-2"
                  >
                    Politica de Privacidad
                  </button>
                  .
                </span>
              </label>
            </div>
          </div>
          <div className="mt-6">
            <Button tone="teal" variant="solid" onClick={handleSubmit}>
              {mode === "demo"
                ? form.objective === "Compra de plan"
                  ? "Enviar solicitud de compra"
                  : "Enviar solicitud de demo"
                : "Enviar contacto"}
            </Button>
          </div>
        </SurfaceCard>
      </div>

      {showPrivacyModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="max-h-[88vh] w-full max-w-[860px] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <div>
                <p className="text-lg font-semibold text-neutral-950">Politica de Privacidad</p>
                <p className="mt-1 text-sm text-neutral-500">Uso de datos personales en formularios publicos.</p>
              </div>
              <Button tone="neutral" variant="outline" onClick={() => setShowPrivacyModal(false)}>
                Cerrar
              </Button>
            </div>
            <div className="max-h-[calc(88vh-88px)] overflow-y-auto px-5 py-5">
              <div className="space-y-5">
                {privacyPolicySections.map((section) => (
                  <section key={section.title}>
                    <h3 className="text-base font-semibold text-neutral-950">{section.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">{section.content}</p>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
