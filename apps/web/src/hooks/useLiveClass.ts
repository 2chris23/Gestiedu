import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { toast } from 'sonner';
import type { PlanColumnDef } from '@/components/evaluation/planColumns';
import { dejarPendiente } from '@/lib/por-enviar';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

/**
 * SIN CONEXIÓN, LO DE LA CLASE QUEDA PENDIENTE (2026-09-30)
 *
 * Pasar lista, poner notas, crear o borrar una actividad: si no hay conexión,
 * en vez de fallar se deja en la cola del teléfono (`lib/por-enviar.ts`) y se
 * envía solo al volver. Con conexión, todo sigue igual que siempre.
 */
export const PENDIENTE = { pendiente: true } as const;
const sinConexion = (e: unknown) => esQueNoContesta(e);

export interface LiveClassStudent {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    studentCode?: string;
    status: string | null;
    external?: boolean;
    originClassroom?: string | null;
}

export interface LiveClassPlanContent {
    headers: Array<{ id: string; title?: string; headingLevel?: number }>;
    fields: Array<{ id: string; label?: string; content?: string }>;
    evaluations: Array<{ id: string; actividadEval?: string; tecnicas?: string; instrumentos?: string; criterios?: string; ponderacion?: number; puntos?: number; tipoEvaluacion?: string }>;
    texts: Array<{ id: string; textContent?: string }>;
    indicators: Array<{ id: string; indicadores?: string }>;
}

/** Cómo se le evalúa a un alumno en una actividad cuando no es como a los demás. */
export interface OtraFormaDeEvaluar {
    metodo: string;
    motivo?: string | null;
}

export interface ClassActivity {
    id: string;
    title: string;
    description?: string;
    type: string;
    target: string;
    tag?: string;
    dueDate?: string | null;
    maxScore?: number;
    scores?: Record<string, number | null> | null;
    /** Alumnos evaluados de otra forma (p. ej. con el cuaderno): su nota cuenta igual. */
    evaluadoDeOtraForma?: Record<string, OtraFormaDeEvaluar> | null;
    /** El instrumento con que se califica (el de su evaluación del plan). */
    instrumento?: import('@/lib/instrumentos').Instrumento | null;
    /** Las marcas de cada alumno y su total. */
    detalleDelInstrumento?: Record<string, { marcas: import('@/lib/instrumentos').Marcas; total: number | null }> | null;
    isDone: boolean;
    carriedOver: boolean;
    planRowId?: string | null;
    classSessionId?: string | null;
    classSession?: { id: string; date: string; startTime?: string; endTime?: string } | null;
    dueToday?: boolean;
    belongsToSession?: boolean;
    isFuture?: boolean;
    createdAt: string;
    createdDate?: string | null;
}

export interface LiveClassDetail {
    /** La sección donde se da la clase, con su turno (mañana / tarde). */
    classroom?: { id: string; name: string; shift?: string; grade?: number; section?: string } | null;
    session: {
        id: string;
        topic?: string;
        observations?: string;
        observationsTitle?: string;
        involvedStudentIds?: string[];
        status?: string;
        suspendedReason?: string;
    } | null;
    subject: { id: string; name: string; color?: string; slug?: string } | null;
    teacher: { id: string; firstName: string; lastName: string } | null;
    students: LiveClassStudent[];
    weekNumber?: number;
    /** Antes de que empiece el plan del lapso: semanas de diagnóstico (o como las llame el liceo). */
    antesDelPlan?: boolean;
    nombreAntesDelPlan?: string;
    /** "YYYY-MM-DD" */
    inicioDelPlan?: string | null;
    planContent?: LiveClassPlanContent;
    planColumns?: PlanColumnDef[] | null;
    planLapso?: string;
    /** Las evaluaciones del plan que cubren este día. */
    evaluacionesDeLaSemana?: Array<{ id: string; actividad: string; puntos: number; semana: number; instrumentos: string | null }>;
    planConPuntos?: boolean;
    weekRow?: {
        id: string;
        title: string;
        label: string;
        textContent: string;
        actividadEval: string;
        tecnicas: string;
        instrumentos: string;
        criterios: string;
        tipoEvaluacion: string;
        ponderacion: number | null;
        puntos: number | null;
        extraData: Record<string, any>;
    } | null;
    activities: ClassActivity[];
}

export interface SaveLiveClassPayload {
    classroomId: string;
    subjectId: string;
    date: string;
    topic?: string;
    observations?: string;
    observationsTitle?: string;
    involvedStudentIds?: string[];
    startTime?: string;
    endTime?: string;
    /**
     * Solo lo que esta pantalla cambió, y los alumnos que aún no tienen
     * asistencia ese día con `soloSiNoHay` (se crean como están, pero no pisan
     * lo que otra pantalla haya guardado mientras tanto). Ver ASIS-DOS-01.
     */
    attendances?: Array<{ studentId: string; status: string; comments?: string; soloSiNoHay?: boolean }>;
}

export function useLiveClassDetail(classroomId: string, subjectId: string, date: string) {
    return useQuery({
        queryKey: ['liveClassDetail', classroomId, subjectId, date],
        queryFn: async () => {
            if (!classroomId || !subjectId || !date) return null;
            const { data } = await api.get('/sessions/live-detail', {
                params: { classroomId, subjectId, date },
            });
            return data as LiveClassDetail;
        },
        enabled: !!classroomId && !!subjectId && !!date,
    });
}

/** Una actividad tal y como la ve quien mira el horario de ese día. */
export interface ActividadDelDia {
    id: string;
    title: string;
    type: string;
    tag?: string | null;
    target: string;
    dueDate: string | null;
    maxScore: number | null;
    /** Se puso en esa clase para otro día (el contador «Próx.»). */
    paraOtroDia: boolean;
    /** Solo llega cuando quien pregunta es el alumno (o su representante). */
    miNota?: number | null;
}

export interface LiveOverviewSubject {
    subjectName: string;
    color?: string;
    weekNumber?: number;
    temaGenerador?: string;
    firstColumnLabel?: string;
    activitiesCount?: number;
    todayActivitiesCount?: number;
    nextActivitiesCount?: number;
    suspendida?: boolean;
    /** Antes de que empiece el plan del lapso (semanas de diagnóstico). */
    antesDelPlan?: boolean;
    nombreAntesDelPlan?: string;
    actividades?: ActividadDelDia[];
}

/**
 * El contenido del horario de una sección en un día.
 *
 * Lo pide también el alumno para SU sección y el representante para la de su
 * representado: el servidor decide quién puede (`assertCanSeeClassroom`) y, si
 * es un alumno, le manda solo SU nota.
 */
export function useLiveOverview(classroomId: string, date: string, studentId?: string) {
    return useQuery({
        queryKey: ['liveOverview', classroomId, date, studentId ?? ''],
        queryFn: async () => {
            if (!classroomId || !date) return null;
            const { data } = await api.get('/sessions/live-overview', {
                params: { classroomId, date, ...(studentId ? { studentId } : {}) },
            });
            return data as { overview: Record<string, LiveOverviewSubject>; shift?: 'MANANA' | 'TARDE' | 'INTEGRAL' };
        },
        enabled: !!classroomId && !!date,
        // Que un alumno no pueda ver una sección no es un fallo que reintentar.
        retry: false,
    });
}

/**
 * El resumen de VARIAS secciones el mismo día: el horario de un profesor da
 * clase en varias, y el resumen se pide por sección. Con una sola (la del
 * perfil), el horario del profesor salía con «—» y «Hoy: 0 · Próx: 0».
 * Comparte memoria con `useLiveOverview` (misma clave).
 */
export function useLiveOverviews(classroomIds: string[], date: string) {
    const unicas = Array.from(new Set(classroomIds.filter(Boolean))).sort();
    const resultados = useQueries({
        queries: unicas.map((classroomId) => ({
            queryKey: ['liveOverview', classroomId, date, ''],
            queryFn: async () => {
                const { data } = await api.get('/sessions/live-overview', { params: { classroomId, date } });
                return data as { overview: Record<string, LiveOverviewSubject>; shift?: 'MANANA' | 'TARDE' | 'INTEGRAL' };
            },
            enabled: Boolean(date),
            retry: false,
        })),
    });
    const porSeccion: Record<string, { overview: Record<string, LiveOverviewSubject>; shift?: 'MANANA' | 'TARDE' | 'INTEGRAL' } | undefined> = {};
    unicas.forEach((id, i) => {
        porSeccion[id] = resultados[i]?.data ?? undefined;
    });
    return porSeccion;
}

export function useClassActivities(classroomId?: string, subjectId?: string) {
    return useQuery({
        queryKey: ['classActivities', classroomId, subjectId],
        queryFn: async () => {
            if (!classroomId) return { activities: [] };
            const params: Record<string, string> = { classroomId };
            if (subjectId) params.subjectId = subjectId;
            const { data } = await api.get('/sessions/activities', { params });
            return data as { activities: ClassActivity[] };
        },
        enabled: Boolean(classroomId),
    });
}

/** Lo que acompaña a la clase si hay que dejarla pendiente (no se envía). */
export interface ParaLaCola {
    resumen: string;
    nombres?: Record<string, string>;
    /** La asistencia de cada alumno cuando se abrió la clase: lo que se vio. */
    antes?: Record<string, string | null>;
}

export function useSaveLiveClass() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ paraLaCola, ...payload }: SaveLiveClassPayload & { paraLaCola?: ParaLaCola }) => {
            try {
                const { data } = await api.post('/sessions/live-save', payload);
                return data;
            } catch (e) {
                if (!sinConexion(e) || !paraLaCola) throw e;
                await dejarPendiente({
                    tipo: 'asistencia',
                    grupo: 3,
                    metodo: 'post',
                    url: '/sessions/live-save',
                    objeto: `clase|${payload.classroomId}|${payload.subjectId}|${payload.date}`,
                    resumen: paraLaCola.resumen,
                    nombres: paraLaCola.nombres,
                    datos: {
                        ...payload,
                        // Lo que se vio: si al llegar otro lo cambió, se pregunta.
                        attendances: (payload.attendances ?? []).map((a) =>
                            a.soloSiNoHay || !paraLaCola.antes ? a : { ...a, antes: paraLaCola.antes[a.studentId] ?? null }
                        ),
                    },
                });
                return PENDIENTE;
            }
        },
        onSuccess: (datos: any, variables) => {
            if (datos?.pendiente) return;
            queryClient.invalidateQueries({
                queryKey: ['liveClassDetail', variables.classroomId, variables.subjectId, variables.date],
            });
            queryClient.invalidateQueries({ queryKey: ['classroomHistory'] });
            queryClient.invalidateQueries({ queryKey: ['attendance'] });
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al guardar la clase');
        },
    });
}

export function useCreateClassActivity() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: {
            classroomId: string;
            subjectId: string;
            title: string;
            description?: string;
            type?: string;
            target?: string;
            tag?: string;
            dueDate?: string;
            maxScore?: number;
            planRowId?: string;
            classSessionId?: string;
            /** El día de la clase que se ve: ahí nace la actividad. */
            date?: string;
        }) => {
            try {
                const { data } = await api.post('/sessions/activities', payload);
                return data;
            } catch (e) {
                if (!sinConexion(e)) throw e;
                // El id lo pone el teléfono: así sus notas, también sin
                // conexión, ya saben a qué actividad van.
                const id = crypto.randomUUID();
                await dejarPendiente({
                    tipo: 'crear-actividad',
                    grupo: 2,
                    metodo: 'post',
                    url: '/sessions/activities',
                    objeto: `actividad|${id}`,
                    resumen: `Nueva actividad «${payload.title}»`,
                    datos: { ...payload, id },
                });
                return { ...PENDIENTE, activity: { ...payload, id, scores: {} }, dondeSale: payload.target === 'NEXT' ? 'PROXIMA' : 'HOY' };
            }
        },
        onSuccess: (datos: any, variables) => {
            if (datos?.pendiente) return;
            queryClient.invalidateQueries({
                queryKey: ['liveClassDetail', variables.classroomId, variables.subjectId],
            });
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al crear actividad');
        },
    });
}

export function useUpdateClassActivity() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            activityId,
            data
        }: {
            activityId: string;
            data: {
                title?: string;
                description?: string;
                type?: string;
                target?: string;
                tag?: string;
                dueDate?: string;
                maxScore?: number;
                scores?: Record<string, any>;
                isDone?: boolean;
                carriedOver?: boolean;
            }
        }) => {
            const res = await api.put(`/sessions/activities/${activityId}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liveClassDetail'] });
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al actualizar actividad');
        },
    });
}

/**
 * GUARDAR NOTAS SIN QUE EL PROFESOR ESPERE
 *
 * Las notas se pintan en pantalla **antes** de que el servidor conteste, como
 * hace Instagram con el corazón del "me gusta". Se midió que bajo carga guardar
 * tardaba segundos: el profesor se quedaba mirando el botón.
 *
 * La diferencia con Instagram es que aquí **el dato importa**. Si el guardado
 * falla:
 *
 *   1. la pantalla vuelve a como estaba (no se miente sobre lo que se guardó);
 *   2. **las notas quedan apuntadas en el dispositivo** para reintentarlas, así
 *      que el profesor no tiene que acordarse ni volver a escribirlas;
 *   3. se le dice con claridad, sin que el aviso se vaya solo.
 *
 * Ver `lib/guardado-optimista.ts`.
 */
/**
 * Evaluar a un alumno de otra forma en una actividad (o quitarlo: `metodo`
 * vacío). La nota se sigue poniendo igual y cuenta igual.
 */
export function useEvaluarDeOtraForma() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ activityId, studentId, metodo, motivo }: { activityId: string; studentId: string; metodo: string; motivo?: string }) => {
            const url = `/sessions/activities/${encodeURIComponent(activityId)}/otra-forma/${encodeURIComponent(studentId)}`;
            const { data } = metodo.trim()
                ? await api.put(url, { metodo: metodo.trim(), motivo: motivo?.trim() || undefined })
                : await api.delete(url);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liveClassDetail'] });
            queryClient.invalidateQueries({ queryKey: ['classActivities'] });
            toast.success('Guardado cómo se le evalúa');
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.error || 'No se pudo guardar cómo se le evalúa');
        },
    });
}

export function useSaveActivityGrades() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            activityId,
            scores,
            maxScore,
            paraLaCola,
        }: {
            activityId: string;
            scores: Record<string, number | null>;
            maxScore?: number;
            /** Si hay que dejarlas pendientes: qué nota tenía cada uno (lo que se vio). */
            paraLaCola?: { resumen: string; nombres?: Record<string, string>; antes: Record<string, number | null> };
        }) => {
            try {
                const { data } = await api.post(`/sessions/activities/${activityId}/grades`, { scores, maxScore });
                return data;
            } catch (e) {
                if (!sinConexion(e) || !paraLaCola) throw e;
                await dejarPendiente({
                    tipo: 'notas',
                    grupo: 3,
                    metodo: 'post',
                    url: `/sessions/activities/${activityId}/grades`,
                    objeto: `actividad|${activityId}`,
                    resumen: paraLaCola.resumen,
                    nombres: paraLaCola.nombres,
                    datos: { scores, maxScore, antes: paraLaCola.antes },
                });
                return PENDIENTE;
            }
        },

        onMutate: async ({ activityId, scores }) => {
            // Que no llegue una respuesta vieja por detrás y pise lo que acabamos
            // de pintar.
            await queryClient.cancelQueries({ queryKey: ['liveClassDetail'] });

            const antes = queryClient.getQueriesData({ queryKey: ['liveClassDetail'] });

            queryClient.setQueriesData(
                { queryKey: ['liveClassDetail'] },
                (viejo: any) => {
                    if (!viejo?.activities) return viejo;
                    return {
                        ...viejo,
                        activities: viejo.activities.map((a: ClassActivity) =>
                            a.id === activityId
                                ? { ...a, scores: { ...(a.scores || {}), ...scores } }
                                : a
                        ),
                    };
                }
            );

            return { antes };
        },

        onError: (error: any, variables, contexto) => {
            // 1. La pantalla vuelve a la verdad.
            contexto?.antes?.forEach(([clave, datos]: [any, any]) => {
                queryClient.setQueryData(clave, datos);
            });

            // Una nota que el servidor rechaza por su valor (25 sobre 20, una
            // letra…) no se apunta para reintentar: volvería a rechazarse
            // siempre. Se dice qué tiene de malo y se corrige ahí mismo.
            if (error?.response?.status === 400) {
                toast.error(error?.response?.data?.error || 'Hay una nota que no es válida.');
                return;
            }

            // 2. Se dice por qué, y el aviso no se va solo: lo escrito sigue en
            // la pantalla (y sin conexión no llega aquí: queda pendiente).
            toast.error(error?.response?.data?.error || 'No se pudieron guardar las calificaciones.', { duration: Infinity });
        },

        onSuccess: (datos: any) => {
            if (datos?.pendiente) {
                toast('Sin conexión: las notas quedaron pendientes ⏱ y se envían solas al volver.', { id: 'pendiente' });
                return;
            }
            toast.success('Calificaciones guardadas');
        },

        // Se pida o no, al final se contrasta con el servidor: lo que manda es
        // lo que está guardado, no lo que pintamos por adelantado.
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['liveClassDetail'] });
        },
    });
}

export function useDeleteClassActivity() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (activityId: string) => {
            try {
                const { data } = await api.delete(`/sessions/activities/${activityId}`);
                return data;
            } catch (e) {
                if (!sinConexion(e)) throw e;
                // Cuántas notas se vieron: si al llegar tiene más, se pregunta.
                let vistas = 0;
                let titulo = 'una actividad';
                for (const [, d] of queryClient.getQueriesData<any>({ queryKey: ['liveClassDetail'] })) {
                    const a = d?.activities?.find((x: any) => x.id === activityId);
                    if (!a) continue;
                    titulo = `«${a.title}»`;
                    vistas = Object.values(a.scores || {}).filter((v) => v !== null && v !== undefined && v !== '').length;
                }
                await dejarPendiente({
                    tipo: 'borrar-actividad',
                    grupo: 4,
                    metodo: 'delete',
                    url: `/sessions/activities/${activityId}`,
                    params: { notasVistas: String(vistas) },
                    objeto: `actividad|${activityId}`,
                    resumen: `Borrar ${titulo}`,
                });
                return PENDIENTE;
            }
        },
        onSuccess: (datos: any) => {
            if (datos?.pendiente) return;
            queryClient.invalidateQueries({ queryKey: ['liveClassDetail'] });
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al eliminar actividad');
        },
    });
}

export function useSuspendClass() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: {
            classroomId: string;
            subjectId: string;
            date: string;
            reason?: string;
            /** Otra materia de la sección que entra en ese hueco (solo admin). */
            replacementSubjectId?: string;
        }) => {
            const { data } = await api.post('/sessions/suspend', payload);
            return data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['classReplacements'] });
            queryClient.invalidateQueries({
                queryKey: ['liveClassDetail', variables.classroomId, variables.subjectId],
            });
            queryClient.invalidateQueries({ queryKey: ['classroomHistory'] });
        },
        // Sin aviso aquí: el diálogo de suspender enseña el motivo del servidor
        // ("Beto no está libre: tiene Historia en 1er B…") donde se decide.
    });
}

export interface SearchStudentResult {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    studentCode?: string;
    classroomName?: string | null;
    academicYearName?: string | null;
    classroomId?: string | null;
}

export function useSearchStudents(search: string) {
    return useQuery({
        queryKey: ['searchStudents', search],
        queryFn: async () => {
            const { data } = await api.get('/sessions/search-students', {
                params: { search: search || undefined },
            });
            return (data.students || []) as SearchStudentResult[];
        },
        enabled: search.trim().length > 0,
        staleTime: 60 * 1000,
    });
}

export function useSavePlanWeek() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: {
            classroomId: string;
            subjectId: string;
            date: string;
            values: Record<string, any>;
            columns?: PlanColumnDef[];
        }) => {
            const { data } = await api.post('/sessions/plan-week-save', payload);
            return data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['liveClassDetail', variables.classroomId, variables.subjectId],
            });
            queryClient.invalidateQueries({ queryKey: ['evaluationPlanRows'] });
            queryClient.invalidateQueries({ queryKey: ['evaluationPlanMetadata'] });
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al guardar el plan');
        },
    });
}
