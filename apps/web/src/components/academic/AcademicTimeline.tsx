'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Folder, Lock, ArrowRight, Clock, Trash2, GraduationCap } from 'lucide-react';
import { AcademicYear } from '@/services/academic-year.service';
import { useRouter } from 'next/navigation';
import SecureDeleteModal from './SecureDeleteModal';
import { useState } from 'react';

interface AcademicTimelineProps {
    years: AcademicYear[];
    loading?: boolean;
    onRefresh?: () => void;
}

export default function AcademicTimeline({ years, loading, onRefresh }: AcademicTimelineProps) {
    const router = useRouter();
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; yearId: string | null; yearName: string }>({
        isOpen: false,
        yearId: null,
        yearName: ''
    });

    const openDeleteModal = (e: React.MouseEvent, year: AcademicYear) => {
        e.stopPropagation();
        setDeleteModal({ isOpen: true, yearId: year.id, yearName: year.name });
    };

    if (loading) {
        return (
            <div className="space-y-4 animate-pulse max-w-2xl mx-auto">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-24 bg-gray-100 rounded-lg"></div>
                ))}
            </div>
        );
    }

    // Sort years by end date descending (newest first)
    // In a real infinite timeline, we might want descending order.
    const sortedYears = [...years].sort((a, b) =>
        new Date(b.endDate).getTime() - new Date(a.endDate).getTime()
    );

    if (sortedYears.length === 0) {
        return (
            <div className="max-w-xl mx-auto py-16 px-4">
                <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center">
                    <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <GraduationCap className="w-8 h-8 text-indigo-500" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                        Aún no hay ciclos escolares
                    </h2>
                    <p className="text-gray-500 mb-6">
                        Crea tu primer ciclo escolar para comenzar a organizar aulas, secciones y materias.
                    </p>
                    <p className="text-sm text-gray-400">
                        Haz clic en <span className="font-medium text-indigo-600">«Nuevo Ciclo»</span> arriba para empezar.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative max-w-2xl mx-auto py-8 px-4">
            {/* Vertical Line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200" aria-hidden="true"></div>

            <div className="space-y-8">
                {sortedYears.map((year) => {
                    const now = new Date();
                    const startDate = new Date(year.startDate);
                    const endDate = new Date(year.endDate);

                    const isActiveDb = year.status === 'ACTIVE';

                    // Lógica temporal estricta
                    const isPast = endDate < now; // Ya terminó
                    const isFuture = startDate > now; // Aún no empieza
                    const isCurrentDate = !isPast && !isFuture; // Estamos dentro del rango (start <= now <= end)

                    // Flags finales para UI
                    const showActive = isActiveDb || isCurrentDate; // Mostramos como activo si la BD lo dice O si estamos en fechas
                    const showFuture = isFuture && !isActiveDb;
                    const showPast = isPast && !isActiveDb;

                    return (
                        <div
                            key={year.id}
                            className={`relative pl-16 transition-all duration-300 ${showActive ? 'scale-105' : 'hover:scale-[1.02]'
                                }`}
                        >
                            {/* Icon Indicator */}
                            <div className={`
                                absolute left-0 top-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center rounded-full border-4 z-10 bg-white
                                ${showActive ? 'border-primary-500 text-primary-600 shadow-lg scale-110' : ''}
                                ${showPast ? 'border-gray-200 text-gray-400' : ''}
                                ${showFuture ? 'border-blue-100 text-blue-300' : ''}
                            `}>
                                {showActive && <Calendar className="w-8 h-8" />}
                                {showPast && <Folder className="w-6 h-6" />}
                                {showFuture && <Clock className="w-6 h-6" />}
                            </div>

                            {/* Card Content */}
                            <div
                                onClick={() => router.push(`/dashboard/academico/${year.name}`)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/dashboard/academico/${year.name}`); } }}
                                className={`
                                    rounded-xl p-6 border transition-all cursor-pointer group
                                    ${showActive
                                        ? 'bg-white border-primary-500 shadow-xl ring-1 ring-primary-100 border-l-8'
                                        : ''
                                    }
                                    ${showPast
                                        ? 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-white hover:border-gray-300'
                                        : ''
                                    }
                                    ${showFuture
                                        ? 'bg-blue-50/30 border-blue-100 text-gray-600 hover:bg-white hover:border-blue-200'
                                        : ''
                                    }
                                `}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className={`text-xl font-bold ${showActive ? 'text-gray-900' : 'text-gray-700'}`}>
                                                Ciclo Escolar {year.name}
                                            </h3>
                                            {showActive && (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-claro text-indigo-hondo text-xs font-bold"><span className="h-1.5 w-1.5 rounded-full bg-indigo animate-pulse" aria-hidden="true" />
                                                    EN CURSO
                                                </span>
                                            )}
                                            {showFuture && (
                                                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                                                    PRÓXIMO
                                                </span>
                                            )}
                                            {showPast && (
                                                <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-xs font-bold">
                                                    FINALIZADO
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm opacity-75 capitalize">
                                            {format(new Date(year.startDate), 'MMMM yyyy', { locale: es })} - {format(new Date(year.endDate), 'MMMM yyyy', { locale: es })}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <div
                                            onClick={(e) => openDeleteModal(e, year)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDeleteModal(e as unknown as React.MouseEvent, year); } }}
                                            className="p-2 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors z-20"
                                            title="Eliminar ciclo escolar"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </div>

                                        <div className={`p-2 rounded-full transition-colors ${showActive ? 'bg-primary-50 text-primary-600' : 'bg-gray-100 text-gray-400 group-hover:bg-primary-50 group-hover:text-primary-600'}`}>
                                            <ArrowRight className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>

                                {showActive && (
                                    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4 text-sm">
                                        <div className="flex flex-col">
                                            <span className="text-gray-500 text-xs">Aulas Activas</span>
                                            <span className="font-semibold text-gray-900">{year._count?.classrooms || 0}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-gray-500 text-xs">Estado</span>
                                            <span className="font-semibold text-green-600">Abierto</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <SecureDeleteModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ ...deleteModal, isOpen: false })}
                yearId={deleteModal.yearId}
                yearName={deleteModal.yearName}
                onSuccess={() => {
                    if (onRefresh) onRefresh();
                }}
            />
        </div>
    );
}
