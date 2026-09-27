'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Loader2, Search } from 'lucide-react';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { Lista } from '@/components/ui/lista';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { teachersService } from '@/services/teachers.service';
import { materiasPendientes, ESTADO_DE_PENDIENTE, type MateriaPendiente, type ListaDePendientes } from '@/lib/materias-pendientes';
import { getApiErrorMessage, cn } from '@/lib/utils';

/**
 * LAS MATERIAS PENDIENTES DEL AÑO
 *
 * Las que los alumnos arrastran de años anteriores, con quién las evalúa y
 * la nota de cada momento. El admin ve todas y cambia el profesor; el
 * profesor ve las que evalúa y pone sus momentos. Cómo se aprueba lo dice el
 * liceo (Fin del año → reglas): en un momento aprobado, o por el promedio.
 */
export default function MateriasPendientesPage() {
    const { yo } = useQuienSoy();
    const esAdmin = yo?.role === 'ADMIN';
    const { data, isLoading, error } = useQuery({ queryKey: ['materias-pendientes'], queryFn: materiasPendientes.listar });
    const { data: profesores } = useQuery({
        queryKey: ['teachers', 'para-pendientes'],
        queryFn: () => teachersService.getTeachers({ limit: 100 }),
        enabled: esAdmin,
    });
    const [buscar, setBuscar] = React.useState('');
    const [estado, setEstado] = React.useState('TODAS');

    const texto = buscar.trim().toLowerCase();
    const lista = (data?.pendientes ?? []).filter(
        (p) =>
            (estado === 'TODAS' || p.estado === estado) &&
            (!texto || p.alumno.nombre.toLowerCase().includes(texto) || p.materia.nombre.toLowerCase().includes(texto) || p.alumno.id.toLowerCase().includes(texto))
    );

    return (
        <div className="space-y-6">
            <EncabezadoDePantalla
                titulo="Materias pendientes"
                descripcion={
                    data
                        ? `${data.pendientes.length} en este año · ${data.momentos} momentos · se aprueban ${data.forma === 'PROMEDIO' ? 'por el promedio de los momentos' : 'en el momento en que llegan a ' + data.minima}`
                        : 'Las materias que se arrastran de años anteriores, momento a momento.'
                }
            />
            <div className="flex flex-col gap-3 sm:flex-row">
                <label className="relative block flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
                    <input
                        aria-label="Buscar"
                        placeholder="Buscar alumno o materia"
                        value={buscar}
                        onChange={(e) => setBuscar(e.target.value)}
                        className="min-h-[44px] w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm"
                    />
                </label>
                <div className="sm:w-56">
                    <Lista
                        etiqueta="Estado"
                        valor={estado}
                        alCambiar={setEstado}
                        opciones={[
                            { valor: 'TODAS', texto: 'Todas' },
                            { valor: 'PENDIENTE', texto: 'Pendientes' },
                            { valor: 'APROBADA', texto: 'Aprobadas' },
                            { valor: 'NO_APROBADA', texto: 'No aprobadas' },
                        ]}
                    />
                </div>
            </div>

            {isLoading ? (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
                </p>
            ) : error || !data ? (
                <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudieron cargar.')}</p>
            ) : lista.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
                    {data.pendientes.length === 0
                        ? esAdmin
                            ? 'No hay materias pendientes este año. Nacen al cerrar el año anterior.'
                            : 'No tienes materias pendientes que evaluar.'
                        : 'Nada con ese filtro.'}
                </p>
            ) : (
                <ul className="space-y-3">
                    {lista.map((p) => (
                        <TarjetaDePendiente
                            key={p.id}
                            p={p}
                            lista={data}
                            editable={!p.ciclo.cerrado && (esAdmin || (yo?.role === 'TEACHER' && p.profesor?.id === yo.id))}
                            profesores={esAdmin ? ((profesores ?? []) as Array<{ id: string; firstName: string; lastName: string }>) : null}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}

function TarjetaDePendiente({
    p,
    lista,
    editable,
    profesores,
}: {
    p: MateriaPendiente;
    lista: ListaDePendientes;
    editable: boolean;
    profesores: Array<{ id: string; firstName: string; lastName: string }> | null;
}) {
    const cola = useQueryClient();
    const recargar = () => void cola.invalidateQueries({ queryKey: ['materias-pendientes'] });
    const cambiarProfesor = useMutation({
        mutationFn: (id: string) => materiasPendientes.cambiarProfesor(p.id, id === '__nadie' ? null : id),
        onSuccess: () => {
            toast.success('Profesor cambiado');
            recargar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo cambiar el profesor')),
    });
    const estado = ESTADO_DE_PENDIENTE[p.estado];
    // Se ofrece el siguiente momento vacío (van en orden) mientras siga pendiente.
    const siguiente = p.estado === 'PENDIENTE' && p.momentos.length < lista.momentos ? p.momentos.length + 1 : null;

    return (
        <li className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{p.alumno.nombre}</p>
                    <p className="text-sm text-gray-700">
                        {p.materia.nombre} de {p.gradoDeOrigen}º año{p.cicloDeOrigen ? ` (${p.cicloDeOrigen})` : ''}
                        {p.notaDeOrigen != null ? ` · la reprobó con ${p.notaDeOrigen}` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', estado.clase)}>
                        {estado.texto}
                        {p.notaFinal != null ? ` · ${p.notaFinal}` : ''}
                    </span>
                    <Link
                        href={`/dashboard/acta-de-compromiso/${encodeURIComponent(p.alumno.id)}`}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                    >
                        <FileText className="h-4 w-4" aria-hidden /> Acta
                    </Link>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
                {profesores ? (
                    <div className="w-full sm:w-72">
                        <Lista
                            etiqueta={`Profesor que evalúa a ${p.alumno.nombre}`}
                            valor={p.profesor?.id ?? '__nadie'}
                            alCambiar={(v) => cambiarProfesor.mutate(v)}
                            disabled={p.ciclo.cerrado || cambiarProfesor.isPending}
                            opciones={[
                                { valor: '__nadie', texto: 'Sin profesor' },
                                ...profesores.map((t) => ({ valor: t.id, texto: `${t.firstName} ${t.lastName}` })),
                            ]}
                        />
                    </div>
                ) : (
                    <p className="text-sm text-gray-600">Evalúa: {p.profesor?.nombre ?? 'sin profesor'}</p>
                )}
            </div>

            <ol className="mt-3 flex flex-wrap gap-2" aria-label="Momentos">
                {Array.from({ length: lista.momentos }, (_, i) => i + 1).map((n) => {
                    const puesto = p.momentos.find((m) => m.momento === n);
                    const abierto = editable && (puesto || n === siguiente);
                    return (
                        <li key={n}>
                            {abierto ? (
                                <NotaDelMomento pendiente={p} momento={n} puesta={puesto?.nota ?? null} minima={lista.minima} alGuardar={recargar} />
                            ) : (
                                <span
                                    className={cn(
                                        'inline-flex min-h-[44px] min-w-[5.5rem] items-center justify-center rounded-lg border px-3 text-sm',
                                        puesto ? (puesto.nota >= lista.minima ? 'border-emerald-200 text-emerald-800' : 'border-rose-200 text-rose-800') : 'border-dashed border-gray-300 text-gray-500'
                                    )}
                                >
                                    {n}º: {puesto ? puesto.nota : '—'}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </li>
    );
}

function NotaDelMomento({
    pendiente,
    momento,
    puesta,
    minima,
    alGuardar,
}: {
    pendiente: MateriaPendiente;
    momento: number;
    puesta: number | null;
    minima: number;
    alGuardar: () => void;
}) {
    const [texto, setTexto] = React.useState(puesta == null ? '' : String(puesta));
    React.useEffect(() => setTexto(puesta == null ? '' : String(puesta)), [puesta]);
    const guardar = useMutation({
        mutationFn: (nota: number) => materiasPendientes.ponerMomento(pendiente.id, momento, nota),
        onSuccess: (r) => {
            toast.success(r.estado === 'APROBADA' ? `¡Aprobada con ${r.notaFinal}!` : r.estado === 'NO_APROBADA' ? 'No aprobada en ningún momento' : `Momento ${momento} guardado`);
            alGuardar();
        },
        onError: (e) => {
            toast.error(getApiErrorMessage(e, 'No se pudo guardar'));
            setTexto(puesta == null ? '' : String(puesta));
        },
    });
    const enviar = () => {
        const n = Number(texto.replace(',', '.'));
        if (texto.trim() === '' || !Number.isFinite(n) || n < 0 || n > 20 || n === puesta) return;
        guardar.mutate(n);
    };
    const n = Number(texto.replace(',', '.'));

    return (
        <label className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-gray-700">
            {momento}º
            <input
                aria-label={`Momento ${momento} de ${pendiente.alumno.nombre}`}
                inputMode="decimal"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onBlur={enviar}
                onKeyDown={(e) => e.key === 'Enter' && enviar()}
                disabled={guardar.isPending}
                className={cn(
                    'h-11 w-16 rounded-lg border border-gray-300 px-2 text-right tabular-nums',
                    texto.trim() !== '' && Number.isFinite(n) && (n >= minima ? 'text-emerald-800' : 'text-rose-800')
                )}
            />
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        </label>
    );
}
