// src/pages/PoliticaPrivacidad/page.tsx

import { Link } from "react-router-dom";
import { privacyPolicySections, publicSettings } from "../../data/public-content";

export default function PoliticaPrivacidadPage() {
  return (
    <div className="bg-gray-950 px-4 py-14 lg:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-emerald-400 transition hover:text-emerald-300"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver al inicio
        </Link>

        <div className="rounded-2xl border border-white/10 bg-gray-900/60 p-8 shadow-2xl shadow-black/30">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Politica de Privacidad</h1>
          <p className="mt-3 text-sm leading-6 text-gray-400 sm:text-base">
            Uso de datos personales en formularios publicos de {publicSettings.brandName}.
          </p>
          <p className="mt-2 text-xs uppercase tracking-wider text-gray-500">
            Ultima actualizacion: {new Date().toLocaleDateString("es-EC", { year: "numeric", month: "long" })}
          </p>

          <div className="mt-8 space-y-6">
            {privacyPolicySections.map((section) => (
              <section key={section.title}>
                <h2 className="text-base font-semibold text-white sm:text-lg">{section.title}</h2>
                <p className="mt-2 text-sm leading-7 text-gray-400 sm:text-base">{section.content}</p>
              </section>
            ))}
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-gray-500">
          ¿Dudas? Escribenos a{" "}
          <a
            href={`mailto:${publicSettings.supportEmail}`}
            className="text-emerald-400 hover:text-emerald-300"
          >
            {publicSettings.supportEmail}
          </a>
        </div>
      </div>
    </div>
  );
}
