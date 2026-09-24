import React, { useState, useMemo } from 'react';
import { useCalendarData, CalendarClassData } from '@/hooks/useEvaluationPlan';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { format, addDays, startOfWeek, endOfWeek, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Calendar as CalendarIcon, 
    Clock, 
    BookOpen, 
    User, 
    ChevronLeft, 
    ChevronRight,
    AlertCircle,
    Info,
    X,
    FileText,
    TrendingUp,
    ListTodo
} from 'lucide-react';

interface CalendarDayViewProps {
    classroomId: string;
}

export default function CalendarDayView({ classroomId }: CalendarDayViewProps) {
    // «Hoy» es el día del liceo, no el del aparato (RELOJ-01).
    const hoyDelLiceo = useSchoolToday();
    const hoyComoFecha = useMemo(() => {
        const [y, m, d] = hoyDelLiceo.split('-').map(Number);
        return new Date(y, m - 1, d);
    }, [hoyDelLiceo]);
    const [selectedDate, setSelectedDate] = useState<Date>(() => hoyComoFecha);
    const [selectedClass, setSelectedClass] = useState<CalendarClassData | null>(null);

    // Calculate the start and end of the week for the selected date
    const startOfCurrentWeek = useMemo(() => startOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);
    const endOfCurrentWeek = useMemo(() => endOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);

    // Fetch calendar data for the current week range
    const startDateStr = format(startOfCurrentWeek, 'yyyy-MM-dd');
    const endDateStr = format(endOfCurrentWeek, 'yyyy-MM-dd');

    const { data, isLoading, error } = useCalendarData({
        classroomId,
        startDate: startDateStr,
        endDate: endDateStr
    });

    // Group the class blocks by date for quick lookup
    const classesByDate = useMemo(() => {
        if (!data?.calendarData) return {};
        const grouped: Record<string, CalendarClassData[]> = {};
        data.calendarData.forEach(item => {
            if (!grouped[item.date]) {
                grouped[item.date] = [];
            }
            grouped[item.date].push(item);
        });

        // Sort each day's blocks by startTime
        Object.keys(grouped).forEach(dateKey => {
            grouped[dateKey].sort((a, b) => a.startTime.localeCompare(b.startTime));
        });

        return grouped;
    }, [data]);

    // Get current day's classes
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
    const todayClasses = classesByDate[selectedDateStr] || [];

    // Week navigation handlers
    const handlePrevDay = () => setSelectedDate(prev => addDays(prev, -1));
    const handleNextDay = () => setSelectedDate(prev => addDays(prev, 1));
    const handleSelectDay = (date: Date) => setSelectedDate(date);
    const handleGoToToday = () => setSelectedDate(hoyComoFecha);

    // Generate week days for the horizontal calendar selector
    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }).map((_, i) => addDays(startOfCurrentWeek, i));
    }, [startOfCurrentWeek]);

    return (
        <div className="relative min-h-[500px] w-full bg-slate-950/40 rounded-3xl border border-slate-800/80 backdrop-blur-xl overflow-hidden p-6">
            {/* Header: Date picker & controls */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
                        <CalendarIcon className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-100 font-sans tracking-wide">
                            Agenda Diaria de Clases
                        </h2>
                        <p className="text-sm text-slate-400">
                            Visualiza tus bloques de hoy con los temas e indicadores a evaluar
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleGoToToday}
                        className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition duration-200 border border-slate-700"
                    >
                        Hoy
                    </button>
                    <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <button 
                            onClick={handlePrevDay}
                            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="px-4 text-xs font-bold text-slate-300 min-w-[120px] text-center capitalize">
                            {format(selectedDate, 'eeee, d MMM', { locale: es })}
                        </span>
                        <button 
                            onClick={handleNextDay}
                            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Horizontal week calendar ribbon */}
            <div className="grid grid-cols-7 gap-2 mb-8 bg-slate-900/50 p-2 rounded-2xl border border-slate-900">
                {weekDays.map((day, idx) => {
                    const isSelected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, hoyComoFecha);
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const hasDayClasses = (classesByDate[dayStr] || []).length > 0;
                    const hasDayEvaluations = (classesByDate[dayStr] || []).some(c => c.hasEvaluation);

                    return (
                        <button
                            key={idx}
                            onClick={() => handleSelectDay(day)}
                            className={`flex flex-col items-center py-3 rounded-xl transition duration-300 relative overflow-hidden group ${
                                isSelected 
                                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-800 text-white shadow-lg shadow-indigo-950/40 border border-indigo-500/20' 
                                    : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <span className="text-[10px] font-bold tracking-wider uppercase opacity-80 mb-1">
                                {format(day, 'eee', { locale: es })}
                            </span>
                            <span className={`text-base font-extrabold ${isSelected ? 'scale-110' : ''}`}>
                                {format(day, 'd')}
                            </span>
                            
                            {/* Class indicators */}
                            <div className="absolute bottom-1.5 flex gap-1 justify-center items-center w-full">
                                {hasDayClasses && (
                                    <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-slate-500 group-hover:bg-indigo-400'}`} />
                                )}
                                {hasDayEvaluations && (
                                    <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-amber-500'}`} />
                                )}
                            </div>

                            {isToday && !isSelected && (
                                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* List of today's classes */}
            <div className="space-y-4">
                {isLoading ? (
                    <div className="flex flex-col justify-center items-center py-16 space-y-3">
                        <div className="relative w-12 h-12">
                            <div className="absolute w-12 h-12 border-4 border-indigo-500/25 rounded-full" />
                            <div className="absolute w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                        <p className="text-slate-400 text-xs font-medium animate-pulse">Cargando cronograma...</p>
                    </div>
                ) : error ? (
                    <div className="p-6 bg-red-500/5 rounded-2xl border border-red-500/10 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                        <p className="text-xs text-red-400">Error al cargar datos del calendario. Por favor intente de nuevo.</p>
                    </div>
                ) : todayClasses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 bg-slate-900/10 border border-slate-900 rounded-2xl border-dashed text-center">
                        <Clock className="w-8 h-8 text-slate-600 mb-3" />
                        <p className="text-sm font-semibold text-slate-300">No hay bloques programados</p>
                        <p className="text-xs text-slate-500 max-w-xs mt-1">
                            No se encontraron bloques de clase configurados para este día de la semana.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {todayClasses.map((classItem, idx) => {
                            const themeColor = classItem.subjectColor || '#6366f1';
                            
                            return (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                                    onClick={() => setSelectedClass(classItem)}
                                    className="group relative flex flex-col md:flex-row md:items-center justify-between p-5 bg-slate-900/60 hover:bg-slate-900/90 border border-slate-800/80 hover:border-slate-700/60 rounded-2xl transition duration-300 cursor-pointer shadow-lg hover:shadow-xl hover:shadow-black/20"
                                >
                                    {/* Left Accent Color Indicator */}
                                    <div 
                                        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl group-hover:scale-y-105 transition"
                                        style={{ backgroundColor: themeColor }}
                                    />

                                    {/* Time & Core Details */}
                                    <div className="flex flex-col md:flex-row md:items-center gap-4 pl-3">
                                        {/* Time Badge */}
                                        <div className="flex items-center gap-2 text-slate-300 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800 shrink-0 w-fit">
                                            <Clock className="w-4 h-4 text-slate-400" />
                                            <span className="text-xs font-mono font-bold">
                                                {classItem.startTime} - {classItem.endTime}
                                            </span>
                                        </div>

                                        {/* Class & Teacher Name */}
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-base font-bold text-slate-100">
                                                    {classItem.subjectName}
                                                </h3>
                                                {classItem.weekNumber && (
                                                    <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/20">
                                                        Semana {classItem.weekNumber}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-1 text-slate-400 text-xs">
                                                <User className="w-3.5 h-3.5" />
                                                <span>{classItem.teacherName || 'Docente no asignado'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Evaluation Plan Preview Details */}
                                    <div className="mt-4 md:mt-0 flex flex-wrap items-center gap-3 pl-3 md:pl-0">
                                        {classItem.hasEvaluation ? (
                                            <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-400 px-3 py-1.5 rounded-xl border border-amber-500/20 text-xs font-bold shadow-lg shadow-amber-950/10">
                                                <AlertCircle className="w-4 h-4 text-amber-400 animate-bounce" />
                                                <span>{classItem.evaluationCount} Evaluación{classItem.evaluationCount > 1 ? 'es' : ''}</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 text-slate-500 px-3 py-1.5 rounded-xl border border-slate-800/40 text-xs">
                                                <Info className="w-3.5 h-3.5" />
                                                <span>Sin evaluaciones</span>
                                            </div>
                                        )}

                                        {/* Brief preview of plan headers/fields if present */}
                                        {classItem.planContent?.headers && classItem.planContent.headers.length > 0 && (
                                            <div className="hidden lg:flex items-center gap-1.5 bg-slate-800/50 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-800 text-xs max-w-xs truncate">
                                                <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                                <span className="truncate">{classItem.planContent.headers[0].title}</span>
                                            </div>
                                        )}

                                        <span className="text-xs text-indigo-400 font-bold group-hover:translate-x-1 transition duration-200 pl-2">
                                            Ver detalle &rarr;
                                        </span>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Slider Side Drawer Panel for details */}
            <AnimatePresence>
                {selectedClass && (
                    <>
                        {/* Overlay backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedClass(null)}
                            className="fixed inset-0 bg-black z-40"
                        />

                        {/* Drawer body */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl p-6 overflow-y-auto z-50 backdrop-blur-md"
                        >
                            {/* Drawer Header */}
                            <div className="flex justify-between items-start border-b border-slate-800 pb-4 mb-6">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span 
                                            className="w-3 h-3 rounded-full shrink-0"
                                            style={{ backgroundColor: selectedClass.subjectColor }}
                                        />
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                            Detalle del Bloque de Clase
                                        </span>
                                    </div>
                                    <h3 className="text-xl font-extrabold text-slate-100 font-sans tracking-wide mt-1">
                                        {selectedClass.subjectName}
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setSelectedClass(null)}
                                    className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Class Meta Grid */}
                            <div className="grid grid-cols-2 gap-3 mb-8 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
                                <div>
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Horario</span>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-200 mt-1">
                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                        <span className="font-mono font-bold">{selectedClass.startTime} - {selectedClass.endTime}</span>
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Semana Lectiva</span>
                                    <div className="flex items-center gap-1.5 text-xs text-indigo-400 mt-1 font-bold">
                                        <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                                        <span>Semana {selectedClass.weekNumber || 'N/A'}</span>
                                    </div>
                                </div>
                                <div className="col-span-2 border-t border-slate-800/60 pt-3 mt-1">
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Docente</span>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-200 mt-1">
                                        <User className="w-3.5 h-3.5 text-slate-400" />
                                        <span>{selectedClass.teacherName || 'Docente no asignado'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Plan Content Section */}
                            <div className="space-y-6">
                                <h4 className="text-xs font-extrabold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                                    <FileText className="w-4 h-4 text-indigo-400" />
                                    <span>Plan de Evaluación de la Semana</span>
                                </h4>

                                {!selectedClass.planContent ? (
                                    <div className="p-5 text-center bg-slate-950/20 border border-slate-800 border-dashed rounded-xl">
                                        <Info className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                                        <p className="text-xs text-slate-400 font-medium">No hay plan cargado para esta semana.</p>
                                        <p className="text-[10px] text-slate-600 mt-1">Pídale al docente de la materia agregar contenido en el Plan de Evaluación.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Headers (Tema Generador / Unidad) */}
                                        {selectedClass.planContent.headers?.map((header, idx) => (
                                            <div key={idx} className="bg-indigo-950/10 border border-indigo-950 p-4 rounded-xl">
                                                <span className="text-[9px] uppercase tracking-wider font-extrabold text-indigo-400">Título / Unidad</span>
                                                <h5 className="text-sm font-bold text-slate-100 mt-1">{header.title}</h5>
                                            </div>
                                        ))}

                                        {/* Fields (Tejido Temático / Referentes) */}
                                        {selectedClass.planContent.fields?.map((field, idx) => (
                                            <div key={idx} className="bg-slate-950/20 border border-slate-900 p-4 rounded-xl">
                                                <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400">{field.label}</span>
                                                <p className="text-xs text-slate-200 mt-1 whitespace-pre-line">{field.content}</p>
                                            </div>
                                        ))}

                                        {/* Free Texts */}
                                        {selectedClass.planContent.texts?.map((textBlock, idx) => (
                                            <div key={idx} className="bg-slate-950/10 border border-slate-900 p-4 rounded-xl">
                                                <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400">Detalles de la Clase</span>
                                                <p className="text-xs text-slate-300 mt-1 whitespace-pre-line">{textBlock.textContent}</p>
                                            </div>
                                        ))}

                                        {/* Evaluations */}
                                        {selectedClass.planContent.evaluations?.map((evaluation, idx) => (
                                            <div key={idx} className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl relative overflow-hidden">
                                                <div className="absolute top-0 right-0 bg-amber-500/10 text-amber-400 text-[10px] font-mono px-3 py-1 rounded-bl-xl border-l border-b border-amber-500/20">
                                                    Puntos: {evaluation.puntos} ({evaluation.ponderacion}%)
                                                </div>
                                                <span className="text-[9px] uppercase tracking-wider font-extrabold text-amber-400">Actividad Evaluativa</span>
                                                <h5 className="text-sm font-extrabold text-slate-100 mt-1">{evaluation.actividadEval}</h5>
                                                
                                                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-amber-500/10">
                                                    <div>
                                                        <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 block">Técnica</span>
                                                        <span className="text-xs text-slate-200 font-semibold">{evaluation.tecnicas || 'No especificada'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 block">Instrumento</span>
                                                        <span className="text-xs text-slate-200 font-semibold">{evaluation.instrumentos || 'No especificado'}</span>
                                                    </div>
                                                </div>

                                                {evaluation.criterios && (
                                                    <div className="mt-3">
                                                        <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Criterios de Evaluación</span>
                                                        <p className="text-xs text-slate-300 mt-1">{evaluation.criterios}</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        {/* Indicators (SER/HACER/CONOCER/CONVIVIR) */}
                                        {selectedClass.planContent.indicators?.map((indicatorBlock, idx) => (
                                            <div key={idx} className="bg-purple-950/10 border border-purple-950/30 p-4 rounded-xl">
                                                <span className="text-[9px] uppercase tracking-wider font-extrabold text-purple-400">Criterios / Indicadores</span>
                                                <p className="text-xs text-slate-300 mt-1 whitespace-pre-line">{indicatorBlock.indicadores}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
