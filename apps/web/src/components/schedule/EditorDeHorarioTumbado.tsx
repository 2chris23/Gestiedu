'use client';

import * as React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowLeft, Coffee, Loader2, RotateCw, Save, Shuffle, Smartphone, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { aHorizontal, sePuedeGirar, soltarLaPantalla } from '@/lib/girar-la-pantalla';

/**
 * EDITAR EL HORARIO EN EL TELÉFONO: TUMBADO Y A PANTALLA COMPLETA
 *
 * En el teléfono el editor era la página del ordenador apilada: primero la
 * lista de materias con sus «Restantes» —media pantalla—, debajo los botones,
 * y el horario un día cada vez. Y arrastrar no funcionaba: el dedo movía la
 * página en vez de la materia.
 *
 * Ahora, al entrar desde un teléfono, la pantalla se pone de lado (lo hace la
 * app; en un navegador se pide girarlo) y el editor ocupa todo:
 *
 *   · a la izquierda, una columna estrecha con lo que falta por colocar, que
 *     se desplaza con el dedo si son muchas;
 *   · a la derecha, la semana entera, que cabe de ancho —los cinco días— y
 *     solo se desplaza hacia abajo.
 *
 * Y dos formas de poner una materia, porque arrastrar en una pantalla pequeña
 * cuesta:
 *
 *   1. **Mantener pulsada** la materia y arrastrarla al hueco (en el teléfono
 *      el arrastre empieza tras un momento pulsando: así deslizar la lista no
 *      se confunde con coger una materia).
 *   2. **Tocar** la materia (queda marcada) y **tocar** el hueco.
 *
 * Para quitar una clase del horario: tocarla y pulsar la ✕, o arrastrarla de
 * vuelta a la columna de la izquierda.
 */

export interface MateriaPorColocar {
    id: string;
    nombre: string;
    color?: string;
    profesor?: string;
    quedan: number;
    total: number;
    /** Lo que se le pasa al editor para colocarla. */
    datos: any;
}

export interface BloqueDelHorario {
    cellId: string;
    subjectName: string;
    teacherName?: string;
    color?: string;
}

interface Props {
    titulo: string;
    dias: Array<{ id: number; label: string }>;
    periodos: Array<{ id: string | number; label: string; startTime: string; endTime: string; type?: string }>;
    cargando: boolean;
    materias: MateriaPorColocar[];
    bloques: BloqueDelHorario[];
    turno: 'MANANA' | 'TARDE';
    alCambiarTurno: (t: 'MANANA' | 'TARDE') => void;
    alColocar: (materia: any, cellId: string) => void;
    alQuitar: (cellId: string) => void;
    alGuardar: () => void;
    alAzar: () => void;
    guardando: boolean;
    hayCambios: boolean;
    alSalir: () => void;
}

/** ¿Está tumbado? Se escucha: al girarlo a mano, cambia solo. */
function useTumbado(): boolean {
    const [tumbado, setTumbado] = React.useState(false);
    React.useEffect(() => {
        const consulta = window.matchMedia('(orientation: landscape)');
        const mirar = () => setTumbado(consulta.matches);
        mirar();
        consulta.addEventListener('change', mirar);
        return () => consulta.removeEventListener('change', mirar);
    }, []);
    return tumbado;
}

function MateriaArrastrable({
    materia,
    marcada,
    alTocar,
}: {
    materia: MateriaPorColocar;
    marcada: boolean;
    alTocar: () => void;
}) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `subject-${materia.id}`,
        data: { type: 'sidebar-subject', subject: materia.datos },
    });

    return (
        <button
            ref={setNodeRef}
            type="button"
            {...listeners}
            {...attributes}
            onClick={alTocar}
            aria-pressed={marcada}
            className={cn(
                'flex min-h-[44px] w-full select-none items-center gap-2 rounded-lg border bg-white px-2 py-1.5 text-left transition-shadow',
                marcada ? 'border-indigo-500 ring-2 ring-indigo-300' : 'border-gray-200',
                isDragging && 'opacity-40'
            )}
            style={{ touchAction: 'manipulation' }}
        >
            <span className="h-7 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: materia.color || '#6366f1' }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-800">{materia.nombre}</span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-amber-700">
                {materia.quedan}/{materia.total}
            </span>
        </button>
    );
}

function BloqueArrastrable({
    bloque,
    tocado,
    alTocar,
    alQuitar,
}: {
    bloque: BloqueDelHorario;
    tocado: boolean;
    alTocar: () => void;
    alQuitar: () => void;
}) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `grid-${bloque.cellId}`,
        data: { type: 'grid-block', block: bloque },
    });

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            onClick={(e) => {
                e.stopPropagation();
                alTocar();
            }}
            className={cn(
                'relative flex h-full min-h-[40px] w-full select-none flex-col justify-center overflow-hidden rounded-md px-1.5 py-1 text-left',
                isDragging && 'opacity-40',
                tocado && 'ring-2 ring-indigo-400'
            )}
            style={{
                backgroundColor: bloque.color ? `${bloque.color}22` : '#f3f4f6',
                borderLeft: `3px solid ${bloque.color || '#6366f1'}`,
                touchAction: 'manipulation',
            }}
        >
            <span className="truncate text-xs font-bold leading-4 text-gray-800">{bloque.subjectName}</span>
            {bloque.teacherName && <span className="truncate text-xs leading-4 text-gray-500">{bloque.teacherName}</span>}
            {tocado && (
                <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        alQuitar();
                    }}
                    aria-label={`Quitar ${bloque.subjectName} de esta hora`}
                    className="absolute right-0 top-0 flex h-full w-11 items-center justify-center bg-white/70 text-red-600"
                >
                    <X className="h-5 w-5" />
                </button>
            )}
        </div>
    );
}

function Hueco({
    id,
    children,
    alTocar,
    esperando,
}: {
    id: string;
    children?: React.ReactNode;
    alTocar: () => void;
    esperando: boolean;
}) {
    const { isOver, setNodeRef } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            onClick={alTocar}
            className={cn(
                'min-h-[44px] border-l border-gray-100 p-0.5 transition-colors',
                isOver ? 'bg-indigo-100' : esperando && !children ? 'bg-indigo-50/60' : 'bg-white'
            )}
        >
            {children}
        </div>
    );
}

/** La columna de la izquierda también recibe: soltar ahí una clase la quita. */
function ColumnaDeMaterias({ children }: { children: React.ReactNode }) {
    const { isOver, setNodeRef } = useDroppable({ id: 'restantes' });
    return (
        <div ref={setNodeRef} className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2', isOver && 'bg-red-50')}>
            {children}
        </div>
    );
}

export default function EditorDeHorarioTumbado({
    titulo,
    dias,
    periodos,
    cargando,
    materias,
    bloques,
    turno,
    alCambiarTurno,
    alColocar,
    alQuitar,
    alGuardar,
    alAzar,
    guardando,
    hayCambios,
    alSalir,
}: Props) {
    const tumbado = useTumbado();
    const [marcadaElegida, setMarcada] = React.useState<MateriaPorColocar | null>(null);
    const [tocado, setTocado] = React.useState<string | null>(null);
    const [noGira, setNoGira] = React.useState(false);

    // Al entrar se pide ponerla de lado, y al salir se suelta.
    React.useEffect(() => {
        let vivo = true;
        aHorizontal().then((pudo) => {
            if (vivo && !pudo) setNoGira(true);
        });
        return () => {
            vivo = false;
            void soltarLaPantalla();
        };
    }, []);

    // Si la materia marcada ya no tiene horas que colocar, deja de estarlo.
    const marcada =
        marcadaElegida && materias.some((m) => m.id === marcadaElegida.id && m.quedan > 0) ? marcadaElegida : null;

    const porColocar = materias.filter((m) => m.quedan > 0);
    const deHueco = (cellId: string) => bloques.find((b) => b.cellId === cellId);

    const tocarHueco = (cellId: string) => {
        if (marcada) {
            alColocar(marcada.datos, cellId);
            setTocado(null);
            return;
        }
        setTocado(null);
    };

    return (
        <div className="fixed inset-0 !m-0 z-[60] flex flex-col bg-white" style={{ paddingBottom: 'var(--zona-segura-abajo)' }}>
            {!tumbado ? (
                /* De pie todavía: la app lo gira sola; en un navegador, se pide. */
                <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                        <Smartphone className="h-8 w-8 rotate-90" aria-hidden />
                    </span>
                    <p className="text-lg font-bold text-gray-900">Gira el teléfono para editar el horario</p>
                    <p className="max-w-xs text-sm text-gray-600">
                        De lado caben los cinco días y la lista de materias a la vez.
                        {noGira && ' Si tienes el giro bloqueado, desbloquéalo un momento.'}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={alSalir}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700"
                        >
                            <ArrowLeft className="h-4 w-4" /> Volver
                        </button>
                        {sePuedeGirar() && (
                            <button
                                type="button"
                                onClick={() => aHorizontal().then((pudo) => setNoGira(!pudo))}
                                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white"
                            >
                                <RotateCw className="h-4 w-4" /> Girar
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex min-h-0 flex-1">
                    {/* ── Lo que falta por colocar ───────────────────────── */}
                    <aside className="flex w-[13.5rem] shrink-0 flex-col border-r border-gray-200 bg-gray-50">
                        <div className="flex items-center gap-1 border-b border-gray-200 px-1 py-1">
                            <button
                                type="button"
                                onClick={alSalir}
                                aria-label="Salir del editor"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-600"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                            <p className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{titulo}</p>
                            {/* El turno decide las horas de la rejilla: un toque cambia. */}
                            <button
                                type="button"
                                onClick={() => alCambiarTurno(turno === 'MANANA' ? 'TARDE' : 'MANANA')}
                                aria-label={`Turno: ${turno === 'MANANA' ? 'mañana' : 'tarde'}. Cambiar`}
                                className="flex min-h-[44px] shrink-0 items-center rounded-lg px-2 text-xs font-semibold text-indigo-700"
                            >
                                {turno === 'MANANA' ? 'Mañana' : 'Tarde'}
                            </button>
                        </div>

                        <p className="px-3 pt-2 text-xs font-medium text-gray-500">
                            {marcada ? (
                                <>
                                    Toca un hueco para poner <b className="text-indigo-700">{marcada.nombre}</b>
                                </>
                            ) : porColocar.length > 0 ? (
                                'Mantén pulsada y arrastra, o toca y elige el hueco'
                            ) : (
                                'Todo está colocado'
                            )}
                        </p>

                        <ColumnaDeMaterias>
                            <div className="flex flex-col gap-1.5">
                                {porColocar.map((m) => (
                                    <MateriaArrastrable
                                        key={m.id}
                                        materia={m}
                                        marcada={marcada?.id === m.id}
                                        alTocar={() => setMarcada((actual) => (actual?.id === m.id ? null : m))}
                                    />
                                ))}
                            </div>
                        </ColumnaDeMaterias>

                        <div className="flex gap-1.5 border-t border-gray-200 p-2">
                            <button
                                type="button"
                                onClick={alAzar}
                                aria-label="Ordenar al azar"
                                title="Ordenar al azar"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700"
                            >
                                <Shuffle className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                onClick={alGuardar}
                                disabled={!hayCambios || guardando}
                                className={cn(
                                    'flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold',
                                    hayCambios ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'
                                )}
                            >
                                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Guardar
                            </button>
                        </div>
                    </aside>

                    {/* ── La semana: de ancho cabe, solo baja ────────────── */}
                    <div className="rejilla-densa min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                        <div className="sticky top-0 z-10 grid grid-cols-[3.25rem_repeat(5,minmax(0,1fr))] border-b border-gray-200 bg-gray-50">
                            <div className="py-2 text-center text-xs font-bold uppercase text-gray-500">Hora</div>
                            {dias.map((d) => (
                                <div key={d.id} className="border-l border-gray-200 py-2 text-center text-xs font-bold uppercase text-gray-700">
                                    {d.label.slice(0, 3)}
                                </div>
                            ))}
                        </div>

                        {cargando ? (
                            <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500">
                                <Loader2 className="h-5 w-5 animate-spin" /> Cargando el horario…
                            </div>
                        ) : (
                            periodos.map((p) =>
                                p.type === 'break' ? (
                                    <div key={p.id} className="flex items-center justify-center gap-1.5 border-b border-gray-100 bg-gray-50 py-1 text-xs font-semibold text-gray-500">
                                        <Coffee className="h-3.5 w-3.5" aria-hidden /> {p.label} · {p.startTime}–{p.endTime}
                                    </div>
                                ) : (
                                    <div key={p.id} className="grid grid-cols-[3.25rem_repeat(5,minmax(0,1fr))] border-b border-gray-100">
                                        <div className="flex flex-col items-center justify-center bg-gray-50/60 py-1">
                                            <span className="text-xs font-semibold tabular-nums text-gray-700">{p.startTime}</span>
                                            <span className="text-xs tabular-nums text-gray-400">{p.endTime}</span>
                                        </div>
                                        {dias.map((d) => {
                                            const cellId = `${d.id}-${p.startTime}`;
                                            const bloque = deHueco(cellId);
                                            return (
                                                <Hueco key={cellId} id={cellId} alTocar={() => tocarHueco(cellId)} esperando={Boolean(marcada)}>
                                                    {bloque && (
                                                        <BloqueArrastrable
                                                            bloque={bloque}
                                                            tocado={tocado === cellId}
                                                            alTocar={() => {
                                                                if (marcada) {
                                                                    alColocar(marcada.datos, cellId);
                                                                    return;
                                                                }
                                                                setTocado((t) => (t === cellId ? null : cellId));
                                                            }}
                                                            alQuitar={() => {
                                                                alQuitar(cellId);
                                                                setTocado(null);
                                                            }}
                                                        />
                                                    )}
                                                </Hueco>
                                            );
                                        })}
                                    </div>
                                )
                            )
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
