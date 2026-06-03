import { db } from '../db/client';
import { platformSettings } from '../db/schema/platform';
import { eq } from 'drizzle-orm';

export interface PasswordError {
  valid: false;
  message: string;
}
export interface PasswordOk {
  valid: true;
}

export async function validatePasswordPolicy(password: string): Promise<PasswordError | PasswordOk> {
  const [s] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1);

  const minLength      = s?.passwordMinLength      ?? 8;
  const requireUpper   = s?.passwordRequireUpper   ?? true;
  const requireNumber  = s?.passwordRequireNumber  ?? true;
  const requireSymbol  = s?.passwordRequireSymbol  ?? false;

  if (password.length < minLength)
    return { valid: false, message: `La contraseña debe tener al menos ${minLength} caracteres.` };
  if (requireUpper && !/[A-Z]/.test(password))
    return { valid: false, message: 'Debe incluir al menos una letra mayúscula.' };
  if (requireNumber && !/[0-9]/.test(password))
    return { valid: false, message: 'Debe incluir al menos un número.' };
  if (requireSymbol && !/[^a-zA-Z0-9]/.test(password))
    return { valid: false, message: 'Debe incluir al menos un símbolo.' };

  return { valid: true };
}