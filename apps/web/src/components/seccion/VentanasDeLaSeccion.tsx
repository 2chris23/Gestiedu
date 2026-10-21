import {
    Search,
    UserPlus,
    CheckCircle2,
} from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';
import { diferido } from '@/components/common/Diferido';
import type { useLaSeccion } from './useLaSeccion';

const RemoveStudentSecureModal = diferido(() => import('@/components/academic/RemoveStudentSecureModal'), { sinEsqueleto: true });
const AssignTeacherModal = diferido(() => import('@/components/academic/AssignTeacherModal'), { sinEsqueleto: true });
const StudentObservationsModal = diferido(() => import('@/components/observations/StudentObservationsModal'), { sinEsqueleto: true });

/** Las ventanas de la sección: inscribir alumnos, sacar a uno, cambiar el guía y las observaciones de un alumno. */
export function VentanasDeLaSeccion({ c }: { c: ReturnType<typeof useLaSeccion> }) {
    const {
        isAssignTeacherModalOpen,
        setIsAssignTeacherModalOpen,
        classroom,
        classroomId,
        isAddStudentModalOpen,
        setIsAddStudentModalOpen,
        selectedStudentIds,
        searchAvailableTerm,
        setSearchAvailableTerm,
        removeModalOpen,
        setRemoveModalOpen,
        studentToRemove,
        setStudentToRemove,
        selectedStudentForObs,
        setSelectedStudentForObs,
        isLoadingAvailable,
        toggleStudentSelection,
        handleAssignStudents,
        handleRemoveStudent,
        filteredAvailable,
    } = c;

    return (
        <>
            {isAddStudentModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Inscribir estudiantes en la sección">
                    <div className="flex items-center justify-center min-h-full p-4 text-center">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setIsAddStudentModalOpen(false)} aria-hidden="true" onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setIsAddStudentModalOpen(false);
                            }
                        }}></div>
                        <div className="relative w-full max-w-lg bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 sm:mx-0 sm:h-10 sm:w-10">
                                        <UserPlus className="h-6 w-6 text-indigo-600" />
                                    </div>
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        <h3 className="text-lg leading-6 font-medium text-gray-900">Agregar Estudiantes</h3>
                                        <div className="mt-2 text-sm text-gray-500">
                                            <p>Selecciona uno o varios estudiantes para agregarlos a esta sección.</p>
                                            {selectedStudentIds.size > 0 && (
                                                <p className="mt-1 font-medium text-indigo-600">{selectedStudentIds.size} seleccionado{selectedStudentIds.size > 1 ? 's' : ''}</p>
                                            )}
                                        </div>
                                        <div className="mt-4">
                                            <div className="relative rounded-md shadow-sm">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <Search className="h-5 w-5 text-gray-400" />
                                                </div>
                                                <input
                                                    type="text"
                                                    className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                                                    placeholder="Buscar por nombre o código..."
                                                    value={searchAvailableTerm}
                                                    onChange={(e) => setSearchAvailableTerm(e.target.value)}
                                                />
                                            </div>
                                            <div className="mt-4 max-h-60 overflow-y-auto border border-gray-200 rounded-md">
                                                {isLoadingAvailable ? (
                                                    <div className="p-4 text-center text-gray-500 text-sm">Cargando...</div>
                                                ) : filteredAvailable.length === 0 ? (
                                                    <div className="p-4 text-center text-gray-500 text-sm">No hay estudiantes disponibles.</div>
                                                ) : (
                                                    <div className="divide-y divide-gray-200">
                                                        {filteredAvailable.map((s) => {
                                                            const isSelected = selectedStudentIds.has(s.id);
                                                            return (
                                                                <div
                                                                    key={s.id}
                                                                    className={`p-3 hover:bg-gray-50 cursor-pointer flex items-center ${isSelected ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'border-l-4 border-transparent'}`}
                                                                    onClick={() => toggleStudentSelection(s.id)}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                                            e.preventDefault();
                                                                            toggleStudentSelection(s.id);
                                                                        }
                                                                    }}
                                                                >
                                                                    <div className="flex items-center">
                                                                        <div className="mr-3">
                                                                            {isSelected ? <CheckCircle2 className="h-5 w-5 text-indigo-600" /> : <div className="h-5 w-5 rounded-full border-2 border-gray-300" />}
                                                                        </div>
                                                                        <UserAvatar
                                                                            name={`${s.firstName} ${s.lastName}`}
                                                                            src={(s as any).avatar}
                                                                            className="h-8 w-8 mr-3"
                                                                            initialsClassName="text-xs"
                                                                        />
                                                                        <div>
                                                                            <div className="text-sm font-medium text-gray-900">{s.firstName} {s.lastName}</div>
                                                                            <div className="text-xs text-gray-500">{s.studentCode || s.email}</div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                <button
                                    type="button"
                                    className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 sm:ml-3 sm:w-auto sm:text-sm ${selectedStudentIds.size === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={handleAssignStudents}
                                    disabled={selectedStudentIds.size === 0}
                                >
                                    Agregar {selectedStudentIds.size > 0 ? `(${selectedStudentIds.size})` : ''}
                                </button>
                                <button
                                    type="button"
                                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                                    onClick={() => setIsAddStudentModalOpen(false)}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {removeModalOpen && (
            <RemoveStudentSecureModal
                isOpen
                onClose={() => {
                    setRemoveModalOpen(false);
                    setStudentToRemove(null);
                }}
                studentId={studentToRemove?.id || null}
                studentName={studentToRemove?.name || ''}
                onConfirm={handleRemoveStudent}
            />
            )}

            {isAssignTeacherModalOpen && (
            <AssignTeacherModal
                isOpen
                onClose={() => setIsAssignTeacherModalOpen(false)}
                classroomId={classroomId || ''}
                classroomName={classroom?.name || ''}
                currentTeacher={classroom?.teacher}
            />
            )}

            {selectedStudentForObs && (
                <StudentObservationsModal
                    isOpen
                    onClose={() => setSelectedStudentForObs(null)}
                    student={selectedStudentForObs}
                />
            )}
        </>
    );
}
