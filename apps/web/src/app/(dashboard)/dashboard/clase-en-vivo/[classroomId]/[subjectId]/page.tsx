'use client';

import { VentanasDeLaClaseEnVivo } from '@/components/live-class/VentanasDeLaClaseEnVivo';
import { TablaDeLaClaseEnVivo } from '@/components/live-class/TablaDeLaClaseEnVivo';
import { CabezaDeLaClaseEnVivo } from '@/components/live-class/CabezaDeLaClaseEnVivo';

import { Suspense } from 'react';
import {
    Users,
    Loader2,
    CheckCircle2,
    UserPlus,
    StickyNote,
} from 'lucide-react';

import { SkeletonLiveClass } from '@/components/ui/skeleton/SkeletonLiveClass';
import LiveTopicMirrorCard from '@/components/live-class/LiveTopicMirrorCard';
import LiveActivitiesCard from '@/components/live-class/LiveActivitiesCard';
import { useClaseEnVivo } from '@/components/live-class/useClaseEnVivo';

function LiveClassPageInner() {
    const c = useClaseEnVivo();
    const {
        classroomId,
        subjectId,
        hoyDelLiceo,
        date,
        isLoading,
        data,
        obsMode,
        observationsTitle,
        setObservationsTitle,
        observations,
        setObservations,
        involvedIds,
        setShowStudentSearch,
        activeGradingActivity,
        setActiveGradingActivity,
        textoSinGuardar,
        canEdit,
        setCambiosPorGuardar,
        classStudents,
        toggleInvolved,
        selectAllInvolved,
    } = c;

    if (isLoading) {
        return <SkeletonLiveClass studentCount={10} />;
    }

    return (
        <div className="space-y-6 pb-12 text-slate-800 animate-in fade-in duration-200">
            <CabezaDeLaClaseEnVivo c={c} />

            {obsMode ? (
                /* ========================================================================= */
                /* MODO OBSERVACIÓN (Incidencias y notas especiales)                          */
                /* ========================================================================= */
                <div className="space-y-4 animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-2.5 mb-4">
                            <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600">
                                <StickyNote className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Registrar Observación de Clase</h2>
                                <p className="text-xs text-gray-500">Anota incidencias, conducta o novedades del grupo</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">Título</label>
                                <input
                                    type="text"
                                    value={observationsTitle}
                                    onChange={(e) => { textoSinGuardar.current = true; setObservationsTitle(e.target.value); setCambiosPorGuardar((n) => n + 1); }}
                                    placeholder="Ej: Comportamiento del grupo / Novedad académica"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">Descripción</label>
                                <textarea
                                    value={observations}
                                    onChange={(e) => { textoSinGuardar.current = true; setObservations(e.target.value); setCambiosPorGuardar((n) => n + 1); }}
                                    rows={5}
                                    placeholder="Describe lo ocurrido en la sesión..."
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                                    <Users className="w-5 h-5" />
                                </div>
                                <h2 className="text-base font-bold text-gray-900">
                                    Estudiantes Involucrados ({involvedIds.length})
                                </h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={selectAllInvolved}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                                >
                                    {classStudents.every((s) => involvedIds.includes(s.id)) ? 'Deseleccionar' : 'Seleccionar Todos'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowStudentSearch(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                                >
                                    <UserPlus className="w-3.5 h-3.5" />
                                    Agregar de Otra Sección
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            {classStudents.map((student) => {
                                const isInvolved = involvedIds.includes(student.id);
                                return (
                                    <button
                                        key={student.id}
                                        type="button"
                                        onClick={() => toggleInvolved(student.id)}
                                        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all ${
                                            isInvolved
                                                ? 'bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200'
                                                : 'bg-white border-gray-100 hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                            {student.firstName?.[0]}{student.lastName?.[0]}
                                        </div>
                                        <span className="text-xs font-semibold text-gray-800 flex-1 truncate">
                                            {student.firstName} {student.lastName}
                                        </span>
                                        {isInvolved ? (
                                            <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                        ) : (
                                            <span className="w-4 h-4 rounded-full border-2 border-gray-200 flex-shrink-0" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            ) : (
                /* ========================================================================= */
                /* MODO CLASE EN VIVO NORMAL                                                 */
                /* ========================================================================= */
                <>
                    {/* ===================================================================== */}
                    {/* 2. CUADRÍCULA SUPERIOR: TEMA (Izquierda) + ACTIVIDADES (Derecha)     */}
                    {/* ===================================================================== */}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                        {/* 🟢 ZONA VERDE: Espejo del Plan de Evaluación (7 cols en XL) */}
                        <div className="xl:col-span-7" data-recorrido="clase-tema">
                            <LiveTopicMirrorCard
                                classroomId={classroomId}
                                subjectId={subjectId}
                                date={date}
                                weekNumber={data?.weekNumber}
                                antesDelPlan={data?.antesDelPlan}
                                nombreAntesDelPlan={data?.nombreAntesDelPlan}
                                inicioDelPlan={data?.inicioDelPlan}
                                weekRow={data?.weekRow}
                                planContent={data?.planContent}
                                planColumns={data?.planColumns}
                                canEdit={canEdit}
                            />
                        </div>

                        {/* 🔵 ZONA AZUL: Actividades & Notas (5 cols en XL) */}
                        <div className="xl:col-span-5" data-recorrido="clase-actividades">
                            <LiveActivitiesCard
                                classroomId={classroomId}
                                subjectId={subjectId}
                                activities={data?.activities || []}
                                activeGradingActivityId={activeGradingActivity?.id || null}
                                onSelectGradingActivity={(act) => setActiveGradingActivity(act)}
                                canEdit={canEdit}
                                planRowId={data?.weekRow?.id}
                                classSessionId={data?.session?.id}
                                date={date}
                                esFuturo={Boolean(hoyDelLiceo) && date > hoyDelLiceo}
                                evaluaciones={data?.evaluacionesDeLaSemana}
                                planConPuntos={data?.planConPuntos}
                            />
                        </div>
                    </div>

                    <TablaDeLaClaseEnVivo c={c} />
                </>
            )}

            <VentanasDeLaClaseEnVivo c={c} />
        </div>
    );
}

export default function LiveClassPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-[75vh] flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-3" />
                    <p className="text-sm font-medium text-gray-500">Cargando...</p>
                </div>
            }
        >
            <LiveClassPageInner />
        </Suspense>
    );
}
