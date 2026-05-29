"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAssets } from "@/hooks/useAssets";
import { useAlerts, type AlertSeverity, type AlertStatus, type AlertType } from "@/hooks/useAlerts";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { useSettings } from "@/hooks/useSettings";
import { defaultAlertConfigs } from "@/features/alertas/mock-data";

type AlertFormState = {
  assetId: string;
  title: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  dueDate: string;
  notes: string;
};

export function AlertsPage() {
  const { confirmAction } = useFeedback();

  // ── hooks nuevos ─────────────────────────────────────────────────────────────
  const { assets, loading: assetsLoading } = useAssets();
  const { alerts, loading: alertsLoading, createAlert, updateAlert } = useAlerts();

  // ── alertConfigs/toggleAlertConfig siguen en FleetOps (sin endpoint aún) ────
  const { settings, toggleAlertConfig } = useSettings();
  const alertConfigs = settings?.alertConfigs ?? defaultAlertConfigs;

  const [form, setForm] = useState<AlertFormState>({
    assetId: "",
    title: "",
    type: "Vencimiento",
    severity: "Media",
    status: "Abierta",
    dueDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  // Sync assetId default cuando assets carga
  const firstAssetId = assets[0]?.id ?? "";
  const resolvedAssetId = form.assetId || firstAssetId;

  const summary = useMemo(
    () => ({
      open: alerts.filter((a) => a.status === "Abierta").length,
      followUp: alerts.filter((a) => a.status === "En seguimiento").length,
      critical: alerts.filter((a) => a.severity === "Alta").length,
    }),
    [alerts]
  );

  if (assetsLoading || alertsLoading) {
    return (
      <div className="space-y-6">
        <ModulePageHeader badge="Monitoreo" title="Alertas" subtitle="Cargando alertas…" accent="rose" />
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Monitoreo"
        title="Alertas"
        subtitle="Gestiona vencimientos, mantenimiento y alertas manuales con seguimiento basico."
        accent="rose"
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Abiertas" value={summary.open.toString()} detail="Requieren accion" tone="danger" />
        <StatCard label="Seguimiento" value={summary.followUp.toString()} detail="En curso" tone="warning" />
        <StatCard label="Criticas" value={summary.critical.toString()} detail="Severidad alta" tone="info" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const selectedAsset = assets.find((a) => a.id === resolvedAssetId);

            await confirmAction({
              title: "Crear alerta",
              description: "Se registrara una nueva alerta operativa y quedara disponible para seguimiento inmediato.",
              confirmLabel: "Confirmar alerta",
              accent: "rose",
              successTitle: "Alerta creada",
              successDescription: "La alerta ya forma parte del monitoreo de la empresa activa.",
              summary: [
                { label: "Vehiculo", value: selectedAsset ? `${selectedAsset.plate} / ${selectedAsset.brand} ${selectedAsset.model}` : resolvedAssetId },
                { label: "Tipo", value: form.type },
                { label: "Severidad", value: form.severity },
                { label: "Vence", value: form.dueDate },
              ],
              action: async () => {
                await createAlert({ ...form, assetId: resolvedAssetId });
                setForm((c) => ({ ...c, title: "", notes: "" }));
              },
            });
          }}
        >
          <SurfaceCard className="p-5">
            <h2 className="text-lg font-semibold text-neutral-950">Nueva alerta</h2>
            <p className="mt-1 text-sm text-neutral-500">Controla eventos de mantenimiento, vencimientos o alertas manuales.</p>

            <div className="mt-5 space-y-4">
              <SelectField
                label="Vehiculo"
                value={resolvedAssetId}
                onChange={(v) => setForm((c) => ({ ...c, assetId: v }))}
                accent="rose"
                options={assets.map((a) => ({ value: a.id, label: `${a.code} / ${a.name}` }))}
              />
              <InputField label="Titulo" value={form.title} onChange={(v) => setForm((c) => ({ ...c, title: v }))} accent="rose" />
              <SelectField
                label="Tipo"
                value={form.type}
                onChange={(v) => setForm((c) => ({ ...c, type: v as AlertType }))}
                accent="rose"
                options={[
                  { value: "Vencimiento", label: "Vencimiento" },
                  { value: "Mantenimiento", label: "Mantenimiento" },
                  { value: "Manual", label: "Manual" },
                ]}
              />
              <SelectField
                label="Severidad"
                value={form.severity}
                onChange={(v) => setForm((c) => ({ ...c, severity: v as AlertSeverity }))}
                accent="rose"
                options={[
                  { value: "Alta", label: "Alta" },
                  { value: "Media", label: "Media" },
                  { value: "Baja", label: "Baja" },
                ]}
              />
              <InputField label="Fecha limite" type="date" value={form.dueDate} onChange={(v) => setForm((c) => ({ ...c, dueDate: v }))} accent="rose" />
              <TextareaField label="Notas" value={form.notes} onChange={(v) => setForm((c) => ({ ...c, notes: v }))} accent="rose" rows={4} />
              <Button type="submit" tone="rose" variant="solid">Crear alerta</Button>
            </div>
          </SurfaceCard>
        </form>

        <div className="space-y-4">
          <section className="grid gap-4 md:grid-cols-3">
            {alertConfigs.map((config) => (
              <button
                key={config.id}
                type="button"
                onClick={async () => {
                  await confirmAction({
                    title: config.enabled ? "Pausar regla" : "Activar regla",
                    description: "La configuracion global de alertas se actualizara para la empresa activa.",
                    confirmLabel: config.enabled ? "Pausar regla" : "Activar regla",
                    accent: "rose",
                    successTitle: "Configuracion actualizada",
                    successDescription: "La regla cambio de estado correctamente.",
                    summary: [
                      { label: "Regla", value: config.label },
                      { label: "Estado actual", value: config.enabled ? "Activa" : "Pausada" },
                    ],
                    action: async () => { toggleAlertConfig(config.id); },
                  });
                }}
                className="rounded-lg border border-neutral-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-neutral-950">{config.label}</p>
                  <StatusPill label={config.enabled ? "Activa" : "Pausada"} tone={config.enabled ? "success" : "neutral"} />
                </div>
                <p className="mt-3 text-sm text-neutral-600">{config.description}</p>
              </button>
            ))}
          </section>

          <TableCard title="Alertas recientes" description="Seguimiento basico de criticidad, estado y cierre operativo.">
            <Table minWidth="min-w-[860px]">
              <TableHead>
                <tr>
                  <th className="px-5 py-3 font-semibold">Alerta</th>
                  <th className="px-5 py-3 font-semibold">Tipo</th>
                  <th className="px-5 py-3 font-semibold">Severidad</th>
                  <th className="px-5 py-3 font-semibold">Estado</th>
                  <th className="px-5 py-3 font-semibold">Accion</th>
                </tr>
              </TableHead>
              <TableBody>
                {alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-neutral-950">{alert.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">{alert.notes}</p>
                    </td>
                    <td className="px-5 py-4">{alert.type}</td>
                    <td className="px-5 py-4">
                      <StatusPill
                        label={alert.severity}
                        tone={alert.severity === "Alta" ? "danger" : alert.severity === "Media" ? "warning" : "info"}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill
                        label={alert.status}
                        tone={alert.status === "Abierta" ? "danger" : alert.status === "En seguimiento" ? "warning" : "success"}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <Button
                        tone="rose"
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        onClick={async () => {
                          const nextStatus: AlertStatus =
                            alert.status === "Abierta"
                              ? "En seguimiento"
                              : alert.status === "En seguimiento"
                                ? "Cerrada"
                                : "Abierta";

                          await confirmAction({
                            title: "Actualizar estado de alerta",
                            description: "La alerta cambiara de estado y el seguimiento quedara reflejado en la plataforma.",
                            confirmLabel: "Confirmar cambio",
                            accent: "rose",
                            successTitle: "Estado actualizado",
                            successDescription: "La alerta cambio de estado correctamente.",
                            summary: [
                              { label: "Alerta", value: alert.title },
                              { label: "Estado actual", value: alert.status },
                              { label: "Nuevo estado", value: nextStatus },
                            ],
                            action: async () => {
                              await updateAlert(alert.id, {
                                assetId: alert.assetId ?? "",
                                title: alert.title,
                                type: alert.type,
                                severity: alert.severity,
                                status: nextStatus,
                                dueDate: alert.dueDate,
                                notes: alert.notes,
                              });
                            },
                          });
                        }}
                      >
                        Cambiar estado
                      </Button>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </div>
      </section>
    </div>
  );
}