import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';

/**
 * LOS GRUPOS ESTABLES, DESDE LA PANTALLA (`services/grupos-estables.service.ts`).
 * Pedir, aceptar y asignar necesitan servidor: es un cupo que cuentan varios.
 */

export type AreaDeGrupo = 'ARTE_Y_PATRIMONIO' | 'ACCION_CIENTIFICA' | 'ACTIVIDAD_FISICA' | 'PRODUCCION';

/** Las cuatro áreas del MPPE, con su nombre corto para la pantalla. */
export const AREAS_DE_GRUPO: Array<{ id: AreaDeGrupo; nombre: string }> = [
    { id: 'ARTE_Y_PATRIMONIO', nombre: 'Arte y patrimonio' },
    { id: 'ACCION_CIENTIFICA', nombre: 'Acción científica y social' },
    { id: 'ACTIVIDAD_FISICA', nombre: 'Actividad física y deporte' },
    { id: 'PRODUCCION', nombre: 'Producción de bienes y servicios' },
];
export const nombreDelArea = (a?: string | null) => AREAS_DE_GRUPO.find((x) => x.id === a)?.nombre ?? null;

export const NOMBRE_DEL_TURNO: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', INTEGRAL: 'Integral' };

export interface ReglasDeGrupos {
    eleccion: 'ANUAL' | 'POR_LAPSO';
    abierta: boolean;
}
export const REGLAS_DE_GRUPOS_POR_DEFECTO: ReglasDeGrupos = { eleccion: 'ANUAL', abierta: true };

export interface GrupoDeLaMateria {
    id: string;
    nombre: string;
    descripcion: string | null;
    area: AreaDeGrupo | null;
    cupo: number;
    turno: string | null;
    activo: boolean;
    profesor: { id: string; nombre: string; avatar: string | null } | null;
    aceptados: number;
    pendientes: number;
}

export interface GruposDeLaMateria {
    materia: { id: string; name: string; porGrupos: boolean };
    reglas: ReglasDeGrupos;
    momento: string;
    grupos: GrupoDeLaMateria[];
}

export interface DatosDelGrupo {
    nombre: string;
    descripcion?: string | null;
    area?: AreaDeGrupo | null;
    profesorId?: string | null;
    cupo: number;
    turno?: string | null;
    activo?: boolean;
}

export interface SinGrupo {
    momento: string;
    total: number;
    secciones: Array<{
        seccion: { id: string; nombre: string; turno: string };
        alumnos: Array<{ id: string; nombre: string; avatar: string | null; pendienteEn: string | null }>;
    }>;
}

const datos = <T,>(r: { data: { data: T } }) => r.data.data;

// ── El admin ──────────────────────────────────────────────────────────────
const claveDeLaMateria = (subjectId: string, academicYearId: string) => ['grupos-estables', 'materia', subjectId, academicYearId];

export function useGruposDeLaMateria(subjectId?: string, academicYearId?: string) {
    return useQuery({
        queryKey: claveDeLaMateria(subjectId ?? '', academicYearId ?? ''),
        enabled: Boolean(subjectId && academicYearId),
        queryFn: async () =>
            datos<GruposDeLaMateria>(await api.get(`/grupos-estables/materia/${encodeURIComponent(subjectId!)}`, { params: { academicYearId } })),
    });
}

export function useSinGrupo(subjectId?: string, academicYearId?: string, activo = true) {
    return useQuery({
        queryKey: ['grupos-estables', 'sin-grupo', subjectId, academicYearId],
        enabled: Boolean(subjectId && academicYearId && activo),
        queryFn: async () =>
            datos<SinGrupo>(await api.get(`/grupos-estables/materia/${encodeURIComponent(subjectId!)}/sin-grupo`, { params: { academicYearId } })),
    });
}

/** Tras cualquier cambio, todo lo de grupos se vuelve a pedir: son pocas filas. */
function useRefrescar() {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: ['grupos-estables'] });
}

export function useGuardarGrupo(subjectId: string, academicYearId: string) {
    const refrescar = useRefrescar();
    return useMutation({
        mutationFn: async ({ id, ...d }: DatosDelGrupo & { id?: string }) =>
            id
                ? datos(await api.put(`/grupos-estables/${encodeURIComponent(id)}`, d))
                : datos(await api.post(`/grupos-estables/materia/${encodeURIComponent(subjectId)}`, d, { params: { academicYearId } })),
        onSuccess: refrescar,
    });
}

export function useQuitarGrupo() {
    const refrescar = useRefrescar();
    return useMutation({
        mutationFn: async (id: string) => datos(await api.delete(`/grupos-estables/${encodeURIComponent(id)}`)),
        onSuccess: refrescar,
    });
}

export function useAsignarAlGrupo() {
    const refrescar = useRefrescar();
    return useMutation({
        mutationFn: async ({ grupoId, studentId }: { grupoId: string; studentId: string }) =>
            datos(await api.post(`/grupos-estables/${encodeURIComponent(grupoId)}/asignar`, { studentId })),
        onSuccess: refrescar,
    });
}

/** Elegir una vez al año o en cada lapso, y si está abierta: la configuración académica del liceo. */
export function useGuardarReglasDeGrupos() {
    const refrescar = useRefrescar();
    return useMutation({
        mutationFn: async (gruposEstables: ReglasDeGrupos) => datos(await api.put('/institutes/current/academic-config', { gruposEstables })),
        onSuccess: refrescar,
    });
}
