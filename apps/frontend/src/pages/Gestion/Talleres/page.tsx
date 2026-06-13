// pages/Gestion/Talleres/page.tsx
// Wrapper que vive en /gestion/talleres.
// Reusa el WorkshopsManager — el header vive DENTRO de la card.

import { WorkshopsManager } from "../../Mantenimientos/components/WorkshopsManager";

export function GestionTalleresPage() {
  return (
    <div className="space-y-5">
      <WorkshopsManager />
    </div>
  );
}

export default GestionTalleresPage;
