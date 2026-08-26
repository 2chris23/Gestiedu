import bcrypt from 'bcrypt';

// Número de rondas para el salt (más alto = más seguro pero más lento)
// En producción usa 12 (OWASP recomendado). En desarrollo/tests usa 8 (3x más rápido)
// para que los load tests no saturen el threadpool de libuv.
// IMPORTANTE: bcrypt.compare() auto-detecta el cost del hash almacenado,
// por lo que cambiar esto no rompe las contraseñas existentes.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SALT_ROUNDS = IS_PRODUCTION
  ? parseInt(process.env.BCRYPT_ROUNDS || '12', 10)
  : parseInt(process.env.BCRYPT_ROUNDS || '8', 10);

/**
 * Hashear una contraseña usando bcrypt
 * @param password - Contraseña en texto plano
 * @returns Promise que resuelve al hash de la contraseña
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hash = await bcrypt.hash(password, salt);
    return hash;
  } catch (error) {
    throw new Error('Error al hashear la contraseña');
  }
}

/**
 * Comparar una contraseña en texto plano con su hash
 * @param password - Contraseña en texto plano
 * @param hash - Hash almacenado en la base de datos
 * @returns Promise que resuelve a true si las contraseñas coinciden
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    throw new Error('Error al comparar contraseñas');
  }
}

/**
 * Verificar si una contraseña cumple con los requisitos mínimos
 * @param password - Contraseña a validar
 * @returns Objeto con el resultado de la validación
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Longitud mínima
  if (password.length < 8) {
    errors.push('La contraseña debe tener al menos 8 caracteres');
  }

  // Máxima longitud
  if (password.length > 128) {
    errors.push('La contraseña no puede tener más de 128 caracteres');
  }

  // Al menos una minúscula
  if (!/[a-z]/.test(password)) {
    errors.push('La contraseña debe contener al menos una letra minúscula');
  }

  // Al menos una mayúscula
  if (!/[A-Z]/.test(password)) {
    errors.push('La contraseña debe contener al menos una letra mayúscula');
  }

  // Al menos un número
  if (!/\d/.test(password)) {
    errors.push('La contraseña debe contener al menos un número');
  }

  // Al menos un carácter especial
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('La contraseña debe contener al menos un carácter especial');
  }

  // No espacios en blanco
  if (/\s/.test(password)) {
    errors.push('La contraseña no puede contener espacios en blanco');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Generar una contraseña temporal segura
 * @param length - Longitud de la contraseña (por defecto 12)
 * @returns Contraseña temporal generada
 */
export function generateTemporaryPassword(length: number = 12): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const allChars = lowercase + uppercase + numbers + symbols;

  let password = '';

  // Garantizar al menos un carácter de cada tipo
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // Completar con caracteres aleatorios
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Mezclar la contraseña para evitar patrones predecibles
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

/**
 * Verificar si un hash es válido (formato bcrypt)
 * @param hash - Hash a verificar
 * @returns true si el hash tiene formato válido
 */
export function isValidBcryptHash(hash: string): boolean {
  // Un hash bcrypt válido debe tener el formato: $2b$10$...
  return /^\$2[aby]\$\d{1,2}\$.{53}$/.test(hash);
}

/**
 * Obtener información sobre un hash bcrypt
 * @param hash - Hash a analizar
 * @returns Información sobre el hash
 */
export function getBcryptInfo(hash: string): {
  isValid: boolean;
  version?: string;
  cost?: number;
  salt?: string;
} {
  if (!isValidBcryptHash(hash)) {
    return { isValid: false };
  }

  const parts = hash.split('$');

  return {
    isValid: true,
    version: parts[1], // 2a, 2b, 2y
    cost: parseInt(parts[2]), // número de rondas
    salt: parts[3]?.substring(0, 22), // salt (primeros 22 caracteres)
  };
}

/**
 * Verificar si un hash necesita ser actualizado (si es muy débil)
 * @param hash - Hash a verificar
 * @returns true si el hash necesita actualización
 */
export function needsRehash(hash: string): boolean {
  const info = getBcryptInfo(hash);

  if (!info.isValid || !info.cost) {
    return true;
  }

  // Si el costo es menor al actual, necesita actualización
  return info.cost < SALT_ROUNDS;
}

export default {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  generateTemporaryPassword,
  isValidBcryptHash,
  getBcryptInfo,
  needsRehash,
};
