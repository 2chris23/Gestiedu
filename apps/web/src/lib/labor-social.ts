import api from '@/lib/axios';

/**
 * LA LABOR SOCIAL, DESDE LA PANTALLA (`services/labor-social.service.ts`).
 */

export interface ReglasDeLaborSocial {
    activa: boolean;
    grados: number[];
    horasRequeridas: number;
    paraEgresar: 'BLOQUEA' | 'AVISA' | 'NO';
}

export interface AvanceDeLaborSocial {
    horas: number;
    requeridas: number;
    porProyecto: boolean;
    proyectoCulminado: boolean;
    cumplida: boolean;
}

export interface FilaDeLaborSocial extends AvanceDeLaborSocial {
    alumno: { id: string; nombre: string };
    seccion: { id: string; nombre: string; grado: number };
}

export interface ActividadDeLaborSocial {
    id: string;
    fecha: string;
    horas: number;
    que: string;
    donde: string | null;
    proyecto: string | null;
    responsable: string | null;
    observaciones: string | null;
    culminaElProyecto: boolean;
    ciclo: string | null;
    registradaPor: string | null;
}

export interface LaborSocialDelAlumno {
    reglas: ReglasDeLaborSocial;
    aplica: boolean;
    avance: AvanceDeLaborSocial;
    puedeAnotar: boolean;
    actividades: ActividadDeLaborSocial[];
}

export interface NuevaActividad {
    alumnos: string[];
    fecha: string;
    horas: number;
    que: string;
    donde?: string | null;
    proyecto?: string | null;
    responsable?: string | null;
    observaciones?: string | null;
    culminaElProyecto?: boolean;
}

/** «45 de 60 h», o «Proyecto culminado / en curso» si se mide por proyecto. */
export function avanceLegible(a: AvanceDeLaborSocial): string {
    const horas = String(a.horas).replace('.', ',');
    if (a.porProyecto) return `${a.proyectoCulminado ? 'Proyecto culminado' : 'Proyecto en curso'} · ${horas} h`;
    return `${horas} de ${a.requeridas} h`;
}

export const laborSocial = {
    lista: async () => (await api.get('/labor-social')).data.data as { reglas: ReglasDeLaborSocial; alumnos: FilaDeLaborSocial[] },
    delAlumno: async (studentId: string) => (await api.get(`/labor-social/alumno/${encodeURIComponent(studentId)}`)).data.data as LaborSocialDelAlumno,
    anotar: async (datos: NuevaActividad) => (await api.post('/labor-social/actividades', datos)).data.data as { anotadas: number },
    borrar: async (id: string) => (await api.delete(`/labor-social/actividades/${id}`)).data.data,
    guardarReglas: async (laborSocial: ReglasDeLaborSocial) => (await api.put('/institutes/current/academic-config', { laborSocial })).data.data,
};
