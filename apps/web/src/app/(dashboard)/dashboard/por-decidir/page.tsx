'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hourglass, Scale } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { Button } from '@/components/ui';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { getApiErrorMessage, cn } from '@/lib/utils';

/**
 * POR DECIDIR (2026-09-30)
 *
 * Lo que alguien hizo sin conexión y que choca con algo tuyo lo decides tú
 * (así lo quiso Cristian):
 *   - notas para una actividad que borraste → ¿la recuperas con ellas?
 *   - notas con un instrumento que cambiaste → ¿aún quieres el nuevo?
 * Y abajo, lo tuyo que espera a que otro decida.
 */

interface Espera {
    id: string;
    tipo: 'NOTAS_A_ACTIVIDAD_BORRADA' | 'MARCAS_CON_OTRO_INSTRUMENTO';
    objetivo: string;
    datos: any;
    motivo: string;
    creadoEn: string;
    autorNombre: string;
    decideNombre: string;
}

const TIPOS: Record<string, string> = { COTEJO: 'lista de cotejo', ESCALA: 'escala de estimación', RUBRICA: 'rúbrica', PUNTOS: 'evaluación por puntos' };
const tipoDe = (t: unknown) => TIPOS[String(t)] ?? 'instrumento';
const cuantas = (d: any) => Object.keys(d?.scores ?? d?.marcas ?? {}).length;

function Pregunta({ e, alDecidir, decidiendo }: { e: Espera; alDecidir: (d: string) => void; decidiendo: boolean }) {
    const titulo = e.datos?.titulo ?? 'la actividad';
    if (e.tipo === 'NOTAS_A_ACTIVIDAD_BORRADA') {
        return (
            <>
                <p className="text-sm text-gray-800">
                    <b>{e.autorNombre}</b> le había puesto nota a <b>{cuantas(e.datos)}</b> alumno(s) en <b>«{titulo}»</b> sin conexión, y la borraste antes de que llegaran.
                    ¿La recuperas con esas notas?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="contorno" disabled={decidiendo} onClick={() => alDecidir('dejar')}>
                        Dejarla borrada
                    </Button>
                    <Button disabled={decidiendo} onClick={() => alDecidir('recuperar')}>
                        Recuperarla con sus notas
                    </Button>
                </div>
            </>
        );
    }
    const usado = tipoDe(e.datos?.instrumento?.tipo);
    const nuevo = tipoDe(e.datos?.nuevo?.tipo);
    return (
        <>
            <p className="text-sm text-gray-800">
                <b>{e.autorNombre}</b> calificó <b>«{titulo}»</b> con la <b>{usado}</b> ({cuantas(e.datos)} alumno(s)) antes de que la cambiaras a <b>{nuevo}</b>. ¿Aún quieres la {nuevo}?
            </p>
            <p className="mt-1 text-xs text-gray-600">Si sí, esas notas se borran y se le avisa para que califique de nuevo. Si no, se queda la {usado} con sus notas.</p>
            <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="contorno" disabled={decidiendo} onClick={() => alDecidir('anterior')}>
                    No: dejar la {usado}
                </Button>
                <Button disabled={decidiendo} onClick={() => alDecidir('nuevo')}>
                    Sí: la {nuevo}
                </Button>
            </div>
        </>
    );
}

export default function PorDecidirPage() {
    const cola = useQueryClient();
    const resaltado = useSearchParams().get('cambio');
    const { data, isLoading } = useQuery({
        queryKey: ['cambios-en-espera'],
        queryFn: async () => (await api.get('/cambios-en-espera')).data as { porDecidir: Espera[]; esperando: Espera[] },
    });
    const decidir = useMutation({
        mutationFn: async ({ id, decision }: { id: string; decision: string }) => (await api.post(`/cambios-en-espera/${id}/decidir`, { decision })).data,
        onSuccess: () => {
            toast.success('Hecho: se le avisó a quien lo hizo');
            void cola.invalidateQueries({ queryKey: ['cambios-en-espera'] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo decidir')),
    });

    const porDecidir = data?.porDecidir ?? [];
    const esperando = data?.esperando ?? [];

    return (
        <div className="mx-auto max-w-2xl space-y-6 p-4">
            <EncabezadoDePantalla titulo="Por decidir" descripcion="Lo que se hizo sin conexión y choca con algo tuyo" />
            {isLoading ? (
                <p className="text-sm text-gray-600">Cargando…</p>
            ) : porDecidir.length === 0 ? (
                <p className="rounded-2xl bg-white p-4 text-sm text-gray-700 ring-1 ring-gray-200">No hay nada por decidir.</p>
            ) : (
                <ul className="space-y-3">
                    {porDecidir.map((e) => (
                        <li key={e.id} className={cn('rounded-2xl bg-white p-4 ring-1', e.id === resaltado ? 'ring-2 ring-amber-400' : 'ring-gray-200')}>
                            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
                                <Scale className="h-4 w-4" aria-hidden /> Por decidir
                            </p>
                            <Pregunta e={e} decidiendo={decidir.isPending} alDecidir={(decision) => decidir.mutate({ id: e.id, decision })} />
                        </li>
                    ))}
                </ul>
            )}
            {esperando.length > 0 && (
                <section className="space-y-2">
                    <h2 className="text-sm font-bold text-gray-800">Lo tuyo que espera a otro</h2>
                    <ul className="space-y-2">
                        {esperando.map((e) => (
                            <li key={e.id} className="flex items-start gap-2 rounded-2xl bg-white p-3 text-sm text-gray-700 ring-1 ring-gray-200">
                                <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
                                <span>
                                    «{e.datos?.titulo ?? 'La actividad'}»: espera a que <b>{e.decideNombre}</b> decida. {e.motivo}.
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
