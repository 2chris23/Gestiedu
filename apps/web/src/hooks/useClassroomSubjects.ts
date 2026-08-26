import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classroomSubjectsService, ClassroomSubject, ScheduleBlock } from '@/services/classroomSubjects.service';
import { toast } from 'sonner';

/**
 * Hook para obtener todas las materias de una sección
 */
export function useClassroomSubjects(classroomId: string) {
    return useQuery({
        queryKey: ['classroomSubjects', classroomId],
        queryFn: () => classroomSubjectsService.getClassroomSubjects(classroomId),
        enabled: !!classroomId,
    });
}

/**
 * Hook para obtener materias con estadísticas (promedio, asistencia, etc.)
 * `periodId`: filtro por lapso/momento (Fase 3.5) — undefined = "Todo el ciclo".
 */
export function useClassroomSubjectsStats(classroomId: string, periodId?: string) {
    return useQuery({
        queryKey: ['classroomSubjectsStats', classroomId, periodId || 'all'],
        queryFn: () => classroomSubjectsService.getClassroomSubjectsStats(classroomId, periodId),
        enabled: !!classroomId,
    });
}

/**
 * Hook para obtener detalle de una materia en una sección
 */
export function useClassroomSubjectDetail(classroomId: string, subjectId: string) {
    return useQuery({
        queryKey: ['classroomSubject', classroomId, subjectId],
        queryFn: () => classroomSubjectsService.getClassroomSubjectDetail(classroomId, subjectId),
        enabled: !!classroomId && !!subjectId,
    });
}

/**
 * Hook para asignar una materia a una sección
 */
export function useAssignSubjectToClassroom() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            classroomId,
            data,
        }: {
            classroomId: string;
            data: {
                subjectId: string;
                teacherId?: string;
                weeklyBlocks?: number;
            };
        }) => classroomSubjectsService.assignSubjectToClassroom(classroomId, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['classroomSubjects', variables.classroomId] });
            queryClient.invalidateQueries({ queryKey: ['classroomSubjectsStats', variables.classroomId] });
            toast.success('Materia asignada exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}

/**
 * Hook para actualizar configuración de una materia (bloques semanales)
 */
export function useUpdateClassroomSubject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            classroomId,
            subjectId,
            data,
        }: {
            classroomId: string;
            subjectId: string;
            data: {
                weeklyBlocks?: number;
                hoursPerWeek?: number;
            };
        }) => classroomSubjectsService.updateClassroomSubject(classroomId, subjectId, data),
        // Optimistic update para UI instantánea
        onMutate: async ({ classroomId, subjectId, data }) => {
            // Cancelar queries en curso para evitar sobrescritura
            await queryClient.cancelQueries({
                queryKey: ['classroomSubject', classroomId, subjectId],
            });

            // Snapshot del estado anterior
            const previousData = queryClient.getQueryData<ClassroomSubject>([
                'classroomSubject',
                classroomId,
                subjectId,
            ]);

            // Actualizar optimísticamente
            if (previousData) {
                queryClient.setQueryData<ClassroomSubject>(
                    ['classroomSubject', classroomId, subjectId],
                    {
                        ...previousData,
                        ...data,
                        hoursPerWeek: data.weeklyBlocks ? data.weeklyBlocks * 0.75 : previousData.hoursPerWeek,
                    }
                );
            }

            return { previousData };
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['classroomSubject', variables.classroomId, variables.subjectId],
            });
            queryClient.invalidateQueries({ queryKey: ['classroomSubjects', variables.classroomId] });
            toast.success('Configuración actualizada exitosamente');
        },
        onError: (error: Error, variables, context) => {
            // Revertir en caso de error
            if (context?.previousData) {
                queryClient.setQueryData(
                    ['classroomSubject', variables.classroomId, variables.subjectId],
                    context.previousData
                );
            }
            toast.error(error.message);
        },
    });
}

/**
 * Hook para asignar o cambiar profesor de una materia
 */
export function useAssignTeacherToSubject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            classroomId,
            subjectId,
            data,
        }: {
            classroomId: string;
            subjectId: string;
            data: {
                teacherId: string;
                notes?: string;
            };
        }) => classroomSubjectsService.assignTeacherToSubject(classroomId, subjectId, data),
        // Optimistic update
        onMutate: async ({ classroomId, subjectId, data }) => {
            await queryClient.cancelQueries({
                queryKey: ['classroomSubject', classroomId, subjectId],
            });

            const previousData = queryClient.getQueryData<ClassroomSubject>([
                'classroomSubject',
                classroomId,
                subjectId,
            ]);

            // Actualizar optimísticamente con el nuevo teacherId
            if (previousData) {
                queryClient.setQueryData<ClassroomSubject>(
                    ['classroomSubject', classroomId, subjectId],
                    {
                        ...previousData,
                        teacherId: data.teacherId,
                    }
                );
            }

            return { previousData };
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['classroomSubject', variables.classroomId, variables.subjectId],
            });
            queryClient.invalidateQueries({ queryKey: ['classroomSubjects', variables.classroomId] });
            toast.success('Profesor asignado exitosamente');
        },
        onError: (error: Error, variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(
                    ['classroomSubject', variables.classroomId, variables.subjectId],
                    context.previousData
                );
            }
            toast.error(error.message);
        },
    });
}

/**
 * Hook para obtener historial de profesores
 */
export function useTeacherHistory(classroomId: string, subjectId: string) {
    return useQuery({
        queryKey: ['teacherHistory', classroomId, subjectId],
        queryFn: () => classroomSubjectsService.getTeacherHistory(classroomId, subjectId),
        enabled: !!classroomId && !!subjectId,
    });
}

/**
 * Hook para remover una materia de una sección
 */
export function useRemoveSubjectFromClassroom() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ classroomId, subjectId }: { classroomId: string; subjectId: string }) =>
            classroomSubjectsService.removeSubjectFromClassroom(classroomId, subjectId),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['classroomSubjects', variables.classroomId] });
            toast.success('Materia removida exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}

/**
 * Hook para obtener horario completo de una sección
 */
export function useClassroomSchedule(classroomId: string) {
    return useQuery({
        queryKey: ['classroomSchedule', classroomId],
        queryFn: () => classroomSubjectsService.getClassroomSchedule(classroomId),
        enabled: !!classroomId,
    });
}

/**
 * Hook para crear un bloque de horario
 */
export function useCreateScheduleBlock() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            classroomId,
            data,
        }: {
            classroomId: string;
            data: {
                classroomSubjectId?: string;
                dayOfWeek: number;
                startTime: string;
                endTime: string;
                blockType?: string;
                location?: string;
                notes?: string;
            };
        }) => classroomSubjectsService.createScheduleBlock(classroomId, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['classroomSchedule', variables.classroomId] });
            toast.success('Bloque creado exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}

/**
 * Hook para actualizar un bloque de horario
 */
export function useUpdateScheduleBlock() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            blockId,
            classroomId,
            data,
        }: {
            blockId: string;
            classroomId: string;
            data: Partial<{
                classroomSubjectId: string;
                dayOfWeek: number;
                startTime: string;
                endTime: string;
                blockType: string;
                location: string;
                notes: string;
            }>;
        }) => classroomSubjectsService.updateScheduleBlock(blockId, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['classroomSchedule', variables.classroomId] });
            toast.success('Bloque actualizado exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}

/**
 * Hook para eliminar un bloque de horario
 */
export function useDeleteScheduleBlock() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ blockId, classroomId }: { blockId: string; classroomId: string }) =>
            classroomSubjectsService.deleteScheduleBlock(blockId),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['classroomSchedule', variables.classroomId] });
            toast.success('Bloque eliminado exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}

/**
 * Hook para actualización masiva de horario (drag & drop)
 */
export function useBulkUpdateSchedule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            classroomId,
            data,
        }: {
            classroomId: string;
            data: {
                blocks: Array<{
                    id?: string;
                    classroomSubjectId?: string;
                    dayOfWeek: number;
                    startTime: string;
                    endTime: string;
                    blockType?: string;
                    location?: string;
                    notes?: string;
                }>;
                deleteIds?: string[];
            };
        }) => classroomSubjectsService.bulkUpdateSchedule(classroomId, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['classroomSchedule', variables.classroomId] });
            queryClient.invalidateQueries({ queryKey: ['classroomSubjects', variables.classroomId] });
            toast.success('Horario actualizado exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}
