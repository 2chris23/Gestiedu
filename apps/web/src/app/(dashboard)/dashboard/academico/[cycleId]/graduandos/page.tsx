'use client';

import * as React from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Loader2, Pencil } from 'lucide-react';
import api from '@/lib/axios';
import { HojaImprimible, Firma, fechaCorta } from '@/components/documentos/HojaImprimible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * LOS GRADUANDOS Y SU TÍTULO DE BACHILLER
 *
 * Antes de cerrar el año: los del último año, «por cerrar» (para preparar el
 * acto de grado). Cerrado: los que egresaron —a los que se les anota la
 * mención, el serial y la fecha de su título— y los que quedaron pendientes.
 * La lista se imprime; la constancia de título en trámite, por alumno.
 * `services/graduandos.service.ts`. Solo el admin.
 */

interface Graduando {
    alumno: { id: string; nombre: string; tipoDeCedula: string | null };
    seccion: string;
    estado: 'POR_CERRAR' | 'EGRESADO' | 'PENDIENTE';
    titulo: { mencion: string; serial: string | null; fechaDeExpedicion: string | null } | null;
}
interface Lista {
    ciclo: { id: string; nombre: string; cerrado: boolean };
    grado: number;
    mencion: string;
    firmante: { nombre: string | null; cargo: string };
    graduandos: Graduando[];
    emitidaEl: string;
}

const ESTADO = { POR_CERRAR: 'Por cerrar el año', EGRESADO: 'Egresado', PENDIENTE: 'No ha egresado' } as const;
const CELDA = 'border border-gray-300 px-2 py-1';

export default function GraduandosPage({ params }: { params: Promise<{ cycleId: string }> }) {
    const { cycleId } = use(params);
    const ciclo = decodeURIComponent(cycleId);
    const [editando, setEditando] = React.useState<Graduando | null>(null);
    const { data: l, isLoading, error } = useQuery<Lista>({
        queryKey: ['graduandos', ciclo],
        queryFn: async () => (await api.get(`/academic-years/${encodeURIComponent(ciclo)}/graduandos`)).data.data,
    });

    return (
        <HojaImprimible
            etiqueta="Lista de graduandos"
            titulo="Lista de graduandos"
            subtitulo={l ? `${l.grado}° año · año escolar ${l.ciclo.nombre}${l.ciclo.cerrado ? '' : ' · el año no se ha cerrado todavía'}` : undefined}
            cargando={isLoading}
            error={error}
            textoDeCarga="Cargando los graduandos…"
        >
            {l && (
                <>
                    {l.graduandos.length === 0 ? (
                        <p className="mt-6 text-center text-sm text-gray-600">No hay alumnos en el último año de este ciclo.</p>
                    ) : (
                        <ol className="mt-4 space-y-2 min-[700px]:hidden print:hidden" aria-label="Graduandos">
                            {l.graduandos.map((g, i) => (
                                <li key={g.alumno.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                                    <p className="font-semibold text-gray-900">
                                        {i + 1}. {g.alumno.nombre}
                                    </p>
                                    <p className="text-gray-600">
                                        {g.alumno.id} · {g.seccion} · {ESTADO[g.estado]}
                                        {g.titulo?.serial ? ` · Título ${g.titulo.serial}` : ''}
                                    </p>
                                    <Acciones g={g} alEditar={() => setEditando(g)} />
                                </li>
                            ))}
                        </ol>
                    )}
                    {l.graduandos.length > 0 && (
                        <table className="mt-4 hidden w-full border-collapse text-sm min-[700px]:table print:table" aria-label="Graduandos">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th scope="col" className={CELDA}>
                                        N.º
                                    </th>
                                    <th scope="col" className={`${CELDA} text-left`}>
                                        Cédula
                                    </th>
                                    <th scope="col" className={`${CELDA} text-left`}>
                                        Apellidos y nombres
                                    </th>
                                    <th scope="col" className={CELDA}>
                                        Sección
                                    </th>
                                    <th scope="col" className={`${CELDA} text-left`}>
                                        Mención
                                    </th>
                                    <th scope="col" className={CELDA}>
                                        Serial del título
                                    </th>
                                    <th scope="col" className={CELDA}>
                                        Expedido
                                    </th>
                                    <th scope="col" className={`${CELDA} print:hidden`}>
                                        Estado
                                    </th>
                                    <th scope="col" className={`${CELDA} print:hidden`}>
                                        <span className="sr-only">Acciones</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {l.graduandos.map((g, i) => (
                                    <tr key={g.alumno.id}>
                                        <td className={`${CELDA} text-center`}>{i + 1}</td>
                                        <td className={`${CELDA} font-mono`}>{g.alumno.id}</td>
                                        <th scope="row" className={`${CELDA} text-left font-medium`}>
                                            {g.alumno.nombre}
                                        </th>
                                        <td className={`${CELDA} text-center`}>{g.seccion}</td>
                                        <td className={CELDA}>{g.titulo?.mencion ?? l.mencion}</td>
                                        <td className={`${CELDA} text-center font-mono`}>{g.titulo?.serial ?? ''}</td>
                                        <td className={`${CELDA} text-center`}>{g.titulo?.fechaDeExpedicion ? fechaCorta(g.titulo.fechaDeExpedicion) : ''}</td>
                                        <td className={`${CELDA} text-center print:hidden`}>{ESTADO[g.estado]}</td>
                                        <td className={`${CELDA} print:hidden`}>
                                            <Acciones g={g} alEditar={() => setEditando(g)} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    <Firma nombre={l.firmante.nombre} detalle={l.firmante.cargo} />
                    <p className="mt-6 text-center text-xs text-gray-600">Emitida el {fechaCorta(l.emitidaEl)}</p>
                    {editando && <Titulo ciclo={ciclo} g={editando} mencion={l.mencion} alCerrar={() => setEditando(null)} />}
                </>
            )}
        </HojaImprimible>
    );
}

function Acciones({ g, alEditar }: { g: Graduando; alEditar: () => void }) {
    if (g.estado !== 'EGRESADO') return null;
    return (
        <div className="mt-1 flex flex-wrap gap-1 print:hidden">
            <button type="button" onClick={alEditar} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
                <Pencil className="h-4 w-4" aria-hidden /> Título
            </button>
            <Link
                href={`/dashboard/constancia/${encodeURIComponent(g.alumno.id)}?tipo=TITULO_EN_TRAMITE`}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            >
                <FileText className="h-4 w-4" aria-hidden /> En trámite
            </Link>
        </div>
    );
}

function Titulo({ ciclo, g, mencion, alCerrar }: { ciclo: string; g: Graduando; mencion: string; alCerrar: () => void }) {
    const cola = useQueryClient();
    const [m, setM] = React.useState(g.titulo?.mencion ?? mencion);
    const [serial, setSerial] = React.useState(g.titulo?.serial ?? '');
    const [fecha, setFecha] = React.useState(g.titulo?.fechaDeExpedicion ?? '');
    const guardar = useMutation({
        mutationFn: async () =>
            (await api.put(`/academic-years/${encodeURIComponent(ciclo)}/graduandos/${encodeURIComponent(g.alumno.id)}/titulo`, { mencion: m.trim(), serial: serial.trim(), fechaDeExpedicion: fecha })).data,
        onSuccess: () => {
            toast.success('Título anotado');
            void cola.invalidateQueries({ queryKey: ['graduandos', ciclo] });
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo anotar el título')),
    });
    return (
        <Dialog open onOpenChange={(v) => !v && !guardar.isPending && alCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Título de {g.alumno.nombre}</DialogTitle>
                    <DialogDescription>El serial no se repite en el liceo.</DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        guardar.mutate();
                    }}
                >
                    <div className="space-y-1.5">
                        <label htmlFor="tit-mencion" className="text-sm font-semibold text-gray-700">
                            Mención
                        </label>
                        <Input id="tit-mencion" value={m} onChange={(e) => setM(e.target.value)} maxLength={120} className="min-h-[44px]" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label htmlFor="tit-serial" className="text-sm font-semibold text-gray-700">
                                Serial del título
                            </label>
                            <Input id="tit-serial" value={serial} onChange={(e) => setSerial(e.target.value)} maxLength={30} className="min-h-[44px] font-mono" />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="tit-fecha" className="text-sm font-semibold text-gray-700">
                                Fecha de expedición
                            </label>
                            <Input id="tit-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="min-h-[44px]" />
                        </div>
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" onClick={alCerrar} className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={guardar.isPending}
                            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
