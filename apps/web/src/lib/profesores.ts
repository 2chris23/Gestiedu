import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import type { EstadoDeLaCarga } from '@/lib/carga-horaria';

/**
 * LOS PROFESORES, DESDE LA PANTALLA (`/api/profesores`, del admin).
 * La carga es la cuenta de `personal.service` (MAPA §1e).
 */

export interface ProfesorDeLaLista {
    id: string;
    nombre: string;
    avatar: string | null;
    horas: number;
    sinHoras: number;
    horasDelCargo: number | null;
    cargo: number;
    estado: EstadoDeLaCarga;
    clases: number;
    secciones: number;
    promedio: number | null;
}

export interface ClaseDelProfesor {
    claseId: string;
    classroomId: string;
    subjectId: string;
    seccion: string;
    seccionSlug: string;
    grado: number;
    turno: string;
    materia: string;
    bloques: number | null;
    horas: number | null;
    promedio: number | null;
    asistencia: number | null;
}

export interface FichaDelProfesor {
    profesor: { id: string; nombre: string; avatar: string | null; especialidad: string | null; ingreso: string | null };
    guiaDe: Array<{ id: string; nombre: string }>;
    reglas: { minimo: number; maximo: number };
    horas: number;
    bloques: number;
    sinHoras: number;
    horasDelCargo: number | null;
    cargo: number;
    estado: EstadoDeLaCarga;
    promedio: number | null;
    asistencia: number | null;
    clases: ClaseDelProfesor[];
    porMateria: Array<{ subjectId: string; materia: string; secciones: number; horas: number; promedio: number | null }>;
}

export interface ClaseSinProfesor {
    claseId: string;
    classroomId: string;
    seccion: string;
    seccionSlug: string;
    grado: number;
    turno: string;
    subjectId: string;
    subjectSlug: string;
    materia: string;
    bloques: number | null;
}

const datos = <T,>(r: { data: { data: T } }) => r.data.data;

export function useProfesores() {
    return useQuery({
        queryKey: ['profesores', 'lista'],
        queryFn: async () =>
            datos<{ reglas: { minimo: number; maximo: number }; clasesSinProfesor: number; profesores: ProfesorDeLaLista[] }>(await api.get('/profesores')),
    });
}

export function useElProfesor(id?: string) {
    return useQuery({
        queryKey: ['profesores', 'ficha', id],
        enabled: Boolean(id),
        queryFn: async () => datos<FichaDelProfesor>(await api.get(`/profesores/${encodeURIComponent(id!)}`)),
    });
}

export function useClasesSinProfesor(activo = true) {
    return useQuery({
        queryKey: ['profesores', 'sin-asignar'],
        enabled: activo,
        queryFn: async () => datos<ClaseSinProfesor[]>(await api.get('/profesores/sin-asignar')),
    });
}

/** Tras asignar o cambiar horas: todo lo de profesores y materias se vuelve a pedir. */
export function useRefrescarProfesores() {
    const qc = useQueryClient();
    return () => {
        for (const k of ['profesores', 'teachers', 'subject', 'subjects', 'classroomSubject']) qc.invalidateQueries({ queryKey: [k] });
    };
}

/** Las horas de su cargo (`null` = las del liceo). Necesita servidor. */
export function useFijarHorasDelCargo() {
    const refrescar = useRefrescarProfesores();
    return useMutation({
        mutationFn: async ({ id, horas }: { id: string; horas: number | null }) => datos(await api.put(`/teachers/${encodeURIComponent(id)}/horas-del-cargo`, { horas })),
        onSuccess: refrescar,
    });
}

/** Quitar el profesor de una clase (queda «sin profesor»). */
export function useQuitarProfesorDeLaClase() {
    const refrescar = useRefrescarProfesores();
    return useMutation({
        mutationFn: async ({ classroomId, subjectId }: { classroomId: string; subjectId: string }) =>
            (await api.patch(`/classrooms/${encodeURIComponent(classroomId)}/subjects/${encodeURIComponent(subjectId)}/teacher`, { teacherId: null })).data,
        onSuccess: refrescar,
    });
}
