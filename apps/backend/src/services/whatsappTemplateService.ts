// services/whatsappTemplateService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Interpolación de placeholders en plantillas WhatsApp (jul 2026 v8.6).
//
// Sintaxis: `{{nombre}}` se reemplaza por data[nombre]. Si la key no
// está en `data` o el valor es null/undefined, se reemplaza por ''.
// Placeholders con caracteres raros (espacios, etc.) se ignoran.
//
// Ejemplo:
//   template = "Hola {{nombre}}, tu pedido #{{id}} está {{estado}}."
//   data     = { nombre: 'Ana', id: 42, estado: 'listo' }
//   result   = "Hola Ana, tu pedido #42 está listo."
//
// SEGURIDAD:
//   El renderTemplate es SOLO sustitución de strings. NO es HTML, NO
//   es Markdown, NO es SQL. Es texto plano que va a WhatsApp. Un
//   usuario malicioso podría poner `{{DROP TABLE}}` en una plantilla
//   y el resultado sería literalmente "{{DROP TABLE}}" en el
//   mensaje de WhatsApp. No hay riesgo de inyección.
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(PLACEHOLDER_RE, (_, key: string) => {
    const v = data[key];
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v instanceof Date) return v.toISOString();
    return JSON.stringify(v);
  });
}

/**
 * Placeholders disponibles documentados. Se exportan para que el
 * frontend (UI de configuración) los muestre como ayuda al admin.
 */
export const PLACEHOLDERS = {
  scheduled: ['{{placa}}', '{{tipo}}', '{{titulo}}', '{{descripcion}}', '{{fecha}}', '{{responsable}}', '{{responsable_linea}}', '{{creado_por}}'],
  completed: ['{{placa}}', '{{tipo}}', '{{titulo}}', '{{descripcion}}', '{{costo}}', '{{fecha_fin}}', '{{responsable}}', '{{responsable_linea}}', '{{observaciones}}', '{{observaciones_linea}}', '{{finalizado_por}}'],
} as const;
