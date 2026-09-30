import { useAuthStore } from '@/store/auth.store';
import { deQuienEs } from './lo-guardado-en-el-telefono';

/**
 * DE QUIÉN ES LO QUE SE GUARDA EN EL TELÉFONO AHORA: el liceo (cookie) y quien
 * tiene la sesión. Lo usan las respuestas guardadas y lo que espera para
 * subir; si falta cualquiera de los dos, no se guarda nada.
 */
export function elDuenoDeAhora(): string | null {
    if (typeof document === 'undefined') return null;
    const liceo = document.cookie.split('; ').find((c) => c.startsWith('institute_slug='))?.split('=')[1] ?? null;
    return deQuienEs(liceo, useAuthStore.getState().user?.id);
}

/** «Juan Uribe»: para el aviso de «hay cambios de otra persona en este teléfono». */
export function elNombreDeAhora(): string {
    const u = useAuthStore.getState().user as { firstName?: string; lastName?: string } | null;
    return [u?.firstName, u?.lastName].filter(Boolean).join(' ') || 'otra persona';
}
