'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, CircleDot, Eye, MessageSquareReply } from 'lucide-react';
import api from '@/lib/axios';
import { lasUltimasHuellas } from '@/lib/reportar-fallo';
import { Grupo, BotonGuardar, CargandoAjustes } from '@/components/configuracion/ajustes';
import { cn, getApiErrorMessage } from '@/lib/utils';

/**
 * «REPORTAR UN PROBLEMA» (18-oct-2026)
 *
 * Cristian: «que cualquier usuario pueda reportar un error y me llega a mi
 * panel admin». Cualquiera escribe qué pasó; van solos la pantalla, la
 * versión, el aparato y las huellas de los últimos fallos de su pantalla
 * (`lib/reportar-fallo.ts`), que el superadmin ve agrupados. El admin los ve
 * todos en «Problemas reportados» y responde; la respuesta le llega al autor.
 */

interface Reporte {
    id: string;
    autorId: string;
    autor: string | null;
    rolDelAutor: string | null;
    texto: string;
    pantalla: string | null;
    version: string | null;
    aparato: string | null;
    estado: 'abierto' | 'visto' | 'resuelto';
    respuesta: string | null;
    creadoEn: string;
}

const ROL: Record<string, string> = { ADMIN: 'Admin', TEACHER: 'Profesor', STUDENT: 'Alumno', TUTOR: 'Representante' };
const ESTADO: Record<Reporte['estado'], { texto: string; clase: string; icono: typeof CircleDot }> = {
    abierto: { texto: 'Nuevo', clase: 'bg-amber-100 text-amber-900', icono: CircleDot },
    visto: { texto: 'Visto', clase: 'bg-sky-100 text-sky-900', icono: Eye },
    resuelto: { texto: 'Resuelto', clase: 'bg-green-100 text-green-900', icono: CheckCircle2 },
};
const cuando = (iso: string) => new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function useReportes(estado?: string) {
    return useQuery({
        queryKey: ['reportes-de-problemas', estado ?? 'todos'],
        queryFn: async () => (await api.get('/reportes-de-problemas', { params: estado ? { estado } : {} })).data as { reportes: Reporte[]; total: number },
    });
}

function EstadoDelReporte({ estado }: { estado: Reporte['estado'] }) {
    const e = ESTADO[estado] ?? ESTADO.abierto;
    const Icono = e.icono;
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', e.clase)}>
            <Icono className="h-3.5 w-3.5" aria-hidden />
            {e.texto}
        </span>
    );
}

/** Para todos: escribir qué pasó, y ver lo que uno ya mandó (con la respuesta). */
export function ReportarUnProblema() {
    const [texto, setTexto] = React.useState('');
    const qc = useQueryClient();
    const { data, isLoading } = useReportes();
    const mandar = useMutation({
        mutationFn: async () =>
            api.post('/reportes-de-problemas', {
                texto: texto.trim(),
                pantalla: typeof document !== 'undefined' ? document.referrer.replace(window.location.origin, '').slice(0, 300) || undefined : undefined,
                version: (window as any).__versionDeLaApp ?? undefined,
                aparato: navigator.userAgent.slice(0, 200),
                huellas: lasUltimasHuellas(),
            }),
        onSuccess: () => {
            setTexto('');
            toast.success('Enviado: le llegó al liceo');
            void qc.invalidateQueries({ queryKey: ['reportes-de-problemas'] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo enviar. Necesita conexión.')),
    });

    return (
        <div className="space-y-6">
            <Grupo titulo="¿Qué pasó?" descripcion="Cuenta qué hacías y qué salió mal. Se envía también la versión de la app; nada de tus datos.">
                <form
                    className="space-y-3 p-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (texto.trim().length >= 3) mandar.mutate();
                    }}
                >
                    <label htmlFor="reporte-texto" className="sr-only">
                        Qué pasó
                    </label>
                    <textarea
                        id="reporte-texto"
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        maxLength={2000}
                        rows={5}
                        placeholder="Ej.: al abrir mi boleta sale en blanco"
                        className="w-full resize-y rounded-2xl bg-gray-50 p-3 text-[15px] text-gray-900 outline-none ring-1 ring-gray-200 placeholder:text-gray-500 focus:ring-2 focus:ring-indigo-500"
                    />
                    <BotonGuardar texto="Enviar al liceo" guardando={mandar.isPending} disabled={texto.trim().length < 3} />
                </form>
            </Grupo>
            {isLoading ? (
                <CargandoAjustes />
            ) : data && data.reportes.length > 0 ? (
                <Grupo titulo="Lo que has enviado">
                    {data.reportes.map((r) => (
                        <div key={r.id} className="space-y-1.5 px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                                <EstadoDelReporte estado={r.estado} />
                                <span className="text-xs text-gray-600">{cuando(r.creadoEn)}</span>
                            </div>
                            <p className="whitespace-pre-wrap break-words text-[15px] text-gray-900">{r.texto}</p>
                            {r.respuesta && (
                                <p className="flex gap-2 rounded-xl bg-gray-50 p-2.5 text-sm text-gray-800">
                                    <MessageSquareReply className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" aria-hidden />
                                    <span className="whitespace-pre-wrap break-words">{r.respuesta}</span>
                                </p>
                            )}
                        </div>
                    ))}
                </Grupo>
            ) : null}
        </div>
    );
}

/** Para el admin: todos los reportes del liceo, con su estado y la respuesta. */
export function ProblemasReportados() {
    const [filtro, setFiltro] = React.useState<'pendientes' | 'resuelto'>('pendientes');
    const { data, isLoading } = useReportes(filtro === 'resuelto' ? 'resuelto' : undefined);
    const lista = (data?.reportes ?? []).filter((r) => (filtro === 'resuelto' ? r.estado === 'resuelto' : r.estado !== 'resuelto'));
    const [abierto, setAbierto] = React.useState<string | null>(null);

    return (
        <div className="space-y-4">
            <div className="flex rounded-full bg-gray-100 p-1" role="group" aria-label="Qué reportes ver">
                {(['pendientes', 'resuelto'] as const).map((f) => (
                    <button
                        key={f}
                        type="button"
                        aria-pressed={filtro === f}
                        onClick={() => setFiltro(f)}
                        className={cn('min-h-[44px] flex-1 rounded-full text-sm font-semibold', filtro === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}
                    >
                        {f === 'pendientes' ? 'Por atender' : 'Resueltos'}
                    </button>
                ))}
            </div>
            {isLoading ? (
                <CargandoAjustes />
            ) : lista.length === 0 ? (
                <p className="px-4 text-sm text-gray-600">{filtro === 'pendientes' ? 'Nada por atender.' : 'Aún no hay reportes resueltos.'}</p>
            ) : (
                <Grupo>
                    {lista.map((r) => (
                        <ReporteDelAdmin key={r.id} r={r} abierto={abierto === r.id} alTocar={() => setAbierto(abierto === r.id ? null : r.id)} />
                    ))}
                </Grupo>
            )}
            {data && data.total > 20 && <p className="px-4 text-xs text-gray-600">Se ven los 20 más recientes de {data.total}.</p>}
        </div>
    );
}

function ReporteDelAdmin({ r, abierto, alTocar }: { r: Reporte; abierto: boolean; alTocar: () => void }) {
    const qc = useQueryClient();
    const [respuesta, setRespuesta] = React.useState(r.respuesta ?? '');
    const cambiar = useMutation({
        mutationFn: async (cuerpo: { estado?: string; respuesta?: string }) => api.patch(`/reportes-de-problemas/${r.id}`, cuerpo),
        onSuccess: () => void qc.invalidateQueries({ queryKey: ['reportes-de-problemas'] }),
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar')),
    });
    return (
        <div className="px-4 py-3">
            <button
                type="button"
                onClick={() => {
                    alTocar();
                    if (!abierto && r.estado === 'abierto') cambiar.mutate({ estado: 'visto' });
                }}
                aria-expanded={abierto}
                className="flex min-h-[44px] w-full items-start justify-between gap-3 text-left"
            >
                <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-gray-900">
                        {r.autor ?? 'Alguien'} <span className="font-normal text-gray-600">· {ROL[r.rolDelAutor ?? ''] ?? ''}</span>
                    </span>
                    <span className={cn('mt-0.5 block text-sm text-gray-800', !abierto && 'line-clamp-2')}>{r.texto}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                    <EstadoDelReporte estado={r.estado} />
                    <span className="text-xs text-gray-600">{cuando(r.creadoEn)}</span>
                </span>
            </button>
            {abierto && (
                <div className="mt-3 space-y-3">
                    <p className="text-xs text-gray-600">
                        {r.pantalla ? `Pantalla: ${r.pantalla}` : 'Sin pantalla'} {r.version ? `· versión ${r.version}` : ''}
                    </p>
                    <label htmlFor={`resp-${r.id}`} className="text-sm font-medium text-gray-800">
                        Respuesta (le llega a quien lo envió)
                    </label>
                    <textarea
                        id={`resp-${r.id}`}
                        value={respuesta}
                        onChange={(e) => setRespuesta(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        className="w-full rounded-2xl bg-gray-50 p-3 text-[15px] text-gray-900 outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={cambiar.isPending || !respuesta.trim()}
                            onClick={() => cambiar.mutate({ respuesta: respuesta.trim() })}
                            className="min-h-[44px] rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-60"
                        >
                            Responder
                        </button>
                        <button
                            type="button"
                            disabled={cambiar.isPending}
                            onClick={() => cambiar.mutate({ estado: r.estado === 'resuelto' ? 'visto' : 'resuelto', ...(respuesta.trim() ? { respuesta: respuesta.trim() } : {}) })}
                            className="min-h-[44px] rounded-full px-5 text-sm font-semibold text-gray-800 ring-1 ring-gray-300"
                        >
                            {r.estado === 'resuelto' ? 'Reabrir' : 'Marcar resuelto'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
