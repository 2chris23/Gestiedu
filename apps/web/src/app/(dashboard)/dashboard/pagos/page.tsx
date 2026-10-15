'use client';

import { Button } from '@/components/ui/button';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Lock, Search, Wallet } from 'lucide-react';
import { VistaResumen } from '@/components/finanzas/VistaResumen';
import { VistaDelPersonal } from '@/components/finanzas/VistaDelPersonal';
import { VistaDeGastosYFondos } from '@/components/finanzas/GastosYFondos';
import { NuevoMovimiento, type FuenteDelMovimiento, type TipoDeMovimiento } from '@/components/finanzas/NuevoMovimiento';
import { BotonAnadir, PartesDeFinanzas, SaldoDisponible, VISTAS, type Vista } from '@/components/finanzas/CabezaDeFinanzas';
import { useRouter, useSearchParams } from 'next/navigation';
import { useYaArranco } from '@/hooks/useYaArranco';
import { CarrilDeMeses } from '@/components/pagos/CarrilDeMeses';
import { MesAbierto, type DeudorDelMes } from '@/components/pagos/MesAbierto';
import { FilaDeAlumno, FilaDeGrupo, VerMas } from '@/components/pagos/listas-de-finanzas';
import { mesesDelCiclo, mesDe, porcentaje } from '@/lib/calendario-del-ciclo';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FichaDePagos } from '@/components/pagos/FichaDePagos';
import { PagosPorConfirmar } from '@/components/pagos/PagosPorConfirmar';
import { dinero, ESTADO_DEL_ALUMNO, EstadoDelAlumno, useCiclosDePagos, useFichaDePagos, usePagosActivos, useResumenDePagos, type Moneda } from '@/hooks/usePagos';
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
    // Dónde se está en la lista: todos los años, un año o una sección.
    const [ano, setAno] = React.useState<number | null>(null);
    const [seccion, setSeccion] = React.useState<string | null>(null);
    React.useEffect(() => setMes(null), [ciclo]);

    const todos = React.useMemo(
        () =>
            (data?.classrooms ?? []).flatMap((c) =>
                c.students.map((a) => ({ ...a, seccion: c.name, seccionId: c.id, grado: c.grade, nombre: `${a.lastName}, ${a.firstName}` }))
            ),
        [data]
    );

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

    const { summary } = data;
    const moneda = data.currency;
    const fmt = (n: number | string) => dinero(n, moneda);

    // Los 12 meses del ciclo, aunque alguno no tenga cuotas (se ve vacío).
    const porMesDelServidor = new Map((data.months ?? []).map((m) => [m.month, m]));
    const meses = mesesDelCiclo(String(data.academicYear.startDate).slice(0, 10), String(data.academicYear.endDate).slice(0, 10)).map((m) => {
        const x = porMesDelServidor.get(m);
        return { mes: m, esperado: Number(x?.expected ?? 0), cobrado: Number(x?.collected ?? 0), deben: x?.debtors ?? 0 };
    });
    const esperadoDelCiclo = meses.reduce((t, m) => t + m.esperado, 0);
    const elMes = mes ? meses.find((m) => m.mes === mes) : undefined;

    // Quién debe del mes elegido: los que tienen vencida una cuota que vence ese mes.
    const deudoresDelMes: DeudorDelMes[] = [];
    if (mes) {
        const claves = new Set((data.installments ?? []).filter((c) => mesDe(c.dueDate) === mes).map((c) => c.key));
        for (const a of todos) {
            if (Object.entries(a.cuotas ?? {}).some(([k, e]) => claves.has(k) && e === 'VENCIDA')) {
                deudoresDelMes.push({ id: a.id, nombre: a.nombre, seccion: a.seccion, seccionId: a.seccionId, avatar: a.avatar });
            }
        }
        deudoresDelMes.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
    }

    const texto = busqueda.trim().toLowerCase();
    const plana = filtro !== 'TODOS' || !!texto;
    const visibles = plana
        ? todos
              .filter((a) => (filtro === 'TODOS' || a.state === filtro) && (!texto || `${a.firstName} ${a.lastName} ${a.id}`.toLowerCase().includes(texto)))
              .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
        : [];
    const cuantosCon = (f: Filtro) => (f === 'TODOS' ? todos.length : todos.filter((a) => a.state === f).length);

    const fila = (a: (typeof todos)[number], conSeccion: boolean) => (
        <FilaDeAlumno
            key={a.id}
            nombre={a.nombre}
            detalle={conSeccion ? a.seccion : undefined}
            avatar={a.avatar}
            monto={a.state === 'DEBE' ? fmt(a.owed) : undefined}
            alDia={a.state === 'DEBE' ? undefined : ESTADO_DEL_ALUMNO[a.state].texto}
            alTocar={() => setAbierto(a.id)}
        />
    );

    const elAno = ano ? ANOS[ano - 1] : null;
    const secciones = ano ? data.classrooms.filter((c) => c.grade === ano).sort((x, y) => x.name.localeCompare(y.name, 'es')) : [];
    const laSeccion = seccion ? data.classrooms.find((c) => c.id === seccion) : undefined;

    return (
        // Como Rial (2026-10-14): una tarjeta con lo que importa, los meses en un
        // carril y la lista por años → secciones → alumnos. Nunca los 599 de golpe.
        <div className="space-y-6">
            {!data.closed && <PagosPorConfirmar />}

            <section aria-label="Las cuotas del ciclo" className="rounded-[24px] bg-white p-4 ring-1 ring-gray-200">
                {data.closed && (
                    <p className="mb-3 flex items-center gap-2 text-sm text-gray-700">
                        <Lock className="h-4 w-4 shrink-0" aria-hidden /> Ciclo cerrado: solo se mira.
                    </p>
                )}
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-sm text-gray-600">Cobrado</p>
                        <p className="text-2xl font-bold tabular-nums text-gray-900">{fmt(summary.collected)}</p>
                    </div>
                    <div className="min-w-0 text-right">
                        <p className="text-sm text-gray-600">Vencido</p>
                        <p className={cn('text-2xl font-bold tabular-nums', Number(summary.owed) > 0 ? 'text-red-700' : 'text-gray-900')}>{fmt(summary.owed)}</p>
                    </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${porcentaje(Number(summary.collected), esperadoDelCiclo)}%` }} />
                </div>
                {summary.debtors > 0 ? (
                    <button
                        type="button"
                        onClick={() => setFiltro('DEBE')}
                        className="-mx-2 mt-2 flex min-h-[44px] w-[calc(100%+1rem)] items-center gap-2 rounded-xl px-2 text-left text-sm text-gray-700 active:bg-gray-50"
                    >
                        <span className="flex-1">
                            <strong className="font-semibold text-red-700">{summary.debtors}</strong> de {summary.students}{' '}
                            {summary.debtors === 1 ? 'estudiante debe' : 'estudiantes deben'}
                        </span>
                        <ChevronRight className="h-4 w-4 text-gray-500" aria-hidden />
                    </button>
                ) : (
                    <p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" aria-hidden /> Nadie tiene cuotas vencidas
                    </p>
                )}
            </section>

            <section aria-labelledby="titulo-meses" className="space-y-3">
                <h2 id="titulo-meses" className="flex items-baseline gap-2 text-lg font-bold text-gray-900">
                    Meses <span className="text-sm font-normal text-gray-500">{data.academicYear.name}</span>
                </h2>
                <CarrilDeMeses meses={meses} hoy={data.today} elegido={mes} alElegir={(m) => setMes(m === mes ? null : m)} />
                {mes && elMes && (
                    <MesAbierto
                        ciclo={ciclo}
                        mes={mes}
                        esperado={elMes.esperado}
                        cobrado={elMes.cobrado}
                        deudores={deudoresDelMes}
                        dinero={fmt}
                        alAbrirAlumno={setAbierto}
                        alCerrar={() => setMes(null)}
                    />
                )}
            </section>

            <section aria-labelledby="titulo-estudiantes" className="space-y-3">
                <h2 id="titulo-estudiantes" className="text-lg font-bold text-gray-900">
                    Estudiantes
                </h2>
                <label className="flex min-h-[48px] items-center gap-3 rounded-full bg-white px-4 ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-indigo-500">
                    <Search className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                    <input
                        type="search"
                        aria-label="Buscar estudiante"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar estudiante o cédula"
                        className="min-h-[44px] min-w-0 flex-1 bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-500"
                    />
                </label>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0" role="group" aria-label="Filtrar por estado">
                    {(['TODOS', 'DEBE', 'AL_DIA', 'ANO_PAGADO', 'EXONERADO'] as Filtro[]).map((f) => (
                        <button
                            key={f}
                            type="button"
                            onClick={() => setFiltro(f)}
                            aria-pressed={filtro === f}
                            className={cn(
                                'min-h-[44px] shrink-0 rounded-full px-4 text-sm font-medium',
                                filtro === f ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 ring-1 ring-gray-200'
                            )}
                        >
                            {f === 'TODOS' ? 'Todos' : ESTADO_DEL_ALUMNO[f].texto} <span className={cn('ml-0.5', filtro === f ? 'text-white/80' : 'text-gray-500')}>{cuantosCon(f)}</span>
                        </button>
                    ))}
                </div>

                <div className="overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
                    {plana ? (
                        <VerMas cosas={visibles} etiqueta="Estudiantes" vacio="No hay estudiantes que coincidan.">
                            {(a) => fila(a, true)}
                        </VerMas>
                    ) : laSeccion ? (
                        <>
                            <Volver texto={`${elAno} · ${laSeccion.name}`} alTocar={() => setSeccion(null)} />
                            <VerMas cosas={todos.filter((a) => a.seccionId === laSeccion.id).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))} etiqueta={laSeccion.name}>
                                {(a) => fila(a, false)}
                            </VerMas>
                        </>
                    ) : ano ? (
                        <>
                            <Volver texto={elAno ?? ''} alTocar={() => setAno(null)} />
                            <ul aria-label={`Secciones de ${elAno}`} className="divide-y divide-gray-100">
                                {secciones.map((c) => (
                                    <FilaDeGrupo key={c.id} nombre={c.name} cuantos={c.students.length} deben={c.debtors} alTocar={() => setSeccion(c.id)} />
                                ))}
                            </ul>
                        </>
                    ) : (
                        <ul aria-label="Años" className="divide-y divide-gray-100">
                            {ANOS.map((nombre, i) => {
                                const del = data.classrooms.filter((c) => c.grade === i + 1);
                                if (!del.length) return null;
                                return (
                                    <FilaDeGrupo
                                        key={nombre}
                                        nombre={nombre}
                                        cuantos={del.reduce((t, c) => t + c.students.length, 0)}
                                        deben={del.reduce((t, c) => t + c.debtors, 0)}
                                        alTocar={() => setAno(i + 1)}
                                    />
                                );
                            })}
                        </ul>
                    )}
                </div>
            </section>

            <DialogoDeFicha studentId={abierto} ciclo={ciclo} alCerrar={() => setAbierto(null)} />
        </div>
    );
}

/** «‹ 1er Año»: volver un nivel en la lista. */
function Volver({ texto, alTocar }: { texto: string; alTocar: () => void }) {
    return (
        <button type="button" onClick={alTocar} className="flex min-h-[52px] w-full items-center gap-2 border-b border-gray-100 px-3 text-left text-[15px] font-semibold text-gray-900 active:bg-gray-50">
            <ChevronLeft className="h-5 w-5 text-gray-600" aria-hidden />
            {texto}
        </button>
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


/**
 * FINANZAS DEL LICEO
 *
 * Cristian: «hacer aquí en pagos controlar también los pagos a los profesores,
 * al personal y gastos extras… que sea para manejar sus finanzas». La misma
 * dirección de siempre (`/dashboard/pagos`): arriba el saldo, debajo sus
 * cuatro partes en círculos y el «+» para añadir (como Rial, 2026-10-14); los dos van en la dirección (`?vista=&ciclo=`), así que
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
    // El panel del «+» (y el saldo inicial del Resumen) vive aquí: se abre
    // desde cualquier parte de las finanzas.
    const [movimiento, setMovimiento] = React.useState<null | { tipo: TipoDeMovimiento; fuente?: FuenteDelMovimiento }>(null);
    const ir = (cambios: { ciclo?: string | null; vista?: Vista }) => {
        const q = new URLSearchParams();
        const c = cambios.ciclo !== undefined ? cambios.ciclo : ciclo;
        const v = cambios.vista ?? vista;
        if (v !== 'resumen') q.set('vista', v);
        if (c) q.set('ciclo', c);
        router.replace(`/dashboard/pagos${q.size ? `?${q}` : ''}`, { scroll: false });
    };

    // Hasta arrancar, la rueda también en el navegador (ver `useYaArranco`).
    const arranco = useYaArranco();

    if (!arranco || cargandoAjustes) {
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
        <div className="space-y-5 pb-20" data-sin-titulo>
            {/* Sin título ni explicación (Cristian: «si tocó en Finanzas sabe qué es»;
                las dudas, en el «?» de arriba). El ciclo irá en otro sitio: por ahora
                se elige con `?ciclo=`. */}
            <h1 className="sr-only">Finanzas</h1>

            <SaldoDisponible ciclo={ciclo} />
            {/* Las cuatro partes, en círculos debajo del saldo (los accesos de Rial). */}
            <PartesDeFinanzas vista={vista} alElegir={(v) => ir({ vista: v })} />

            {vista === 'resumen' && <VistaResumen ciclo={ciclo} irA={(v) => ir({ vista: v })} alPonerSaldo={() => setMovimiento({ tipo: 'entra', fuente: 'SALDO_INICIAL' })} />}
            {vista === 'estudiantes' && <VistaDeEstudiantes ciclo={ciclo} />}
            {vista === 'personal' && <VistaDelPersonal ciclo={ciclo} />}
            {vista === 'gastos' && <VistaDeGastosYFondos ciclo={ciclo} monedas={monedas} cerrado={Boolean(elCiclo?.closed)} />}

            {/* Un ciclo cerrado se ve, no se toca: sin «+». */}
            {!elCiclo?.closed && (
                <BotonAnadir alIngreso={() => setMovimiento({ tipo: 'entra' })} alEgreso={() => setMovimiento({ tipo: 'sale' })} />
            )}
            {movimiento && (
                <NuevoMovimiento
                    tipoInicial={movimiento.tipo}
                    fuenteInicial={movimiento.fuente}
                    ciclo={ciclo}
                    monedas={monedas}
                    metodos={ajustes?.methods ?? []}
                    alCerrar={() => setMovimiento(null)}
                />
            )}
        </div>
    );
}
