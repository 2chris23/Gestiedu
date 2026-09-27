'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { HojaImprimible, Firma, Parrafos, fechaCorta } from '@/components/documentos/HojaImprimible';
import { motivosLegibles, type Motivos } from '@/lib/consejo';

/**
 * EL ACTA DEL CONSEJO DE SECCIÓN, PARA IMPRIMIR Y FIRMAR
 *
 * Apertura y cierre con el texto del liceo (plantilla `ACTA_CONSEJO`), los
 * casos tratados con su acuerdo, los acuerdos generales y la firma de cada
 * profesor que asistió (`services/consejo.service.ts`).
 */

interface Acta {
    titulo: string;
    parrafos: string[];
    firmante: { nombre: string | null; cargo: string };
    seccion: { nombre: string };
    lapso: { nombre: string };
    acta: {
        fecha: string;
        asistentes: Array<{ id: string; nombre: string; materias: string[]; asistio: boolean }>;
        acuerdosGenerales: string | null;
        casos: Array<{ alumno: { id: string; nombre: string }; motivos: Motivos | null; loTratado: string | null; acuerdo: string | null }>;
    };
    emitidaEl: string;
}

const CELDA = 'border border-gray-300 px-2 py-1 align-top';

export default function ActaDelConsejoPage({ params }: { params: Promise<{ classroomId: string; periodId: string }> }) {
    const { classroomId, periodId } = use(params);
    const { data: a, isLoading, error } = useQuery<Acta>({
        queryKey: ['acta-del-consejo', classroomId, periodId],
        queryFn: async () => (await api.get(`/classrooms/${encodeURIComponent(classroomId)}/consejos/${periodId}/acta`)).data.data,
    });
    const presentes = a?.acta.asistentes.filter((x) => x.asistio) ?? [];

    return (
        <HojaImprimible
            etiqueta="Acta del consejo de sección"
            titulo={a?.titulo}
            subtitulo={a ? `${a.seccion.nombre} · ${a.lapso.nombre} · ${fechaCorta(a.acta.fecha)}` : undefined}
            cargando={isLoading}
            error={error}
            textoDeCarga="Cargando el acta…"
        >
            {a && (
                <>
                    <Parrafos parrafos={a.parrafos.slice(0, 1)} />
                    <p className="mt-3 text-sm">
                        <strong>Docentes presentes:</strong> {presentes.map((p) => `${p.nombre} (${p.materias.join(', ')})`).join('; ') || '—'}.
                    </p>
                    {a.acta.casos.length > 0 && (
                        <table className="mt-4 w-full border-collapse text-sm" aria-label="Casos tratados">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th scope="col" className={`${CELDA} text-left`}>
                                        Estudiante
                                    </th>
                                    <th scope="col" className={`${CELDA} text-left`}>
                                        Lo tratado
                                    </th>
                                    <th scope="col" className={`${CELDA} text-left`}>
                                        Acuerdo
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {a.acta.casos.map((c) => (
                                    <tr key={c.alumno.id} className="break-inside-avoid">
                                        <th scope="row" className={`${CELDA} text-left font-medium`}>
                                            {c.alumno.nombre}
                                            {motivosLegibles(c.motivos) && <span className="block text-xs font-normal text-gray-600">{motivosLegibles(c.motivos)}</span>}
                                        </th>
                                        <td className={CELDA}>{c.loTratado ?? ''}</td>
                                        <td className={CELDA}>{c.acuerdo ?? ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    {a.acta.acuerdosGenerales && (
                        <div className="mt-4 text-sm">
                            <p className="font-bold">Acuerdos generales</p>
                            <p className="whitespace-pre-line">{a.acta.acuerdosGenerales}</p>
                        </div>
                    )}
                    <Parrafos parrafos={a.parrafos.slice(1)} />
                    <div className="mt-2 grid grid-cols-2 gap-x-6 sm:grid-cols-3 print:grid-cols-3">
                        {presentes.map((p) => (
                            <Firma key={p.id} nombre={p.nombre} detalle={p.materias.join(', ')} />
                        ))}
                        <Firma nombre={a.firmante.nombre} detalle={a.firmante.cargo} />
                    </div>
                </>
            )}
        </HojaImprimible>
    );
}
