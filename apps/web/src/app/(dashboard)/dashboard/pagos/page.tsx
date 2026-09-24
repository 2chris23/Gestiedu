'use client';

import { Button } from '@/components/ui/button';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Search, Wallet } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import UserAvatar from '@/components/ui/UserAvatar';
import { FichaDePagos } from '@/components/pagos/FichaDePagos';
import { AlumnoEnResumen, dinero, ESTADO_DEL_ALUMNO, EstadoDelAlumno, useFichaDePagos, usePagosActivos, useResumenDePagos } from '@/hooks/usePagos';
import { cn } from '@/lib/utils';

/**
 * PAGOS DEL CICLO ACTUAL
 *
 * Misma forma que la pantalla del ciclo escolar —por año y por sección—, pero
 * de cada estudiante solo el nombre y cómo va con los pagos. Arriba, el aviso
 * que importa: cuántos deben.
 */

const ANOS = ['1er Año', '2do Año', '3er Año', '4to Año', '5to Año', '6to Año'];
type Filtro = 'TODOS' | EstadoDelAlumno;

export default function PagosPage() {
    const { data: ajustes, isLoading: cargandoAjustes } = usePagosActivos();
    const activo = Boolean(ajustes?.enabled);
    const { data, isLoading, error } = useResumenDePagos(activo);
    const [busqueda, setBusqueda] = React.useState('');
    const [filtro, setFiltro] = React.useState<Filtro>('TODOS');
    const [abierto, setAbierto] = React.useState<string | null>(null);

    if (cargandoAjustes || (activo && isLoading)) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (!activo) {
        // La misma cabecera que las demás pantallas, y el aviso debajo como un
        // estado vacío que dice qué hacer. Antes el título de la pantalla ERA el
        // aviso, centrado: al entrar desde el menú no parecía la misma aplicación.
        return (
            <div className="space-y-6">
                <EncabezadoDePantalla titulo="Pagos" descripcion="Cuotas, abonos y deudas de cada estudiante" />
                <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
                    <Wallet className="mx-auto h-10 w-10 text-gray-500" aria-hidden />
                    <h2 className="mt-3 text-lg font-bold text-gray-900">El control de pagos está apagado</h2>
                    <p className="mt-2 text-gray-700">Se activa en Configuración → Pagos.</p>
                    <Button asChild className="mt-4">
                        <Link href="/dashboard/configuracion">Ir a Configuración</Link>
                    </Button>
                </div>
            </div>
        );
    }

    if (error || !data) {
        const mensaje = (error as any)?.response?.data?.error || 'No se pudo cargar el resumen de pagos';
        return <p className="p-8 text-center text-gray-800">{mensaje}</p>;
    }

    const texto = busqueda.trim().toLowerCase();
    const pasa = (a: AlumnoEnResumen) =>
        (filtro === 'TODOS' || a.state === filtro) &&
        (!texto || `${a.firstName} ${a.lastName} ${a.id}`.toLowerCase().includes(texto));

    const porAno = ANOS.map((nombre, i) => ({
        nombre,
        grado: i + 1,
        secciones: data.classrooms
            .filter((c) => c.grade === i + 1)
            .map((c) => ({ ...c, visibles: c.students.filter(pasa) }))
            .filter((c) => c.visibles.length > 0),
    })).filter((a) => a.secciones.length > 0);

    const { summary } = data;
    const moneda = data.currency;

    return (
        // Era una página suelta metida dentro de otra: su propio fondo, su propia
        // franja blanca y su propio margen encima del margen del marco (el título
        // empezaba 32 px más adentro que en las demás pantallas) y un segundo
        // `<main>` dentro del primero, que confunde al lector de pantalla.
        <div className="space-y-6">
            <div>
                <div>
                    <EncabezadoDePantalla titulo="Pagos" descripcion={`Ciclo escolar ${data.academicYear.name}`} />

                    {summary.debtors > 0 ? (
                        <button
                            type="button"
                            onClick={() => setFiltro('DEBE')}
                            className="mt-5 flex w-full items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left hover:bg-red-100"
                        >
                            <AlertTriangle className="h-6 w-6 shrink-0 text-red-700" />
                            <span className="text-red-900">
                                <strong className="text-lg">
                                    {summary.debtors} {summary.debtors === 1 ? 'estudiante debe' : 'estudiantes deben'}
                                </strong>
                                <span className="block text-sm">En total {dinero(summary.owed, moneda)} vencidos · tocar para verlos</span>
                            </span>
                        </button>
                    ) : (
                        <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                            <CheckCircle2 className="h-6 w-6 text-emerald-700" />
                            <strong>Nadie tiene cuotas vencidas</strong>
                        </div>
                    )}

                    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                            ['Estudiantes', String(summary.students)],
                            ['Deben', String(summary.debtors)],
                            ['Cobrado', dinero(summary.collected, moneda)],
                            ['Deuda vencida', dinero(summary.owed, moneda)],
                        ].map(([k, v]) => (
                            <div key={k} className="rounded-xl border border-gray-200 bg-white p-3">
                                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">{k}</dt>
                                <dd className="mt-1 text-xl font-bold text-gray-900">{v}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[14rem] flex-1">
                        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar estudiante o cédula"
                            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                    </div>
                    {(['TODOS', 'DEBE', 'AL_DIA', 'ANO_PAGADO', 'EXONERADO'] as Filtro[]).map((f) => (
                        <button
                            key={f}
                            type="button"
                            onClick={() => setFiltro(f)}
                            aria-pressed={filtro === f}
                            className={cn(
                                'rounded-full border px-3 py-1.5 text-sm font-medium',
                                filtro === f ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                            )}
                        >
                            {f === 'TODOS' ? 'Todos' : ESTADO_DEL_ALUMNO[f].texto}
                        </button>
                    ))}
                </div>

                {porAno.length === 0 && <p className="py-10 text-center text-gray-700">No hay estudiantes que coincidan.</p>}

                {porAno.map((ano) => (
                    <AcordeonDeAno key={ano.grado} nombre={ano.nombre} deudores={ano.secciones.reduce((s, c) => s + c.debtors, 0)} abiertoAlEmpezar={filtro !== 'TODOS' || !!texto}>
                        <div className="grid gap-4 lg:grid-cols-2">
                            {ano.secciones.map((s) => (
                                <section key={s.id} className="rounded-xl border border-gray-200 bg-white">
                                    <h3 className="flex items-center justify-between border-b border-gray-100 px-4 py-3 text-sm font-bold text-gray-900">
                                        {s.name}
                                        {s.debtors > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">{s.debtors} deben</span>}
                                    </h3>
                                    <ul className="divide-y divide-gray-100">
                                        {s.visibles.map((a) => {
                                            const e = ESTADO_DEL_ALUMNO[a.state];
                                            return (
                                                <li key={a.id}>
                                                    <button type="button" onClick={() => setAbierto(a.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50">
                                                        <UserAvatar name={`${a.firstName} ${a.lastName}`} src={a.avatar} className="h-8 w-8" initialsClassName="text-xs" />
                                                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                                                            {a.lastName}, {a.firstName}
                                                        </span>
                                                        <span className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold', e.clases)}>
                                                            {e.texto}
                                                            {a.state === 'DEBE' && ` · ${dinero(a.owed, moneda)}`}
                                                        </span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    </AcordeonDeAno>
                ))}
            </div>

            <DialogoDeFicha studentId={abierto} alCerrar={() => setAbierto(null)} />
        </div>
    );
}

function AcordeonDeAno({ nombre, deudores, abiertoAlEmpezar, children }: { nombre: string; deudores: number; abiertoAlEmpezar: boolean; children: React.ReactNode }) {
    const [abierto, setAbierto] = React.useState(true);
    React.useEffect(() => {
        if (abiertoAlEmpezar) setAbierto(true);
    }, [abiertoAlEmpezar]);
    return (
        <section className="rounded-2xl border border-gray-200 bg-gray-100/60">
            <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="flex w-full items-center justify-between px-5 py-4 text-left">
                <span className="text-lg font-bold text-gray-900">{nombre}</span>
                <span className="flex items-center gap-3">
                    {deudores > 0 && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800">{deudores} deben</span>}
                    <ChevronDown size={20} className={cn('text-gray-600 transition-transform', abierto && 'rotate-180')} />
                </span>
            </button>
            {abierto && <div className="px-4 pb-4">{children}</div>}
        </section>
    );
}

function DialogoDeFicha({ studentId, alCerrar }: { studentId: string | null; alCerrar: () => void }) {
    const { data, isLoading } = useFichaDePagos(studentId);
    return (
        <Dialog open={!!studentId} onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{data ? `${data.student.firstName} ${data.student.lastName}` : 'Pagos'}</DialogTitle>
                    <DialogDescription>{data?.student.classroom?.name ?? ''}</DialogDescription>
                </DialogHeader>
                {isLoading || !data ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                    </div>
                ) : (
                    <FichaDePagos ficha={data} editable />
                )}
            </DialogContent>
        </Dialog>
    );
}
