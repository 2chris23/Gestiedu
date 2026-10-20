'use client';

import { User, FileText, Clock } from 'lucide-react';
import Link from 'next/link';
import { RepresentantesDelAlumno } from '@/components/users/RepresentantesDelAlumno';
import { TelefonoDeAsistencia } from '@/components/users/TelefonoDeAsistencia';
import { PinDeLaAppDelUsuario } from '@/components/users/PinDeLaAppDelUsuario';
import { ContrasenaDelUsuario } from '@/components/users/ContrasenaDelUsuario';
import { CambiarCedula } from '@/components/users/CambiarCedula';
import { EditarDatosPersonales } from '@/components/users/EditarDatosPersonales';
import { LaborSocialDelAlumno } from '@/components/labor-social/LaborSocialDelAlumno';
import type { useFichaDelUsuario } from './useFichaDelUsuario';

export function FichaPersonalDelUsuario({ c }: { c: ReturnType<typeof useFichaDelUsuario> }) {
    const {
        dbUser,
        fullUserData,
        user,
        teacherData,
        setShowGuideHistoryModal,
        yo,
    } = c;
    // La página no la pinta sin usuario; esto se lo dice también a TypeScript.
    if (!user) return null;

    return (
        <>
            {/* Left Column: Personal Information Detail (Ficha) */}
            <div className="lg:col-span-1 space-y-6 animate-in slide-in-from-left duration-500 delay-150">
                {/* La inscripción, el traslado, el retiro y los documentos
                    van en la cabecera; las actividades, en cada ciclo (al
                    pulsar el promedio o una materia). */}
                {user.role === 'student' && <LaborSocialDelAlumno studentId={user.cedula} />}

                {/* Teacher Guide Section - First for teachers */}
                {user.role === 'teacher' && (
                    <div
                        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all"
                        onClick={() => setShowGuideHistoryModal(true)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowGuideHistoryModal(true); } }}
                    >
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <User size={18} className="text-indigo-500" />
                            Sección Guía
                            <span className="ml-auto text-xs text-gray-400">Click para ver historial</span>
                        </h3>
                        <div className="space-y-2">
                            {teacherData.guideSection ? (
                                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                                    <p className="font-bold text-indigo-900">{teacherData.guideSection.name}</p>
                                    <p className="text-sm text-indigo-700">
                                        {teacherData.guideSection.grade}° Año - Sección {teacherData.guideSection.section}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-gray-400 italic text-sm">No es profesor guía de ninguna sección</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Personal Information */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <User size={18} className="text-blue-500" />
                        Información Personal
                    </h3>
                    <div className="space-y-4 text-sm">
                        {dbUser && <EditarDatosPersonales usuario={dbUser as any} />}
                        <div className="grid gap-1">
                            <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Nombre Completo</span>
                            <span className="font-medium text-gray-700">{user.name}</span>
                        </div>
                        <div className="grid gap-1">
                            <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Cédula</span>
                            <span className="font-medium text-gray-700">{user.cedula}</span>
                            {dbUser?.cedulaEscolar && (
                                <span className="text-xs text-gray-500">Cédula escolar: {dbUser.cedulaEscolar}</span>
                            )}
                            <CambiarCedula cedula={user.cedula} />
                        </div>
                        <div className="grid gap-1">
                            <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Correo Electrónico</span>
                            <span className="font-medium text-gray-700 truncate">{user.email}</span>
                        </div>
                        {(dbUser as any)?.birthDate && (
                            <div className="grid gap-1">
                                <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Fecha de nacimiento</span>
                                <span className="font-medium text-gray-700">
                                    {String((dbUser as any).birthDate).slice(0, 10).split('-').reverse().join('/')}
                                </span>
                            </div>
                        )}
                        <div className="grid gap-1">
                            <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Teléfono</span>
                            <span className="font-medium text-gray-700">{user.phone}</span>
                        </div>
                        <div className="grid gap-1">
                            <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Dirección</span>
                            {user.address ? (
                                <span className="font-medium text-gray-700">{user.address}</span>
                            ) : (
                                <span className="text-gray-400 italic text-sm">Sin dirección registrada</span>
                            )}
                        </div>
                        {/* El personal: su carga horaria (el admin, o el propio profesor) y su constancia de trabajo (el admin). */}
                        {(user.role === 'teacher' || user.role === 'admin') && (yo?.role === 'ADMIN' || yo?.id === user.cedula) && (
                            <div className="flex flex-wrap gap-2">
                                {user.role === 'teacher' && (
                                    <Link
                                        href={`/dashboard/carga-horaria/${encodeURIComponent(user.cedula)}`}
                                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                                    >
                                        <Clock className="h-4 w-4" /> Hoja de carga horaria
                                    </Link>
                                )}
                                {yo?.role === 'ADMIN' && (
                                    <Link
                                        href={`/dashboard/constancia-de-trabajo/${encodeURIComponent(user.cedula)}`}
                                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                                    >
                                        <FileText className="h-4 w-4" /> Constancia de trabajo
                                    </Link>
                                )}
                            </div>
                        )}
                        {user.role === 'student' && <RepresentantesDelAlumno studentId={user.cedula} />}
                        {user.role === 'student' && <TelefonoDeAsistencia studentId={user.cedula} />}
                        <ContrasenaDelUsuario userId={user.cedula} nombre={user.name?.split(' ')[0]} />
                        <PinDeLaAppDelUsuario userId={user.cedula} />
                        {user.role === 'tutor' && (
                            <div className="pt-4 border-t border-gray-100 mt-2">
                                <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Representa a</span>
                                {(fullUserData?.children ?? []).length === 0 ? (
                                    <p className="text-gray-400 italic text-sm mt-1">
                                        Ningún estudiante. Se asigna desde el perfil del estudiante.
                                    </p>
                                ) : (
                                    <ul className="mt-2 space-y-1.5">
                                        {(fullUserData?.children ?? []).map((c) => (
                                            <li key={c.student.id}>
                                                <Link
                                                    href={`/dashboard/usuarios/${c.student.id}`}
                                                    className="block rounded-xl bg-gray-50 px-3 py-2 hover:bg-gray-100"
                                                >
                                                    <span className="block truncate text-sm font-semibold text-gray-800">
                                                        {c.student.firstName} {c.student.lastName}
                                                    </span>
                                                    <span className="block truncate text-xs text-gray-500">
                                                        {c.relationship}
                                                        {c.student.studentClassrooms?.[0]?.classroom?.name
                                                            ? ` · ${c.student.studentClassrooms[0].classroom.name}`
                                                            : ''}
                                                    </span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </>
    );
}
