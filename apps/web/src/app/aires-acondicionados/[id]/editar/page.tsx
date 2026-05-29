import { AcFormPage } from "@/features/aires-acondicionados/ac-form-page";

export default function AcEditRoute({ params }: { params: { id: string } }) {
  return <AcFormPage mode="edit" unitId={params.id} />;
}
