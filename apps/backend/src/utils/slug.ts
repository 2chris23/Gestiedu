/**
 * Genera un slug URL-friendly a partir de un texto
 * @param text - Texto a convertir en slug
 * @returns Slug en formato kebab-case
 * 
 * @example
 * generateSlug("1er Año A") // "1er-ano-a"
 * generateSlug("5to Grado B") // "5to-grado-b"
 * generateSlug("Educación Física") // "educacion-fisica"
 */
export function generateSlug(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD') // Descomponer caracteres con acentos
        .replace(/[\u0300-\u036f]/g, '') // Eliminar marcas diacríticas (acentos)
        .replace(/[^a-z0-9\s-]/g, '') // Solo letras, números, espacios y guiones
        .trim()
        .replace(/\s+/g, '-') // Espacios a guiones
        .replace(/-+/g, '-'); // Múltiples guiones consecutivos a uno solo
}
