/**
 * LO QUE SE VIO, CAMPO A CAMPO (la configuración hecha sin conexión)
 *
 * Las pantallas de Configuración mandan el formulario entero. Sin conexión,
 * eso pisaría al llegar lo que otro guardó mientras tanto en un campo que esta
 * persona ni tocó. Así que el cambio pendiente lleva `__visto`: por campo, lo
 * que había (la última configuración descargada) y lo que se puso. El
 * servidor aplica lo tocado, deja lo no tocado y pregunta lo que otro cambió
 * (`apps/backend/src/utils/lo-que-se-vio.ts`).
 */

export interface Visto {
    campo: string;
    antes: unknown;
    nuevo: unknown;
}

const APARTE = new Set(['configuration', 'academicConfig', 'confirmarClasesFuera', '__visto', '__decision']);

function comoObjeto(v: unknown): Record<string, any> {
    if (typeof v === 'string') {
        try {
            const o = JSON.parse(v);
            return o && typeof o === 'object' ? o : {};
        } catch {
            return {};
        }
    }
    return v && typeof v === 'object' ? (v as Record<string, any>) : {};
}

/**
 * Cada campo del cuerpo con lo que se veía antes. `base` es la configuración
 * tal cual la da `GET /institutes/current/config` (con `configuration` en texto).
 */
export function camposVistos(datos: Record<string, any>, base: Record<string, any> | null | undefined): Visto[] {
    const b = base ?? {};
    const cfgAntes = comoObjeto(b.configuration ?? b.academicConfig);
    const vistos: Visto[] = [];
    for (const [k, v] of Object.entries(datos)) {
        if (APARTE.has(k)) continue;
        vistos.push({ campo: k, antes: b[k], nuevo: v });
    }
    const cfg = comoObjeto(datos.configuration);
    for (const [k, v] of Object.entries(cfg)) {
        if (APARTE.has(k)) continue;
        if (k === 'documentos' && v && typeof v === 'object') {
            for (const [d, dv] of Object.entries(v)) vistos.push({ campo: `configuration.documentos.${d}`, antes: cfgAntes.documentos?.[d], nuevo: dv });
            continue;
        }
        vistos.push({ campo: `configuration.${k}`, antes: cfgAntes[k], nuevo: v });
    }
    return vistos;
}

/** «Lo del otro» en esos campos: salen del cambio; el resto sigue. */
export function sinLosCampos(datos: Record<string, any>, campos: string[]): Record<string, any> {
    const copia = JSON.parse(JSON.stringify(datos));
    for (const campo of campos) {
        const partes = campo.split('.');
        const ultimo = partes.pop()!;
        let o = copia;
        for (const p of partes) o = o?.[p];
        if (o && typeof o === 'object') delete o[ultimo];
    }
    copia.__visto = (copia.__visto ?? []).filter((v: Visto) => !campos.includes(v.campo));
    return copia;
}

const NOMBRES: Record<string, string> = {
    name: 'el nombre',
    code: 'el código',
    email: 'el correo',
    phone: 'el teléfono',
    address: 'la dirección',
    timezone: 'la zona horaria',
    'configuration.schedule': 'el horario del liceo',
    'configuration.passingGrade': 'la nota mínima',
    'configuration.asistenciaMinima': 'la asistencia mínima',
    'configuration.notifications': 'los avisos',
    'configuration.security': 'la seguridad',
    'configuration.gradeScale': 'la escala de notas',
};

/** Cómo se lee un campo en la pregunta («el teléfono», «municipio»…). */
export function nombreDelCampo(campo: string): string {
    return NOMBRES[campo] ?? campo.split('.').pop()!.replace(/([A-Z])/g, ' $1').toLowerCase();
}

export function valorLegible(v: unknown): string {
    if (v === undefined || v === null || v === '') return 'vacío';
    if (typeof v === 'object') return 'otra configuración';
    return String(v);
}
