'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, BookOpen, ChevronRight, LayoutGrid, UserPen, UserPlus, UserX, UsersRound } from 'lucide-react';
import { useSubject } from '@/hooks/useSubjects';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { CabezaDeLaClase, PartesDeLaPantalla } from '@/components/academic/CabezaDeLaClase';
import { CifrasDeLosGrupos, PestanaDeGrupos, PestanaSinGrupo } from '@/components/subject/GruposDeLaMateria';
import { ElegirCiclo } from '@/components/subject/ElegirCiclo';
import { AssignSubjectTeacherModal } from '@/components/subject/AssignSubjectTeacherModal';
import UserAvatar from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';

interface Seccion {
    id: string;
    name: string;
    slug?: string;
    grade?: number;
    weeklyBlocks?: number;
    hoursPerWeek?: number;
    teacher?: { id?: string; name: string; avatar?: string | null } | null;
    average: number;
}

interface Docente {
    id: string;
    name: string;
    avatar?: string | null;
    sectionsCount: number;
    subjectWeeklyHours?: number;
    subjectWeeklyBlocks?: number;
    average?: number;
    attendance?: number | null;
}

const NOMBRE_DEL_ANO: Record<number, string> = { 1: 'Primer año', 2: 'Segundo año', 3: 'Tercer año', 4: 'Cuarto año', 5: 'Quinto año' };
const horas = (n: number) => `${Math.round(n * 10) / 10}`.replace('.', ',');

/** El color de un promedio: verde con 15 o más, rojo por debajo de 10. */
const colorDelPromedio = (p: number) => (p <= 0 ? 'text-gray-500' : p >= 15 ? 'text-emerald-700' : p < 10 ? 'text-red-600' : 'text-amber-700');

/**
 * UNA MATERIA DEL CATÁLOGO
 *
 * Rediseño pedido por Cristian (18-oct-2026), con las piezas de la sección:
 * la cabecera en una línea (la flecha, el nombre, el año en gris y el año a
 * la derecha), tres cifras en una caja, las secciones por año como filas de
 * Movimientos (el profesor sin el correo, las horas y el promedio) y el
 * equipo docente con el promedio y la asistencia de cada uno en la materia.
 * Sin el número de estudiantes ni «Gestionar equipo» (no hacía nada).
 */
export default function SubjectDashboard() {
    const params = useParams();
    const router = useRouter();
    const subjectId = params.subjectId as string;
    const cycleName = params.cycleId as string;
    const [asignando, setAsignando] = useState<Seccion | null>(null);
    const [parte, setParte] = useState<'secciones' | 'grupos' | 'sin-grupo'>('secciones');

    const { data: subject, isLoading, error } = useSubject(subjectId, cycleName);
    // El año no detiene la pantalla: solo hace falta para el selector.
    const { data: academicYears } = useAcademicYears();
    const ciclos = useMemo(() => (academicYears ?? []).map((y) => ({ id: y.id, name: y.name, status: y.status })), [academicYears]);
    const cicloActual = ciclos.find((c) => c.name === cycleName)?.id ?? '';

    const secciones: Seccion[] = useMemo(() => subject?.sections ?? [], [subject]);
    const docentes: Docente[] = subject?.teachers ?? [];

    const porAno = useMemo(() => {
        const grupos = new Map<number, Seccion[]>();
        for (const s of secciones) {
            const ano = s.grade || Number(s.name.match(/\d+/)?.[0] ?? 1);
            grupos.set(ano, [...(grupos.get(ano) ?? []), s]);
        }
        return [...grupos.entries()].sort(([a], [b]) => a - b).map(([ano, lista]) => [ano, lista.sort((x, y) => x.name.localeCompare(y.name))] as const);
    }, [secciones]);

    if (isLoading) return <EsqueletoDeLaMateria />;

    if (error || !subject) {
        return (
            <div className="mx-auto max-w-md rounded-[24px] bg-white p-6 text-center ring-1 ring-gray-200">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                    <AlertCircle className="h-6 w-6" aria-hidden />
                </span>
                <h1 className="mt-3 text-lg font-bold text-gray-900">Materia no encontrada</h1>
                <Link
                    href="/dashboard/materias"
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    <BookOpen className="h-4 w-4" aria-hidden /> Volver a las materias
                </Link>
            </div>
        );
    }

    const anoId: string = subject.academicYear?.id ?? cicloActual;
    const conPromedio = secciones.filter((s) => s.average > 0);
    const promedio = conPromedio.length ? Math.round((conPromedio.reduce((t, s) => t + s.average, 0) / conPromedio.length) * 10) / 10 : 0;
    const aprobacion = conPromedio.length ? Math.round((conPromedio.filter((s) => s.average >= 10).length / conPromedio.length) * 100) : 0;

    // La clase de esa sección (la misma dirección que Académico).
    const aLaClase = (s: Seccion) =>
        `/dashboard/academico/${cycleName}/${cycleName && s.slug?.endsWith(`-${cycleName}`) ? s.slug.slice(0, -(cycleName.length + 1)) : s.slug || s.id}/${subjectId}`;

    return (
        <div className="space-y-5">
            <CabezaDeLaClase
                volverA="/dashboard/materias"
                rotuloVolver="Volver a las materias"
                titulo={subject.name}
                subtitulo={`${secciones.length} ${secciones.length === 1 ? 'sección' : 'secciones'}`}
            >
                <ElegirCiclo
                    ciclos={ciclos}
                    valor={cicloActual}
                    alCambiar={(id) => {
                        const nombre = ciclos.find((c) => c.id === id)?.name;
                        if (nombre) router.push(`/dashboard/materias/${nombre}/${subjectId}`);
                    }}
                />
            </CabezaDeLaClase>

            {/* Tres cifras en una caja, como las de la sección. */}
            {subject.porGrupos && anoId ? (
                <CifrasDeLosGrupos subjectId={subject.id} academicYearId={anoId} secciones={secciones.length} />
            ) : (
            <dl className="grid grid-cols-3 divide-x divide-gray-100 rounded-[24px] bg-white py-4 ring-1 ring-gray-200">
                <div className="px-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">Promedio</dt>
                    <dd className={cn('mt-0.5 text-2xl font-bold tabular-nums', colorDelPromedio(promedio))}>
                        {promedio > 0 ? promedio.toFixed(1) : '—'}
                        <span className="text-sm font-semibold text-gray-500"> /20</span>
                    </dd>
                </div>
                <div className="px-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">Aprobación</dt>
                    <dd className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">{conPromedio.length ? `${aprobacion}%` : '—'}</dd>
                </div>
                <div className="px-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">Secciones</dt>
                    <dd className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">{secciones.length}</dd>
                </div>
            </dl>
            )}

            {/* Una columna en el teléfono (sin `grid-cols-1` la columna se estiraba
                al ancho de la fila más larga y la página se salía de lado). */}
            {/* La materia por grupos (los grupos estables): sus grupos y quién está sin uno. */}
            {subject.porGrupos && (
                <PartesDeLaPantalla
                    etiqueta="Partes de la materia"
                    activa={parte}
                    alElegir={(id) => setParte(id as typeof parte)}
                    partes={[
                        { id: 'secciones', nombre: 'Secciones', icono: LayoutGrid },
                        { id: 'grupos', nombre: 'Grupos', icono: UsersRound },
                        { id: 'sin-grupo', nombre: 'Sin grupo', icono: UserX },
                    ]}
                />
            )}
            {subject.porGrupos && parte === 'grupos' && anoId && <PestanaDeGrupos subjectId={subject.id} academicYearId={anoId} />}
            {subject.porGrupos && parte === 'sin-grupo' && anoId && <PestanaSinGrupo subjectId={subject.id} academicYearId={anoId} />}

            {(!subject.porGrupos || parte === 'secciones') && (
            <div className="grid grid-cols-1 gap-5 lateral:grid-cols-3">
                {/* Las secciones, por año. */}
                <div className={cn('min-w-0 space-y-4', subject.porGrupos ? 'lateral:col-span-3' : 'lateral:col-span-2')}>
                    {porAno.length === 0 && (
                        <p className="rounded-[24px] bg-white px-4 py-8 text-center text-sm text-gray-600 ring-1 ring-gray-200">
                            Ninguna sección da esta materia en {cycleName}.
                        </p>
                    )}
                    {porAno.map(([ano, lista]) => {
                        // Por grupos, la sección no lleva profesor: lo lleva cada grupo.
                        const conProfesor = subject.porGrupos ? lista.length : lista.filter((s) => s.teacher).length;
                        return (
                            <section key={ano} aria-label={NOMBRE_DEL_ANO[ano] ?? `${ano}.º año`}>
                                <div className="flex items-baseline justify-between px-1">
                                    <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{NOMBRE_DEL_ANO[ano] ?? `${ano}.º año`}</h2>
                                    <span className={cn('text-xs font-semibold', conProfesor === lista.length ? 'text-gray-600' : 'text-amber-800')}>
                                        {conProfesor === lista.length ? `${lista.length} ${lista.length === 1 ? 'sección' : 'secciones'}` : `${lista.length - conProfesor} sin profesor`}
                                    </span>
                                </div>
                                <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
                                    {lista.map((s) => {
                                        const h = s.hoursPerWeek ?? ((s.weeklyBlocks ?? 4) * 45) / 60;
                                        return (
                                            <li key={s.id} className="flex items-center">
                                                <Link
                                                    href={aLaClase(s)}
                                                    className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50"
                                                >
                                                    {subject.porGrupos ? (
                                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
                                                            <UsersRound className="h-5 w-5" aria-hidden />
                                                        </span>
                                                    ) : s.teacher ? (
                                                        <UserAvatar name={s.teacher.name} src={s.teacher.avatar} className="h-10 w-10 shrink-0" initialsClassName="text-xs" />
                                                    ) : (
                                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                                                            <AlertCircle className="h-5 w-5" aria-hidden />
                                                        </span>
                                                    )}
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[15px] font-medium text-gray-900">{s.name}</span>
                                                        <span className={cn('block truncate text-sm', s.teacher || subject.porGrupos ? 'text-gray-600' : 'font-medium text-amber-800')}>
                                                            {subject.porGrupos ? 'Por grupos' : s.teacher ? s.teacher.name : 'Sin profesor'} · {horas(h)} h/sem
                                                        </span>
                                                    </span>
                                                    <span className={cn('shrink-0 text-[15px] font-bold tabular-nums', colorDelPromedio(s.average))}>
                                                        {s.average > 0 ? s.average.toFixed(1) : '—'}
                                                    </span>
                                                    <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                                                </Link>
                                                {!subject.porGrupos && (
                                                <button
                                                    type="button"
                                                    onClick={() => setAsignando(s)}
                                                    aria-label={`${s.teacher ? 'Cambiar' : 'Asignar'} profesor de ${s.name}`}
                                                    title={s.teacher ? 'Cambiar profesor' : 'Asignar profesor'}
                                                    className={cn(
                                                        'mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors',
                                                        s.teacher ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-800' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                    )}
                                                >
                                                    {s.teacher ? <UserPen className="h-5 w-5" aria-hidden /> : <UserPlus className="h-5 w-5" aria-hidden />}
                                                </button>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        );
                    })}
                </div>

                {/* El equipo: cada profesor con su promedio y su asistencia en esta materia. */}
                {/* En el teléfono va antes que las secciones: son cuatro filas, no veinte.
                    Por grupos, el equipo son los profesores de los grupos (pestaña Grupos). */}
                {!subject.porGrupos && (
                <section aria-label="Equipo docente" className="order-first min-w-0 lateral:sticky lateral:top-6 lateral:order-none lateral:self-start">
                    <div className="flex items-baseline justify-between px-1">
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Equipo docente</h2>
                        <span className="text-xs font-semibold text-gray-600">
                            {docentes.length} {docentes.length === 1 ? 'profesor' : 'profesores'}
                        </span>
                    </div>
                    {docentes.length === 0 ? (
                        <p className="mt-2 rounded-[24px] bg-white px-4 py-6 text-center text-sm text-gray-600 ring-1 ring-gray-200">Nadie da esta materia todavía.</p>
                    ) : (
                        <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
                            {docentes.map((d) => {
                                const h = d.subjectWeeklyHours ?? ((d.subjectWeeklyBlocks ?? d.sectionsCount * 4) * 45) / 60;
                                const prom = d.average ?? 0;
                                return (
                                    <li key={d.id} className="flex min-h-[64px] items-center gap-3 px-4 py-2.5">
                                        <UserAvatar name={d.name} src={d.avatar} className="h-10 w-10 shrink-0" initialsClassName="text-xs" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[15px] font-medium text-gray-900">{d.name}</span>
                                            <span className="block truncate text-sm text-gray-600">
                                                {d.sectionsCount} {d.sectionsCount === 1 ? 'sección' : 'secciones'} · {horas(h)} h/sem
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-right">
                                            <span className={cn('block text-[15px] font-bold tabular-nums', colorDelPromedio(prom))} title="Promedio en la materia">
                                                {prom > 0 ? prom.toFixed(1) : '—'}
                                            </span>
                                            <span className="block text-xs text-gray-600" title="Asistencia de sus secciones">
                                                {d.attendance != null ? `${d.attendance}% asist.` : 'sin asist.'}
                                            </span>
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
                )}
            </div>
            )}

            {asignando && (
                <AssignSubjectTeacherModal
                    sectionId={asignando.id}
                    sectionName={asignando.name}
                    subjectSlug={subjectId}
                    currentTeacherId={asignando.teacher?.id}
                    initialWeeklyBlocks={asignando.weeklyBlocks}
                    onClose={() => setAsignando(null)}
                />
            )}
        </div>
    );
}

/** Mientras llega la materia: la forma de la pantalla, no una rueda en el medio. */
function EsqueletoDeLaMateria() {
    const barra = 'animate-pulse rounded-full bg-gray-200';
    return (
        <div className="space-y-5" aria-busy="true" aria-label="Cargando la materia">
            <div className="flex items-center gap-3">
                <span className="h-11 w-11" />
                <div className="flex-1 space-y-2">
                    <div className={cn(barra, 'h-6 w-48')} />
                    <div className={cn(barra, 'h-3 w-32')} />
                </div>
                <div className={cn(barra, 'h-11 w-28')} />
            </div>
            <div className="h-[88px] animate-pulse rounded-[24px] bg-white ring-1 ring-gray-200" />
            <div className="grid gap-5 lateral:grid-cols-3">
                <div className="space-y-2 lateral:col-span-2">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="h-16 animate-pulse rounded-[20px] bg-white ring-1 ring-gray-200" />
                    ))}
                </div>
                <div className="h-64 animate-pulse rounded-[24px] bg-white ring-1 ring-gray-200" />
            </div>
        </div>
    );
}
