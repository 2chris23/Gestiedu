'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HeartHandshake } from 'lucide-react';
import { BotonGuardar, CargandoAjustes, Fila, FilaCampo, FilaInterruptor, Grupo } from '@/components/configuracion/ajustes';
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

    if (isLoading || !r) return <CargandoAjustes />;

    return (
        <div className="space-y-4">
            <Grupo
                id="reglas-labor-social"
                titulo="Labor social"
                descripcion="Las horas comunitarias. Se anotan en cada sección (Académico → el año → la sección → «Labor social») y se suman de un año a otro."
            >
                <FilaInterruptor icono={HeartHandshake} titulo="El liceo lleva la labor social en el sistema" checked={r.activa} onChange={(v) => setR({ ...r, activa: v })} />
                <Fila etiqueta="La hacen los alumnos de" apilada>
                    <div role="group" aria-label="La hacen los alumnos de" className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5, 6].map((g) => {
                            const si = r.grados.includes(g);
                            return (
                                <button
                                    key={g}
                                    type="button"
                                    aria-pressed={si}
                                    aria-label={`${g}º año`}
                                    onClick={() => setR({ ...r, grados: si ? r.grados.filter((x) => x !== g) : [...r.grados, g].sort((a, b) => a - b) })}
                                    className={
                                        si
                                            ? 'h-11 min-w-[52px] rounded-full bg-indigo-600 px-3 text-sm font-semibold text-white'
                                            : 'h-11 min-w-[52px] rounded-full bg-gray-100 px-3 text-sm font-medium text-gray-700 hover:bg-gray-200'
                                    }
                                >
                                    {g}º
                                </button>
                            );
                        })}
                    </div>
                </Fila>
                <FilaCampo
                    etiqueta="Horas en total"
                    ayuda="0 = por proyecto."
                    inputMode="numeric"
                    value={r.horas}
                    onChange={(e) => setR({ ...r, horas: e.target.value.replace(/[^\d]/g, '') })}
                />
                <Fila etiqueta="Para egresar" apilada>
                    <Lista
                        etiqueta="Para egresar"
                        valor={r.paraEgresar}
                        alCambiar={(v) => setR({ ...r, paraEgresar: v as ReglasDeLaborSocial['paraEgresar'] })}
                        className="border-0 bg-gray-100 font-normal shadow-none"
                        opciones={[
                            { valor: 'AVISA', texto: 'Se avisa, pero egresa' },
                            { valor: 'BLOQUEA', texto: 'Sin ella no egresa' },
                            { valor: 'NO', texto: 'No cuenta para egresar' },
                        ]}
                    />
                </Fila>
                <Fila etiqueta="Quién anota las actividades" apilada>
                    <Lista
                        etiqueta="Quién anota las actividades"
                        valor={r.quienAnota ?? 'ADMIN_Y_GUIA'}
                        alCambiar={(v) => setR({ ...r, quienAnota: v as NonNullable<ReglasDeLaborSocial['quienAnota']> })}
                        className="border-0 bg-gray-100 font-normal shadow-none"
                        opciones={[
                            { valor: 'ADMIN_Y_GUIA', texto: 'El admin y el profesor guía' },
                            { valor: 'SOLO_ADMIN', texto: 'Solo el admin' },
                        ]}
                    />
                </Fila>
            </Grupo>
            <BotonGuardar type="button" texto="Guardar la labor social" onClick={() => guardar.mutate()} guardando={guardar.isPending} disabled={r.grados.length === 0} />
        </div>
    );
}

export default ReglasDeLaLaborSocial;
