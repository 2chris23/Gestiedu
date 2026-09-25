import React, { useState } from 'react';
import { X, Calendar as CalendarIcon, ChevronLeft, ChevronRight, CheckCircle2, Clock, Info } from 'lucide-react';
import Link from 'next/link';
import { useClassroomHistory } from '@/hooks/useSchedules';
import { toLocalYMD } from '@/utils/date.utils';

interface ScheduleCalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
    classroomId: string;
}

export default function ScheduleCalendarModal({ isOpen, onClose, classroomId }: ScheduleCalendarModalProps) {
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    
    // Fecha LOCAL como YYYY-MM-DD. Con toISOString() se mandaba la fecha UTC:
    // en Venezuela (UTC-4), a partir de las 8 de la noche pedía el día siguiente.
    const dateStr = toLocalYMD(selectedDate);
    
    const { data: history, isLoading } = useClassroomHistory(classroomId, dateStr, isOpen);

    if (!isOpen) return null;

    const changeDays = (days: number) => {
        const newDate = new Date(selectedDate);
        newDate.setDate(newDate.getDate() + days);
        setSelectedDate(newDate);
    };

    const formatDate = (date: Date) => {
        return new Intl.DateTimeFormat('es-ES', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        }).format(date);
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
                <div
                    className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
                    onClick={onClose}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onClose();
                        }
                    }}
                />
                
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                
                <div className="inline-block w-full max-w-2xl text-left align-middle transition-all transform bg-white rounded-2xl shadow-xl sm:my-8">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <CalendarIcon className="w-5 h-5 text-indigo-600" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Historial de Clases</h3>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-500 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6">
                        {/* Date Selector */}
                        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-2 mb-6">
                            <button
                                onClick={() => changeDays(-1)}
                                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            
                            <div className="flex flex-col items-center">
                                <span className="text-sm text-gray-500 font-medium">Fecha Seleccionada</span>
                                <span className="text-lg font-bold text-gray-900 capitalize">
                                    {formatDate(selectedDate)}
                                </span>
                            </div>

                            <button
                                onClick={() => changeDays(1)}
                                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Schedule Timeline */}
                        <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
                            
                            {isLoading ? (
                                <div className="py-12 flex flex-col items-center justify-center relative z-10 bg-white/80">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
                                    <p className="text-gray-500 text-sm">Cargando clases...</p>
                                </div>
                            ) : !history || history.length === 0 ? (
                                <div className="py-12 flex flex-col items-center justify-center relative z-10 bg-white/80">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                                        <CalendarIcon className="w-8 h-8 text-gray-300" />
                                    </div>
                                    <p className="text-gray-500 font-medium text-center">No hay clases programadas para este día.</p>
                                </div>
                            ) : (
                                history.map((session, index) => (
                                    <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                        
                                        {/* Timeline Dot */}
                                        {/* Una clase suspendida NO es una clase dada: antes el historial la
                                            pintaba en verde como registrada solo porque existía su sesión. */}
                                        <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ${
                                            session.isSuspended ? 'bg-amber-500' : session.isRecorded ? 'bg-green-500' : 'bg-gray-300'
                                        }`}>
                                            {session.isSuspended ? (
                                                <X className="w-4 h-4 text-white" />
                                            ) : session.isRecorded ? (
                                                <CheckCircle2 className="w-4 h-4 text-white" />
                                            ) : (
                                                <Clock className="w-4 h-4 text-white" />
                                            )}
                                        </div>

                                        {/* Card */}
                                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold`} style={{ 
                                                    backgroundColor: session.subject.color ? `${session.subject.color}15` : '#f3f4f6',
                                                    color: session.subject.color || '#4b5563'
                                                }}>
                                                    {session.subject.name}
                                                </span>
                                                <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {session.startTime} - {session.endTime}
                                                </span>
                                            </div>

                                            {session.isSuspended ? (
                                                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                                    <X className="w-4 h-4 shrink-0 mt-px" />
                                                    <span>
                                                        <strong>Clase suspendida</strong>
                                                        {session.suspendedReason ? `: ${session.suspendedReason}` : ''}
                                                    </span>
                                                </div>
                                            ) : session.isRecorded && session.sessionInfo ? (
                                                <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
                                                    <h4 className="text-sm font-bold text-gray-800 mb-1 line-clamp-1">{session.sessionInfo.topic || 'Sin tema registrado'}</h4>
                                                    <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                                                        {session.sessionInfo.observations || 'Sin observaciones'}
                                                    </p>
                                                    <Link 
                                                        href={`/dashboard/clases/${session.sessionInfo.id}`}
                                                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                                                    >
                                                        <Info className="w-3.5 h-3.5" />
                                                        Ver detalles completos
                                                    </Link>
                                                </div>
                                            ) : (
                                                <div className="mt-3 flex items-center gap-2 text-sm text-gray-400 italic">
                                                    <Info className="w-4 h-4" />
                                                    <span>Clase no registrada aún</span>
                                                </div>
                                            )}

                                            {session.isExtra && (
                                                <div className="mt-2 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded w-max">
                                                    Clase extra (fuera de horario)
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
