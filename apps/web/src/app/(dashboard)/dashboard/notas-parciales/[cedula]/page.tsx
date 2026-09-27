'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { HojaImprimible, Firma, Parrafos, fechaCorta } from '@/components/documentos/HojaImprimible';

/**
 * LAS NOTAS PARCIALES, PARA EL LICEO QUE LO RECIBE
 *
 * Cada lapso del año en curso y las definitivas de los años anteriores, con
 * membrete y firma. Es la versión en papel del archivo de traslado
 * (`services/traslado.service.ts`). Solo el admin.
 */

interface Hoja {
    titulo: string;
    parrafos: string[];
    firmante: { nombre: string | null; cedula: string | null; cargo: string };
    ciclo: { nombre: string };
    seccion: { grado: number; seccion: string };
    lapsos: Array<{ numero: number; nombre: string }>;
    materias: Array<{ nombre: string; cualitativa: boolean; notas: Record<string, number | null>; apreciaciones: Record<string, string | null> }>;
    anosAnteriores: Array<{ grado: number; anoEscolar: string | null; plantel: string | null; materias: Array<{ nombre: string; nota: number | null; apreciacion: string | null; tipo: string }> }>;
    retiro: { fecha: string; motivo: string | null } | null;
    emitidaEl: string;
}

const nota = (n: number | null | undefined) => (n == null ? '—' : Number.isInteger(n) ? String(n).padStart(2, '0') : n.toFixed(2));
const CELDA = 'border border-gray-300 px-2 py-1';

export default function NotasParcialesPage({ params }: { params: Promise<{ cedula: string }> }) {
    const { cedula } = use(params);
    const studentId = decodeURIComponent(cedula);
    const { data: h, isLoading, error } = useQuery<Hoja>({
        queryKey: ['notas-parciales', studentId],
        queryFn: async () => (await api.get(`/students/${encodeURIComponent(studentId)}/notas-parciales`)).data.data,
    });

    return (
        <HojaImprimible
            etiqueta="Notas parciales"
            titulo={h?.titulo}
            subtitulo={h ? `Año escolar ${h.ciclo.nombre} · ${h.seccion.grado}° año, sección «${h.seccion.seccion}»` : undefined}
            cargando={isLoading}
            error={error ?? (!isLoading && !h ? new Error('Sin datos') : null)}
            textoDeCarga="Cargando las notas…"
        >
            {h && (
                <>
                    <Parrafos parrafos={h.parrafos.slice(0, 1)} />
                    <table className="mt-4 w-full border-collapse text-sm" aria-label="Notas del año en curso">
                        <thead>
                            <tr className="bg-gray-100">
                                <th scope="col" className={`${CELDA} text-left`}>
                                    Área
                                </th>
                                {h.lapsos.map((l) => (
                                    <th key={l.numero} scope="col" className={CELDA}>
                                        {l.nombre}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {h.materias.map((m) => (
                                <tr key={m.nombre}>
                                    <th scope="row" className={`${CELDA} text-left font-medium`}>
                                        {m.nombre}
                                    </th>
                                    {h.lapsos.map((l) => (
                                        <td key={l.numero} className={`${CELDA} text-center tabular-nums`}>
                                            {m.cualitativa ? m.apreciaciones[String(l.numero)] ?? '—' : nota(m.notas[String(l.numero)])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {h.retiro && (
                        <p className="mt-2 text-sm text-gray-700">
                            Retirado el {fechaCorta(h.retiro.fecha)}
                            {h.retiro.motivo ? ` (${h.retiro.motivo})` : ''}.
                        </p>
                    )}

                    {h.anosAnteriores.length > 0 && (
                        <>
                            <h2 className="mt-6 text-sm font-bold uppercase text-gray-800">Años anteriores (definitivas)</h2>
                            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
                                {h.anosAnteriores.map((a) => (
                                    <section key={a.grado} className="break-inside-avoid rounded-lg border border-gray-300 text-xs" aria-label={`${a.grado}° año`}>
                                        <p className="border-b border-gray-300 bg-gray-50 px-2 py-1 font-semibold">
                                            {a.grado}° año{a.anoEscolar ? ` · ${a.anoEscolar}` : ''}
                                            {a.plantel ? ` · ${a.plantel}` : ''}
                                        </p>
                                        <ul className="px-2 py-1">
                                            {a.materias.map((m) => (
                                                <li key={m.nombre} className="flex justify-between">
                                                    <span>{m.nombre}</span>
                                                    <span className="tabular-nums">
                                                        {m.apreciacion ?? nota(m.nota)} {m.tipo !== 'F' ? `(${m.tipo})` : ''}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                ))}
                            </div>
                        </>
                    )}

                    <Parrafos parrafos={h.parrafos.slice(1)} />
                    <Firma nombre={h.firmante.nombre} detalle={h.firmante.cargo} />
                    <p className="mt-6 text-center text-xs text-gray-600">Emitida el {fechaCorta(h.emitidaEl)}</p>
                </>
            )}
        </HojaImprimible>
    );
}
