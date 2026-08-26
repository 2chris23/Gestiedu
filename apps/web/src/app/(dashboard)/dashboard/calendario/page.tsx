'use client';

import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CalendarDayView from '@/components/evaluation/CalendarDayView';
import { classroomService, Classroom } from '@/services/classroom.service';
import { academicYearService } from '@/services/academic-year.service';
import { BookOpen, Users, Calendar as CalendarIcon } from 'lucide-react';
import { toast, Toaster } from 'sonner';

export default function CalendarioPage() {
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchClassrooms = async () => {
            try {
                setLoading(true);
                const years = await academicYearService.getAcademicYears();
                const activeYear = years.find(y => y.status === 'ACTIVE') || years[0];
                
                if (activeYear) {
                    const data = await classroomService.getClassrooms(activeYear.id);
                    const classes = Array.isArray(data) ? data : data.classrooms;
                    setClassrooms(classes);
                    
                    if (classes.length > 0) {
                        setSelectedClassroomId(classes[0].id);
                    }
                }
            } catch (error) {
                console.error(error);
                toast.error('Error al cargar aulas');
            } finally {
                setLoading(false);
            }
        };

        fetchClassrooms();
    }, []);

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
                                    {c.name} - Sección {c.section}
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
