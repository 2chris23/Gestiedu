'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Lista } from '@/components/ui/lista';
import { instituteService } from '@/services/institute.service';
import {
    materiasPendientes,
    REGLAS_DE_PENDIENTES_POR_DEFECTO,
    type MomentoDelCronograma,
    type ReglasDePendientes,
} from '@/lib/materias-pendientes';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * LAS REGLAS Y LAS FECHAS DE LA MATERIA PENDIENTE (Configuración → Académica)
 *
 * Lo del MPPE es lo que sale de primeras: 4 momentos de una semana (octubre,
 * diciembre, enero y junio), cada uno con su 1ª y su 2ª opción, y se aprueba
 * en el momento en que se llega a la nota mínima. Todo se cambia aquí: el
 * Ministerio cambia las reglas y cada liceo trabaja a su manera.
 */
export function ReglasDeLasPendientes() {
    const cola = useQueryClient();
    const { data: config, isLoading } = useQuery({ queryKey: ['reglas-academicas'], queryFn: () => instituteService.getAcademicConfig() });
    const { data: cronograma } = useQuery({ queryKey: ['materias-pendientes', 'cronograma'], queryFn: () => materiasPendientes.cronograma() });

    const [r, setR] = React.useState<ReglasDePendientes | null>(null);
    const [pesos, setPesos] = React.useState<string[]>([]);
    const [fechas, setFechas] = React.useState<MomentoDelCronograma[]>([]);
    React.useEffect(() => {
        if (!config) return;
        const reglas = { ...REGLAS_DE_PENDIENTES_POR_DEFECTO, ...(config.pendientes ?? {}) };
        setR(reglas);
        setPesos(Array.from({ length: reglas.momentos }, (_, i) => String(reglas.pesos?.[i] ?? Math.round(100 / reglas.momentos))));
    }, [config]);
    React.useEffect(() => {
        if (cronograma) setFechas(cronograma.momentos);
    }, [cronograma]);

    const sumaDePesos = pesos.reduce((s, p) => s + (Number(p) || 0), 0);
    const pesosValidos = r?.formaDeCalificar !== 'PONDERADO' || (pesos.length === r.momentos && sumaDePesos === 100);

    const guardarReglas = useMutation({
        mutationFn: () =>
            materiasPendientes.guardarReglas({
                ...r!,
                pesos: r!.formaDeCalificar === 'PONDERADO' ? pesos.map((p) => Number(p) || 0) : undefined,
            }),
        onSuccess: () => {
            toast.success('Reglas de la materia pendiente guardadas');
            void cola.invalidateQueries({ queryKey: ['reglas-academicas'] });
            void cola.invalidateQueries({ queryKey: ['materias-pendientes'] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudieron guardar')),
    });
    const guardarFechas = useMutation({
        mutationFn: () => materiasPendientes.guardarCronograma(cronograma!.cicloId!, fechas),
        onSuccess: () => {
            toast.success('Fechas de los momentos guardadas');
            void cola.invalidateQueries({ queryKey: ['materias-pendientes'] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudieron guardar las fechas')),
    });

    const cambiarMomentos = (n: number) => {
        if (!r) return;
        setR({ ...r, momentos: n });
        setPesos(Array.from({ length: n }, (_, i) => pesos[i] ?? String(Math.round(100 / n))));
    };
    const fecha = (i: number, campo: keyof MomentoDelCronograma, valor: string) =>
        setFechas((prev) => prev.map((m, j) => (j === i ? { ...m, [campo]: valor || null } : m)));

    return (
        <section aria-labelledby="reglas-pendientes" className="border-t border-gray-200 pt-6">
            <h3 id="reglas-pendientes" className="mb-1 text-lg font-medium text-gray-900">
                <ClipboardCheck className="mr-2 inline h-5 w-5" aria-hidden />
                Materia pendiente
            </h3>
            <p className="mb-4 text-sm text-gray-600">
                Cómo se evalúa la materia que un alumno arrastra del año anterior. La evalúa el profesor de la clase de esa materia (Académico → la
                sección → la materia → «Pendientes»).
            </p>
            {isLoading || !r ? (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
                </p>
            ) : (
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="text-sm text-gray-800">
                            <span className="mb-1 block font-medium">Momentos en el año</span>
                            <Lista
                                etiqueta="Momentos en el año"
                                valor={String(r.momentos)}
                                alCambiar={(v) => cambiarMomentos(Number(v))}
                                opciones={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ valor: String(n), texto: `${n} ${n === 1 ? 'momento' : 'momentos'}` }))}
                            />
                        </div>
                        <div className="text-sm text-gray-800">
                            <span className="mb-1 block font-medium">Cómo se aprueba</span>
                            <Lista
                                etiqueta="Cómo se aprueba"
                                valor={r.formaDeCalificar}
                                alCambiar={(v) => setR({ ...r, formaDeCalificar: v as ReglasDePendientes['formaDeCalificar'] })}
                                opciones={[
                                    { valor: 'MOMENTO_APROBADO', texto: 'En el momento en que llega a la nota mínima' },
                                    { valor: 'PROMEDIO', texto: 'Con el promedio de todos los momentos' },
                                    { valor: 'PONDERADO', texto: 'Con un peso para cada momento' },
                                ]}
                            />
                        </div>
                        {r.formaDeCalificar === 'PONDERADO' && (
                            <fieldset className="text-sm text-gray-800 md:col-span-2">
                                <legend className="mb-1 font-medium">Peso de cada momento (suman 100 %)</legend>
                                <div className="flex flex-wrap gap-3">
                                    {pesos.map((p, i) => (
                                        <label key={i} className="flex items-center gap-2">
                                            {i + 1}º
                                            <input
                                                inputMode="numeric"
                                                aria-label={`Peso del momento ${i + 1}`}
                                                value={p}
                                                onChange={(e) => setPesos(pesos.map((x, j) => (j === i ? e.target.value.replace(/[^\d]/g, '') : x)))}
                                                className="min-h-[44px] w-16 rounded-lg border border-gray-300 px-2 text-right tabular-nums"
                                            />
                                            %
                                        </label>
                                    ))}
                                </div>
                                {!pesosValidos && <p className="mt-1 text-xs text-rose-700">Suman {sumaDePesos} %: tienen que sumar 100.</p>}
                            </fieldset>
                        )}
                        <div className="text-sm text-gray-800">
                            <span className="mb-1 block font-medium">2ª opción de cada momento (el «112»)</span>
                            <Lista
                                etiqueta="Segunda opción"
                                valor={r.segundaOpcion}
                                alCambiar={(v) => setR({ ...r, segundaOpcion: v as ReglasDePendientes['segundaOpcion'] })}
                                opciones={[
                                    { valor: 'SIEMPRE', texto: 'Siempre, a quien reprueba la 1ª' },
                                    { valor: 'SI_REPRUEBA_30', texto: 'Solo si el 30 % o más reprueba la 1ª' },
                                    { valor: 'NO', texto: 'No hay 2ª opción' },
                                ]}
                            />
                        </div>
                        <div className="text-sm text-gray-800">
                            <span className="mb-1 block font-medium">Asistencia</span>
                            <Lista
                                etiqueta="Asistencia"
                                valor={r.asistencia}
                                alCambiar={(v) => setR({ ...r, asistencia: v as ReglasDePendientes['asistencia'] })}
                                opciones={[
                                    { valor: 'SOLO_EVALUACIONES', texto: 'Solo a las evaluaciones (lo del Reglamento)' },
                                    { valor: 'OBLIGATORIA', texto: 'También a las tutorías' },
                                    { valor: 'NO', texto: 'No se lleva' },
                                ]}
                            />
                        </div>
                        <label className="flex min-h-[44px] items-center gap-3 text-sm text-gray-800 md:col-span-2">
                            <Checkbox
                                checked={r.faltarPierdeElMomento}
                                onCheckedChange={(v) => setR({ ...r, faltarPierdeElMomento: v === true })}
                                aria-label="Faltar sin justificar hace perder la opción"
                            />
                            Faltar sin justificar cuenta como presentada sin nota («IN»)
                        </label>
                    </div>
                    <button
                        type="button"
                        onClick={() => guardarReglas.mutate()}
                        disabled={guardarReglas.isPending || !pesosValidos}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {guardarReglas.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar las reglas
                    </button>

                    {cronograma?.cicloId && (
                        <fieldset className="space-y-3">
                            <legend className="text-sm font-medium text-gray-900">
                                Fechas de los momentos · {cronograma.ciclo ?? 'año en curso'}
                                {cronograma.propuesto && <span className="ml-1 font-normal text-gray-600">(propuestas con el calendario del MPPE)</span>}
                            </legend>
                            <div className="grid gap-3 md:grid-cols-2">
                                {fechas.slice(0, r.momentos).map((m, i) => (
                                    <div key={m.numero} className="rounded-xl border border-gray-200 p-3 text-sm">
                                        <p className="mb-2 font-semibold text-gray-900">{m.numero}º momento</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="text-xs font-medium text-gray-700">
                                                1ª opción, desde
                                                <input type="date" value={m.desde1} onChange={(e) => fecha(i, 'desde1', e.target.value)} className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-2 text-sm" />
                                            </label>
                                            <label className="text-xs font-medium text-gray-700">
                                                hasta
                                                <input type="date" value={m.hasta1} onChange={(e) => fecha(i, 'hasta1', e.target.value)} className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-2 text-sm" />
                                            </label>
                                            {r.segundaOpcion !== 'NO' && (
                                                <>
                                                    <label className="text-xs font-medium text-gray-700">
                                                        2ª opción, desde
                                                        <input
                                                            type="date"
                                                            value={m.desde2 ?? ''}
                                                            onChange={(e) => fecha(i, 'desde2', e.target.value)}
                                                            className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-2 text-sm"
                                                        />
                                                    </label>
                                                    <label className="text-xs font-medium text-gray-700">
                                                        hasta
                                                        <input
                                                            type="date"
                                                            value={m.hasta2 ?? ''}
                                                            onChange={(e) => fecha(i, 'hasta2', e.target.value)}
                                                            className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-2 text-sm"
                                                        />
                                                    </label>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {fechas.length < r.momentos && (
                                <p className="text-xs text-gray-600">Guarda las reglas para ver las fechas de los momentos nuevos.</p>
                            )}
                            <button
                                type="button"
                                onClick={() => guardarFechas.mutate()}
                                disabled={guardarFechas.isPending}
                                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-indigo-200 px-4 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                            >
                                {guardarFechas.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar las fechas
                            </button>
                        </fieldset>
                    )}
                </div>
            )}
        </section>
    );
}

export default ReglasDeLasPendientes;
