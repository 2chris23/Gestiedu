'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import { HojaImprimible, Parrafos } from '@/components/documentos/HojaImprimible';
import { useActaDeSocializacion, type AlumnoDeLaLista } from '@/hooks/useInstrumentos';

/**
 * EL ACTA DE SOCIALIZACIÓN DEL PLAN, PARA IMPRIMIR
 *
 * «Después de socializar el plan… firman conforme»: el texto del liceo
 * (plantilla `ACTA_SOCIALIZACION_PLAN`, editable en Configuración →
 * Documentos) y la lista de la sección para firmar, dos columnas de veinte por
 * hoja, como la entrega un profesor. Los huecos de más son para quien entre
 * después. `?lapso=1|2|3`.
 */
const CELDA = 'border border-gray-500 px-1.5 py-1';
const POR_HOJA = 40;

function Mitad({ filas, desde }: { filas: Array<AlumnoDeLaLista | null>; desde: number }) {
    return (
        // En el teléfono se desliza de lado; en el papel, entera.
        <div className="relative overflow-x-auto print:overflow-visible" data-carril-a-proposito>
        <table className="w-full border-collapse text-[11px]">
            <thead>
                <tr className="bg-gray-100">
                    <th scope="col" className={`${CELDA} w-8`}>N.º</th>
                    <th scope="col" className={CELDA}>Nombre</th>
                    <th scope="col" className={CELDA}>Apellido</th>
                    <th scope="col" className={CELDA}>Cédula</th>
                    <th scope="col" className={`${CELDA} w-24`}>Firma</th>
                </tr>
            </thead>
            <tbody>
                {filas.map((a, i) => (
                    <tr key={i} className="h-7">
                        <td className={`${CELDA} text-center`}>{desde + i}</td>
                        <td className={CELDA}>{a?.nombres ?? ''}</td>
                        <td className={CELDA}>{a?.apellidos ?? ''}</td>
                        <td className={CELDA}>{a?.id ?? ''}</td>
                        <td className={CELDA} />
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
    );
}

export default function ActaDeSocializacionPage({ params }: { params: Promise<{ classroomId: string; subjectId: string }> }) {
    const { classroomId, subjectId } = use(params);
    const lapso = useSearchParams().get('lapso') || '1';
    const { data: a, isLoading, error } = useActaDeSocializacion(decodeURIComponent(classroomId), decodeURIComponent(subjectId), lapso);

    const hojas: Array<Array<AlumnoDeLaLista | null>> = [];
    if (a) {
        const total = Math.max(POR_HOJA, Math.ceil(a.alumnos.length / POR_HOJA) * POR_HOJA);
        const todos: Array<AlumnoDeLaLista | null> = Array.from({ length: total }, (_, i) => a.alumnos[i] ?? null);
        for (let i = 0; i < todos.length; i += POR_HOJA) hojas.push(todos.slice(i, i + POR_HOJA));
    }

    return (
        <HojaImprimible
            etiqueta="Acta de socialización del plan"
            titulo={a?.titulo}
            subtitulo={a ? `${a.area} · ${a.seccion} · ${a.lapso}` : undefined}
            nombreDelArchivo={a ? `Acta de socialización — ${a.area} ${a.seccion}` : undefined}
            papel="carta-apaisada"
            paginas
            cargando={isLoading}
            error={error}
            textoDeCarga="Preparando el acta…"
        >
            {a && (
                <>
                    <Parrafos parrafos={a.parrafos} />
                    {hojas.map((hoja, h) => (
                        <div key={h} className={`mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2 ${h > 0 ? 'break-before-page' : ''}`}>
                            <Mitad filas={hoja.slice(0, POR_HOJA / 2)} desde={h * POR_HOJA + 1} />
                            <Mitad filas={hoja.slice(POR_HOJA / 2)} desde={h * POR_HOJA + POR_HOJA / 2 + 1} />
                        </div>
                    ))}
                    <p className="mt-4 text-sm font-semibold">Observaciones:</p>
                    <div className="h-10 border-b border-gray-400" />
                    <div className="grid grid-cols-2 gap-16 break-inside-avoid pt-12 text-center text-xs">
                        <div className="border-t border-gray-600 pt-1">
                            Firma del docente
                            <span className="block font-medium">{a.docente}</span>
                        </div>
                        <div className="border-t border-gray-600 pt-1">Firma del coordinador</div>
                    </div>
                </>
            )}
        </HojaImprimible>
    );
}
