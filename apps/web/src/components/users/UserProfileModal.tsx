import { Fragment, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { User } from '@/types/user';
import Image from 'next/image';
import { Dialog, Transition } from '@headlessui/react';
import { X, User as UserIcon, Mail, Phone, MapPin, Calendar, BookOpen, Users, Shield, Eye, EyeOff, Key } from 'lucide-react';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/store/auth.store';
import UserAvatar from '@/components/ui/UserAvatar';

interface Tutoring {
    tutor: { firstName: string; lastName: string };
    relationship: string;
}

interface TeacherClassroom {
    classroom: { name: string };
}

interface SubjectTeaching {
    subject: { name: string };
    classroom: { name: string };
}

interface TutorChild {
    student: { firstName: string; lastName: string; classroom?: { name: string } };
    relationship: string;
}

interface ExtendedUser {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address?: string;
    birthDate?: string | Date;
    avatar?: string;
    role: string;
    isActive: boolean;
    classroom?: { name: string; teacher?: { firstName: string; lastName: string } };
    studentTutorings?: Tutoring[];
    teacherClassrooms?: TeacherClassroom[];
    subjectTeachings?: SubjectTeaching[];
    children?: TutorChild[];
}

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string | null;
}

export function UserProfileModal({ isOpen, onClose, userId }: UserProfileModalProps) {
    const { user: currentUser } = useAuthStore();
    const [user, setUser] = useState<ExtendedUser | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    const handleResetPassword = async () => {
        if (!newPassword || newPassword.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        setResetLoading(true);
        setError(null);
        try {
            await userService.updateUser(user!.id, { password: newPassword });
            setIsResettingPassword(false);
            setNewPassword('');
            // Show a temporary success message or just clear error
            toast.success('Contraseña actualizada correctamente');
        } catch (err) {
            console.error('Error resetting password:', err);
            setError(err instanceof Error ? err.message : 'Error al actualizar la contraseña');
        } finally {
            setResetLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && userId) {
            loadUserDetails(userId);
        } else {
            setUser(null);
            setError(null);
            setShowPassword(false);
        }
    }, [isOpen, userId]);

    const loadUserDetails = async (id: string) => {
        setLoading(true);
        setError(null);
        try {
            const userData = await userService.getUserById(id);
            setUser(userData);
        } catch (error) {
            console.error('Error loading user details:', error);
            setError(error instanceof Error ? error.message : 'Error al cargar información del usuario');
        } finally {
            setLoading(false);
        }
    };

    const getRoleColor = (role: string) => {
        switch (role) {
            case 'ADMIN': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'TEACHER': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'STUDENT': return 'bg-green-100 text-green-800 border-green-200';
            case 'TUTOR': return 'bg-purple-100 text-purple-800 border-purple-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getRoleHeaderColor = (role: string) => {
        switch (role) {
            case 'ADMIN': return 'bg-yellow-500';
            case 'TEACHER': return 'bg-blue-600';
            case 'STUDENT': return 'bg-green-600';
            case 'TUTOR': return 'bg-purple-600';
            default: return 'bg-gray-600';
        }
    };

    const formatRole = (role: string) => {
        switch (role) {
            case 'ADMIN': return 'Administrador';
            case 'TEACHER': return 'Profesor';
            case 'STUDENT': return 'Estudiante';
            case 'TUTOR': return 'Tutor';
            default: return role;
        }
    };

    return (
        <Dialog open={isOpen} as="div" className="relative z-50" onClose={onClose}>
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />

            <div className="fixed inset-0 z-10 overflow-y-auto">
                <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                    <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
                        {loading ? (
                            <div className="p-12 text-center text-gray-500">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                                Cargando perfil...
                            </div>
                        ) : user ? (
                            <div className="flex flex-col h-full">
                                {/* Header con color dinámico */}
                                <div className={`${getRoleHeaderColor(user.role)} h-32 relative`}>
                                    <button
                                        onClick={onClose}
                                        className="absolute top-4 right-4 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/20 transition-colors"
                                    >
                                        <X className="h-6 w-6" />
                                    </button>
                                    <div className="absolute -bottom-16 left-8 flex items-end">
                                        <UserAvatar
                                            name={`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Usuario'}
                                            src={user.avatar}
                                            className="h-32 w-32 border-4 border-white shadow-md"
                                            initialsClassName="text-3xl"
                                        />
                                    </div>
                                </div>

                                <div className="pt-20 px-8 pb-8">
                                    {/* Info Principal */}
                                    <div className="flex flex-col gap-6">
                                        <div className="w-full">
                                            <h2 className="text-2xl font-bold text-gray-900">{user.firstName} {user.lastName}</h2>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleColor(user.role)}`}>
                                                    {formatRole(user.role)}
                                                </span>
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {user.isActive ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                            {/* Sección Izquierda: Datos Personales */}
                                            <div className="space-y-6">
                                                <div>
                                                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Información Personal</h3>
                                                    <div className="space-y-3">
                                                        <div className="flex items-center text-gray-700">
                                                            <svg className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                                                            </svg>
                                                            <span className="text-sm">Cédula: {user.id}</span>
                                                        </div>
                                                        <div className="flex items-center text-gray-700">
                                                            <Mail className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" />
                                                            <span className="text-sm break-all">{user.email}</span>
                                                        </div>
                                                        {user.phone && (
                                                            <div className="flex items-center text-gray-700">
                                                                <Phone className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" />
                                                                <span className="text-sm">{user.phone}</span>
                                                            </div>
                                                        )}
                                                        {user.address && (
                                                            <div className="flex items-center text-gray-700">
                                                                <MapPin className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" />
                                                                <span className="text-sm">{user.address}</span>
                                                            </div>
                                                        )}
                                                        {user.birthDate && (
                                                            <div className="flex items-center text-gray-700">
                                                                <Calendar className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" />
                                                                <span className="text-sm">{new Date(user.birthDate).toLocaleDateString()}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Seguridad - SOLO ADMIN */}
                                                {currentUser?.role === 'ADMIN' && (
                                                    <div className="border-t border-gray-100 pt-4">
                                                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Seguridad</h3>
                                                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                                            {!isResettingPassword ? (
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="bg-gray-100 p-2 rounded-full">
                                                                            <Key className="h-5 w-5 text-gray-500" />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-medium text-gray-900">Contraseña del Usuario</p>
                                                                            <p className="text-xs text-gray-500">Gestionar acceso</p>
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => {
                                                                            setIsResettingPassword(true);
                                                                            setError(null);
                                                                        }}
                                                                        className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded hover:bg-indigo-100 transition-colors"
                                                                    >
                                                                        Restablecer
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-3">
                                                                    <label htmlFor="newPassword" className="block text-xs font-medium text-gray-700">Nueva Contraseña</label>
                                                                    <input
                                                                        type="text"
                                                                        id="newPassword"
                                                                        value={newPassword}
                                                                        onChange={(e) => setNewPassword(e.target.value)}
                                                                        placeholder="Mínimo 8 caracteres"
                                                                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                                                    />
                                                                    <div className="flex justify-end gap-2">
                                                                        <button
                                                                            onClick={() => {
                                                                                setIsResettingPassword(false);
                                                                                setNewPassword('');
                                                                                setError(null);
                                                                            }}
                                                                            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                                                                            disabled={resetLoading}
                                                                        >
                                                                            Cancelar
                                                                        </button>
                                                                        <button
                                                                            onClick={handleResetPassword}
                                                                            className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                                                                            disabled={resetLoading}
                                                                        >
                                                                            {resetLoading ? 'Guardando...' : 'Guardar'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {!isResettingPassword && (
                                                                <div className="mt-3 flex items-start gap-2 text-xs text-gray-500 bg-white p-2 rounded border border-gray-100">
                                                                    <Shield className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                                                    <p>
                                                                        La contraseña está encriptada y <strong>no es posible mostrarla</strong>, pero puedes restablecerla aquí si es necesario.
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Sección Derecha: Datos Específicos por Rol */}
                                            <div className="space-y-6">
                                                {user.role === 'STUDENT' && (
                                                    <>
                                                        <div>
                                                            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Información Académica</h3>
                                                            <div className="bg-green-50 rounded-lg p-4 border border-green-100 space-y-3">
                                                                <div className="flex justify-between items-center text-sm">
                                                                    <span className="text-green-800 font-medium">Salón:</span>
                                                                    <span className="text-green-700 font-bold">{user.classroom?.name || 'Sin asignar'}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-sm">
                                                                    <span className="text-green-800 font-medium">Profesor Guía:</span>
                                                                    <span className="text-green-700 text-right">{user.classroom?.teacher ? `${user.classroom.teacher.firstName} ${user.classroom.teacher.lastName}` : 'N/A'}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-sm">
                                                                    <span className="text-green-800 font-medium">Promedio:</span>
                                                                    <span className="text-green-700 font-bold">18.5 pts</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-sm">
                                                                    <span className="text-green-800 font-medium">Asistencia:</span>
                                                                    <span className="text-green-700 font-bold">95%</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {(user.studentTutorings?.length ?? 0) > 0 && (
                                                            <div>
                                                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Tutor / Representante</h3>
                                                                <div className="space-y-2">
                                                                    {user.studentTutorings!.map((t: Tutoring, idx: number) => (
                                                                        <div key={idx} className="flex items-center p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                                                                            <Users className="h-8 w-8 text-gray-400 bg-gray-100 p-1.5 rounded-full mr-3 flex-shrink-0" />
                                                                            <div className="min-w-0">
                                                                                <p className="text-sm font-medium text-gray-900 truncate">{t.tutor.firstName} {t.tutor.lastName}</p>
                                                                                <p className="text-xs text-gray-500 truncate">{t.relationship}</p>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                )}

                                                {user.role === 'TEACHER' && (
                                                    <>
                                                        {(user.teacherClassrooms?.length ?? 0) > 0 && (
                                                            <div>
                                                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Profesor Guía de</h3>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {user.teacherClassrooms!.map((tc: TeacherClassroom, idx: number) => (
                                                                        <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                                            {tc.classroom.name}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {(user.subjectTeachings?.length ?? 0) > 0 && (
                                                            <div>
                                                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Materias Impartidas</h3>
                                                                <ul className="space-y-2">
                                                                    {user.subjectTeachings!.map((st: SubjectTeaching, idx: number) => (
                                                                        <li key={idx} className="flex items-center text-sm text-gray-700 bg-gray-50 p-2 rounded border border-gray-100">
                                                                            <BookOpen className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />
                                                                            <span className="truncate">{st.subject.name}</span>
                                                                            <span className="text-gray-400 text-xs ml-auto flex-shrink-0">({st.classroom.name})</span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </>
                                                )}

                                                {user.role === 'TUTOR' && (user.children?.length ?? 0) > 0 && (
                                                    <div>
                                                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Representados</h3>
                                                        <div className="space-y-2">
                                                            {user.children!.map((child: TutorChild, idx: number) => (
                                                                <div key={idx} className="flex items-center p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                                                                    <Users className="h-8 w-8 text-green-600 bg-green-50 p-1.5 rounded-full mr-3 flex-shrink-0" />
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-medium text-gray-900 truncate">{child.student.firstName} {child.student.lastName}</p>
                                                                        <p className="text-xs text-gray-500 truncate">{child.student.classroom?.name || 'Sin Aula'} • {child.relationship}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {user.role === 'ADMIN' && (
                                                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                                                        <div className="flex items-start">
                                                            <Shield className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                                                            <div>
                                                                <h4 className="text-sm font-medium text-yellow-800">Nivel de Acceso Total</h4>
                                                                <p className="text-xs text-yellow-700 mt-1">Este usuario tiene control total sobre configuraciones, usuarios y sistema.</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : error ? (
                            <div className="p-12 text-center">
                                <div className="text-red-500 mb-2">
                                    <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900">Error</h3>
                                <p className="mt-2 text-sm text-gray-500">{error}</p>
                                <button
                                    onClick={onClose}
                                    className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                >
                                    Cerrar
                                </button>
                            </div>
                        ) : (
                            <div className="p-12 text-center text-gray-500">
                                No se encontró información del usuario.
                            </div>
                        )}
                    </Dialog.Panel>
                </div>
            </div>
        </Dialog>
    );
}
