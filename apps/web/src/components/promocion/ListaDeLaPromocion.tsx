import { Lista } from '@/components/ui/lista';
import {
    GraduationCap,
    Users,
    AlertTriangle,
    Check,
    School,
    UserMinus,
    Plus,
    FileText,
} from 'lucide-react';
import type { usePromocion } from './usePromocion';

const STATUS_LABEL: Record<string, string> = {
    PROMOVIDO: 'Promocionado limpio',
    PROMOVIDO_CON_PENDIENTES: 'Promocionado con pendientes',
    NO_PROMOVIDO: 'No promovido / Repite',
};
const STATUS_COLOR: Record<string, string> = {
    PROMOVIDO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PROMOVIDO_CON_PENDIENTES: 'bg-amber-50 text-amber-700 border-amber-200',
    NO_PROMOVIDO: 'bg-rose-50 text-rose-700 border-rose-200',
};

/** Los tres niveles de la promoción: los años, sus secciones y los alumnos con su destino. */
export function ListaDeLaPromocion({ c }: { c: ReturnType<typeof usePromocion> }) {
    const {
        selectedGrade,
        setSelectedGrade,
        selectedSection,
        setSelectedSection,
        assignments,
        finalResults,
        motivos,
        setMotivos,
        statusFilter,
        setStatusFilter,
        setPendingModalStudent,
        setRetireModalStudent,
        setRetireMode,
        setNewSectionModalOpen,
        setNewSectionGrade,
        customSections,
        setVisibleLimit,
        abrirRevision,
        grades,
        selectedGradeEntry,
        sectionList,
        level3Students,
        faltaElMotivo,
        cambiarCondicion,
        updateStudentAssignment,
    } = c;

    return (
        <>
            <div className="space-y-6">
                {/* NIVEL 1 — Selector de Años */}
                <section>
                    <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <School className="w-4 h-4 text-indigo-600" /> Años Escolares
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {grades.map(g => {
                            const pct = g.total > 0 ? (g.assigned / g.total) * 100 : 0;
                            return (
                                <button
                                    key={g.grade}
                                    onClick={() => {
                                        setSelectedGrade(g.grade);
                                        const firstSec = Array.from(g.sections.keys())[0] || 'A';
                                        setSelectedSection(firstSec);
                                        setVisibleLimit(30);
                                    }}
                                    className={`p-4 rounded-2xl border text-left transition-all ${
                                        selectedGrade === g.grade
                                            ? 'bg-indigo-50/30 border-indigo-500 ring-2 ring-indigo-200 shadow-xs'
                                            : 'bg-white border-gray-200 hover:border-indigo-300'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-bold text-gray-900 text-base">{g.grade}º Año</div>
                                            <div className="text-xs text-gray-500 font-medium">{g.assigned}/{g.total} asignados</div>
                                        </div>
                                        <ProgressRing pct={pct} size={48} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* NIVEL 2 — Secciones del Año Seleccionado */}
                {selectedGradeEntry && (
                    <section>
                        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Users className="w-4 h-4 text-indigo-600" /> Secciones de {selectedGrade}º Año
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {sectionList.map(s => {
                                const pct = s.total > 0 ? (s.assigned / s.total) * 100 : 0;
                                const malePct = s.total > 0 ? Math.round((s.males / s.total) * 100) : 0;
                                const femalePct = s.total > 0 ? Math.round((s.females / s.total) * 100) : 0;

                                return (
                                    <button
                                        key={s.section}
                                        onClick={() => { setSelectedSection(s.section); setVisibleLimit(30); }}
                                        className={`p-4 rounded-2xl border text-left transition-all ${
                                            selectedSection === s.section
                                                ? 'bg-indigo-50/30 border-indigo-500 ring-2 ring-indigo-200 shadow-xs'
                                                : 'bg-white border-gray-200 hover:border-indigo-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <div className="font-bold text-gray-900">Sección {s.section}</div>
                                                <div className="text-xs text-gray-500">{s.assigned}/{s.total} alumnos</div>
                                            </div>
                                            <ProgressRing pct={pct} size={42} />
                                        </div>

                                        {/* Barra de Balance de Género Azul / Rosa */}
                                        <div className="mt-2 pt-2 border-t border-gray-100">
                                            <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                                                <span className="text-blue-600 flex items-center gap-1">
                                                    👦 {s.males} ({malePct}%)
                                                </span>
                                                <span className="text-pink-600 flex items-center gap-1">
                                                    👧 {s.females} ({femalePct}%)
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                                                <div style={{ width: `${malePct}%` }} className="bg-blue-500 h-full" />
                                                <div style={{ width: `${femalePct}%` }} className="bg-pink-500 h-full" />
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* NIVEL 3 — Lista de Estudiantes con Asignación Manual y Libertad Total */}
                {selectedGradeEntry && selectedSection !== null && (
                    <section className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 flex-wrap gap-3">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-indigo-600" />
                                    Estudiantes de {selectedGrade}º Año · Sección {selectedSection}
                                </h2>

                                {/* Filtros por Condición Académica */}
                                <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 shadow-2xs">
                                    <button
                                        onClick={() => setStatusFilter('ALL')}
                                        className={`whitespace-nowrap px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${statusFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                                    >
                                        Todos
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('PROMOVIDO')}
                                        className={`whitespace-nowrap px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${statusFilter === 'PROMOVIDO' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'}`}
                                    >
                                        Aprobados
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('PROMOVIDO_CON_PENDIENTES')}
                                        className={`whitespace-nowrap px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${statusFilter === 'PROMOVIDO_CON_PENDIENTES' ? 'bg-amber-600 text-white' : 'text-amber-700 hover:bg-amber-50'}`}
                                    >
                                        Con Pendientes (Arrastre)
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('NO_PROMOVIDO')}
                                        className={`whitespace-nowrap px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${statusFilter === 'NO_PROMOVIDO' ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'}`}
                                    >
                                        Repitientes
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setNewSectionGrade(selectedGrade! >= 5 ? 5 : selectedGrade! + 1);
                                        setNewSectionModalOpen(true);
                                    }}
                                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Crear Sección para {selectedGrade! >= 5 ? 5 : selectedGrade! + 1}º Año
                                </button>
                                <span className="text-xs text-gray-400 font-medium">({level3Students.length} mostrados)</span>
                            </div>
                        </div>

                        <div className="divide-y divide-gray-100">
                            {level3Students.map(s => {
                                const currentAsg = assignments[s.studentId] || {
                                    action: s.defaultTargetGrade === null ? 'GRADUATE' : 'ENROLL',
                                    targetGrade: s.defaultTargetGrade,
                                    targetSectionLetter: s.currentSection || 'A',
                                    classroomId: null,
                                };

                                const isMale = s.gender === 'MASCULINO';
                                const isRetired = currentAsg.action === 'RETIRE_KEEP_HISTORY' || currentAsg.action === 'RETIRE_DELETE';
                                const isGraduate = currentAsg.action === 'GRADUATE';
                                const hasPending = s.failedSubjects.length > 0;
                                const conRevision = s.subjectGrades.some(g => g.revision != null);

                                // Secciones disponibles para el año destino elegido
                                const availableSections = [
                                    'A', 'B',
                                    ...customSections.filter(cs => cs.grade === currentAsg.targetGrade).map(cs => cs.section)
                                ];
                                const uniqueSectionLetters = Array.from(new Set(availableSections));

                                return (
                                    <div
                                        key={s.studentId}
                                        className={`px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
                                            isRetired ? 'bg-red-50/30 opacity-80' : 'hover:bg-gray-50/70'
                                        }`}
                                    >
                                        {/* Info del Estudiante */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${isMale ? 'bg-blue-50 text-blue-700' : 'bg-pink-50 text-pink-700'}`}>
                                                    {isMale ? '👦 Varón' : '👧 Hembra'}
                                                </span>
                                                <span className="font-bold text-gray-900 text-sm truncate">{s.name}</span>
                                            </div>

                                            <div className="mt-1 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                                                <span>
                                                    Promedio: <strong className="text-indigo-700">{s.finalAverage.toFixed(1)} / 20</strong>
                                                </span>
                                                {hasPending ? (
                                                    <div className="inline-flex items-center gap-1.5 flex-wrap">
                                                        <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md font-semibold">
                                                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                                                            Materia Pendiente ({s.failedSubjects.length}): {s.failedSubjects.map(f => `${f.name} (${f.average} pts${f.revision != null ? ', en revisión' : ''})`).join(', ')}
                                                        </span>
                                                        <button
                                                            onClick={() => setPendingModalStudent(s)}
                                                            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-2 py-0.5 rounded-md transition-colors shadow-2xs"
                                                            title="Ver e Imprimir Acta de Compromiso de Materias Pendientes"
                                                        >
                                                            <FileText className="w-3 h-3 text-indigo-600" />
                                                            Acta de Arrastre
                                                        </button>
                                                        <button
                                                            onClick={() => abrirRevision(s)}
                                                            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 px-2 py-0.5 rounded-md transition-colors"
                                                            title="Anotar la nota de la revisión de las materias reprobadas"
                                                        >
                                                            Revisión
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-emerald-600 font-medium">
                                                            ✓ Todas las materias aprobadas{conRevision ? ' (con revisión)' : ''}
                                                        </span>
                                                        {conRevision && (
                                                            <button
                                                                onClick={() => abrirRevision(s)}
                                                                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 px-2 py-0.5 rounded-md transition-colors"
                                                            >
                                                                Revisión
                                                            </button>
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Selector de Estado Sugerido */}
                                        {!isRetired && (
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${STATUS_COLOR[s.suggestedStatus]}`} title={s.motivoDeLaSugerencia}>
                                                        {STATUS_LABEL[s.suggestedStatus]}
                                                    </span>
                                                    <Lista
                                                        tamano="chica"
                                                        etiqueta="Resultado evaluativo final"
                                                        valor={finalResults[s.studentId] || s.suggestedStatus}
                                                        alCambiar={v => cambiarCondicion(s, v)}
                                                        opciones={Object.entries(STATUS_LABEL).map(([k, v]) => ({ valor: k, texto: v }))}
                                                    />
                                                </div>
                                                {(finalResults[s.studentId] || s.suggestedStatus) !== s.suggestedStatus && (
                                                    <input
                                                        aria-label={`Motivo de la decisión de ${s.name}`}
                                                        placeholder="Motivo (obligatorio, queda anotado)"
                                                        maxLength={500}
                                                        value={motivos[s.studentId] ?? (s.decision?.condicion === finalResults[s.studentId] ? s.decision.motivo : '')}
                                                        onChange={e => setMotivos(prev => ({ ...prev, [s.studentId]: e.target.value }))}
                                                        className={`min-h-[44px] w-full rounded-lg border px-3 text-sm ${faltaElMotivo(s) ? 'border-rose-400 bg-rose-50' : 'border-gray-300'}`}
                                                    />
                                                )}
                                            </div>
                                        )}

                                        {/* Destino y Asignación */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {isGraduate ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold">
                                                    <GraduationCap className="w-4 h-4" />
                                                    🎓 {s.gradeLevel}º Año — Egresado del Liceo
                                                </span>
                                            ) : isRetired ? (
                                                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
                                                    <UserMinus className="w-4 h-4" />
                                                    {currentAsg.action === 'RETIRE_KEEP_HISTORY' ? 'Retirado (Guarda Historial)' : 'Eliminado de BD'}
                                                </span>
                                            ) : (
                                                <>
                                                    {/* Selector de Año Destino */}
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-xs text-gray-500 font-medium">Pasa a:</span>
                                                        <Lista
                                                            tamano="chica"
                                                            etiqueta="Año al que pasa"
                                                            valor={String(currentAsg.targetGrade || 1)}
                                                            alCambiar={v => updateStudentAssignment(s.studentId, { targetGrade: parseInt(v) })}
                                                            opciones={[1, 2, 3, 4, 5, 6].map(n => ({ valor: String(n), texto: `${n}º Año` }))}
                                                        />
                                                    </div>

                                                    {/* Selector de Sección Destino */}
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-xs text-gray-500 font-medium">Sección:</span>
                                                        <Lista
                                                            tamano="chica"
                                                            etiqueta="Sección a la que pasa"
                                                            valor={currentAsg.targetSectionLetter || 'A'}
                                                            alCambiar={v => updateStudentAssignment(s.studentId, { targetSectionLetter: v })}
                                                            opciones={uniqueSectionLetters.map(sec => ({ valor: sec, texto: `Sección ${sec}` }))}
                                                        />
                                                    </div>

                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                                                        <Check className="w-3.5 h-3.5" />
                                                        Destino: {currentAsg.targetGrade}º {currentAsg.targetSectionLetter}
                                                    </span>
                                                </>
                                            )}

                                            {/* Botón Retirar / Restaurar */}
                                            {isRetired ? (
                                                <button
                                                    onClick={() => updateStudentAssignment(s.studentId, { action: 'ENROLL', targetGrade: s.defaultTargetGrade, targetSectionLetter: s.currentSection || 'A' })}
                                                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
                                                >
                                                    Restaurar
                                                </button>
                                            ) : !isGraduate ? (
                                                <button
                                                    onClick={() => {
                                                        setRetireModalStudent(s);
                                                        setRetireMode('RETIRE_KEEP_HISTORY');
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Retirar estudiante"
                                                >
                                                    <UserMinus className="w-4 h-4" />
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}
            </div>
        </>
    );
}

function ProgressRing({ pct, size = 64 }: { pct: number; size?: number }) {
    const r = (size - 8) / 2;
    const c = 2 * Math.PI * r;
    const done = pct >= 100;
    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={6} />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={done ? '#10B981' : '#6366F1'}
                    strokeWidth={6}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c - (Math.min(pct, 100) / 100) * c}
                    className="transition-all duration-500"
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                {done ? (
                    <Check className="w-5 h-5 text-emerald-500" />
                ) : (
                    <span className="text-[11px] font-black text-indigo-700">{Math.round(pct)}%</span>
                )}
            </div>
        </div>
    );
}
