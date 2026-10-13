'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HeartHandshake, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Lista } from '@/components/ui/lista';
import { instituteService } from '@/services/institute.service';
import { laborSocial, REGLAS_DE_LABOR_SOCIAL_POR_DEFECTO, type ReglasDeLaborSocial } from '@/lib/labor-social';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * LAS REGLAS DE LA LABOR SOCIAL, EN CONFIGURACIÓN → ACADÉMICA
 *
 * Vivían arriba de la pantalla «Labor social»; Cristian las quiso con las
 * demás reglas del liceo (2026-10-12), y la labor social, dentro de cada
 * sección. Lo del MPPE es solo lo que sale de primeras: 5to año, 60 horas,
 * y la anotan el admin y el guía. Se cambia todo, también quién la anota.
 */
export function ReglasDeLaLaborSocial() {
    const cola = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['reglas-academicas'],
        queryFn: () => instituteService.getAcademicConfig(),
    });
    const guardadas = data?.laborSocial ?? REGLAS_DE_LABOR_SOCIAL_POR_DEFECTO;
    const [r, setR] = React.useState<(ReglasDeLaborSocial & { horas: string }) | null>(null);
    React.useEffect(() => {
        if (data) setR({ ...REGLAS_DE_LABOR_SOCIAL_POR_DEFECTO, ...guardadas, horas: String(guardadas.horasRequeridas) });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    const guardar = useMutation({
        mutationFn: () =>
            laborSocial.guardarReglas({
                activa: r!.activa,
                grados: r!.grados,
                horasRequeridas: Number(r!.horas) || 0,
                paraEgresar: r!.paraEgresar,
                quienAnota: r!.quienAnota ?? 'ADMIN_Y_GUIA',
            }),
        onSuccess: () => {
            toast.success('Reglas de la labor social guardadas');
            void cola.invalidateQueries({ queryKey: ['reglas-academicas'] });
            void cola.invalidateQueries({ queryKey: ['academicConfig'] });
            void cola.invalidateQueries({ queryKey: ['labor-social'] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudieron guardar')),
    });

    return (
        <section aria-labelledby="reglas-labor-social" className="border-t border-gray-200 pt-6">
            <h3 id="reglas-labor-social" className="mb-1 text-lg font-medium text-gray-900">
                <HeartHandshake className="mr-2 inline h-5 w-5" aria-hidden />
                Labor social
            </h3>
            <p className="mb-4 text-sm text-gray-600">
                Las horas comunitarias. Se anotan dentro de cada sección (Académico → el año → la sección → «Labor social») y se suman de un
                año a otro.
            </p>
            {isLoading || !r ? (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
                </p>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex min-h-[44px] items-center gap-3 text-sm text-gray-800 md:col-span-2">
                        <Checkbox checked={r.activa} onCheckedChange={(v) => setR({ ...r, activa: v === true })} aria-label="Labor social activa" />
                        El liceo lleva la labor social en el sistema
                    </label>
                    <div className="text-sm text-gray-800">
                        <span className="mb-1 block font-medium">La hacen los alumnos de</span>
                        <div className="flex flex-wrap gap-x-3">
                            {[1, 2, 3, 4, 5, 6].map((g) => (
                                <label key={g} className="flex min-h-[44px] items-center gap-2">
                                    <Checkbox
                                        checked={r.grados.includes(g)}
                                        onCheckedChange={(v) =>
                                            setR({ ...r, grados: v === true ? [...r.grados, g].sort((a, b) => a - b) : r.grados.filter((x) => x !== g) })
                                        }
                                        aria-label={`${g}º año`}
                                    />
                                    {g}º
                                </label>
                            ))}
                        </div>
                    </div>
                    <label className="text-sm font-medium text-gray-800">
                        Horas que hay que cumplir en total (0 = por proyecto)
                        <input
                            inputMode="numeric"
                            value={r.horas}
                            onChange={(e) => setR({ ...r, horas: e.target.value.replace(/[^\d]/g, '') })}
                            className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm font-normal"
                        />
                    </label>
                    <div className="text-sm text-gray-800">
                        <span className="mb-1 block font-medium">Para egresar</span>
                        <Lista
                            etiqueta="Para egresar"
                            valor={r.paraEgresar}
                            alCambiar={(v) => setR({ ...r, paraEgresar: v as ReglasDeLaborSocial['paraEgresar'] })}
                            opciones={[
                                { valor: 'AVISA', texto: 'Se avisa, pero egresa' },
                                { valor: 'BLOQUEA', texto: 'Sin ella no egresa' },
                                { valor: 'NO', texto: 'No cuenta para egresar' },
                            ]}
                        />
                    </div>
                    <div className="text-sm text-gray-800">
                        <span className="mb-1 block font-medium">Quién anota las actividades</span>
                        <Lista
                            etiqueta="Quién anota las actividades"
                            valor={r.quienAnota ?? 'ADMIN_Y_GUIA'}
                            alCambiar={(v) => setR({ ...r, quienAnota: v as NonNullable<ReglasDeLaborSocial['quienAnota']> })}
                            opciones={[
                                { valor: 'ADMIN_Y_GUIA', texto: 'El admin y el profesor guía' },
                                { valor: 'SOLO_ADMIN', texto: 'Solo el admin' },
                            ]}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <button
                            type="button"
                            onClick={() => guardar.mutate()}
                            disabled={guardar.isPending || r.grados.length === 0}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar la labor social
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}

export default ReglasDeLaLaborSocial;
