"use client";

import Link from "next/link";
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

const mapProviderOptions = [
  { value: "Google Maps", label: "Google Maps" },
  { value: "Mapa de respaldo", label: "Mapa de respaldo" },
];

export function SuperadminSettingsPage() {
  const { confirmAction } = useFeedback();
  const { settings, updateSystemSettings, modules, companies } = usePlatform();
  const [form, setForm] = useState(settings);

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Panel master"
        title="Configuracion global"
        subtitle="Accesos del administrador principal, soporte, branding central e integraciones visibles para publicar el producto."
        accent="cyan"
        action={
          <Link href="/master/pagos" className="inline-flex">
            <Button tone="cyan" variant="outline" className="px-3 py-2">
              Ver pagos y pasarelas
            </Button>
          </Link>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Marca" value={form.brandName} detail="Identidad central" tone="info" />
        <StatCard label="Empresas" value={companies.length.toString()} detail="Base total" tone="success" />
        <StatCard label="Modulos" value={modules.length.toString()} detail="Catalogo disponible" tone="warning" />
        <StatCard label="Mapa" value={form.mapsApiKey ? "Listo" : "Respaldo"} detail={form.mapsProvider} tone="danger" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <SurfaceCard className="p-4">
          <SectionHeading
            title="Acceso principal"
            description="Credenciales del administrador principal y comportamiento base de la sesion."
          />
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const confirmed = await confirmAction({
                title: "Guardar acceso principal",
                description: "El acceso del panel master quedara actualizado para las siguientes sesiones.",
                confirmLabel: "Guardar acceso",
                accent: "cyan",
                successTitle: "Acceso actualizado",
                successDescription: "Las credenciales del administrador principal ya quedaron guardadas.",
                summary: [
                  { label: "Acceso", value: form.adminAccessLabel },
                  { label: "Correo", value: form.adminAccessEmail },
                ],
                action: async () => {
                  updateSystemSettings(form);
                },
              });
              if (!confirmed) {
                return;
              }
            }}
          >
            <InputField
              label="Nombre del acceso"
              value={form.adminAccessLabel}
              onChange={(value) => setForm((current) => ({ ...current, adminAccessLabel: value }))}
              accent="cyan"
            />
            <InputField
              label="Correo administrador"
              type="email"
              value={form.adminAccessEmail}
              onChange={(value) => setForm((current) => ({ ...current, adminAccessEmail: value }))}
              accent="cyan"
            />
            <InputField
              label="Contrasena administrador"
              type="text"
              value={form.adminAccessPassword}
              onChange={(value) => setForm((current) => ({ ...current, adminAccessPassword: value }))}
              accent="cyan"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Recordar sesion"
                value={String(form.rememberSessionDefault)}
                onChange={(value) =>
                  setForm((current) => ({ ...current, rememberSessionDefault: value === "true" }))
                }
                accent="cyan"
                options={boolOptions}
              />
              <SelectField
                label="Mostrar planes"
                value={String(form.showPublicPricing)}
                onChange={(value) =>
                  setForm((current) => ({ ...current, showPublicPricing: value === "true" }))
                }
                accent="cyan"
                options={boolOptions}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" tone="cyan" variant="solid">
                Guardar acceso
              </Button>
            </div>
          </form>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <SectionHeading
            title="Soporte y despliegue"
            description="Datos publicos visibles en la landing y base para publicar en motors.aplismart.com."
          />
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const confirmed = await confirmAction({
                title: "Guardar datos globales",
                description: "La capa publica y el panel master usaran esta informacion como referencia.",
                confirmLabel: "Guardar datos",
                accent: "cyan",
                successTitle: "Configuracion guardada",
                successDescription: "Los datos globales ya quedaron actualizados.",
                summary: [
                  { label: "Marca", value: form.brandName },
                  { label: "Dominio", value: form.publicUrl },
                  { label: "Soporte", value: form.supportEmail },
                ],
                action: async () => {
                  updateSystemSettings(form);
                },
              });
              if (!confirmed) {
                return;
              }
            }}
          >
            <InputField
              label="Marca"
              value={form.brandName}
              onChange={(value) => setForm((current) => ({ ...current, brandName: value }))}
              accent="cyan"
            />
            <InputField
              label="Tagline"
              value={form.brandTagline}
              onChange={(value) => setForm((current) => ({ ...current, brandTagline: value }))}
              accent="cyan"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Correo soporte"
                type="email"
                value={form.supportEmail}
                onChange={(value) => setForm((current) => ({ ...current, supportEmail: value }))}
                accent="cyan"
              />
              <InputField
                label="Telefono soporte"
                value={form.supportPhone}
                onChange={(value) => setForm((current) => ({ ...current, supportPhone: value }))}
                accent="cyan"
              />
            </div>
            <InputField
              label="URL publica"
              value={form.publicUrl}
              onChange={(value) => setForm((current) => ({ ...current, publicUrl: value }))}
              accent="cyan"
              placeholder="https://motors.aplismart.com"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Idioma base"
                value={form.defaultLanguage}
                onChange={(value) => setForm((current) => ({ ...current, defaultLanguage: value }))}
                accent="cyan"
              />
              <InputField
                label="Zona horaria"
                value={form.defaultTimezone}
                onChange={(value) => setForm((current) => ({ ...current, defaultTimezone: value }))}
                accent="cyan"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" tone="cyan" variant="solid">
                Guardar datos
              </Button>
            </div>
          </form>
        </SurfaceCard>
      </div>

      <SurfaceCard className="p-4">
        <SectionHeading
          title="Integracion de geolocalizacion"
          description="Base realista para Google Maps, con modo de respaldo mientras aun no existe una API key real."
        />
        <form
          className="mt-4 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const confirmed = await confirmAction({
              title: "Guardar integracion de mapa",
              description: "La geolocalizacion mostrara el estado real de la integracion y su modo de respaldo visual.",
              confirmLabel: "Guardar integracion",
              accent: "cyan",
              successTitle: "Integracion actualizada",
              successDescription: "La configuracion de mapas ya quedo lista para la siguiente salida.",
              summary: [
                { label: "Proveedor", value: form.mapsProvider },
                { label: "API key", value: form.mapsApiKey ? "Configurada" : "No configurada" },
                { label: "Modo respaldo", value: form.mapsFallbackEnabled ? "Activo" : "Inactivo" },
              ],
              action: async () => {
                updateSystemSettings(form);
              },
            });
            if (!confirmed) {
              return;
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Proveedor"
              value={form.mapsProvider}
              onChange={(value) => setForm((current) => ({ ...current, mapsProvider: value }))}
              accent="cyan"
              options={mapProviderOptions}
            />
            <InputField
              label="API key"
              value={form.mapsApiKey}
              onChange={(value) => setForm((current) => ({ ...current, mapsApiKey: value }))}
              accent="cyan"
              placeholder="AIza..."
            />
            <SelectField
              label="Modo respaldo"
              value={String(form.mapsFallbackEnabled)}
              onChange={(value) =>
                setForm((current) => ({ ...current, mapsFallbackEnabled: value === "true" }))
              }
              accent="cyan"
              options={boolOptions}
            />
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4">
            <p className="text-sm font-semibold text-neutral-950">Estado actual</p>
            <p className="mt-2 text-sm text-neutral-600">
              {form.mapsApiKey
                ? "La interfaz ya puede mostrarse como lista para integracion con Google Maps."
                : "La vista seguira usando el mapa de respaldo enriquecido hasta que cargues una API key valida."}
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" tone="cyan" variant="solid">
              Guardar integracion
            </Button>
          </div>
        </form>
      </SurfaceCard>

      <SurfaceCard className="p-4">
        <SectionHeading
          title="SMTP comercial y autorespuesta"
          description="Configuracion base para responder automaticamente solicitudes de demo y contacto desde un correo profesional."
        />
        <form
          className="mt-4 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const confirmed = await confirmAction({
              title: "Guardar configuracion SMTP",
              description: "La plataforma conservara estos datos para futuras respuestas automaticas a clientes.",
              confirmLabel: "Guardar SMTP",
              accent: "cyan",
              successTitle: "SMTP actualizado",
              successDescription: "La base comercial ya quedo lista para integrar respuestas automaticas.",
              summary: [
                { label: "Servidor", value: form.smtpHost || "No definido" },
                { label: "Puerto", value: form.smtpPort || "No definido" },
                { label: "Correo remitente", value: form.smtpFromEmail || "No definido" },
                { label: "Autorespuesta", value: form.smtpAutoReplyEnabled ? "Activa" : "Inactiva" },
              ],
              action: async () => {
                updateSystemSettings(form);
              },
            });
            if (!confirmed) {
              return;
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <InputField
              label="Servidor SMTP"
              value={form.smtpHost}
              onChange={(value) => setForm((current) => ({ ...current, smtpHost: value }))}
              accent="cyan"
              placeholder="smtp.tudominio.com"
            />
            <InputField
              label="Puerto"
              value={form.smtpPort}
              onChange={(value) => setForm((current) => ({ ...current, smtpPort: value }))}
              accent="cyan"
              placeholder="587"
            />
            <InputField
              label="Usuario SMTP"
              value={form.smtpUser}
              onChange={(value) => setForm((current) => ({ ...current, smtpUser: value }))}
              accent="cyan"
              placeholder="usuario@dominio.com"
            />
            <InputField
              label="Contrasena SMTP"
              type="password"
              value={form.smtpPassword}
              onChange={(value) => setForm((current) => ({ ...current, smtpPassword: value }))}
              accent="cyan"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SelectField
              label="Conexion segura"
              value={String(form.smtpSecure)}
              onChange={(value) => setForm((current) => ({ ...current, smtpSecure: value === "true" }))}
              accent="cyan"
              options={boolOptions}
            />
            <InputField
              label="Nombre remitente"
              value={form.smtpFromName}
              onChange={(value) => setForm((current) => ({ ...current, smtpFromName: value }))}
              accent="cyan"
            />
            <InputField
              label="Correo remitente"
              type="email"
              value={form.smtpFromEmail}
              onChange={(value) => setForm((current) => ({ ...current, smtpFromEmail: value }))}
              accent="cyan"
            />
            <InputField
              label="Reply-To"
              type="email"
              value={form.smtpReplyTo}
              onChange={(value) => setForm((current) => ({ ...current, smtpReplyTo: value }))}
              accent="cyan"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[220px_1fr]">
            <SelectField
              label="Autorespuesta"
              value={String(form.smtpAutoReplyEnabled)}
              onChange={(value) =>
                setForm((current) => ({ ...current, smtpAutoReplyEnabled: value === "true" }))
              }
              accent="cyan"
              options={boolOptions}
            />
            <InputField
              label="Asunto automatico"
              value={form.smtpAutoReplySubject}
              onChange={(value) => setForm((current) => ({ ...current, smtpAutoReplySubject: value }))}
              accent="cyan"
            />
          </div>

          <TextareaField
            label="Mensaje automatico"
            value={form.smtpAutoReplyMessage}
            onChange={(value) => setForm((current) => ({ ...current, smtpAutoReplyMessage: value }))}
            accent="cyan"
            rows={5}
          />

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4">
            <p className="text-sm font-semibold text-neutral-950">Estado comercial</p>
            <p className="mt-2 text-sm text-neutral-600">
              {form.smtpHost && form.smtpFromEmail
                ? "La configuracion SMTP base ya esta lista para integrarse con respuestas automaticas y seguimiento comercial."
                : "Aun falta cargar el servidor SMTP y el correo remitente para automatizar respuestas."}
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" tone="cyan" variant="solid">
              Guardar SMTP
            </Button>
          </div>
        </form>
      </SurfaceCard>
    </div>
  );
}

