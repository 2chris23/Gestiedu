/**
 * EL GUION DEL ESCAPARATE
 *
 * Todo lo que pasa en los tres aparatos de la portada sale de aquí, y de un
 * solo número: el PASO en que va el reloj (`useReloj`). Cada escena dura unos
 * cuantos pasos, y lo que enseña cada pantalla es una función pura del paso.
 * Así no hay temporizadores sueltos por cada pantalla que se desincronicen, y
 * pausar es tan simple como dejar de contar.
 *
 * Los datos son de mentira, pero verosímiles: nombres venezolanos corrientes
 * inventados (ninguno es de una persona real), un 1er Año A de Matemáticas,
 * la escala del 1 al 20 que trae el sistema por defecto y 32 alumnos.
 */

export type Aparato = 'portatil' | 'tableta' | 'telefono';

export type IdDeEscena = 'asistencia' | 'notas' | 'horario' | 'qr' | 'cifras';

export interface Escena {
    id: IdDeEscena;
    /** Cuántos pasos dura. */
    pasos: number;
    /** El aparato que «se usa» en esta escena: se adelanta un poco. */
    activo: Aparato;
    /** Nombre corto, para la fila de escenas bajo los aparatos. */
    titulo: string;
    /** Lo que se ve, dicho con palabras: es el texto de verdad de la escena. */
    texto: string;
}

/** Lo que dura un paso. Un toque cada paso se lee sin prisa. */
export const PASO_MS = 950;

export const ESCENAS: Escena[] = [
    {
        id: 'asistencia',
        pasos: 9,
        activo: 'telefono',
        titulo: 'Asistencia',
        texto: 'El profesor pasa asistencia desde su teléfono, de un toque por alumno, y la cuenta sube sola.',
    },
    {
        id: 'notas',
        pasos: 8,
        activo: 'tableta',
        titulo: 'Notas',
        texto: 'Pone una nota y el promedio de la sección se recalcula en el acto, con la escala del liceo.',
    },
    {
        id: 'horario',
        pasos: 8,
        activo: 'portatil',
        titulo: 'Horario en vivo',
        texto: 'El horario de hoy pasa solo a la hora siguiente, y desde ahí se entra a la clase.',
    },
    {
        id: 'qr',
        pasos: 9,
        activo: 'tableta',
        titulo: 'Asistencia por QR',
        texto: 'Los alumnos escanean un QR que cambia cada 10 segundos, y sus nombres van entrando en la lista.',
    },
    {
        id: 'cifras',
        pasos: 8,
        activo: 'portatil',
        titulo: 'Cifras del lapso',
        texto: 'La dirección ve el promedio, la asistencia y quién está en riesgo, con sus barras.',
    },
];

export const PASOS_DEL_CICLO = ESCENAS.reduce((n, e) => n + e.pasos, 0);

/** Dónde empieza cada escena, en pasos desde el principio del ciclo. */
export const INICIO_DE: Record<IdDeEscena, number> = (() => {
    const r = {} as Record<IdDeEscena, number>;
    let n = 0;
    for (const e of ESCENAS) {
        r[e.id] = n;
        n += e.pasos;
    }
    return r;
})();

export interface Momento {
    escena: Escena;
    indice: number;
    /** El paso dentro de la escena (0 = acaba de empezar). */
    paso: number;
}

export function momentoDe(pasoGlobal: number): Momento {
    let resto = ((pasoGlobal % PASOS_DEL_CICLO) + PASOS_DEL_CICLO) % PASOS_DEL_CICLO;
    for (let i = 0; i < ESCENAS.length; i++) {
        if (resto < ESCENAS[i].pasos) return { escena: ESCENAS[i], indice: i, paso: resto };
        resto -= ESCENAS[i].pasos;
    }
    return { escena: ESCENAS[0], indice: 0, paso: 0 };
}

/**
 * La foto fija, para quien pide «menos movimiento»: la asistencia ya pasada
 * (18 de 32), las notas ya puestas y el horario en su hora. Es el final de la
 * escena de notas: se ven tres pantallas distintas y todas completas.
 */
export const PASO_QUIETO = INICIO_DE.notas + ESCENAS[1].pasos - 1;

// ─── Los datos de mentira ──────────────────────────────────────────────────

export const SECCION = '1er Año A';
export const MATERIA = 'Matemáticas';
export const PROFESOR = 'Prof. Andrés Salazar';
export const TOTAL_ALUMNOS = 32;

/** Los que ya estaban presentes antes de empezar a marcar. */
export const PRESENTES_AL_EMPEZAR = 12;

export interface Alumno {
    nombre: string;
    cedula: string;
    /** Color del círculo de las iniciales, como `UserAvatar`. */
    color: string;
}

export const ALUMNOS: Alumno[] = [
    { nombre: 'Valentina Rojas', cedula: 'V-31.482.117', color: 'bg-orange-700' },
    { nombre: 'Santiago Pérez', cedula: 'V-31.905.264', color: 'bg-blue-600' },
    { nombre: 'Camila Hernández', cedula: 'V-32.114.830', color: 'bg-emerald-700' },
    { nombre: 'Diego Morales', cedula: 'V-31.377.552', color: 'bg-violet-600' },
    { nombre: 'Isabella Gutiérrez', cedula: 'V-32.046.391', color: 'bg-rose-600' },
    { nombre: 'Samuel Castillo', cedula: 'V-31.690.028', color: 'bg-cyan-700' },
    { nombre: 'Paola Contreras', cedula: 'V-31.558.740', color: 'bg-amber-700' },
    { nombre: 'Miguel Ángel Rivas', cedula: 'V-32.201.965', color: 'bg-indigo-600' },
];

export const iniciales = (nombre: string) =>
    nombre
        .split(' ')
        .slice(0, 2)
        .map((p) => p[0])
        .join('');

/** Los que entran por QR, en orden. */
export const ENTRAN_POR_QR = [
    { nombre: 'Luis Ramírez', hora: '07:02' },
    { nombre: 'Andrea Mendoza', hora: '07:02' },
    { nombre: 'José Gregorio Díaz', hora: '07:03' },
    { nombre: 'Mariana Suárez', hora: '07:03' },
    { nombre: 'Gabriel Torres', hora: '07:03' },
    { nombre: 'Daniela Medina', hora: '07:04' },
    { nombre: 'Sebastián Vargas', hora: '07:04' },
];

/**
 * El plan de evaluación del lapso: tres evaluaciones con su peso. La nota de
 * cada alumno es el promedio ponderado de lo que ya tiene cargado, como hace
 * el sistema con el plan de evaluación (MAPA_DE_CALCULOS).
 */
export const EVALUACIONES = [
    { nombre: 'Prueba corta', peso: 25 },
    { nombre: 'Taller', peso: 35 },
    { nombre: 'Examen', peso: 40 },
];

/** Las notas antes de empezar. `null` = aún sin nota en el examen. */
export const NOTAS_AL_EMPEZAR: (number | null)[][] = [
    [16, 15, null],
    [12, 14, null],
    [18, 17, 19],
    [9, 11, null],
    [14, 16, 15],
    [13, 12, 14],
    [17, 18, 16],
    [11, 13, 12],
];

/** Lo que el profesor pone durante la escena: [fila, nota], una por toque. */
export const NOTAS_QUE_SE_PONEN: [number, number][] = [
    [0, 17],
    [1, 13],
    [3, 11],
];

export const NOTA_QUE_APRUEBA = 10;
export const ESCALA_MAX = 20;

export function notaDeLaFila(fila: (number | null)[]): number | null {
    let suma = 0;
    let pesos = 0;
    fila.forEach((n, i) => {
        if (n === null) return;
        suma += n * EVALUACIONES[i].peso;
        pesos += EVALUACIONES[i].peso;
    });
    return pesos ? suma / pesos : null;
}

export function promedioDeLaSeccion(notas: (number | null)[][]): number {
    const filas = notas.map(notaDeLaFila).filter((n): n is number => n !== null);
    return filas.reduce((a, b) => a + b, 0) / Math.max(1, filas.length);
}

/** 14.25 → «14,3», como se escribe en Venezuela. */
export const conComa = (n: number, decimales = 1) => n.toFixed(decimales).replace('.', ',');

/**
 * El horario de hoy del profesor, turno de la mañana: sus horas de
 * Matemáticas en cada sección, el recreo y una hora libre.
 */
export const HORAS = [
    { desde: '07:00', hasta: '07:45', materia: 'Matemáticas', aula: '1er Año A' },
    { desde: '07:45', hasta: '08:30', materia: 'Matemáticas', aula: '1er Año B' },
    { desde: '08:30', hasta: '09:15', materia: 'Matemáticas', aula: '2do Año A' },
    { desde: '09:30', hasta: '10:15', materia: 'Hora libre', aula: '' },
    { desde: '10:15', hasta: '11:00', materia: 'Matemáticas', aula: '5to Año A' },
];

/** Las cifras de cada lapso, para la escena de las cifras. */
export const CIFRAS_POR_LAPSO = [
    { lapso: '1.er lapso', promedio: 14.6, riesgo: 23, asistencia: 91, ocupados: 412, puestos: 450, observaciones: 58 },
    { lapso: '2.º lapso', promedio: 15.1, riesgo: 17, asistencia: 93, ocupados: 412, puestos: 450, observaciones: 41 },
];
export const ASISTENCIA_MINIMA = 80;
