import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitiza HTML permitiendo solo tags seguros
 * Útil para comentarios con formato básico
 */
export function sanitizeHTML(dirty: string | null | undefined): string {
    if (!dirty) return '';

    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true,
    });
}

/**
 * Sanitiza texto removiendo TODO el HTML
 * Útil para campos de texto plano
 */
export function sanitizeText(text: string | null | undefined): string {
    if (!text) return '';

    return DOMPurify.sanitize(text, {
        ALLOWED_TAGS: [],
        KEEP_CONTENT: true,
    });
}

/**
 * Sanitiza múltiples campos de un objeto
 */
export function sanitizeObject<T extends Record<string, any>>(
    obj: T,
    fields: (keyof T)[],
    mode: 'html' | 'text' = 'text'
): T {
    const sanitized = { ...obj };
    const sanitizer = mode === 'html' ? sanitizeHTML : sanitizeText;

    for (const field of fields) {
        if (typeof sanitized[field] === 'string') {
            sanitized[field] = sanitizer(sanitized[field] as string) as any;
        }
    }

    return sanitized;
}

export default {
    sanitizeHTML,
    sanitizeText,
    sanitizeObject,
};
