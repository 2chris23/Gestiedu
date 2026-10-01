'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, X } from 'lucide';
import { Search, UserRound } from 'lucide-react';
import api from '@/lib/axios';
import { userService } from '@/services/user.service';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useConfirm } from '@/hooks/useConfirm';
import { BotonIcono } from '@/components/ui/boton-icono';
import { cn } from '@/lib/utils';

/**
 * LOS REPRESENTANTES DE UN ALUMNO
 *
 * Quién es el representante de un alumno decide quién ve sus notas, su
 * asistencia y sus observaciones. Por eso solo lo toca el administrador —la
 * ruta del servidor lo exige; esta pantalla ya solo la abre él—.
 *
 * Buscar y asignar en el mismo sitio: se escribe el nombre o la cédula, se toca
 * al representante, se toca el parentesco, y listo. Tres toques.
 */

interface Vinculo {
    relationship: string;
    tutor: { id: string; firstName: string; lastName: string; email: string; phone?: string | null };
}

const PARENTESCOS = ['Madre', 'Padre', 'Abuela', 'Abuelo', 'Tía', 'Tío', 'Hermana', 'Hermano', 'Representante legal'];

const mensajeDe = (error: any, porDefecto: string) =>
    error?.response?.data?.error || error?.message || porDefecto;

export function RepresentantesDelAlumno({ studentId }: { studentId: string }) {
    const cola = useQueryClient();
    const confirmar = useConfirm();
    const clave = ['alumno', studentId, 'representantes'];

    const { data: vinculos = [], isLoading } = useQuery({
        queryKey: clave,
        queryFn: async () => (await api.get(`/users/${studentId}/tutors`)).data.tutors as Vinculo[],
    });

    const [agregando, setAgregando] = React.useState(false);
    const [busqueda, setBusqueda] = React.useState('');
    const [elegido, setElegido] = React.useState<Vinculo['tutor'] | null>(null);
    const [otroParentesco, setOtroParentesco] = React.useState('');
    const buscar = useDebouncedValue(busqueda.trim(), 300);

    const { data: encontrados = [], isFetching: buscando } = useQuery({
        queryKey: ['representantes', 'buscar', buscar],
        queryFn: async () =>
            (await userService.getUsers({ role: 'TUTOR', search: buscar, limit: 8, status: 'ACTIVE' })).users,
        enabled: agregando && buscar.length >= 2,
        staleTime: 30_000,
    });

    const yaAsignados = new Set(vinculos.map((v) => v.tutor.id));

    const cerrar = () => {
        setAgregando(false);
        setBusqueda('');
        setElegido(null);
        setOtroParentesco('');
    };

    const asignar = useMutation({
        mutationFn: async (relationship: string) =>
            api.post(`/users/${studentId}/tutors`, { tutorId: elegido!.id, relationship }),
        onSuccess: () => {
            toast.success('Representante asignado');
            cola.invalidateQueries({ queryKey: clave });
            cerrar();
        },
        onError: (e) => toast.error(mensajeDe(e, 'No se pudo asignar')),
    });

    const quitar = useMutation({
        mutationFn: async (tutorId: string) => api.delete(`/users/${studentId}/tutors/${tutorId}`),
        onSuccess: () => {
            toast.success('Representante quitado');
            cola.invalidateQueries({ queryKey: clave });
        },
        onError: (e) => toast.error(mensajeDe(e, 'No se pudo quitar')),
    });

    const pedirQuitar = async (v: Vinculo) => {
        const si = await confirmar({
            title: `¿Quitar a ${v.tutor.firstName} ${v.tutor.lastName}?`,
            description: 'Dejará de ver las notas, la asistencia y las observaciones de este estudiante.',
            confirmLabel: 'Quitar',
        });
        if (si) quitar.mutate(v.tutor.id);
    };

    return (
        <div className="mt-2 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Representantes</span>
                {!agregando && (
                    <BotonIcono icono={Plus} etiqueta="Asignar representante" tono="suave" medida="pequeno" onClick={() => setAgregando(true)} />
                )}
            </div>

            {isLoading ? (
                <div className="mt-2 h-10 animate-pulse rounded-lg bg-gray-100" />
            ) : vinculos.length === 0 && !agregando ? (
                <p className="mt-1 text-sm italic text-gray-400">Sin representante asignado</p>
            ) : (
                <ul className="mt-2 space-y-1.5">
                    {vinculos.map((v) => (
                        <li key={v.tutor.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                            <UserRound size={16} className="shrink-0 text-gray-400" />
                            <Link href={`/dashboard/usuarios/${v.tutor.id}`} className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-gray-800">
                                    {v.tutor.firstName} {v.tutor.lastName}
                                </p>
                                <p className="truncate text-xs text-gray-500">
                                    {v.relationship} · {v.tutor.phone || v.tutor.email}
                                </p>
                            </Link>
                            <BotonIcono
                                icono={Trash2}
                                etiqueta="Quitar representante"
                                tono="peligro"
                                medida="pequeno"
                                disabled={quitar.isPending}
                                onClick={() => pedirQuitar(v)}
                            />
                        </li>
                    ))}
                </ul>
            )}

            {agregando && (
                <div className="mt-3 space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                    {!elegido ? (
                        <>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        autoFocus
                                        value={busqueda}
                                        onChange={(e) => setBusqueda(e.target.value)}
                                        placeholder="Nombre o cédula del representante"
                                        className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                    />
                                </div>
                                <BotonIcono icono={X} etiqueta="Cancelar" medida="pequeno" onClick={cerrar} />
                            </div>
                            {buscar.length >= 2 && (
                                <ul className="max-h-56 space-y-1 overflow-y-auto">
                                    {buscando && encontrados.length === 0 && (
                                        <li className="px-2 py-1.5 text-xs text-gray-400">Buscando…</li>
                                    )}
                                    {!buscando && encontrados.length === 0 && (
                                        <li className="px-2 py-1.5 text-xs text-gray-500">
                                            No hay representantes con ese nombre. Créalo primero en Usuarios con el rol Tutor.
                                        </li>
                                    )}
                                    {encontrados.map((t: any) => {
                                        const ya = yaAsignados.has(t.id);
                                        return (
                                            <li key={t.id}>
                                                <button
                                                    type="button"
                                                    disabled={ya}
                                                    onClick={() => setElegido(t)}
                                                    className={cn(
                                                        'w-full rounded-lg px-2 py-1.5 text-left transition-colors',
                                                        ya ? 'cursor-not-allowed opacity-50' : 'hover:bg-white'
                                                    )}
                                                >
                                                    <span className="block text-sm font-medium text-gray-800">
                                                        {t.firstName} {t.lastName}
                                                    </span>
                                                    <span className="block text-xs text-gray-500">
                                                        {t.id}
                                                        {ya ? ' · ya asignado' : ''}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm text-gray-700">
                                    <span className="font-semibold">{elegido.firstName} {elegido.lastName}</span> es su…
                                </p>
                                <BotonIcono icono={X} etiqueta="Elegir otro" medida="pequeno" onClick={() => setElegido(null)} />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {PARENTESCOS.map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        disabled={asignar.isPending}
                                        onClick={() => asignar.mutate(p)}
                                        className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-600 hover:text-white disabled:opacity-50"
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <form
                                className="flex gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (otroParentesco.trim().length >= 2) asignar.mutate(otroParentesco.trim());
                                }}
                            >
                                <input
                                    value={otroParentesco}
                                    onChange={(e) => setOtroParentesco(e.target.value)}
                                    maxLength={40}
                                    placeholder="Otro parentesco"
                                    className="h-9 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                />
                                <button
                                    type="submit"
                                    disabled={otroParentesco.trim().length < 2 || asignar.isPending}
                                    className="rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white disabled:opacity-40"
                                >
                                    Asignar
                                </button>
                            </form>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
