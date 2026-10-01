'use client';

import * as React from 'react';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, Loader2, Plus, Printer, Trash2, X } from 'lucide-react';
import api from '@/lib/axios';
import { MembreteOficial } from '@/components/documentos/MembreteOficial';
import { Lista } from '@/components/ui/lista';
import { getApiErrorMessage } from '@/lib/utils';
import { EstiloDelPapel, imprimirConAviso, useNombreDelDocumento } from '@/components/documentos/HojaImprimible';

/**
 * LA CERTIFICACIÓN DE CALIFICACIONES (1º A 5º AÑO), PARA IMPRIMIR
 *
 * La nota de cada materia de cada año, con su tipo (F final, R revisión, MP
 * materia pendiente), la fecha y el plantel donde se cursó
 * (`services/certificacion.service.ts`). Lo del liceo sale solo de los
 * expedientes; los años cursados en otro plantel se cargan abajo (no se
 * imprime). Solo el admin.
 */

interface Materia {
    nombre: string;
    nota: number | null;
    apreciacion: string | null;
    tipo: 'F' | 'R' | 'MP';
    fecha: string | null;
}
interface Ano {
    grado: number;
    anoEscolar: string | null;
    plantel: string | null;
    codigoDelPlantel: string | null;
    entidad: string | null;
    fuente: 'LICEO' | 'OTRO_PLANTEL' | 'SIN_DATOS';
    materias: Materia[];
}
interface Certificacion {
    alumno: {
        cedula: string;
        tipoDeCedula: string | null;
        nombres: string;
        apellidos: string;
        fechaDeNacimiento: string | null;
        lugarDeNacimiento: string | null;
        entidadDeNacimiento: string | null;
    };
    membrete: { nombre: string; codigoDelPlanDeEstudio?: string | null; entidadFederal: string | null };
    firmante: { nombre: string | null; cedula: string | null; cargo: string };
    anos: Ano[];
    emitidaEl: string;
}

const ORDINAL = ['', 'Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto', 'Sexto'];
const nota = (n: number | null) => (n == null ? '' : Number.isInteger(n) ? String(n).padStart(2, '0') : n.toFixed(2));
const fecha = (ymd: string | null) => (ymd ? ymd.split('-').reverse().join('/') : '—');

export default function CertificacionPage({ params }: { params: Promise<{ cedula: string }> }) {
    useNombreDelDocumento('Certificación de calificaciones');
    const { cedula } = use(params);
    const studentId = decodeURIComponent(cedula);
    const router = useRouter();
    const { data: c, isLoading, error } = useQuery({
        queryKey: ['certificacion', studentId],
        queryFn: async () => (await api.get(`/students/${encodeURIComponent(studentId)}/certificacion`)).data.data as Certificacion,
    });

    if (isLoading) return <div className="p-8 text-sm text-gray-600">Cargando la certificación…</div>;
    if (error || !c) {
        return (
            <div className="p-8">
                <p className="text-sm font-medium text-red-600">{getApiErrorMessage(error, 'No se pudo cargar la certificación.')}</p>
                <button onClick={() => router.back()} className="mt-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-indigo-700 hover:underline">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
            <EstiloDelPapel papel="carta" />
            <div className="flex items-center justify-between gap-2 print:hidden">
                <button onClick={() => router.back()} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
                <button
                    onClick={() => void imprimirConAviso()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    <Printer className="h-4 w-4" /> Imprimir
                </button>
            </div>

            <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-8 print:border-0 print:p-0 print:shadow-none" aria-label="Certificación de calificaciones">
                <header className="text-center">
                    <MembreteOficial />
                    <h1 className="mt-4 text-base font-bold uppercase tracking-wide text-gray-900">Certificación de calificaciones</h1>
                    <p className="text-sm text-gray-700">
                        Educación Media General{c.membrete.codigoDelPlanDeEstudio ? ` · Plan de estudio ${c.membrete.codigoDelPlanDeEstudio}` : ''}
                    </p>
                </header>

                <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div><dt className="inline font-semibold text-gray-700">Estudiante: </dt><dd className="inline text-gray-900">{c.alumno.apellidos}, {c.alumno.nombres}</dd></div>
                    <div>
                        <dt className="inline font-semibold text-gray-700">{c.alumno.tipoDeCedula === 'ESCOLAR' ? 'Cédula escolar' : 'Cédula'}: </dt>
                        <dd className="inline font-mono text-gray-900">{c.alumno.cedula}</dd>
                    </div>
                    <div><dt className="inline font-semibold text-gray-700">Fecha de nacimiento: </dt><dd className="inline text-gray-900">{fecha(c.alumno.fechaDeNacimiento)}</dd></div>
                    <div>
                        <dt className="inline font-semibold text-gray-700">Lugar de nacimiento: </dt>
                        <dd className="inline text-gray-900">{[c.alumno.lugarDeNacimiento, c.alumno.entidadDeNacimiento].filter(Boolean).join(', ') || '—'}</dd>
                    </div>
                </dl>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 print:grid-cols-2">
                    {c.anos.map((a) => (
                        <section key={a.grado} className="break-inside-avoid rounded-lg border border-gray-300" aria-label={`${ORDINAL[a.grado] ?? a.grado} año`}>
                            <header className="border-b border-gray-300 bg-gray-50 px-3 py-1.5 text-xs">
                                <p className="font-bold uppercase text-gray-900">
                                    {ORDINAL[a.grado] ?? a.grado} año{a.anoEscolar ? ` · ${a.anoEscolar}` : ''}
                                </p>
                                <p className="text-gray-700">
                                    {a.fuente === 'SIN_DATOS'
                                        ? 'Sin cursar o sin cerrar'
                                        : `${a.plantel ?? ''}${a.codigoDelPlantel ? ` (${a.codigoDelPlantel})` : ''}${a.entidad ? ` · ${a.entidad}` : ''}`}
                                </p>
                            </header>
                            {a.materias.length > 0 && (
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-gray-700">
                                            <th scope="col" className="px-2 py-1 text-left">Área</th>
                                            <th scope="col" className="px-2 py-1 text-center">Nota</th>
                                            <th scope="col" className="px-2 py-1 text-center">T-E</th>
                                            <th scope="col" className="px-2 py-1 text-center">Mes/año</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {a.materias.map((m) => (
                                            <tr key={m.nombre} className="border-t border-gray-200">
                                                <td className="px-2 py-1 text-gray-900">{m.nombre}</td>
                                                <td className="px-2 py-1 text-center font-semibold tabular-nums text-gray-900">{m.apreciacion ?? nota(m.nota)}</td>
                                                <td className="px-2 py-1 text-center text-gray-800">{m.tipo}</td>
                                                <td className="px-2 py-1 text-center tabular-nums text-gray-800">{m.fecha ?? ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>
                    ))}
                </div>

                <p className="mt-3 text-xs text-gray-600">T-E: tipo de evaluación. F: final · R: revisión · MP: materia pendiente.</p>

                <footer className="mt-16 grid grid-cols-1 gap-10 text-center text-sm sm:grid-cols-2">
                    <div className="mx-auto w-60 border-t border-gray-400 pt-1 text-gray-900">
                        {c.firmante.nombre ?? ''}
                        <span className="block text-gray-700">{c.firmante.cargo}</span>
                        {c.firmante.cedula && <span className="block text-xs text-gray-600">C.I. {c.firmante.cedula}</span>}
                    </div>
                    <div className="mx-auto w-60 border-t border-gray-400 pt-1 text-gray-900">
                        Control de estudios
                        <span className="block text-xs text-gray-600">Sello del plantel</span>
                    </div>
                    <p className="text-xs text-gray-600 sm:col-span-2">Emitida el {fecha(c.emitidaEl)}</p>
                </footer>
            </article>

            <AnosDeOtroPlantel studentId={studentId} />
        </div>
    );
}

/** Los años cursados en otro plantel: se cargan aquí, no se imprimen. */
function AnosDeOtroPlantel({ studentId }: { studentId: string }) {
    const cola = useQueryClient();
    const url = `/students/${encodeURIComponent(studentId)}/calificaciones-externas`;
    const { data } = useQuery({ queryKey: ['calificaciones-externas', studentId], queryFn: async () => (await api.get(url)).data.data as Array<{ grado: number; anoEscolar: string; plantel: string }> });
    const [abierto, setAbierto] = React.useState(false);
    const [f, setF] = React.useState({ grado: '1', anoEscolar: '', plantel: '', codigoDelPlantel: '', entidad: '' });
    const [materias, setMaterias] = React.useState([{ materia: '', nota: '', tipo: 'F', fecha: '' }]);
    const recargar = () => {
        void cola.invalidateQueries({ queryKey: ['calificaciones-externas', studentId] });
        void cola.invalidateQueries({ queryKey: ['certificacion', studentId] });
    };
    const cargar = useMutation({
        mutationFn: async () =>
            (
                await api.post(url, {
                    grado: Number(f.grado),
                    anoEscolar: f.anoEscolar.trim(),
                    plantel: f.plantel.trim(),
                    codigoDelPlantel: f.codigoDelPlantel.trim() || null,
                    entidad: f.entidad.trim() || null,
                    materias: materias
                        .filter((m) => m.materia.trim())
                        .map((m) => ({
                            materia: m.materia.trim(),
                            nota: m.nota.trim() && !Number.isNaN(Number(m.nota.replace(',', '.'))) ? Number(m.nota.replace(',', '.')) : null,
                            apreciacion: m.nota.trim() && Number.isNaN(Number(m.nota.replace(',', '.'))) ? m.nota.trim() : null,
                            tipo: m.tipo,
                            fecha: m.fecha.trim() || null,
                        })),
                })
            ).data,
        onSuccess: () => {
            toast.success('Año cargado');
            setAbierto(false);
            setMaterias([{ materia: '', nota: '', tipo: 'F', fecha: '' }]);
            recargar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo cargar')),
    });
    const quitar = useMutation({
        mutationFn: async (grado: number) => (await api.delete(`${url}/${grado}`)).data,
        onSuccess: () => {
            toast.success('Año quitado');
            recargar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo quitar')),
    });
    const anos = Array.from(new Map((data ?? []).map((x) => [x.grado, x])).values());
    const campo = 'min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm';

    return (
        <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold text-gray-900">Años cursados en otro plantel</h2>
                <button
                    type="button"
                    onClick={() => setAbierto(!abierto)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                    {abierto ? <X className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} {abierto ? 'Cerrar' : 'Cargar un año'}
                </button>
            </div>
            {anos.length === 0 ? (
                <p className="text-sm text-gray-600">Ninguno cargado. Lo del liceo sale solo de los expedientes.</p>
            ) : (
                <ul className="divide-y divide-gray-100 text-sm">
                    {anos.map((a) => (
                        <li key={a.grado} className="flex items-center justify-between gap-2 py-1">
                            <span>
                                {a.grado}º año · {a.anoEscolar} · {a.plantel}
                            </span>
                            <button
                                type="button"
                                onClick={() => quitar.mutate(a.grado)}
                                aria-label={`Quitar el ${a.grado}º año`}
                                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-rose-50 hover:text-rose-700"
                            >
                                <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {abierto && (
                <div className="space-y-3 border-t border-gray-100 pt-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                            <span className="mb-1 block text-sm text-gray-700">Año</span>
                            <Lista etiqueta="Año" valor={f.grado} alCambiar={(v) => setF({ ...f, grado: v })} opciones={[1, 2, 3, 4, 5].map((g) => ({ valor: String(g), texto: `${g}º año` }))} />
                        </div>
                        <label className="text-sm text-gray-700">
                            Año escolar
                            <input className={campo} placeholder="2023-2024" value={f.anoEscolar} onChange={(e) => setF({ ...f, anoEscolar: e.target.value })} />
                        </label>
                        <label className="text-sm text-gray-700">
                            Plantel
                            <input className={campo} value={f.plantel} onChange={(e) => setF({ ...f, plantel: e.target.value })} />
                        </label>
                        <label className="text-sm text-gray-700">
                            Código del plantel
                            <input className={campo} value={f.codigoDelPlantel} onChange={(e) => setF({ ...f, codigoDelPlantel: e.target.value })} />
                        </label>
                        <label className="text-sm text-gray-700">
                            Entidad
                            <input className={campo} value={f.entidad} onChange={(e) => setF({ ...f, entidad: e.target.value })} />
                        </label>
                    </div>
                    <ul className="space-y-2">
                        {materias.map((m, i) => (
                            <li key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_6rem_7rem]">
                                <input className={`${campo} col-span-2 sm:col-span-1`} aria-label={`Materia ${i + 1}`} placeholder="Materia" value={m.materia} onChange={(e) => setMaterias(materias.map((x, k) => (k === i ? { ...x, materia: e.target.value } : x)))} />
                                <input className={campo} aria-label={`Nota ${i + 1}`} placeholder="Nota" value={m.nota} onChange={(e) => setMaterias(materias.map((x, k) => (k === i ? { ...x, nota: e.target.value } : x)))} />
                                <Lista etiqueta={`Tipo ${i + 1}`} valor={m.tipo} alCambiar={(v) => setMaterias(materias.map((x, k) => (k === i ? { ...x, tipo: v } : x)))} opciones={[{ valor: 'F', texto: 'F' }, { valor: 'R', texto: 'R' }, { valor: 'MP', texto: 'MP' }]} />
                                <input className={campo} aria-label={`Mes y año ${i + 1}`} placeholder="07/2024" value={m.fecha} onChange={(e) => setMaterias(materias.map((x, k) => (k === i ? { ...x, fecha: e.target.value } : x)))} />
                            </li>
                        ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setMaterias([...materias, { materia: '', nota: '', tipo: 'F', fecha: '' }])}
                            disabled={materias.length >= 20}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700"
                        >
                            <Plus className="h-4 w-4" aria-hidden /> Otra materia
                        </button>
                        <button
                            type="button"
                            onClick={() => cargar.mutate()}
                            disabled={cargar.isPending || !f.plantel.trim() || !f.anoEscolar.trim() || !materias.some((m) => m.materia.trim())}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                            {cargar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Cargar el año
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}

