'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { laborSocial, avanceLegible, type FilaDeLaborSocial } from '@/lib/labor-social';
import { getApiErrorMessage, cn } from '@/lib/utils';

/**
 * LA LABOR SOCIAL DE UNA SECCIÓN (la pestaña de la sección)
 *
 * Era una pantalla del menú con TODAS las secciones una debajo de otra; con
 * el liceo lleno, una lista sin fin. Cristian la quiso dentro de la sección,
 * como el plan de evaluación (2026-10-12). Aquí, sus alumnos con lo que
 * llevan —sumado de todos los años: lo hecho en 4to cuenta en 5to—; se
 * marcan y se les anota una actividad a la vez (una salida de la sección) o a
 * uno solo. Quién anota lo dice el liceo (`quienAnota`); el servidor lo
 * exige igual.
 */
export function LaborSocialDeLaSeccion({ classroomId }: { classroomId: string }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['labor-social', 'lista', classroomId],
        queryFn: () => laborSocial.lista({ classroomId }),
    });
    const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
    const [anotando, setAnotando] = React.useState(false);
    const [viendo, setViendo] = React.useState<FilaDeLaborSocial | null>(null);

    const filas = data?.alumnos ?? [];
    const puedeAnotar = data?.puedeAnotar === true;
    const todos = filas.length > 0 && filas.every((f) => marcados.has(f.alumno.id));
    const marcar = (id: string, si: boolean) =>
        setMarcados((prev) => {
            const n = new Set(prev);
            if (si) n.add(id);
            else n.delete(id);
            return n;
        });
    const r = data?.reglas;
    const cumplidas = filas.filter((f) => f.cumplida).length;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">
                    {r
                        ? `${r.horasRequeridas > 0 ? `${r.horasRequeridas} horas en total` : 'Por proyecto'} · ${cumplidas} de ${filas.length} la han cumplido · ${
                              r.paraEgresar === 'BLOQUEA' ? 'sin ella no egresan' : r.paraEgresar === 'AVISA' ? 'para egresar, se avisa' : 'no cuenta para egresar'
                          }`
                        : 'Las horas comunitarias de cada alumno.'}
                </p>
                {puedeAnotar && (
                    <button
                        type="button"
                        onClick={() => setAnotando(true)}
                        disabled={marcados.size === 0}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        <Plus className="h-4 w-4" aria-hidden /> Anotar actividad{marcados.size > 0 ? ` (${marcados.size})` : ''}
                    </button>
                )}
            </div>

            {isLoading ? (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
                </p>
            ) : error || !data ? (
                <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudo cargar la labor social.')}</p>
            ) : filas.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
                    No hay alumnos activos en esta sección.
                </p>
            ) : (
                <section className="rounded-2xl border border-gray-200 bg-white shadow-xs" aria-label="Alumnos y sus horas">
                    {puedeAnotar && (
                        <header className="flex items-center justify-end border-b border-gray-100 px-4 py-1">
                            <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-700">
                                <Checkbox
                                    checked={todos}
                                    onCheckedChange={(v) => filas.forEach((f) => marcar(f.alumno.id, v === true))}
                                    aria-label="Marcar a toda la sección"
                                />
                                Toda la sección
                            </label>
                        </header>
                    )}
                    <ul className="divide-y divide-gray-100">
                        {filas.map((f) => {
                            const pct = f.porProyecto ? (f.proyectoCulminado ? 100 : 50) : Math.min(100, f.requeridas > 0 ? (f.horas / f.requeridas) * 100 : 0);
                            return (
                                <li key={f.alumno.id} className="flex items-center gap-3 px-4 py-2">
                                    {puedeAnotar && (
                                        <Checkbox
                                            checked={marcados.has(f.alumno.id)}
                                            onCheckedChange={(v) => marcar(f.alumno.id, v === true)}
                                            aria-label={`Marcar a ${f.alumno.nombre}`}
                                        />
                                    )}
                                    <button type="button" onClick={() => setViendo(f)} className="min-h-[44px] min-w-0 flex-1 text-left">
                                        <span className="block truncate text-sm font-semibold text-gray-900">{f.alumno.nombre}</span>
                                        <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                                            <span className={cn('block h-full rounded-full', f.cumplida ? 'bg-emerald-500' : 'bg-indigo-500')} style={{ width: `${pct}%` }} />
                                        </span>
                                    </button>
                                    <span className={cn('shrink-0 text-sm font-semibold tabular-nums', f.cumplida ? 'text-emerald-700' : 'text-gray-800')}>
                                        {avanceLegible(f)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {anotando && (
                <VentanaDeActividad
                    alumnos={filas.filter((f) => marcados.has(f.alumno.id))}
                    alCerrar={(hecho) => {
                        setAnotando(false);
                        if (hecho) setMarcados(new Set());
                    }}
                />
            )}
            {viendo && <DetalleDelAlumno fila={viendo} alCerrar={() => setViendo(null)} />}
        </div>
    );
}

function VentanaDeActividad({ alumnos, alCerrar }: { alumnos: FilaDeLaborSocial[]; alCerrar: (hecho: boolean) => void }) {
    const cola = useQueryClient();
    const hoy = useSchoolToday();
    const [datos, setDatos] = React.useState({ fecha: '', horas: '', que: '', donde: '', proyecto: '', responsable: '', observaciones: '', culmina: false });
    const fecha = datos.fecha || hoy || '';
    const horas = Number(datos.horas.replace(',', '.'));
    const validos = datos.que.trim().length >= 3 && horas > 0 && horas <= 24 && /^\d{4}-\d{2}-\d{2}$/.test(fecha);
    const guardar = useMutation({
        mutationFn: () =>
            laborSocial.anotar({
                alumnos: alumnos.map((a) => a.alumno.id),
                fecha,
                horas,
                que: datos.que.trim(),
                donde: datos.donde.trim() || null,
                proyecto: datos.proyecto.trim() || null,
                responsable: datos.responsable.trim() || null,
                observaciones: datos.observaciones.trim() || null,
                culminaElProyecto: datos.culmina,
            }),
        onSuccess: (r) => {
            toast.success(r.anotadas === 1 ? 'Actividad anotada' : `Actividad anotada a ${r.anotadas} alumnos`);
            void cola.invalidateQueries({ queryKey: ['labor-social'] });
            alCerrar(true);
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo anotar')),
    });
    const campo = (clave: keyof typeof datos, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
        <label className="block text-sm font-medium text-gray-800">
            {etiqueta}
            <input
                value={String(clave === 'fecha' ? fecha : datos[clave])}
                onChange={(e) => setDatos({ ...datos, [clave]: e.target.value })}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm"
                {...extra}
            />
        </label>
    );

    return (
        <Dialog open onOpenChange={(v) => !v && !guardar.isPending && alCerrar(false)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Anotar actividad de labor social</DialogTitle>
                    <DialogDescription>
                        {alumnos.length === 1 ? `A ${alumnos[0].alumno.nombre}.` : `A ${alumnos.length} alumnos a la vez (la misma actividad para todos).`}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">{campo('que', 'Qué se hizo', { maxLength: 200, placeholder: 'Jornada de limpieza, alfabetización…' })}</div>
                    {campo('fecha', 'Fecha', { type: 'date' })}
                    {campo('horas', 'Horas', { inputMode: 'decimal', placeholder: '4' })}
                    {campo('donde', 'Dónde', { maxLength: 160, placeholder: 'Comunidad, institución…' })}
                    {campo('responsable', 'Quién lo supervisó', { maxLength: 120 })}
                    <div className="sm:col-span-2">{campo('proyecto', 'Proyecto (si lo tiene)', { maxLength: 160 })}</div>
                    <label className="flex min-h-[44px] items-center gap-3 text-sm text-gray-800 sm:col-span-2">
                        <Checkbox checked={datos.culmina} onCheckedChange={(v) => setDatos({ ...datos, culmina: v === true })} aria-label="Con esta culmina el proyecto" />
                        Con esta actividad culmina el proyecto
                    </label>
                </div>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => alCerrar(false)} className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => guardar.mutate()}
                        disabled={!validos || guardar.isPending}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Anotar
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Lo de un alumno: todas sus actividades, de todos los años, cada una con el suyo. */
function DetalleDelAlumno({ fila, alCerrar }: { fila: FilaDeLaborSocial; alCerrar: () => void }) {
    const cola = useQueryClient();
    const { data, isLoading } = useQuery({ queryKey: ['labor-social', 'alumno', fila.alumno.id], queryFn: () => laborSocial.delAlumno(fila.alumno.id) });
    const borrar = useMutation({
        mutationFn: (id: string) => laborSocial.borrar(id),
        onSuccess: () => {
            toast.success('Actividad quitada');
            void cola.invalidateQueries({ queryKey: ['labor-social'] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo quitar')),
    });
    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{fila.alumno.nombre}</DialogTitle>
                    <DialogDescription>{data ? avanceLegible(data.avance) : avanceLegible(fila)}</DialogDescription>
                </DialogHeader>
                {isLoading ? (
                    <p className="text-sm text-gray-600">Cargando…</p>
                ) : !data || data.actividades.length === 0 ? (
                    <p className="text-sm text-gray-600">Sin actividades todavía.</p>
                ) : (
                    <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
                        {data.actividades.map((a) => (
                            <li key={a.id} className="flex items-start justify-between gap-3 py-2">
                                <div className="min-w-0 text-sm">
                                    <p className="font-semibold text-gray-900">
                                        {a.fecha.split('-').reverse().join('/')} · {String(a.horas).replace('.', ',')} h
                                        {a.ciclo && <span className="ml-1 text-xs font-normal text-gray-600">({a.ciclo})</span>}
                                        {a.culminaElProyecto && <span className="ml-1 text-xs font-normal text-emerald-700">(culmina el proyecto)</span>}
                                    </p>
                                    <p className="text-gray-700">
                                        {a.que}
                                        {a.donde ? ` · ${a.donde}` : ''}
                                        {a.proyecto ? ` · ${a.proyecto}` : ''}
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        {a.responsable ? `Supervisó: ${a.responsable} · ` : ''}Anotó: {a.registradaPor ?? '—'}
                                    </p>
                                </div>
                                {data.puedeAnotar && (
                                    <button
                                        type="button"
                                        onClick={() => borrar.mutate(a.id)}
                                        disabled={borrar.isPending}
                                        aria-label={`Quitar la actividad del ${a.fecha}`}
                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-rose-50 hover:text-rose-700"
                                    >
                                        <Trash2 className="h-4 w-4" aria-hidden />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default LaborSocialDeLaSeccion;
