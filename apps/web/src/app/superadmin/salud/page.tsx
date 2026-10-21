'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { superAdminFetch } from '@/lib/superadmin-fetch';
import { SaludDelSistema } from '@/components/superadmin/SaludDelSistema';

/**
 * LA SALUD DE TODO, SIN ENTRAR A NINGÚN LICEO (salud, 18-oct-2026)
 *
 * Cristian: «quiero ver cómo están trabajando cada botón, el login… el tiempo
 * de respuesta… el pronóstico con miles de miles de usuarios… y si tiene
 * errores». Lo da `/api/superadmin/salud/*` (`routes/salud.routes.ts`).
 */

interface Ruta {
    ruta: string;
    nombre: string;
    rol: string;
    total: number;
    errores5xx: number;
    errores4xx: number;
    rechazos: number;
    tasaDeError: number;
    mediaMs: number | null;
    p50: number | null;
    p95: number | null;
    p99: number | null;
    maxMs: number;
    codigos: Array<{ codigo: string; veces: number }>;
}
interface Liceo extends Omit<Ruta, 'ruta' | 'nombre' | 'rol'> {
    instituteId: string;
    nombre: string;
    slug: string | null;
    personas: number;
    semaforo: 'bien' | 'regular' | 'mal';
}
interface ErrorAgrupado {
    huella: string;
    origen: 'servidor' | 'pantalla';
    tipo: string;
    mensaje: string;
    donde: string;
    ruta: string | null;
    version: string | null;
    veces: number;
    liceos: number;
    primera: string;
    ultima: string;
    muestra: string;
    estado: 'abierto' | 'visto' | 'resuelto' | 'volvio';
}
interface Prevision {
    personas: number;
    porSegundo: number;
    ocupacion: number;
    respuestaMs: number | null;
    esperaMs: number | null;
}
interface Pronostico {
    hayDatos: boolean;
    capacidad: { aLaVez: number; como: string };
    servicioMs?: number;
    porPersonaPorMinuto?: number;
    previsiones?: Prevision[];
    limites?: { seDobla: number | null; seCae: number | null };
    calibracion?: { errorMedio: number | null; puntos: Array<{ personas: number; medidoMs: number; previstoMs: number | null }> };
    supuestos: string[];
}
interface Robot {
    liceo: string | null;
    configurado: boolean;
    ultima: { en: string; pasos: Array<{ paso: string; ms: number; ok: boolean; estado: number | null; detalle: string | null }> } | null;
    medianas: Record<string, number | null>;
    vueltas: number;
}

const ms = (x: number | null | undefined) => (x === null || x === undefined ? '—' : x >= 1000 ? `${(x / 1000).toLocaleString('es-VE', { maximumFractionDigits: 1 })} s` : `${Math.round(x)} ms`);
const miles = (n: number) => n.toLocaleString('es-VE');
const cuando = (iso: string) => new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const SEMAFORO: Record<string, string> = {
    bien: 'bg-green-500/15 text-green-300 border-green-500/40',
    regular: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40',
    mal: 'bg-red-500/15 text-red-300 border-red-500/40',
};
const colorDeMs = (x: number | null) => (x === null ? 'text-gray-400' : x < 300 ? 'text-green-300' : x < 1000 ? 'text-yellow-200' : 'text-red-300');

const VENTANAS = [
    { horas: 1, texto: 'Última hora' },
    { horas: 24, texto: '24 horas' },
    { horas: 168, texto: '7 días' },
];

function Caja({ titulo, children, derecha }: { titulo: string; children: React.ReactNode; derecha?: React.ReactNode }) {
    return (
        <section className="mb-6 rounded-lg border border-gray-700 bg-gray-800 p-5" aria-label={titulo}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-white">{titulo}</h2>
                {derecha}
            </div>
            {children}
        </section>
    );
}

function VerMas<T>({ filas, de = 20, pintar }: { filas: T[]; de?: number; pintar: (f: T) => React.ReactNode }) {
    const [n, setN] = useState(de);
    return (
        <>
            {filas.slice(0, n).map(pintar)}
            {filas.length > n && (
                <button type="button" onClick={() => setN(n + de)} className="mt-3 min-h-[44px] w-full rounded-lg border border-gray-700 text-sm font-semibold text-gray-200 hover:bg-gray-700/50">
                    Ver {Math.min(de, filas.length - n)} más (quedan {filas.length - n})
                </button>
            )}
        </>
    );
}

export default function SaludPage() {
    const [horas, setHoras] = useState(1);
    const [rutas, setRutas] = useState<Ruta[] | null>(null);
    const [liceos, setLiceos] = useState<Liceo[] | null>(null);
    const [errores, setErrores] = useState<ErrorAgrupado[] | null>(null);
    const [pronostico, setPronostico] = useState<Pronostico | null>(null);
    const [robot, setRobot] = useState<Robot | null>(null);
    const [fallo, setFallo] = useState<string | null>(null);
    const [buscar, setBuscar] = useState('');
    const [abierto, setAbierto] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        try {
            const [r, l, e, p, b] = await Promise.all([
                superAdminFetch(`/api/superadmin/salud/rutas?horas=${horas}`).then((x) => x.json()),
                superAdminFetch(`/api/superadmin/salud/liceos?horas=${horas}`).then((x) => x.json()),
                superAdminFetch('/api/superadmin/salud/errores').then((x) => x.json()),
                superAdminFetch(`/api/superadmin/salud/pronostico?horas=${Math.max(24, horas)}`).then((x) => x.json()),
                superAdminFetch('/api/superadmin/salud/robot').then((x) => x.json()),
            ]);
            setRutas(r.rutas ?? []);
            setLiceos(l.liceos ?? []);
            setErrores(e.errores ?? []);
            setPronostico(p);
            setRobot(b);
            setFallo(null);
        } catch {
            setFallo('No se pudo leer la salud del sistema.');
        }
    }, [horas]);

    useEffect(() => {
        void cargar();
        const t = window.setInterval(() => void cargar(), 60_000);
        return () => window.clearInterval(t);
    }, [cargar]);

    const marcar = async (huella: string, estado: 'visto' | 'resuelto' | 'abierto') => {
        await superAdminFetch(`/api/superadmin/salud/errores/${huella}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }) });
        void cargar();
    };

    const total = useMemo(() => {
        if (!rutas) return null;
        const t = rutas.reduce((a, r) => a + r.total, 0);
        const e = rutas.reduce((a, r) => a + r.errores5xx, 0);
        const rech = rutas.reduce((a, r) => a + r.rechazos, 0);
        const login = rutas.filter((r) => r.ruta === 'POST /api/auth/login');
        const loginTotal = login.reduce((a, r) => a + r.total, 0);
        const loginFallos = login.reduce((a, r) => a + r.errores4xx + r.errores5xx, 0);
        const peorP95 = rutas.filter((r) => r.total >= 5).reduce((a, r) => Math.max(a, r.p95 ?? 0), 0);
        return { t, e, rech, loginTotal, loginFallos, login: login[0] ?? null, peorP95 };
    }, [rutas]);

    const abiertos = (errores ?? []).filter((e) => e.estado !== 'resuelto');
    const robotMal = robot?.ultima?.pasos.filter((p) => !p.ok) ?? [];
    const general =
        (total && total.e > 0) || robotMal.length || abiertos.some((e) => e.estado === 'volvio')
            ? 'mal'
            : (total && (total.rech > 0 || total.peorP95 > 1500)) || abiertos.length
              ? 'regular'
              : 'bien';
    const rutasFiltradas = (rutas ?? []).filter((r) => !buscar || `${r.nombre} ${r.ruta}`.toLowerCase().includes(buscar.toLowerCase()));

    return (
        <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-white">Salud</h1>
                    <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${SEMAFORO[general]}`} role="status">
                        {general === 'bien' ? 'Todo bien' : general === 'regular' ? 'Hay que mirar algo' : 'Algo falla'}
                    </span>
                </div>
                <div className="flex rounded-lg border border-gray-700 p-1" role="group" aria-label="Ventana de tiempo">
                    {VENTANAS.map((v) => (
                        <button
                            key={v.horas}
                            type="button"
                            aria-pressed={horas === v.horas}
                            onClick={() => setHoras(v.horas)}
                            className={`min-h-[40px] rounded-md px-3 text-sm font-semibold ${horas === v.horas ? 'bg-violet-600 text-white' : 'text-gray-300 hover:bg-gray-700/60'}`}
                        >
                            {v.texto}
                        </button>
                    ))}
                </div>
            </div>
            {fallo && <p className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{fallo}</p>}

            {total && (
                <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                        { t: 'Peticiones', v: miles(total.t), d: `${miles(total.e)} con error del servidor` },
                        { t: 'Rechazadas por carga', v: miles(total.rech), d: '429 y 503: el sistema dijo «ahora no»' },
                        { t: 'Entrar (login)', v: total.loginTotal ? `${miles(total.loginTotal)} veces` : '—', d: total.login ? `p95 ${ms(total.login.p95)} · ${miles(total.loginFallos)} fallidos` : 'Nadie entró en esta ventana' },
                        { t: 'El botón más lento (p95)', v: ms(total.peorP95 || null), d: 'De los que se usaron 5 veces o más' },
                    ].map((c) => (
                        <div key={c.t} className="rounded-xl border border-gray-700/50 bg-gray-800 p-4">
                            <p className="text-sm text-gray-300">{c.t}</p>
                            <p className="mt-1 text-2xl font-bold text-white tabular-nums">{c.v}</p>
                            <p className="mt-1 text-xs text-gray-400">{c.d}</p>
                        </div>
                    ))}
                </div>
            )}

            <SaludDelSistema />

            <Caja titulo="Pronóstico con miles de miles">
                {!pronostico ? (
                    <p className="text-sm text-gray-400">Cargando…</p>
                ) : !pronostico.hayDatos ? (
                    <p className="text-sm text-gray-300">Aún no hay medido lo suficiente. Hace falta gente usando la app (o el robot) unos minutos.</p>
                ) : (
                    <>
                        <p className="mb-4 text-sm text-gray-300">
                            Una petición tarda <b className="text-white">{ms(pronostico.servicioMs)}</b> sin nadie delante; cada persona conectada hace{' '}
                            <b className="text-white">{pronostico.porPersonaPorMinuto}</b> por minuto; el sistema atiende <b className="text-white">{pronostico.capacidad.aLaVez}</b> a la vez ({pronostico.capacidad.como}).
                        </p>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[520px] text-sm">
                                <thead>
                                    <tr className="text-left text-gray-400">
                                        <th className="py-2 font-medium">Personas a la vez</th>
                                        <th className="py-2 font-medium">Peticiones/s</th>
                                        <th className="py-2 font-medium">Ocupación</th>
                                        <th className="py-2 font-medium">Respuesta media</th>
                                        <th className="py-2 font-medium">De eso, esperando</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pronostico.previsiones!.map((p) => (
                                        <tr key={p.personas} className="border-t border-gray-700/60">
                                            <td className="py-2 font-semibold text-white tabular-nums">{miles(p.personas)}</td>
                                            <td className="py-2 text-gray-300 tabular-nums">{miles(Math.round(p.porSegundo))}</td>
                                            <td className="py-2 tabular-nums">
                                                <span className={p.ocupacion >= 1 ? 'text-red-300' : p.ocupacion > 0.8 ? 'text-yellow-200' : 'text-green-300'}>{Math.round(p.ocupacion * 100)} %</span>
                                            </td>
                                            <td className={`py-2 font-semibold tabular-nums ${p.respuestaMs === null ? 'text-red-300' : colorDeMs(p.respuestaMs)}`}>{p.respuestaMs === null ? 'No da abasto' : ms(p.respuestaMs)}</td>
                                            <td className="py-2 text-gray-300 tabular-nums">{p.esperaMs === null ? '—' : ms(p.esperaMs)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-4 text-sm text-gray-200">
                            Se dobla con <b>{pronostico.limites?.seDobla !== null && pronostico.limites?.seDobla !== undefined ? miles(pronostico.limites.seDobla) : '—'}</b> personas a la vez y deja de dar abasto con{' '}
                            <b>{pronostico.limites?.seCae ? miles(pronostico.limites.seCae) : '—'}</b>. Para más: más procesos o más conexiones (y que cada petición tarde menos).
                        </p>
                        <p className="mt-2 text-xs text-gray-400">
                            Contra lo ya medido, el modelo se equivoca un {pronostico.calibracion?.errorMedio !== null && pronostico.calibracion?.errorMedio !== undefined ? `${Math.round(pronostico.calibracion.errorMedio * 100)} %` : '—'} de media.
                        </p>
                        <details className="mt-3 text-xs text-gray-400">
                            <summary className="cursor-pointer text-gray-300">Qué supone y qué no mide</summary>
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                                {pronostico.supuestos.map((s) => (
                                    <li key={s}>{s}</li>
                                ))}
                            </ul>
                        </details>
                    </>
                )}
            </Caja>

            <Caja titulo="El robot (liceo de muestra, cada 5 min)" derecha={robot?.ultima ? <span className="text-xs text-gray-400">Última vuelta {cuando(robot.ultima.en)}</span> : null}>
                {!robot ? (
                    <p className="text-sm text-gray-400">Cargando…</p>
                ) : !robot.configurado ? (
                    <p className="text-sm text-gray-300">Sin liceo de muestra: pon su slug en <code>SALUD_LICEO_DE_MUESTRA</code> (uno propio, nunca el de un cliente).</p>
                ) : !robot.ultima ? (
                    <p className="text-sm text-gray-300">Todavía no ha dado ninguna vuelta en «{robot.liceo}».</p>
                ) : (
                    <ul className="divide-y divide-gray-700/60">
                        {robot.ultima.pasos.map((p) => (
                            <li key={p.paso} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                <span className="flex items-center gap-2 text-gray-100">
                                    <span className={`h-2.5 w-2.5 rounded-full ${p.ok ? 'bg-green-400' : 'bg-red-400'}`} aria-hidden />
                                    {p.paso}
                                </span>
                                <span className="text-right">
                                    <span className={`font-semibold tabular-nums ${colorDeMs(p.ms)}`}>{ms(p.ms)}</span>
                                    {robot.medianas[p.paso] !== undefined && <span className="ml-2 text-xs text-gray-400">mediana del día {ms(robot.medianas[p.paso])}</span>}
                                    {p.detalle && <span className="block text-xs text-gray-400">{p.detalle}</span>}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Caja>

            <Caja titulo={`Errores (${abiertos.length} sin resolver)`}>
                {!errores ? (
                    <p className="text-sm text-gray-400">Cargando…</p>
                ) : errores.length === 0 ? (
                    <p className="text-sm text-gray-300">Ningún error apuntado.</p>
                ) : (
                    <div className="divide-y divide-gray-700/60">
                        <VerMas
                            filas={errores}
                            pintar={(e) => (
                                <div key={e.huella} className="py-3">
                                    <button type="button" onClick={() => setAbierto(abierto === e.huella ? null : e.huella)} className="flex w-full flex-wrap items-start justify-between gap-2 text-left">
                                        <span className="min-w-0 flex-1">
                                            <span className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${e.estado === 'resuelto' ? SEMAFORO.bien : e.estado === 'volvio' ? SEMAFORO.mal : SEMAFORO.regular}`}>
                                                    {e.estado === 'volvio' ? 'Volvió' : e.estado === 'resuelto' ? 'Resuelto' : e.estado === 'visto' ? 'Visto' : 'Nuevo'}
                                                </span>
                                                <span className="text-xs text-gray-400">{e.origen === 'pantalla' ? 'En la pantalla' : 'En el servidor'}</span>
                                                <span className="font-semibold text-white">{e.tipo}</span>
                                            </span>
                                            <span className="mt-1 block break-words text-sm text-gray-200">{e.mensaje}</span>
                                            <span className="mt-1 block text-xs text-gray-400">
                                                {e.ruta ?? ''} {e.donde ? `· ${e.donde}` : ''}
                                            </span>
                                        </span>
                                        <span className="text-right text-xs text-gray-300">
                                            <b className="text-sm text-white tabular-nums">{miles(e.veces)}</b> veces · {e.liceos} liceo(s)
                                            <span className="block text-gray-400">última {cuando(e.ultima)}</span>
                                        </span>
                                    </button>
                                    {abierto === e.huella && (
                                        <div className="mt-3 rounded-lg bg-gray-900/70 p-3">
                                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-300">{e.muestra}</pre>
                                            <p className="mt-2 text-xs text-gray-400">
                                                Primera vez {cuando(e.primera)} {e.version ? `· versión ${e.version}` : ''}
                                            </p>
                                            <div className="mt-3 flex gap-2">
                                                {e.estado !== 'visto' && e.estado !== 'resuelto' && (
                                                    <button type="button" onClick={() => void marcar(e.huella, 'visto')} className="min-h-[40px] rounded-lg border border-gray-600 px-3 text-sm text-gray-200">
                                                        Visto
                                                    </button>
                                                )}
                                                {e.estado !== 'resuelto' ? (
                                                    <button type="button" onClick={() => void marcar(e.huella, 'resuelto')} className="min-h-[40px] rounded-lg bg-violet-600 px-3 text-sm font-semibold text-white">
                                                        Resuelto
                                                    </button>
                                                ) : (
                                                    <button type="button" onClick={() => void marcar(e.huella, 'abierto')} className="min-h-[40px] rounded-lg border border-gray-600 px-3 text-sm text-gray-200">
                                                        Reabrir
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        />
                    </div>
                )}
            </Caja>

            <Caja titulo="Liceos">
                {!liceos ? (
                    <p className="text-sm text-gray-400">Cargando…</p>
                ) : liceos.length === 0 ? (
                    <p className="text-sm text-gray-300">Ningún liceo usó la app en esta ventana.</p>
                ) : (
                    <div className="divide-y divide-gray-700/60">
                        <VerMas
                            filas={liceos}
                            pintar={(l) => (
                                <div key={l.instituteId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                    <span className="flex items-center gap-2">
                                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${SEMAFORO[l.semaforo]}`}>{l.semaforo === 'bien' ? 'Bien' : l.semaforo === 'regular' ? 'Regular' : 'Mal'}</span>
                                        <span className="font-semibold text-white">{l.nombre}</span>
                                        <span className="text-xs text-gray-400">{miles(l.personas)} personas</span>
                                    </span>
                                    <span className="text-xs text-gray-300 tabular-nums">
                                        {miles(l.total)} pet. · p95 <span className={colorDeMs(l.p95)}>{ms(l.p95)}</span> · {miles(l.errores5xx)} errores · {miles(l.rechazos)} rechazos
                                    </span>
                                </div>
                            )}
                        />
                    </div>
                )}
            </Caja>

            <Caja
                titulo="Cada botón"
                derecha={
                    <input
                        type="search"
                        value={buscar}
                        onChange={(e) => setBuscar(e.target.value)}
                        placeholder="Buscar un botón…"
                        aria-label="Buscar un botón"
                        className="min-h-[40px] rounded-lg border border-gray-600 bg-gray-900 px-3 text-sm text-white placeholder:text-gray-500"
                    />
                }
            >
                {!rutas ? (
                    <p className="text-sm text-gray-400">Cargando…</p>
                ) : rutasFiltradas.length === 0 ? (
                    <p className="text-sm text-gray-300">Nada medido en esta ventana.</p>
                ) : (
                    <div className="divide-y divide-gray-700/60">
                        <VerMas
                            filas={rutasFiltradas}
                            pintar={(r) => (
                                <div key={`${r.ruta}|${r.rol}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                    <span className="min-w-0">
                                        <span className="font-semibold text-white">{r.nombre}</span>
                                        <span className="ml-2 text-xs text-gray-400">{r.rol === '-' ? 'sin sesión' : r.rol}</span>
                                        <span className="block truncate text-xs text-gray-500">{r.ruta}</span>
                                        {r.codigos.length > 0 && <span className="block text-xs text-gray-400">{r.codigos.map((c) => `${c.codigo} ×${c.veces}`).join(' · ')}</span>}
                                    </span>
                                    <span className="text-right text-xs text-gray-300 tabular-nums">
                                        {miles(r.total)} veces · p50 {ms(r.p50)} · p95 <span className={`font-semibold ${colorDeMs(r.p95)}`}>{ms(r.p95)}</span> · p99 {ms(r.p99)}
                                        {(r.errores5xx > 0 || r.rechazos > 0) && (
                                            <span className="block text-red-300">
                                                {miles(r.errores5xx)} errores ({r.tasaDeError} %) · {miles(r.rechazos)} rechazos
                                            </span>
                                        )}
                                    </span>
                                </div>
                            )}
                        />
                    </div>
                )}
            </Caja>
        </div>
    );
}
