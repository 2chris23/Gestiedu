/**
 * QUIÉN ES EL TITULAR DE GESTIEDU (para los textos legales)
 *
 * Son datos que no se pueden inventar: los pone quien despliega, en la
 * compilación, como los de la portada (`components/landing/contacto.ts`).
 *
 *   NEXT_PUBLIC_LEGAL_TITULAR    nombre o razón social («Gestiedu, C.A.» o la persona)
 *   NEXT_PUBLIC_LEGAL_RIF        su RIF
 *   NEXT_PUBLIC_LEGAL_CORREO     el correo para lo legal y la privacidad
 *   NEXT_PUBLIC_LEGAL_DIRECCION  su domicilio (ciudad y estado basta)
 *
 * Sin ellos, los textos dicen «el titular de Gestiedu» y mandan al contacto de
 * la portada. `faltan()` lo dice para que no se publique sin completarlos.
 */

export interface Titular {
    nombre: string;
    rif: string | null;
    correo: string | null;
    direccion: string | null;
}

const leer = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function elTitular(): Titular {
    return {
        nombre: leer(process.env.NEXT_PUBLIC_LEGAL_TITULAR) ?? 'el titular de Gestiedu',
        rif: leer(process.env.NEXT_PUBLIC_LEGAL_RIF),
        correo: leer(process.env.NEXT_PUBLIC_LEGAL_CORREO),
        direccion: leer(process.env.NEXT_PUBLIC_LEGAL_DIRECCION),
    };
}

/** Los datos que faltan por poner (para la prueba y para quien despliega). */
export function faltan(): string[] {
    return [
        ['NEXT_PUBLIC_LEGAL_TITULAR', process.env.NEXT_PUBLIC_LEGAL_TITULAR],
        ['NEXT_PUBLIC_LEGAL_RIF', process.env.NEXT_PUBLIC_LEGAL_RIF],
        ['NEXT_PUBLIC_LEGAL_CORREO', process.env.NEXT_PUBLIC_LEGAL_CORREO],
        ['NEXT_PUBLIC_LEGAL_DIRECCION', process.env.NEXT_PUBLIC_LEGAL_DIRECCION],
    ]
        .filter(([, v]) => !leer(v))
        .map(([k]) => k as string);
}

/** Cómo escribir para lo legal: el correo si está; si no, el contacto de la portada. */
export function comoEscribir(t: Titular): string {
    return t.correo ? `al correo ${t.correo}` : 'por el contacto de la página principal de Gestiedu';
}
