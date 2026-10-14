'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, GraduationCap, Plus, ShoppingCart, Users, Wallet, X, type LucideIcon } from 'lucide-react';
import { useResumenDeFinanzas } from '@/hooks/useFinanzas';
import { dinero } from '@/hooks/usePagos';
import { cn } from '@/lib/utils';

/**
 * LO DE ARRIBA DE FINANZAS, COMO RIAL (2026-10-14)
 *
 * Cristian, mirando Rial: arriba solo el saldo; debajo, las partes de las
 * finanzas en círculos (lo que antes eran pestañas), y un botón «+» que
 * flota abajo para añadir un ingreso o un egreso (`NuevoMovimiento`).
 */

/** El ojo de los fondos: se recuerda en este aparato y lo oyen todos los que lo usan. */
const LLAVE_FONDOS_OCULTOS = 'gestiedu:fondos-ocultos';
const CAMBIO_DEL_OJO = 'gestiedu:fondos-ocultos-cambio';

export function useFondosOcultos(): [boolean, () => void] {
    const [oculto, setOculto] = React.useState(false);
    React.useEffect(() => {
        const leer = () => {
            try {
                setOculto(localStorage.getItem(LLAVE_FONDOS_OCULTOS) === '1');
            } catch {
                /* sin almacén */
            }
        };
        leer();
        window.addEventListener(CAMBIO_DEL_OJO, leer);
        return () => window.removeEventListener(CAMBIO_DEL_OJO, leer);
    }, []);
    const alternar = React.useCallback(() => {
        setOculto((v) => {
            try {
                localStorage.setItem(LLAVE_FONDOS_OCULTOS, v ? '0' : '1');
            } catch {
                /* sin almacén */
            }
            window.setTimeout(() => window.dispatchEvent(new Event(CAMBIO_DEL_OJO)), 0);
            return !v;
        });
    }, []);
    return [oculto, alternar];
}

/** «Mi balance» de Rial: los fondos disponibles, grandes y con su ojo. */
export function SaldoDisponible({ ciclo }: { ciclo: string | null }) {
    const { data } = useResumenDeFinanzas(true, ciclo);
    const [oculto, alternarOculto] = useFondosOcultos();
    const disponibles = Number(data?.fondosDisponibles ?? 0);
    return (
        <section
            aria-label="Fondos disponibles"
            data-recorrido="pantalla"
            className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-cabecera-claro to-transparent px-5 pb-6 pt-6 text-center"
        >
            <p className="flex items-center justify-center gap-1.5 text-sm text-gray-600">
                <Wallet className="h-4 w-4" aria-hidden />
                Fondos disponibles
                <button
                    type="button"
                    onClick={alternarOculto}
                    aria-pressed={oculto}
                    aria-label={oculto ? 'Ver los fondos' : 'Ocultar los fondos'}
                    className="-my-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-600 hover:bg-white/60"
                >
                    {oculto ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
            </p>
            {data ? (
                // Sin envolver: las pruebas leen el saldo como el primer párrafo que empieza por «$».
                <p className={cn('mt-1 text-[2.75rem] font-extrabold leading-none tracking-tight tabular-nums', disponibles < 0 ? 'text-red-700' : 'text-gray-900')}>
                    {oculto ? '$ ••••' : dinero(data.fondosDisponibles, data.currency)}
                </p>
            ) : (
                <span className="mx-auto mt-1 block h-11 w-56 animate-pulse rounded-xl bg-white/70" aria-label="Cargando los fondos" />
            )}
        </section>
    );
}

/** Las partes de las finanzas, con la forma de los accesos del Inicio. Eran pestañas. */
export type Vista = 'resumen' | 'estudiantes' | 'personal' | 'gastos';
export const VISTAS: Array<{ id: Vista; nombre: string; corto: string; pista: string; icono: LucideIcon }> = [
    { id: 'resumen', nombre: 'Resumen', corto: 'Resumen', pista: 'Fondos y el ciclo mes a mes', icono: Wallet },
    { id: 'estudiantes', nombre: 'Estudiantes', corto: 'Estudiantes', pista: 'Cuotas, cobros y quién debe', icono: GraduationCap },
    { id: 'personal', nombre: 'Personal', corto: 'Personal', pista: 'Sueldos, vacaciones y recibos', icono: Users },
    { id: 'gastos', nombre: 'Gastos y fondos', corto: 'Gastos', pista: 'Compras, reparaciones, ingresos', icono: ShoppingCart },
];

export function PartesDeFinanzas({ vista, alElegir }: { vista: Vista; alElegir: (v: Vista) => void }) {
    return (
        <nav className="grid grid-cols-4 gap-2" aria-label="Partes de las finanzas">
            {VISTAS.map((v) => {
                const Icono = v.icono;
                const activa = vista === v.id;
                return (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => alElegir(v.id)}
                        data-pestana
                        data-recorrido={`finanzas-${v.id}`}
                        aria-current={activa ? 'page' : undefined}
                        aria-describedby={`pista-${v.id}`}
                        className="group flex min-h-[44px] min-w-0 flex-col items-center gap-1.5 rounded-2xl py-1 text-center"
                    >
                        <span
                            className={cn(
                                'flex h-[58px] w-[58px] items-center justify-center rounded-[20px] shadow-[0_1px_2px_rgba(13,71,161,0.08)] transition-colors group-active:scale-95',
                                activa ? 'bg-indigo-600 text-white' : 'bg-white text-cabecera-tinta group-hover:bg-gray-50'
                            )}
                        >
                            <Icono className="h-6 w-6" aria-hidden />
                        </span>
                        <span className={cn('max-w-full truncate text-xs leading-tight', activa ? 'font-bold text-gray-900' : 'font-medium text-gray-800')}>{v.corto}</span>
                        {/* Oculta pero leída como descripción (aria-describedby lee lo `hidden`). */}
                        <span id={`pista-${v.id}`} hidden>
                            {v.nombre}: {v.pista}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}

/** Una opción del menú del «+»: icono, qué hace y una línea debajo. */
interface Opcion {
    entra: boolean;
    titulo: string;
    detalle: string;
    alElegir: () => void;
}

/**
 * EL BOTÓN DE AÑADIR (el «+» de Rial, del color de la app). Flota abajo a la
 * derecha, por encima de la barra del teléfono; al tocarlo oscurece la
 * pantalla y ofrece lo único que hace falta: ingreso o egreso (Cristian:
 * «anotar un gasto y pagarle al personal es lo mismo: se está descontando»).
 */
export function BotonAnadir({ alIngreso, alEgreso }: { alIngreso: () => void; alEgreso: () => void }) {
    const [abierto, setAbierto] = React.useState(false);
    const primero = React.useRef<HTMLButtonElement>(null);
    React.useEffect(() => {
        if (!abierto) return;
        primero.current?.focus();
        const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
        window.addEventListener('keydown', alTeclear);
        return () => window.removeEventListener('keydown', alTeclear);
    }, [abierto]);

    const opciones: Opcion[] = [
        { entra: true, titulo: 'Ingreso', detalle: 'Una cuota, una donación, otro ingreso', alElegir: alIngreso },
        { entra: false, titulo: 'Egreso', detalle: 'Pagar al personal o un gasto', alElegir: alEgreso },
    ];

    return (
        <>
            {abierto && <div className="fixed inset-0 z-40 bg-black/40" aria-hidden onClick={() => setAbierto(false)} />}
            <div className="fixed bottom-[calc(6.5rem+var(--zona-segura-abajo,0px))] right-4 z-50 flex flex-col items-end gap-3 lateral:bottom-8 lateral:right-8 print:hidden">
                {abierto && (
                    <div role="menu" aria-label="Añadir" className="w-[min(20rem,calc(100vw-2rem))] rounded-3xl bg-white p-2 shadow-xl">
                        {opciones.map((o, i) => {
                            const Icono = o.entra ? ArrowUp : ArrowDown;
                            return (
                                <button
                                    key={o.titulo}
                                    ref={i === 0 ? primero : undefined}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setAbierto(false);
                                        o.alElegir();
                                    }}
                                    className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-gray-50"
                                >
                                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white', o.entra ? 'bg-emerald-600' : 'bg-red-600')}>
                                        <Icono className="h-5 w-5" aria-hidden />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-base font-medium text-gray-900">{o.titulo}</span>
                                        <span className="block text-xs text-gray-600">{o.detalle}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => setAbierto((v) => !v)}
                    aria-expanded={abierto}
                    aria-haspopup="menu"
                    aria-label={abierto ? 'Cerrar el menú de añadir' : 'Añadir'}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform active:scale-95"
                >
                    {abierto ? <X className="h-7 w-7" aria-hidden /> : <Plus className="h-8 w-8" aria-hidden />}
                </button>
            </div>
        </>
    );
}
