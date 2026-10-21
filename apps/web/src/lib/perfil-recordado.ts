/**
 * QUIÉN USA ESTE TELÉFONO (para la pantalla de bloqueo)
 *
 * La pantalla de bloqueo enseña la foto, el nombre, el rol y el logo del
 * liceo, también sin conexión. Eso se apunta aquí al entrar y al abrir el
 * panel con conexión: la foto y el logo ya reducidos (160 y 256 px), como
 * imagen dentro del propio texto, para no depender del servidor.
 *
 * Es de quien entró: se borra al cerrar sesión (`olvidarElPerfil`). Nada que
 * no se vea ya en la cabecera de la app.
 */

export interface PerfilRecordado {
    /** `<rol>:<id>`: el mismo dueño que lo descargado. */
    dueno: string;
    nombre: string;
    apellido: string;
    rol: 'ADMIN' | 'TEACHER' | 'STUDENT' | 'TUTOR' | string;
    /** «3er Año A» si es alumno. */
    detalle: string | null;
    correo: string;
    foto: string | null;
    logo: string | null;
    liceo: string | null;
    nombreDelLiceo: string | null;
}

const LLAVE = 'gestiedu:perfil-recordado';

export const ROL_LEGIBLE: Record<string, string> = {
    ADMIN: 'Administrador',
    TEACHER: 'Profesor',
    STUDENT: 'Estudiante',
    TUTOR: 'Representante',
};

export function comoSeLee(p: Pick<PerfilRecordado, 'rol' | 'detalle'>): string {
    const rol = ROL_LEGIBLE[p.rol] ?? 'Usuario';
    return p.rol === 'STUDENT' && p.detalle ? `${rol} · ${p.detalle}` : rol;
}

/** u***0@g***l.com: lo justo para reconocerlo, no para copiarlo. */
export function enmascarar(correo: string): string {
    const [usuario = '', dominio = ''] = correo.split('@');
    const tapar = (t: string) => (t.length <= 2 ? `${t[0] ?? ''}*` : `${t[0]}***${t[t.length - 1]}`);
    const [nombreDominio = '', ...resto] = dominio.split('.');
    return dominio ? `${tapar(usuario)}@${tapar(nombreDominio)}${resto.length ? '.' + resto.join('.') : ''}` : tapar(usuario);
}

export function elPerfilRecordado(): PerfilRecordado | null {
    try {
        const p = JSON.parse(localStorage.getItem(LLAVE) || 'null');
        return p && typeof p.dueno === 'string' ? p : null;
    } catch {
        return null;
    }
}

export function recordarElPerfil(cambios: Partial<PerfilRecordado> & { dueno: string }): void {
    try {
        const antes = elPerfilRecordado();
        // Otro dueño: no se hereda nada del anterior (ni su foto).
        const base = antes && antes.dueno === cambios.dueno ? antes : null;
        const p: PerfilRecordado = {
            nombre: '',
            apellido: '',
            rol: '',
            detalle: null,
            correo: '',
            foto: null,
            logo: null,
            liceo: null,
            nombreDelLiceo: null,
            ...base,
            ...cambios,
        };
        localStorage.setItem(LLAVE, JSON.stringify(p));
    } catch {
        /* teléfono lleno: la pantalla saldrá con iniciales */
    }
}

export function olvidarElPerfil(): void {
    try {
        localStorage.removeItem(LLAVE);
    } catch {
        /* nada */
    }
}

/** Una imagen (blob o dirección de la misma web) reducida a `lado` px, como texto. */
export async function reducirImagen(origen: Blob | string, lado: number): Promise<string | null> {
    try {
        const blob = typeof origen === 'string' ? await (await fetch(origen, { credentials: 'same-origin' })).blob() : origen;
        if (!blob.type.startsWith('image/')) return null;
        const bitmap = await createImageBitmap(blob);
        const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.max(1, Math.round(bitmap.width * escala));
        lienzo.height = Math.max(1, Math.round(bitmap.height * escala));
        lienzo.getContext('2d')?.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
        bitmap.close?.();
        // PNG para el logo (puede tener transparencia); se queda pequeño a 256 px.
        return lienzo.toDataURL(blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.85);
    } catch {
        return null;
    }
}
