import { platformPrisma } from '../config/database';

/**
 * LOS DATOS OFICIALES DEL PLANTEL
 *
 * En Venezuela cada liceo está registrado en el Ministerio (MPPE) con varios
 * códigos, y todo documento oficial los lleva en la cabecera: la boleta, la
 * constancia, el resumen final del rendimiento, el plan de evaluación. Son los
 * mismos campos que pide el instructivo del Resumen Final (MPPE):
 *
 *   - **Código DEA** (código del plantel): letras y números, p. ej.
 *     «OD00541105». La primera letra dice la dependencia (O oficial, P privado,
 *     S subvencionado), la segunda el turno (D diurno, N nocturno).
 *   - **Código estadístico**: 6 dígitos; los dos primeros, la zona educativa.
 *   - **Código de dependencia**: 9 dígitos (el plantel como unidad del
 *     presupuesto nacional).
 *   - El **nombre oficial** tal como está en el Sistema de Gestión Escolar del
 *     MPPE (U.E., L.B., U.E.N.…), la **zona educativa**, la **entidad federal**,
 *     el **municipio** y la **parroquia**.
 *
 * Antes solo existía el DEA, escondido en Configuración → Académico →
 * Constancias, y solo lo usaba la constancia. El plan de evaluación llevaba el
 * texto del ministerio escrito a mano en el código.
 *
 * Se guardan con los demás datos de los documentos
 * (`academicConfig.documentos`, en la base de la plataforma: una sola copia).
 */

export { ENTIDADES_FEDERALES } from '../utils/entidades-federales';
import { ENTIDADES_FEDERALES } from '../utils/entidades-federales';

export const TEXTO_DEL_MINISTERIO =
    'República Bolivariana de Venezuela\nMinisterio del Poder Popular para la Educación';

export interface DatosDelPlantel {
    nombreOficial?: string;
    codigoDea?: string;
    codigoEstadistico?: string;
    codigoDependencia?: string;
    zonaEducativa?: string;
    entidadFederal?: string;
    municipio?: string;
    parroquia?: string;
    /** Las líneas de arriba del membrete. Vacío = el del MPPE. */
    textoDelMinisterio?: string;
}

export const CAMPOS_DEL_PLANTEL: (keyof DatosDelPlantel)[] = [
    'nombreOficial',
    'codigoDea',
    'codigoEstadistico',
    'codigoDependencia',
    'zonaEducativa',
    'entidadFederal',
    'municipio',
    'parroquia',
    'textoDelMinisterio',
];

/**
 * Normaliza y revisa lo que manda el admin. Solo mira los campos que vienen:
 * un campo vacío se borra. Los códigos, sin espacios ni guiones (así los pide
 * el MPPE: «sin separación entre ellos»).
 */
export function revisarDatosDelPlantel(entrada: Record<string, unknown>): { datos: Partial<Record<keyof DatosDelPlantel, string | null>>; errores: string[] } {
    const datos: Partial<Record<keyof DatosDelPlantel, string | null>> = {};
    const errores: string[] = [];
    const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

    for (const campo of CAMPOS_DEL_PLANTEL) {
        if (!(campo in entrada)) continue;
        let v = texto(entrada[campo]);
        if (!v) {
            datos[campo] = null;
            continue;
        }
        switch (campo) {
            case 'codigoDea':
                v = v.replace(/[\s-]/g, '').toUpperCase();
                if (!/^[A-Z0-9]{6,12}$/.test(v)) errores.push('El código DEA son de 6 a 12 letras y números, sin espacios (p. ej. OD00541105).');
                break;
            case 'codigoEstadistico':
                v = v.replace(/[\s-]/g, '');
                if (!/^\d{6}$/.test(v)) errores.push('El código estadístico son 6 dígitos.');
                break;
            case 'codigoDependencia':
                v = v.replace(/[\s-]/g, '');
                if (!/^\d{9}$/.test(v)) errores.push('El código de dependencia son 9 dígitos.');
                break;
            case 'entidadFederal':
                if (!(ENTIDADES_FEDERALES as readonly string[]).includes(v)) errores.push('Elige la entidad federal de la lista.');
                break;
            case 'textoDelMinisterio':
                v = v.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4).join('\n').slice(0, 300);
                break;
            default:
                v = v.slice(0, 160);
        }
        datos[campo] = v;
    }
    return { datos, errores };
}

export interface Membrete {
    ministerio: string[];
    nombre: string;
    codigoDea: string | null;
    codigoEstadistico: string | null;
    codigoDependencia: string | null;
    zonaEducativa: string | null;
    entidadFederal: string | null;
    municipio: string | null;
    parroquia: string | null;
    direccion: string | null;
    telefono: string | null;
    logo: string | null;
}

/** Lo que lleva arriba todo documento del liceo. */
export async function membreteDelLiceo(instituteId: string): Promise<Membrete> {
    const liceo = await platformPrisma.institute.findUnique({
        where: { id: instituteId },
        select: { name: true, address: true, city: true, phone: true, logo: true, academicConfig: true },
    });
    const docs = (((liceo?.academicConfig ?? {}) as Record<string, unknown>).documentos ?? {}) as Record<string, string | undefined>;
    const o = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
    return {
        ministerio: (o(docs.textoDelMinisterio) ?? TEXTO_DEL_MINISTERIO).split('\n'),
        nombre: o(docs.nombreOficial) ?? liceo?.name ?? '',
        codigoDea: o(docs.codigoDea),
        codigoEstadistico: o(docs.codigoEstadistico),
        codigoDependencia: o(docs.codigoDependencia),
        zonaEducativa: o(docs.zonaEducativa),
        entidadFederal: o(docs.entidadFederal),
        municipio: o(docs.municipio),
        parroquia: o(docs.parroquia),
        direccion: [liceo?.address, liceo?.city].filter(Boolean).join(', ') || null,
        telefono: liceo?.phone ?? null,
        logo: liceo?.logo ?? null,
    };
}
