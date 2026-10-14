'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    ArrowDown,
    ArrowUp,
    CalendarDays,
    Camera,
    Check,
    ChevronDown,
    ChevronLeft,
    Coins,
    Delete,
    GraduationCap,
    Hammer,
    Loader2,
    PiggyBank,
    Repeat,
    Rocket,
    Search,
    ShoppingCart,
    Tag,
    Users,
    Wrench,
    X,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import {
    useCrearFondo,
    useCrearGasto,
    useFichaDePersonal,
    useGastos,
    usePagarAlPersonal,
    useGuardarRecurrentes,
    usePersonal,
    useRecurrentes,
    useResumenDeFinanzas,
    useTasaDelDia,
    subirComprobante,
    type Recurrente,
} from '@/hooks/useFinanzas';
import { dinero, errorDe, useFichaDePagos, useRegistrarPago, useResumenDePagos, type Moneda } from '@/hooks/usePagos';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { esPendiente } from '@/lib/por-enviar';
import { Carril } from '@/components/ui/carril';
import { cn } from '@/lib/utils';

/**
 * NUEVO MOVIMIENTO: INGRESO O EGRESO (2026-10-14)
 *
 * Cristian, con la pantalla de Rial delante: «solo existirán dos opciones,
 * ingreso y egreso… anotar un gasto y pagarle a un personal es lo mismo: se
 * está descontando, y en ese panel de egreso especificamos de qué es». Primero
 * el monto, con su calculadora; luego de qué es, y la descripción de último.
 *
 *  · Ingreso: de un estudiante (año → sección → la tabla con su mensualidad y
 *    lo pagado, con buscador), una donación, otro ingreso o el saldo inicial.
 *  · Egreso: al personal (por área: Profesores siempre, y las que crea el
 *    admin) o un gasto de una de sus categorías.
 *
 * Por debajo usa lo de siempre (cobrar una cuota, pagar al personal, anotar un
 * fondo o un gasto): las reglas del dinero siguen en el servidor. Al cobrar o
 * pagar, el monto se reparte solo empezando por lo más viejo que se debe.
 */

export type TipoDeMovimiento = 'entra' | 'sale';
export type FuenteDelMovimiento = 'ESTUDIANTE' | 'DONACION' | 'OTRO' | 'SALDO_INICIAL' | 'PERSONAL' | `GASTO:${string}`;

const ANOS = ['1er Año', '2do Año', '3er Año', '4to Año', '5to Año', '6to Año'];
const primerNombre = (nombre: string, apellido: string) => `${nombre.split(' ')[0]} ${apellido.split(' ')[0]}`;
const nombreDelArea = (a: string) => (a === 'Profesor' ? 'Profesores' : a);
const SIMBOLO: Record<Moneda, string> = { USD: '$', VES: 'Bs' };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** «Hoy», «Ayer» o «12 oct». */
function laFecha(fecha: string, hoy: string): string {
    if (!fecha) return 'Hoy';
    if (fecha === hoy) return 'Hoy';
    const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    if (fecha === ayer) return 'Ayer';
    const [a, m, d] = fecha.split('-').map(Number);
    return `${d} ${MESES[m - 1]}${a !== Number(hoy.slice(0, 4)) ? ` ${a}` : ''}`;
}
/** Las categorías de siempre llevan su dibujo; las que cree el liceo, una etiqueta. */
const ICONO_DE_CATEGORIA: Record<string, LucideIcon> = { mantenimiento: Wrench, 'reparación': Hammer, reparacion: Hammer, compras: ShoppingCart, servicios: Zap };
const iconoDeCategoria = (c: string): LucideIcon => ICONO_DE_CATEGORIA[c.trim().toLowerCase()] ?? Tag;

/** Lo que se debe, de lo más viejo a lo más nuevo, hasta cubrir el monto. */
export function loQueCubre<T extends { pendiente: number }>(debidos: T[], monto: number): { elegidos: T[]; alcanza: boolean; total: number } {
    const elegidos: T[] = [];
    let suma = 0;
    for (const d of debidos) {
        if (suma >= monto - 0.004) break;
        if (d.pendiente <= 0) continue;
        elegidos.push(d);
        suma += d.pendiente;
    }
    const total = debidos.reduce((t, d) => t + Math.max(0, d.pendiente), 0);
    return { elegidos, alcanza: suma >= monto - 0.004, total };
}

export function NuevoMovimiento({
    tipoInicial,
    fuenteInicial,
    ciclo,
    monedas,
    metodos,
    alCerrar,
}: {
    tipoInicial: TipoDeMovimiento;
    fuenteInicial?: FuenteDelMovimiento;
    ciclo: string | null;
    monedas: { base: Moneda; aceptadas: Moneda[] };
    metodos: string[];
    alCerrar: () => void;
}) {
    const hoy = useSchoolToday();
    const cola = useQueryClient();
    const [tipo, setTipo] = React.useState<TipoDeMovimiento>(tipoInicial);
    const [moneda, setMoneda] = React.useState<Moneda>(monedas.base);
    const [cifras, setCifras] = React.useState('');
    const [tasa, setTasa] = React.useState('');
    const [fuente, setFuente] = React.useState<FuenteDelMovimiento | null>(fuenteInicial ?? null);
    const [estudiante, setEstudiante] = React.useState<{ id: string; nombre: string; seccion: string } | null>(null);
    const [persona, setPersona] = React.useState<{ id: string; nombre: string } | null>(null);
    const [metodo, setMetodo] = React.useState(metodos[0] ?? '');
    const [fecha, setFecha] = React.useState(hoy);
    // La hora del liceo llega del servidor: hasta entonces, la fecha va vacía.
    React.useEffect(() => {
        if (!fecha && hoy) setFecha(hoy);
    }, [fecha, hoy]);
    const [descripcion, setDescripcion] = React.useState('');
    const [referencia, setReferencia] = React.useState('');
    const [factura, setFactura] = React.useState<File | null>(null);
    const [comoRecurrente, setComoRecurrente] = React.useState(false);
    const [problema, setProblema] = React.useState<string | null>(null);
    const [enviando, setEnviando] = React.useState(false);
    const [escribiendo, setEscribiendo] = React.useState(false);
    const [eligiendoTipo, setEligiendoTipo] = React.useState(false);

    const { data: resumen } = useResumenDeFinanzas(true, ciclo);
    const { data: gastos } = useGastos(true, ciclo);
    const fichaDelAlumno = useFichaDePagos(fuente === 'ESTUDIANTE' ? (estudiante?.id ?? null) : null, ciclo);
    const fichaDePersona = useFichaDePersonal(fuente === 'PERSONAL' ? (persona?.id ?? null) : null, ciclo);
    const crearFondo = useCrearFondo();
    const crearGasto = useCrearGasto();
    const { data: tasaBcv } = useTasaDelDia(true);
    const { data: recurrentes = [] } = useRecurrentes(true);
    const guardarRecurrentes = useGuardarRecurrentes();
    // La tasa del BCV se pone sola al elegir la otra moneda (se puede cambiar).
    React.useEffect(() => {
        if (moneda !== monedas.base && !tasa && tasaBcv?.usd) setTasa(String(tasaBcv.usd));
    }, [moneda, monedas.base, tasa, tasaBcv]);
    const pagar = usePagarAlPersonal(ciclo);
    const cobrar = useRegistrarPago(estudiante?.id ?? '');

    const monto = Number(cifras || '0') / 100;
    const montoTexto = monto.toFixed(2);
    const t = Number(tasa);
    const conTasa = moneda !== monedas.base;
    // El monto en la moneda del liceo: con eso se reparte lo que se debe.
    const enBase = !conTasa ? monto : t > 0 ? (monedas.base === 'USD' ? monto / t : monto * t) : NaN;
    const fmtBase = (n: string | number) => dinero(n, monedas.base);

    // Cambiar de ingreso a egreso cambia también de qué es.
    const cambiarTipo = (nuevo: TipoDeMovimiento) => {
        setEligiendoTipo(false);
        if (nuevo === tipo) return;
        setTipo(nuevo);
        setFuente(null);
        setEstudiante(null);
        setPersona(null);
        setProblema(null);
    };

    const teclear = React.useCallback((tecla: string) => {
        setProblema(null);
        setCifras((c) => {
            if (tecla === 'C') return '';
            if (tecla === '⌫') return c.slice(0, -1);
            const nuevo = (c + tecla).replace(/^0+/, '');
            return nuevo.length > 11 ? c : nuevo;
        });
    }, []);

    const opciones: Array<{ id: FuenteDelMovimiento; texto: string; icono: LucideIcon }> =
        tipo === 'entra'
            ? [
                  { id: 'ESTUDIANTE', texto: 'Estudiante', icono: GraduationCap },
                  { id: 'DONACION', texto: 'Donación', icono: PiggyBank },
                  { id: 'OTRO', texto: 'Otro ingreso', icono: Coins },
                  ...(resumen && !resumen.tieneSaldoInicial ? [{ id: 'SALDO_INICIAL' as const, texto: 'Saldo inicial', icono: Rocket }] : []),
              ]
            : [
                  { id: 'PERSONAL', texto: 'Personal', icono: Users },
                  ...(gastos?.categorias ?? []).map((c) => ({ id: `GASTO:${c}` as FuenteDelMovimiento, texto: c, icono: iconoDeCategoria(c) })),
              ];

    const pideMetodo = fuente === 'ESTUDIANTE' || fuente === 'PERSONAL';
    // Pago móvil, transferencia, Zelle…: llevan su número de referencia (el efectivo no).
    const pideReferencia = pideMetodo && !!metodo && !/efectivo/i.test(metodo);
    // Un estudiante no se repite (cada uno es distinto); el saldo inicial, tampoco.
    const puedeSerRecurrente = !!fuente && fuente !== 'ESTUDIANTE' && fuente !== 'SALDO_INICIAL';
    const losRecurrentes = recurrentes.filter((r) => r.tipo === tipo);
    /** Un toque y el panel queda lleno: solo falta revisar y guardar. */
    const usarRecurrente = (r: Recurrente) => {
        setProblema(null);
        setMoneda(r.moneda);
        setCifras(String(Math.round(Number(r.monto) * 100)));
        setFuente(r.fuente as FuenteDelMovimiento);
        setDescripcion(r.descripcion ?? '');
        if (r.metodo) setMetodo(r.metodo);
        setPersona(r.fuente === 'PERSONAL' && r.personaId ? { id: r.personaId, nombre: r.personaNombre ?? r.nombre } : null);
        setComoRecurrente(false);
    };
    const quitarRecurrente = (r: Recurrente) =>
        guardarRecurrentes
            .mutateAsync(recurrentes.filter((x) => x.id !== r.id))
            .then(() => toast.success(`«${r.nombre}» quitado de los recurrentes`))
            .catch((e) => toast.error(errorDe(e, 'No se pudo quitar')));
    const eligiendoAQuien = (fuente === 'ESTUDIANTE' && !estudiante) || (fuente === 'PERSONAL' && !persona);
    const listo =
        monto > 0 &&
        (!conTasa || t > 0) &&
        !!fuente &&
        (fuente !== 'ESTUDIANTE' || (!!estudiante && !!fichaDelAlumno.data)) &&
        (fuente !== 'PERSONAL' || (!!persona && !!fichaDePersona.data)) &&
        (!pideMetodo || !!metodo) &&
        !!fecha &&
        !enviando;

    const guardar = async () => {
        if (!listo || !fuente) return;
        setProblema(null);
        setEnviando(true);
        const dineroDe = { monto: montoTexto, moneda, tasa: conTasa ? tasa : null };
        try {
            if (fuente === 'ESTUDIANTE') {
                const ficha = fichaDelAlumno.data;
                if (!ficha) throw new Error('Espera a que cargue lo que debe');
                const debidos = ficha.installments
                    .filter((c) => c.state !== 'EXONERADA' && Number(c.pending) > 0)
                    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                    .map((c) => ({ ...c, pendiente: Number(c.pending) }));
                const { elegidos, alcanza, total } = loQueCubre(debidos, enBase);
                if (!debidos.length) throw new Error(`${estudiante!.nombre} no debe nada en este ciclo`);
                if (!alcanza) throw new Error(`Es más de lo que debe: le faltan ${fmtBase(total)}`);
                const pago = await cobrar.mutateAsync({
                    academicYearId: ficha.academicYear.id,
                    installmentKeys: elegidos.map((c) => c.key),
                    amount: montoTexto,
                    currency: moneda,
                    exchangeRate: conTasa ? tasa : null,
                    method: metodo,
                    reference: pideReferencia ? referencia.trim() || null : null,
                    notes: descripcion.trim() || null,
                    paidAt: fecha,
                });
                void cola.invalidateQueries({ queryKey: ['finanzas'] });
                toast.success(`Cobrado · comprobante Nº ${String(pago.receiptNumber).padStart(6, '0')}`);
            } else if (fuente === 'PERSONAL') {
                const ficha = fichaDePersona.data;
                if (!ficha) throw new Error('Espera a que cargue lo que se le debe');
                if (!ficha.debidos.length) throw new Error(`A ${persona!.nombre} no se le ha puesto sueldo: hazlo en Personal`);
                const debidos = ficha.debidos
                    .filter((d) => Number(d.pendiente) > 0)
                    .sort((a, b) => a.fecha.localeCompare(b.fecha))
                    .map((d) => ({ ...d, pendiente: Number(d.pendiente) }));
                const { elegidos, alcanza, total } = loQueCubre(debidos, enBase);
                if (!debidos.length) throw new Error(`A ${persona!.nombre} no se le debe nada en este ciclo`);
                if (!alcanza) throw new Error(`Es más de lo que se le debe: ${fmtBase(total)}`);
                const pago = await pagar.mutateAsync({
                    id: persona!.id,
                    claves: elegidos.map((d) => d.clave),
                    ...dineroDe,
                    metodo,
                    fecha,
                    referencia: pideReferencia ? referencia.trim() || null : null,
                    notas: descripcion.trim() || null,
                });
                toast.success(`Pagado · recibo Nº ${String(pago.numero).padStart(6, '0')}`);
            } else if (fuente.startsWith('GASTO:')) {
                const categoria = fuente.slice('GASTO:'.length);
                // La foto de la factura: si no sube (sin señal), el gasto se anota igual, sin ella.
                const comprobanteId = factura ? await subirComprobante(factura).catch(() => null) : null;
                if (factura && !comprobanteId) toast('La factura no se pudo subir: el egreso se anota sin ella.');
                const r = await crearGasto.mutateAsync({ concepto: descripcion.trim() || categoria, categoria, fecha, proveedor: null, comprobanteId, ...dineroDe });
                if (esPendiente(r)) toast('Sin conexión: quedó pendiente ⏱ y se anota solo al volver.', { id: 'pendiente' });
                else toast.success('Egreso anotado');
            } else {
                const r = await crearFondo.mutateAsync({ concepto: fuente, descripcion: descripcion.trim() || null, fecha, ...dineroDe });
                if (esPendiente(r)) toast('Sin conexión: quedó pendiente ⏱ y se anota solo al volver.', { id: 'pendiente' });
                else toast.success('Ingreso anotado');
            }
            if (comoRecurrente && puedeSerRecurrente) {
                const nombre = (descripcion.trim() || (fuente === 'PERSONAL' ? persona?.nombre : opciones.find((o) => o.id === fuente)?.texto) || 'Recurrente').slice(0, 40);
                await guardarRecurrentes
                    .mutateAsync([
                        ...recurrentes,
                        {
                            nombre,
                            tipo,
                            fuente,
                            monto: montoTexto,
                            moneda,
                            descripcion: descripcion.trim() || null,
                            metodo: pideMetodo ? metodo : null,
                            personaId: fuente === 'PERSONAL' ? persona?.id : null,
                            personaNombre: fuente === 'PERSONAL' ? persona?.nombre : null,
                        },
                    ])
                    .then(() => toast.success(`«${nombre}» guardado como recurrente`))
                    .catch((e) => toast.error(errorDe(e, 'No se pudo guardar como recurrente')));
            }
            alCerrar();
        } catch (err) {
            setProblema(err instanceof Error && !(err as any).response ? err.message : errorDe(err, 'No se pudo guardar'));
        } finally {
            setEnviando(false);
        }
    };

    // Con teclado de ordenador también: los números, borrar y Enter.
    React.useEffect(() => {
        const alTeclear = (e: KeyboardEvent) => {
            const dentro = e.target as HTMLElement | null;
            if (dentro && (dentro.tagName === 'INPUT' || dentro.tagName === 'TEXTAREA')) return;
            if (/^[0-9]$/.test(e.key)) teclear(e.key);
            else if (e.key === 'Backspace') teclear('⌫');
            else if (e.key === 'Enter' && listo) void guardar();
        };
        window.addEventListener('keydown', alTeclear);
        return () => window.removeEventListener('keydown', alTeclear);
    });

    const entra = tipo === 'entra';

    return (
        <DialogPrimitive.Root open onOpenChange={(v) => !v && alCerrar()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
                <DialogPrimitive.Content
                    aria-describedby={undefined}
                    className="fixed inset-0 z-50 flex flex-col bg-gray-50 pb-[var(--zona-segura-abajo,0px)] pt-[var(--zona-segura-arriba,0px)] outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(54rem,calc(100dvh-2rem))] sm:w-[28rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-3xl sm:pb-0 sm:pt-0 sm:shadow-2xl"
                >
                    {/* ARRIBA: volver, el título y si entra o sale */}
                    <div className="flex items-center gap-2 px-3 py-3">
                        <DialogPrimitive.Close
                            aria-label="Volver"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-gray-900 shadow-sm ring-1 ring-gray-200"
                        >
                            <ChevronLeft className="h-5 w-5" aria-hidden />
                        </DialogPrimitive.Close>
                        <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-base font-bold text-gray-900">Nuevo movimiento</DialogPrimitive.Title>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setEligiendoTipo((v) => !v)}
                                aria-haspopup="listbox"
                                aria-expanded={eligiendoTipo}
                                aria-label={`Tipo: ${entra ? 'Ingreso' : 'Egreso'}. Cambiar`}
                                className="flex min-h-[44px] items-center gap-2 rounded-full bg-white pl-2 pr-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-200"
                            >
                                <IconoDelTipo entra={entra} />
                                {entra ? 'Ingreso' : 'Egreso'}
                                <ChevronDown className="h-4 w-4 text-gray-600" aria-hidden />
                            </button>
                            {eligiendoTipo && (
                                <ul role="listbox" aria-label="Tipo de movimiento" className="absolute right-0 top-12 z-10 w-40 rounded-2xl bg-white p-1 shadow-xl ring-1 ring-gray-200">
                                    {(['entra', 'sale'] as const).map((x) => (
                                        <li key={x}>
                                            <button
                                                type="button"
                                                role="option"
                                                aria-selected={tipo === x}
                                                onClick={() => cambiarTipo(x)}
                                                className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"
                                            >
                                                <IconoDelTipo entra={x === 'entra'} />
                                                {x === 'entra' ? 'Ingreso' : 'Egreso'}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* EN MEDIO: el monto y de qué es (se desplaza) */}
                    <div
                        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4"
                        onFocus={(e) => {
                            const el = e.target as HTMLInputElement;
                            if (el.tagName === 'INPUT' && el.type !== 'date') setEscribiendo(true);
                        }}
                        // Al salir del campo, la calculadora vuelve un poco después: si
                        // se iba al pulsar «Guardar», el botón se movía bajo el dedo.
                        onBlur={() =>
                            window.setTimeout(() => {
                                const el = document.activeElement as HTMLInputElement | null;
                                setEscribiendo(!!el && el.tagName === 'INPUT' && el.type !== 'date');
                            }, 200)
                        }
                    >
                        {/* Arriba de todo, la fecha: «Hoy» y, al tocarla, el calendario del teléfono. */}
                        <div className="flex justify-center">
                            <label className="relative flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-gray-800 hover:bg-gray-200/60">
                                <CalendarDays className="h-4 w-4 text-gray-600" aria-hidden />
                                {laFecha(fecha, hoy)}
                                <ChevronDown className="h-4 w-4 text-gray-600" aria-hidden />
                                <input
                                    type="date"
                                    aria-label="Fecha"
                                    value={fecha}
                                    max={hoy}
                                    onChange={(e) => e.target.value && setFecha(e.target.value)}
                                    onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                />
                            </label>
                        </div>

                        {monedas.aceptadas.length > 1 && (
                            <div className="mx-auto flex w-fit rounded-full bg-gray-200/70 p-1" role="radiogroup" aria-label="Moneda">
                                {monedas.aceptadas.map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        role="radio"
                                        aria-checked={moneda === m}
                                        onClick={() => setMoneda(m)}
                                        className={cn(
                                            'min-h-[40px] rounded-full px-4 text-sm',
                                            moneda === m ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'text-gray-600'
                                        )}
                                    >
                                        {SIMBOLO[m]} {m === 'USD' ? 'Dólares' : 'Bolívares'}
                                    </button>
                                ))}
                            </div>
                        )}

                        <p className="text-center text-5xl font-extrabold tabular-nums tracking-tight text-gray-900" aria-live="polite" aria-label={`Monto: ${SIMBOLO[moneda]} ${montoTexto}`}>
                            <span className="mr-2 text-gray-400">{SIMBOLO[moneda]}</span>
                            {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(monto)}
                        </p>

                        {conTasa && (
                            <label className="mx-auto flex max-w-xs items-center gap-2 rounded-full bg-white px-4 text-sm text-gray-700 shadow-sm ring-1 ring-gray-200">
                                Tasa del día
                                <input
                                    inputMode="decimal"
                                    value={tasa}
                                    onChange={(e) => setTasa(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
                                    placeholder={monedas.base === 'USD' ? 'Bs por $' : '$ por Bs'}
                                    className="min-h-[44px] min-w-0 flex-1 bg-transparent text-right font-semibold text-gray-900 outline-none"
                                />
                            </label>
                        )}
                        {conTasa && (
                            <p className="-mt-3 text-center text-xs text-gray-600">
                                {t > 0 && monto > 0 && <>Son {fmtBase(enBase)} · </>}
                                {tasaBcv
                                    ? `${String(tasaBcv.usd) === tasa ? 'Tasa BCV' : 'La del BCV es ' + tasaBcv.usd.toLocaleString('es-VE')} del ${tasaBcv.fecha.split('-').reverse().slice(0, 2).join('/')}${tasaBcv.vieja ? ' (sin conexión: la última que se supo)' : ''}`
                                    : 'Escribe la tasa del día'}
                            </p>
                        )}

                        {/* LOS RECURRENTES: un toque y queda lleno (como las plantillas de Rial) */}
                        {losRecurrentes.length > 0 && (
                            <section aria-labelledby="recurrentes" className="space-y-2">
                                <h3 id="recurrentes" className="text-sm font-semibold text-gray-700">
                                    Recurrentes
                                </h3>
                                <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                                    {losRecurrentes.map((r) => (
                                        <li key={r.id} className="flex shrink-0 items-center rounded-full bg-white shadow-sm ring-1 ring-gray-200">
                                            <button
                                                type="button"
                                                onClick={() => usarRecurrente(r)}
                                                className="flex min-h-[44px] items-center gap-2 pl-3 pr-1 text-sm font-medium text-gray-900"
                                            >
                                                <Repeat className="h-4 w-4 text-gray-600" aria-hidden />
                                                {r.nombre}
                                                <span className="text-gray-600">
                                                    {SIMBOLO[r.moneda]} {Number(r.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void quitarRecurrente(r)}
                                                aria-label={`Quitar «${r.nombre}» de los recurrentes`}
                                                className="flex h-11 w-9 items-center justify-center rounded-full text-gray-500 hover:text-red-700"
                                            >
                                                <X className="h-4 w-4" aria-hidden />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        <section aria-labelledby="de-que-es" className="space-y-2">
                            <h3 id="de-que-es" className="text-sm font-semibold text-gray-700">
                                {entra ? '¿De dónde viene?' : '¿De qué es?'}
                            </h3>
                            {/* Con la forma y el carril de los accesos del Inicio (pedido por
                                Cristian): el cuadro redondeado con su icono y el nombre debajo,
                                y se desplazan de lado. */}
                            <div className="-mx-4">
                                <Carril
                                    etiqueta={entra ? 'De dónde viene' : 'De qué es'}
                                    libre
                                    conFlechas={false}
                                    anchoDeCada="basis-[23.5%]"
                                    hueco="gap-0"
                                    className="px-3 [mask-image:linear-gradient(to_right,transparent,#000_3%,#000_92%,transparent)]"
                                >
                                    {opciones.map((o) => {
                                        const Icono = o.icono;
                                        const activo = fuente === o.id;
                                        return (
                                            <div key={o.id} className="px-0.5">
                                                <button
                                                    type="button"
                                                    aria-pressed={activo}
                                                    title={o.texto}
                                                    onClick={() => {
                                                        setFuente(o.id);
                                                        setProblema(null);
                                                    }}
                                                    className="group flex w-full min-w-0 flex-col items-center gap-2 py-1 text-center text-xs font-semibold text-texto-medio"
                                                >
                                                    <span
                                                        className={cn(
                                                            'flex h-[58px] w-[58px] items-center justify-center rounded-[20px] shadow-[0_1px_2px_rgba(13,71,161,0.08)] transition-colors group-active:scale-95',
                                                            activo ? 'bg-indigo-600 text-white ring-2 ring-indigo-200' : 'bg-white text-cabecera-tinta'
                                                        )}
                                                    >
                                                        <Icono className="h-6 w-6" aria-hidden />
                                                    </span>
                                                    <span className={cn('w-full truncate', activo && 'text-gray-900')}>{o.texto}</span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </Carril>
                            </div>
                        </section>

                        {fuente === 'ESTUDIANTE' &&
                            (estudiante ? (
                                <Elegido
                                    titulo={estudiante.nombre}
                                    detalle={
                                        fichaDelAlumno.data
                                            ? `${estudiante.seccion} · debe ${fmtBase(fichaDelAlumno.data.installments.reduce((s, c) => s + (c.state === 'EXONERADA' ? 0 : Number(c.pending)), 0))}`
                                            : estudiante.seccion
                                    }
                                    alCambiar={() => setEstudiante(null)}
                                />
                            ) : (
                                <ElegirEstudiante ciclo={ciclo} fmt={fmtBase} alElegir={setEstudiante} />
                            ))}

                        {fuente === 'PERSONAL' &&
                            (persona ? (
                                <Elegido
                                    titulo={persona.nombre}
                                    detalle={
                                        fichaDePersona.data?.persona.resumen
                                            ? `Se le debe ${fmtBase(fichaDePersona.data.persona.resumen.pendiente)}`
                                            : fichaDePersona.data
                                              ? 'Sin sueldo puesto'
                                              : 'Cargando…'
                                    }
                                    alCambiar={() => setPersona(null)}
                                />
                            ) : (
                                <ElegirPersona ciclo={ciclo} fmt={fmtBase} alElegir={setPersona} />
                            ))}

                        {pideMetodo && metodos.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-gray-700">¿Cómo?</h3>
                                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Método de pago">
                                    {metodos.map((m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            role="radio"
                                            aria-checked={metodo === m}
                                            onClick={() => setMetodo(m)}
                                            className={cn(
                                                'min-h-[44px] rounded-full px-4 text-sm font-medium',
                                                metodo === m ? 'bg-gray-900 text-white' : 'bg-white text-gray-800 shadow-sm ring-1 ring-gray-200'
                                            )}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {pideReferencia && (
                            <label className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-white px-4 shadow-sm ring-1 ring-gray-200">
                                <span className="text-sm text-gray-800">Referencia</span>
                                <input
                                    value={referencia}
                                    onChange={(e) => setReferencia(e.target.value)}
                                    maxLength={60}
                                    inputMode="numeric"
                                    placeholder="Opcional"
                                    className="min-h-[44px] min-w-0 flex-1 bg-transparent text-right text-sm text-gray-900 outline-none placeholder:text-gray-500"
                                />
                            </label>
                        )}

                        {fuente?.startsWith('GASTO:') && (
                            <label className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 shadow-sm ring-1 ring-gray-200">
                                <Camera className="h-5 w-5 shrink-0 text-gray-600" aria-hidden />
                                <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{factura ? factura.name : 'Foto de la factura'}</span>
                                <span className="text-sm text-gray-500">{factura ? 'Cambiar' : 'Opcional'}</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    aria-label="Foto de la factura"
                                    onChange={(e) => setFactura(e.target.files?.[0] ?? null)}
                                    className="sr-only"
                                />
                            </label>
                        )}

                        {/* De último, la descripción */}
                        <label className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-white px-4 shadow-sm ring-1 ring-gray-200">
                            <span className="text-sm text-gray-800">Descripción</span>
                            <input
                                value={descripcion}
                                onChange={(e) => setDescripcion(e.target.value)}
                                maxLength={fuente?.startsWith('GASTO:') ? 120 : 200}
                                placeholder="Opcional"
                                className="min-h-[44px] min-w-0 flex-1 bg-transparent text-right text-sm text-gray-900 outline-none placeholder:text-gray-500"
                            />
                        </label>

                        {puedeSerRecurrente && (
                            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-1 text-sm text-gray-800">
                                <input type="checkbox" checked={comoRecurrente} onChange={(e) => setComoRecurrente(e.target.checked)} className="h-5 w-5 accent-indigo-600" />
                                <Repeat className="h-4 w-4 text-gray-600" aria-hidden />
                                Guardar como recurrente (para la próxima vez, de un toque)
                            </label>
                        )}

                        {problema && (
                            <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
                                {problema}
                            </p>
                        )}
                    </div>

                    {/* ABAJO: la calculadora. Se esconde mientras se escribe con el
                        teclado del teléfono y mientras se busca a quién (la tabla
                        necesita la pantalla); al elegirlo, vuelve. */}
                    {escribiendo && !eligiendoAQuien && (
                        <div className="border-t border-gray-200 bg-gray-50 p-3">
                            <button
                                type="button"
                                onClick={() => void guardar()}
                                disabled={!listo}
                                aria-label={entra ? 'Guardar el ingreso' : 'Guardar el egreso'}
                                className={cn(
                                    'flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-white shadow-sm disabled:opacity-40',
                                    entra ? 'bg-emerald-600' : 'bg-red-600'
                                )}
                            >
                                {enviando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Check className="h-5 w-5" aria-hidden />}
                                Guardar
                            </button>
                        </div>
                    )}
                    {!escribiendo && !eligiendoAQuien && (
                        <div className="grid grid-cols-4 gap-2 border-t border-gray-200 bg-gray-50 p-3" aria-label="Calculadora" role="group">
                            {['1', '2', '3'].map((n) => (
                                <Tecla key={n} alPulsar={() => teclear(n)}>
                                    {n}
                                </Tecla>
                            ))}
                            <Tecla alPulsar={() => teclear('C')} etiqueta="Borrar todo" className="text-amber-700">
                                C
                            </Tecla>
                            {['4', '5', '6'].map((n) => (
                                <Tecla key={n} alPulsar={() => teclear(n)}>
                                    {n}
                                </Tecla>
                            ))}
                            <button
                                type="button"
                                onClick={() => void guardar()}
                                disabled={!listo}
                                aria-label={entra ? 'Guardar el ingreso' : 'Guardar el egreso'}
                                className={cn(
                                    'row-span-3 flex items-center justify-center rounded-2xl text-white shadow-sm transition-opacity disabled:opacity-40',
                                    entra ? 'bg-emerald-600' : 'bg-red-600'
                                )}
                            >
                                {enviando ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <Check className="h-7 w-7" aria-hidden />}
                            </button>
                            {['7', '8', '9'].map((n) => (
                                <Tecla key={n} alPulsar={() => teclear(n)}>
                                    {n}
                                </Tecla>
                            ))}
                            <Tecla alPulsar={() => teclear('00')}>00</Tecla>
                            <Tecla alPulsar={() => teclear('0')}>0</Tecla>
                            <Tecla alPulsar={() => teclear('⌫')} etiqueta="Borrar" className="bg-gray-200">
                                <Delete className="h-5 w-5" aria-hidden />
                            </Tecla>
                        </div>
                    )}
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

function IconoDelTipo({ entra }: { entra: boolean }) {
    return (
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-white', entra ? 'bg-emerald-600' : 'bg-red-600')}>
            {entra ? <ArrowUp className="h-4 w-4" aria-hidden /> : <ArrowDown className="h-4 w-4" aria-hidden />}
        </span>
    );
}

function Tecla({ children, alPulsar, etiqueta, className }: { children: React.ReactNode; alPulsar: () => void; etiqueta?: string; className?: string }) {
    return (
        <button
            type="button"
            onClick={alPulsar}
            aria-label={etiqueta}
            className={cn('flex h-14 items-center justify-center rounded-2xl bg-white text-xl font-medium text-gray-900 shadow-sm ring-1 ring-gray-200 active:scale-95', className)}
        >
            {children}
        </button>
    );
}

/** Lo elegido (el estudiante o la persona), con su botón para cambiarlo. */
function Elegido({ titulo, detalle, alCambiar }: { titulo: string; detalle: string; alCambiar: () => void }) {
    return (
        <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">{titulo}</span>
                <span className="block truncate text-xs text-gray-600">{detalle}</span>
            </span>
            <button type="button" onClick={alCambiar} className="flex min-h-[44px] items-center gap-1 rounded-full px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
                <X className="h-4 w-4" aria-hidden />
                Cambiar
            </button>
        </div>
    );
}

function Buscador({ valor, alCambiar, rotulo }: { valor: string; alCambiar: (v: string) => void; rotulo: string }) {
    return (
        <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
            <input
                type="search"
                aria-label={rotulo}
                value={valor}
                onChange={(e) => alCambiar(e.target.value)}
                placeholder={rotulo}
                className="min-h-[44px] w-full rounded-full bg-white py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-indigo-300"
            />
        </div>
    );
}

function Pastilla({ activa, alPulsar, children }: { activa: boolean; alPulsar: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-pressed={activa}
            onClick={alPulsar}
            className={cn(
                'min-h-[44px] shrink-0 rounded-full px-4 text-sm font-medium',
                activa ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 shadow-sm ring-1 ring-gray-200'
            )}
        >
            {children}
        </button>
    );
}

/**
 * EL ESTUDIANTE: año → sección → la tabla con su nombre, su mensualidad y lo
 * que lleva pagado. Con el buscador se salta los pasos.
 */
function ElegirEstudiante({
    ciclo,
    fmt,
    alElegir,
}: {
    ciclo: string | null;
    fmt: (n: string | number) => string;
    alElegir: (e: { id: string; nombre: string; seccion: string }) => void;
}) {
    const { data, isLoading } = useResumenDePagos(true, ciclo);
    const [grado, setGrado] = React.useState<number | null>(null);
    const [seccionId, setSeccionId] = React.useState<string | null>(null);
    const [busqueda, setBusqueda] = React.useState('');

    if (isLoading || !data) {
        return (
            <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando los estudiantes" />
            </div>
        );
    }
    const grados = [...new Set(data.classrooms.map((c) => c.grade))].sort((a, b) => a - b);
    const elGrado = grado ?? grados[0] ?? null;
    const secciones = data.classrooms.filter((c) => c.grade === elGrado).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const laSeccion = secciones.find((s) => s.id === seccionId) ?? null;
    const texto = busqueda.trim().toLowerCase();
    const filas = texto
        ? data.classrooms
              .flatMap((c) => c.students.map((a) => ({ a, seccion: c.name })))
              .filter(({ a }) => `${a.firstName} ${a.lastName} ${a.id}`.toLowerCase().includes(texto))
              .slice(0, 60)
        : laSeccion
          ? laSeccion.students.map((a) => ({ a, seccion: laSeccion.name }))
          : [];

    return (
        <div className="space-y-3">
            <Buscador valor={busqueda} alCambiar={setBusqueda} rotulo="Buscar estudiante o cédula" />
            {!texto && (
                <>
                    <div className="flex flex-wrap gap-2" aria-label="Año">
                        {grados.map((g) => (
                            <Pastilla
                                key={g}
                                activa={g === elGrado}
                                alPulsar={() => {
                                    setGrado(g);
                                    setSeccionId(null);
                                }}
                            >
                                {ANOS[g - 1] ?? `${g}º`}
                            </Pastilla>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2" aria-label="Sección">
                        {secciones.map((s) => (
                            <Pastilla key={s.id} activa={s.id === laSeccion?.id} alPulsar={() => setSeccionId(s.id)}>
                                {s.section ? `Sección ${s.section}` : s.name}
                            </Pastilla>
                        ))}
                    </div>
                    {!laSeccion && <p className="text-sm text-gray-600">Elige la sección para ver a sus estudiantes.</p>}
                </>
            )}
            {(texto || laSeccion) && (
                <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-600" aria-hidden>
                        <span>Estudiante</span>
                        <span className="w-20 text-right">Mensualidad</span>
                        <span className="w-20 text-right">Pagado</span>
                    </div>
                    {filas.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-gray-600">{texto ? `Nadie coincide con «${busqueda}».` : 'Sin estudiantes en esta sección.'}</p>
                    ) : (
                        <ul className="divide-y divide-gray-100" aria-label="Estudiantes">
                            {filas.map(({ a, seccion }) => {
                                const nombre = primerNombre(a.firstName, a.lastName);
                                return (
                                    <li key={a.id}>
                                        <button
                                            type="button"
                                            onClick={() => alElegir({ id: a.id, nombre, seccion })}
                                            className="grid min-h-[48px] w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate font-medium text-gray-900">{nombre}</span>
                                                {texto && <span className="block truncate text-xs text-gray-600">{seccion}</span>}
                                            </span>
                                            <span className="w-20 text-right tabular-nums text-gray-800">{a.mensualidad ? fmt(a.mensualidad) : '—'}</span>
                                            <span className={cn('w-20 text-right tabular-nums', a.state === 'DEBE' ? 'text-red-700' : 'text-emerald-700')}>{fmt(a.paid)}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

/** LA PERSONA: por área (Profesores siempre, y las que crea el admin), con buscador. */
function ElegirPersona({ ciclo, fmt, alElegir }: { ciclo: string | null; fmt: (n: string | number) => string; alElegir: (p: { id: string; nombre: string }) => void }) {
    const { data, isLoading } = usePersonal(true, ciclo);
    const [area, setArea] = React.useState('Profesor');
    const [busqueda, setBusqueda] = React.useState('');
    if (isLoading || !data) {
        return (
            <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando el personal" />
            </div>
        );
    }
    const texto = busqueda.trim().toLowerCase();
    const activas = data.personas.filter((p) => p.activo);
    const filas = texto
        ? activas.filter((p) => `${p.nombre} ${p.cargo} ${p.cedula ?? ''}`.toLowerCase().includes(texto))
        : activas.filter((p) => p.cargo.trim().toLowerCase() === area.toLowerCase());
    return (
        <div className="space-y-3">
            <Buscador valor={busqueda} alCambiar={setBusqueda} rotulo="Buscar en el personal" />
            {!texto && (
                <div className="flex flex-wrap gap-2" aria-label="Área">
                    {(data.areas ?? ['Profesor']).map((a) => (
                        <Pastilla key={a} activa={a === area} alPulsar={() => setArea(a)}>
                            {nombreDelArea(a)}
                        </Pastilla>
                    ))}
                </div>
            )}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                {filas.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-gray-600">
                        {texto ? `Nadie coincide con «${busqueda}».` : `Nadie en ${nombreDelArea(area)}: se agrega en Finanzas → Personal.`}
                    </p>
                ) : (
                    <ul className="divide-y divide-gray-100" aria-label="Personal">
                        {filas.map((p) => (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => alElegir({ id: p.id, nombre: p.nombre })}
                                    className="flex min-h-[48px] w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                >
                                    <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{p.nombre}</span>
                                    <span className={cn('shrink-0 text-xs', p.resumen && Number(p.resumen.pendiente) > 0 ? 'text-gray-800' : 'text-gray-600')}>
                                        {!p.resumen ? 'Sin sueldo' : Number(p.resumen.pendiente) > 0 ? `Se le debe ${fmt(p.resumen.pendiente)}` : 'Al día'}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default NuevoMovimiento;
