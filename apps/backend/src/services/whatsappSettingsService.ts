// services/whatsappSettingsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Resolución de la configuración efectiva de WhatsApp por empresa (jul 2026 v8.6).
//
// PRIORIDAD de resolución (de mayor a menor):
//   1. Fila en `company_whatsapp_settings` (configurada por la empresa).
//   2. WHATSAPP_NOTIFY_NUMBERS del .env + plantillas hardcoded (defaults).
//
// Si la empresa tiene fila pero `enabled = false`, NO se envía nada.
// Si la empresa no tiene fila, usamos los defaults globales.
// ─────────────────────────────────────────────────────────────────────────────

import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { companyWhatsappSettings } from '../db/schema/whatsapp';

const DEFAULT_TEMPLATE_SCHEDULED = `🚗 *Nuevo mantenimiento agendado*

• Vehículo: {{placa}}
• Tipo: {{tipo}}
• Título: {{titulo}}
• Descripción: {{descripcion}}
• Fecha programada: {{fecha}}
{{responsable_linea}}`;

const DEFAULT_TEMPLATE_COMPLETED = `✅ *Mantenimiento finalizado*

• Vehículo: {{placa}}
• Tipo: {{tipo}}
• Título: {{titulo}}
• Descripción: {{descripcion}}
• Costo total: \${{costo}}
• Fecha de finalización: {{fecha_fin}}
{{responsable_linea}}
{{observaciones_linea}}`;

function getEnvDefaultNumbers(): string[] {
  const raw = process.env.WHATSAPP_NOTIFY_NUMBERS || '';
  return raw
    .split(',')
    .map(n => n.trim().replace(/[^\d]/g, ''))
    .filter(n => n.length > 0);
}

export interface EffectiveWhatsappConfig {
  enabled: boolean;
  notifyNumbers: string[];
  templateScheduled: string;
  templateCompleted: string;
  source: 'company' | 'default';  // para logging/debug
}

/**
 * Devuelve la config efectiva de WhatsApp para una empresa. Aplica
 * la cascada: fila de la empresa > defaults globales.
 */
export async function getEffectiveWhatsappConfig(companyId: number): Promise<EffectiveWhatsappConfig> {
  const [row] = await db
    .select()
    .from(companyWhatsappSettings)
    .where(eq(companyWhatsappSettings.companyId, companyId))
    .limit(1);

  if (row) {
    const hasNumbers = row.notifyNumbers && row.notifyNumbers.length > 0;
    return {
      enabled:            row.enabled,
      notifyNumbers:      hasNumbers ? row.notifyNumbers : getEnvDefaultNumbers(),
      templateScheduled:  row.templateScheduled ?? DEFAULT_TEMPLATE_SCHEDULED,
      templateCompleted:  row.templateCompleted ?? DEFAULT_TEMPLATE_COMPLETED,
      source: 'company',
    };
  }

  // No hay fila: defaults globales.
  return {
    enabled:            true,
    notifyNumbers:      getEnvDefaultNumbers(),
    templateScheduled:  DEFAULT_TEMPLATE_SCHEDULED,
    templateCompleted:  DEFAULT_TEMPLATE_COMPLETED,
    source: 'default',
  };
}
