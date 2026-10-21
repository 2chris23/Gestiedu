import {
    BookOpen,
    Users,
    Bell,
    UserPlus,
    Trash2,
    ClipboardCheck,
    HeartHandshake,
} from 'lucide-react';
import Link from 'next/link';
import { SectionStudent } from '@/services/students.service';
import { Pagination } from '@/components/ui';
import { SubjectCard } from '@/components/academic/SubjectCard';
import { getAcademicRisk } from '@/utils/academicRisk';
import UserAvatar from '@/components/ui/UserAvatar';
import { TablaAdaptable } from '@/components/ui/tabla-adaptable';
import { diferido } from '@/components/common/Diferido';
import { BuscadorDeAlumnos, PartesDeLaPantalla } from '@/components/academic/CabezaDeLaClase';
import type { useLaSeccion } from './useLaSeccion';

const SectionObservationsTab = diferido(() => import('@/components/classroom/SectionObservationsTab'), { alto: 300 });
const PendientesDeLaSeccion = diferido(() => import('@/components/pendientes/PendientesDeLaSeccion'), { alto: 300 });
const LaborSocialDeLaSeccion = diferido(() => import('@/components/labor-social/LaborSocialDeLaSeccion'), { alto: 300 });

/** Las pestañas de la sección: alumnos, materias, observaciones, pendientes y labor social. */
export function PestanasDeLaSeccion({ c }: { c: ReturnType<typeof useLaSeccion> }) {
    const {
        cycleId,
        sectionId,
        router,
        activeTab,
        setActiveTab,
        page,
        setPage,
        classroomId,
        academicConfig,
        passingGrade,
        isLoading,
        subjectsWithStats,
        isLoadingSubjectsStats,
        searchTerm,
        setSearchTerm,
        sortColumn,
        sortDirection,
        setRemoveModalOpen,
        setStudentToRemove,
        setSelectedStudentForObs,
        yo,
        esGuiaOAdmin,
        conLaborSocial,
        pagination,
        sortedStudents,
        handleSort,
        handleOpenAddModal,
    } = c;

    return (
        <>
            <div>
                <div className="mb-5">
                    <PartesDeLaPantalla
                        etiqueta="Partes de la sección"
                        activa={activeTab}
                        alElegir={setActiveTab}
                        partes={[
                            { id: 'estudiantes', nombre: 'Estudiantes', icono: Users },
                            { id: 'materias', nombre: 'Materias', icono: BookOpen },
                            { id: 'observaciones', nombre: 'Observaciones', icono: Bell },
                            ...(esGuiaOAdmin ? [{ id: 'pendientes', nombre: 'Pendientes', icono: ClipboardCheck }] : []),
                            ...(conLaborSocial ? [{ id: 'labor-social', nombre: 'Labor social', icono: HeartHandshake }] : []),
                        ]}
                    />
                </div>

                {activeTab === 'estudiantes' && (
                    <div className="overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
                        <div className="flex items-center gap-2 border-b border-gray-100 p-4">
                            <BuscadorDeAlumnos valor={searchTerm} alCambiar={setSearchTerm} />
                            {/* Inscribir es del administrador (control de estudios): el servidor lo exige */}
                            {yo?.role === 'ADMIN' && (
                                <button
                                    type="button"
                                    onClick={handleOpenAddModal}
                                    aria-label="Inscribir estudiantes"
                                    title="Inscribir estudiantes"
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700"
                                >
                                    <UserPlus className="h-5 w-5" aria-hidden />
                                </button>
                            )}
                        </div>

                        {/*
                            LA LISTA DE ALUMNOS, SIN ARRASTRAR

                            Eran siete columnas con `whitespace-nowrap` dentro
                            de un `overflow-x-auto`: 785 px de tabla en una
                            pantalla de 390. El profesor tenía que arrastrar de
                            lado, y al llegar a la nota ya no sabía de qué
                            alumno era. Ordenar tampoco se podía: se ordenaba
                            pulsando la cabecera, y en el teléfono la cabecera
                            estaba fuera de la pantalla.

                            Luego cada alumno fue una tarjeta con todo lo suyo:
                            330 px de alto, dos alumnos por pantalla. Ahora es
                            UNA FILA por alumno (`compacta`): nombre y cédula, y
                            al lado riesgo (solo el número de materias),
                            promedio y asistencia, con su cabecera para
                            ordenar. Lo demás está en su ficha, a un toque. En
                            pantalla ancha sigue siendo la tabla de siempre.
                        */}
                        <div className="p-2 sm:p-5">
                            <TablaAdaptable<SectionStudent>
                                compacta
                                datos={sortedStudents}
                                cargando={isLoading}
                                clave={(a) => a.id}
                                alPulsar={(a) => router.push(`/dashboard/usuarios/${a.id}`)}
                                orden={sortColumn ? { por: sortColumn, hacia: sortDirection } : null}
                                alOrdenar={handleSort}
                                vacio={
                                    <p className="text-cuerpo text-tinta-suave">
                                        {searchTerm ? 'No se encontraron estudiantes.' : 'No hay estudiantes inscritos.'}
                                    </p>
                                }
                                columnas={[
                                    {
                                        id: 'nombre',
                                        titulo: 'Perfil',
                                        tituloCorto: 'Nombre',
                                        principal: true,
                                        ordenable: true,
                                        celdaCompacta: (a) => {
                                            const obs = (a as any).observationsCount || 0;
                                            return (
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <UserAvatar
                                                        name={`${a.firstName} ${a.lastName}`}
                                                        src={(a as any).avatar}
                                                        className="h-8 w-8 shrink-0"
                                                        initialsClassName="text-xs"
                                                    />
                                                    <div className="min-w-0">
                                                        {/* En dos líneas, no cortado: «Kleiver Josu…» y
                                                            «Jesús Albert…» no dejaban saber a quién
                                                            se le ponía la nota. */}
                                                        <p className="line-clamp-2 break-words text-sm font-medium leading-5 text-gray-900" title={`${a.firstName} ${a.lastName}`}>
                                                            {a.firstName} {a.lastName}
                                                        </p>
                                                        <p className="truncate text-xs text-gray-500">
                                                            <span className="font-mono">{a.studentCode || a.id}</span>
                                                            {obs > 0 && <span className="font-semibold text-amber-700"> · {obs} obs</span>}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        },
                                        celda: (a) => (
                                            <div className="flex items-center gap-3">
                                                <UserAvatar
                                                    name={`${a.firstName} ${a.lastName}`}
                                                    src={(a as any).avatar}
                                                    className="h-10 w-10 shrink-0"
                                                    initialsClassName="text-sm"
                                                />
                                                <div className="min-w-0">
                                                    <p className="line-clamp-2 break-words font-medium text-gray-900" title={`${a.firstName} ${a.lastName}`}>
                                                        {a.firstName} {a.lastName}
                                                    </p>
                                                    {/* La cédula, debajo del nombre: en la tarjeta
                                                        ahorra una línea entera. En la tabla ancha
                                                        tiene su propia columna. */}
                                                    <p className="truncate font-mono text-xs text-gray-500 @2xl:hidden">
                                                        {a.studentCode || a.id}
                                                    </p>
                                                </div>
                                            </div>
                                        ),
                                    },
                                    {
                                        id: 'cedula',
                                        titulo: 'ID / Cédula',
                                        ordenable: true,
                                        soloAncha: true,
                                        celda: (a) => (
                                            <span className="font-mono text-sm text-gray-500">{a.studentCode || a.id}</span>
                                        ),
                                    },
                                    {
                                        id: 'riesgo',
                                        titulo: 'Riesgo',
                                        ordenable: true,
                                        // Solo el número de materias por debajo de la
                                        // nota mínima: «Riesgo alto (2 < 10)» no cabía.
                                        compacta: {
                                            ancho: 'w-12',
                                            celda: (a) => {
                                                const n = (a as any).failedSubjectsCount || 0;
                                                return n > 0 ? (
                                                    <span
                                                        className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-rose-50 px-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200"
                                                        title={`${n} ${n === 1 ? 'materia' : 'materias'} por debajo de ${passingGrade}`}
                                                    >
                                                        {n}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs font-semibold text-emerald-700" title="Ninguna materia en riesgo">
                                                        0
                                                    </span>
                                                );
                                            },
                                        },
                                        celda: (a) => {
                                            const failedCount = (a as any).failedSubjectsCount || 0;
                                            if (failedCount > 0) {
                                                return (
                                                    <span
                                                        className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700"
                                                        title={`${failedCount} ${failedCount === 1 ? 'materia con calificación menor a' : 'materias con calificación menor a'} ${passingGrade} pts`}
                                                    >
                                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                        Riesgo Alto ({failedCount} &lt; {passingGrade})
                                                    </span>
                                                );
                                            }
                                            const risk = getAcademicRisk(a.average, passingGrade);
                                            return (
                                                <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${risk.className}`}>
                                                    {risk.label}
                                                </span>
                                            );
                                        },
                                    },
                                    {
                                        id: 'promedio',
                                        titulo: 'Promedio',
                                        ordenable: true,
                                        alinear: 'derecha',
                                        compacta: {
                                            ancho: 'w-12',
                                            titulo: 'Prom.',
                                            celda: (a) =>
                                                a.average || a.hasGrades ? (
                                                    <span
                                                        className={`text-sm font-bold tabular-nums ${(a.average ?? 0) < passingGrade ? 'text-red-600' : 'text-indigo-700'}`}
                                                    >
                                                        {(a.average ?? 0).toFixed(1)}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-500">—</span>
                                                ),
                                        },
                                        // Un 0 es una nota: con `hasGrades` se enseña el 0, no
                                        // «Sin calificar» (CERO-06).
                                        celda: (a) =>
                                            a.average || a.hasGrades ? (
                                                <span className="inline-flex rounded bg-indigo-50 px-2 py-0.5 text-sm font-semibold text-indigo-700">
                                                    {(a.average ?? 0).toFixed(1)}
                                                </span>
                                            ) : (
                                                <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-sm font-medium text-gray-500">
                                                    Sin notas
                                                </span>
                                            ),
                                    },
                                    {
                                        id: 'asistencia',
                                        titulo: 'Asistencia',
                                        ordenable: true,
                                        alinear: 'derecha',
                                        compacta: {
                                            ancho: 'w-14',
                                            titulo: 'Asist.',
                                            celda: (a) => {
                                                const pct = a.attendancePercentage ?? 0;
                                                const minima = academicConfig?.asistenciaMinima ?? 80;
                                                return (
                                                    <span className="flex w-full flex-col items-center gap-1">
                                                        <span className="text-xs font-semibold tabular-nums text-gray-900">{pct}%</span>
                                                        <span className="h-1 w-10 rounded-full bg-gray-200">
                                                            <span
                                                                className={`block h-1 rounded-full ${pct >= minima ? 'bg-green-500' : pct >= minima - 10 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                                style={{ width: `${Math.min(pct, 100)}%` }}
                                                            />
                                                        </span>
                                                    </span>
                                                );
                                            },
                                        },
                                        celda: (a) => (
                                            <span className="inline-flex items-center gap-2">
                                                <span className="text-sm text-gray-900">
                                                    {a.attendancePercentage != null ? `${a.attendancePercentage}%` : '0%'}
                                                </span>
                                                <span className="h-1.5 w-16 rounded-full bg-gray-200">
                                                    <span
                                                        className={`block h-1.5 rounded-full ${(a.attendancePercentage || 0) >= 80 ? 'bg-green-500' : (a.attendancePercentage || 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                        style={{ width: `${Math.min(a.attendancePercentage || 0, 100)}%` }}
                                                    />
                                                </span>
                                            </span>
                                        ),
                                    },
                                    {
                                        id: 'observaciones',
                                        titulo: 'Observaciones',
                                        tituloCorto: 'Obs.',
                                        ordenable: true,
                                        celda: (a) => (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedStudentForObs(a);
                                                }}
                                                className={
                                                    ((a as any).observationsCount || 0) > 0
                                                        ? 'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-800'
                                                        : 'inline-flex min-h-[44px] items-center px-1 text-xs italic text-gray-500'
                                                }
                                            >
                                                {((a as any).observationsCount || 0) > 0 ? (
                                                    <>
                                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                        {(a as any).observationsCount} obs
                                                    </>
                                                ) : (
                                                    'Sin observaciones'
                                                )}
                                            </button>
                                        ),
                                    },
                                    {
                                        id: 'acciones',
                                        titulo: 'Acciones',
                                        acciones: true,
                                        alinear: 'derecha',
                                        celda: (a) => yo?.role !== 'ADMIN' ? null : (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setStudentToRemove({ id: a.id, name: `${a.firstName} ${a.lastName}` });
                                                    setRemoveModalOpen(true);
                                                }}
                                                title="Sacar de la sección"
                                                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Sacar de la sección</span>
                                            </button>
                                        ),
                                    },
                                ]}
                            />
                        </div>

                        {pagination && pagination.totalPages > 1 && (
                            <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
                        )}
                    </div>
                )}

                {/* Materias Tab */}
                {activeTab === 'materias' && (
                    <div className="overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
                        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Materias Asignadas</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    {subjectsWithStats?.length || 0} materia{(subjectsWithStats?.length || 0) !== 1 ? 's' : ''} asignada{(subjectsWithStats?.length || 0) !== 1 ? 's' : ''}
                                </p>
                            </div>
                            {/* Las materias de la sección se deciden en Materias («Dónde se da»), y
                                el profesor en Profesores: aquí solo se ven (Cristian, 18-oct-2026). */}
                            {yo?.role === 'ADMIN' && (
                                <Link
                                    href="/dashboard/materias"
                                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-indigo-50 px-4 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                                >
                                    <BookOpen className="h-4 w-4" aria-hidden />
                                    Cambiar en Materias
                                </Link>
                            )}
                        </div>

                        <div className="p-6">
                            {isLoadingSubjectsStats ? (
                                <div className="text-center py-12">
                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                    <p className="mt-4 text-gray-500">Cargando materias...</p>
                                </div>
                            ) : !subjectsWithStats || subjectsWithStats.length === 0 ? (
                                <div className="text-center py-12">
                                    <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
                                    <h3 className="mt-2 text-sm font-medium text-gray-900">No hay materias asignadas</h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        {yo?.role === 'ADMIN' ? 'Se ponen en Materias, en «Dónde se da».' : 'No tienes materias asignadas en esta sección.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {subjectsWithStats?.map((subject) => (
                                        <SubjectCard
                                            key={subject.id}
                                            id={subject.id}
                                            name={subject.name}
                                            color={subject.color}
                                            code={subject.code}
                                            stats={subject.stats}
                                            teacher={subject.teacher || undefined}
                                            hoursPerWeek={subject.hoursPerWeek}
                                            sectionHref={`/dashboard/academico/${cycleId}/${sectionId}/${(subject as any).slug || subject.id}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Observaciones Tab */}
                {activeTab === 'observaciones' && (
                    <SectionObservationsTab classroomId={classroomId || ''} />
                )}

                {activeTab === 'pendientes' && esGuiaOAdmin && classroomId && <PendientesDeLaSeccion classroomId={classroomId} />}

                {activeTab === 'labor-social' && conLaborSocial && classroomId && <LaborSocialDeLaSeccion classroomId={classroomId} />}
            </div>
        </>
    );
}
