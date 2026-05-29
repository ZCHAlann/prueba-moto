import { privacyPolicySections } from "@/features/public/privacy-policy-content";

export default function PrivacyPolicyRoute() {
  return (
    <div className="bg-neutral-100 px-4 py-14 lg:px-6">
      <div className="mx-auto w-full max-w-[920px] rounded-lg border border-neutral-200 bg-white p-6 shadow-sm lg:p-8">
        <span className="inline-flex rounded-lg bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-700">
          Politica de Privacidad
        </span>
        <h1 className="mt-4 text-3xl font-bold text-neutral-950">Uso de datos personales</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          Esta politica explica como ApliSmart Motors trata la informacion recibida desde formularios
          publicos de contacto y solicitud de demo.
        </p>
        <div className="mt-8 space-y-6">
          {privacyPolicySections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-neutral-950">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{section.content}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
