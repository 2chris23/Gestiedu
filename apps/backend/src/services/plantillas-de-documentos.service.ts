import { platformPrisma } from '../config/database';
import { createError } from '../middleware/error.middleware';

/**
 * LAS PLANTILLAS DE LAS CONSTANCIAS
 *
 * Cada liceo escribe sus constancias a su manera; el sistema trae el texto de
 * siempre (el que usa control de estudios con el formato del MPPE) y el liceo
 * lo cambia en Configuración → Documentos. El texto lleva **marcadores** entre
 * llaves que el servidor rellena con los datos del alumno: `{alumno}`,
 * `{cedula}`, `{grado}`…
 *
 * Se rellena en el servidor y sale como TEXTO, nunca como HTML: un nombre o
 * una plantilla con `<script>` se ve tal cual, no se ejecuta. Un marcador que
 * no existe se rechaza al guardar (400 `MARCADOR_DESCONOCIDO`): si no, la
 * constancia saldría con «{alumnno}» impreso.
 *
 * Pruebas: `tests/integration/documentos-oficiales.test.ts` (DOC-*).
 */

export type TipoDePlantilla =
    | 'ESTUDIO'
    | 'BUENA_CONDUCTA'
    | 'PROSECUCION'
    | 'RETIRO'
    | 'INSCRIPCION'
    | 'LABOR_SOCIAL'
    | 'PLANILLA_INSCRIPCION';
export const TIPOS_DE_PLANTILLA: TipoDePlantilla[] = [
    'ESTUDIO',
    'BUENA_CONDUCTA',
    'PROSECUCION',
    'RETIRO',
    'INSCRIPCION',
    'LABOR_SOCIAL',
    'PLANILLA_INSCRIPCION',
];
export const esTipoDePlantilla = (v: unknown): v is TipoDePlantilla => typeof v === 'string' && (TIPOS_DE_PLANTILLA as string[]).includes(v);

/** Cómo se llama cada documento en la pantalla de Configuración → Documentos. */
export const NOMBRE_DE_LA_PLANTILLA: Record<TipoDePlantilla, string> = {
    ESTUDIO: 'Constancia de estudio',
    BUENA_CONDUCTA: 'Constancia de buena conducta',
    PROSECUCION: 'Constancia de prosecución',
    RETIRO: 'Constancia de retiro',
    INSCRIPCION: 'Constancia de inscripción',
    LABOR_SOCIAL: 'Constancia de labor social',
    PLANILLA_INSCRIPCION: 'Planilla de inscripción (declaración)',
};

/** Marcador → [qué pone, un ejemplo para la vista previa]. */
type Marcadores = Record<string, [string, string]>;

/** Los del plantel: valen en TODO documento. */
const DEL_PLANTEL: Marcadores = {
    liceo: ['El nombre oficial del plantel', 'U.E.N. Liceo Ejemplo'],
    codigoDea: ['El código DEA del plantel', 'OD00541105'],
    firmante: ['Quien firma, con su cédula si está puesta', 'Carmen Páez, titular de la cédula de identidad V-9876543'],
    cargo: ['El cargo de quien firma', 'Directora'],
    lugarYFecha: ['«en Caracas, a los 25 días del mes de…»', 'en Valencia, a los 27 días del mes de septiembre de 2026'],
};

/** Los del alumno: valen en los documentos de un alumno. */
const DEL_ALUMNO: Marcadores = {
    alumno: ['Nombres y apellidos del alumno', 'María Pérez'],
    tipoDeCedula: ['«cédula de identidad» o «cédula escolar»', 'cédula de identidad'],
    cedula: ['La cédula del alumno', 'V-30123456'],
    grado: ['El año que cursa (p. ej. «3er año»)', '3er año'],
    seccion: ['La letra de la sección', 'A'],
    turno: ['«mañana», «tarde» o «integral»', 'mañana'],
    ciclo: ['El año escolar (p. ej. «2026-2027»)', '2026-2027'],
    nivel: ['«Educación Media General» o «Media Técnica»', 'Educación Media General'],
    cursa: ['«cursa» si estudia hoy, «cursó» si ya no', 'cursa'],
};

/** Los que solo tienen sentido en uno. */
const PROPIOS: Partial<Record<TipoDePlantilla, Marcadores>> = {
    PROSECUCION: { gradoSiguiente: ['El año al que puede proseguir (p. ej. «4to año»)', '4to año'] },
    RETIRO: { fechaDeRetiro: ['El día en que se retiró', '15 de marzo de 2027'] },
    LABOR_SOCIAL: {
        horas: ['Las horas de labor social cumplidas', '60'],
        proyecto: ['« en el proyecto …», si lo tiene', ' en el proyecto «Huerto escolar»'],
    },
    PLANILLA_INSCRIPCION: {
        representante: ['Nombres y apellidos del representante', 'José Pérez'],
        cedulaDelRepresentante: ['La cédula del representante', 'V-12345678'],
    },
};

/**
 * Qué grupos de marcadores lleva cada documento, además de los del plantel.
 * Sin decir nada, los del alumno (las constancias son de un alumno).
 */
const GRUPOS: Partial<Record<TipoDePlantilla, Marcadores[]>> = {};

function marcadoresCompletos(tipo: TipoDePlantilla): Marcadores {
    const grupos = GRUPOS[tipo] ?? [DEL_ALUMNO];
    return Object.assign({}, DEL_PLANTEL, ...grupos, PROPIOS[tipo] ?? {});
}

/** Los marcadores de un documento, con lo que ponen. */
export function marcadoresDe(tipo: TipoDePlantilla): Record<string, string> {
    return Object.fromEntries(Object.entries(marcadoresCompletos(tipo)).map(([m, [que]]) => [m, que]));
}

/** Un ejemplo de cada marcador, para la vista previa. */
export function ejemploDe(tipo: TipoDePlantilla): Record<string, string> {
    return Object.fromEntries(Object.entries(marcadoresCompletos(tipo)).map(([m, [, ej]]) => [m, ej]));
}

const ENCABEZADO = 'Quien suscribe, {firmante}, en su carácter de {cargo} de {liceo}, hace constar por medio de la presente que el (la) estudiante {alumno}, titular de la {tipoDeCedula} {cedula},';
const PIE = 'Constancia que se expide a petición de la parte interesada {lugarYFecha}.';

export const PLANTILLAS_POR_DEFECTO: Record<TipoDePlantilla, { titulo: string; texto: string }> = {
    ESTUDIO: {
        titulo: 'Constancia de estudio',
        texto: `${ENCABEZADO} cursa estudios de {nivel} en esta institución, en el {grado}, sección «{seccion}», turno de la {turno}, durante el año escolar {ciclo}.\n\n${PIE}`,
    },
    BUENA_CONDUCTA: {
        titulo: 'Constancia de buena conducta',
        texto: `${ENCABEZADO} {cursa} estudios de {nivel} en esta institución ({grado}, sección «{seccion}», año escolar {ciclo}) y durante su permanencia en ella ha observado buena conducta.\n\n${PIE}`,
    },
    PROSECUCION: {
        titulo: 'Constancia de prosecución',
        texto: `${ENCABEZADO} cursó y aprobó el {grado} de {nivel} en esta institución durante el año escolar {ciclo}, por lo que puede proseguir estudios en el {gradoSiguiente}.\n\n${PIE}`,
    },
    RETIRO: {
        titulo: 'Constancia de retiro',
        texto: `${ENCABEZADO} cursó estudios de {nivel} en esta institución en el {grado}, sección «{seccion}», durante el año escolar {ciclo}, y se retiró del plantel el {fechaDeRetiro}.\n\n${PIE}`,
    },
    INSCRIPCION: {
        titulo: 'Constancia de inscripción',
        texto: `${ENCABEZADO} está formalmente inscrito(a) en esta institución para cursar el {grado}, sección «{seccion}», turno de la {turno}, de {nivel}, en el año escolar {ciclo}.\n\n${PIE}`,
    },
    LABOR_SOCIAL: {
        titulo: 'Constancia de labor social',
        texto: `${ENCABEZADO} cursante del {grado} de {nivel}, cumplió {horas} horas de labor social comunitaria{proyecto} durante el año escolar {ciclo}, requisito para optar al título de Bachiller (artículo 27 del Reglamento de la Ley Orgánica de Educación).\n\n${PIE}`,
    },
    PLANILLA_INSCRIPCION: {
        titulo: 'Planilla de inscripción',
        texto:
            'Yo, {representante}, titular de la cédula de identidad {cedulaDelRepresentante}, representante del (la) estudiante {alumno}, declaro que los datos de esta planilla son ciertos y me comprometo a cumplir y hacer cumplir las normas de convivencia de {liceo} durante el año escolar {ciclo}.',
    },
};

const MARCADOR = /\{([a-zA-Z]+)\}/g;

/** Los marcadores que usa un texto y no existen para ese tipo. */
export function marcadoresDesconocidos(tipo: TipoDePlantilla, texto: string): string[] {
    const validos = marcadoresDe(tipo);
    const malos = new Set<string>();
    for (const m of texto.matchAll(MARCADOR)) if (!(m[1] in validos)) malos.add(m[1]);
    return [...malos];
}

/** Rellena los marcadores. Lo que no tiene valor queda vacío. Devuelve TEXTO. */
export function rellenar(texto: string, valores: Record<string, string | null | undefined>): string {
    return texto.replace(MARCADOR, (_, nombre: string) => valores[nombre] ?? '');
}

/** Los párrafos de la constancia, ya rellenos (separados por una línea en blanco). */
export function parrafosDe(texto: string, valores: Record<string, string | null | undefined>): string[] {
    return rellenar(texto, valores)
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}

async function guardadas(instituteId: string): Promise<Partial<Record<TipoDePlantilla, { titulo: string; texto: string }>>> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    const p = ((inst?.academicConfig ?? {}) as Record<string, any>).plantillas;
    return p && typeof p === 'object' ? p : {};
}

/** La plantilla que usa el liceo para ese tipo: la suya o la de siempre. */
export async function plantillaDe(instituteId: string, tipo: TipoDePlantilla): Promise<{ titulo: string; texto: string; propia: boolean }> {
    const suya = (await guardadas(instituteId))[tipo];
    if (suya && typeof suya.titulo === 'string' && typeof suya.texto === 'string') return { ...suya, propia: true };
    return { ...PLANTILLAS_POR_DEFECTO[tipo], propia: false };
}

/** Todas, con sus marcadores: para la pantalla de Configuración → Documentos. */
export async function todasLasPlantillas(instituteId: string) {
    const suyas = await guardadas(instituteId);
    return TIPOS_DE_PLANTILLA.map((tipo) => {
        const suya = suyas[tipo];
        return {
            tipo,
            nombre: NOMBRE_DE_LA_PLANTILLA[tipo],
            ejemplo: ejemploDe(tipo),
            titulo: suya?.titulo ?? PLANTILLAS_POR_DEFECTO[tipo].titulo,
            texto: suya?.texto ?? PLANTILLAS_POR_DEFECTO[tipo].texto,
            propia: !!suya,
            porDefecto: PLANTILLAS_POR_DEFECTO[tipo],
            marcadores: marcadoresDe(tipo),
        };
    });
}

/**
 * Guarda la plantilla del liceo para un tipo (o la quita, con `null`, y
 * vuelve la de siempre). Se mezcla con el resto de la configuración.
 */
export async function guardarPlantilla(instituteId: string, tipo: TipoDePlantilla, plantilla: { titulo: unknown; texto: unknown } | null) {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    const config = ((inst?.academicConfig ?? {}) as Record<string, any>) || {};
    const plantillas = { ...(config.plantillas ?? {}) };
    if (plantilla === null) {
        delete plantillas[tipo];
    } else {
        const titulo = typeof plantilla.titulo === 'string' ? plantilla.titulo.trim() : '';
        const texto = typeof plantilla.texto === 'string' ? plantilla.texto.replace(/\r\n/g, '\n').trim() : '';
        if (titulo.length < 3 || titulo.length > 80) throw createError(400, 'El título va de 3 a 80 letras', 'PLANTILLA_INVALIDA');
        if (texto.length < 20 || texto.length > 3000) throw createError(400, 'El texto va de 20 a 3000 letras', 'PLANTILLA_INVALIDA');
        const malos = marcadoresDesconocidos(tipo, texto);
        if (malos.length > 0) {
            throw createError(400, `Estos marcadores no existen en esta constancia: ${malos.map((m) => `{${m}}`).join(', ')}`, 'MARCADOR_DESCONOCIDO');
        }
        plantillas[tipo] = { titulo, texto };
    }
    await platformPrisma.institute.update({ where: { id: instituteId }, data: { academicConfig: { ...config, plantillas } } });
    return plantillaDe(instituteId, tipo);
}
