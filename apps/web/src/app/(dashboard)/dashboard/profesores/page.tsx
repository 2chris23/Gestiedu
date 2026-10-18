'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Search } from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';
import { VerMas } from '@/components/pagos/listas-de-finanzas';
import { ClasesSinProfesor } from '@/components/profesores/ClasesSinProfesor';
import { AssignSubjectTeacherModal } from '@/components/subject/AssignSubjectTeacherModal';
import { BarraDeCarga, colorDeLaCarga, horas } from '@/lib/carga-horaria';
import { useProfesores, type ClaseSinProfesor } from '@/lib/profesores';
import { cn } from '@/lib/utils';

const ORDEN = { SOBRECARGA: 0, POR_DEBAJO: 1, EN_RANGO: 1 } as const;
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * LOS PROFESORES (solo el admin)
 *
 * Pedido por Cristian (18-oct-2026): «no sé cuántas horas lleva el profesor y
 * en qué secciones con qué materia». Cada profesor en una fila con su barra de
 * horas frente a las de su cargo (o el máximo del liceo), su promedio y sus
 * clases; los que se pasan, primero. Arriba, las clases que siguen sin
 * profesor. La carga es una sola cuenta (`personal.service`, MAPA §1e).
 */
export default function ProfesoresPage() {
    const { data, isLoading } = useProfesores();
    const [buscar, setBuscar] = useState('');
    const [verSinProfesor, setVerSinProfesor] = useState(false);
    const [asignando, setAsignando] = useState<ClaseSinProfesor | null>(null);

    const lista = useMemo(() => {
        const q = sinAcentos(buscar.trim());
        return (data?.profesores ?? [])
            .filter((p) => !q || sinAcentos(p.nombre).includes(q))
            .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.nombre.localeCompare(b.nombre, 'es'));
    }, [data, buscar]);

    if (isLoading || !data) return <EsqueletoDeProfesores />;

    const total = data.profesores.length;
    return (
        <div className="space-y-4">
            <header className="flex items-center gap-2">
                <div className="min-w-0 flex-1" data-recorrido="pantalla">
                    <h1 className="truncate text-seccion font-bold text-gray-900 sm:text-pantalla">Profesores</h1>
                    <p className="truncate text-xs font-medium text-gray-600 sm:text-sm">
                        {total} {total === 1 ? 'profesor' : 'profesores'}
                    </p>
                </div>
            </header>

            {data.clasesSinProfesor > 0 && (
                <button
                    type="button"
                    onClick={() => setVerSinProfesor(true)}
                    className="flex min-h-[60px] w-full items-center gap-3 rounded-[24px] bg-amber-50 px-4 py-2.5 text-left ring-1 ring-amber-200 transition-colors hover:bg-amber-100"
                >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                        <AlertTriangle className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-amber-900">
                            {data.clasesSinProfesor} {data.clasesSinProfesor === 1 ? 'clase sin profesor' : 'clases sin profesor'}
                        </span>
                        <span className="block text-sm text-amber-900/80">Tócala para asignarles uno</span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-amber-800" aria-hidden />
                </button>
            )}

            <label className="relative block">
                <span className="sr-only">Buscar profesor</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
                <input
                    type="search"
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    placeholder="Buscar profesor"
                    className="!h-11 w-full !rounded-full !border-gray-200 !bg-white pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-500 focus:!border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
            </label>

            <div className="overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
                <VerMas cosas={lista} etiqueta="Profesores" vacio={buscar ? 'Ningún profesor se llama así.' : 'No hay profesores todavía.'}>
                    {(p) => {
                        const color = colorDeLaCarga(p.estado);
                        return (
                            <li key={p.id}>
                                <Link href={`/dashboard/profesores/${encodeURIComponent(p.id)}`} className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50">
                                    <UserAvatar name={p.nombre} src={p.avatar} className="h-11 w-11 shrink-0" initialsClassName="text-sm" />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline justify-between gap-2">
                                            <span className="truncate text-[15px] font-medium text-gray-900">{p.nombre}</span>
                                            <span className={cn('shrink-0 text-sm font-semibold tabular-nums', color.texto)}>
                                                {horas(p.horas)} / {p.cargo} h
                                            </span>
                                        </span>
                                        <BarraDeCarga total={p.horas} cargo={p.cargo} estado={p.estado} className="my-1.5" />
                                        <span className="block truncate text-sm text-gray-600">
                                            {p.promedio !== null ? `Prom. ${horas(p.promedio)}` : 'Sin notas'} · {p.clases} {p.clases === 1 ? 'clase' : 'clases'}
                                            {p.sinHoras > 0 && ` · ${p.sinHoras} sin horas`}
                                        </span>
                                    </span>
                                    <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                                </Link>
                            </li>
                        );
                    }}
                </VerMas>
            </div>

            {verSinProfesor && (
                <ClasesSinProfesor
                    alCerrar={() => setVerSinProfesor(false)}
                    alElegir={(c) => {
                        setVerSinProfesor(false);
                        setAsignando(c);
                    }}
                />
            )}
            {asignando && (
                <AssignSubjectTeacherModal
                    sectionId={asignando.classroomId}
                    sectionName={`${asignando.materia} · ${asignando.seccion}`}
                    subjectSlug={asignando.subjectId}
                    initialWeeklyBlocks={asignando.bloques ?? undefined}
                    turno={asignando.turno}
                    onClose={() => setAsignando(null)}
                />
            )}
        </div>
    );
}

function EsqueletoDeProfesores() {
    return (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando los profesores">
            <div className="h-12 w-48 rounded-full bg-gray-200/70" />
            <div className="h-11 rounded-full bg-gray-200/70" />
            <div className="divide-y divide-gray-100 overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-4">
                        <div className="h-11 w-11 rounded-full bg-gray-200/70" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 w-2/5 rounded-full bg-gray-200/70" />
                            <div className="h-1.5 w-full rounded-full bg-gray-100" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
