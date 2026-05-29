"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { useAssetCenter } from "@/components/providers/asset-center-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { EmptyState, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import type { AssetDocument, AssetDocumentStatus, AssetExpiry, InsurancePolicy } from "@/types/activo";

type AssetCompliancePanelProps = {
  assetId: string;
  owner: string;
};

type SummaryItem = {
  label: string;
  value: string;
};

type InsuranceFormState = Omit<InsurancePolicy, "id" | "tenantId">;
type ExpiryFormState = Omit<AssetExpiry, "id" | "tenantId">;

const STATUS_OPTIONS = [
  { value: "Vigente", label: "Vigente" },
  { value: "Por vencer", label: "Por vencer" },
  { value: "Vencido", label: "Vencido" },
] as const;

function getStatusTone(status: AssetDocumentStatus) {
  if (status === "Vigente") {
    return "success" as const;
  }

  if (status === "Por vencer") {
    return "warning" as const;
  }

  return "danger" as const;
}

function toSummary(items: SummaryItem[]) {
  return items.filter((item) => item.value.trim().length > 0);
}

export function AssetCompliancePanel({ assetId, owner }: AssetCompliancePanelProps) {
  const { confirmAction } = useFeedback();
  const {
    assetDocuments,
    insurancePolicies,
    assetExpiries,
    createAssetDocument,
    updateAssetDocument,
    deleteAssetDocument,
    createInsurancePolicy,
    updateInsurancePolicy,
    deleteInsurancePolicy,
    createAssetExpiry,
    updateAssetExpiry,
    deleteAssetExpiry,
  } = useAssetCenter();

  const relatedDocuments = assetDocuments.filter((item) => item.assetId === assetId);
  const relatedInsurances = insurancePolicies.filter((item) => item.assetId === assetId);
  const relatedExpiries = assetExpiries.filter((item) => item.assetId === assetId);

  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [documentForm, setDocumentForm] = useState<Omit<AssetDocument, "id" | "tenantId">>({
    assetId,
    title: "",
    category: "Documento vehicular",
    status: "Vigente",
    issueDate: new Date().toISOString().slice(0, 10),
    expiryDate: new Date().toISOString().slice(0, 10),
    provider: "",
    notes: "",
  });

  const [editingInsuranceId, setEditingInsuranceId] = useState<string | null>(null);
  const [insuranceForm, setInsuranceForm] = useState<InsuranceFormState>({
    assetId,
    insurer: "",
    policyNumber: "",
    coverage: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    status: "Vigente",
    notes: "",
  });

  const [editingExpiryId, setEditingExpiryId] = useState<string | null>(null);
  const [expiryForm, setExpiryForm] = useState<ExpiryFormState>({
    assetId,
    title: "",
    category: "Permiso",
    dueDate: new Date().toISOString().slice(0, 10),
    status: "Vigente",
    owner,
    notes: "",
  });

  const resetDocumentForm = () => {
    setEditingDocumentId(null);
    setDocumentForm((current) => ({
      ...current,
      title: "",
      provider: "",
      notes: "",
    }));
  };

  const resetInsuranceForm = () => {
    setEditingInsuranceId(null);
    setInsuranceForm((current) => ({
      ...current,
      insurer: "",
      policyNumber: "",
      coverage: "",
      notes: "",
    }));
  };

  const resetExpiryForm = () => {
    setEditingExpiryId(null);
    setExpiryForm((current) => ({
      ...current,
      title: "",
      notes: "",
    }));
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            await confirmAction({
              title: editingDocumentId ? "Actualizar documento" : "Registrar documento",
              description: "El documento quedara asociado al activo dentro del centro de datos operacional.",
              confirmLabel: editingDocumentId ? "Guardar documento" : "Registrar documento",
              accent: "sky",
              successTitle: editingDocumentId ? "Documento actualizado" : "Documento registrado",
              successDescription: "El control documental del activo se actualizo correctamente.",
              summary: toSummary([
                { label: "Documento", value: documentForm.title },
                { label: "Categoria", value: documentForm.category },
                { label: "Estado", value: documentForm.status },
                { label: "Vence", value: documentForm.expiryDate },
              ]),
              action: async () => {
                if (editingDocumentId) {
                  updateAssetDocument(editingDocumentId, documentForm);
                } else {
                  createAssetDocument(documentForm);
                }

                resetDocumentForm();
              },
            });
          }}
        >
          <SurfaceCard className="p-5">
            <h2 className="text-lg font-semibold text-neutral-950">Documentos del activo</h2>
            <div className="mt-5 space-y-4">
              <InputField
                label="Titulo"
                value={documentForm.title}
                onChange={(value) => setDocumentForm((current) => ({ ...current, title: value }))}
                accent="sky"
              />
              <InputField
                label="Categoria"
                value={documentForm.category}
                onChange={(value) => setDocumentForm((current) => ({ ...current, category: value }))}
                accent="sky"
              />
              <SelectField
                label="Estado"
                value={documentForm.status}
                onChange={(value) =>
                  setDocumentForm((current) => ({
                    ...current,
                    status: value as AssetDocumentStatus,
                  }))
                }
                accent="sky"
                options={STATUS_OPTIONS}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Emision"
                  type="date"
                  value={documentForm.issueDate}
                  onChange={(value) => setDocumentForm((current) => ({ ...current, issueDate: value }))}
                  accent="sky"
                />
                <InputField
                  label="Vencimiento"
                  type="date"
                  value={documentForm.expiryDate}
                  onChange={(value) => setDocumentForm((current) => ({ ...current, expiryDate: value }))}
                  accent="sky"
                />
              </div>
              <InputField
                label="Entidad"
                value={documentForm.provider}
                onChange={(value) => setDocumentForm((current) => ({ ...current, provider: value }))}
                accent="sky"
              />
              <TextareaField
                label="Notas"
                value={documentForm.notes}
                onChange={(value) => setDocumentForm((current) => ({ ...current, notes: value }))}
                accent="sky"
                rows={4}
              />
              <div className="flex gap-3">
                <Button type="submit" tone="sky" variant="solid">
                  {editingDocumentId ? "Guardar documento" : "Registrar documento"}
                </Button>
                {editingDocumentId ? (
                  <Button type="button" tone="neutral" variant="outline" onClick={resetDocumentForm}>
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </div>
          </SurfaceCard>
        </form>

        <TableCard
          title="Control documental"
          description="Documentos vigentes, por vencer o vencidos asociados al activo."
        >
          {relatedDocuments.length === 0 ? (
            <EmptyState
              title="Sin documentos"
              description="Todavia no hay documentos registrados para este activo."
            />
          ) : (
            <Table minWidth="min-w-[900px]">
              <TableHead>
                <tr>
                  <th className="px-5 py-3 font-semibold">Documento</th>
                  <th className="px-5 py-3 font-semibold">Entidad</th>
                  <th className="px-5 py-3 font-semibold">Fechas</th>
                  <th className="px-5 py-3 font-semibold">Estado</th>
                  <th className="px-5 py-3 font-semibold">Acciones</th>
                </tr>
              </TableHead>
              <TableBody>
                {relatedDocuments.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-neutral-950">{item.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">{item.category}</p>
                    </td>
                    <td className="px-5 py-4">{item.provider}</td>
                    <td className="px-5 py-4">
                      <p>{item.issueDate}</p>
                      <p className="mt-1 text-xs text-neutral-500">Vence {item.expiryDate}</p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill label={item.status} tone={getStatusTone(item.status)} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          tone="sky"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => {
                            setEditingDocumentId(item.id);
                            setDocumentForm({
                              assetId,
                              title: item.title,
                              category: item.category,
                              status: item.status,
                              issueDate: item.issueDate,
                              expiryDate: item.expiryDate,
                              provider: item.provider,
                              notes: item.notes,
                            });
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          tone="danger"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={async () => {
                            await confirmAction({
                              title: "Eliminar documento",
                              description: "El documento se retirara del control documental del activo.",
                              confirmLabel: "Eliminar documento",
                              accent: "rose",
                              successTitle: "Documento eliminado",
                              successDescription: "El control documental se actualizo correctamente.",
                              summary: toSummary([
                                { label: "Documento", value: item.title },
                                { label: "Entidad", value: item.provider },
                                { label: "Vence", value: item.expiryDate },
                              ]),
                              action: async () => {
                                deleteAssetDocument(item.id);
                              },
                            });
                          }}
                        >
                          Eliminar
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

      <section className="grid gap-6 xl:grid-cols-2">
        <InsuranceSection
          form={insuranceForm}
          editingId={editingInsuranceId}
          items={relatedInsurances}
          onChange={setInsuranceForm}
          onCancel={resetInsuranceForm}
          onEdit={(item) => {
            setEditingInsuranceId(item.id);
            setInsuranceForm({
              assetId,
              insurer: item.insurer,
              policyNumber: item.policyNumber,
              coverage: item.coverage,
              startDate: item.startDate,
              endDate: item.endDate,
              status: item.status,
              notes: item.notes,
            });
          }}
          onSubmit={async () => {
            await confirmAction({
              title: editingInsuranceId ? "Actualizar seguro vehicular" : "Registrar seguro vehicular",
              description: "La poliza quedara visible dentro del centro documental del activo.",
              confirmLabel: editingInsuranceId ? "Guardar seguro" : "Registrar seguro",
              accent: "sky",
              successTitle: editingInsuranceId ? "Seguro actualizado" : "Seguro registrado",
              successDescription: "El control de seguros del activo ya fue actualizado.",
              summary: toSummary([
                { label: "Aseguradora", value: insuranceForm.insurer },
                { label: "Poliza", value: insuranceForm.policyNumber },
                { label: "Cobertura", value: insuranceForm.coverage },
                { label: "Vence", value: insuranceForm.endDate },
              ]),
              action: async () => {
                if (editingInsuranceId) {
                  updateInsurancePolicy(editingInsuranceId, insuranceForm);
                } else {
                  createInsurancePolicy(insuranceForm);
                }

                resetInsuranceForm();
              },
            });
          }}
          onDelete={async (item) => {
            await confirmAction({
              title: "Eliminar seguro vehicular",
              description: "La poliza se retirara del activo actual.",
              confirmLabel: "Eliminar poliza",
              accent: "rose",
              successTitle: "Seguro eliminado",
              successDescription: "La base del activo ya fue actualizada.",
              summary: toSummary([
                { label: "Aseguradora", value: item.insurer },
                { label: "Poliza", value: item.policyNumber },
                { label: "Cobertura", value: item.coverage },
              ]),
              action: async () => {
                deleteInsurancePolicy(item.id);
              },
            });
          }}
        />

        <ExpirySection
          form={expiryForm}
          editingId={editingExpiryId}
          items={relatedExpiries}
          onChange={setExpiryForm}
          onCancel={resetExpiryForm}
          onEdit={(item) => {
            setEditingExpiryId(item.id);
            setExpiryForm({
              assetId,
              title: item.title,
              category: item.category,
              dueDate: item.dueDate,
              status: item.status,
              owner: item.owner,
              notes: item.notes,
            });
          }}
          onSubmit={async () => {
            await confirmAction({
              title: editingExpiryId ? "Actualizar vencimiento" : "Registrar vencimiento",
              description: "El vencimiento quedara asociado al activo actual dentro de ApliSmart Motors.",
              confirmLabel: editingExpiryId ? "Guardar cambios" : "Registrar vencimiento",
              accent: "sky",
              successTitle: editingExpiryId ? "Vencimiento actualizado" : "Vencimiento registrado",
              successDescription: "La informacion quedo registrada correctamente.",
              summary: toSummary([
                { label: "Concepto", value: expiryForm.title },
                { label: "Categoria", value: expiryForm.category },
                { label: "Responsable", value: expiryForm.owner },
                { label: "Fecha limite", value: expiryForm.dueDate },
              ]),
              action: async () => {
                if (editingExpiryId) {
                  updateAssetExpiry(editingExpiryId, expiryForm);
                } else {
                  createAssetExpiry(expiryForm);
                }

                resetExpiryForm();
              },
            });
          }}
          onDelete={async (item) => {
            await confirmAction({
              title: "Eliminar vencimiento",
              description: "El registro se retirara del activo actual.",
              confirmLabel: "Eliminar registro",
              accent: "rose",
              successTitle: "Registro eliminado",
              successDescription: "La base del activo ya fue actualizada.",
              summary: toSummary([
                { label: "Concepto", value: item.title },
                { label: "Responsable", value: item.owner },
                { label: "Fecha", value: item.dueDate },
              ]),
              action: async () => {
                deleteAssetExpiry(item.id);
              },
            });
          }}
        />
      </section>
    </div>
  );
}

type InsuranceSectionProps = {
  form: InsuranceFormState;
  editingId: string | null;
  items: InsurancePolicy[];
  onChange: Dispatch<SetStateAction<InsuranceFormState>>;
  onCancel: () => void;
  onEdit: (item: InsurancePolicy) => void;
  onSubmit: () => Promise<void>;
  onDelete: (item: InsurancePolicy) => Promise<void>;
};

function InsuranceSection({
  form,
  editingId,
  items,
  onChange,
  onCancel,
  onEdit,
  onSubmit,
  onDelete,
}: InsuranceSectionProps) {
  return (
    <>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          await onSubmit();
        }}
      >
        <SurfaceCard className="p-5">
          <h2 className="text-lg font-semibold text-neutral-950">Seguros vehiculares</h2>
          <div className="mt-5 space-y-4">
            <InputField
              label="Aseguradora"
              value={form.insurer}
              onChange={(value) => onChange((current) => ({ ...current, insurer: value }))}
              accent="sky"
            />
            <InputField
              label="Numero de poliza"
              value={form.policyNumber}
              onChange={(value) => onChange((current) => ({ ...current, policyNumber: value }))}
              accent="sky"
            />
            <InputField
              label="Cobertura"
              value={form.coverage}
              onChange={(value) => onChange((current) => ({ ...current, coverage: value }))}
              accent="sky"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Inicio"
                type="date"
                value={form.startDate}
                onChange={(value) => onChange((current) => ({ ...current, startDate: value }))}
                accent="sky"
              />
              <InputField
                label="Fin"
                type="date"
                value={form.endDate}
                onChange={(value) => onChange((current) => ({ ...current, endDate: value }))}
                accent="sky"
              />
            </div>
            <SelectField
              label="Estado"
              value={form.status}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  status: value as AssetDocumentStatus,
                }))
              }
              accent="sky"
              options={STATUS_OPTIONS}
            />
            <TextareaField
              label="Notas"
              value={form.notes}
              onChange={(value) => onChange((current) => ({ ...current, notes: value }))}
              accent="sky"
              rows={4}
            />
            <div className="flex gap-3">
              <Button type="submit" tone="sky" variant="solid">
                {editingId ? "Guardar seguro" : "Registrar seguro"}
              </Button>
              {editingId ? (
                <Button type="button" tone="neutral" variant="outline" onClick={onCancel}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </div>
        </SurfaceCard>
      </form>

      <TableCard
        title="Tabla / Seguros vehiculares"
        description="Registros visibles con accion directa de edicion y baja."
      >
        {items.length === 0 ? (
          <EmptyState
            title="Sin seguros vehiculares"
            description="Todavia no hay registros asociados a este activo."
          />
        ) : (
          <Table minWidth="min-w-[860px]">
            <TableHead>
              <tr>
                <th className="px-5 py-3 font-semibold">Aseguradora</th>
                <th className="px-5 py-3 font-semibold">Poliza</th>
                <th className="px-5 py-3 font-semibold">Cobertura</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-4 font-semibold text-neutral-950">{item.insurer}</td>
                  <td className="px-5 py-4">{item.policyNumber}</td>
                  <td className="px-5 py-4">{item.coverage}</td>
                  <td className="px-5 py-4">
                    <StatusPill label={item.status} tone={getStatusTone(item.status)} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        tone="sky"
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => onEdit(item)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        tone="danger"
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        onClick={async () => {
                          await onDelete(item);
                        }}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </>
  );
}

type ExpirySectionProps = {
  form: ExpiryFormState;
  editingId: string | null;
  items: AssetExpiry[];
  onChange: Dispatch<SetStateAction<ExpiryFormState>>;
  onCancel: () => void;
  onEdit: (item: AssetExpiry) => void;
  onSubmit: () => Promise<void>;
  onDelete: (item: AssetExpiry) => Promise<void>;
};

function ExpirySection({
  form,
  editingId,
  items,
  onChange,
  onCancel,
  onEdit,
  onSubmit,
  onDelete,
}: ExpirySectionProps) {
  return (
    <>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          await onSubmit();
        }}
      >
        <SurfaceCard className="p-5">
          <h2 className="text-lg font-semibold text-neutral-950">Vencimientos</h2>
          <div className="mt-5 space-y-4">
            <InputField
              label="Concepto"
              value={form.title}
              onChange={(value) => onChange((current) => ({ ...current, title: value }))}
              accent="sky"
            />
            <InputField
              label="Categoria"
              value={form.category}
              onChange={(value) => onChange((current) => ({ ...current, category: value }))}
              accent="sky"
            />
            <InputField
              label="Responsable"
              value={form.owner}
              onChange={(value) => onChange((current) => ({ ...current, owner: value }))}
              accent="sky"
            />
            <InputField
              label="Fecha limite"
              type="date"
              value={form.dueDate}
              onChange={(value) => onChange((current) => ({ ...current, dueDate: value }))}
              accent="sky"
            />
            <SelectField
              label="Estado"
              value={form.status}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  status: value as AssetDocumentStatus,
                }))
              }
              accent="sky"
              options={STATUS_OPTIONS}
            />
            <TextareaField
              label="Notas"
              value={form.notes}
              onChange={(value) => onChange((current) => ({ ...current, notes: value }))}
              accent="sky"
              rows={4}
            />
            <div className="flex gap-3">
              <Button type="submit" tone="sky" variant="solid">
                {editingId ? "Guardar vencimiento" : "Registrar vencimiento"}
              </Button>
              {editingId ? (
                <Button type="button" tone="neutral" variant="outline" onClick={onCancel}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </div>
        </SurfaceCard>
      </form>

      <TableCard
        title="Tabla / Vencimientos"
        description="Registros visibles con accion directa de edicion y baja."
      >
        {items.length === 0 ? (
          <EmptyState
            title="Sin vencimientos"
            description="Todavia no hay registros asociados a este activo."
          />
        ) : (
          <Table minWidth="min-w-[860px]">
            <TableHead>
              <tr>
                <th className="px-5 py-3 font-semibold">Concepto</th>
                <th className="px-5 py-3 font-semibold">Responsable</th>
                <th className="px-5 py-3 font-semibold">Fecha</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-4 font-semibold text-neutral-950">{item.title}</td>
                  <td className="px-5 py-4">{item.owner}</td>
                  <td className="px-5 py-4">{item.dueDate}</td>
                  <td className="px-5 py-4">
                    <StatusPill label={item.status} tone={getStatusTone(item.status)} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        tone="sky"
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => onEdit(item)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        tone="danger"
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        onClick={async () => {
                          await onDelete(item);
                        }}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </>
  );
}
