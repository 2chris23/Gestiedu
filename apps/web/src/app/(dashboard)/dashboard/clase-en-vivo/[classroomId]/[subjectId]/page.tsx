'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ChevronLeft, Clock, User, Users, Save, Loader2, Calendar,
    Plus, Trash2, CheckCircle2, ListTodo, Ban, Search, X,
    ArrowUp, ShieldCheck, UserPlus, StickyNote, GraduationCap, CheckSquare, Square,
    ArrowUpDown, ArrowUp as ArrowUpIcon, ArrowDown, Award, Check, ClipboardCheck, CloudUpload, QrCode
} from 'lucide-react';
import PaseDeListaQr from '@/components/asistencia/PaseDeListaQr';
import { useConfigAsistenciaQr } from '@/lib/asistencia-qr';
import {
    useLiveClassDetail,
    useSaveLiveClass,
    useCreateClassActivity,
    useUpdateClassActivity,
    useDeleteClassActivity,
    useSaveActivityGrades,
    useSearchStudents,
    useSavePlanWeek,
    SearchStudentResult,
    ClassActivity,
} from '@/hooks/useLiveClass';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { SuspenderClaseDialogo } from '@/components/schedule/SuspenderClaseDialogo';
import { toast } from 'sonner';

import AnimatedAttendancePicker, { ATTENDANCE_CONFIG, AttendanceStatusType } from '@/components/live-class/AnimatedAttendancePicker';
import BotonesDeAsistencia from '@/components/live-class/BotonesDeAsistencia';
import UserAvatar from '@/components/ui/UserAvatar';
import { TablaAdaptable } from '@/components/ui/tabla-adaptable';
import TurnoBadge from '@/components/common/TurnoBadge';
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
    // El rol lo dice el servidor (`useQuienSoy`), no el almacén del navegador:
    // con la sesión viva pero el almacén vacío, el profesor no veía «Pasar
    // asistencia» ni podía marcar a nadie (ASIS-DOS-01). CLAUDE.md, «Lo que ve
    // cada rol en las listas».
    const { yo } = useQuienSoy();
    const user = yo;

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

    /**
     * MODO ASISTENCIA
     *
     * Un botón cambia la tabla entera: fuera las columnas de notas y
     * observaciones, y cada alumno con sus cuatro botones a la vista. Es el
     * momento del día en que el profesor solo quiere marcar y salir.
     */
    const [modoAsistencia, setModoAsistencia] = useState(false);

    /**
     * EL PASE DE LISTA POR QR
     *
     * Mientras el QR está abierto, esta pantalla NO guarda la asistencia sola:
     * la escribe el servidor alumno por alumno según escanean, y un guardado de
     * aquí mandaría a todos como «presente» (lo que se ve por defecto) antes de
     * que escaneen. Al cerrar el pase se vuelve a pedir la clase y se ve lo que
     * quedó de verdad.
     */
    const [paseQrAbierto, setPaseQrAbierto] = useState(false);
    const { data: configQr } = useConfigAsistenciaQr();

    // Modal de observaciones
    const [isLiveObsModalOpen, setIsLiveObsModalOpen] = useState(false);
    const [selectedObsStudentId, setSelectedObsStudentId] = useState<string | null>(null);
    const [selectedStudentForObs, setSelectedStudentForObs] = useState<any | null>(null);

    /**
     * LO QUE ESTA PANTALLA CAMBIÓ Y AÚN NO SE HA GUARDADO
     *
     * Cada guardado mandaba la asistencia de TODOS los alumnos con lo que tenía
     * esta pantalla, y cada vez que llegaban datos nuevos del servidor se
     * reemplazaba todo lo marcado. Con dos pantallas en la misma clase (el
     * profesor en el teléfono y la coordinadora en el ordenador, o el mismo
     * profesor en dos aparatos), lo de una volvía atrás lo de la otra sin
     * avisar; y un clic que caía justo antes de un refresco se perdía
     * (ASIS-DOS-01). Ahora se guarda solo lo tocado aquí, y lo tocado se
     * respeta al refrescar hasta que llega al servidor.
     */
    const asistenciaTocada = React.useRef<Map<string, AttendanceStatusType>>(new Map());
    const textoSinGuardar = React.useRef(false);

    // Initialize data
    useEffect(() => {
        if (data) {
            if (!textoSinGuardar.current) {
                setObservationsTitle(data.session?.observationsTitle || '');
                setObservations(data.session?.observations || '');
            }
            const attMap: Record<string, AttendanceStatusType> = {};
            data.students.forEach((s) => {
                const pendiente = asistenciaTocada.current.get(s.id);
                if (pendiente) attMap[s.id] = pendiente;
                else if (s.status) attMap[s.id] = s.status as AttendanceStatusType;
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

    /**
     * SE GUARDA SOLO
     *
     * El botón «Guardar» se quitó: obligaba a acordarse de pulsarlo y, si no,
     * la asistencia de la hora se perdía al salir de la pantalla. Ahora cada
     * marca se manda sola, agrupando las que caen seguidas (una tanda de treinta
     * alumnos es UNA petición, no treinta), y arriba se ve si ya está guardado.
     */
    const [cambiosPorGuardar, setCambiosPorGuardar] = useState(0);
    const [guardadoALas, setGuardadoALas] = useState<string | null>(null);

    const handleAttendanceChange = (studentId: string, status: AttendanceStatusType) => {
        asistenciaTocada.current.set(studentId, status);
        setAttendance((prev) => ({ ...prev, [studentId]: status }));
        setCambiosPorGuardar((n) => n + 1);
    };

    const marcarTodosPresentes = () => {
        (data?.students || []).filter((s) => !s.external).forEach((s) => {
            asistenciaTocada.current.set(s.id, 'PRESENT');
        });
        setAttendance((prev) => {
            const copia = { ...prev };
            (data?.students || []).filter((s) => !s.external).forEach((s) => {
                copia[s.id] = 'PRESENT';
            });
            return copia;
        });
        setCambiosPorGuardar((n) => n + 1);
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

    const guardarLaClase = async () => {
        // Lo tocado aquí va tal cual. El que todavía no tiene asistencia ese
        // día va como se ve (presente por defecto), pero «solo si no hay»: si
        // otra pantalla lo marcó mientras tanto, se respeta lo de la otra.
        const enviadas = new Map(asistenciaTocada.current);
        const attendances = (data?.students || []).flatMap((s) => {
            const tocada = enviadas.get(s.id);
            if (tocada) return [{ studentId: s.id, status: tocada }];
            if (!s.status) return [{ studentId: s.id, status: attendance[s.id] || 'PRESENT', soloSiNoHay: true }];
            return [];
        });
        textoSinGuardar.current = false;
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
                attendances,
            });
            // Ya está en el servidor: deja de ser «pendiente», salvo que se haya
            // vuelto a cambiar mientras se guardaba.
            enviadas.forEach((estado, id) => {
                if (asistenciaTocada.current.get(id) === estado) asistenciaTocada.current.delete(id);
            });
            setGuardadoALas(new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }));
        } catch {
            // El aviso de error lo da el propio hook. Lo tocado sigue pendiente.
            textoSinGuardar.current = true;
        }
    };

    // Lo último que se marcó, siempre a mano: al salir de la pantalla se manda
    // aunque no haya pasado el tiempo de espera.
    const guardarRef = React.useRef(guardarLaClase);
    const pendienteAlSalir = React.useRef(false);

    // Se ponen al día DESPUÉS de pintar, no durante: tocar una referencia
    // mientras se pinta deja a React sin saber qué volver a dibujar.
    useEffect(() => {
        guardarRef.current = guardarLaClase;
        pendienteAlSalir.current = cambiosPorGuardar > 0 && !saveMutation.isPending;
    });

    useEffect(() => {
        if (!cambiosPorGuardar || !canEdit || paseQrAbierto) return;
        const t = setTimeout(() => {
            guardarRef.current();
        }, 800);
        return () => clearTimeout(t);
    }, [cambiosPorGuardar, canEdit, paseQrAbierto]);

    useEffect(() => {
        return () => {
            // Al salir de la pantalla: si quedaba algo sin mandar, se manda. Lo
            // que se marcó hace medio segundo no se pierde por cambiar de
            // pantalla, que es justo lo que pasaba cuando había que pulsar
            // «Guardar» y nadie lo pulsaba.
            if (pendienteAlSalir.current) guardarRef.current();
        };
    }, []);

    const [suspendiendo, setSuspendiendo] = useState(false);

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
                                >
                                    {saveMutation.isPending ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" /> Guardando…
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

                                {/* Contadores de Asistencia + el botón que cambia la tabla */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    {canEdit && (
                                        <button
                                            type="button"
                                            onClick={() => setModoAsistencia((v) => !v)}
                                            aria-pressed={modoAsistencia}
                                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                                                modoAsistencia
                                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                                                    : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                                            }`}
                                        >
                                            <ClipboardCheck className="w-4 h-4" />
                                            {modoAsistencia ? 'Terminar asistencia' : 'Pasar asistencia'}
                                        </button>
                                    )}
                                    {canEdit && configQr?.activa !== false && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                // Lo marcado a mano que quedara por mandar, primero.
                                                if (cambiosPorGuardar > 0) await guardarRef.current();
                                                setCambiosPorGuardar(0);
                                                setPaseQrAbierto(true);
                                            }}
                                            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100"
                                        >
                                            <QrCode className="h-4 w-4" />
                                            {date < hoyDelLiceo ? 'Corregir con QR' : 'Asistencia por QR'}
                                        </button>
                                    )}
                                    {modoAsistencia && canEdit && (
                                        <button
                                            type="button"
                                            onClick={marcarTodosPresentes}
                                            className="px-3 py-2 rounded-xl text-xs font-semibold border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                                        >
                                            Todos presentes
                                        </button>
                                    )}
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
                        {/*
                            CADA ALUMNO, UNA FILA QUE CABE

                            Fuera del modo asistencia son cinco columnas —quién
                            es, cédula, asistencia, notas y observaciones— y en
                            un teléfono eso son 862 px: había que arrastrar de
                            lado para llegar a la nota, y al llegar ya no se
                            sabía de qué alumno era. De pie, cada alumno es una
                            tarjeta con todo lo suyo junto; en pantalla ancha
                            sigue siendo la misma tabla.
                        */}
                        <div className="p-3 sm:p-4">
                            <TablaAdaptable<(typeof sortedStudents)[number]>
                                datos={sortedStudents}
                                clave={(a) => a.id}
                                orden={sortColumn ? { por: sortColumn, hacia: sortDirection } : null}
                                alOrdenar={handleSort}
                                vacio={
                                    <p className="text-cuerpo text-tinta-suave">
                                        {studentSearch
                                            ? 'No se encontraron estudiantes con esa búsqueda.'
                                            : 'No hay estudiantes registrados en esta sección.'}
                                    </p>
                                }
                                columnas={[
                                    {
                                        id: 'nombre',
                                        titulo: 'Perfil',
                                        tituloCorto: 'Nombre',
                                        principal: true,
                                        ordenable: true,
                                        celda: (student) => (
                                            <div className="flex items-center gap-3">
                                                <UserAvatar
                                                    name={`${student.firstName} ${student.lastName}`}
                                                    src={(student as any).avatar}
                                                    className="h-9 w-9 shrink-0"
                                                    initialsClassName="text-xs"
                                                />
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-bold text-gray-900">
                                                        {student.firstName} {student.lastName}
                                                    </p>
                                                    <p className="truncate font-mono text-xs text-gray-600 @2xl:hidden">
                                                        {student.studentCode || student.id}
                                                    </p>
                                                </div>
                                            </div>
                                        ),
                                    },
                                    ...(modoAsistencia
                                        ? []
                                        : [
                                              {
                                                  id: 'cedula',
                                                  titulo: 'ID / Cédula',
                                                  ordenable: true,
                                                  soloAncha: true,
                                                  celda: (student: (typeof sortedStudents)[number]) => (
                                                      <span className="font-mono text-xs text-gray-700">
                                                          {student.studentCode || student.id}
                                                      </span>
                                                  ),
                                              },
                                          ]),
                                    {
                                        id: 'asistencia',
                                        titulo: 'Asistencia',
                                        celda: (student) => {
                                            const currentAtt = attendance[student.id] || 'PRESENT';
                                            return modoAsistencia ? (
                                                <BotonesDeAsistencia
                                                    estado={currentAtt}
                                                    nombre={`${student.firstName} ${student.lastName}`}
                                                    alCambiar={(nuevo) => handleAttendanceChange(student.id, nuevo)}
                                                    desactivado={!canEdit}
                                                />
                                            ) : (
                                                <AnimatedAttendancePicker
                                                    status={currentAtt}
                                                    onChange={(newSt) => handleAttendanceChange(student.id, newSt)}
                                                    disabled={!canEdit}
                                                />
                                            );
                                        },
                                    },
                                    ...(modoAsistencia
                                        ? []
                                        : [
                                              {
                                                  id: 'calificaciones',
                                                  titulo: activeGradingActivity
                                                      ? 'Nota de Actividad (0 - 20 pts)'
                                                      : 'Calificaciones',
                                                  tituloCorto: 'Nota',
                                                  celda: (student: (typeof sortedStudents)[number]) => {
                                                      const activeActId = activeGradingActivity?.id;
                                                      const currentScore = activeActId
                                                          ? activityGradesDraft[activeActId]?.[student.id]
                                                          : undefined;

                                                      if (activeGradingActivity) {
                                                          return (
                                                              <LiveGradesSliderInput
                                                                  studentId={student.id}
                                                                  studentName={`${student.firstName} ${student.lastName}`}
                                                                  score={currentScore}
                                                                  maxScore={activeGradingActivity.maxScore || 20}
                                                                  onChange={handleGradeScoreChange}
                                                                  disabled={!canEdit}
                                                              />
                                                          );
                                                      }

                                                      if (currentActivitiesList.length === 0) {
                                                          return <span className="text-xs italic text-gray-400">Sin notas hoy</span>;
                                                      }

                                                      return (
                                                          <span className="flex flex-wrap items-center justify-end gap-2 @2xl:justify-start">
                                                              {currentActivitiesList.map((act, actIdx) => {
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
                                                                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold shadow-2xs ${badgeColor}`}
                                                                          title={`Hacer clic para calificar "${act.title}"`}
                                                                      >
                                                                          <span>Act #{actIdx + 1}:</span>
                                                                          <span>{hasScore ? `${sc}/${maxSc}` : '—'}</span>
                                                                      </button>
                                                                  );
                                                              })}
                                                          </span>
                                                      );
                                                  },
                                              },
                                              {
                                                  id: 'observaciones',
                                                  titulo: 'Observaciones',
                                                  tituloCorto: 'Obs.',
                                                  celda: (student: (typeof sortedStudents)[number]) => {
                                                      const cuantas = (student as any).observationsCount || 0;
                                                      return (
                                                          <button
                                                              type="button"
                                                              onClick={() => {
                                                                  setSelectedObsStudentId(student.id);
                                                                  setIsLiveObsModalOpen(true);
                                                              }}
                                                              className={
                                                                  cuantas > 0
                                                                      ? 'inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800'
                                                                      : 'inline-flex items-center gap-1 text-xs italic text-gray-500'
                                                              }
                                                          >
                                                              {cuantas > 0 ? (
                                                                  <>
                                                                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                                      {cuantas} {cuantas === 1 ? 'observación' : 'observaciones'}
                                                                  </>
                                                              ) : (
                                                                  <>
                                                                      <Plus className="h-3 w-3" /> Sin observaciones
                                                                  </>
                                                              )}
                                                          </button>
                                                      );
                                                  },
                                              },
                                          ]),
                                ]}
                            />
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

            {user?.role === 'ADMIN' && (
                <SuspenderClaseDialogo
                    abierto={suspendiendo}
                    alCerrar={() => setSuspendiendo(false)}
                    classroomId={classroomId}
                    subjectId={subjectId}
                    fecha={date}
                    nombreMateria={data?.subject?.name}
                />
            )}

            {paseQrAbierto && (
                <PaseDeListaQr
                    classroomId={classroomId}
                    subjectId={subjectId}
                    fecha={date}
                    alTerminar={() => {
                        setPaseQrAbierto(false);
                        // Lo que quedó de verdad (lo escribió el servidor).
                        void refetch();
                    }}
                />
            )}
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
