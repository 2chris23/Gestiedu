import api from '@/lib/axios';
import { hacerODejarPendiente } from '@/lib/por-enviar';

/**
 * LAS MATERIAS PENDIENTES, DESDE LA PANTALLA
 * (`services/materias-pendientes.service.ts` y `plan-de-pendientes.service.ts`
 * en el servidor).
 *
 * Cada pendiente se trabaja en una CLASE (la materia de una sección del grado
 * de origen): la pestaña «Pendientes» de esa materia. El guía y el admin la
 * siguen en la pestaña «Pendientes» de la sección del alumno. Las reglas y las
 * fechas, en Configuración → Académica.
 *
 * Sin conexión, las notas de cada opción, las del plan, la lista de un
 * encuentro y el plan quedan pendientes (⏱) y suben solas al volver
 * (`lib/por-enviar.ts`), como en la clase. Crear un encuentro pide conexión:
 * su número lo pone el servidor.
 */

export type EstadoDePendiente = 'PENDIENTE' | 'APROBADA' | 'NO_APROBADA';

export const ESTADO_DE_PENDIENTE: Record<EstadoDePendiente, { texto: string; clase: string }> = {
    PENDIENTE: { texto: 'Pendiente', clase: 'bg-amber-50 text-amber-900 ring-amber-200' },
    APROBADA: { texto: 'Aprobada', clase: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
    NO_APROBADA: { texto: 'No aprobada', clase: 'bg-rose-50 text-rose-800 ring-rose-200' },
};

export interface ReglasDePendientes {
    momentos: number;
    formaDeCalificar: 'MOMENTO_APROBADO' | 'PROMEDIO' | 'PONDERADO';
    pesos?: number[];
    segundaOpcion: 'SIEMPRE' | 'SI_REPRUEBA_30' | 'NO';
    asistencia: 'SOLO_EVALUACIONES' | 'OBLIGATORIA' | 'NO';
    faltarPierdeElMomento: boolean;
}

/** Lo del MPPE: lo que sale de primeras (el servidor tiene el mismo). */
export const REGLAS_DE_PENDIENTES_POR_DEFECTO: ReglasDePendientes = {
    momentos: 4,
    formaDeCalificar: 'MOMENTO_APROBADO',
    segundaOpcion: 'SIEMPRE',
    asistencia: 'SOLO_EVALUACIONES',
    faltarPierdeElMomento: true,
};

export interface OpcionDePendiente {
    momento: number;
    opcion: 1 | 2;
    nota: number | null;
    asistio: boolean;
    justificada: boolean;
    fecha: string;
    observaciones: string | null;
}

export interface MateriaPendiente {
    id: string;
    alumno: { id: string; nombre: string };
    materia: { id: string; nombre: string };
    gradoDeOrigen: number;
    cicloDeOrigen: string | null;
    notaDeOrigen: number | null;
    ciclo: { id: string; nombre: string; cerrado: boolean };
    /** La clase donde se trabaja (la sección de esa materia, del grado de origen). */
    clase: { id: string; seccion: string } | null;
    /** La sección en que el alumno está este año. */
    seccionActual: string | null;
    /** Quién la evalúa: el profesor de su clase (o uno puesto a mano). */
    profesor: { id: string; nombre: string } | null;
    estado: EstadoDePendiente;
    notaFinal: number | null;
    /** La nota de cada momento ya decidido (sin nota: no se presentó). */
    momentos: Array<{ momento: number; nota: number | null; fecha: string; observaciones: string | null }>;
    opciones: OpcionDePendiente[];
}

export interface ListaDePendientes {
    cicloId: string | null;
    momentos: number;
    forma: ReglasDePendientes['formaDeCalificar'];
    minima: number;
    pendientes: MateriaPendiente[];
}

export interface ActaDeCompromiso {
    alumno: { cedula: string; nombre: string };
    representantes: Array<{ nombre: string; cedula: string; parentesco: string }>;
    seccion: string | null;
    ciclo: string | null;
    pendientes: MateriaPendiente[];
}

export interface MomentoDelCronograma {
    numero: number;
    desde1: string;
    hasta1: string;
    desde2: string | null;
    hasta2: string | null;
}

export interface Cronograma {
    cicloId: string | null;
    ciclo: string | null;
    propuesto: boolean;
    momentos: MomentoDelCronograma[];
}

export interface EvaluacionDelPlan {
    id: string;
    momento: number;
    nombre: string;
    peso: number;
    instrumento: any | null;
    contenidos: string | null;
}

export type EstadoDeAsistencia = 'PRESENTE' | 'AUSENTE' | 'JUSTIFICADO';

export interface EncuentroDePendiente {
    id: string;
    momento: number;
    tipo: 'TUTORIA' | 'EVALUACION';
    opcion: 1 | 2 | null;
    fecha: string;
    hora: string | null;
    aula: string | null;
    tema: string | null;
    /** materiaPendienteId → estado */
    asistencias: Record<string, EstadoDeAsistencia>;
}

export interface NotaDelPlan {
    evaluacionId: string;
    materiaPendienteId: string;
    opcion: number;
    nota: number;
    desglose: Record<string, any> | null;
}

export interface PendientesDeLaClase {
    clase: { id: string; materia: string; seccion: string; grado: number; profesor: { id: string; nombre: string } | null };
    ciclo: { id: string; nombre: string; cerrado: boolean };
    reglas: ReglasDePendientes;
    minima: number;
    cronograma: Cronograma;
    /** Por momento: ¿hay 2ª opción? (con SI_REPRUEBA_30 depende del grupo). */
    segundaAbierta: boolean[];
    puedeEvaluar: boolean;
    otrasClases: Array<{ id: string; seccion: string; profesor: string | null }>;
    pendientes: MateriaPendiente[];
    plan: EvaluacionDelPlan[];
    encuentros: EncuentroDePendiente[];
    notasDelPlan: NotaDelPlan[];
}

export interface DatosDeLaOpcion {
    nota: number | null;
    asistio: boolean;
    justificada?: boolean;
    fecha: string;
    observaciones?: string;
}

export interface DatosDelEncuentro {
    momento: number;
    tipo: 'TUTORIA' | 'EVALUACION';
    opcion?: 1 | 2 | null;
    fecha: string;
    hora?: string | null;
    aula?: string | null;
    tema?: string | null;
}

/** «2026-10-05» → «5 oct.» */
export function fechaCorta(ymd: string | null | undefined): string {
    if (!ymd) return '—';
    const [a, m, d] = ymd.split('-').map(Number);
    if (!a || !m || !d) return ymd;
    return new Date(a, m - 1, d).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
}

/** Lo que se ve de una opción: su nota, «IN» si no se presentó, «Just.» si justificó. */
export function textoDeLaOpcion(o: Pick<OpcionDePendiente, 'nota' | 'asistio' | 'justificada'>): string {
    if (!o.asistio) return o.justificada ? 'Just.' : 'IN';
    return o.nota == null ? '—' : String(o.nota).replace('.', ',');
}

/** Qué se puede hacer con cada opción de un momento: verla, ponerla o nada. */
export function estadoDeLaCasilla(p: MateriaPendiente, datos: PendientesDeLaClase, momento: number, opcion: 1 | 2): 'puesta' | 'libre' | 'cerrada' {
    const puesta = p.opciones.find((o) => o.momento === momento && o.opcion === opcion);
    if (puesta) return 'puesta';
    if (!datos.puedeEvaluar || datos.ciclo.cerrado || p.estado !== 'PENDIENTE') return 'cerrada';
    const decididos = new Set(p.momentos.map((m) => m.momento));
    if (decididos.has(momento)) return 'cerrada';
    // En orden: el momento anterior tiene que estar decidido.
    if (momento > 1 && !decididos.has(momento - 1)) return 'cerrada';
    if (opcion === 1) return 'libre';
    const primera = p.opciones.find((o) => o.momento === momento && o.opcion === 1);
    return primera && datos.reglas.segundaOpcion !== 'NO' && datos.segundaAbierta[momento - 1] ? 'libre' : 'cerrada';
}


export const materiasPendientes = {
    listar: async () => (await api.get('/materias-pendientes')).data.data as ListaDePendientes,
    delAlumno: async (studentId: string) => (await api.get(`/materias-pendientes/alumno/${encodeURIComponent(studentId)}`)).data.data as MateriaPendiente[],
    acta: async (studentId: string) => (await api.get(`/materias-pendientes/alumno/${encodeURIComponent(studentId)}/acta`)).data.data as ActaDeCompromiso,
    ponerMomento: async (id: string, momento: number, nota: number) =>
        (await api.put(`/materias-pendientes/${id}/momentos/${momento}`, { nota })).data.data as { estado: EstadoDePendiente; notaFinal: number | null },
    quitarMomento: async (id: string, momento: number) => (await api.delete(`/materias-pendientes/${id}/momentos/${momento}`)).data.data,
    cambiarProfesor: async (id: string, profesorId: string | null) => (await api.put(`/materias-pendientes/${id}/profesor`, { profesorId })).data.data,

    deLaClase: async (claseId: string) => (await api.get(`/materias-pendientes/clase/${encodeURIComponent(claseId)}`)).data.data as PendientesDeLaClase,
    deLaSeccion: async (classroomId: string) =>
        (await api.get(`/materias-pendientes/seccion/${encodeURIComponent(classroomId)}`)).data.data as { pendientes: MateriaPendiente[] },
    ponerOpcion: (id: string, momento: number, opcion: 1 | 2, datos: DatosDeLaOpcion, quien = 'el alumno') => {
        const url = `/materias-pendientes/${id}/momentos/${momento}/opciones/${opcion}`;
        return hacerODejarPendiente(async () => (await api.put(url, datos)).data.data as { estado: EstadoDePendiente; notaFinal: number | null }, {
            tipo: 'notas',
            grupo: 3,
            metodo: 'put',
            url,
            datos,
            objeto: `pendiente|${id}|${momento}|${opcion}`,
            resumen: `Materia pendiente de ${quien}: ${momento}º momento, ${opcion}ª opción`,
        });
    },
    quitarOpcion: async (id: string, momento: number, opcion: 1 | 2) => (await api.delete(`/materias-pendientes/${id}/momentos/${momento}/opciones/${opcion}`)).data.data,
    moverDeClase: async (id: string, claseId: string) => (await api.put(`/materias-pendientes/${id}/clase`, { claseId })).data.data,

    cronograma: async (cicloId?: string) =>
        (await api.get('/materias-pendientes/cronograma', { params: cicloId ? { cicloId } : undefined })).data.data as Cronograma,
    guardarCronograma: async (cicloId: string, momentos: MomentoDelCronograma[]) =>
        (await api.put('/materias-pendientes/cronograma', { momentos }, { params: { cicloId } })).data.data as Cronograma,
    guardarReglas: async (pendientes: ReglasDePendientes) => (await api.put('/institutes/current/academic-config', { pendientes })).data.data,

    guardarPlan: (claseId: string, momento: number, evaluaciones: Array<Partial<EvaluacionDelPlan> & { nombre: string; peso: number }>, confirmar = false) => {
        const url = `/materias-pendientes/clase/${encodeURIComponent(claseId)}/plan/${momento}`;
        const datos = { evaluaciones, confirmar };
        return hacerODejarPendiente(async () => (await api.put(url, datos)).data.data, {
            tipo: 'plan',
            grupo: 1,
            metodo: 'put',
            url,
            datos,
            objeto: `plan-de-pendientes|${claseId}|${momento}`,
            resumen: `Plan de la materia pendiente: ${momento}º momento`,
        });
    },
    ponerNotaDelPlan: (id: string, evaluacionId: string, opcion: 1 | 2, datos: { nota?: number | null; marcas?: Record<string, any> | null }, quien = 'el alumno') => {
        const url = `/materias-pendientes/${id}/plan/${evaluacionId}/opciones/${opcion}`;
        return hacerODejarPendiente(
            async () => (await api.put(url, datos)).data.data as { nota: number | null; estado: EstadoDePendiente; notaFinal: number | null },
            { tipo: 'notas', grupo: 3, metodo: 'put', url, datos, objeto: `nota-del-plan|${id}|${evaluacionId}|${opcion}`, resumen: `Nota del plan de pendientes de ${quien}` }
        );
    },
    crearEncuentro: async (claseId: string, datos: DatosDelEncuentro) =>
        (await api.post(`/materias-pendientes/clase/${encodeURIComponent(claseId)}/encuentros`, datos)).data.data as { id: string },
    editarEncuentro: async (id: string, datos: DatosDelEncuentro) => (await api.put(`/materias-pendientes/encuentros/${id}`, datos)).data.data,
    borrarEncuentro: async (id: string) => (await api.delete(`/materias-pendientes/encuentros/${id}`)).data.data,
    pasarAsistencia: (encuentroId: string, asistencias: Array<{ materiaPendienteId: string; estado: EstadoDeAsistencia }>, resumen = 'Lista de un encuentro de pendientes') => {
        const url = `/materias-pendientes/encuentros/${encuentroId}/asistencia`;
        const datos = { asistencias };
        return hacerODejarPendiente(async () => (await api.put(url, datos)).data.data, {
            tipo: 'asistencia',
            grupo: 3,
            metodo: 'put',
            url,
            datos,
            objeto: `asistencia-de-pendientes|${encuentroId}`,
            resumen,
        });
    },
};
