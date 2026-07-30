// components/ui/id-card/index.ts
//
// jul 2026 — Re-export del IDCardModal para uso cross-módulo.
// Original: pages/Accesos/Usuarios/components/IDCardModal.tsx
// (es la única implementación; acá solo se re-exporta para que
//  /pages/Gestion/Drivers y cualquier otro módulo pueda importarlo
//  desde una ruta estable sin depender de la página de Usuarios).
//
// Por qué NO mover el archivo: ya está bien donde está y moverlo
// obligaría a reescribir varios imports relativos. El barrel es
// suficiente para evitar el "componente compartido importado de una
// página" — gotcha que rompe Vite en runtime (ver perfil).
export { IDCardModal } from "@/pages/Accesos/Usuarios/components/IDCardModal";
