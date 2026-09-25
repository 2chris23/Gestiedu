'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CalendarDayView from '@/components/evaluation/CalendarDayView';
import { classroomService, Classroom } from '@/services/classroom.service';
import { academicYearService } from '@/services/academic-year.service';
import { BookOpen, Users, Calendar as CalendarIcon } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import api from '@/lib/axios';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

export default function CalendarioPage() {
    const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
    const { yo, cargando: sinSaberQuienEs } = useQuienSoy();

    /**
     * CADA UNO VE SUS SECCIONES
     *
     * Esta pantalla pedía TODAS las secciones del liceo y abría la primera. Al
     * alumno y al representante —que también usan el calendario, por eso está
     * abierto a ellos— les salía un aviso de error y una pantalla vacía: esa
     * lista es de personal.
     *
     * Ahora: el alumno ve la suya, el representante las de sus representados, y
     * el personal, todas.
     */
    /**
     * PRIMERO SABER QUIÉN ES, LUEGO PEDIR
     *
     * Los datos de la sesión se recuperan del navegador en el primer pintado,
     * así que durante un instante el rol es `null`. Este efecto corría antes de
     * eso y caía en la rama del personal: al alumno le pedía TODAS las
     * secciones del liceo y abría la primera, que no es la suya, y el servidor
     * —con razón— respondía 403. Se veía como una pantalla rota nada más
     * entrar. Ahora se espera a saber quién llama.
     */
    /**
     * Y DE LA MEMORIA DE LA APP, NO DEL ESTADO DE LA PANTALLA
     *
     * Se pedían a mano y se guardaban solo mientras la pantalla estaba abierta:
     * sin conexión, el calendario salía sin secciones. Pasando por React Query
     * entran en lo que se guarda en el teléfono (`MemoriaDelTelefono`).
     */
    const secciones = useQuery({
        queryKey: ['calendario', 'secciones', yo?.role, yo?.id],
        enabled: !sinSaberQuienEs,
        queryFn: async (): Promise<Classroom[]> => {
            if (yo?.role === 'STUDENT') {
                const { data } = await api.get('/students/my-dashboard');
                const seccion = data?.data?.student?.currentSection;
                return seccion
                    ? [{ id: seccion.id, name: seccion.name, section: '', grade: 0 } as unknown as Classroom]
                    : [];
            }

            if (yo?.role === 'TUTOR') {
                const { data } = await api.get('/dashboard/tutor');
                return (data?.data?.children ?? [])
                    .filter((h: any) => h.classroomId)
                    .map((h: any) => ({
                        id: h.classroomId,
                        name: `${h.fullName} · ${h.classroom ?? ''}`.trim(),
                        section: '',
                        grade: 0,
                    })) as unknown as Classroom[];
            }

            const years = await academicYearService.getAcademicYears();
            const activeYear = years.find((y) => y.status === 'ACTIVE') || years[0];
            if (!activeYear) return [];
            const data = await classroomService.getClassrooms(activeYear.id);
            return Array.isArray(data) ? data : data.classrooms;
        },
    });
    const classrooms = secciones.data ?? [];
    const loading = sinSaberQuienEs || secciones.isLoading;

    // La primera sección, en cuanto se sabe cuáles hay.
    useEffect(() => {
        if (!selectedClassroomId && classrooms.length > 0) setSelectedClassroomId(classrooms[0].id);
    }, [classrooms, selectedClassroomId]);

    useEffect(() => {
        if (secciones.error && !esQueNoContesta(secciones.error)) toast.error('No se pudieron cargar las secciones');
    }, [secciones.error]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Toaster position="top-right" />
            
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/60 p-6 rounded-3xl border border-slate-800 backdrop-blur-xl">
                <div>
                    <div className="flex items-center gap-2 text-indigo-400">
                        <CalendarIcon className="w-5 h-5" />
                        <span className="text-xs font-bold uppercase tracking-widest">Calendario Escolar</span>
                    </div>
                    <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight mt-1">
                        Agenda del Plan de Evaluación
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Sincronización en vivo del horario escolar con el plan de clase y evaluaciones de la semana
                    </p>
                </div>

                {/* Classroom Selector */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0 w-full md:w-auto">
                    <span className="text-xs font-semibold text-slate-400">Sección:</span>
                    <Select
                        value={selectedClassroomId || undefined}
                        onValueChange={setSelectedClassroomId}
                        disabled={loading || classrooms.length === 0}
                    >
                        <SelectTrigger className="w-full md:w-64">
                            <SelectValue placeholder={loading ? "Cargando secciones..." : "Seleccionar sección"} />
                        </SelectTrigger>
                        <SelectContent>
                            {classrooms.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.section ? `${c.name} - Sección ${c.section}` : c.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Main Content Area */}
            {loading ? (
                <div className="flex flex-col justify-center items-center py-32 space-y-3 bg-slate-900/20 border border-slate-800/80 rounded-3xl backdrop-blur-xl">
                    <div className="relative w-12 h-12">
                        <div className="absolute w-12 h-12 border-4 border-indigo-500/25 rounded-full" />
                        <div className="absolute w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <p className="text-slate-400 text-xs font-medium animate-pulse">Cargando cronograma académico...</p>
                </div>
            ) : selectedClassroomId ? (
                <CalendarDayView classroomId={selectedClassroomId} />
            ) : (
                <div className="flex flex-col items-center justify-center py-24 px-4 bg-slate-900/20 border border-slate-800/80 rounded-3xl border-dashed text-center">
                    <BookOpen className="w-12 h-12 text-slate-700 mb-3" />
                    <p className="text-base font-bold text-slate-300">No hay secciones académicas</p>
                    <p className="text-xs text-slate-500 max-w-xs mt-1">
                        Debe configurar al menos un aula y año escolar activo en la administración para ver el calendario en vivo.
                    </p>
                </div>
            )}
        </div>
    );
}
