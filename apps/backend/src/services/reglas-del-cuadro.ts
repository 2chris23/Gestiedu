/**
 * EL CUADRO DE HONOR: LA CUENTA (CUADRO-*, 2026-10-04, `MAPA_DE_CALCULOS.md` §8h)
 *
 * Pura: sin base de datos. La usan la tarea de los sábados
 * (`cuadro-de-honor.service.ts`) y sus pruebas.
 *
 *   puntaje = pesoNotas × promedio / escala
 *           + pesoAsistencia × asistencia / 100
 *           − restaPorObservacion × observaciones           (nunca menos de 0)
 *
 * Los pesos son del liceo (`AcademicConfig.cuadroDeHonor`); 80 / 20 / 5 por
 * defecto, que es lo que se veía. Base 100 con los pesos por defecto.
 */

export interface ReglasDelCuadro {
    /** Cuánto pesan las notas (0–100). */
    pesoNotas: number;
    /** Cuánto pesa la asistencia (0–100). */
    pesoAsistencia: number;
    /** Cuántos puntos resta cada observación del período (0–50). 0 = no restan. */
    restaPorObservacion: number;
}

export const REGLAS_DEL_CUADRO_POR_DEFECTO: ReglasDelCuadro = { pesoNotas: 80, pesoAsistencia: 20, restaPorObservacion: 5 };

/**
 * Una felicitación no resta. El tipo de la observación es libre: la pantalla
 * pone «OBSERVACION», y hay liceos (y datos traídos) con «POSITIVE».
 */
export const TIPOS_QUE_NO_RESTAN = ['POSITIVE', 'POSITIVA', 'FELICITACION', 'RECONOCIMIENTO'];

const numeroEntre = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export function esReglasDelCuadro(v: unknown): v is ReglasDelCuadro {
    if (!v || typeof v !== 'object') return false;
    const r = v as Record<string, unknown>;
    return (
        numeroEntre(r.pesoNotas, 0, 100) &&
        numeroEntre(r.pesoAsistencia, 0, 100) &&
        numeroEntre(r.restaPorObservacion, 0, 50) &&
        (r.pesoNotas as number) + (r.pesoAsistencia as number) > 0
    );
}

export function limpiarReglasDelCuadro(r: ReglasDelCuadro): ReglasDelCuadro {
    return { pesoNotas: r.pesoNotas, pesoAsistencia: r.pesoAsistencia, restaPorObservacion: r.restaPorObservacion };
}

export interface DatosDelAlumno {
    studentId: string;
    grado: number;
    /** El promedio general del período (el de la boleta). Sin notas, no entra al cuadro. */
    promedio: number;
    /** Presentes y retardos sobre los días con asistencia del período, 0–100. Sin registros, 100. */
    asistencia: number;
    observaciones: number;
}

export interface Desglose {
    puntosNotas: number;
    puntosAsistencia: number;
    resta: number;
    puntaje: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function puntajeDe(d: Pick<DatosDelAlumno, 'promedio' | 'asistencia' | 'observaciones'>, reglas: ReglasDelCuadro, escala = 20): Desglose {
    const puntosNotas = r1((reglas.pesoNotas * Math.max(0, Math.min(d.promedio, escala))) / escala);
    const puntosAsistencia = r1((reglas.pesoAsistencia * Math.max(0, Math.min(d.asistencia, 100))) / 100);
    const resta = r1(reglas.restaPorObservacion * Math.max(0, d.observaciones));
    return { puntosNotas, puntosAsistencia, resta, puntaje: Math.max(0, r1(puntosNotas + puntosAsistencia - resta)) };
}

export interface FilaDelCuadro extends DatosDelAlumno, Desglose {
    puestoLiceo: number;
    puestoAno: number;
}

/**
 * Los puestos: por puntaje; a igual puntaje, el mejor promedio; luego la mejor
 * asistencia. Empatados en las tres, el MISMO puesto (1, 2, 2, 4): no se
 * desempata por el nombre, que no es mérito. En el liceo y dentro de su año.
 */
export function ordenarElCuadro(datos: DatosDelAlumno[], reglas: ReglasDelCuadro, escala = 20): FilaDelCuadro[] {
    const filas = datos.map((d) => ({ ...d, ...puntajeDe(d, reglas, escala), puestoLiceo: 0, puestoAno: 0 }));
    const antes = (a: (typeof filas)[number], b: (typeof filas)[number]) =>
        b.puntaje - a.puntaje || b.promedio - a.promedio || b.asistencia - a.asistencia;
    const empatan = (a: (typeof filas)[number], b: (typeof filas)[number]) => antes(a, b) === 0;
    const poner = (lista: typeof filas, campo: 'puestoLiceo' | 'puestoAno') => {
        const orden = [...lista].sort(antes);
        orden.forEach((f, i) => {
            f[campo] = i > 0 && empatan(orden[i - 1], f) ? orden[i - 1][campo] : i + 1;
        });
    };
    poner(filas, 'puestoLiceo');
    const porAno = new Map<number, typeof filas>();
    for (const f of filas) porAno.set(f.grado, [...(porAno.get(f.grado) ?? []), f]);
    for (const lista of porAno.values()) poner(lista, 'puestoAno');
    return filas.sort((a, b) => a.puestoLiceo - b.puestoLiceo || a.studentId.localeCompare(b.studentId));
}

/** El sábado de la foto: hoy si es sábado; si no, el sábado anterior (AAAA-MM-DD). */
export function sabadoDeLaFoto(hoy: string): string {
    const d = new Date(`${hoy}T12:00:00Z`);
    const atras = (d.getUTCDay() + 1) % 7; // sábado = 6 → 0; domingo = 0 → 1; viernes = 5 → 6
    d.setUTCDate(d.getUTCDate() - atras);
    return d.toISOString().slice(0, 10);
}
