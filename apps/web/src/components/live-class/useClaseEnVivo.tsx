'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { usePorEnviar } from '@/hooks/usePorEnviar';
import { conLoPendiente } from '@/lib/lo-pendiente-de-la-clase';
import { useConfigAsistenciaQr } from '@/lib/asistencia-qr';
import {
    useLiveClassDetail,
    useSaveLiveClass,
    useSaveActivityGrades,
    useSearchStudents,
    SearchStudentResult,
    ClassActivity,
} from '@/hooks/useLiveClass';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { toast } from 'sonner';
import { AttendanceStatusType } from '@/components/live-class/AnimatedAttendancePicker';
import { useSchoolToday } from '@/hooks/useSchoolTime';

/** Lo que LiveClassPageInner sabe y hace; su JSX vive en el componente. */
export function useClaseEnVivo() {
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

    const { data: delServidor, isLoading, refetch } = useLiveClassDetail(classroomId, subjectId, date);
    /**
     * SIN CONEXIÓN, LO HECHO QUEDA PENDIENTE (⏱) Y SE VE IGUAL
     *
     * Lo que espera para subir (`lib/por-enviar.ts`) se pinta encima de lo del
     * servidor: la asistencia marcada, las notas, las actividades nuevas y sin
     * las borradas. Un refresco no lo tapa; al llegar, deja de estar pendiente.
     */
    const cola = usePorEnviar();
    const data = useMemo(() => conLoPendiente(delServidor, cola, classroomId, subjectId, date), [delServidor, cola, classroomId, subjectId, date]);
    const claseEnCola = cola.some((c) => c.objeto === `clase|${classroomId}|${subjectId}|${date}` && c.estado === 'pendiente');
    const nombresDeLaClase = useMemo(
        () => Object.fromEntries((delServidor?.students ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName}`])),
        [delServidor]
    );
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
    const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
    const [showStudentSearch, setShowStudentSearch] = useState(false);
    const { data: searchResults, isLoading: isSearching } = useSearchStudents(debouncedSearchTerm);

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
     * LA ASISTENCIA SE PASA A PROPÓSITO, NUNCA DE REFILÓN
     *
     * Los botones de asistencia estaban siempre a la vista en cada alumno, y
     * un toque sin querer (al bajar la lista, al ir a poner una nota) le
     * cambiaba la asistencia a alguien. Fuera de «Pasar asistencia» ahora
     * solo se LEE; y «Pasar asistencia» pregunta cómo: a mano, enseñando el
     * QR a la clase o escaneando el QR de cada alumno.
     */
    const [eligiendoAsistencia, setEligiendoAsistencia] = useState(false);
    const [qrEscaneando, setQrEscaneando] = useState(false);
    // El QR es cosa del teléfono (su cámara, su GPS, tenerlo en la mano): en
    // un ordenador «Pasar asistencia» va directo a marcar a mano.
    const [esTelefono, setEsTelefono] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(pointer: coarse)');
        const ver = () => setEsTelefono(mq.matches);
        ver();
        mq.addEventListener('change', ver);
        return () => mq.removeEventListener('change', ver);
    }, []);
    useEffect(() => {
        if (!eligiendoAsistencia) return;
        const alTeclear = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setEligiendoAsistencia(false);
        };
        window.addEventListener('keydown', alTeclear);
        return () => window.removeEventListener('keydown', alTeclear);
    }, [eligiendoAsistencia]);

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
    const conQr = esTelefono && configQr?.activa !== false;

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
    // Lo mismo con las notas escritas y aún sin guardar: un aviso de tiempo
    // real refrescaba la clase y las borraba de la pantalla.
    const notasTocadas = React.useRef<Map<string, Record<string, number | null>>>(new Map());
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
                        drafts[act.id] = { ...parsed, ...(notasTocadas.current.get(act.id) ?? {}) };
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
        notasTocadas.current.set(actId, { ...(notasTocadas.current.get(actId) ?? {}), [studentId]: newScore });
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
        const borrador = activityGradesDraft[actId] || {};
        // Solo lo que cambió, con la nota que tenía (lo que se vio): mandar el
        // mapa entero reescribía con lo viejo lo que otro hubiera puesto.
        const delSrv = delServidor?.activities?.find((a) => a.id === actId);
        const antesMapa: Record<string, number | null> =
            typeof delSrv?.scores === 'string' ? JSON.parse(delSrv.scores || '{}') : ((delSrv?.scores as any) ?? {});
        const scores: Record<string, number | null> = {};
        const antes: Record<string, number | null> = {};
        for (const [id, nota] of Object.entries(borrador)) {
            const habia = antesMapa[id] ?? null;
            if ((nota ?? null) === habia) continue;
            scores[id] = nota;
            antes[id] = habia;
        }
        if (!Object.keys(scores).length) {
            toast('No hay notas nuevas que guardar.', { id: 'nada-nuevo' });
            return;
        }
        try {
            await saveActivityGrades.mutateAsync({
                activityId: actId,
                scores,
                maxScore: activeGradingActivity.maxScore || 20,
                paraLaCola: {
                    resumen: `Notas de «${activeGradingActivity.title}» · ${Object.keys(scores).length} alumno(s)`,
                    nombres: nombresDeLaClase,
                    antes,
                },
            });
            notasTocadas.current.delete(actId);
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
            const r: any = await saveMutation.mutateAsync({
                classroomId,
                subjectId,
                date,
                observationsTitle,
                observations,
                involvedStudentIds: involvedIds,
                startTime,
                endTime,
                attendances,
                paraLaCola: {
                    resumen: `Clase de ${delServidor?.subject?.name ?? 'la materia'} del ${date.split('-').reverse().join('/')}`,
                    nombres: nombresDeLaClase,
                    // Lo que había al abrir la clase: si otro lo cambió, se pregunta.
                    antes: Object.fromEntries((delServidor?.students ?? []).map((s) => [s.id, s.status ?? null])),
                },
            });
            if (r?.pendiente) {
                // Quedó en la cola del teléfono: desde ahí se pinta (⏱).
                enviadas.forEach((estado, id) => {
                    if (asistenciaTocada.current.get(id) === estado) asistenciaTocada.current.delete(id);
                });
                setGuardadoALas(null);
                return;
            }
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

    return {
        router,
        user,
        classroomId,
        subjectId,
        hoyDelLiceo,
        date,
        startTime,
        endTime,
        isLoading,
        refetch,
        data,
        claseEnCola,
        saveMutation,
        saveActivityGrades,
        obsMode,
        observationsTitle,
        setObservationsTitle,
        observations,
        setObservations,
        attendance,
        involvedIds,
        searchTerm,
        setSearchTerm,
        showStudentSearch,
        setShowStudentSearch,
        searchResults,
        isSearching,
        activeGradingActivity,
        setActiveGradingActivity,
        activityGradesDraft,
        studentSearch,
        setStudentSearch,
        sortColumn,
        sortDirection,
        modoAsistencia,
        setModoAsistencia,
        eligiendoAsistencia,
        setEligiendoAsistencia,
        qrEscaneando,
        setQrEscaneando,
        paseQrAbierto,
        setPaseQrAbierto,
        conQr,
        isLiveObsModalOpen,
        setIsLiveObsModalOpen,
        selectedObsStudentId,
        setSelectedObsStudentId,
        selectedStudentForObs,
        setSelectedStudentForObs,
        textoSinGuardar,
        canEdit,
        cambiosPorGuardar,
        setCambiosPorGuardar,
        guardadoALas,
        handleAttendanceChange,
        marcarTodosPresentes,
        handleGradeScoreChange,
        handleSaveCurrentActivityGrades,
        counts,
        classStudents,
        sortedStudents,
        handleSort,
        guardarRef,
        suspendiendo,
        setSuspendiendo,
        toggleInvolved,
        selectAllInvolved,
        addExternalStudent,
        teacherName,
        isSuspended,
        currentActivitiesList,
        formatDate,
    };
}
