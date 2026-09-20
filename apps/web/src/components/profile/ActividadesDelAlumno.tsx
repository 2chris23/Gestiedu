'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2 } from 'lucide-react';
import {
    ActividadDelAlumno,
    ESTADO_DE_ACTIVIDAD,
    EstadoDeActividad,
    useActividadesDelAlumno,
} from '@/hooks/useActividadesDelAlumno';
import { cn } from '@/lib/utils';

/**
 * QUÉ LE FALTA Y QUÉ YA LE EVALUARON
 *
 * Antes el perfil decía «0 materias reprobadas» y nada más: no había forma de
 * saber *qué* tiene pendiente un alumno. Aquí están, una por una, con su
 * materia y su fecha.
 *
 * El sistema no recibe entregas —el alumno no sube nada—, así que lo que consta
 * es la nota del profesor. Por eso se dice «Con nota» y no «Entregada»: no se
 * promete un dato que nadie registra.
 */

type Filtro = 'PENDIENTES' | 'VENCIDAS' | 'EVALUADAS' | 'TODAS';

const fechaLegible = (iso: string | null) => {
    if (!iso) return 'Sin fecha';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
};

function Fila({ a }: { a: ActividadDelAlumno }) {
    const estado = ESTADO_DE_ACTIVIDAD[a.estado];
    return (
        <li className="flex items-start gap-3 px-4 py-3">
            <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: a.subject.color || '#6366f1' }}
                aria-hidden
            />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900">{a.title}</p>
                <p className="mt-0.5 text-xs text-gray-700">
                    {a.subject.name}
                    {a.tag ? ` · ${a.tag}` : ''} · {fechaLegible(a.fecha)}
                </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', estado.clases)}>
                    {estado.texto}
                </span>
                {a.estado === 'EVALUADA' && (
                    <span className="text-xs font-bold text-gray-900">
                        {a.nota} / {a.maxScore ?? 20}
                    </span>
                )}
            </div>
        </li>
    );
}

export function ActividadesDelAlumno({
    studentId,
    academicYearId,
    titulo = 'Actividades',
}: {
    studentId?: string | null;
    academicYearId?: string;
    titulo?: string;
}) {
    const { data, isLoading, error } = useActividadesDelAlumno(studentId, academicYearId);
    const [filtro, setFiltro] = React.useState<Filtro | null>(null);

    /**
     * Se abre por la pestaña que TIENE algo. Si no hay nada pendiente pero sí
     * cosas cuya fecha se pasó, empezar en "Pendientes (0)" era abrir en una
     * lista vacía teniendo cinco cosas que enseñar al lado.
     */
    const porDefecto: Filtro = !data
        ? 'PENDIENTES'
        : data.resumen.pendientes > 0
          ? 'PENDIENTES'
          : data.resumen.vencidas > 0
            ? 'VENCIDAS'
            : 'EVALUADAS';
    const filtroActivo: Filtro = filtro ?? porDefecto;

    if (!studentId) return null;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-8">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (error || !data) {
        return null;
    }

    const { resumen, actividades } = data;
    const porEstado: Record<Filtro, EstadoDeActividad | null> = {
        PENDIENTES: 'PENDIENTE',
        VENCIDAS: 'VENCIDA',
        EVALUADAS: 'EVALUADA',
        TODAS: null,
    };
    const visibles = actividades.filter((a) => {
        const e = porEstado[filtroActivo];
        return e === null || a.estado === e;
    });

    const pestanas: Array<{ clave: Filtro; texto: string; cuantas: number }> = [
        { clave: 'PENDIENTES', texto: 'Pendientes', cuantas: resumen.pendientes },
        { clave: 'VENCIDAS', texto: 'Se pasó la fecha', cuantas: resumen.vencidas },
        { clave: 'EVALUADAS', texto: 'Con nota', cuantas: resumen.evaluadas },
        { clave: 'TODAS', texto: 'Todas', cuantas: actividades.length },
    ];

    return (
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <header className="border-b border-gray-100 px-5 py-4">
                <div className="flex items-center gap-2">
                    <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700">
                        <ClipboardList size={18} />
                    </div>
                    <h3 className="text-base font-bold text-gray-900">{titulo}</h3>
                </div>

                {resumen.vencidas > 0 ? (
                    <p className="mt-3 flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
                        <AlertTriangle size={16} className="shrink-0" />
                        {resumen.vencidas === 1
                            ? 'Hay 1 actividad sin nota cuya fecha ya pasó'
                            : `Hay ${resumen.vencidas} actividades sin nota cuya fecha ya pasó`}
                    </p>
                ) : resumen.pendientes === 0 ? (
                    <p className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
                        <CheckCircle2 size={16} className="shrink-0" /> No queda nada pendiente
                    </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-1.5">
                    {pestanas.map((p) => (
                        <button
                            key={p.clave}
                            type="button"
                            onClick={() => setFiltro(p.clave)}
                            aria-pressed={filtroActivo === p.clave}
                            className={cn(
                                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                                filtroActivo === p.clave
                                    ? 'border-indigo-600 bg-indigo-600 text-white'
                                    : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                            )}
                        >
                            {p.texto} ({p.cuantas})
                        </button>
                    ))}
                </div>
            </header>

            {visibles.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-700">Nada en esta lista.</p>
            ) : (
                <ul className="max-h-[26rem] divide-y divide-gray-100 overflow-y-auto">
                    {visibles.map((a) => (
                        <Fila key={a.id} a={a} />
                    ))}
                </ul>
            )}
        </section>
    );
}

export default ActividadesDelAlumno;
