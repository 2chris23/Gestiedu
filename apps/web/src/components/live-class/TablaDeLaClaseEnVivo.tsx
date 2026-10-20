import { OtraFormaDeEvaluarBoton } from '@/components/live-class/OtraFormaDeEvaluar';
import {
    Save,
    Loader2,
    Plus,
    Search,
    Award,
    ClipboardCheck,
    Clock3,
} from 'lucide-react';
import { ATTENDANCE_CONFIG, AttendanceStatusType } from '@/components/live-class/AnimatedAttendancePicker';
import BotonesDeAsistencia from '@/components/live-class/BotonesDeAsistencia';
import UserAvatar from '@/components/ui/UserAvatar';
import { TablaAdaptable } from '@/components/ui/tabla-adaptable';
import LiveGradesSliderInput from '@/components/live-class/LiveGradesSliderInput';
import { diferido } from '@/components/common/Diferido';
import type { useClaseEnVivo } from './useClaseEnVivo';

const CalificarConInstrumento = diferido(() => import('@/components/live-class/CalificarConInstrumento'), { alto: 320 });

/** La tabla de alumnos de la clase en vivo: asistencia, calificar (a mano o con el instrumento) y observaciones. */
export function TablaDeLaClaseEnVivo({ c }: { c: ReturnType<typeof useClaseEnVivo> }) {
    const {
        hoyDelLiceo,
        date,
        saveActivityGrades,
        attendance,
        activeGradingActivity,
        setActiveGradingActivity,
        activityGradesDraft,
        studentSearch,
        setStudentSearch,
        sortColumn,
        sortDirection,
        modoAsistencia,
        setModoAsistencia,
        setEligiendoAsistencia,
        conQr,
        setIsLiveObsModalOpen,
        setSelectedObsStudentId,
        canEdit,
        handleAttendanceChange,
        marcarTodosPresentes,
        handleGradeScoreChange,
        handleSaveCurrentActivityGrades,
        counts,
        sortedStudents,
        handleSort,
        currentActivitiesList,
    } = c;

    return (
        <>
            {/* ===================================================================== */}
            {/* 3. ZONA ROJA: TABLA COMPLETA DE ESTUDIANTES                           */}
            {/* ===================================================================== */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden" data-recorrido="clase-alumnos">
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
                                {!activeGradingActivity.instrumento && (
                                <button
                                    type="button"
                                    onClick={handleSaveCurrentActivityGrades}
                                    disabled={saveActivityGrades.isPending}
                                    className="px-4 py-1.5 text-xs font-bold bg-white text-blue-700 hover:bg-blue-50 rounded-lg shadow-xs transition-colors flex items-center gap-1"
                                >
                                    {saveActivityGrades.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    Guardar Notas
                                </button>
                                )}
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
                                    data-recorrido="clase-asistencia"
                                    onClick={() => (modoAsistencia ? setModoAsistencia(false) : conQr ? setEligiendoAsistencia(true) : setModoAsistencia(true))}
                                    aria-pressed={modoAsistencia}
                                    aria-haspopup={modoAsistencia || !conQr ? undefined : 'dialog'}
                                    className={`flex min-h-[44px] items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                                        modoAsistencia
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                                            : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                                    }`}
                                >
                                    <ClipboardCheck className="w-4 h-4" />
                                    {modoAsistencia ? 'Terminar asistencia' : date < hoyDelLiceo ? 'Corregir asistencia' : 'Pasar asistencia'}
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
                    {/* Calificar: una actividad cada vez. En el teléfono la
                        fila de cada alumno solo ENSEÑA sus notas (no cabe
                        un botón por actividad); se entra a calificar desde
                        aquí, y ahí sí cada alumno tiene su control. */}
                    {canEdit && !modoAsistencia && !activeGradingActivity && currentActivitiesList.length > 0 && (
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-gray-600">Calificar:</span>
                            {currentActivitiesList.map((act, i) => (
                                <button
                                    key={act.id}
                                    type="button"
                                    onClick={() => setActiveGradingActivity(act)}
                                    title={act.title}
                                    className="inline-flex min-h-[44px] max-w-[14rem] items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                                >
                                    <Award className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">Act #{i + 1} · {act.title}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {/* CON INSTRUMENTO, LA TABLA CAMBIA: una columna por indicador,
                        con los puntos que saca cada alumno en cada uno (la nota
                        sale sola). Antes era una tarjeta por alumno debajo de la
                        tabla: treinta tarjetas y la tabla de siempre al final. */}
                    {activeGradingActivity?.instrumento ? (
                        <CalificarConInstrumento
                            key={activeGradingActivity.id}
                            activityId={activeGradingActivity.id}
                            instrumento={activeGradingActivity.instrumento}
                            detalle={(currentActivitiesList.find((a) => a.id === activeGradingActivity.id) ?? activeGradingActivity).detalleDelInstrumento}
                            alumnos={sortedStudents}
                            puedeEditar={canEdit}
                        />
                    ) : (
                    <TablaAdaptable<(typeof sortedStudents)[number]>
                        compacta={!modoAsistencia && !activeGradingActivity}
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
                                celdaCompacta: (student) => (
                                    <div className="flex min-w-0 items-center gap-2">
                                        <UserAvatar
                                            name={`${student.firstName} ${student.lastName}`}
                                            src={(student as any).avatar}
                                            className="h-8 w-8 shrink-0"
                                            initialsClassName="text-xs"
                                        />
                                        <div className="min-w-0">
                                            <p className="line-clamp-2 break-words text-sm font-medium leading-5 text-gray-900" title={`${student.firstName} ${student.lastName}`}>
                                                {student.firstName} {student.lastName}
                                                {(student as any).pendiente && (
                                                    <Clock3 className="ml-1 inline h-3.5 w-3.5 text-amber-600" aria-label="Pendiente de enviar" />
                                                )}
                                            </p>
                                            <p className="truncate font-mono text-xs text-gray-500">
                                                {student.studentCode || student.id}
                                            </p>
                                        </div>
                                    </div>
                                ),
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
                                                {(student as any).pendiente && (
                                                    <Clock3 className="ml-1 inline h-3.5 w-3.5 text-amber-600" aria-label="Pendiente de enviar" />
                                                )}
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
                                compacta: {
                                    ancho: 'w-12',
                                    titulo: 'Asist.',
                                    celda: (student) => {
                                        const def = ATTENDANCE_CONFIG[(attendance[student.id] || 'PRESENT') as AttendanceStatusType];
                                        const Icono = def.icon;
                                        return (
                                            <span
                                                role="img"
                                                aria-label={def.label}
                                                title={def.label}
                                                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${def.badgeBg}`}
                                            >
                                                <Icono className="h-3.5 w-3.5" />
                                            </span>
                                        );
                                    },
                                },
                                celda: (student) => {
                                    const currentAtt = (attendance[student.id] || 'PRESENT') as AttendanceStatusType;
                                    if (modoAsistencia) {
                                        return (
                                            <BotonesDeAsistencia
                                                estado={currentAtt}
                                                nombre={`${student.firstName} ${student.lastName}`}
                                                alCambiar={(nuevo) => handleAttendanceChange(student.id, nuevo)}
                                                desactivado={!canEdit}
                                            />
                                        );
                                    }
                                    const def = ATTENDANCE_CONFIG[currentAtt];
                                    const Icono = def.icon;
                                    return (
                                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${def.badgeBg}`}>
                                            <Icono className="h-3.5 w-3.5" />
                                            {def.label}
                                        </span>
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
                                          compacta: {
                                              ancho: 'w-16',
                                              titulo: 'Notas',
                                              celda: (student: (typeof sortedStudents)[number]) => {
                                                  if (currentActivitiesList.length === 0) {
                                                      return <span className="text-xs text-gray-500">—</span>;
                                                  }
                                                  return (
                                                      <span className="flex flex-col items-center gap-0.5">
                                                          {currentActivitiesList.map((act, actIdx) => {
                                                              const sc = (activityGradesDraft[act.id] || {})[student.id];
                                                              const hay = sc !== undefined && sc !== null;
                                                              const maxSc = act.maxScore || 20;
                                                              const ratio = hay ? (sc as number) / maxSc : 0;
                                                              return (
                                                                  <span
                                                                      key={act.id}
                                                                      title={`Act #${actIdx + 1}: ${act.title}`}
                                                                      className={`text-xs font-bold tabular-nums ${
                                                                          !hay ? 'text-gray-500' : ratio >= 0.5 ? 'text-indigo-700' : 'text-red-600'
                                                                      }`}
                                                                  >
                                                                      {hay ? sc : '—'}
                                                                  </span>
                                                              );
                                                          })}
                                                      </span>
                                                  );
                                              },
                                          },
                                          celda: (student: (typeof sortedStudents)[number]) => {
                                              const activeActId = activeGradingActivity?.id;
                                              const currentScore = activeActId
                                                  ? activityGradesDraft[activeActId]?.[student.id]
                                                  : undefined;

                                              if (activeGradingActivity) {
                                                  // La actividad tal como está ahora (la del estado es
                                                  // la del momento de pulsar «Calificar»).
                                                  const viva =
                                                      currentActivitiesList.find((a) => a.id === activeGradingActivity.id) ??
                                                      activeGradingActivity;
                                                  // Con instrumento, la nota sale de las marcas de arriba.
                                                  if (viva.instrumento) {
                                                      const nota = viva.scores?.[student.id];
                                                      return (
                                                          <span className="text-xs font-bold tabular-nums text-gray-800">
                                                              {typeof nota === 'number' ? `${nota} / ${viva.maxScore ?? 20}` : 'Sin nota'}
                                                          </span>
                                                      );
                                                  }
                                                  return (
                                                      <span className="flex flex-col items-start gap-1">
                                                          <LiveGradesSliderInput
                                                              studentId={student.id}
                                                              studentName={`${student.firstName} ${student.lastName}`}
                                                              score={currentScore}
                                                              maxScore={activeGradingActivity.maxScore || 20}
                                                              onChange={handleGradeScoreChange}
                                                              disabled={!canEdit}
                                                          />
                                                          {/* Evaluarle de otra forma (el cuaderno de quien no
                                                              puede hacer deporte): su nota cuenta igual. */}
                                                          {canEdit && !(student as any).external && (
                                                              <OtraFormaDeEvaluarBoton
                                                                  activityId={viva.id}
                                                                  studentId={student.id}
                                                                  studentName={`${student.firstName} ${student.lastName}`}
                                                                  actual={viva.evaluadoDeOtraForma?.[student.id] ?? null}
                                                              />
                                                          )}
                                                      </span>
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
                                          compacta: {
                                              ancho: 'w-12',
                                              titulo: 'Obs.',
                                              celda: (student: (typeof sortedStudents)[number]) => {
                                                  const cuantas = (student as any).observationsCount || 0;
                                                  return (
                                                      <button
                                                          type="button"
                                                          onClick={() => {
                                                              setSelectedObsStudentId(student.id);
                                                              setIsLiveObsModalOpen(true);
                                                          }}
                                                          aria-label={
                                                              cuantas > 0
                                                                  ? `${cuantas} ${cuantas === 1 ? 'observación' : 'observaciones'} de ${student.firstName} ${student.lastName}`
                                                                  : `Añadir observación a ${student.firstName} ${student.lastName}`
                                                          }
                                                          className="inline-flex h-11 w-11 items-center justify-center rounded-full"
                                                      >
                                                          {cuantas > 0 ? (
                                                              <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-amber-50 px-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                                                                  {cuantas}
                                                              </span>
                                                          ) : (
                                                              <Plus className="h-4 w-4 text-gray-500" />
                                                          )}
                                                      </button>
                                                  );
                                              },
                                          },
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
                    )}
                </div>
            </div>
        </>
    );
}
