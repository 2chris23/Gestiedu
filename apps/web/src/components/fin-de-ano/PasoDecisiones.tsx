'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { finDeAno, condicionLegible, type Condicion, type FilaDeDecision, type ReglasDelFinDeAno } from '@/lib/fin-de-ano';
import { getApiErrorMessage } from '@/lib/utils';
import { Lista } from '@/components/ui/lista';

/**
 * PASO 4 — LA DECISIÓN DE CADA ALUMNO
 *
 * El sistema sugiere con las reglas del liceo (y dice por qué); el admin
 * puede decidir otra cosa, siempre con un motivo, que queda en el expediente.
 * Las reglas se cambian aquí mismo.
 */

const FILTROS = [
    { valor: 'problemas', texto: 'Los que no pasan limpio' },
    { valor: 'cambiados', texto: 'Los que se cambiaron' },
    { valor: 'todos', texto: 'Todos' },
];

export default function PasoDecisiones({ cicloId, reglas, cerrado }: { cicloId: string; reglas: ReglasDelFinDeAno; cerrado: boolean }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['fin-de-ano', cicloId, 'decisiones'],
        queryFn: () => finDeAno.decisiones(cicloId),
        enabled: !cerrado,
    });
    const [filtro, setFiltro] = React.useState('problemas');

    if (cerrado) return <p className="text-sm text-gray-700">El año ya se cerró: para cambiar la condición de un alumno, «Corregir» en el paso 6.</p>;

    return (
        <div className="space-y-4">
            <ReglasDeLaDecision reglas={reglas} cicloId={cicloId} />
            {isLoading ? (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando la condición de cada alumno…
                </p>
            ) : error || !data ? (
                <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudo cargar.')}</p>
            ) : (
                <>
                    <div className="w-full sm:w-72">
                        <Lista etiqueta="Qué alumnos ver" valor={filtro} alCambiar={setFiltro} opciones={FILTROS} />
                    </div>
                    <ListaDeAlumnos
                        cicloId={cicloId}
                        filas={data.filter((f) =>
                            filtro === 'todos' ? true : filtro === 'cambiados' ? !!f.decision : f.sugerida !== 'PROMOVIDO' || !!f.decision || f.reprobadas.length > 0
                        )}
                    />
                </>
            )}
        </div>
    );
}

function ReglasDeLaDecision({ reglas, cicloId }: { reglas: ReglasDelFinDeAno; cicloId: string }) {
    const cola = useQueryClient();
    const [tope, setTope] = React.useState(String(reglas.maxMateriasPendientesParaPromover));
    const [ultimo, setUltimo] = React.useState<string>(reglas.ultimoAnoConPendientes);
    const [pendiente, setPendiente] = React.useState<string>(reglas.pendienteNoAprobada);
    const guardar = useMutation({
        mutationFn: () =>
            finDeAno.guardarReglas({
                maxMateriasPendientesParaPromover: Number(tope),
                ultimoAnoConPendientes: ultimo as ReglasDelFinDeAno['ultimoAnoConPendientes'],
                pendienteNoAprobada: pendiente as ReglasDelFinDeAno['pendienteNoAprobada'],
            }),
        onSuccess: () => {
            toast.success('Reglas guardadas: las sugerencias se recalculan');
            void cola.invalidateQueries({ queryKey: ['fin-de-ano', cicloId] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudieron guardar las reglas')),
    });

    return (
        <fieldset className="grid gap-3 rounded-xl border border-gray-200 p-4 md:grid-cols-3">
            <legend className="px-1 text-sm font-semibold text-gray-800">Las reglas del liceo</legend>
            <label className="text-sm text-gray-800">
                Pasa con pendientes quien reprobó hasta
                <input
                    aria-label="Tope de materias pendientes"
                    inputMode="numeric"
                    value={tope}
                    onChange={(e) => setTope(e.target.value.replace(/\D/g, ''))}
                    className="mx-2 min-h-[44px] w-16 rounded-lg border border-gray-300 px-3 text-right"
                />
                materias
            </label>
            <div className="text-sm text-gray-800">
                <span className="mb-1 block">En el último año, con materias sin aprobar</span>
                <Lista
                    etiqueta="Último año con pendientes"
                    valor={ultimo}
                    alCambiar={setUltimo}
                    opciones={[
                        { valor: 'REPITE', texto: 'Repite el año (MPPE)' },
                        { valor: 'SOLO_PENDIENTES', texto: 'Cursa solo las pendientes' },
                        { valor: 'EGRESA', texto: 'Egresa y las presenta aparte' },
                    ]}
                />
            </div>
            <div className="text-sm text-gray-800">
                <span className="mb-1 block">La pendiente del año anterior sin aprobar</span>
                <Lista
                    etiqueta="Pendiente no aprobada"
                    valor={pendiente}
                    alCambiar={setPendiente}
                    opciones={[
                        { valor: 'REPITE', texto: 'No se promueve (MPPE)' },
                        { valor: 'SIGUE_PENDIENTE', texto: 'Sigue pendiente otro año' },
                    ]}
                />
            </div>
            <div className="md:col-span-3">
                <button
                    type="button"
                    onClick={() => guardar.mutate()}
                    disabled={guardar.isPending || tope === ''}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar las reglas
                </button>
            </div>
        </fieldset>
    );
}

function ListaDeAlumnos({ cicloId, filas }: { cicloId: string; filas: FilaDeDecision[] }) {
    if (filas.length === 0) return <p className="text-sm text-gray-700">Nadie en esta lista.</p>;
    return (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {filas.map((f) => (
                <FilaDelAlumno key={f.alumno.id} cicloId={cicloId} fila={f} />
            ))}
        </ul>
    );
}

function FilaDelAlumno({ cicloId, fila }: { cicloId: string; fila: FilaDeDecision }) {
    const cola = useQueryClient();
    const [condicion, setCondicion] = React.useState<Condicion>(fila.condicion);
    const [motivo, setMotivo] = React.useState(fila.decision?.motivo ?? '');
    React.useEffect(() => {
        setCondicion(fila.condicion);
        setMotivo(fila.decision?.motivo ?? '');
    }, [fila.condicion, fila.decision?.motivo]);

    const distinta = condicion !== fila.sugerida;
    const cambiada = condicion !== fila.condicion || (distinta && motivo !== (fila.decision?.motivo ?? ''));
    const guardar = useMutation({
        mutationFn: () => finDeAno.decidir(cicloId, fila.alumno.id, condicion, distinta ? motivo.trim() : undefined),
        onSuccess: () => {
            toast.success(distinta ? 'Decisión guardada, con su motivo' : 'Vuelve a la condición sugerida');
            void cola.invalidateQueries({ queryKey: ['fin-de-ano', cicloId] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar la decisión')),
    });
    const opciones: Array<{ valor: string; texto: string }> = (['PROMOVIDO', 'PROMOVIDO_CON_PENDIENTES', 'NO_PROMOVIDO'] as Condicion[]).map((c) => ({
        valor: c,
        texto: condicionLegible(c, fila.esUltimoAno) + (c === fila.sugerida ? ' (sugerida)' : ''),
    }));

    return (
        <li className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{fila.alumno.nombre}</p>
                    <p className="text-xs text-gray-600">
                        {fila.grado}º «{fila.seccion}» · promedio {fila.promedio} · {fila.motivoDeLaSugerencia}
                    </p>
                    {fila.reprobadas.length > 0 && (
                        <p className="text-xs text-gray-700">
                            Sin aprobar: {fila.reprobadas.map((r) => `${r.nombre} (${r.nota}${r.revision != null ? ', revisión' : ''})`).join(', ')}
                        </p>
                    )}
                    {fila.pendientesArrastradas.length > 0 && (
                        <p className="text-xs text-gray-700">
                            Pendientes de antes:{' '}
                            {fila.pendientesArrastradas.map((p) => `${p.subjectName} de ${p.gradoDeOrigen}º (${p.estado === 'APROBADA' ? 'aprobada' : 'sin aprobar'})`).join(', ')}
                        </p>
                    )}
                </div>
                <div className="w-full sm:w-64">
                    <Lista etiqueta={`Condición de ${fila.alumno.nombre}`} valor={condicion} alCambiar={(v) => setCondicion(v as Condicion)} opciones={opciones} />
                </div>
            </div>
            {distinta && (
                <input
                    aria-label={`Motivo de la decisión de ${fila.alumno.nombre}`}
                    placeholder="¿Por qué? (obligatorio, queda en el expediente)"
                    value={motivo}
                    maxLength={500}
                    onChange={(e) => setMotivo(e.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm"
                />
            )}
            {cambiada && (
                <button
                    type="button"
                    onClick={() => guardar.mutate()}
                    disabled={guardar.isPending || (distinta && motivo.trim().length < 5)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                    {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar la decisión
                </button>
            )}
        </li>
    );
}
