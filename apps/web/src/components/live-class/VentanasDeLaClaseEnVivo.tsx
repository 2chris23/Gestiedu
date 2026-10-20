'use client';

import {
    Plus,
    Search,
    X,
    ClipboardCheck,
    QrCode,
    ScanLine,
} from 'lucide-react';
import { diferido } from '@/components/common/Diferido';
import type { useClaseEnVivo } from './useClaseEnVivo';

const PaseDeListaQr = diferido(() => import('@/components/asistencia/PaseDeListaQr'), { sinEsqueleto: true });
const SuspenderClaseDialogo = diferido(() => import('@/components/schedule/SuspenderClaseDialogo').then((m) => ({ default: m.SuspenderClaseDialogo })), { sinEsqueleto: true });
const StudentObservationsModal = diferido(() => import('@/components/observations/StudentObservationsModal'), { sinEsqueleto: true });
const LiveClassObservationModal = diferido(() => import('@/components/observations/LiveClassObservationModal'), { sinEsqueleto: true });

/** Las ventanas de la clase en vivo: buscar alumnos de otra sección, observaciones, suspender y el pase de lista con QR. */
export function VentanasDeLaClaseEnVivo({ c }: { c: ReturnType<typeof useClaseEnVivo> }) {
    const {
        user,
        classroomId,
        subjectId,
        hoyDelLiceo,
        date,
        refetch,
        data,
        involvedIds,
        searchTerm,
        setSearchTerm,
        showStudentSearch,
        setShowStudentSearch,
        searchResults,
        isSearching,
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
        cambiosPorGuardar,
        setCambiosPorGuardar,
        classStudents,
        guardarRef,
        suspendiendo,
        setSuspendiendo,
        addExternalStudent,
    } = c;

    return (
        <>
            {/* ===== MODAL BUSCADOR DE ESTUDIANTES EXTERNOS ===== */}
            {showStudentSearch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="Agregar Estudiante de Otra Sección">
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
            {selectedStudentForObs && (
                <StudentObservationsModal
                    isOpen
                    onClose={() => setSelectedStudentForObs(null)}
                    student={selectedStudentForObs}
                />
            )}

            {/* Modal para Crear y Gestionar Observaciones de esta Clase */}
            {isLiveObsModalOpen && (
            <LiveClassObservationModal
                isOpen
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
            )}

            {user?.role === 'ADMIN' && suspendiendo && (
                <SuspenderClaseDialogo
                    abierto
                    alCerrar={() => setSuspendiendo(false)}
                    classroomId={classroomId}
                    subjectId={subjectId}
                    fecha={date}
                    nombreMateria={data?.subject?.name}
                />
            )}

            {eligiendoAsistencia && (
                <div
                    className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 p-4 sm:items-center"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="como-pasar-asistencia"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setEligiendoAsistencia(false);
                    }}
                >
                    <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 id="como-pasar-asistencia" className="text-base font-bold text-gray-900">
                                    {date < hoyDelLiceo ? 'Corregir la asistencia' : 'Pasar asistencia'}
                                </h3>
                                <p className="text-xs text-gray-600">¿Cómo quieres hacerlo?</p>
                            </div>
                            <button
                                type="button"
                                aria-label="Cerrar"
                                onClick={() => setEligiendoAsistencia(false)}
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex flex-col gap-2">
                            {[
                                {
                                    clave: 'mano',
                                    Icono: ClipboardCheck,
                                    titulo: 'Marcar a mano',
                                    detalle: 'Presente, ausente, tarde o justificado, alumno por alumno.',
                                    visible: true,
                                },
                                {
                                    clave: 'mostrar',
                                    Icono: QrCode,
                                    titulo: 'Enseñar el QR a la clase',
                                    detalle: 'Cada alumno lo escanea desde su teléfono.',
                                    visible: conQr,
                                },
                                {
                                    clave: 'escanear',
                                    Icono: ScanLine,
                                    titulo: 'Escanear el QR de cada alumno',
                                    detalle: 'El alumno te enseña su QR y lo lees con la cámara.',
                                    visible: conQr,
                                },
                            ]
                                .filter((o) => o.visible)
                                .map(({ clave, Icono, titulo, detalle }) => (
                                    <button
                                        key={clave}
                                        type="button"
                                        onClick={async () => {
                                            setEligiendoAsistencia(false);
                                            if (clave === 'mano') {
                                                setModoAsistencia(true);
                                                return;
                                            }
                                            // Lo marcado a mano que quedara por mandar, primero.
                                            if (cambiosPorGuardar > 0) await guardarRef.current();
                                            setCambiosPorGuardar(0);
                                            setModoAsistencia(false);
                                            setQrEscaneando(clave === 'escanear');
                                            setPaseQrAbierto(true);
                                        }}
                                        className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50/60"
                                    >
                                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                                            <Icono className="h-5 w-5" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-bold text-gray-900">{titulo}</span>
                                            <span className="block text-xs text-gray-600">{detalle}</span>
                                        </span>
                                    </button>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            {paseQrAbierto && (
                <PaseDeListaQr
                    classroomId={classroomId}
                    subjectId={subjectId}
                    fecha={date}
                    empezarEscaneando={qrEscaneando}
                    alTerminar={() => {
                        setPaseQrAbierto(false);
                        // Lo que quedó de verdad (lo escribió el servidor).
                        void refetch();
                    }}
                />
            )}
        </>
    );
}
