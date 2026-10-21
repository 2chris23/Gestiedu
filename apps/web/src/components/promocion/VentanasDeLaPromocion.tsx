import { Lista } from '@/components/ui/lista';
import {
    Loader2,
    AlertTriangle,
    Plus,
    ShieldAlert,
    Printer,
    FileText,
} from 'lucide-react';
import { MembreteOficial } from '@/components/documentos/MembreteOficial';
import { createPortal } from 'react-dom';
import { imprimirConAviso } from '@/components/documentos/HojaImprimible';
import type { usePromocion } from './usePromocion';

/** Las ventanas de la promoción: retirar a un alumno, crear una sección al vuelo, confirmar el cierre y el acta de la materia pendiente. */
export function VentanasDeLaPromocion({ c }: { c: ReturnType<typeof usePromocion> }) {
    const {
        yearName,
        suggestedNextYearName,
        nextYear,
        pendingModalStudent,
        setPendingModalStudent,
        revisionStudent,
        setRevisionStudent,
        revisionScores,
        setRevisionScores,
        savingRevision,
        confirmOpen,
        setConfirmOpen,
        confirmText,
        setConfirmText,
        confirming,
        retireModalStudent,
        setRetireModalStudent,
        retireMode,
        setRetireMode,
        newSectionModalOpen,
        setNewSectionModalOpen,
        newSectionGrade,
        setNewSectionGrade,
        newSectionLetter,
        setNewSectionLetter,
        materiasDeRevision,
        guardarRevisiones,
        handleConfirm,
        confirmStudentRetire,
        handleCreateSection,
    } = c;

    return (
        <>
            {/* Modal de Retiro de Estudiante */}
            {retireModalStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="Retirar Estudiante">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-red-50/50">
                            <ShieldAlert className="w-5 h-5 text-red-600" />
                            <h3 className="text-base font-bold text-gray-900">Retirar Estudiante</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600">
                                ¿Cómo deseas gestionar el retiro de <strong>{retireModalStudent.name}</strong>?
                            </p>

                            <div className="space-y-3">
                                <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${retireMode === 'RETIRE_KEEP_HISTORY' ? 'border-indigo-500 bg-indigo-50/40' : 'border-gray-200'}`}>
                                    <input
                                        type="radio"
                                        name="retireMode"
                                        checked={retireMode === 'RETIRE_KEEP_HISTORY'}
                                        onChange={() => setRetireMode('RETIRE_KEEP_HISTORY')}
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="text-sm font-bold text-gray-900">Mantener información histórica (Recomendado)</div>
                                        <div className="text-xs text-gray-500">Conserva su récord académico y notas de este ciclo escolar, pero no lo matricula para el ciclo siguiente.</div>
                                    </div>
                                </label>

                                <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${retireMode === 'RETIRE_DELETE' ? 'border-red-500 bg-red-50/40' : 'border-gray-200'}`}>
                                    <input
                                        type="radio"
                                        name="retireMode"
                                        checked={retireMode === 'RETIRE_DELETE'}
                                        onChange={() => setRetireMode('RETIRE_DELETE')}
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="text-sm font-bold text-red-700">Eliminar completamente del sistema</div>
                                        <div className="text-xs text-gray-500">Borra de la base de datos al estudiante y todo su historial (usar si fue registrado por error).</div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button onClick={() => setRetireModalStudent(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl">
                                Cancelar
                            </button>
                            <button
                                onClick={confirmStudentRetire}
                                className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs"
                            >
                                Confirmar Retiro
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para Crear Nueva Sección al Vuelo */}
            {newSectionModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="Crear Sección para el Siguiente Ciclo">
                    <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 bg-indigo-50/50">
                            <Plus className="w-5 h-5 text-indigo-600" />
                            <h3 className="text-base font-bold text-gray-900">Crear Sección para el Siguiente Ciclo</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Año Escolar Destino</label>
                                <Lista
                                    etiqueta="Año escolar destino"
                                    valor={String(newSectionGrade)}
                                    alCambiar={v => setNewSectionGrade(parseInt(v))}
                                    opciones={[1, 2, 3, 4, 5].map(n => ({ valor: String(n), texto: `${n}º Año` }))}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Letra de la Sección (ej. C, D)</label>
                                <input
                                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold uppercase"
                                    value={newSectionLetter}
                                    onChange={e => setNewSectionLetter(e.target.value.toUpperCase())}
                                    maxLength={2}
                                    placeholder="C"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button onClick={() => setNewSectionModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl">
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateSection}
                                className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                            >
                                Crear Sección
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación y Cierre de Ciclo */}
            {confirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="Confirmar Cierre de Ciclo Escolar">
                    <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-emerald-50/80 to-transparent">
                            <AlertTriangle className="w-6 h-6 text-amber-500" />
                            <h3 className="text-base font-bold text-gray-900">Confirmar Cierre de Ciclo Escolar</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600">
                                Al confirmar, el sistema:
                            </p>
                            <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside bg-gray-50 p-3.5 rounded-xl border border-gray-100 font-medium">
                                <li>Matriculará a los estudiantes en <strong>{nextYear?.name ?? suggestedNextYearName}</strong>: el que pasa, en el año siguiente; el que repite, en el suyo.</li>
                                <li>Creará las <strong>materias pendientes</strong> de quien pasa con pendientes, con el profesor que las evalúa.</li>
                                <li>Registrará como <strong>Egresados</strong> a los de último año que aprobaron, y sellará el expediente de cada uno con su condición (y el motivo, si se cambió).</li>
                                <li>Marcará el ciclo <strong>{yearName}</strong> como finalizado.</li>
                            </ul>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                    Escribe el nombre del ciclo para confirmar: <span className="font-mono text-indigo-700 font-black">{yearName}</span>
                                </label>
                                <input
                                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-semibold"
                                    value={confirmText}
                                    onChange={e => setConfirmText(e.target.value)}
                                    placeholder={yearName}
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button onClick={() => setConfirmOpen(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl">
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={confirming || confirmText.trim() !== yearName.trim()}
                                className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-2"
                            >
                                {confirming ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Cerrando ciclo...
                                    </>
                                ) : (
                                    'Aceptar y Finalizar Ciclo'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Acta de Materia Pendiente (Arrastre venezolano) */}
            {revisionStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
                    <div role="dialog" aria-modal="true" aria-labelledby="titulo-revision" className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h3 id="titulo-revision" className="font-bold text-gray-900">Revisión de {revisionStudent.name}</h3>
                            <p className="mt-1 text-xs text-gray-600">
                                La nota de la revisión es la definitiva de la materia para la promoción. Del 0 al 20; se redondea como las definitivas del liceo.
                            </p>
                        </div>
                        <div className="px-6 py-4 space-y-3">
                            {materiasDeRevision(revisionStudent).map(g => (
                                <div key={g.subjectId} className="flex items-center justify-between gap-3">
                                    <label htmlFor={`revision-${g.subjectId}`} className="text-sm text-gray-800">
                                        <span className="font-semibold">{g.subjectName}</span>
                                        <span className="block text-xs text-gray-600">Definitiva del año: {g.definitivaDeLapsos ?? g.average}</span>
                                    </label>
                                    <input
                                        id={`revision-${g.subjectId}`}
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        max={20}
                                        step="0.5"
                                        value={revisionScores[g.subjectId] ?? ''}
                                        onChange={e => setRevisionScores(prev => ({ ...prev, [g.subjectId]: e.target.value }))}
                                        className="w-24 min-h-[44px] border border-gray-300 rounded-lg px-3 text-center"
                                        placeholder="—"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button onClick={() => setRevisionStudent(null)} className="min-h-[44px] px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200 rounded-xl">
                                Cancelar
                            </button>
                            <button
                                onClick={guardarRevisiones}
                                disabled={savingRevision}
                                className="min-h-[44px] px-4 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-60"
                            >
                                {savingRevision ? 'Guardando…' : 'Guardar revisión'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* El acta va suelta en <body> (`data-hoja-suelta`): al imprimir,
                `globals.css` deja solo ella. Dentro de la página salía la
                promoción entera detrás y el acta, fija, repetida en cada hoja. */}
            {pendingModalStudent && createPortal(
                <div data-hoja-suelta className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto print:static print:block print:p-0 print:bg-white print:overflow-visible print:backdrop-blur-none" role="dialog" aria-modal="true" aria-label="Acta de compromiso de materias pendientes">
                    <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 print:shadow-none print:max-w-full print:rounded-none print:overflow-visible print:animate-none">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-amber-50/70 print:hidden">
                            <div className="flex items-center gap-2 text-amber-900 font-bold text-base">
                                <FileText className="w-5 h-5 text-amber-600" />
                                Acta de Compromiso de Materias Pendientes (Arrastre)
                            </div>
                            <button
                                onClick={() => void imprimirConAviso()}
                                className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
                            >
                                <Printer className="w-3.5 h-3.5" /> Imprimir Acta
                            </button>
                        </div>

                        {/* Documento Oficial Formateado para Venezuela */}
                        <div className="p-8 space-y-6 text-gray-800 font-sans text-xs leading-relaxed print:p-0">
                            <div className="text-center border-b border-gray-200 pb-4 space-y-1">
                                {/* El membrete del liceo: antes el acta no decía de qué liceo era. */}
                                <MembreteOficial className="mb-3" />
                                <div className="font-bold text-indigo-900 text-sm">ACTA DE COMPROMISO ACADÉMICO — MATERIA PENDIENTE</div>
                                <div className="text-gray-600 font-medium text-xs">Año Escolar Cursado: <strong>{yearName}</strong></div>
                            </div>

                            <div className="space-y-2">
                                <p>
                                    En la fecha actual, se hace constar que el(la) estudiante:
                                </p>
                                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 grid grid-cols-2 gap-2 text-xs">
                                    <div><strong>Nombre y Apellido:</strong> {pendingModalStudent.name}</div>
                                    <div><strong>Año Cursado:</strong> {pendingModalStudent.gradeLevel}º Año</div>
                                    <div><strong>Condición Académica:</strong> Promovido(a) con Materia(s) Pendiente(s)</div>
                                    <div><strong>Promedio Final Obtenido:</strong> {pendingModalStudent.finalAverage.toFixed(2)} pts</div>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold text-gray-900 mb-2 uppercase text-[11px] tracking-wide">
                                    Asignatura(s) Pendiente(s) para Evaluación Extraordinaria:
                                </h4>
                                <table className="w-full border-collapse border border-gray-300 text-left text-xs">
                                    <thead>
                                        <tr className="bg-gray-100 font-bold text-gray-700">
                                            <th className="border border-gray-300 p-2">Asignatura</th>
                                            <th className="border border-gray-300 p-2 text-center w-28">Nota Final (01-20)</th>
                                            <th className="border border-gray-300 p-2 text-center w-36">Estado de Arrastre</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingModalStudent.failedSubjects.map((f, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="border border-gray-300 p-2 font-semibold">{f.name}</td>
                                                <td className="border border-gray-300 p-2 text-center font-bold text-red-600">{f.average} pts</td>
                                                <td className="border border-gray-300 p-2 text-center text-amber-700 font-medium bg-amber-50/50">Materia Pendiente</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-amber-900 text-[11px] space-y-1">
                                <div className="font-bold">Normativa del Ministerio de Educación (MPPE):</div>
                                <p>
                                    El(la) estudiante tiene derecho a cursar el siguiente año escolar ({pendingModalStudent.gradeLevel + 1}º Año) y presentar las evaluaciones extraordinarias de las materias pendientes en los momentos pedagógicos reglamentarios.
                                </p>
                            </div>

                            {/* Firmas */}
                            <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs">
                                <div className="border-t border-gray-400 pt-2">
                                    <div className="font-bold text-gray-900">Firma del Representante Legal</div>
                                    <div className="text-gray-500 text-[10px]">C.I.: _______________________</div>
                                </div>
                                <div className="border-t border-gray-400 pt-2">
                                    <div className="font-bold text-gray-900">Dirección del Plantel / Control de Estudios</div>
                                    <div className="text-gray-500 text-[10px]">Sello y Firma Oficial</div>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 print:hidden">
                            <button
                                onClick={() => setPendingModalStudent(null)}
                                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
