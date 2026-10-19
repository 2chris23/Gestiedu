'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ExternalLink } from 'lucide-react';
import api from '@/lib/axios';
import { Grupo } from '@/components/configuracion/ajustes';
import { TextoLegal } from '@/components/legal/TextoLegal';
import { ACTUALIZADO, losDocumentos } from '@/lib/legal/documentos';
import { elTitular } from '@/lib/legal/titular';
import { cn } from '@/lib/utils';

/**
 * CONFIGURACIÓN → INFORMACIÓN LEGAL (19-oct-2026), para todos los roles
 *
 * Como las demás apps: cuándo aceptó cada uno los términos y la privacidad, y
 * cada documento para leerlo aquí mismo (el mismo texto que `/legal/<id>`).
 */
export default function InformacionLegal() {
    const [abierto, setAbierto] = React.useState<string | null>(null);
    const { data } = useQuery({
        queryKey: ['legal', 'mi-aceptacion', 'configuracion'],
        queryFn: async () => (await api.get('/legal/mi-aceptacion')).data.data as { version: string; aceptada: boolean; aceptadaEn: string | null },
        retry: false,
    });
    const docs = losDocumentos(elTitular());
    return (
        <div className="space-y-5">
            <Grupo titulo="Tu aceptación">
                <p className="px-4 py-3 text-sm text-gray-700">
                    {data?.aceptada && data.aceptadaEn
                        ? `Aceptaste los Términos y la Política de privacidad (versión del ${ACTUALIZADO}) el ${new Date(data.aceptadaEn).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}.`
                        : data
                          ? 'Aún no has aceptado la versión vigente: se te pedirá al volver a entrar.'
                          : `Versión vigente: ${ACTUALIZADO}.`}
                </p>
            </Grupo>
            <Grupo titulo="Documentos" pie="También están en la página de Gestiedu, en Información legal.">
                <ul className="divide-y divide-gray-100" data-informacion-legal>
                    {docs.map((d) => {
                        const esEste = abierto === d.id;
                        return (
                            <li key={d.id}>
                                <button
                                    type="button"
                                    aria-expanded={esEste}
                                    onClick={() => setAbierto(esEste ? null : d.id)}
                                    className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
                                >
                                    <span>
                                        <span className="block text-[15px] font-semibold text-gray-900">{d.titulo}</span>
                                        <span className="mt-0.5 block text-sm text-gray-600">{d.resumen}</span>
                                    </span>
                                    <ChevronDown className={cn('h-5 w-5 shrink-0 text-gray-500 transition-transform', esEste && 'rotate-180')} aria-hidden />
                                </button>
                                {esEste && (
                                    <div className="space-y-4 border-t border-gray-100 px-4 py-4">
                                        <p className="text-xs text-gray-600">Para: {d.paraQuien}</p>
                                        <TextoLegal doc={d} />
                                        <a href={`/legal/${d.id}`} className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-indigo-700">
                                            <ExternalLink className="h-4 w-4" aria-hidden /> Ver la página para imprimir o compartir
                                        </a>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </Grupo>
        </div>
    );
}
