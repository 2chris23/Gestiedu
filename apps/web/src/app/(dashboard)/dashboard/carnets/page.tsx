'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Printer } from 'lucide-react';
import api from '@/lib/axios';
import { getAssetUrl } from '@/config/env';
import { useMembrete } from '@/hooks/useMembrete';
import { esFotoDelSistema, useFotoDePerfil } from '@/hooks/useFotoDePerfil';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * LOS CARNETS, PARA IMPRIMIR
 *
 * `?alumno=<cédula>` (uno) o `?seccion=<id>` (la sección entera, diez por
 * hoja carta). Tamaño tarjeta: 85,6 × 54 mm. Foto del perfil (sin foto, el
 * hueco para pegarla), nombre, cédula, sección, año escolar, el liceo y la
 * firma del director. Sin QR, decidido (`services/carnet.service.ts`). En
 * pantalla sale algo más grande y con letra legible; al imprimir, a su tamaño.
 * Solo el admin.
 */

interface Carnet {
    id: string;
    nombres: string;
    apellidos: string;
    tipoDeCedula: string | null;
    foto: string | null;
    seccion: string;
    ciclo: string;
}
interface Hoja {
    liceo: { nombre: string; codigoDea: string | null };
    firmante: { nombre: string | null; cargo: string };
    seccion?: string;
    carnets: Carnet[];
}

function Foto({ src, nombre }: { src: string | null; nombre: string }) {
    const { data } = useFotoDePerfil(src, true);
    const imagen = esFotoDelSistema(src) ? data : src;
    return imagen ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagen} alt={`Foto de ${nombre}`} className="h-full w-full object-cover" />
    ) : (
        <span className="flex h-full w-full items-center justify-center text-center text-xs print:text-[9px] leading-tight text-gray-500">Foto</span>
    );
}

export default function CarnetsPage() {
    const router = useRouter();
    const buscar = useSearchParams();
    const alumno = buscar.get('alumno');
    const seccion = buscar.get('seccion');
    const { data: m } = useMembrete();
    const { data: h, isLoading, error } = useQuery<Hoja>({
        queryKey: ['carnets', alumno, seccion],
        queryFn: async () =>
            (await api.get(alumno ? `/students/${encodeURIComponent(alumno)}/carnet` : `/classrooms/${encodeURIComponent(seccion ?? '')}/carnets`)).data.data,
        enabled: Boolean(alumno || seccion),
    });
    const logo = m?.logo ? getAssetUrl(m.logo) : null;

    if (isLoading) return <div className="p-8 text-sm text-gray-600">Preparando los carnets…</div>;
    if (error || !h) return <div className="p-8 text-sm text-red-600">{getApiErrorMessage(error, 'No se pudieron preparar los carnets.')}</div>;

    return (
        <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
            <style>{`@media print { @page { size: letter; margin: 10mm; } }`}</style>
            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                <button onClick={() => router.back()} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
                    <ChevronLeft className="h-4 w-4" aria-hidden /> Volver
                </button>
                <p className="text-sm text-gray-700">
                    {h.carnets.length === 1 ? '1 carnet' : `${h.carnets.length} carnets`}
                    {h.seccion ? ` · ${h.seccion}` : ''}
                </p>
                <button
                    onClick={() => window.print()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    <Printer className="h-4 w-4" aria-hidden /> Imprimir
                </button>
            </div>
            <ul className="grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-[4mm]" aria-label="Carnets">
                {h.carnets.map((c) => (
                    <li
                        key={c.id}
                        aria-label={`Carnet de ${c.nombres} ${c.apellidos}`}
                        className="flex w-full max-w-[380px] break-inside-avoid flex-col overflow-hidden rounded-lg border border-gray-400 bg-white text-gray-900 print:h-[54mm] print:w-[85.6mm]"
                        style={{ aspectRatio: '85.6 / 54' }}
                    >
                        <div className="flex items-center gap-2 bg-indigo-700 px-2 py-1 text-white print:bg-indigo-700" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                            {logo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logo} alt="" className="h-6 w-6 shrink-0 rounded bg-white object-contain p-0.5" />
                            )}
                            <p className="min-w-0 truncate text-xs print:text-[11px] font-bold uppercase leading-tight">{m?.nombre || h.liceo.nombre}</p>
                        </div>
                        <div className="flex flex-1 gap-2 p-2">
                            <div className="h-full w-[22mm] shrink-0 overflow-hidden rounded border border-gray-300 bg-gray-50">
                                <Foto src={c.foto} nombre={c.nombres} />
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col text-xs print:text-[11px] leading-tight">
                                <p className="text-xs print:text-[9px] font-semibold uppercase tracking-wide text-indigo-800">Carnet estudiantil</p>
                                <p className="mt-0.5 truncate text-sm print:text-[13px] font-bold">{c.apellidos}</p>
                                <p className="truncate">{c.nombres}</p>
                                <p className="mt-1">
                                    <span className="text-gray-600">{c.tipoDeCedula === 'ESCOLAR' ? 'C. escolar' : 'C.I.'}</span> <span className="font-mono font-semibold">{c.id}</span>
                                </p>
                                <p>
                                    {c.seccion} · {c.ciclo}
                                </p>
                                <div className="mt-auto border-t border-gray-500 pt-0.5 text-center text-xs print:text-[8px] text-gray-700">{h.firmante.cargo}</div>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
