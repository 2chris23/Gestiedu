'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { toast } from 'sonner';

export interface InvolvedStudentInfo {
  id: string;
  name: string;
  studentCode?: string;
  avatar?: string | null;
  classroomName?: string;
}

export interface StudentObservationItem {
  id: string;
  groupId: string | null;
  title: string;
  description: string | null;
  type: string;
  date: string;
  createdAt: string;
  teacher?: {
    id: string;
    name: string;
    role: string;
  } | null;
  subject?: {
    id: string;
    name: string;
    color?: string | null;
  } | null;
  classroom?: {
    id: string;
    name: string;
  } | null;
  otherInvolved: InvolvedStudentInfo[];
}

export interface ClassroomObservationItem {
  id: string;
  groupId: string | null;
  title: string;
  description: string | null;
  type: string;
  date: string;
  createdAt: string;
  classroomId?: string | null;
  subjectId?: string | null;
  classSessionId?: string | null;
  students: InvolvedStudentInfo[];
  teacher?: {
    id: string;
    name: string;
    role?: string;
  } | null;
  subject?: {
    id: string;
    name: string;
    color?: string | null;
    slug?: string | null;
  } | null;
  classroom?: {
    id: string;
    name: string;
    grade?: number | null;
    section?: string | null;
  } | null;
}

export interface CreateObservationPayload {
  title: string;
  description?: string;
  type?: string;
  date?: string;
  studentIds: string[];
  classroomId?: string;
  subjectId?: string;
  classSessionId?: string;
}

/**
 * Hook para consultar observaciones de un estudiante.
 */
export function useStudentObservations(studentId?: string | null) {
  return useQuery({
    queryKey: ['observations', 'student', studentId],
    queryFn: async () => {
      if (!studentId) return { total: 0, observations: [] };
      const { data } = await api.get<{ total: number; observations: StudentObservationItem[] }>(
        `/observations/student/${studentId}`
      );
      return data;
    },
    enabled: Boolean(studentId),
  });
}

/**
 * Hook para consultar observaciones de una sección completa.
 */
export function useClassroomObservations(
  classroomId?: string | null,
  filters?: { subjectId?: string; periodId?: string; startDate?: string; endDate?: string; search?: string }
) {
  return useQuery({
    queryKey: ['observations', 'classroom', classroomId, filters],
    queryFn: async () => {
      if (!classroomId) return { total: 0, observations: [] };
      const params = new URLSearchParams();
      if (filters?.subjectId) params.append('subjectId', filters.subjectId);
      if (filters?.periodId) params.append('periodId', filters.periodId);
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);
      if (filters?.search) params.append('search', filters.search);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const { data } = await api.get<{ total: number; observations: ClassroomObservationItem[] }>(
        `/observations/classroom/${classroomId}${qs}`
      );
      return data;
    },
    enabled: Boolean(classroomId),
  });
}

/**
 * Hook para consultar observaciones de una materia en una sección.
 */
export function useSubjectObservations(
  classroomId?: string | null,
  subjectId?: string | null,
  periodId?: string | null
) {
  return useQuery({
    queryKey: ['observations', 'subject', classroomId, subjectId, periodId],
    queryFn: async () => {
      if (!classroomId || !subjectId) return { total: 0, observations: [] };
      const params = periodId ? `?periodId=${periodId}` : '';
      const { data } = await api.get<{ total: number; observations: ClassroomObservationItem[] }>(
        `/observations/subject/${classroomId}/${subjectId}${params}`
      );
      return data;
    },
    enabled: Boolean(classroomId && subjectId),
  });
}

/**
 * Hook para crear una observación.
 */
export function useCreateObservation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateObservationPayload) => {
      const { data } = await api.post<{ success: boolean; message: string; groupId?: string; observations: any[] }>(
        '/observations',
        payload
      );
      return data;
    },
    onSuccess: (_, variables) => {
      toast.success('Observación registrada exitosamente');
      queryClient.invalidateQueries({ queryKey: ['observations'] });
      queryClient.invalidateQueries({ queryKey: ['live-class-detail'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || 'Error al registrar observación';
      toast.error(msg);
    },
  });
}

/**
 * Hook para eliminar una observación.
 */
export function useDeleteObservation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/observations/${id}`);
      return data;
    },
    onSuccess: () => {
      toast.success('Observación eliminada');
      queryClient.invalidateQueries({ queryKey: ['observations'] });
      queryClient.invalidateQueries({ queryKey: ['live-class-detail'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || 'Error al eliminar observación';
      toast.error(msg);
    },
  });
}
