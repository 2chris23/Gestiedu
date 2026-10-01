'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { HojaImprimible, Firma, Parrafos, fechaCorta } from '@/components/documentos/HojaImprimible';

/**
 * LA PLANILLA DE INSCRIPCIÓN, PARA IMPRIMIR Y FIRMAR
 *
 * Los datos del alumno, sus representantes, los recaudos (entregados o no) y
 * la declaración que firma el representante (plantilla del liceo). Lo que no
 * esté en la ficha sale en blanco, con una raya, para escribirlo a mano.
 * Solo el admin (`services/inscripcion.service.ts`).
 */

interface Planilla {
    titulo: string;
    declaracion: string[];
    firmante: { nombre: string | null; cedula: string | null; cargo: string };
    ciclo: string;
    seccion: { grado: number; seccion: string; turno: string | null } | null;
    alumno: {
        cedula: string;
        tipoDeCedula: string | null;
        cedulaEscolar: string | null;
        nombres: string;
        apellidos: string;
        sexo: string | null;
        fechaDeNacimiento: string | null;
        edad: number | null;
        lugarDeNacimiento: string | null;
        entidadDeNacimiento: string | null;
        nacionalidad: string | null;
        telefono: string | null;
        correo: string;
        direccion: string | null;
    };
    representantes: Array<{ cedula: string; nombre: string; parentesco: string; telefono: string | null; correo: string | null; direccion: string | null }>;
    recaudos: Array<{ clave: string; nombre: string; entregado: boolean }>;
    emitidaEl: string;
}

const TURNO: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', INTEGRAL: 'Integral' };
const RAYA = '________________';

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
    return (
        <div className="border-b border-gray-200 py-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">{etiqueta}</dt>
            <dd className="text-sm text-gray-900">{valor || RAYA}</dd>
        </div>
    );
}

export default function PlanillaDeInscripcionPage({ params }: { params: Promise<{ cedula: string }> }) {
    const { cedula } = use(params);
    const studentId = decodeURIComponent(cedula);
    const { data: p, isLoading, error } = useQuery({
        queryKey: ['planilla-de-inscripcion', studentId],
        queryFn: async () => (await api.get(`/students/${encodeURIComponent(studentId)}/planilla-de-inscripcion`)).data.data as Planilla,
    });

    return (
        <HojaImprimible
            etiqueta="Planilla de inscripción"
            titulo={p?.titulo}
            subtitulo={p ? `Año escolar ${p.ciclo || RAYA}${p.seccion ? ` · ${p.seccion.grado}° año, sección «${p.seccion.seccion}»${p.seccion.turno ? ` · ${TURNO[p.seccion.turno] ?? p.seccion.turno}` : ''}` : ''}` : undefined}
            cargando={isLoading}
            error={error ?? (!isLoading && !p ? new Error('Sin datos') : null)}
            textoDeCarga="Cargando la planilla…"
        >
            {p && (
                <>
                    <h2 className="mt-6 text-sm font-bold uppercase text-gray-800">Datos del estudiante</h2>
                    <dl className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2">
                        <Dato etiqueta="Apellidos" valor={p.alumno.apellidos} />
                        <Dato etiqueta="Nombres" valor={p.alumno.nombres} />
                        <Dato
                            etiqueta={p.alumno.tipoDeCedula === 'ESCOLAR' ? 'Cédula escolar' : 'Cédula de identidad'}
                            valor={<span className="font-mono">{p.alumno.cedula}</span>}
                        />
                        <Dato etiqueta="Nacionalidad" valor={p.alumno.nacionalidad === 'V' ? 'Venezolana' : p.alumno.nacionalidad === 'E' ? 'Extranjera' : null} />
                        <Dato etiqueta="Sexo" valor={p.alumno.sexo} />
                        <Dato
                            etiqueta="Fecha de nacimiento"
                            valor={p.alumno.fechaDeNacimiento ? `${fechaCorta(p.alumno.fechaDeNacimiento)}${p.alumno.edad != null ? ` (${p.alumno.edad} años)` : ''}` : null}
                        />
                        <Dato etiqueta="Lugar de nacimiento" valor={p.alumno.lugarDeNacimiento} />
                        <Dato etiqueta="Entidad de nacimiento" valor={p.alumno.entidadDeNacimiento} />
                        <Dato etiqueta="Teléfono" valor={p.alumno.telefono} />
                        <Dato etiqueta="Correo" valor={p.alumno.correo} />
                        <div className="sm:col-span-2 print:col-span-2">
                            <Dato etiqueta="Dirección" valor={p.alumno.direccion} />
                        </div>
                    </dl>

                    <h2 className="mt-6 text-sm font-bold uppercase text-gray-800">Representantes</h2>
                    {p.representantes.length === 0 ? (
                        <dl className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2">
                            <Dato etiqueta="Nombre" valor={null} />
                            <Dato etiqueta="Cédula" valor={null} />
                            <Dato etiqueta="Parentesco" valor={null} />
                            <Dato etiqueta="Teléfono" valor={null} />
                        </dl>
                    ) : (
                        p.representantes.map((r) => (
                            <dl key={r.cedula} className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2">
                                <Dato etiqueta="Nombre" valor={r.nombre} />
                                <Dato etiqueta="Cédula" valor={<span className="font-mono">{r.cedula}</span>} />
                                <Dato etiqueta="Parentesco" valor={r.parentesco.charAt(0) + r.parentesco.slice(1).toLowerCase()} />
                                <Dato etiqueta="Teléfono" valor={r.telefono} />
                            </dl>
                        ))
                    )}

                    <h2 className="mt-6 text-sm font-bold uppercase text-gray-800">Recaudos</h2>
                    <ul className="mt-1 grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2 print:grid-cols-2" aria-label="Recaudos">
                        {p.recaudos.map((r) => (
                            <li key={r.clave} className="flex items-start gap-2 py-0.5">
                                <span className="font-mono" aria-hidden>
                                    {r.entregado ? '[X]' : '[  ]'}
                                </span>
                                <span>
                                    {r.nombre}
                                    <span className="sr-only">{r.entregado ? ': entregado' : ': falta'}</span>
                                </span>
                            </li>
                        ))}
                    </ul>

                    <Parrafos parrafos={p.declaracion} />

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
                        <Firma nombre={p.representantes[0]?.nombre} detalle="Representante" />
                        <Firma nombre={p.firmante.nombre} detalle={p.firmante.cargo} />
                    </div>
                    <p className="mt-6 text-center text-xs text-gray-600">Emitida el {fechaCorta(p.emitidaEl)}</p>
                </>
            )}
        </HojaImprimible>
    );
}
