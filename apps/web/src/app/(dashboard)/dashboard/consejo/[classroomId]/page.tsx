'use client';

import * as React from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/axios';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { Input } from '@/components/ui/input';
import { Lista } from '@/components/ui/lista';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/hooks/useConfirm';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { getApiErrorMessage } from '@/lib/utils';
import { motivosLegibles, type Motivos } from '@/lib/consejo';

/**
 * EL CONSEJO DE SECCIÓN
 *
 * Por lapso: el acta, con los profesores que asistieron, los casos tratados
 * (el sistema propone los alumnos con materias reprobadas, poca asistencia u
 * observaciones; se quitan o se añaden) y los acuerdos. La escriben el admin y
 * el guía; los profesores de la sección la leen (`services/consejo.service.ts`).
 */

interface Consejo {
    seccion: { id: string; nombre: string };
    lapso: { id: string; nombre: string };
    puedeEscribir: boolean;
    profesores: Array<{ id: string; nombre: string; materias: string[] }>;
    alumnos: Array<{ id: string; nombre: string }>;
    propuestos: Array<{ alumno: { id: string; nombre: string }; motivos: Motivos }>;
    acta: null | {
        fecha: string;
        asistentes: Array<{ id: string; asistio: boolean }>;
        acuerdosGenerales: string | null;
        casos: Array<{ alumno: { id: string; nombre: string }; motivos: Motivos | null; loTratado: string | null; acuerdo: string | null }>;
    };
}
interface Caso {
    id: string;
    nombre: string;
    motivos: Motivos | null;
    loTratado: string;
    acuerdo: string;
}

export default function ConsejoPage({ params }: { params: Promise<{ classroomId: string }> }) {
    const { classroomId } = use(params);
    const [lapso, setLapso] = React.useState('');
    const lapsos = useQuery<{ seccion: { nombre: string }; puedeEscribir: boolean; lapsos: Array<{ id: string; nombre: string; acta: string | null }> }>({
        queryKey: ['consejos', classroomId],
        queryFn: async () => (await api.get(`/classrooms/${encodeURIComponent(classroomId)}/consejos`)).data.data,
    });
    const elegido = lapso || lapsos.data?.lapsos[0]?.id || '';

    return (
        <div className="space-y-6">
            <EncabezadoDePantalla
                titulo="Consejo de sección"
                descripcion={lapsos.data ? `${lapsos.data.seccion.nombre}: el acta de cada lapso.` : 'El acta de cada lapso.'}
                acciones={
                    lapsos.data && lapsos.data.lapsos.length > 0 ? (
                        <div className="w-56">
                            <Lista
                                etiqueta="Lapso"
                                valor={elegido}
                                alCambiar={setLapso}
                                opciones={lapsos.data.lapsos.map((l) => ({ valor: l.id, texto: `${l.nombre}${l.acta ? ' · con acta' : ''}` }))}
                            />
                        </div>
                    ) : undefined
                }
            />
            {lapsos.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
                </p>
            ) : lapsos.error ? (
                <p className="text-sm text-rose-700">{getApiErrorMessage(lapsos.error, 'No se pudo cargar el consejo.')}</p>
            ) : elegido ? (
                <Acta key={elegido} classroomId={classroomId} periodId={elegido} />
            ) : (
                <p className="text-sm text-gray-600">Este año no tiene lapsos.</p>
            )}
        </div>
    );
}

function Acta({ classroomId, periodId }: { classroomId: string; periodId: string }) {
    const cola = useQueryClient();
    const hoy = useSchoolToday();
    const confirmar = useConfirm();
    const clave = ['consejo', classroomId, periodId];
    const { data: c, isLoading, error } = useQuery<Consejo>({
        queryKey: clave,
        queryFn: async () => (await api.get(`/classrooms/${encodeURIComponent(classroomId)}/consejos/${periodId}`)).data.data,
    });

    const [fecha, setFecha] = React.useState('');
    const [asistio, setAsistio] = React.useState<Record<string, boolean>>({});
    const [casos, setCasos] = React.useState<Caso[]>([]);
    const [acuerdos, setAcuerdos] = React.useState('');
    const [otro, setOtro] = React.useState('');
    React.useEffect(() => {
        if (!c) return;
        if (c.acta) {
            setFecha(c.acta.fecha);
            setAsistio(Object.fromEntries(c.acta.asistentes.map((a) => [a.id, a.asistio])));
            setCasos(c.acta.casos.map((x) => ({ id: x.alumno.id, nombre: x.alumno.nombre, motivos: x.motivos, loTratado: x.loTratado ?? '', acuerdo: x.acuerdo ?? '' })));
            setAcuerdos(c.acta.acuerdosGenerales ?? '');
        } else {
            setFecha(hoy);
            setAsistio(Object.fromEntries(c.profesores.map((p) => [p.id, true])));
            setCasos(c.propuestos.map((p) => ({ id: p.alumno.id, nombre: p.alumno.nombre, motivos: p.motivos, loTratado: '', acuerdo: '' })));
            setAcuerdos('');
        }
    }, [c, hoy]);

    const guardar = useMutation({
        mutationFn: async () =>
            (
                await api.put(`/classrooms/${encodeURIComponent(classroomId)}/consejos/${periodId}`, {
                    fecha,
                    asistentes: Object.entries(asistio).map(([id, a]) => ({ id, asistio: a })),
                    acuerdosGenerales: acuerdos,
                    casos: casos.map((x) => ({ studentId: x.id, loTratado: x.loTratado, acuerdo: x.acuerdo })),
                })
            ).data.data,
        onSuccess: (nuevo) => {
            cola.setQueryData(clave, nuevo);
            void cola.invalidateQueries({ queryKey: ['consejos', classroomId] });
            toast.success('Acta guardada');
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar el acta')),
    });
    const borrar = useMutation({
        mutationFn: async () => (await api.delete(`/classrooms/${encodeURIComponent(classroomId)}/consejos/${periodId}`)).data,
        onSuccess: () => {
            void cola.invalidateQueries({ queryKey: clave });
            void cola.invalidateQueries({ queryKey: ['consejos', classroomId] });
            toast.success('Acta borrada (queda copia)');
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo borrar')),
    });

    if (isLoading) return <p className="text-sm text-gray-600">Cargando el acta…</p>;
    if (error || !c) return <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudo cargar el acta.')}</p>;
    const puede = c.puedeEscribir;
    const sinCaso = c.alumnos.filter((a) => !casos.some((x) => x.id === a.id));
    const poner = (id: string, campo: 'loTratado' | 'acuerdo', v: string) => setCasos((l) => l.map((x) => (x.id === id ? { ...x, [campo]: v } : x)));

    return (
        <div className="space-y-5">
            {!c.acta && (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Este lapso todavía no tiene acta. {puede ? 'Abajo van los alumnos que propone el sistema: quita o añade los que hagan falta y guárdala.' : 'La escribe el profesor guía.'}
                </p>
            )}
            <section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="asistentes-titulo">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <h2 id="asistentes-titulo" className="font-bold text-gray-900">
                        Asistentes
                    </h2>
                    <div className="w-44 space-y-1">
                        <label htmlFor="consejo-fecha" className="text-sm font-semibold text-gray-700">
                            Fecha del consejo
                        </label>
                        <Input id="consejo-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!puede} className="min-h-[44px]" />
                    </div>
                </div>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {c.profesores.map((p) => (
                        <li key={p.id}>
                            <label className="flex min-h-[44px] items-center gap-3 rounded-lg px-2 text-sm hover:bg-gray-50">
                                <Checkbox checked={asistio[p.id] ?? false} disabled={!puede} onCheckedChange={(v) => setAsistio((a) => ({ ...a, [p.id]: v === true }))} aria-label={`Asistió ${p.nombre}`} />
                                <span>
                                    <span className="font-medium text-gray-900">{p.nombre}</span>
                                    <span className="block text-xs text-gray-500">{p.materias.join(', ')}</span>
                                </span>
                            </label>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="casos-titulo">
                <h2 id="casos-titulo" className="font-bold text-gray-900">
                    Casos tratados ({casos.length})
                </h2>
                <ul className="mt-2 space-y-3" aria-label="Casos">
                    {casos.map((x) => (
                        <li key={x.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <p className="font-semibold text-gray-900">{x.nombre}</p>
                                    {motivosLegibles(x.motivos) && <p className="text-xs text-gray-600">{motivosLegibles(x.motivos)}</p>}
                                </div>
                                {puede && (
                                    <button
                                        type="button"
                                        onClick={() => setCasos((l) => l.filter((y) => y.id !== x.id))}
                                        aria-label={`Quitar a ${x.nombre} del acta`}
                                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-500 hover:bg-white"
                                    >
                                        <Trash2 className="h-4 w-4" aria-hidden />
                                    </button>
                                )}
                            </div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {/* Etiqueta a la vista: el texto de muestra se borra al escribir
                                    y luego no se sabía qué casilla era cuál. */}
                                <label className="block space-y-1">
                                <span className="text-xs font-semibold text-gray-700">Lo tratado</span>
                                <textarea
                                    aria-label={`Lo tratado de ${x.nombre}`}
                                    placeholder="Qué se habló de este caso"
                                    value={x.loTratado}
                                    onChange={(e) => poner(x.id, 'loTratado', e.target.value)}
                                    disabled={!puede}
                                    rows={2}
                                    maxLength={2000}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                />
                                </label>
                                {/* Etiqueta a la vista: el texto de muestra se borra al escribir
                                    y luego no se sabía qué casilla era cuál. */}
                                <label className="block space-y-1">
                                <span className="text-xs font-semibold text-gray-700">Acuerdo</span>
                                <textarea
                                    aria-label={`Acuerdo de ${x.nombre}`}
                                    placeholder="Qué se decidió hacer"
                                    value={x.acuerdo}
                                    onChange={(e) => poner(x.id, 'acuerdo', e.target.value)}
                                    disabled={!puede}
                                    rows={2}
                                    maxLength={2000}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                />
                                </label>
                            </div>
                        </li>
                    ))}
                </ul>
                {puede && sinCaso.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="sm:w-72">
                            <Lista etiqueta="Añadir alumno" valor={otro} alCambiar={setOtro} opciones={sinCaso.map((a) => ({ valor: a.id, texto: a.nombre }))} />
                        </div>
                        <button
                            type="button"
                            disabled={!otro}
                            onClick={() => {
                                const a = c.alumnos.find((x) => x.id === otro);
                                if (a) setCasos((l) => [...l, { id: a.id, nombre: a.nombre, motivos: { aMano: true }, loTratado: '', acuerdo: '' }]);
                                setOtro('');
                            }}
                            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        >
                            <Plus className="h-4 w-4" aria-hidden /> Añadir al acta
                        </button>
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4">
                <label htmlFor="consejo-acuerdos" className="font-bold text-gray-900">
                    Acuerdos generales
                </label>
                <textarea
                    id="consejo-acuerdos"
                    value={acuerdos}
                    onChange={(e) => setAcuerdos(e.target.value)}
                    disabled={!puede}
                    rows={4}
                    maxLength={4000}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
            </section>

            <div className="flex flex-wrap gap-2">
                {puede && (
                    <button
                        type="button"
                        onClick={() => guardar.mutate()}
                        disabled={!fecha || guardar.isPending}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                        {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar el acta
                    </button>
                )}
                {c.acta && (
                    <Link
                        href={`/dashboard/acta-del-consejo/${encodeURIComponent(classroomId)}/${periodId}`}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        <FileText className="h-4 w-4" aria-hidden /> Imprimir el acta
                    </Link>
                )}
                {puede && c.acta && (
                    <button
                        type="button"
                        onClick={async () => {
                            if (await confirmar({ title: '¿Borrar el acta de este lapso?', description: 'Queda una copia en la papelera.', confirmLabel: 'Borrar' })) borrar.mutate();
                        }}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                    >
                        Borrar el acta
                    </button>
                )}
            </div>
        </div>
    );
}
