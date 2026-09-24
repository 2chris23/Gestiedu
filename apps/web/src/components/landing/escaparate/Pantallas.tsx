'use client';

import * as React from 'react';
import { AnimatePresence, m } from 'framer-motion';
import {
    AlertTriangle,
    Bell,
    BookOpen,
    Calendar,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronDown,
    Clock,
    CloudUpload,
    GraduationCap,
    Home,
    Library,
    MapPin,
    QrCode,
    ScanLine,
    ShieldCheck,
    Sun,
    User,
    Users,
    X,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    ALUMNOS,
    ASISTENCIA_MINIMA,
    CIFRAS_POR_LAPSO,
    ENTRAN_POR_QR,
    ESCALA_MAX,
    EVALUACIONES,
    HORAS,
    MATERIA,
    NOTA_QUE_APRUEBA,
    NOTAS_AL_EMPEZAR,
    NOTAS_QUE_SE_PONEN,
    PRESENTES_AL_EMPEZAR,
    SECCION,
    TOTAL_ALUMNOS,
    conComa,
    iniciales,
    notaDeLaFila,
    promedioDeLaSeccion,
} from './guion';

/**
 * LAS PANTALLAS, COPIADAS DE LA APP
 *
 * Mismas clases que las pantallas de verdad (capturas del sembrado, 24-09):
 * lienzo gris claro, tarjetas blancas con borde gris y esquinas grandes, el
 * índigo para lo que se pulsa, el verde menta de «Presente», la barra lateral
 * blanca del ordenador y la barra de abajo del teléfono con la casita en el
 * centro. No llaman a ningún servidor: son funciones del paso del guion.
 *
 * Todo lo que el dedo toca lleva `data-blanco`.
 */

const suave = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };

// ─── Piezas comunes ────────────────────────────────────────────────────────

function Avatar({ nombre, color, className }: { nombre: string; color: string; className?: string }) {
    return (
        <span
            className={cn(
                'flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
                color,
                className ?? 'h-9 w-9'
            )}
        >
            {iniciales(nombre)}
        </span>
    );
}

/**
 * Una barra que crece con `scaleX`, nunca con `width`, y en CSS: el borde de
 * fuera se estira hasta el valor (y lo sigue si cambia) y el de dentro nace
 * de cero con `barra-crece` (globals.css). Con cincuenta barras y cifras en
 * pantalla, un componente animado por cada una costaba tareas largas al
 * montar en un teléfono lento; así no cuestan nada.
 */
function Barra({
    lleno,
    color,
    marca,
    alto = 'h-1.5',
    retraso = 0,
}: {
    lleno: number;
    color: string;
    marca?: number;
    alto?: string;
    retraso?: number;
}) {
    return (
        <div className={cn('relative w-full rounded-full bg-gray-100', alto)}>
            <div className="h-full overflow-hidden rounded-full">
                <div
                    className="h-full w-full origin-left transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={{ transform: `scaleX(${Math.max(0, Math.min(1, lleno / 100))})` }}
                >
                    <div className={cn('barra-crece h-full w-full rounded-full', color)} style={{ animationDelay: `${retraso}s` }} />
                </div>
            </div>
            {marca !== undefined && (
                <span className="absolute -top-0.5 h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-gray-500" style={{ left: `${marca}%` }} />
            )}
        </div>
    );
}

/** Un número que cambia: el nuevo entra desde abajo (`cifra-entra`, en `Escaparate`). */
function Cifra({ valor, className }: { valor: string | number; className?: string }) {
    return (
        <span className={cn('relative inline-flex overflow-hidden tabular-nums', className)}>
            <span key={String(valor)} className="cifra-entra">
                {valor}
            </span>
        </span>
    );
}

/** La franja del reloj del teléfono: hora, cobertura y batería. */
function BarraDeEstado({ oscura = false }: { oscura?: boolean }) {
    const tinta = oscura ? 'text-white' : 'text-gray-900';
    return (
        <div className={cn('flex h-9 items-end justify-between px-7 pb-1 text-xs font-semibold', tinta)}>
            <span className="tabular-nums">7:03</span>
            <span className="flex items-center gap-1">
                <span className="flex items-end gap-[2px]">
                    {[4, 6, 8, 10].map((h) => (
                        <span key={h} className={cn('w-[3px] rounded-sm', oscura ? 'bg-white' : 'bg-gray-900')} style={{ height: h }} />
                    ))}
                </span>
                <span className={cn('ml-1 h-[11px] w-[22px] rounded-[3px] border p-[1.5px]', oscura ? 'border-white/80' : 'border-gray-900/80')}>
                    <span className={cn('block h-full w-[70%] rounded-[1px]', oscura ? 'bg-white' : 'bg-gray-900')} />
                </span>
            </span>
        </div>
    );
}

/** La cabecera del teléfono, como `CabeceraMovil`. */
function CabeceraDelTelefono() {
    return (
        <div className="border-b border-gray-200 bg-white">
            <BarraDeEstado />
            <div className="flex h-12 items-center gap-2 px-4">
                <Avatar nombre="Andrés Salazar" color="bg-orange-700" className="h-8 w-8" />
                <span className="text-sm font-bold text-gray-900">Andrés Salazar</span>
                <ChevronDown className="h-4 w-4 text-gray-400" />
            </div>
        </div>
    );
}

type Destino = 'academico' | 'materias' | 'inicio' | 'horarios' | 'calendario';

function BotonDeLaBarra({ id, nombre, Icono, activo }: { id: Destino; nombre: string; Icono: LucideIcon; activo: Destino }) {
    return (
        <span
            data-blanco={`tel-barra-${id}`}
            className={cn(
                'flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold',
                activo === id ? 'text-indigo-700' : 'text-gray-600'
            )}
        >
            <Icono className="h-5 w-5" />
            <span>{nombre}</span>
        </span>
    );
}

/** La barra de abajo del teléfono, como `BarraInferiorMovil` del profesor. */
function BarraDeAbajo({ activo }: { activo: Destino }) {
    return (
        <div className="absolute inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white pb-3 shadow-[0_-1px_8px_rgba(15,23,42,0.06)]">
            <div className="flex items-end justify-between px-1">
                <BotonDeLaBarra id="academico" nombre="Académico" Icono={BookOpen} activo={activo} />
                <BotonDeLaBarra id="materias" nombre="Materias" Icono={Library} activo={activo} />
                <span data-blanco="tel-barra-inicio" className="flex w-[64px] shrink-0 flex-col items-center justify-end pb-1.5">
                    <span
                        className={cn(
                            'flex h-12 w-12 -translate-y-3 items-center justify-center rounded-full shadow-lg ring-4 ring-white',
                            activo === 'inicio' ? 'bg-indigo-700' : 'bg-indigo-600'
                        )}
                    >
                        <Home className="h-5 w-5 text-white" />
                    </span>
                    <span className="-mt-2.5 text-xs font-semibold text-gray-800">Inicio</span>
                </span>
                <BotonDeLaBarra id="horarios" nombre="Horarios" Icono={Calendar} activo={activo} />
                <BotonDeLaBarra id="calendario" nombre="Calendario" Icono={CalendarDays} activo={activo} />
            </div>
            <div className="mx-auto mt-1 h-1 w-28 rounded-full bg-gray-900/80" />
        </div>
    );
}

// ─── TELÉFONO ──────────────────────────────────────────────────────────────

/** La clase en vivo en modo «Pasar asistencia», como en el teléfono. */
export function TelAsistencia({ marcados, guardado }: { marcados: number; guardado: boolean }) {
    const presentes = PRESENTES_AL_EMPEZAR + marcados;
    return (
        <div className="relative h-full bg-gray-50">
            <CabeceraDelTelefono />
            <div className="px-3 pt-3">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-medium text-gray-500">Clase en vivo</p>
                        <p className="text-lg font-bold leading-6 text-gray-900">{MATERIA}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                            {SECCION}
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
                                <Sun className="h-3 w-3" /> Mañana
                            </span>
                        </p>
                    </div>
                    <span
                        className={cn(
                            'mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition-colors duration-300',
                            guardado ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        )}
                    >
                        {guardado ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CloudUpload className="h-3.5 w-3.5" />}
                        {guardado ? 'Guardado 07:03' : 'Se guarda solo'}
                    </span>
                </div>

                {/* La cuenta: lo que se viene a ver. */}
                <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-3">
                    <div className="flex items-baseline justify-between">
                        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Presentes</span>
                        <span className="text-sm font-bold text-gray-900">
                            <Cifra valor={presentes} className="text-2xl" /> <span className="text-gray-500">de {TOTAL_ALUMNOS}</span>
                        </span>
                    </div>
                    <div className="mt-2">
                        <Barra lleno={(presentes / TOTAL_ALUMNOS) * 100} color="bg-emerald-500" alto="h-2" />
                    </div>
                </div>

                <div className="mt-3 flex gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-2 text-xs font-bold text-white">
                        <Check className="h-3.5 w-3.5" /> Terminar asistencia
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800">
                        <QrCode className="h-3.5 w-3.5" /> Por QR
                    </span>
                </div>

                <ul className="mt-3 space-y-2">
                    {ALUMNOS.map((a, i) => {
                        const presente = i < marcados;
                        return (
                            <li key={a.cedula} className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-2.5 py-2">
                                <Avatar nombre={a.nombre} color={a.color} className="h-8 w-8" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-bold text-gray-900">{a.nombre}</p>
                                    <p className="font-mono text-xs text-gray-500">{a.cedula}</p>
                                </div>
                                <span
                                    data-blanco={`tel-presente-${i}`}
                                    className={cn(
                                        'flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-200',
                                        presente ? 'border-emerald-600 bg-emerald-500 text-white' : 'border-gray-200 bg-white text-gray-500'
                                    )}
                                >
                                    <Check className="h-4 w-4" />
                                </span>
                                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500">
                                    <X className="h-4 w-4" />
                                </span>
                                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500">
                                    <Clock className="h-4 w-4" />
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </div>
            <BarraDeAbajo activo="academico" />
        </div>
    );
}

/** El horario de hoy, un día en vertical (`HorarioPorDias`). */
export function TelHorario({ ahora }: { ahora: number }) {
    return (
        <div className="relative h-full bg-gray-50">
            <CabeceraDelTelefono />
            <div className="px-3 pt-3">
                <p className="text-lg font-bold text-gray-900">Mi horario</p>
                <div className="mt-2 flex gap-1.5">
                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map((d) => (
                        <span
                            key={d}
                            className={cn(
                                'flex h-9 flex-1 items-center justify-center rounded-full text-xs font-bold',
                                d === 'Jue' ? 'bg-indigo-600 text-white' : 'border border-gray-200 bg-white text-gray-700'
                            )}
                        >
                            {d}
                        </span>
                    ))}
                </div>
                <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    {HORAS.map((h, i) => (
                        <React.Fragment key={h.desde}>
                            {i === 3 && (
                                <div className="flex items-center justify-center gap-1.5 border-b border-gray-100 bg-gray-50 py-1.5 text-xs font-bold text-gray-500">
                                    RECREO <span className="font-normal">(09:15 – 09:30)</span>
                                </div>
                            )}
                            <div className="flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-b-0">
                                <div className="w-11 text-right">
                                    <p className="text-sm font-bold tabular-nums text-gray-900">{h.desde}</p>
                                    <p className="text-xs tabular-nums text-gray-500">{h.hasta}</p>
                                </div>
                                <div
                                    className={cn(
                                        'flex-1 rounded-xl border px-2.5 py-1.5 transition-colors duration-500',
                                        !h.aula
                                            ? 'border-dashed border-gray-200 text-gray-400'
                                            : i === ahora
                                              ? 'border-indigo-300 bg-indigo-50'
                                              : 'border-blue-200 bg-blue-50/60'
                                    )}
                                >
                                    <p className={cn('text-xs font-bold', h.aula ? 'text-gray-900' : 'italic')}>{h.materia}</p>
                                    {h.aula && <p className="text-xs text-gray-600">{h.aula}</p>}
                                </div>
                                <span className="w-12">
                                    {i === ahora && (
                                        <m.span
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={suave}
                                            className="inline-flex rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white"
                                        >
                                            Ahora
                                        </m.span>
                                    )}
                                </span>
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </div>
            <BarraDeAbajo activo="horarios" />
        </div>
    );
}

/** El teléfono de un alumno escaneando el QR del pase de lista. */
export function TelEscaner({ barrido, leido }: { barrido: number; leido: boolean }) {
    return (
        <div className="relative h-full bg-slate-900">
            <BarraDeEstado oscura />
            <div className="px-5 pt-3 text-center">
                <p className="text-base font-bold text-white">Escanea el QR de la clase</p>
                <p className="mt-1 text-xs text-slate-300">Apunta al código que tiene tu profesor.</p>
            </div>
            {/* El visor de la cámara: cuatro esquinas y la línea que barre. */}
            <div className="relative mx-auto mt-8 h-[250px] w-[250px]">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-slate-700/60 to-slate-800/60" />
                <div className="absolute inset-8 opacity-60">
                    <CodigoDeMentira version={1} />
                </div>
                {['left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl'].map((c) => (
                    <span key={c} className={cn('absolute h-12 w-12 border-white', c)} />
                ))}
                <m.span
                    className="absolute inset-x-6 top-6 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]"
                    initial={false}
                    animate={{ y: barrido % 2 ? 196 : 0, opacity: leido ? 0 : 1 }}
                    transition={{ duration: 0.9, ease: 'easeInOut' }}
                />
            </div>
            <AnimatePresence>
                {leido && (
                    <m.div
                        className="absolute inset-x-4 bottom-10 rounded-2xl bg-white p-4 shadow-xl"
                        initial={{ y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 40, opacity: 0 }}
                        transition={suave}
                    >
                        <div className="flex items-center gap-3">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                <CheckCircle2 className="h-7 w-7" />
                            </span>
                            <div>
                                <p className="text-base font-bold text-gray-900">¡Listo! Presente</p>
                                <p className="text-sm text-emerald-800">
                                    {MATERIA} · {SECCION} · 07:03
                                </p>
                            </div>
                        </div>
                    </m.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/** El inicio del profesor, como el Panel de verdad. */
export function TelInicio() {
    const tarjetas = [
        { t: 'Mis estudiantes', v: '128', d: 'En mis secciones', borde: 'border-l-indigo-500', Icono: Users, tono: 'text-indigo-600 bg-indigo-50' },
        { t: 'Mis secciones', v: '4', d: 'Donde doy clase', borde: 'border-l-cyan-500', Icono: GraduationCap, tono: 'text-cyan-600 bg-cyan-50' },
        { t: 'Por calificar', v: '3', d: 'Actividades sin notas', borde: 'border-l-amber-500', Icono: AlertTriangle, tono: 'text-amber-600 bg-amber-50' },
        { t: 'Próximas', v: '2', d: 'Actividades por venir', borde: 'border-l-emerald-500', Icono: Calendar, tono: 'text-emerald-600 bg-emerald-50' },
    ];
    return (
        <div className="relative h-full bg-gray-50">
            <CabeceraDelTelefono />
            <div className="px-4 pt-4">
                <div className="flex items-center justify-between">
                    <p className="text-xl font-bold text-gray-900">Panel</p>
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700">Jue, 24 sept.</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                    {tarjetas.map(({ t, v, d, borde, Icono, tono }, i) => (
                        <m.div
                            key={t}
                            className={cn('rounded-2xl border border-l-4 border-gray-200 bg-white p-3', borde)}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...suave, delay: 0.06 * i }}
                        >
                            <div className="flex items-center gap-2">
                                <span className={cn('flex h-7 w-7 items-center justify-center rounded-full', tono)}>
                                    <Icono className="h-3.5 w-3.5" />
                                </span>
                                <span className="text-xs font-semibold text-gray-600">{t}</span>
                            </div>
                            <p className="mt-1 text-2xl font-bold text-gray-900">{v}</p>
                            <p className="text-xs text-gray-500">{d}</p>
                        </m.div>
                    ))}
                </div>
                <p className="mt-5 text-xs font-bold uppercase tracking-wide text-gray-500">Ir a</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                    {[
                        ['Académico', 'Ciclos, secciones y alumnos', BookOpen],
                        ['Horarios', 'Por sección y por profesor', Calendar],
                    ].map(([t, d, Icono]) => {
                        const I = Icono as LucideIcon;
                        return (
                            <div key={t as string} className="rounded-2xl border border-gray-200 bg-white p-3">
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                                    <I className="h-4 w-4" />
                                </span>
                                <p className="mt-2 text-sm font-bold text-gray-900">{t as string}</p>
                                <p className="text-xs text-gray-500">{d as string}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
            <BarraDeAbajo activo="inicio" />
        </div>
    );
}

// ─── TABLETA ───────────────────────────────────────────────────────────────

/** Las notas del examen de 1er Año A, con el promedio de la sección arriba. */
export function TabNotas({ puestas, foco, guardado }: { puestas: number; foco: number | null; guardado: boolean }) {
    const notas = NOTAS_AL_EMPEZAR.map((f) => [...f]);
    NOTAS_QUE_SE_PONEN.slice(0, puestas).forEach(([fila, nota]) => {
        notas[fila][2] = nota;
    });
    const promedio = promedioDeLaSeccion(notas);
    const conNotaFinal = notas.filter((f) => f.every((n) => n !== null)).length;

    return (
        <div className="h-full bg-gray-50 p-5">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-medium text-gray-500">Académico / 2026-2027 / {SECCION}</p>
                    <p className="text-xl font-bold text-gray-900">
                        {MATERIA} · <span className="text-indigo-700">1.er lapso</span>
                    </p>
                </div>
                <span
                    className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors duration-300',
                        guardado ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    )}
                >
                    {guardado ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CloudUpload className="h-3.5 w-3.5" />}
                    {guardado ? 'Guardado' : 'Se guarda solo'}
                </span>
            </div>

            {/* Como AcademicStats: el promedio grande, con su barra y la rayita del 10. */}
            <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200">
                <div className="bg-white px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                        <GraduationCap className="h-3.5 w-3.5 text-blue-600" /> Promedio de la sección
                    </span>
                    <span className="mt-0.5 block text-3xl font-bold leading-9 text-gray-900">
                        <Cifra valor={conComa(promedio)} />
                    </span>
                    <div className="mt-1.5">
                        <Barra
                            lleno={(promedio / ESCALA_MAX) * 100}
                            color="bg-green-500"
                            marca={(NOTA_QUE_APRUEBA / ESCALA_MAX) * 100}
                        />
                    </div>
                </div>
                <div className="bg-white px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Con las tres notas
                    </span>
                    <span className="mt-0.5 block text-lg font-bold text-gray-900">
                        <Cifra valor={`${conNotaFinal} de ${notas.length}`} />
                    </span>
                    <div className="mt-1.5">
                        <Barra lleno={(conNotaFinal / notas.length) * 100} color="bg-indigo-500" />
                    </div>
                </div>
                <div className="bg-white px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> En riesgo
                    </span>
                    <span className="mt-0.5 block text-lg font-bold text-red-600">
                        {notas.map(notaDeLaFila).filter((n) => n !== null && n < NOTA_QUE_APRUEBA).length}
                    </span>
                    <p className="text-xs text-gray-500">Por debajo de {NOTA_QUE_APRUEBA}</p>
                </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="grid grid-cols-[1.7fr_repeat(3,1fr)_0.9fr] border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                    <span>Alumno</span>
                    {EVALUACIONES.map((e) => (
                        <span key={e.nombre} className="text-center">
                            {e.nombre}
                            <span className="block font-semibold normal-case text-gray-400">{e.peso} %</span>
                        </span>
                    ))}
                    <span className="text-center">Nota</span>
                </div>
                {notas.map((fila, i) => {
                    const final = notaDeLaFila(fila);
                    return (
                        <div
                            key={ALUMNOS[i].cedula}
                            className="grid grid-cols-[1.7fr_repeat(3,1fr)_0.9fr] items-center border-b border-gray-100 px-3 py-2 last:border-b-0"
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                <Avatar nombre={ALUMNOS[i].nombre} color={ALUMNOS[i].color} className="h-8 w-8" />
                                <span className="truncate text-sm font-semibold text-gray-900">{ALUMNOS[i].nombre}</span>
                            </span>
                            {fila.map((n, j) => (
                                <span key={j} className="flex justify-center">
                                    <span
                                        data-blanco={j === 2 ? `tab-nota-${i}` : undefined}
                                        className={cn(
                                            'flex h-9 w-14 items-center justify-center rounded-lg border text-sm font-bold tabular-nums transition-[border-color,background-color,box-shadow] duration-200',
                                            j === 2 && foco === i
                                                ? 'border-indigo-500 bg-white ring-4 ring-indigo-100'
                                                : n === null
                                                  ? 'border-dashed border-gray-300 bg-gray-50 text-gray-400'
                                                  : 'border-gray-200 bg-white',
                                            n !== null && (n < NOTA_QUE_APRUEBA ? 'text-red-600' : 'text-gray-900')
                                        )}
                                    >
                                        {n === null ? (
                                            j === 2 && foco === i ? <span className="h-4 w-0.5 bg-indigo-600" /> : '–'
                                        ) : j === 2 ? (
                                            <Cifra valor={n} />
                                        ) : (
                                            n
                                        )}
                                    </span>
                                </span>
                            ))}
                            <span
                                className={cn(
                                    'text-center text-base font-bold tabular-nums',
                                    final !== null && final < NOTA_QUE_APRUEBA ? 'text-red-600' : 'text-gray-900'
                                )}
                            >
                                {final === null ? '–' : <Cifra valor={conComa(final)} />}
                            </span>
                        </div>
                    );
                })}
            </div>
            <p className="mt-3 text-center text-xs text-gray-500">
                Escala del 1 al 20 · se aprueba con {NOTA_QUE_APRUEBA} · los pesos los pone el plan de evaluación
            </p>
        </div>
    );
}

/**
 * Un QR que parece un QR y no dice nada: módulos al azar (con semilla) y los
 * tres cuadros de las esquinas. Es decoración: no se puede escanear.
 */
function hacerCodigo(semilla: number, n = 25) {
    let s = semilla;
    const azar = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    };
    const esEsquina = (x: number, y: number) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
    let d = '';
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (esEsquina(x, y)) continue;
            if (azar() > 0.52) d += `M${x} ${y}h1v1h-1z`;
        }
    }
    for (const [cx, cy] of [
        [0, 0],
        [n - 7, 0],
        [0, n - 7],
    ]) {
        d += `M${cx} ${cy}h7v7h-7zM${cx + 1} ${cy + 1}v5h5v-5zM${cx + 2} ${cy + 2}h3v3h-3z`;
    }
    return d;
}
const CODIGOS = [hacerCodigo(7), hacerCodigo(19), hacerCodigo(42)];

function CodigoDeMentira({ version, blanco = false }: { version: number; blanco?: boolean }) {
    return (
        <svg viewBox="-1 -1 27 27" className="h-full w-full" shapeRendering="crispEdges">
            {blanco && <rect x="-1" y="-1" width="27" height="27" fill="#fff" />}
            <AnimatePresence initial={false}>
                <m.path
                    key={version}
                    d={CODIGOS[version % CODIGOS.length]}
                    fill={blanco ? '#0f172a' : '#e2e8f0'}
                    fillRule="evenodd"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                />
            </AnimatePresence>
        </svg>
    );
}

/** El pase de lista por QR en la tableta del profesor (`PaseDeListaQr`). */
export function TabQr({ entrados, version }: { entrados: number; version: number }) {
    const lista = ENTRAN_POR_QR.slice(0, entrados).reverse();
    return (
        <div className="flex h-full flex-col bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                <div>
                    <p className="text-xs font-medium text-gray-500">Pase de lista · {SECCION}</p>
                    <p className="text-lg font-bold text-gray-900">{MATERIA}</p>
                </div>
                <span className="text-sm font-bold text-gray-900">
                    <Cifra valor={entrados} className="text-2xl text-emerald-700" /> <span className="text-gray-500">de {TOTAL_ALUMNOS}</span>
                </span>
            </div>
            <div className="flex flex-col items-center px-5 pt-5">
                <div className="h-[250px] w-[250px] rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                    <CodigoDeMentira version={version} blanco />
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-600">
                    <QrCode className="h-3.5 w-3.5" /> Cambia cada 10 segundos: una foto no sirve.
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
                    <MapPin className="h-3.5 w-3.5 text-emerald-600" /> Solo cuenta quien esté cerca de este teléfono.
                </p>
            </div>
            <p className="px-5 pb-1 pt-5 text-xs font-bold uppercase tracking-wide text-gray-500">
                {entrados ? 'Van entrando' : 'Aún no ha escaneado nadie'}
            </p>
            <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-hidden px-3">
                <AnimatePresence initial={false}>
                    {lista.map((r) => (
                        <m.li
                            key={r.nombre}
                            initial={{ opacity: 0, y: -12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={suave}
                            className="flex items-center gap-3 px-2 py-2"
                        >
                            <Avatar nombre={r.nombre} color="bg-indigo-600" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-gray-900">{r.nombre}</p>
                                <p className="flex items-center gap-2 text-xs text-gray-600">
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">Presente</span>
                                    <span className="tabular-nums">{r.hora}</span>
                                </p>
                            </div>
                            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-600">
                                <X className="h-4 w-4" />
                            </span>
                        </m.li>
                    ))}
                </AnimatePresence>
            </ul>
            <div className="flex gap-2 border-t border-gray-200 p-3">
                <span className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-800">
                    <ScanLine className="h-4 w-4" /> Escanear alumnos
                </span>
                <span className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white">
                    <Check className="h-4 w-4" /> Terminar
                </span>
            </div>
        </div>
    );
}

// ─── PORTÁTIL ──────────────────────────────────────────────────────────────

type Seccion = 'inicio' | 'academico' | 'materias' | 'horarios' | 'calendario';

/** La barra lateral blanca del ordenador, la del profesor. */
function Lateral({ activo }: { activo: Seccion }) {
    const items: [Seccion, string, LucideIcon][] = [
        ['inicio', 'Inicio', Home],
        ['academico', 'Académico', BookOpen],
        ['materias', 'Materias', Library],
        ['horarios', 'Horarios', Calendar],
        ['calendario', 'Calendario', CalendarDays],
    ];
    return (
        <div className="flex h-full w-[196px] shrink-0 flex-col border-r border-gray-200 bg-white">
            <div className="flex flex-col items-center pb-4 pt-5">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                    <GraduationCap className="h-8 w-8" />
                </span>
                <div className="mt-3 flex items-center gap-2 self-start px-4">
                    <Avatar nombre="Andrés Salazar" color="bg-orange-700" className="h-9 w-9" />
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Andrés Salazar</p>
                        <p className="text-xs text-gray-500">Profesor</p>
                    </div>
                </div>
            </div>
            <div className="border-t border-gray-200 px-3 pt-3">
                {items.map(([id, nombre, Icono]) => (
                    <span
                        key={id}
                        data-blanco={`port-lateral-${id}`}
                        className={cn(
                            'mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm',
                            activo === id ? 'bg-indigo-600 font-semibold text-white' : 'text-gray-700'
                        )}
                    >
                        <Icono className="h-4 w-4" />
                        {nombre}
                    </span>
                ))}
            </div>
        </div>
    );
}

const FILA_DEL_HORARIO = 58;

/** El horario de hoy, con la hora en curso que avanza sola. */
export function PortHorario({
    ahora,
    progreso,
    reloj,
    abierta,
}: {
    ahora: number;
    progreso: number;
    reloj: string;
    abierta: boolean;
}) {
    // La franja del recreo empuja hacia abajo lo que va después.
    const yDe = (i: number) => i * FILA_DEL_HORARIO + (i >= 3 ? 34 : 0);
    return (
        <div className="flex h-full bg-gray-50">
            <Lateral activo="horarios" />
            <div className="min-w-0 flex-1 p-6">
                <div className="rounded-3xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 px-6 py-5 text-white shadow-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-2xl font-bold">Mi horario de hoy</p>
                            <p className="mt-0.5 text-sm text-white/85">Jueves · Turno de la mañana · 4 clases</p>
                        </div>
                        <div className="rounded-2xl bg-white/15 px-4 py-2 text-right">
                            <p className="text-xs text-white/80">Hora del liceo</p>
                            <p className="text-2xl font-bold tabular-nums">
                                <Cifra valor={reloj} />
                            </p>
                        </div>
                    </div>
                </div>

                <div className="relative mt-5 overflow-hidden rounded-3xl border border-gray-200 bg-white">
                    {/* El recuadro de «ahora»: baja de hora con transform. */}
                    <m.div
                        className="pointer-events-none absolute inset-x-3 top-0 z-0 rounded-2xl border-2 border-indigo-400 bg-indigo-50/70"
                        style={{ height: FILA_DEL_HORARIO - 8 }}
                        initial={false}
                        animate={{ y: yDe(ahora) + 4 }}
                        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    />
                    {HORAS.map((h, i) => (
                        <React.Fragment key={h.desde}>
                            {i === 3 && (
                                <div className="relative z-10 flex h-[34px] items-center justify-center gap-2 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500">
                                    RECREO <span className="font-normal">(09:15 – 09:30)</span>
                                </div>
                            )}
                            <div className="relative z-10 flex items-center gap-4 border-b border-gray-100 px-6 last:border-b-0" style={{ height: FILA_DEL_HORARIO }}>
                                <div className="w-14 text-right">
                                    <p className="text-sm font-bold tabular-nums text-gray-900">{h.desde}</p>
                                    <p className="text-xs tabular-nums text-gray-500">{h.hasta}</p>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className={cn('text-sm font-bold', h.aula ? 'text-gray-900' : 'italic text-gray-400')}>
                                        {h.materia}
                                        {h.aula && <span className="font-medium text-gray-500"> · {h.aula}</span>}
                                    </p>
                                    {i === ahora && (
                                        <div className="mt-1.5 w-56">
                                            <Barra key={i} lleno={progreso * 100} color="bg-indigo-500" />
                                        </div>
                                    )}
                                </div>
                                {i === ahora && h.aula ? (
                                    <span
                                        data-blanco="port-entrar"
                                        className={cn(
                                            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors duration-200',
                                            abierta ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
                                        )}
                                    >
                                        {abierta ? <CheckCircle2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                        {abierta ? 'Clase abierta' : 'Entrar a la clase'}
                                    </span>
                                ) : i < ahora ? (
                                    <span className="text-xs font-semibold text-gray-400">Terminada</span>
                                ) : null}
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Las cifras del ciclo, como `AcademicStats`, con el cambio de lapso. */
export function PortCifras({ lapso, vuelta }: { lapso: number; vuelta: number }) {
    const c = CIFRAS_POR_LAPSO[lapso];
    const celdas = [
        {
            t: 'En riesgo',
            v: String(c.riesgo),
            Icono: AlertTriangle,
            tono: 'text-red-600',
            rojo: true,
            barra: { lleno: (c.riesgo / c.ocupados) * 100, color: 'bg-red-500' },
            pie: `${Math.round((c.riesgo / c.ocupados) * 100)} % de los alumnos`,
        },
        {
            t: 'Asistencia',
            v: `${c.asistencia} %`,
            Icono: Calendar,
            tono: 'text-indigo-600',
            barra: { lleno: c.asistencia, color: 'bg-green-500', marca: ASISTENCIA_MINIMA },
            pie: `Mínimo del liceo: ${ASISTENCIA_MINIMA} %`,
        },
        {
            t: 'Ocupación',
            v: `${c.ocupados}/${c.puestos}`,
            Icono: Users,
            tono: 'text-emerald-600',
            barra: { lleno: (c.ocupados / c.puestos) * 100, color: 'bg-amber-400' },
            pie: `${Math.round((c.ocupados / c.puestos) * 100)} % de los puestos`,
        },
        {
            t: 'Observaciones',
            v: String(c.observaciones),
            Icono: Bell,
            tono: 'text-amber-600',
            pie: `${conComa(c.observaciones / c.ocupados)} por alumno`,
        },
    ];
    const secciones = [
        ['1er Año A', 14.9, 15.4],
        ['1er Año B', 13.8, 14.3],
        ['2do Año A', 14.4, 15.0],
        ['5to Año A', 15.7, 16.0],
    ] as const;
    return (
        <div className="flex h-full bg-gray-50">
            <Lateral activo="academico" />
            <div className="min-w-0 flex-1 p-6">
                <div className="flex items-end justify-between">
                    <div>
                        <p className="text-xs font-medium text-gray-500">Académico</p>
                        <p className="text-2xl font-bold text-gray-900">Ciclo Escolar 2026-2027</p>
                    </div>
                    <div className="flex rounded-full border border-gray-200 bg-white p-1">
                        {CIFRAS_POR_LAPSO.map((l, i) => (
                            <span
                                key={l.lapso}
                                data-blanco={`port-lapso-${i}`}
                                className={cn(
                                    'rounded-full px-4 py-1.5 text-xs font-bold transition-colors duration-200',
                                    i === lapso ? 'bg-indigo-600 text-white' : 'text-gray-600'
                                )}
                            >
                                {l.lapso}
                            </span>
                        ))}
                        <span className="rounded-full px-4 py-1.5 text-xs font-bold text-gray-400">3.er lapso</span>
                    </div>
                </div>

                <div key={vuelta} className="mt-5 grid grid-cols-5 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200">
                    <div className="bg-white px-3 py-3">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                            <GraduationCap className="h-3.5 w-3.5 text-blue-600" /> Promedio
                        </span>
                        <span className="mt-0.5 block text-2xl font-bold text-gray-900">
                            <Cifra valor={conComa(c.promedio)} />
                        </span>
                        <div className="mt-1.5">
                            <Barra lleno={(c.promedio / ESCALA_MAX) * 100} color="bg-green-500" marca={(NOTA_QUE_APRUEBA / ESCALA_MAX) * 100} />
                        </div>
                        <span className="mt-1 block text-xs tabular-nums text-gray-500">9,8 – 19,2</span>
                    </div>
                    {celdas.map((x, i) => (
                        <div key={x.t} className="bg-white px-3 py-3">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                <x.Icono className={cn('h-3.5 w-3.5', x.tono)} /> {x.t}
                            </span>
                            <span className={cn('mt-0.5 block text-2xl font-bold', x.rojo ? 'text-red-600' : 'text-gray-900')}>
                                <Cifra valor={x.v} />
                            </span>
                            {x.barra && (
                                <div className="mt-1.5">
                                    <Barra {...x.barra} retraso={0.08 * (i + 1)} />
                                </div>
                            )}
                            <span className="mt-1 block truncate text-xs tabular-nums text-gray-500">{x.pie}</span>
                        </div>
                    ))}
                </div>

                <div className="mt-5 rounded-3xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-900">Promedio por sección</p>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Escala 1–20 · aprueba con 10
                        </span>
                    </div>
                    <div className="mt-3 space-y-3" key={`s${vuelta}`}>
                        {secciones.map(([nombre, l1, l2], i) => {
                            const v = lapso ? l2 : l1;
                            return (
                                <div key={nombre} className="flex items-center gap-4">
                                    <span className="w-24 text-sm font-semibold text-gray-700">{nombre}</span>
                                    <div className="flex-1">
                                        <Barra lleno={(v / ESCALA_MAX) * 100} color="bg-indigo-500" alto="h-2.5" marca={50} retraso={0.1 + 0.07 * i} />
                                    </div>
                                    <span className="w-12 text-right text-sm font-bold tabular-nums text-gray-900">
                                        <Cifra valor={conComa(v)} />
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
