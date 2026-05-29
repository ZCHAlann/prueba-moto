"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import {
  DataExportToolbar,
  type ExportColumn,
  type ExportRow,
} from "@/components/ui/data-export-toolbar";
import { InputField, SelectField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { billingStatusOptions, getCompanyName, getPlanName } from "@/features/master/helpers";
import type { BillingRecord, BillingStatus, CompanyPlanId } from "@/types/platform";

type BillingFormState = Omit<BillingRecord, "id">;
type BillingFormErrors = Partial<Record<keyof BillingFormState, string>>;

const exportColumns: ExportColumn[] = [
  { key: "company", label: "Empresa" },
  { key: "plan", label: "Plan" },
  { key: "status", label: "Estado de pago" },
  { key: "renewal", label: "Proxima renovacion" },
  { key: "amount", label: "Monto" },
  { key: "cycle", label: "Ciclo" },
];

function createEmptyForm(companyId: string, planId: CompanyPlanId): BillingFormState {
  return {
    companyId,
    planId,
    paymentStatus: "Pendiente",
    nextRenewal: new Date().toISOString().slice(0, 10),
    amount: "USD 0",
    billingCycle: "Mensual",
  };
}

function validateForm(form: BillingFormState) {
  const errors: BillingFormErrors = {};
  if (!form.companyId) errors.companyId = "Selecciona una empresa.";
  if (!form.amount.trim()) errors.amount = "El monto es obligatorio.";
  if (!form.nextRenewal) errors.nextRenewal = "La fecha es obligatoria.";
  if (!form.billingCycle.trim()) errors.billingCycle = "El ciclo es obligatorio.";
  return errors;
}

export function BillingPage() {
  const { confirmAction, notifyError } = useFeedback();
  const { companies, plans, billing, updateBillingRecord } = usePlatform();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<BillingFormErrors>({});
  const [form, setForm] = useState<BillingFormState>(() =>
    createEmptyForm(companies[0]?.id ?? "", companies[0]?.planId ?? "basic")
  );

  const filteredRows = useMemo(() => {
    const value = query.trim().toLowerCase();
    return billing.filter((record) => {
      const companyName = getCompanyName(companies, record.companyId);
      return (
        value.length === 0 ||
        companyName.toLowerCase().includes(value) ||
        record.amount.toLowerCase().includes(value) ||
        record.paymentStatus.toLowerCase().includes(value)
      );
    });
  }, [billing, companies, query]);

  const exportRows = useMemo<ExportRow[]>(
    () =>
      filteredRows.map((record) => ({
        company: getCompanyName(companies, record.companyId),
        plan: getPlanName(plans, record.planId),
        status: record.paymentStatus,
        renewal: record.nextRenewal,
        amount: record.amount,
        cycle: record.billingCycle,
      })),
    [companies, filteredRows, plans]
  );

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Comercial"
        title="Facturacion central"
        subtitle="Control de plan, pago, renovacion y ciclo comercial por empresa."
        accent="cyan"
        action={
          <Link href="/master/pagos" className="inline-flex">
            <Button tone="cyan" variant="outline" className="px-3 py-2">
              Pagos y pasarelas
            </Button>
          </Link>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Registros" value={billing.length.toString()} detail="Facturacion visible" tone="info" />
        <StatCard label="Al dia" value={billing.filter((record) => record.paymentStatus === "Al dia").length.toString()} detail="Cobro sano" tone="success" />
        <StatCard label="Pendiente" value={billing.filter((record) => record.paymentStatus === "Pendiente").length.toString()} detail="Seguimiento" tone="warning" />
        <StatCard label="Vencido" value={billing.filter((record) => record.paymentStatus === "Vencido").length.toString()} detail="Riesgo comercial" tone="danger" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <SurfaceCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Editar facturacion</h2>
              <p className="mt-1 text-sm text-neutral-500">Actualiza estado de pago, monto y renovacion.</p>
            </div>
            {editingId ? (
              <Button
                tone="neutral"
                variant="outline"
                className="px-3 py-2"
                onClick={() => {
                  setEditingId(null);
                  setErrors({});
                }}
              >
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
                notifyError("Formulario incompleto", "Completa la ficha de facturacion antes de guardar.");
                return;
              }
              if (!editingId) {
                notifyError("Selecciona un registro", "Edita una fila existente para actualizar la facturacion.");
                return;
              }

              const confirmed = await confirmAction({
                title: "Guardar facturacion",
                description: "El estado financiero quedara visible para el equipo comercial y el panel master.",
                confirmLabel: "Guardar cambios",
                accent: "cyan",
                successTitle: "Facturacion actualizada",
                successDescription: "El registro ya quedo actualizado.",
                summary: [
                  { label: "Empresa", value: getCompanyName(companies, form.companyId) },
                  { label: "Estado", value: form.paymentStatus },
                  { label: "Monto", value: form.amount },
                  { label: "Renovacion", value: form.nextRenewal },
                ],
                action: async () => {
                  updateBillingRecord(editingId, form);
                },
              });

              if (confirmed) {
                setEditingId(null);
              }
            }}
          >
            <SelectField
              label="Empresa"
              value={form.companyId}
              onChange={(value) => {
                const company = companies.find((item) => item.id === value);
                setForm((current) => ({
                  ...current,
                  companyId: value,
                  planId: company?.planId ?? current.planId,
                }));
              }}
              accent="cyan"
              error={errors.companyId}
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
            />
            <InputField label="Monto" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} accent="cyan" error={errors.amount} />
            <InputField label="Proxima renovacion" type="date" value={form.nextRenewal} onChange={(value) => setForm((current) => ({ ...current, nextRenewal: value }))} accent="cyan" error={errors.nextRenewal} />
            <InputField label="Ciclo" value={form.billingCycle} onChange={(value) => setForm((current) => ({ ...current, billingCycle: value }))} accent="cyan" error={errors.billingCycle} />
            <SelectField
              label="Estado de pago"
              value={form.paymentStatus}
              onChange={(value) => setForm((current) => ({ ...current, paymentStatus: value as BillingStatus }))}
              accent="cyan"
              options={billingStatusOptions}
            />
            <div className="flex justify-end">
              <Button type="submit" tone="cyan" variant="solid">
                Guardar facturacion
              </Button>
            </div>
          </form>
        </SurfaceCard>

        <TableCard title="Renovaciones y pagos" description="Vista central para seguimiento comercial y administrativo.">
          <DataExportToolbar
            title="facturacion-apli-smart-motors"
            columns={exportColumns}
            rows={exportRows}
            accent="cyan"
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Buscar por empresa o estado"
          />

          {filteredRows.length === 0 ? (
            <EmptyState title="Sin registros" description="No hay facturacion para el filtro actual." />
          ) : (
            <Table minWidth="min-w-[1120px]">
              <TableHead>
                <tr>
                  <th className="px-4 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Renovacion</th>
                  <th className="px-4 py-3 font-semibold">Monto</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </TableHead>
              <TableBody>
                {filteredRows.map((record) => (
                  <tr key={record.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3.5">{getCompanyName(companies, record.companyId)}</td>
                    <td className="px-4 py-3.5">{getPlanName(plans, record.planId)}</td>
                    <td className="px-4 py-3.5">{record.paymentStatus}</td>
                    <td className="px-4 py-3.5">{record.nextRenewal}</td>
                    <td className="px-4 py-3.5">{record.amount}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          tone="cyan"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => {
                            setEditingId(record.id);
                            setErrors({});
                            setForm({
                              companyId: record.companyId,
                              planId: record.planId,
                              paymentStatus: record.paymentStatus,
                              nextRenewal: record.nextRenewal,
                              amount: record.amount,
                              billingCycle: record.billingCycle,
                            });
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          tone="teal"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={async () => {
                            const confirmed = await confirmAction({
                              title: "Marcar al dia",
                              description: "El registro pasara a un estado financiero sano.",
                              confirmLabel: "Confirmar pago",
                              accent: "cyan",
                              successTitle: "Pago confirmado",
                              successDescription: "La facturacion quedo marcada al dia.",
                              summary: [
                                { label: "Empresa", value: getCompanyName(companies, record.companyId) },
                                { label: "Monto", value: record.amount },
                              ],
                              action: async () => {
                                updateBillingRecord(record.id, { ...record, paymentStatus: "Al dia" });
                              },
                            });
                            if (!confirmed) {
                              return;
                            }
                          }}
                        >
                          Marcar al dia
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

