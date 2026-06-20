// Mapeo legible de entidades y acciones de company_audit_entries
// hacia etiquetas amigables en español, con color de acento por entidad.
// Mantener sincronizado con los valores que guarda el backend en
// `company_audit_entries.entity` y `.action`.

export interface EntityMeta {
  label: string;
  color: string;     // clase de Tailwind para el dot/badge
  text: string;      // clase de Tailwind para el texto del nombre
}

export const ENTITY_META: Record<string, EntityMeta> = {
  company_assets:            { label: "Activos",                color: "bg-violet-500",  text: "text-violet-300" },
  company_drivers:           { label: "Conductores",            color: "bg-amber-500",   text: "text-amber-300" },
  company_assignments:       { label: "Asignaciones",           color: "bg-cyan-500",    text: "text-cyan-300" },
  company_fuel_entries:      { label: "Combustible",            color: "bg-sky-500",     text: "text-sky-300" },
  company_maintenances:      { label: "Mantenimientos",         color: "bg-emerald-500", text: "text-emerald-300" },
  company_checklists:        { label: "Inspecciones",           color: "bg-fuchsia-500", text: "text-fuchsia-300" },
  company_checklist_categories: { label: "Categorías de inspección", color: "bg-pink-500", text: "text-pink-300" },
  company_ac_units:          { label: "Unidades de AC",         color: "bg-rose-500",    text: "text-rose-300" },
  company_ac_services:       { label: "Servicios de AC",        color: "bg-red-500",     text: "text-red-300" },
  company_insurance_policies: { label: "Pólizas de seguro",     color: "bg-indigo-500",  text: "text-indigo-300" },
  company_inventory:         { label: "Inventario",             color: "bg-orange-500",  text: "text-orange-300" },
  company_garages:           { label: "Garajes",                color: "bg-teal-500",    text: "text-teal-300" },
  company_sites:             { label: "Sedes",                  color: "bg-blue-500",    text: "text-blue-300" },
  company_alerts:            { label: "Alertas",                color: "bg-red-500",     text: "text-red-300" },
  company_workshops:         { label: "Talleres",               color: "bg-orange-500",  text: "text-orange-300" },
  company_suppliers:         { label: "Proveedores",            color: "bg-amber-500",   text: "text-amber-300" },
  company_users:             { label: "Usuarios",               color: "bg-slate-500",   text: "text-slate-300" },
  company_settings:          { label: "Configuración",          color: "bg-gray-500",    text: "text-gray-300" },
  exit_authorizations:       { label: "Salidas autorizadas",    color: "bg-yellow-500",  text: "text-yellow-300" },
  driver_reports:            { label: "Reportes de conductor",  color: "bg-purple-500",  text: "text-purple-300" },
  geofences:                 { label: "Geocercas",              color: "bg-green-500",   text: "text-green-300" },
  geofence_alerts:           { label: "Alertas de geocerca",    color: "bg-emerald-500", text: "text-emerald-300" },
  company_maintenance_records: { label: "Registros de mantenimiento", color: "bg-emerald-500", text: "text-emerald-300" },
  checklist_templates:       { label: "Plantillas de inspección", color: "bg-fuchsia-500", text: "text-fuchsia-300" },
  plantilla:                 { label: "Plantilla",              color: "bg-fuchsia-500", text: "text-fuchsia-300" },
  preoperational:            { label: "Preoperacional",         color: "bg-pink-500",    text: "text-pink-300" },
};

export interface ActionMeta {
  label: string;
}

export const ACTION_META: Record<string, ActionMeta> = {
  create:  { label: "Creó" },
  update:  { label: "Actualizó" },
  delete:  { label: "Eliminó" },
  finalize: { label: "Finalizó" },
  approve: { label: "Aprobó" },
  reject:  { label: "Rechazó" },
  assign:  { label: "Asignó" },
  unassign: { label: "Desasignó" },
  start:   { label: "Inició" },
  complete: { label: "Completó" },
  cancel:  { label: "Canceló" },
  archive: { label: "Archivó" },
  restore: { label: "Restauró" },
  login:   { label: "Inició sesión" },
  logout:  { label: "Cerró sesión" },
  export:  { label: "Exportó" },
  import:  { label: "Importó" },
  upload:  { label: "Subió" },
  download: { label: "Descargó" },
  view:    { label: "Consultó" },
  send:    { label: "Envió" },
  receive: { label: "Recibió" },
  schedule: { label: "Agendó" },
  reschedule: { label: "Reagendó" },
  reopen:  { label: "Reabrió" },
  close:   { label: "Cerró" },
  open:    { label: "Abrió" },
  register: { label: "Registró" },
  check:   { label: "Verificó" },
};

export function getEntityLabel(entity: string): string {
  return ENTITY_META[entity]?.label ?? humanize(entity);
}

export function getEntityMeta(entity: string): EntityMeta {
  return ENTITY_META[entity] ?? { label: humanize(entity), color: "bg-slate-500", text: "text-slate-300" };
}

export function getActionLabel(action: string): string {
  return ACTION_META[action]?.label ?? humanize(action);
}

function humanize(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, c => c.toUpperCase());
}
