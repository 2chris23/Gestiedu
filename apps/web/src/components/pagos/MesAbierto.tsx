'use client';

import * as React from 'react';
import { CalendarDays, ChevronDown, ChevronRight, X } from 'lucide-react';
import { nombreDelMes, porcentaje } from '@/lib/calendario-del-ciclo';
import { MesEnDias } from '@/components/pagos/MesEnDias';
import { FilaDeAlumno, VerMas } from '@/components/pagos/listas-de-finanzas';
import { cn } from '@/lib/utils';

/**
 * UN MES ABIERTO (2026-10-14)
 *
 * Al tocar un mes salían su calendario y, debajo, los 598 que debían, uno
 * tras otro: «una lista interminable» (Cristian). Ahora, una línea con lo del
 * mes y quién debe **por sección** (unas veinte filas); al tocar una, solo sus
 * alumnos. Un buscador para ir directo a alguien, y los días detrás de «Por
 * días», que es lo que menos se mira.
 */

export interface DeudorDelMes {
    id: string;
    nombre: string;
    seccion: string;
    seccionId: string;
    avatar: string | null;
}

export function MesAbierto({
    ciclo,
    mes,
    esperado,
    cobrado,
    deudores,
    dinero,
    alAbrirAlumno,
    alCerrar,
}: {
    ciclo: string | null;
    mes: string;
    esperado: number;
    cobrado: number;
    deudores: DeudorDelMes[];
    dinero: (n: number | string) => string;
    alAbrirAlumno: (id: string) => void;
    alCerrar: () => void;
}) {
    const [seccion, setSeccion] = React.useState<string | null>(null);
    const [busqueda, setBusqueda] = React.useState('');
    const [porDias, setPorDias] = React.useState(false);
    React.useEffect(() => {
        setSeccion(null);
        setBusqueda('');
        setPorDias(false);
    }, [mes]);

    const porSeccion = React.useMemo(() => {
        const m = new Map<string, { id: string; nombre: string; alumnos: DeudorDelMes[] }>();
        for (const d of deudores) {
            const s = m.get(d.seccionId) ?? { id: d.seccionId, nombre: d.seccion, alumnos: [] };
            s.alumnos.push(d);
            m.set(d.seccionId, s);
        }
        return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
    }, [deudores]);

    const q = busqueda.trim().toLowerCase();
    const encontrados = q ? deudores.filter((d) => d.nombre.toLowerCase().includes(q)) : [];
    const pct = porcentaje(cobrado, esperado);

    return (
        <section aria-labelledby="mes-abierto" className="overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
            <header className="flex items-start gap-3 px-4 pb-3 pt-4">
                <div className="min-w-0 flex-1">
                    <h3 id="mes-abierto" className="text-lg font-bold text-gray-900">
                        {nombreDelMes(mes)}
                    </h3>
                    <p className="text-sm text-gray-600">
                        {dinero(cobrado)} de {dinero(esperado)} · {pct} %
                    </p>
                </div>
                <button
                    type="button"
                    onClick={alCerrar}
                    aria-label="Cerrar el mes"
                    className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
                >
                    <X className="h-5 w-5" aria-hidden />
                </button>
            </header>

            {deudores.length > 0 ? (
                <>
                    <div className="px-4 pb-2">
                        <h4 className="text-sm font-semibold text-red-700">
                            {deudores.length} {deudores.length === 1 ? 'debe' : 'deben'}
                        </h4>
                        <input
                            type="search"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder={`Buscar en ${nombreDelMes(mes).split(' ')[0].toLowerCase()}`}
                            aria-label="Buscar entre los que deben del mes"
                            className="mt-2 min-h-[44px] w-full rounded-full bg-gray-100 px-4 text-sm text-gray-900 outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    {q ? (
                        <VerMas cosas={encontrados} vacio={`Nadie con «${busqueda.trim()}».`}>
                            {(d) => <FilaDeAlumno key={d.id} nombre={d.nombre} detalle={d.seccion} avatar={d.avatar} alTocar={() => alAbrirAlumno(d.id)} />}
                        </VerMas>
                    ) : (
                        <ul aria-label="Deben, por sección" className="divide-y divide-gray-100 border-t border-gray-100">
                            {porSeccion.map((s) => {
                                const abierta = seccion === s.id;
                                return (
                                    <li key={s.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSeccion(abierta ? null : s.id)}
                                            aria-expanded={abierta}
                                            className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left active:bg-gray-50"
                                        >
                                            <span className="min-w-0 flex-1 text-[15px] font-medium text-gray-900">{s.nombre}</span>
                                            <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">{s.alumnos.length} deben</span>
                                            <ChevronDown className={cn('h-5 w-5 shrink-0 text-gray-500 transition-transform', abierta && 'rotate-180')} aria-hidden />
                                        </button>
                                        {abierta && (
                                            <ul className="bg-gray-50/70 pb-1">
                                                {s.alumnos.map((d) => (
                                                    <FilaDeAlumno key={d.id} nombre={d.nombre} avatar={d.avatar} alTocar={() => alAbrirAlumno(d.id)} />
                                                ))}
                                            </ul>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            ) : (
                <p className="px-4 pb-4 text-sm font-medium text-emerald-700">Nadie debe de este mes.</p>
            )}

            <button
                type="button"
                onClick={() => setPorDias((v) => !v)}
                aria-expanded={porDias}
                className="flex min-h-[52px] w-full items-center gap-3 border-t border-gray-100 px-4 text-left text-[15px] text-gray-900 active:bg-gray-50"
            >
                <CalendarDays className="h-5 w-5 text-gray-700" aria-hidden />
                <span className="flex-1">Por días</span>
                <ChevronRight className={cn('h-5 w-5 text-gray-500 transition-transform', porDias && 'rotate-90')} aria-hidden />
            </button>
            {porDias && (
                <div className="border-t border-gray-100 p-3">
                    <MesEnDias ciclo={ciclo} mes={mes} dinero={dinero} alAbrirAlumno={alAbrirAlumno} />
                </div>
            )}
        </section>
    );
}

export default MesAbierto;
