"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import {
  DataExportToolbar,
  type ExportColumn,
  type ExportRow,
} from "@/components/ui/data-export-toolbar";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { industryOptions, leadStatusOptions } from "@/features/master/helpers";
import type { LeadStatus, SalesLead } from "@/types/platform";

type LeadFormState = Omit<SalesLead, "id" | "createdAt">;
type LeadFormErrors = Partial<Record<keyof LeadFormState, string>>;

const exportColumns: ExportColumn[] = [
  { key: "name", label: "Nombre" },
  { key: "company", label: "Empresa" },
  { key: "industry", label: "Industria" },
  { key: "source", label: "Fuente" },
  { key: "status", label: "Estado" },
  { key: "assignedTo", label: "Responsable" },
];

const statusFlow: LeadStatus[] = [
  "nuevo",
  "contactado",
  "demo agendada",
  "propuesta enviada",
  "ganado",
];

function createEmptyForm(): LeadFormState {
  return {
    name: "",
    company: "",
    email: "",
    phone: "",
    industry: industryOptions[0],
    source: "Landing",
    status: "nuevo",
    notes: "",
    assignedTo: "Equipo comercial",
  };
}

function validateForm(form: LeadFormState) {
  const errors: LeadFormErrors = {};
  if (!form.name.trim()) errors.name = "El nombre es obligatorio.";
  if (!form.company.trim()) errors.company = "La empresa es obligatoria.";
  if (!form.email.trim()) errors.email = "El correo es obligatorio.";
  if (!form.phone.trim()) errors.phone = "El teléfono es obligatorio.";
  if (!form.assignedTo.trim()) errors.assignedTo = "Asigna un responsable.";
  return errors;
}

export function LeadsPage() {
  const { confirmAction, notifyError } = useFeedback();
  const { leads, createLead, updateLead } = usePlatform();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [form, setForm] = useState<LeadFormState>(createEmptyForm());

  const filteredLeads = useMemo(() => {
    const value = query.trim().toLowerCase();
    return leads.filter((lead) => {
      return (
        value.length === 0 ||
        lead.name.toLowerCase().includes(value) ||
        lead.company.toLowerCase().includes(value) ||
        lead.email.toLowerCase().includes(value) ||
        lead.industry.toLowerCase().includes(value) ||
        lead.assignedTo.toLowerCase().includes(value)
      );
    });
  }, [leads, query]);

  const exportRows = useMemo<ExportRow[]>(
    () =>
      filteredLeads.map((lead) => ({
        name: lead.name,
        company: lead.company,
        industry: lead.industry,
        source: lead.source,
        status: lead.status,
        assignedTo: lead.assignedTo,
      })),
    [filteredLeads]
  );

  const resetForm = () => {
    setEditingId(null);
    setErrors({});
    setForm(createEmptyForm());
  };

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Comercial"
        title="Leads y oportunidades"
        subtitle="Base comercial viva con estados reales de seguimiento y próxima acción visible."
        accent="cyan"
      />

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {leadStatusOptions.map((status) => (
          <StatCard
            key={status.value}
            label={status.label}
            value={leads.filter((lead) => lead.status === status.value).length.toString()}
            detail="Oportunidades"
            tone={
              status.value === "ganado"
                ? "success"
                : status.value === "perdido"
                  ? "danger"
                  : status.value === "demo agendada"
                    ? "warning"
                    : "info"
            }
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <SurfaceCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">
                {editingId ? "Editar lead" : "Nuevo lead"}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Formulario compacto para registrar y mover una oportunidad comercial.
              </p>
            </div>
            {editingId ? (
              <Button tone="neutral" variant="outline" className="px-3 py-2" onClick={resetForm}>
                Cancelar
              </Button>
            ) : null}
          </div>
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const nextErrors = validateForm(form);
              setErrors(nextErrors);

              if (Object.keys(nextErrors).length > 0) {
                notifyError("Formulario incompleto", "Completa la ficha comercial antes de guardarla.");
                return;
              }

              const confirmed = await confirmAction({
                title: editingId ? "Guardar lead" : "Crear lead",
                description: "La oportunidad quedará visible en el CRM y en el embudo comercial.",
                confirmLabel: editingId ? "Guardar cambios" : "Crear lead",
                accent: "cyan",
                successTitle: editingId ? "Lead actualizado" : "Lead creado",
                successDescription: "La oportunidad ya quedó registrada.",
                summary: [
                  { label: "Lead", value: form.name },
                  { label: "Empresa", value: form.company },
                  { label: "Estado", value: form.status },
                  { label: "Responsable", value: form.assignedTo },
                ],
                action: async () => {
                  if (editingId) {
                    updateLead(editingId, form);
                  } else {
                    createLead(form);
                  }
                },
              });

              if (confirmed) {
                resetForm();
              }
            }}
          >
            <InputField label="Nombre" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} accent="cyan" error={errors.name} />
            <InputField label="Empresa" value={form.company} onChange={(value) => setForm((current) => ({ ...current, company: value }))} accent="cyan" error={errors.company} />
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField label="Correo" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} accent="cyan" error={errors.email} />
              <InputField label="Teléfono" type="tel" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} accent="cyan" error={errors.phone} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Industria" value={form.industry} onChange={(value) => setForm((current) => ({ ...current, industry: value }))} accent="cyan" options={industryOptions.map((item) => ({ value: item, label: item }))} />
              <InputField label="Fuente" value={form.source} onChange={(value) => setForm((current) => ({ ...current, source: value }))} accent="cyan" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Estado" value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value as LeadStatus }))} accent="cyan" options={leadStatusOptions} />
              <InputField label="Responsable" value={form.assignedTo} onChange={(value) => setForm((current) => ({ ...current, assignedTo: value }))} accent="cyan" error={errors.assignedTo} />
            </div>
            <TextareaField label="Notas" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} accent="cyan" rows={3} />
            <div className="flex justify-end">
              <Button type="submit" tone="cyan" variant="solid">
                {editingId ? "Guardar lead" : "Crear lead"}
              </Button>
            </div>
          </form>
        </SurfaceCard>

        <TableCard title="Embudo comercial" description="Listado operativo con edición y avance de etapa.">
          <DataExportToolbar
            title="leads-apli-smart-motors"
            columns={exportColumns}
            rows={exportRows}
            accent="cyan"
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Buscar por lead, empresa o industria"
          />

          {filteredLeads.length === 0 ? (
            <EmptyState title="Sin leads" description="No hay coincidencias para el filtro actual." />
          ) : (
            <Table minWidth="min-w-[1180px]">
              <TableHead>
                <tr>
                  <th className="px-4 py-3 font-semibold">Lead</th>
                  <th className="px-4 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold">Fuente</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Responsable</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </TableHead>
              <TableBody>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-neutral-950">{lead.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">{lead.email} / {lead.phone}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p>{lead.company}</p>
                      <p className="mt-1 text-xs text-neutral-500">{lead.industry}</p>
                    </td>
                    <td className="px-4 py-3.5">{lead.source}</td>
                    <td className="px-4 py-3.5">
                      <span className="rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200">
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p>{lead.assignedTo}</p>
                      <p className="mt-1 text-xs text-neutral-500">{lead.createdAt}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          tone="cyan"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => {
                            setEditingId(lead.id);
                            setErrors({});
                            setForm({
                              name: lead.name,
                              company: lead.company,
                              email: lead.email,
                              phone: lead.phone,
                              industry: lead.industry,
                              source: lead.source,
                              status: lead.status,
                              notes: lead.notes,
                              assignedTo: lead.assignedTo,
                            });
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          tone="teal"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          disabled={lead.status === "ganado" || lead.status === "perdido"}
                          onClick={async () => {
                            const currentIndex = statusFlow.indexOf(lead.status);
                            const nextStatus =
                              currentIndex >= 0 && currentIndex < statusFlow.length - 1
                                ? statusFlow[currentIndex + 1]
                                : lead.status;

                            if (nextStatus === lead.status) {
                              return;
                            }

                            const confirmed = await confirmAction({
                              title: "Mover lead",
                              description: "La oportunidad avanzará a la siguiente etapa visible del pipeline.",
                              confirmLabel: "Mover etapa",
                              accent: "cyan",
                              successTitle: "Etapa actualizada",
                              successDescription: "El embudo comercial ya refleja el nuevo estado.",
                              summary: [
                                { label: "Lead", value: lead.name },
                                { label: "Empresa", value: lead.company },
                                { label: "Nuevo estado", value: nextStatus },
                              ],
                              action: async () => {
                                updateLead(lead.id, { ...lead, status: nextStatus });
                              },
                            });

                            if (!confirmed) {
                              return;
                            }
                          }}
                        >
                          Siguiente etapa
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </section>
    </div>
  );
}
