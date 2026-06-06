// src/pages/SolicitarDemo/page.tsx

import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { industryOptions, privacyPolicySections, publicSettings } from "../../data/public-content";

interface DemoForm {
  name: string;
  company: string;
  email: string;
  phone: string;
  industry: string;
  objective: string;
  message: string;
}

const initialForm: DemoForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  industry: industryOptions[0],
  objective: "Demo comercial",
  message: "",
};

export default function SolicitarDemoPage() {
  const [form, setForm] = useState<DemoForm>(initialForm);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.company.trim() || !form.email.trim()) {
      toast.error("Formulario incompleto", {
        description: "Completa nombre, empresa y correo antes de enviar.",
      });
      return;
    }
    if (!acceptedPrivacy) {
      toast.error("Aceptacion requerida", {
        description: "Debes aceptar la Politica de Privacidad para enviar la solicitud.",
      });
      return;
    }

    setSubmitting(true);
    try {
      // TODO: replace with the real endpoint when it ships.
      // await fetch("/api/leads/demo", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ ...form, source: "Landing" }),
      // });
      await new Promise((r) => setTimeout(r, 600));
      toast.success("Solicitud registrada", {
        description: "Tu solicitud ya quedo registrada para seguimiento comercial.",
      });
      setForm(initialForm);
      setAcceptedPrivacy(false);
    } catch {
      toast.error("Error al enviar", {
        description: "No se pudo registrar la solicitud. Intenta nuevamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-950 px-4 py-14 lg:px-6">
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-2">
        {/* Columna izquierda — info */}
        <section>
          <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
            Solicitar demo
          </span>
          <h1 className="mt-4 text-3xl font-bold text-white sm:text-4xl md:text-5xl">
            Agenda una demo para conocer el control total de tu operacion
          </h1>
          <p className="mt-4 text-base leading-7 text-gray-400 sm:text-lg">
            Cuentanos tu industria, tu empresa y el alcance esperado. Con esta informacion podremos preparar
            una demostracion alineada con tu flota vehicular, tus motores y tus generadores.
          </p>

          <div className="mt-8 space-y-4">
            <InfoCard title="Que recibiras despues de enviar tu solicitud">
              <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-400">
                <li>— Contacto comercial inicial por correo o telefono.</li>
                <li>
                  — Revision del tipo de flota, motores, generadores o sedes que quieres controlar.
                </li>
                <li>— Propuesta de demo alineada con tu operacion real.</li>
              </ul>
            </InfoCard>
            <InfoCard title="Privacidad">
              <p className="mt-2 text-sm leading-6 text-gray-400">
                La informacion enviada no se publica en la web. Solo se usa para responder tu solicitud y
                mantener seguimiento comercial interno.
              </p>
            </InfoCard>
            <InfoCard title="Canal de respuesta">
              <p className="mt-2 text-sm leading-6 text-gray-400">
                Responderemos desde {publicSettings.supportEmail}
              </p>
            </InfoCard>
          </div>
        </section>

        {/* Columna derecha — formulario */}
        <section className="rounded-2xl border border-white/10 bg-gray-900/60 p-6 shadow-2xl shadow-black/30 sm:p-8">
          <h2 className="text-2xl font-bold text-white">Solicitud comercial</h2>
          <p className="mt-2 text-sm text-gray-400">
            Completa los datos y nos pondremos en contacto en menos de 24 horas habiles.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Nombre">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Empresa">
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Correo">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Telefono">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Objetivo">
              <select
                value={form.objective}
                onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
                className={inputClass}
              >
                <option>Demo comercial</option>
                <option>Compra de plan</option>
                <option>Cotizacion</option>
              </select>
            </Field>
            <Field label="Industria">
              <select
                value={form.industry}
                onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                className={inputClass}
              >
                {industryOptions.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </Field>

            <Field label="Mensaje" fullWidth>
              <textarea
                rows={5}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                className={inputClass}
              />
            </Field>

            <div className="md:col-span-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4">
              <label className="flex items-start gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={acceptedPrivacy}
                  onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-white/[0.03] text-emerald-500 focus:ring-emerald-500/30"
                />
                <span className="leading-6">
                  Acepto el uso de mis datos personales para recibir informacion comercial y seguimiento de
                  mi solicitud, conforme a la{" "}
                  <button
                    type="button"
                    onClick={() => setShowPrivacyModal(true)}
                    className="font-semibold text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
                  >
                    Politica de Privacidad
                  </button>
                  .
                </span>
              </label>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-gray-500">
              Al enviar aceptas nuestros terminos.{" "}
              <Link to="/politica-privacidad" className="text-emerald-400 hover:text-emerald-300">
                Ver politica completa
              </Link>
            </p>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-gray-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Enviando..." : "Enviar solicitud de demo"}
            </button>
          </div>
        </section>
      </div>

      {/* Modal política */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-gray-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-lg font-semibold text-white">Politica de Privacidad</p>
                <p className="mt-0.5 text-sm text-gray-400">
                  Uso de datos personales en formularios publicos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/5"
              >
                Cerrar
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {privacyPolicySections.map((section) => (
                <div key={section.title}>
                  <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-400">{section.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Sub components ---------------------------- */

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-gray-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20";

function Field({
  label,
  children,
  fullWidth = false,
}: {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <label className={`block space-y-1.5 ${fullWidth ? "md:col-span-2" : ""}`}>
      <span className="text-sm font-medium text-gray-300">{label}</span>
      {children}
    </label>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/60 p-5">
      <p className="text-sm font-semibold text-white">{title}</p>
      {children}
    </div>
  );
}
