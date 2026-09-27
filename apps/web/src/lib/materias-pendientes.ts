import api from '@/lib/axios';

/**
 * LAS MATERIAS PENDIENTES, DESDE LA PANTALLA
 * (`services/materias-pendientes.service.ts` en el servidor).
 */

export type EstadoDePendiente = 'PENDIENTE' | 'APROBADA' | 'NO_APROBADA';

export const ESTADO_DE_PENDIENTE: Record<EstadoDePendiente, { texto: string; clase: string }> = {
    PENDIENTE: { texto: 'Pendiente', clase: 'bg-amber-50 text-amber-900 ring-amber-200' },
    APROBADA: { texto: 'Aprobada', clase: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
    NO_APROBADA: { texto: 'No aprobada', clase: 'bg-rose-50 text-rose-800 ring-rose-200' },
};

export interface MateriaPendiente {
    id: string;
    alumno: { id: string; nombre: string };
    materia: { id: string; nombre: string };
    gradoDeOrigen: number;
    cicloDeOrigen: string | null;
    notaDeOrigen: number | null;
    ciclo: { id: string; nombre: string; cerrado: boolean };
    profesor: { id: string; nombre: string } | null;
    estado: EstadoDePendiente;
    notaFinal: number | null;
    momentos: Array<{ momento: number; nota: number; fecha: string; observaciones: string | null }>;
}

export interface ListaDePendientes {
    cicloId: string | null;
    momentos: number;
    forma: 'MOMENTO_APROBADO' | 'PROMEDIO';
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

export const materiasPendientes = {
    listar: async () => (await api.get('/materias-pendientes')).data.data as ListaDePendientes,
    delAlumno: async (studentId: string) => (await api.get(`/materias-pendientes/alumno/${encodeURIComponent(studentId)}`)).data.data as MateriaPendiente[],
    acta: async (studentId: string) => (await api.get(`/materias-pendientes/alumno/${encodeURIComponent(studentId)}/acta`)).data.data as ActaDeCompromiso,
    ponerMomento: async (id: string, momento: number, nota: number) =>
        (await api.put(`/materias-pendientes/${id}/momentos/${momento}`, { nota })).data.data as { estado: EstadoDePendiente; notaFinal: number | null },
    quitarMomento: async (id: string, momento: number) => (await api.delete(`/materias-pendientes/${id}/momentos/${momento}`)).data.data,
    cambiarProfesor: async (id: string, profesorId: string | null) => (await api.put(`/materias-pendientes/${id}/profesor`, { profesorId })).data.data,
};
