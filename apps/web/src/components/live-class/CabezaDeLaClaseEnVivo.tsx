import { BotonComoFunciona } from '@/components/common/Recorrido';
import Link from 'next/link';
import {
    ChevronLeft,
    Clock,
    User,
    Loader2,
    Calendar,
    CheckCircle2,
    Ban,
    StickyNote,
    CloudUpload,
    Clock3,
} from 'lucide-react';
import TurnoBadge from '@/components/common/TurnoBadge';
import type { useClaseEnVivo } from './useClaseEnVivo';

/** La cabecera de la clase en vivo: volver, la materia y la sección, el profesor, la hora y las acciones (guardado, suspender, observaciones). */
export function CabezaDeLaClaseEnVivo({ c }: { c: ReturnType<typeof useClaseEnVivo> }) {
    const {
        router,
        user,
        date,
        startTime,
        endTime,
        data,
        claseEnCola,
        saveMutation,
        setIsLiveObsModalOpen,
        canEdit,
        guardadoALas,
        setSuspendiendo,
        teacherName,
        isSuspended,
        formatDate,
    } = c;

    return (
        <>
            {/* ========================================================================= */}
            {/* 1. HEADER COMPACTO Y MODERNO                                              */}
            {/* ========================================================================= */}
            <header className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    {/* Info izquierda */}
                    <div className="flex items-center gap-3.5 min-w-0">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="-ml-2 flex h-11 w-11 items-center justify-center text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors flex-shrink-0"
                            title="Volver"
                            aria-label="Volver"
                        >
                            <ChevronLeft className="w-5 h-5" aria-hidden />
                        </button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-gray-400 font-medium mb-0.5">
                                <Link href="/dashboard" className="hover:text-indigo-600 transition-colors">Inicio</Link>
                                <span>/</span>
                                <span className="font-semibold text-gray-700">Clase en Vivo</span>
                            </div>
                            <h1 className="text-seccion sm:text-pantalla font-bold text-gray-900 truncate flex items-center gap-2.5">
                                {data?.subject?.name || 'Materia'}
                                {data?.antesDelPlan ? (
                                    <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full shadow-2xs">
                                        {data.nombreAntesDelPlan || 'Diagnóstico'}
                                    </span>
                                ) : data?.weekNumber ? (
                                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100/80 px-2.5 py-0.5 rounded-full shadow-2xs">
                                        Semana {data.weekNumber}
                                    </span>
                                ) : null}
                            </h1>
                            <div className="text-xs text-gray-500 flex items-center gap-3.5 flex-wrap mt-1">
                                <span className="flex items-center gap-1 font-medium text-gray-700">
                                    <User className="w-3.5 h-3.5 text-indigo-500" /> {teacherName}
                                </span>
                                {startTime && endTime && (
                                    <span className="flex items-center gap-1 font-medium text-gray-600">
                                        <Clock className="w-3.5 h-3.5 text-indigo-500" /> {startTime} - {endTime}
                                    </span>
                                )}
                                <span className="flex items-center gap-1 capitalize font-medium text-gray-600">
                                    <Calendar className="w-3.5 h-3.5 text-indigo-500" /> {formatDate(date)}
                                </span>
                                {data?.classroom && (
                                    <span className="flex items-center gap-1.5 font-medium text-gray-700">
                                        {data.classroom.name}
                                        <TurnoBadge turno={data.classroom.shift} />
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Acciones derecha */}
                    {/* Sin `flex-shrink-0`: con la ayuda, en el teléfono no cabía en una fila
                        y, sin poder encogerse, ensanchaba la pantalla (481 px en 390). */}
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                        <BotonComoFunciona recorrido="clase-en-vivo" />
                        {isSuspended && (
                            <span className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold px-3 py-2 rounded-xl shadow-2xs">
                                <Ban className="w-4 h-4" /> Suspendida
                            </span>
                        )}
                        <button
                            type="button"
                            data-recorrido="clase-observacion"
                            onClick={() => setIsLiveObsModalOpen(true)}
                            className="px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center gap-1.5 border shadow-2xs bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                        >
                            <StickyNote className="w-4 h-4 text-amber-500" />
                            <span>Observación</span>
                            {((data as any)?.sessionObservations?.length || 0) > 0 && (
                                <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[10px] rounded-full font-bold">
                                    {(data as any).sessionObservations.length}
                                </span>
                            )}
                        </button>
                        {canEdit && (
                            <>
                                {/* Suspender es del admin: el servidor ya lo exige. */}
                                {user?.role === 'ADMIN' && (
                                <button
                                    type="button"
                                    onClick={() => setSuspendiendo(true)}
                                    disabled={isSuspended}
                                    className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-rose-600 bg-white border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
                                >
                                    <Ban className="w-4 h-4" />
                                    <span className="hidden sm:inline">Suspender</span>
                                </button>
                                )}
                                {/* Ya no hay que acordarse de guardar: aquí se ve que se guardó. */}
                                <span
                                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700"
                                    aria-live="polite"
                                    data-recorrido="clase-guardado"
                                >
                                    {saveMutation.isPending ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" /> Guardando…
                                        </>
                                    ) : claseEnCola ? (
                                        <>
                                            <Clock3 className="w-3.5 h-3.5 text-amber-600" /> Pendiente de enviar
                                        </>
                                    ) : guardadoALas ? (
                                        <>
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Guardado {guardadoALas}
                                        </>
                                    ) : (
                                        <>
                                            <CloudUpload className="w-3.5 h-3.5 text-gray-500" /> Se guarda solo
                                        </>
                                    )}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {isSuspended && data?.session?.suspendedReason && (
                    <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl">
                        <strong>Motivo de suspensión:</strong> {data.session.suspendedReason}
                    </div>
                )}
            </header>
        </>
    );
}
