'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardCheck } from 'lucide-react';
import { BotonGuardar, CargandoAjustes, EN_LA_FILA, Fila, FilaInterruptor, Grupo } from '@/components/configuracion/ajustes';
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

    if (isLoading || !r) return <CargandoAjustes />;

    return (
        <div className="space-y-4">
            <Grupo
                id="reglas-pendientes"
                titulo="Materia pendiente"
                descripcion="Cómo se evalúa la materia que un alumno arrastra del año anterior. La evalúa el profesor de esa materia (Académico → la sección → la materia → «Pendientes»)."
                pie={r.formaDeCalificar === 'PONDERADO' && !pesosValidos ? <span className="text-rose-700">Suman {sumaDePesos} %: tienen que sumar 100.</span> : undefined}
            >
                <Fila icono={ClipboardCheck} etiqueta="Momentos en el año">
                    <Lista
                        etiqueta="Momentos en el año"
                        valor={String(r.momentos)}
                        alCambiar={(v) => cambiarMomentos(Number(v))}
                        className={EN_LA_FILA}
                        opciones={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ valor: String(n), texto: `${n} ${n === 1 ? 'momento' : 'momentos'}` }))}
                    />
                </Fila>
                <Fila etiqueta="Cómo se aprueba" apilada>
                    <Lista
                        etiqueta="Cómo se aprueba"
                        valor={r.formaDeCalificar}
                        alCambiar={(v) => setR({ ...r, formaDeCalificar: v as ReglasDePendientes['formaDeCalificar'] })}
                        className="border-0 bg-gray-100 font-normal shadow-none"
                        opciones={[
                            { valor: 'MOMENTO_APROBADO', texto: 'En el momento en que llega a la nota mínima' },
                            { valor: 'PROMEDIO', texto: 'Con el promedio de todos los momentos' },
                            { valor: 'PONDERADO', texto: 'Con un peso para cada momento' },
                        ]}
                    />
                </Fila>
                {r.formaDeCalificar === 'PONDERADO' && (
                    <Fila etiqueta="Peso de cada momento (suman 100 %)" apilada>
                        <div className="flex flex-wrap gap-3">
                            {pesos.map((p, i) => (
                                <label key={i} className="flex items-center gap-2 text-sm text-gray-700">
                                    {i + 1}º
                                    <input
                                        inputMode="numeric"
                                        aria-label={`Peso del momento ${i + 1}`}
                                        value={p}
                                        onChange={(e) => setPesos(pesos.map((x, j) => (j === i ? e.target.value.replace(/[^\d]/g, '') : x)))}
                                        className="min-h-[44px] w-16 rounded-xl bg-gray-100 px-2 text-right tabular-nums text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    %
                                </label>
                            ))}
                        </div>
                    </Fila>
                )}
                <Fila etiqueta="2ª opción de cada momento (el «112»)" apilada>
                    <Lista
                        etiqueta="Segunda opción"
                        valor={r.segundaOpcion}
                        alCambiar={(v) => setR({ ...r, segundaOpcion: v as ReglasDePendientes['segundaOpcion'] })}
                        className="border-0 bg-gray-100 font-normal shadow-none"
                        opciones={[
                            { valor: 'SIEMPRE', texto: 'Siempre, a quien reprueba la 1ª' },
                            { valor: 'SI_REPRUEBA_30', texto: 'Solo si el 30 % o más reprueba la 1ª' },
                            { valor: 'NO', texto: 'No hay 2ª opción' },
                        ]}
                    />
                </Fila>
                <Fila etiqueta="Asistencia" apilada>
                    <Lista
                        etiqueta="Asistencia"
                        valor={r.asistencia}
                        alCambiar={(v) => setR({ ...r, asistencia: v as ReglasDePendientes['asistencia'] })}
                        className="border-0 bg-gray-100 font-normal shadow-none"
                        opciones={[
                            { valor: 'SOLO_EVALUACIONES', texto: 'Solo a las evaluaciones (lo del Reglamento)' },
                            { valor: 'OBLIGATORIA', texto: 'También a las tutorías' },
                            { valor: 'NO', texto: 'No se lleva' },
                        ]}
                    />
                </Fila>
                <FilaInterruptor
                    titulo="Faltar sin justificar cuenta como presentada sin nota («IN»)"
                    checked={r.faltarPierdeElMomento}
                    onChange={(v) => setR({ ...r, faltarPierdeElMomento: v })}
                />
            </Grupo>
            <BotonGuardar type="button" texto="Guardar las reglas" onClick={() => guardarReglas.mutate()} guardando={guardarReglas.isPending} disabled={!pesosValidos} />

            {cronograma?.cicloId && (
                <>
                    <Grupo
                        id="fechas-pendientes"
                        titulo={`Fechas de los momentos · ${cronograma.ciclo ?? 'año en curso'}`}
                        descripcion={cronograma.propuesto ? 'Propuestas con el calendario del MPPE.' : undefined}
                        pie={fechas.length < r.momentos ? 'Guarda las reglas para ver las fechas de los momentos nuevos.' : undefined}
                    >
                        {fechas.slice(0, r.momentos).map((m, i) => (
                            <div key={m.numero} className="space-y-2 px-4 py-3.5">
                                <p className="text-[15px] font-semibold text-gray-900">{m.numero}º momento</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="text-xs text-gray-600">
                                        1ª opción, desde
                                        <input type="date" value={m.desde1} onChange={(e) => fecha(i, 'desde1', e.target.value)} className="mt-1 min-h-[44px] w-full rounded-xl bg-gray-100 px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500" />
                                    </label>
                                    <label className="text-xs text-gray-600">
                                        hasta
                                        <input type="date" value={m.hasta1} onChange={(e) => fecha(i, 'hasta1', e.target.value)} className="mt-1 min-h-[44px] w-full rounded-xl bg-gray-100 px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500" />
                                    </label>
                                    {r.segundaOpcion !== 'NO' && (
                                        <>
                                            <label className="text-xs text-gray-600">
                                                2ª opción, desde
                                                <input type="date" value={m.desde2 ?? ''} onChange={(e) => fecha(i, 'desde2', e.target.value)} className="mt-1 min-h-[44px] w-full rounded-xl bg-gray-100 px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </label>
                                            <label className="text-xs text-gray-600">
                                                hasta
                                                <input type="date" value={m.hasta2 ?? ''} onChange={(e) => fecha(i, 'hasta2', e.target.value)} className="mt-1 min-h-[44px] w-full rounded-xl bg-gray-100 px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </label>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </Grupo>
                    <BotonGuardar type="button" texto="Guardar las fechas" onClick={() => guardarFechas.mutate()} guardando={guardarFechas.isPending} />
                </>
            )}
        </div>
    );
}

export default ReglasDeLasPendientes;
