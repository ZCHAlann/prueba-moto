"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useMotors } from "../../hooks/useMotors";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { getMotorFormValues, MotorForm, type MotorFormErrors, validateMotor } from "@/features/motores/motor-form";

type MotorFormPageProps = {
  mode: "create" | "edit";
  motorId?: string;
};

export function MotorFormPage({ mode, motorId }: MotorFormPageProps) {
  const router = useRouter();
  const { motors, createMotor, updateMotor } = useMotors();
  const { confirmAction, notifyError } = useFeedback();
  const motor = useMemo(() => motors.find((item) => item.id === motorId), [motorId, motors]);
  const [values, setValues] = useState(() => getMotorFormValues(motor));
  const [errors, setErrors] = useState<MotorFormErrors>({});

  const submit = async () => {
    const nextErrors = validateMotor(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      notifyError("Formulario incompleto", "Completa la informacion tecnica del motor antes de guardar.");
      return;
    }

    await confirmAction({
      title: mode === "create" ? "Confirmar nuevo motor" : "Confirmar actualizacion del motor",
      description: mode === "create" ? "El motor quedara disponible en el dominio tecnico de ApliSmart Motors." : "Se actualizaran los datos tecnicos y operativos del motor.",
      confirmLabel: mode === "create" ? "Crear motor" : "Guardar cambios",
      accent: "orange",
      successTitle: mode === "create" ? "Motor creado" : "Motor actualizado",
      successDescription: "La informacion del motor ya fue registrada.",
      summary: [
        { label: "Codigo", value: values.internalCode },
        { label: "Serie", value: values.serial },
        { label: "Marca / modelo", value: `${values.brand} ${values.model}`.trim() },
        { label: "Estado", value: values.status },
      ],
      action: async () => {
      const payload = { ...values, assetType: "Motor" as const };
      if (mode === "create") {
        const id = await createMotor(payload);
        if (id) router.push(`/motores/${id}`);
      } else {
        const ok = await updateMotor(motorId ?? "", payload);
        if (ok) router.push(`/motores/${motorId}`);
      }
},
    });
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge={mode === "create" ? "Nuevo motor" : "Editar motor"}
        title={mode === "create" ? "Alta de motor" : `Editar ${motor?.internalCode ?? "motor"}`}
        subtitle="Formulario tecnico especializado para motores, con validacion, confirmacion y salida consistente."
        accent="orange"
      />
      <MotorForm
        values={values}
        errors={errors}
        submitLabel={mode === "create" ? "Crear motor" : "Guardar cambios"}
        onChange={(key, value) => setValues((current) => ({ ...current, [key]: key === "hoursUsed" ? Number(value || "0") : value }))}
        onSubmit={submit}
      />
    </div>
  );
}
