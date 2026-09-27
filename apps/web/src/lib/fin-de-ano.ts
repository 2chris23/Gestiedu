import api from '@/lib/axios';

/**
 * EL FIN DEL AÑO ESCOLAR, DESDE LA PANTALLA
 *
 * Lo que pide la pantalla `/dashboard/academico/<año>/cierre` al servidor
 * (`services/fin-de-ano.service.ts`). Todo del admin.
 */

export type Condicion = 'PROMOVIDO' | 'PROMOVIDO_CON_PENDIENTES' | 'NO_PROMOVIDO';

export const CONDICION: Record<Condicion, string> = {
    PROMOVIDO: 'Promovido',
    PROMOVIDO_CON_PENDIENTES: 'Con materias pendientes',
    NO_PROMOVIDO: 'Repite',
};

/** En el último año, «promovido» es egresar. */
export const condicionLegible = (c: string | null | undefined, esUltimoAno = false): string =>
    !c ? '—' : esUltimoAno && c === 'PROMOVIDO' ? 'Egresa' : (CONDICION[c as Condicion] ?? c);

export interface ReglasDelFinDeAno {
    notaMinimaAprobatoria: number;
    maxMateriasPendientesParaPromover: number;
    revision: { componentes: Array<{ nombre: string; peso: number }>; maxMaterias: number | null };
    ultimoAnoConPendientes: 'REPITE' | 'SOLO_PENDIENTES' | 'EGRESA';
    pendienteNoAprobada: 'REPITE' | 'SIGUE_PENDIENTE';
    pendientes: { momentos: number; formaDeCalificar: 'MOMENTO_APROBADO' | 'PROMEDIO' };
    maxGradeLevel?: number;
}

export interface EstadoDelFinDeAno {
    ciclo: { id: string; nombre: string; estado: string };
    cerrado: boolean;
    resultado: { alumnos: number; promovidos: number; conPendientes: number; noPromovidos: number; egresados: number };
    revision: { reprobadas: number; conRevision: number } | null;
    decisiones: { cambiadas: number };
    anoSiguiente: { id: string; nombre: string; secciones: number } | null;
    config: ReglasDelFinDeAno;
}

export interface Faltante {
    seccion: { id: string; nombre: string };
    materia: { id: string; nombre: string; cualitativa: boolean };
    profesor: string | null;
    sinNota: number;
    total: number;
    alumnos: string[];
}

export interface FilaDeRevision {
    alumno: { id: string; nombre: string };
    seccion: { id: string; nombre: string } | null;
    materia: { id: string; nombre: string };
    profesor: string | null;
    definitiva: number;
    revision: number | null;
    reprobadasDelAlumno: number;
    fueraDeRevision: boolean;
}

export interface FilaDeDecision {
    alumno: { id: string; nombre: string };
    grado: number;
    seccion: string | null;
    esUltimoAno: boolean;
    promedio: number;
    reprobadas: Array<{ id?: string; nombre: string; nota: number; revision: number | null }>;
    pendientesArrastradas: Array<{ id: string; subjectName: string; gradoDeOrigen: number; estado: string }>;
    sugerida: Condicion;
    motivoDeLaSugerencia: string;
    laborSocial?: { horas: number; requeridas: number; porProyecto: boolean; proyectoCulminado: boolean; cumplida: boolean } | null;
    decision: { condicion: Condicion; motivo: string; decididaPor: string | null } | null;
    condicion: Condicion;
}

export interface Expediente {
    alumno: { id: string; nombre: string };
    grado: number | null;
    seccion: string;
    condicion: Condicion;
    sugerida: Condicion | null;
    motivo: string | null;
    corregidoEl: string | null;
    egreso: string | null;
    retirado: boolean;
    destino: { id: string; nombre: string | null } | null;
}

const de = (id: string) => `/academic-years/${encodeURIComponent(id)}/cierre`;

export const finDeAno = {
    estado: async (id: string) => (await api.get(de(id))).data.data as EstadoDelFinDeAno,
    faltantes: async (id: string) =>
        (await api.get(`${de(id)}/faltantes`)).data.data as { lapso: { id: string; nombre: string } | null; faltantes: Faltante[] },
    revision: async (id: string) =>
        (await api.get(`${de(id)}/revision`)).data.data as { reglas: ReglasDelFinDeAno['revision']; minima: number; filas: FilaDeRevision[] },
    decisiones: async (id: string) => (await api.get(`${de(id)}/decisiones`)).data.data as FilaDeDecision[],
    decidir: async (id: string, studentId: string, condicion: Condicion, motivo?: string) =>
        (await api.put(`${de(id)}/decisiones/${encodeURIComponent(studentId)}`, { condicion, ...(motivo ? { motivo } : {}) })).data.data,
    crearAnoSiguiente: async (id: string, cuerpo: { copiar: { secciones?: boolean; profesores?: boolean; horarios?: boolean } }) =>
        (await api.post(`${de(id)}/ano-siguiente`, cuerpo)).data.data as {
            id: string;
            nombre: string;
            inicio: string;
            fin: string;
            secciones: number;
            materias: number;
            bloques: number;
        },
    expedientes: async (id: string) =>
        (await api.get(`${de(id)}/expedientes`)).data.data as {
            anoSiguiente: { id: string; nombre: string; secciones: Array<{ id: string; name: string; grade: number }> } | null;
            expedientes: Expediente[];
        },
    corregir: async (id: string, studentId: string, cuerpo: { condicion: Condicion; motivo: string; destinoClassroomId?: string | null }) =>
        (await api.put(`${de(id)}/correccion/${encodeURIComponent(studentId)}`, cuerpo)).data.data,
    ponerRevision: async (
        id: string,
        cuerpo: { studentId: string; subjectId: string; score?: number; componentes?: Array<{ nombre: string; nota: number }> }
    ) => (await api.put(`/academic-years/${encodeURIComponent(id)}/revisiones`, cuerpo)).data.data,
    guardarReglas: async (reglas: Partial<ReglasDelFinDeAno>) => (await api.put('/institutes/current/academic-config', reglas)).data.data,
};
