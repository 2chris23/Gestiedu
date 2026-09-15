'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ChevronLeft, Clock, User, Users, Save, Loader2, Calendar,
    Plus, Trash2, CheckCircle2, ListTodo, Ban, Search, X,
    ArrowUp, ShieldCheck, UserPlus, StickyNote, GraduationCap, CheckSquare, Square,
    ArrowUpDown, ArrowUp as ArrowUpIcon, ArrowDown, Award, MoreVertical, Check
} from 'lucide-react';
import {
    useLiveClassDetail,
    useSaveLiveClass,
    useCreateClassActivity,
    useUpdateClassActivity,
    useDeleteClassActivity,
    useSaveActivityGrades,
    useSuspendClass,
    useSearchStudents,
    useSavePlanWeek,
    SearchStudentResult,
    ClassActivity,
} from '@/hooks/useLiveClass';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';

import AnimatedAttendancePicker, { ATTENDANCE_CONFIG, AttendanceStatusType } from '@/components/live-class/AnimatedAttendancePicker';
import LiveTopicMirrorCard from '@/components/live-class/LiveTopicMirrorCard';
import LiveActivitiesCard from '@/components/live-class/LiveActivitiesCard';
import LiveGradesSliderInput from '@/components/live-class/LiveGradesSliderInput';
import StudentObservationsModal from '@/components/observations/StudentObservationsModal';
import LiveClassObservationModal from '@/components/observations/LiveClassObservationModal';
import { toLocalYMD } from '@/utils/date.utils';
import { useSchoolToday } from '@/hooks/useSchoolTime';

function LiveClassPageInner() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuthStore();

    const classroomId = params.classroomId as string;
    const subjectId = params.subjectId as string;
    // El día lo dice el servidor: con el reloj del dispositivo cambiado se
    // abriría la clase de otro día.
    const hoyDelLiceo = useSchoolToday();
    const date = searchParams.get('date') || hoyDelLiceo;
    const startTime = searchParams.get('start') || undefined;
    const endTime = searchParams.get('end') || undefined;

    const { data, isLoading, refetch } = useLiveClassDetail(classroomId, subjectId, date);
    const saveMutation = useSaveLiveClass();
    const suspendClass = useSuspendClass();
    const saveActivityGrades = useSaveActivityGrades();

    // Mode States
    const [obsMode, setObsMode] = useState(false);
    const [observationsTitle, setObservationsTitle] = useState('');
    const [observations, setObservations] = useState('');
    const [attendance, setAttendance] = useState<Record<string, AttendanceStatusType>>({});
    const [involvedIds, setInvolvedIds] = useState<string[]>([]);
    
    // External student search modal
    const [searchTerm, setSearchTerm] = useState('');
    const [showStudentSearch, setShowStudentSearch] = useState(false);
    const { data: searchResults, isLoading: isSearching } = useSearchStudents(searchTerm);

    // Active Grading Activity State (Modo Calificación)
    const [activeGradingActivity, setActiveGradingActivity] = useState<ClassActivity | null>(null);
    const [activityGradesDraft, setActivityGradesDraft] = useState<Record<string, Record<string, number | null>>>({});

    // Table search & sort states
    const [studentSearch, setStudentSearch] = useState('');
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    // Modal de observaciones
    const [isLiveObsModalOpen, setIsLiveObsModalOpen] = useState(false);
    const [selectedObsStudentId, setSelectedObsStudentId] = useState<string | null>(null);
    const [selectedStudentForObs, setSelectedStudentForObs] = useState<any | null>(null);

    // Initialize data
    useEffect(() => {
        if (data) {
            setObservationsTitle(data.session?.observationsTitle || '');
            setObservations(data.session?.observations || '');
            const attMap: Record<string, AttendanceStatusType> = {};
            data.students.forEach((s) => {
                if (s.status) attMap[s.id] = s.status as AttendanceStatusType;
                else attMap[s.id] = 'PRESENT';
            });
            setAttendance(attMap);

            const involved = data.session?.involvedStudentIds;
            if (involved && involved.length > 0) {
                setInvolvedIds(involved);
            } else {
                setInvolvedIds(data.students.filter((s) => !s.external).map((s) => s.id));
            }

            // Sync grades draft from activities
            const drafts: Record<string, Record<string, number | null>> = {};
            (data.activities || []).forEach((act) => {
                if (act.scores) {
                    try {
                        const parsed = typeof act.scores === 'string' ? JSON.parse(act.scores) : act.scores;
                        drafts[act.id] = parsed;
                    } catch {
                        drafts[act.id] = {};
                    }
                } else {
                    drafts[act.id] = {};
                }
            });
            setActivityGradesDraft(drafts);
        }
    }, [data]);

    const canEdit = user?.role === 'TEACHER' || user?.role === 'ADMIN';

    const handleAttendanceChange = (studentId: string, status: AttendanceStatusType) => {
        setAttendance((prev) => ({ ...prev, [studentId]: status }));
    };

    const handleGradeScoreChange = (studentId: string, newScore: number | null) => {
        if (!activeGradingActivity) return;
        const actId = activeGradingActivity.id;
        setActivityGradesDraft((prev) => ({
            ...prev,
            [actId]: {
                ...(prev[actId] || {}),
                [studentId]: newScore,
            },
        }));
    };

    const handleSaveCurrentActivityGrades = async () => {
        if (!activeGradingActivity) return;
        const actId = activeGradingActivity.id;
        const scores = activityGradesDraft[actId] || {};
        try {
            await saveActivityGrades.mutateAsync({
                activityId: actId,
                scores,
                maxScore: activeGradingActivity.maxScore || 20,
            });
        } catch {
            // error handled
        }
    };

    const counts = useMemo(() => {
        const r: Record<AttendanceStatusType, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
        data?.students.forEach((s) => {
            const st = (attendance[s.id] || s.status || 'PRESENT') as AttendanceStatusType;
            if (r[st] !== undefined) r[st]++;
        });
        return r;
    }, [data, attendance]);

    const classStudents = (data?.students || []).filter((s) => !s.external);
    const externalStudents = (data?.students || []).filter((s) => s.external);
    const involvedExternal = searchResults?.filter((r) => involvedIds.includes(r.id)) || [];

    // Filter + Sort Students
    const filteredStudents = classStudents.filter((s) => {
        if (!studentSearch) return true;
        const q = studentSearch.toLowerCase();
        return (
            s.firstName?.toLowerCase().includes(q) ||
            s.lastName?.toLowerCase().includes(q) ||
            s.id?.toLowerCase().includes(q) ||
            s.studentCode?.toLowerCase().includes(q)
        );
    });

    const sortedStudents = [...filteredStudents].sort((a, b) => {
        if (!sortColumn) return 0;
        let av = '';
        let bv = '';
        if (sortColumn === 'nombre') {
            av = `${a.firstName} ${a.lastName}`.toLowerCase();
            bv = `${b.firstName} ${b.lastName}`.toLowerCase();
        } else if (sortColumn === 'cedula') {
            av = a.studentCode || a.id || '';
            bv = b.studentCode || b.id || '';
        } else return 0;
        if (av < bv) return sortDirection === 'asc' ? -1 : 1;
        if (av > bv) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const handleSort = (col: string) => {
        if (sortColumn === col) setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
        else {
            setSortColumn(col);
            setSortDirection('asc');
        }
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5 text-gray-300" />;
        return sortDirection === 'asc' ? (
            <ArrowUpIcon className="h-3.5 w-3.5 text-indigo-600" />
        ) : (
            <ArrowDown className="h-3.5 w-3.5 text-indigo-600" />
        );
    };

    const handleSave = async () => {
        try {
            await saveMutation.mutateAsync({
                classroomId,
                subjectId,
                date,
                observationsTitle,
                observations,
                involvedStudentIds: involvedIds,
                startTime,
                endTime,
                attendances: data?.students.map((s) => ({
                    studentId: s.id,
                    status: attendance[s.id] || 'PRESENT',
                })) || [],
            });
            toast.success('Clase y asistencias guardadas exitosamente');
        } catch {
            // handled
        }
    };

    const handleSuspend = async () => {
        try {
            const reason = window.prompt('Motivo de la suspensión (opcional):') || undefined;
            const res = await suspendClass.mutateAsync({ classroomId, subjectId, date, reason });
            toast.success(
                res?.mergedTemaGenerador
                    ? 'Clase suspendida. Tema fusionado con la semana siguiente.'
                    : 'Clase suspendida.'
            );
        } catch {
            // handled
        }
    };

    const toggleInvolved = (id: string) => {
        setInvolvedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const selectAllInvolved = () => {
        const allIds = classStudents.map((s) => s.id);
        setInvolvedIds((prev) => {
            const allSelected = allIds.every((id) => prev.includes(id));
            if (allSelected) return prev.filter((id) => !allIds.includes(id));
            return Array.from(new Set([...prev, ...allIds]));
        });
    };

    const addExternalStudent = (s: SearchStudentResult) => {
        setInvolvedIds((prev) => (prev.includes(s.id) ? prev : [...prev, s.id]));
        setShowStudentSearch(false);
        setSearchTerm('');
        toast.success(`${s.firstName} ${s.lastName} agregado`);
    };

    if (isLoading) {
        return (
            <div className="min-h-[75vh] flex flex-col items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-3" />
                <p className="text-sm font-medium text-gray-500">Cargando clase en vivo...</p>
            </div>
        );
    }

    const teacherName = data?.teacher ? `${data.teacher.firstName} ${data.teacher.lastName}` : 'Sin profesor';
    const isSuspended = data?.session?.status === 'SUSPENDED';
    // CORRECCIÓN (bug del roster): la columna "Calificaciones" debe mostrar SOLO
    // las notas de actividades de ESTA sesión (mismo scoping que la tarjeta
    // "Clase de Hoy"). Antes filtraba con `target === 'CURRENT'` sin vínculo a
    // la sesión y mostraba una nota de OTRO día ("Act #1: 20/20" en una clase
    // sin actividades).
    const currentActivitiesList = (data?.activities || []).filter((a) => a.belongsToSession || a.dueToday);

    const formatDate = (iso: string) => {
        const d = new Date(`${iso}T12:00:00`);
        return d.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };

    return (
        <div className="space-y-6 pb-12 text-slate-800 animate-in fade-in duration-200">
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
                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors flex-shrink-0"
                            title="Volver"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-gray-400 font-medium mb-0.5">
                                <Link href="/dashboard" className="hover:text-indigo-600 transition-colors">Dashboard</Link>
                                <span>/</span>
                                <span className="font-semibold text-gray-700">Clase en Vivo</span>
                            </div>
                            <h1 className="text-xl sm:text-2xl font-black text-gray-900 truncate flex items-center gap-2.5">
                                {data?.subject?.name || 'Materia'}
                                {data?.weekNumber && (
                                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100/80 px-2.5 py-0.5 rounded-full shadow-2xs">
                                        Semana {data.weekNumber}
                                    </span>
                                )}
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
                            </div>
                        </div>
                    </div>

                    {/* Acciones derecha */}
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                        {isSuspended && (
                            <span className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold px-3 py-2 rounded-xl shadow-2xs">
                                <Ban className="w-4 h-4" /> Suspendida
                            </span>
                        )}
                        <button
                            type="button"
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
                                <button
                                    type="button"
                                    onClick={handleSuspend}
                                    disabled={suspendClass.isPending || isSuspended}
                                    className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-rose-600 bg-white border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
                                >
                                    {suspendClass.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                    <span className="hidden sm:inline">Suspender</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saveMutation.isPending}
                                    className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-xs active:scale-95"
                                >
                                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    <span>Guardar</span>
                                </button>
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
                                    onChange={(e) => setObservationsTitle(e.target.value)}
                                    placeholder="Ej: Comportamiento del grupo / Novedad académica"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">Descripción</label>
                                <textarea
                                    value={observations}
                                    onChange={(e) => setObservations(e.target.value)}
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
                        <div className="xl:col-span-7">
                            <LiveTopicMirrorCard
                                classroomId={classroomId}
                                subjectId={subjectId}
                                date={date}
                                weekNumber={data?.weekNumber}
                                weekRow={data?.weekRow}
                                planContent={data?.planContent}
                                planColumns={data?.planColumns}
                                canEdit={canEdit}
                            />
                        </div>

                        {/* 🔵 ZONA AZUL: Actividades & Notas (5 cols en XL) */}
                        <div className="xl:col-span-5">
                            <LiveActivitiesCard
                                classroomId={classroomId}
                                subjectId={subjectId}
                                activities={data?.activities || []}
                                activeGradingActivityId={activeGradingActivity?.id || null}
                                onSelectGradingActivity={(act) => setActiveGradingActivity(act)}
                                canEdit={canEdit}
                                planRowId={data?.weekRow?.id}
                                classSessionId={data?.session?.id}
                            />
                        </div>
                    </div>

                    {/* ===================================================================== */}
                    {/* 3. ZONA ROJA: TABLA COMPLETA DE ESTUDIANTES                           */}
                    {/* ===================================================================== */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        {/* Header de la tabla: Buscador + Contadores + Banner Calificación */}
                        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col gap-4">
                            {/* Banner de Modo Calificación Activo */}
                            {activeGradingActivity && (
                                <div className="p-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-sm flex items-center justify-between gap-3 flex-wrap animate-in fade-in duration-150">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 bg-white/20 rounded-lg">
                                            <Award className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-extrabold uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded text-white">
                                                Modo Calificación Activo
                                            </span>
                                            <h3 className="text-sm font-bold mt-0.5">
                                                Calificando: {activeGradingActivity.title} (Max: {activeGradingActivity.maxScore || 20} pts)
                                            </h3>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleSaveCurrentActivityGrades}
                                            disabled={saveActivityGrades.isPending}
                                            className="px-4 py-1.5 text-xs font-bold bg-white text-blue-700 hover:bg-blue-50 rounded-lg shadow-xs transition-colors flex items-center gap-1"
                                        >
                                            {saveActivityGrades.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                            Guardar Notas
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveGradingActivity(null)}
                                            className="px-3 py-1.5 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white rounded-lg transition-colors"
                                        >
                                            Cerrar Modo
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Fila con buscador y contadores de asistencia */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="relative max-w-sm w-full">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        value={studentSearch}
                                        onChange={(e) => setStudentSearch(e.target.value)}
                                        className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-xs transition"
                                        placeholder="Buscar alumno por nombre o cédula..."
                                    />
                                </div>

                                {/* Contadores de Asistencia */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as AttendanceStatusType[]).map((key) => {
                                        const def = ATTENDANCE_CONFIG[key];
                                        return (
                                            <div
                                                key={key}
                                                className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 rounded-xl border border-gray-100"
                                            >
                                                <span className={`w-2 h-2 rounded-full ${def.dotColor}`} />
                                                <span className="text-xs font-bold text-gray-800">{counts[key]}</span>
                                                <span className="text-[11px] text-gray-400 font-medium">{def.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Tabla Idéntica a la Vista de Sección */}
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50/80">
                                    <tr>
                                        {/* Perfil */}
                                        <th
                                            scope="col"
                                            className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                                            onClick={() => handleSort('nombre')}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                Perfil <SortIcon column="nombre" />
                                            </div>
                                        </th>

                                        {/* ID / Cédula */}
                                        <th
                                            scope="col"
                                            className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                                            onClick={() => handleSort('cedula')}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                ID / Cédula <SortIcon column="cedula" />
                                            </div>
                                        </th>

                                        {/* Asistencia (animada) */}
                                        <th scope="col" className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            Asistencia
                                        </th>

                                        {/* Calificaciones / Modo Calificar */}
                                        <th
                                            scope="col"
                                            className={`px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider transition-colors ${
                                                activeGradingActivity ? 'bg-blue-50/60 text-blue-900' : 'text-gray-500'
                                            }`}
                                        >
                                            {activeGradingActivity ? 'Nota de Actividad (0 - 20 pts)' : 'Calificaciones'}
                                        </th>

                                        {/* Observaciones */}
                                        <th scope="col" className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            Observaciones
                                        </th>

                                        <th scope="col" className="relative px-6 py-3.5">
                                            <span className="sr-only">Acciones</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {sortedStudents.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-8 text-center text-xs text-gray-400 font-medium">
                                                {studentSearch ? 'No se encontraron estudiantes con esa búsqueda.' : 'No hay estudiantes registrados en esta sección.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        sortedStudents.map((student) => {
                                            const currentAtt = attendance[student.id] || 'PRESENT';

                                            // Score draft for active grading activity
                                            const activeActId = activeGradingActivity?.id;
                                            const currentScore = activeActId ? activityGradesDraft[activeActId]?.[student.id] : undefined;

                                            return (
                                                <tr
                                                    key={student.id}
                                                    className={`hover:bg-gray-50/80 transition-colors ${
                                                        activeGradingActivity ? 'hover:bg-blue-50/20' : ''
                                                    }`}
                                                >
                                                    {/* Perfil */}
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center">
                                                            <div className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs bg-indigo-100 text-indigo-700 shadow-2xs">
                                                                {student.firstName?.[0]}{student.lastName?.[0]}
                                                            </div>
                                                            <div className="ml-3">
                                                                <div className="text-xs font-bold text-gray-900">
                                                                    {student.firstName} {student.lastName}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Cédula */}
                                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600 font-mono">
                                                        {student.studentCode || student.id}
                                                    </td>

                                                    {/* Asistencia con ANIMACIÓN */}
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <AnimatedAttendancePicker
                                                            status={currentAtt}
                                                            onChange={(newSt) => handleAttendanceChange(student.id, newSt)}
                                                            disabled={!canEdit}
                                                        />
                                                    </td>

                                                    {/* Columna Calificaciones / Modo Calificación */}
                                                    <td
                                                        className={`px-6 py-4 whitespace-nowrap ${
                                                            activeGradingActivity ? 'bg-blue-50/20' : ''
                                                        }`}
                                                    >
                                                        {activeGradingActivity ? (
                                                            /* MODO CALIFICACIÓN: SLIDER + INPUT */
                                                            <LiveGradesSliderInput
                                                                studentId={student.id}
                                                                studentName={`${student.firstName} ${student.lastName}`}
                                                                score={currentScore}
                                                                maxScore={activeGradingActivity.maxScore || 20}
                                                                onChange={handleGradeScoreChange}
                                                                disabled={!canEdit}
                                                            />
                                                        ) : (
                                                            /* MODO NORMAL: Badges con progreso por actividad del día */
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                {currentActivitiesList.length === 0 ? (
                                                                    <span className="text-[11px] text-gray-400 italic">
                                                                        Sin notas hoy
                                                                    </span>
                                                                ) : (
                                                                    currentActivitiesList.map((act, actIdx) => {
                                                                        const actScores = activityGradesDraft[act.id] || {};
                                                                        const sc = actScores[student.id];
                                                                        const hasScore = sc !== undefined && sc !== null;
                                                                        const maxSc = act.maxScore || 20;
                                                                        const ratio = hasScore ? (sc as number) / maxSc : 0;
                                                                        const badgeColor = !hasScore
                                                                            ? 'bg-gray-100 text-gray-500'
                                                                            : ratio >= 0.75
                                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                            : ratio >= 0.5
                                                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                                            : 'bg-rose-50 text-rose-700 border border-rose-200';

                                                                        return (
                                                                            <button
                                                                                key={act.id}
                                                                                type="button"
                                                                                onClick={() => setActiveGradingActivity(act)}
                                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold shadow-2xs hover:scale-105 transition-all ${badgeColor}`}
                                                                                title={`Hacer clic para calificar "${act.title}"`}
                                                                            >
                                                                                <span>Act #{actIdx + 1}:</span>
                                                                                <span>{hasScore ? `${sc}/${maxSc}` : '—'}</span>
                                                                            </button>
                                                                        );
                                                                    })
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Observaciones */}
                                                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                                                        {((student as any).observationsCount || 0) > 0 ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedObsStudentId(student.id);
                                                                    setIsLiveObsModalOpen(true);
                                                                }}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors shadow-2xs"
                                                            >
                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                                {(student as any).observationsCount} {(student as any).observationsCount === 1 ? 'observación' : 'observaciones'}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedObsStudentId(student.id);
                                                                    setIsLiveObsModalOpen(true);
                                                                }}
                                                                className="text-gray-400 hover:text-indigo-600 transition-colors italic text-xs flex items-center gap-1"
                                                            >
                                                                <Plus className="w-3 h-3" /> Sin observaciones
                                                            </button>
                                                        )}
                                                    </td>

                                                    {/* Acciones */}
                                                    <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setOpenMenuId(openMenuId === student.id ? null : student.id);
                                                            }}
                                                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                                            title="Opciones"
                                                        >
                                                            <MoreVertical className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* ===== MODAL BUSCADOR DE ESTUDIANTES EXTERNOS ===== */}
            {showStudentSearch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <h3 className="text-sm font-bold text-gray-900">Agregar Estudiante de Otra Sección</h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowStudentSearch(false);
                                    setSearchTerm('');
                                }}
                                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="relative mb-4">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-4 w-4 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    autoFocus
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar por nombre o cédula..."
                                    className="block w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                                {isSearching ? (
                                    <div className="p-6 text-center text-xs text-gray-400">Buscando...</div>
                                ) : !searchResults || searchResults.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-gray-400">
                                        {searchTerm ? 'No se encontraron estudiantes.' : 'Escribe para buscar estudiantes.'}
                                    </div>
                                ) : (
                                    searchResults.map((s) => {
                                        const already = involvedIds.includes(s.id);
                                        return (
                                            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                                                <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                                    {s.firstName?.[0]}{s.lastName?.[0]}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-gray-800 truncate">
                                                        {s.firstName} {s.lastName}
                                                    </p>
                                                    <p className="text-[10px] text-gray-400 truncate">
                                                        {[s.classroomName, s.academicYearName].filter(Boolean).join(' · ') || 'Sin sección'}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => addExternalStudent(s)}
                                                    disabled={already}
                                                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 ${
                                                        already
                                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                    }`}
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    {already ? 'Agregado' : 'Agregar'}
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Detalle de Observaciones del Estudiante */}
            <StudentObservationsModal
                isOpen={Boolean(selectedStudentForObs)}
                onClose={() => setSelectedStudentForObs(null)}
                student={selectedStudentForObs}
            />

            {/* Modal para Crear y Gestionar Observaciones de esta Clase */}
            <LiveClassObservationModal
                isOpen={isLiveObsModalOpen}
                onClose={() => {
                    setIsLiveObsModalOpen(false);
                    setSelectedObsStudentId(null);
                }}
                classroomId={classroomId}
                subjectId={subjectId}
                date={date}
                classSessionId={data?.session?.id}
                students={classStudents}
                existingObservations={(data as any)?.sessionObservations || []}
                initialStudentId={selectedObsStudentId}
                onObservationAdded={() => refetch()}
            />
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
