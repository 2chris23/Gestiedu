'use client';

import { Button } from '@/components/ui/button';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, GraduationCap, Loader2, Lock, Search, ShoppingCart, Users, Wallet } from 'lucide-react';
import { VistaResumen } from '@/components/finanzas/VistaResumen';
import { VistaDelPersonal } from '@/components/finanzas/VistaDelPersonal';
import { VistaDeGastosYFondos } from '@/components/finanzas/GastosYFondos';
import { useRouter, useSearchParams } from 'next/navigation';
import { BotonComoFunciona } from '@/components/common/Recorrido';
import { CalendarioDelCiclo } from '@/components/pagos/CalendarioDelCiclo';
import { MesEnDias, type DeudorDelMes } from '@/components/pagos/MesEnDias';
import { SelectorDeCiclo } from '@/components/pagos/SelectorDeCiclo';
import { mesesDelCiclo, mesDe } from '@/lib/calendario-del-ciclo';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import UserAvatar from '@/components/ui/UserAvatar';
import { FichaDePagos } from '@/components/pagos/FichaDePagos';
import { PagosPorConfirmar } from '@/components/pagos/PagosPorConfirmar';
import { AlumnoEnResumen, dinero, ESTADO_DEL_ALUMNO, EstadoDelAlumno, useCiclosDePagos, useFichaDePagos, usePagosActivos, useResumenDePagos, type Moneda } from '@/hooks/usePagos';
import { cn } from '@/lib/utils';

/**
 * PAGOS, CICLO A CICLO Y COMO CALENDARIO (2026-10-01)
 *
 * Cristian: «se debe elegir por ciclo escolar para ver pagos pasados» y «me
 * gustaría que fuera más como un calendario». Arriba, el ciclo que se mira (los
 * cerrados se ven, no se tocan) y el aviso que importa: cuántos deben. Luego
 * los 12 meses del ciclo; al tocar uno, ese mes en días: qué vence y quién pagó
 * cada día, y quién debe de ese mes. Abajo, por año y por sección, cada
 * estudiante y cómo va; al tocarlo, su ficha para cobrarle.
 */

const ANOS = ['1er Año', '2do Año', '3er Año', '4to Año', '5to Año', '6to Año'];
type Filtro = 'TODOS' | EstadoDelAlumno;

function VistaDeEstudiantes({ ciclo }: { ciclo: string | null }) {
    const { data, isLoading, error } = useResumenDePagos(true, ciclo);
    const [busqueda, setBusqueda] = React.useState('');
    const [filtro, setFiltro] = React.useState<Filtro>('TODOS');
    const [abierto, setAbierto] = React.useState<string | null>(null);
    const [mes, setMes] = React.useState<string | null>(null);
    React.useEffect(() => setMes(null), [ciclo]);

    if (isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" aria-label="Cargando los pagos" />
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
    const fmt = (n: number | string) => dinero(n, moneda);

    // Los 12 meses del ciclo, aunque alguno no tenga cuotas (se ve vacío).
    const porMesDelServidor = new Map((data.months ?? []).map((m) => [m.month, m]));
    const meses = mesesDelCiclo(String(data.academicYear.startDate).slice(0, 10), String(data.academicYear.endDate).slice(0, 10)).map((m) => {
        const x = porMesDelServidor.get(m);
        return { mes: m, esperado: Number(x?.expected ?? 0), cobrado: Number(x?.collected ?? 0), deben: x?.debtors ?? 0 };
    });

    // Quién debe del mes elegido: los que tienen vencida una cuota que vence ese mes.
    const deudoresDelMes: DeudorDelMes[] = [];
    if (mes) {
        const claves = new Set((data.installments ?? []).filter((c) => mesDe(c.dueDate) === mes).map((c) => c.key));
        for (const s of data.classrooms) {
            for (const a of s.students) {
                if (Object.entries(a.cuotas ?? {}).some(([k, e]) => claves.has(k) && e === 'VENCIDA')) {
                    deudoresDelMes.push({ id: a.id, nombre: `${a.lastName}, ${a.firstName}`, seccion: s.name });
                }
            }
        }
        deudoresDelMes.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
    }

    return (
        // Era una página suelta metida dentro de otra: su propio fondo, su propia
        // franja blanca y su propio margen encima del margen del marco (el título
        // empezaba 32 px más adentro que en las demás pantallas) y un segundo
        // `<main>` dentro del primero, que confunde al lector de pantalla.
        <div className="space-y-6">
            {!data.closed && <PagosPorConfirmar />}
            <div>
                <div>
                    {data.closed && (
                        <p className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
                            <Lock className="h-4 w-4 shrink-0 text-gray-600" aria-hidden />
                            Este ciclo está cerrado: sus pagos se ven, ya no se cambian.
                        </p>
                    )}

                    {summary.debtors > 0 ? (
                        <button
                            type="button"
                            onClick={() => setFiltro('DEBE')}
                            className="mt-1 flex w-full items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left hover:bg-red-100"
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
                        <div className="mt-1 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
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

            <section aria-labelledby="titulo-del-calendario" className="space-y-3">
                <h2 id="titulo-del-calendario" className="text-lg font-bold text-gray-900">
                    El ciclo, mes a mes
                </h2>
                <CalendarioDelCiclo meses={meses} hoy={data.today} elegido={mes} alElegir={(m) => setMes(m === mes ? null : m)} dinero={fmt} />
                {mes && (
                    <MesEnDias ciclo={ciclo} mes={mes} dinero={fmt} deudores={deudoresDelMes} alAbrirAlumno={setAbierto} alCerrar={() => setMes(null)} />
                )}
            </section>

            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[14rem] flex-1">
                        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="search"
                            aria-label="Buscar estudiante"
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
                                'min-h-[44px] rounded-full border px-3 text-sm font-medium',
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
                                                        {/* Sin cortar: «González, Cristóbal» salía «González, Cr…» y no había forma de leerlo. */}
                                                        <span className="min-w-0 flex-1 break-words text-sm font-medium text-gray-900">
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

            <DialogoDeFicha studentId={abierto} ciclo={ciclo} alCerrar={() => setAbierto(null)} />
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

function DialogoDeFicha({ studentId, ciclo, alCerrar }: { studentId: string | null; ciclo: string | null; alCerrar: () => void }) {
    const { data, isLoading } = useFichaDePagos(studentId, ciclo);
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

// ════════════════════════════════════════════════════════════════════════════
// FINANZAS: la página (2026-10-01)
// ════════════════════════════════════════════════════════════════════════════

type Vista = 'resumen' | 'estudiantes' | 'personal' | 'gastos';
const VISTAS: Array<{ id: Vista; nombre: string; pista: string; icono: typeof Wallet }> = [
    { id: 'resumen', nombre: 'Resumen', pista: 'Fondos y el ciclo mes a mes', icono: Wallet },
    { id: 'estudiantes', nombre: 'Estudiantes', pista: 'Cuotas, cobros y quién debe', icono: GraduationCap },
    { id: 'personal', nombre: 'Personal', pista: 'Sueldos, vacaciones y recibos', icono: Users },
    { id: 'gastos', nombre: 'Gastos y fondos', pista: 'Compras, reparaciones, ingresos', icono: ShoppingCart },
];

/**
 * FINANZAS DEL LICEO
 *
 * Cristian: «hacer aquí en pagos controlar también los pagos a los profesores,
 * al personal y gastos extras… que sea para manejar sus finanzas». La misma
 * dirección de siempre (`/dashboard/pagos`), con cuatro pestañas y el ciclo
 * que se mira arriba; los dos van en la dirección (`?vista=&ciclo=`), así que
 * volver atrás y compartir el enlace llevan al mismo sitio.
 */
export default function FinanzasPage() {
    const { data: ajustes, isLoading: cargandoAjustes } = usePagosActivos();
    const activo = Boolean(ajustes?.enabled);
    const router = useRouter();
    const buscar = useSearchParams();
    const ciclo = buscar.get('ciclo');
    const vista = (VISTAS.some((v) => v.id === buscar.get('vista')) ? buscar.get('vista') : 'resumen') as Vista;
    const { data: ciclos = [] } = useCiclosDePagos(activo);
    const ir = (cambios: { ciclo?: string | null; vista?: Vista }) => {
        const q = new URLSearchParams();
        const c = cambios.ciclo !== undefined ? cambios.ciclo : ciclo;
        const v = cambios.vista ?? vista;
        if (v !== 'resumen') q.set('vista', v);
        if (c) q.set('ciclo', c);
        router.replace(`/dashboard/pagos${q.size ? `?${q}` : ''}`, { scroll: false });
    };

    if (cargandoAjustes) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" aria-label="Cargando" />
            </div>
        );
    }

    if (!activo) {
        // La misma cabecera que las demás pantallas, y debajo qué hacer.
        return (
            <div className="space-y-6">
                <EncabezadoDePantalla titulo="Finanzas" descripcion="Cuotas de los estudiantes, pagos al personal, gastos y fondos del liceo" />
                <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
                    <Wallet className="mx-auto h-10 w-10 text-gray-500" aria-hidden />
                    <h2 className="mt-3 text-lg font-bold text-gray-900">Las finanzas están apagadas</h2>
                    <p className="mt-2 text-gray-700">Se encienden en Configuración → Pagos.</p>
                    <Button asChild className="mt-4">
                        <Link href="/dashboard/configuracion">Ir a Configuración</Link>
                    </Button>
                </div>
            </div>
        );
    }

    const elCiclo = ciclo ? ciclos.find((c) => c.id === ciclo) : ciclos.find((c) => c.status === 'ACTIVE');
    const base = (ajustes?.baseCurrency ?? 'USD') as Moneda;
    const monedas = { base, aceptadas: (ajustes?.acceptedCurrencies === 'BOTH' || !ajustes?.acceptedCurrencies ? ['USD', 'VES'] : [ajustes.acceptedCurrencies]) as Moneda[] };

    return (
        <div className="space-y-5">
            <EncabezadoDePantalla
                titulo="Finanzas"
                descripcion="Lo que tiene el liceo, lo que le deben, lo que paga y lo que gasta. Elige una pestaña; los meses se tocan para verlos por días."
                acciones={
                    <>
                        {ciclos.length > 0 && <SelectorDeCiclo ciclos={ciclos} valor={ciclo} alCambiar={(c) => ir({ ciclo: c })} />}
                        <BotonComoFunciona recorrido="finanzas" />
                    </>
                }
            />
            {elCiclo && ciclos.length === 0 && <p className="-mt-2 text-sm font-semibold text-gray-700">Ciclo escolar {elCiclo.name}{elCiclo.closed ? ' · cerrado' : ''}</p>}

            <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Partes de las finanzas">
                {VISTAS.map((v) => {
                    const Icono = v.icono;
                    const activa = vista === v.id;
                    return (
                        <button
                            key={v.id}
                            type="button"
                            onClick={() => ir({ vista: v.id })}
                                    data-pestana
                            data-recorrido={`finanzas-${v.id}`}
                            aria-current={activa ? 'page' : undefined}
                            aria-describedby={`pista-${v.id}`}
                            className={cn(
                                'flex min-h-[44px] items-start gap-2 rounded-xl border p-3 text-left transition-colors',
                                activa ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                            )}
                        >
                            <Icono className={cn('mt-0.5 h-5 w-5 shrink-0', activa ? 'text-indigo-600' : 'text-gray-500')} aria-hidden />
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold leading-tight">{v.nombre}</span>
                                <span id={`pista-${v.id}`} className={cn('mt-0.5 block text-xs leading-snug', activa ? 'text-indigo-700' : 'text-gray-600')}>
                                    {v.pista}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </nav>

            {vista === 'resumen' && <VistaResumen ciclo={ciclo} monedas={monedas} irA={(v) => ir({ vista: v })} />}
            {vista === 'estudiantes' && <VistaDeEstudiantes ciclo={ciclo} />}
            {vista === 'personal' && <VistaDelPersonal ciclo={ciclo} />}
            {vista === 'gastos' && <VistaDeGastosYFondos ciclo={ciclo} monedas={monedas} cerrado={Boolean(elCiclo?.closed)} />}
        </div>
    );
}
