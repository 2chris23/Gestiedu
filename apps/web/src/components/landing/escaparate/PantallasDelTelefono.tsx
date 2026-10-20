import { suave, Avatar, Barra, Cifra, CodigoDeMentira } from './Pantallas';
import * as React from 'react';
import { AnimatePresence, m } from 'framer-motion';
import {
    AlertTriangle,
    BookOpen,
    Calendar,
    Check,
    CheckCircle2,
    ChevronDown,
    Clock,
    CloudUpload,
    GraduationCap,
    Home,
    Library,
    QrCode,
    Sun,
    Users,
    X,
    type LucideIcon,
    UserCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    ALUMNOS,
    HORAS,
    MATERIA,
    PRESENTES_AL_EMPEZAR,
    SECCION,
    TOTAL_ALUMNOS,
} from './guion';

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
                <BotonDeLaBarra id="calendario" nombre="Mi cuenta" Icono={UserCircle} activo={activo} />
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
