"use client";

import { useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/ui/form-controls";
import { SurfaceCard } from "@/components/ui/surface";

export function ForgotPasswordPage() {
  const { notifyError, notifySuccess } = useFeedback();
  const [email, setEmail] = useState("");

  const handleSubmit = () => {
    if (!email.trim()) {
      notifyError("Correo requerido", "Ingresa un correo valido antes de enviar la solicitud.");
      return;
    }

      notifySuccess("Solicitud enviada", "Te enviaremos una guia de recuperacion al correo indicado.");
    setEmail("");
  };

  return (
    <div className="bg-neutral-100 px-4 py-14 lg:px-6">
      <div className="mx-auto w-full max-w-[640px]">
        <SurfaceCard className="p-6 lg:p-8">
          <h1 className="text-3xl font-bold text-neutral-950">Recuperar acceso</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            Ingresa tu correo y te mostraremos una confirmacion visible del flujo de recuperacion.
          </p>
          <div className="mt-6 space-y-4">
            <InputField
              label="Correo de recuperacion"
              type="email"
              value={email}
              onChange={setEmail}
              accent="teal"
              placeholder="equipo@empresa.com"
            />
            <Button tone="teal" variant="solid" onClick={handleSubmit}>
              Enviar recuperacion
            </Button>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
