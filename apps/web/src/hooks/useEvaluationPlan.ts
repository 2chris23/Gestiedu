import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';

// ============================================================
// INTERFACES
// ============================================================

export interface EvaluationPlanMetadata {
    id?: string;
    classroomId: string;
    subjectId: string;
    lapso: string;
    nombreDocente?: string;
    cedulaDocente?: string;
    telefonoDocente?: string;
    correoDocente?: string;
    areaFormacion?: string;
    annoSeccion?: string;
    periodoEscolar?: string;
    totalSemanas?: number;
    fechaDesde?: string;
    fechaHasta?: string;
    peic?: string;
    enfasisCurricular?: string;
    referentesEticos?: string;
    intencionalidad?: string;
    temaIndispensable?: string;
    observaciones?: string;
    customColumns?: string;
}

export interface AutoPopulatedData {
    teacherName?: string;
    teacherEmail?: string;
    teacherPhone?: string;
    teacherCedula?: string;
    subjectName?: string;
    subjectColor?: string;
    classroomName?: string;
    classroomGrade?: number;
    classroomSection?: string;
    instituteName?: string;
    instituteLogo?: string;
    ministryLogo?: string;
    ministryText?: string;
    academicYearName?: string;
    lapsoStartDate?: string;
    lapsoEndDate?: string;
    lapsoWeeks?: number;
}

export interface EvaluationPlanRow {
    id: string;
    classroomId: string;
    subjectId: string;
    lapso: string;
    rowType: 'HEADER' | 'FIELD' | 'EVALUATION' | 'TEXT' | 'INDICATORS';
    weekNumber: number;
    endWeekNumber?: number | null;
    orderIndex: number;
    title?: string;
    headingLevel?: number;
    label?: string;
    content?: string;
    textContent?: string;
    actividadEval?: string;
    tecnicas?: string;
    instrumentos?: string;
    criterios?: string;
    ponderacion?: number;
    puntos?: number;
    tipoEvaluacion?: string;
    indicadores?: string;
    activityId?: string;
}

export interface CalendarClassData {
    date: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subjectId: string;
    subjectName: string;
    subjectSlug?: string;
    subjectColor?: string;
    teacherName?: string;
    weekNumber?: number;
    planContent?: {
        headers: EvaluationPlanRow[];
        fields: EvaluationPlanRow[];
        evaluations: EvaluationPlanRow[];
        texts: EvaluationPlanRow[];
        indicators: EvaluationPlanRow[];
    };
    hasEvaluation: boolean;
    evaluationCount: number;
    lapso?: string;
}

// ============================================================
// HOOKS — Metadata
// ============================================================

export function useEvaluationPlanMetadata(params: { classroomId?: string; subjectId?: string; lapso?: string }) {
    return useQuery({
        queryKey: ['evaluationPlanMetadata', params],
        queryFn: async () => {
            if (!params.classroomId || !params.subjectId || !params.lapso) return null;
            const { data } = await api.get('/evaluation-plan/metadata', { params });
            return data as { metadata: EvaluationPlanMetadata | null; autoPopulated: AutoPopulatedData };
        },
        enabled: !!params.classroomId && !!params.subjectId && !!params.lapso,
    });
}

export function useUpsertEvaluationPlanMetadata() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Partial<EvaluationPlanMetadata> & { classroomId: string; subjectId: string; lapso: string }) => {
            const res = await api.post('/evaluation-plan/metadata', data);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['evaluationPlanMetadata', { classroomId: variables.classroomId, subjectId: variables.subjectId, lapso: variables.lapso }]
            });
        },
    });
}

// ============================================================
// HOOKS — Plan Rows
// ============================================================

export function useEvaluationPlanRows(params: { classroomId?: string; subjectId?: string; lapso?: string }) {
    return useQuery({
        queryKey: ['evaluationPlanRows', params],
        queryFn: async () => {
            if (!params.classroomId || !params.subjectId || !params.lapso) return null;
            const { data } = await api.get('/evaluation-plan/rows', { params });
            return data as { rows: EvaluationPlanRow[]; grouped: Record<number, EvaluationPlanRow[]> };
        },
        enabled: !!params.classroomId && !!params.subjectId && !!params.lapso,
    });
}

export function useBatchUpsertRows() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { classroomId: string; subjectId: string; lapso: string; rows: Partial<EvaluationPlanRow>[] }) => {
            const res = await api.post('/evaluation-plan/rows/batch', data);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['evaluationPlanRows'] });
            queryClient.invalidateQueries({ queryKey: ['activities'] });
        },
    });
}

// ============================================================
// HOOKS — Copy Plan
// ============================================================

export interface CopyTargetClassroom {
    id: string;
    name: string;
    grade: number;
    section: string;
}

/**
 * Las secciones a las que ESTE usuario puede copiar ESTE plan.
 *
 * La lista la decide el servidor con la misma regla que luego aplica al copiar,
 * así que nunca aparece una sección que después vaya a rechazar.
 */
export function useCopyTargets(params: { sourceClassroomId?: string; subjectId?: string; enabled?: boolean }) {
    return useQuery({
        queryKey: ['evaluationPlanCopyTargets', params.sourceClassroomId, params.subjectId],
        queryFn: async () => {
            const { data } = await api.get('/evaluation-plan/copy-targets', {
                params: { sourceClassroomId: params.sourceClassroomId, subjectId: params.subjectId },
            });
            return (data?.classrooms ?? []) as CopyTargetClassroom[];
        },
        enabled: !!params.sourceClassroomId && !!params.subjectId && params.enabled !== false,
    });
}

export function useCopyPlan() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { sourceClassroomId: string; sourceSubjectId: string; sourceLapso: string; targetClassroomIds: string[] }) => {
            const res = await api.post('/evaluation-plan/copy', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['evaluationPlanRows'] });
            queryClient.invalidateQueries({ queryKey: ['evaluationPlanMetadata'] });
        },
    });
}

// ============================================================
// HOOKS — Calendar Data
// ============================================================

export function useCalendarData(params: { classroomId?: string; startDate?: string; endDate?: string }) {
    return useQuery({
        queryKey: ['calendarData', params],
        queryFn: async () => {
            if (!params.classroomId || !params.startDate || !params.endDate) return null;
            const { data } = await api.get('/evaluation-plan/calendar-data', { params });
            return data as { calendarData: CalendarClassData[] };
        },
        enabled: !!params.classroomId && !!params.startDate && !!params.endDate,
    });
}

// ============================================================
// LEGACY — mantener compatibilidad
// ============================================================

export function useBatchUpsertActivities() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { classroomId: string; subjectId: string; lapso: string; periodId?: string; activities: any[] }) => {
            const res = await api.post('/evaluation-plan/activities/batch', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['activities'] });
        },
    });
}
