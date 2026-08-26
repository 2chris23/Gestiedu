import { z } from 'zod';

/**
 * Validador de contraseñas con política flexible
 * ✅ FLEXIBLE: Solo requiere 8+ caracteres
 * ✅ EDUCATIVO: Calcula y muestra fortaleza al usuario
 */

// Schema de Zod para validación básica de contraseñas
export const PasswordSchema = z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(100, 'La contraseña es demasiado larga (máximo 100 caracteres)');

/**
 * Resultado de la validación de contraseña
 */
export interface PasswordValidationResult {
    valid: boolean;
    errors: string[];
    strength: 'weak' | 'medium' | 'strong' | 'very_strong';
    suggestions?: string[]; // Sugerencias para mejorar la contraseña
}

/**
 * Valida una contraseña contra la política de seguridad
 * Solo requiere 8+ caracteres, pero calcula fortaleza para educar al usuario
 */
export function validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // Validar con Zod schema (solo longitud)
    const result = PasswordSchema.safeParse(password);
    if (!result.success) {
        errors.push(...result.error.errors.map(e => e.message));
    }

    // Calcular fortaleza SIEMPRE (incluso si hay errores de longitud)
    const strength = calculatePasswordStrength(password);

    // Generar sugerencias basadas en la fortaleza
    if (strength === 'weak') {
        if (!/[A-Z]/.test(password)) {
            suggestions.push('Agrega letras mayúsculas para mayor seguridad');
        }
        if (!/[0-9]/.test(password)) {
            suggestions.push('Agrega números para mayor seguridad');
        }
        if (!/[^A-Za-z0-9]/.test(password)) {
            suggestions.push('Agrega caracteres especiales (!@#$%^&*) para mayor seguridad');
        }
        if (password.length < 12) {
            suggestions.push('Considera usar al menos 12 caracteres');
        }
    } else if (strength === 'medium') {
        if (password.length < 12) {
            suggestions.push('Usa 12+ caracteres para una contraseña fuerte');
        }
        if (!/[^A-Za-z0-9]/.test(password)) {
            suggestions.push('Agrega caracteres especiales para mayor seguridad');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        strength,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
}

/**
 * Calcula la fortaleza de una contraseña
 */
function calculatePasswordStrength(password: string): 'weak' | 'medium' | 'strong' | 'very_strong' {
    let score = 0;

    // Longitud
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;

    // Complejidad
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    // Diversidad de caracteres especiales
    const specialChars = password.match(/[^A-Za-z0-9]/g);
    if (specialChars && specialChars.length >= 2) score += 1;

    // Clasificar fortaleza
    if (score <= 3) return 'weak';
    if (score <= 5) return 'medium';
    if (score <= 7) return 'strong';
    return 'very_strong';
}

/**
 * Genera una contraseña aleatoria segura
 * Útil para contraseñas temporales
 */
export function generateSecurePassword(length: number = 12): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    const allChars = uppercase + lowercase + numbers + special;

    let password = '';

    // Asegurar al menos un carácter de cada tipo
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Rellenar el resto
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Mezclar caracteres
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Verifica si una contraseña necesita ser cambiada
 * basado en la fecha de último cambio
 */
export function shouldChangePassword(lastChangedDate: Date, maxDays: number = 90): boolean {
    const now = new Date();
    const daysSinceChange = Math.floor((now.getTime() - lastChangedDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceChange >= maxDays;
}

export default {
    PasswordSchema,
    validatePassword,
    calculatePasswordStrength,
    generateSecurePassword,
    shouldChangePassword,
};
