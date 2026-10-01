'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import api from '@/lib/axios';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { Input } from '@/components/ui/input';
import { Lista } from '@/components/ui/lista';
import { useClassrooms } from '@/hooks/useClassrooms';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * IMPORTAR UN ALUMNO QUE LLEGA DE OTRO LICEO
 *
 * El liceo de donde viene le dio su archivo de traslado (`.gestiedu`). Aquí se
 * sube, se comprueba la firma (si alguien lo tocó, no entra), se ve lo que
 * trae y se elige su sección: el alumno se crea con sus datos, sus años
 * anteriores entran en su certificación y los lapsos que ya cursó este año
 * cuentan en sus promedios (`services/traslado.service.ts`). Solo el admin.
 */

interface Revision {
    datos: {
        origen: { liceo: string; codigoDea: string | null };
        alumno: { cedula: string; nombres: string; apellidos: string; correo: string | null; fechaDeNacimiento: string | null };
        representantes: Array<{ cedula: string; nombres: string; apellidos: string; parentesco: string; telefono: string | null }>;
        anoEnCurso: { anoEscolar: string; grado: number; materias: Array<{ nombre: string; cualitativa: boolean; notas: Record<string, number | null> }> };
        anosAnteriores: Array<{ grado: number }>;
    };
    yaExiste: boolean;
    correoEnUso: boolean;
    materiasDeLaSeccion: Array<{ id: string; nombre: string }>;
    emparejamiento: Record<string, string | null> | null;
}

const NO_SE_TRAE = '__nada';

export default function ImportarAlumnoPage() {
    const [archivo, setArchivo] = React.useState<any>(null);
    const [revision, setRevision] = React.useState<Revision | null>(null);
    const [seccion, setSeccion] = React.useState('');
    const [emparejamiento, setEmparejamiento] = React.useState<Record<string, string | null>>({});
    const [correo, setCorreo] = React.useState('');
    const [clave, setClave] = React.useState('');
    const [hecho, setHecho] = React.useState<any>(null);

    const secciones = useClassrooms();
    const opcionesDeSeccion = React.useMemo(() => {
        const d: any = secciones.data;
        const arr: any[] = Array.isArray(d) ? d : d?.classrooms ?? [];
        return arr.map((c) => ({ valor: c.id as string, texto: (c.name as string) ?? `${c.grade}º ${c.section}` }));
    }, [secciones.data]);

    const revisar = useMutation({
        mutationFn: async ({ a, s }: { a: any; s?: string }) => (await api.post('/traslados/revisar', { archivo: a, classroomId: s || undefined })).data.data as Revision,
        onSuccess: (r) => {
            setRevision(r);
            setEmparejamiento(r.emparejamiento ?? {});
            setCorreo((c) => c || (r.correoEnUso ? '' : r.datos.alumno.correo ?? ''));
        },
        onError: (e) => {
            setRevision(null);
            toast.error(getApiErrorMessage(e, 'Ese archivo no se puede importar'));
        },
    });
    const importar = useMutation({
        mutationFn: async () => (await api.post('/traslados/importar', { archivo, classroomId: seccion, password: clave, email: correo.trim(), emparejamiento })).data.data,
        onSuccess: (r) => {
            setHecho(r);
            toast.success('Alumno importado');
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo importar')),
    });

    const leer = async (f: File | undefined) => {
        if (!f) return;
        try {
            const a = JSON.parse(await f.text());
            setArchivo(a);
            setHecho(null);
            revisar.mutate({ a, s: seccion });
        } catch {
            toast.error('Ese archivo no es un archivo de traslado');
        }
    };
    const elegirSeccion = (s: string) => {
        setSeccion(s);
        if (archivo) revisar.mutate({ a: archivo, s });
    };

    if (hecho) {
        return (
            <div className="space-y-6">
                <EncabezadoDePantalla titulo="Importar alumno de otro liceo" />
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6" aria-label="Alumno importado">
                    <p className="flex items-center gap-2 text-lg font-bold text-emerald-900">
                        <CheckCircle2 className="h-5 w-5" aria-hidden /> {hecho.alumno.nombre}, en {hecho.seccion.nombre}
                    </p>
                    <p className="mt-1 text-sm text-emerald-900">
                        Entra con {hecho.alumno.correo}. Trajo {hecho.notasTraidas} notas de lapsos de este año y {hecho.anosAnteriores} años anteriores para su certificación.
                    </p>
                    {hecho.representantes.length > 0 && (
                        <div className="mt-3 text-sm text-emerald-900">
                            <p className="font-semibold">Sus representantes (créales la cuenta y enlázalos desde su ficha):</p>
                            <ul className="mt-1 list-disc pl-5">
                                {hecho.representantes.map((r: any) => (
                                    <li key={r.cedula}>
                                        {r.nombres} {r.apellidos} · {r.cedula} · {r.parentesco}
                                        {r.telefono ? ` · ${r.telefono}` : ''}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <Link
                        href={`/dashboard/usuarios/${encodeURIComponent(hecho.alumno.cedula)}`}
                        className="mt-4 inline-flex min-h-[44px] items-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
                    >
                        Ver su ficha
                    </Link>
                </section>
            </div>
        );
    }

    const d = revision?.datos;
    return (
        <div className="space-y-6">
            <EncabezadoDePantalla
                titulo="Importar alumno de otro liceo"
                descripcion="Con el archivo de traslado (.gestiedu) que le dio el liceo de donde viene."
            />
            <label className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-white p-6 text-sm text-gray-700 hover:border-indigo-400">
                <FileUp className="h-6 w-6 text-indigo-600" aria-hidden />
                <span className="font-semibold">{archivo ? 'Cambiar de archivo' : 'Elegir el archivo de traslado'}</span>
                <input type="file" accept=".gestiedu,application/json" className="sr-only" aria-label="Archivo de traslado" onChange={(e) => leer(e.target.files?.[0])} />
            </label>
            {revisar.isPending && (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Comprobando la firma…
                </p>
            )}

            {d && (
                <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4" aria-label="Lo que trae el archivo">
                    <div>
                        <p className="text-lg font-bold text-gray-900">
                            {d.alumno.nombres} {d.alumno.apellidos}
                        </p>
                        <p className="text-sm text-gray-600">
                            {d.alumno.cedula} · viene de {d.origen.liceo}
                            {d.origen.codigoDea ? ` (${d.origen.codigoDea})` : ''} · {d.anoEnCurso.grado}° año, {d.anoEnCurso.anoEscolar}
                        </p>
                        <p className="mt-1 text-sm font-medium text-emerald-700">Firma comprobada: viene de Gestiedu y nadie lo cambió.</p>
                        {revision!.yaExiste && <p className="mt-1 text-sm font-medium text-rose-700">Ya hay alguien con esa cédula en este liceo: búscalo en Usuarios.</p>}
                    </div>

                    <div className="sm:w-72">
                        <span className="mb-1 block text-sm font-semibold text-gray-700">Su sección aquí</span>
                        <Lista etiqueta="Su sección aquí" valor={seccion} alCambiar={elegirSeccion} opciones={opcionesDeSeccion} />
                    </div>

                    {seccion && revision!.emparejamiento && (
                        <div>
                            <p className="text-sm font-semibold text-gray-700">Sus notas de este año, en las materias de aquí</p>
                            <ul className="mt-2 space-y-2">
                                {d.anoEnCurso.materias
                                    .filter((m) => !m.cualitativa)
                                    .map((m) => (
                                        <li key={m.nombre} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                                            <span className="text-sm text-gray-800 sm:w-56">
                                                {m.nombre}:{' '}
                                                <span className="tabular-nums text-gray-600">
                                                    {Object.values(m.notas)
                                                        .map((n) => (n == null ? '—' : n))
                                                        .join(' · ')}
                                                </span>
                                            </span>
                                            <div className="sm:w-64">
                                                <Lista
                                                    etiqueta={`Materia de aquí para ${m.nombre}`}
                                                    valor={emparejamiento[m.nombre] ?? NO_SE_TRAE}
                                                    alCambiar={(v) => setEmparejamiento((x) => ({ ...x, [m.nombre]: v === NO_SE_TRAE ? null : v }))}
                                                    opciones={[{ valor: NO_SE_TRAE, texto: 'No se trae' }, ...revision!.materiasDeLaSeccion.map((s) => ({ valor: s.id, texto: s.nombre }))]}
                                                />
                                            </div>
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label htmlFor="imp-correo" className="text-sm font-semibold text-gray-700">
                                Correo de su cuenta
                            </label>
                            <Input id="imp-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className="min-h-[44px]" />
                            {revision!.correoEnUso && <p className="text-xs text-amber-800">El correo que traía ya lo usa otra cuenta de este liceo: pon otro.</p>}
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="imp-clave" className="text-sm font-semibold text-gray-700">
                                Contraseña
                            </label>
                            <Input id="imp-clave" type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Mínimo 8 caracteres" className="min-h-[44px]" autoComplete="new-password" />
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => importar.mutate()}
                        disabled={!seccion || !correo.trim() || clave.length < 8 || revision!.yaExiste || importar.isPending}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                        {importar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Importar alumno
                    </button>
                </section>
            )}
        </div>
    );
}
