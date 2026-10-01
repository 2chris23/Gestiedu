'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hacerODejarPendiente, esPendiente } from '@/lib/por-enviar';
import { toast } from 'sonner';
import { CalendarClock, FileText, Loader2, MessageSquarePlus, Search, X } from 'lucide-react';
import api from '@/lib/axios';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Lista } from '@/components/ui/lista';
import { Checkbox } from '@/components/ui/checkbox';
import { useSearchStudents } from '@/hooks/useLiveClass';
import { useClassrooms } from '@/hooks/useClassrooms';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { getApiErrorMessage, cn } from '@/lib/utils';
import { MarcarAsistencia } from '@/components/observations/MarcarAsistencia';

/**
 * LAS OBSERVACIONES, EN UN PANEL PROPIO
 *
 * Todas las que la persona puede ver (el admin, todas; el profesor, las de sus
 * secciones y las suyas), con filtros. Se escribe una sin estar en una clase,
 * y desde una observación se CITA AL REPRESENTANTE: le llega el aviso a la
 * campana y al teléfono; la citación se imprime; y después se marca si vino y
 * lo que se habló (`services/citaciones.service.ts`).
 */

interface Citacion {
    id: string;
    fecha: string;
    hora: string;
    cuando: string;
    lugar: string;
    motivo: string;
    estado: 'PENDIENTE' | 'ASISTIO' | 'NO_ASISTIO';
    loQueSeHablo: string | null;
}
interface Observacion {
    id: string;
    titulo: string;
    descripcion: string | null;
    tipo: string;
    fecha: string;
    alumno: { id: string; nombre: string };
    seccion: { id: string; nombre: string } | null;
    materia: string | null;
    autor: string;
    puedeCitar: boolean;
    citaciones: Citacion[];
}
interface Panel {
    observaciones: Observacion[];
    total: number;
    pagina: number;
    paginas: number;
}

const TODAS = '__todas';
const ESTADO: Record<Citacion['estado'], { texto: string; clase: string }> = {
    PENDIENTE: { texto: 'Pendiente', clase: 'bg-amber-50 text-amber-800 ring-amber-200' },
    ASISTIO: { texto: 'Vino', clase: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
    NO_ASISTIO: { texto: 'No vino', clase: 'bg-rose-50 text-rose-800 ring-rose-200' },
};
const fechaCorta = (ymd: string) => ymd.split('-').reverse().join('/');

export default function ObservacionesPage() {
    const [seccion, setSeccion] = React.useState(TODAS);
    const [conCitacion, setConCitacion] = React.useState(false);
    const [pagina, setPagina] = React.useState(1);
    const [escribiendo, setEscribiendo] = React.useState(false);
    const [citando, setCitando] = React.useState<Observacion | null>(null);
    const [marcando, setMarcando] = React.useState<Citacion | null>(null);

    const secciones = useClassrooms();
    const listaDeSecciones = React.useMemo(() => {
        const d: any = secciones.data;
        const arr: any[] = Array.isArray(d) ? d : d?.classrooms ?? [];
        return arr.map((c) => ({ valor: c.id as string, texto: (c.name as string) ?? `${c.grade}º ${c.section}` }));
    }, [secciones.data]);

    const { data, isLoading, error } = useQuery<Panel>({
        queryKey: ['observaciones-panel', { seccion, conCitacion, pagina }],
        queryFn: async () =>
            (
                await api.get('/observations/panel', {
                    params: { seccion: seccion === TODAS ? undefined : seccion, conCitacion: conCitacion || undefined, pagina },
                })
            ).data.data,
        placeholderData: (antes) => antes,
    });

    return (
        <div className="space-y-6">
            <EncabezadoDePantalla
                titulo="Observaciones"
                descripcion="Las de tus secciones. Desde una observación se cita al representante."
                acciones={
                    <button
                        type="button"
                        onClick={() => setEscribiendo(true)}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                        <MessageSquarePlus className="h-4 w-4" aria-hidden /> Nueva observación
                    </button>
                }
            />

            <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center">
                <div className="sm:w-64">
                    <Lista etiqueta="Sección" valor={seccion} alCambiar={(v) => { setSeccion(v); setPagina(1); }} opciones={[{ valor: TODAS, texto: 'Todas las secciones' }, ...listaDeSecciones]} />
                </div>
                <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-800">
                    <Checkbox checked={conCitacion} onCheckedChange={(v) => { setConCitacion(v === true); setPagina(1); }} aria-label="Solo con citación" />
                    Solo con citación
                </label>
            </div>

            {isLoading ? (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
                </p>
            ) : error || !data ? (
                <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudieron cargar las observaciones.')}</p>
            ) : data.observaciones.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">No hay observaciones con esos filtros.</p>
            ) : (
                <ul className="space-y-3" aria-label="Observaciones">
                    {data.observaciones.map((o) => (
                        <li key={o.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-semibold text-gray-900">{o.titulo}</p>
                                    <p className="text-sm text-gray-600">
                                        <Link href={`/dashboard/usuarios/${encodeURIComponent(o.alumno.id)}`} className="font-medium text-indigo-700 hover:underline">
                                            {o.alumno.nombre}
                                        </Link>
                                        {o.seccion ? ` · ${o.seccion.nombre}` : ''}
                                        {o.materia ? ` · ${o.materia}` : ''} · {fechaCorta(o.fecha)} · {o.autor}
                                    </p>
                                </div>
                                {o.puedeCitar && (
                                    <button
                                        type="button"
                                        onClick={() => setCitando(o)}
                                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                                    >
                                        <CalendarClock className="h-4 w-4" aria-hidden /> Citar al representante
                                    </button>
                                )}
                            </div>
                            {o.descripcion && <p className="mt-2 whitespace-pre-line text-sm text-gray-800">{o.descripcion}</p>}
                            {o.citaciones.length > 0 && (
                                <ul className="mt-3 space-y-2" aria-label={`Citaciones de ${o.alumno.nombre}`}>
                                    {o.citaciones.map((c) => (
                                        <li key={c.id} className="rounded-xl bg-gray-50 p-3 text-sm">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold ring-1', ESTADO[c.estado].clase)}>{ESTADO[c.estado].texto}</span>
                                                <span className="font-medium text-gray-900">Citación: {c.cuando}</span>
                                                <span className="text-gray-600">en {c.lugar}</span>
                                            </div>
                                            {c.loQueSeHablo && <p className="mt-1 text-gray-700">Se habló: {c.loQueSeHablo}</p>}
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <Link
                                                    href={`/dashboard/citaciones/${c.id}`}
                                                    className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                                                >
                                                    <FileText className="h-4 w-4" aria-hidden /> Imprimir citación
                                                </Link>
                                                {o.puedeCitar && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setMarcando(c)}
                                                        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                                                    >
                                                        ¿Vino?
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {data && data.paginas > 1 && (
                <nav className="flex items-center justify-center gap-2" aria-label="Páginas">
                    <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-sm disabled:opacity-50">
                        Anterior
                    </button>
                    <span className="text-sm text-gray-700">
                        {data.pagina} de {data.paginas}
                    </span>
                    <button type="button" disabled={pagina >= data.paginas} onClick={() => setPagina((p) => p + 1)} className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-sm disabled:opacity-50">
                        Siguiente
                    </button>
                </nav>
            )}

            {escribiendo && <NuevaObservacion alCerrar={() => setEscribiendo(false)} />}
            {citando && <Citar observacion={citando} alCerrar={() => setCitando(null)} />}
            {marcando && <MarcarAsistencia citacion={marcando} alCerrar={() => setMarcando(null)} />}
        </div>
    );
}

const botonPrincipal = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60';
const botonSecundario = 'min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50';

/** Una observación nueva, sin estar en una clase: se elige al alumno (el profesor solo encuentra a los suyos). */
function NuevaObservacion({ alCerrar }: { alCerrar: () => void }) {
    const cola = useQueryClient();
    const [busqueda, setBusqueda] = React.useState('');
    const [alumno, setAlumno] = React.useState<{ id: string; nombre: string; classroomId: string | null } | null>(null);
    const [titulo, setTitulo] = React.useState('');
    const [descripcion, setDescripcion] = React.useState('');
    const resultados = useSearchStudents(busqueda);
    const guardar = useMutation({
        mutationFn: async () => {
            const cuerpo = {
                title: titulo.trim(),
                description: descripcion.trim() || undefined,
                studentIds: [alumno!.id],
                classroomId: alumno!.classroomId ?? undefined,
            };
            return hacerODejarPendiente(async () => (await api.post('/observations', cuerpo)).data, {
                tipo: 'observacion',
                grupo: 2,
                metodo: 'post',
                url: '/observations',
                objeto: `observacion|${crypto.randomUUID()}`,
                resumen: `Observación de ${alumno!.nombre}: «${cuerpo.title}»`,
                datos: cuerpo,
            });
        },
        onSuccess: (r) => {
            if (esPendiente(r)) {
                toast('Sin conexión: la observación quedó pendiente ⏱ y se envía sola al volver.', { id: 'pendiente' });
                alCerrar();
                return;
            }
            toast.success('Observación guardada');
            void cola.invalidateQueries({ queryKey: ['observaciones-panel'] });
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar la observación')),
    });

    return (
        <Dialog open onOpenChange={(v) => !v && !guardar.isPending && alCerrar()}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Nueva observación</DialogTitle>
                    <DialogDescription>Sobre un alumno, sin estar en una clase.</DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (alumno && titulo.trim().length >= 3) guardar.mutate();
                    }}
                >
                    {alumno ? (
                        <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 text-sm">
                            <span className="font-semibold text-indigo-900">{alumno.nombre}</span>
                            <button type="button" onClick={() => setAlumno(null)} aria-label="Cambiar de alumno" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-indigo-800">
                                <X className="h-4 w-4" aria-hidden />
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label htmlFor="obs-buscar" className="text-sm font-semibold text-gray-700">
                                Alumno
                            </label>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                                <Input id="obs-buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o cédula" className="min-h-[44px] pl-9" autoComplete="off" />
                            </div>
                            <ul className="max-h-56 overflow-y-auto" aria-label="Alumnos encontrados">
                                {(resultados.data ?? []).map((s) => (
                                    <li key={s.id}>
                                        <button
                                            type="button"
                                            onClick={() => setAlumno({ id: s.id, nombre: `${s.firstName} ${s.lastName}`, classroomId: s.classroomId ?? null })}
                                            className="flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-gray-50"
                                        >
                                            <span className="font-medium text-gray-900">
                                                {s.firstName} {s.lastName}
                                            </span>
                                            <span className="text-xs text-gray-500">{s.classroomName ?? 'Sin sección'}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <label htmlFor="obs-titulo" className="text-sm font-semibold text-gray-700">
                            Qué pasó
                        </label>
                        <Input id="obs-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} className="min-h-[44px]" placeholder="Llegó tarde tres días seguidos" />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="obs-detalle" className="text-sm font-semibold text-gray-700">
                            Detalle (opcional)
                        </label>
                        <textarea id="obs-detalle" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} maxLength={1000} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" onClick={alCerrar} className={botonSecundario}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={!alumno || titulo.trim().length < 3 || guardar.isPending} className={botonPrincipal}>
                            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar observación
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/** Citar al representante: cuándo, dónde y para qué. Le llega el aviso al instante. */
function Citar({ observacion, alCerrar }: { observacion: Observacion; alCerrar: () => void }) {
    const cola = useQueryClient();
    const hoy = useSchoolToday();
    const [fecha, setFecha] = React.useState('');
    const [hora, setHora] = React.useState('08:00');
    const [lugar, setLugar] = React.useState('la dirección del plantel');
    const [motivo, setMotivo] = React.useState(observacion.titulo);
    const citar = useMutation({
        mutationFn: async () => {
            const cuerpo = { fecha, hora, lugar: lugar.trim(), motivo: motivo.trim() };
            return hacerODejarPendiente(async () => (await api.post(`/observations/${observacion.id}/citaciones`, cuerpo)).data.data, {
                tipo: 'citacion',
                grupo: 2,
                metodo: 'post',
                url: `/observations/${observacion.id}/citaciones`,
                objeto: `citacion|${observacion.id}`,
                resumen: `Citar al representante de ${observacion.alumno.nombre}`,
                datos: cuerpo,
            });
        },
        onSuccess: (c: any) => {
            if (esPendiente(c)) {
                toast('Sin conexión: la citación quedó pendiente ⏱; al volver se envía y se avisa al representante.', { id: 'pendiente' });
                alCerrar();
                return;
            }
            toast.success(c.avisados > 0 ? `Citación hecha: se avisó a ${c.avisados === 1 ? 'su representante' : `sus ${c.avisados} representantes`}` : 'Citación hecha (el alumno no tiene representante en el sistema: imprímela)');
            void cola.invalidateQueries({ queryKey: ['observaciones-panel'] });
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo hacer la citación')),
    });
    return (
        <Dialog open onOpenChange={(v) => !v && !citar.isPending && alCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Citar al representante</DialogTitle>
                    <DialogDescription>
                        De {observacion.alumno.nombre}. Le llega el aviso a la app y al teléfono (sin el motivo, que se lee al abrirla).
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        citar.mutate();
                    }}
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label htmlFor="cita-fecha" className="text-sm font-semibold text-gray-700">
                                Día
                            </label>
                            <Input id="cita-fecha" type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} required className="min-h-[44px]" />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="cita-hora" className="text-sm font-semibold text-gray-700">
                                Hora
                            </label>
                            <Input id="cita-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} required className="min-h-[44px]" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="cita-lugar" className="text-sm font-semibold text-gray-700">
                            Dónde
                        </label>
                        <Input id="cita-lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} maxLength={120} required className="min-h-[44px]" />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="cita-motivo" className="text-sm font-semibold text-gray-700">
                            Para qué
                        </label>
                        <textarea id="cita-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" onClick={alCerrar} className={botonSecundario}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={!fecha || motivo.trim().length < 5 || citar.isPending} className={botonPrincipal}>
                            {citar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Citar
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
