// pages/Gestion/Proveedores/page.tsx
// Wrapper que vive en /gestion/proveedores.
// Reusa el SuppliersManager — el header vive DENTRO de la card.

import { SuppliersManager } from "../../Mantenimientos/components/SuppliersManager";

export function GestionProveedoresPage() {
  return (
    <div className="space-y-5">
      <SuppliersManager />
    </div>
  );
}

export default GestionProveedoresPage;
