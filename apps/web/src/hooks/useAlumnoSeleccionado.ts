'use client';

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import api from '@/lib/axios';

export interface RepresentadoInfo {
    id: string;
    fullName: string;
    firstName: string;
    lastName: string;
    classroom?: string | null;
    classroomId?: string | null;
}

export function useAlumnoSeleccionado() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const alumnoQuery = searchParams.get('alumno');
    const { yo, cargando: cargandoYo } = useQuienSoy();

    const esTutor = yo?.role === 'TUTOR';
    const esAlumno = yo?.role === 'STUDENT';

    const { data: tutorData, isLoading: cargandoTutor } = useQuery({
        queryKey: ['tutorDashboard'],
        queryFn: async () => {
            const { data } = await api.get('/dashboard/tutor');
            return data.data;
        },
        enabled: Boolean(esTutor),
    });

    const representados: RepresentadoInfo[] = React.useMemo(() => {
        if (!esTutor || !tutorData) return [];
        const rawList = tutorData.children ?? tutorData.representados ?? [];
        return rawList.map((item: any) => {
            const fullName = item.fullName || `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim();
            const parts = fullName.split(' ');
            return {
                id: item.id,
                fullName,
                firstName: item.firstName || parts[0] || '',
                lastName: item.lastName || parts.slice(1).join(' ') || '',
                classroom: item.classroom ?? null,
                classroomId: item.classroomId ?? null,
            };
        });
    }, [esTutor, tutorData]);

    const studentId = React.useMemo(() => {
        if (esAlumno && yo?.id) return yo.id;
        if (!esTutor) return '';
        if (alumnoQuery) return alumnoQuery;
        if (representados.length === 1) return representados[0].id;
        return '';
    }, [esAlumno, yo?.id, esTutor, alumnoQuery, representados]);

    const alumnoSeleccionado = React.useMemo(() => {
        if (!studentId) return null;
        return representados.find((r) => r.id === studentId) || null;
    }, [studentId, representados]);

    const seleccionarAlumno = React.useCallback(
        (id: string) => {
            router.push(`${pathname}?alumno=${encodeURIComponent(id)}`);
        },
        [router, pathname]
    );

    const cargando = cargandoYo || (esTutor && cargandoTutor);
    const requiereSeleccion = esTutor && !cargando && representados.length > 1 && !studentId;

    return {
        studentId,
        esTutor,
        esAlumno,
        representados,
        alumnoSeleccionado,
        seleccionarAlumno,
        cargando,
        requiereSeleccion,
    };
}
