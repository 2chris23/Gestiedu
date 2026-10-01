'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Ban, Camera, Loader2, PiggyBank, Plus, Receipt, ShoppingCart } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CampoDeDinero, campo, type Dinero } from '@/components/finanzas/CampoDeDinero';
import {
    CONCEPTO_DE_FONDO,
    subirComprobante,
    useAnularFondo,
    useAnularGasto,
    useCrearFondo,
    useCrearGasto,
    useFondos,
    useGastos,
    type Fondo,
    type Gasto,
} from '@/hooks/useFinanzas';
import { dinero, errorDe, type Moneda } from '@/hooks/usePagos';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { cn } from '@/lib/utils';
import { esPendiente } from '@/lib/por-enviar';

/**
 * GASTOS Y FONDOS (2026-10-01)
 *
 * Cristian: «puede haber un gasto, por ejemplo compraron un tablero de básquet,
 * o se dañó algo, así que tiene que haber una opción para anotar esos datos»;
 * y «agregar fondos, por ejemplo que sea nuevo usando el sistema y quiera
 * colocar cuánto tiene el liceo a disposición». Cada gasto puede llevar la
 * foto de su factura. Nada se borra: se anula con motivo.
 */

const fechaCorta = (ymd: string) => ymd.split('-').reverse().join('/');

export interface Monedas {
    base: Moneda;
    aceptadas: Moneda[];
}

// ─── Anotar un gasto ────────────────────────────────────────────────────────

export function FormularioDeGasto({ abierto, alCerrar, categorias, monedas }: { abierto: boolean; alCerrar: () => void; categorias: string[]; monedas: Monedas }) {
    const hoy = useSchoolToday();
    const crear = useCrearGasto();
    const [concepto, setConcepto] = React.useState('');
    const [categoria, setCategoria] = React.useState(categorias[0] ?? '');
    const [fecha, setFecha] = React.useState(hoy);
    const [proveedor, setProveedor] = React.useState('');
    const [notas, setNotas] = React.useState('');
    const [dineroDelGasto, setDinero] = React.useState<Dinero>({ monto: '', moneda: monedas.base, tasa: '' });
    const [foto, setFoto] = React.useState<File | null>(null);
    const [problema, setProblema] = React.useState<string | null>(null);
    const [subiendo, setSubiendo] = React.useState(false);

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        setProblema(null);
        try {
            setSubiendo(true);
            // La foto necesita conexión (la redibuja el servidor); sin ella, el
            // gasto se anota igual y queda pendiente sin factura.
            const comprobanteId = foto ? await subirComprobante(foto).catch(() => null) : null;
            const r = await crear.mutateAsync({
                concepto,
                categoria,
                fecha,
                proveedor: proveedor || null,
                notas: notas || null,
                monto: dineroDelGasto.monto,
                moneda: dineroDelGasto.moneda,
                tasa: dineroDelGasto.moneda === monedas.base ? null : dineroDelGasto.tasa,
                comprobanteId,
            });
            if (esPendiente(r)) toast('Sin conexión: el gasto quedó pendiente ⏱ y se anota solo al volver.', { id: 'pendiente' });
            else toast.success('Gasto anotado');
            alCerrar();
        } catch (err) {
            setProblema(errorDe(err, 'No se pudo anotar el gasto'));
        } finally {
            setSubiendo(false);
        }
    };

    if (!abierto) return null;
    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Anotar un gasto</DialogTitle>
                    <DialogDescription>Lo que el liceo compró o pagó: sale de los fondos disponibles.</DialogDescription>
                </DialogHeader>
                <form onSubmit={enviar} className="space-y-4">
                    <label className="block text-sm font-medium text-gray-800">
                        ¿Qué fue?
                        <input required minLength={2} maxLength={120} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej.: tablero de básquet" className={campo} />
                    </label>
                    <div>
                        <span className="text-sm font-medium text-gray-800">Categoría</span>
                        <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Categoría">
                            {categorias.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    role="radio"
                                    aria-checked={categoria === c}
                                    onClick={() => setCategoria(c)}
                                    className={cn('min-h-[44px] rounded-lg border px-3 text-sm', categoria === c ? 'border-indigo-600 bg-indigo-600 font-semibold text-white' : 'border-gray-300 bg-white text-gray-800')}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>
                    <CampoDeDinero valor={dineroDelGasto} alCambiar={setDinero} base={monedas.base} monedas={monedas.aceptadas} rotulo="Cuánto costó" />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-medium text-gray-800">
                            Fecha
                            <input required type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
                        </label>
                        <label className="text-sm font-medium text-gray-800">
                            A quién se le pagó (opcional)
                            <input maxLength={120} value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={campo} />
                        </label>
                    </div>
                    <label className="block text-sm font-medium text-gray-800">
                        Notas (opcional)
                        <textarea maxLength={300} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className={campo} />
                    </label>
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50">
                        <Camera className="h-4 w-4 text-indigo-600" aria-hidden />
                        {foto ? `Factura: ${foto.name}` : 'Foto de la factura (opcional)'}
                        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
                    </label>
                    {problema && (
                        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {problema}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="contorno" onClick={alCerrar}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={subiendo || !concepto || !dineroDelGasto.monto}>
                            {subiendo ? <Loader2 className="animate-spin" aria-hidden /> : <ShoppingCart aria-hidden />}
                            Anotar gasto
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Agregar fondos ─────────────────────────────────────────────────────────

export function FormularioDeFondo({
    abierto,
    alCerrar,
    monedas,
    conceptoInicial = 'DONACION',
}: {
    abierto: boolean;
    alCerrar: () => void;
    monedas: Monedas;
    conceptoInicial?: Fondo['concepto'];
}) {
    const hoy = useSchoolToday();
    const crear = useCrearFondo();
    const [concepto, setConcepto] = React.useState<Fondo['concepto']>(conceptoInicial);
    const [descripcion, setDescripcion] = React.useState('');
    const [fecha, setFecha] = React.useState(hoy);
    const [dineroDelFondo, setDinero] = React.useState<Dinero>({ monto: '', moneda: monedas.base, tasa: '' });
    const [problema, setProblema] = React.useState<string | null>(null);
    React.useEffect(() => setConcepto(conceptoInicial), [conceptoInicial]);

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        setProblema(null);
        try {
            const r = await crear.mutateAsync({
                concepto,
                descripcion: descripcion || null,
                fecha,
                monto: dineroDelFondo.monto,
                moneda: dineroDelFondo.moneda,
                tasa: dineroDelFondo.moneda === monedas.base ? null : dineroDelFondo.tasa,
            });
            if (esPendiente(r)) toast('Sin conexión: quedó pendiente ⏱ y se anota solo al volver.', { id: 'pendiente' });
            else toast.success('Fondos agregados');
            alCerrar();
        } catch (err) {
            setProblema(errorDe(err, 'No se pudieron agregar los fondos'));
        }
    };

    if (!abierto) return null;
    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Agregar fondos</DialogTitle>
                    <DialogDescription>Dinero que entra al liceo y no es una cuota: el saldo con que se empieza, una donación, otro ingreso.</DialogDescription>
                </DialogHeader>
                <form onSubmit={enviar} className="space-y-4">
                    <div>
                        <span className="text-sm font-medium text-gray-800">¿Qué es?</span>
                        <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Qué es">
                            {(Object.keys(CONCEPTO_DE_FONDO) as Fondo['concepto'][]).map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    role="radio"
                                    aria-checked={concepto === c}
                                    onClick={() => setConcepto(c)}
                                    className={cn('min-h-[44px] rounded-lg border px-3 text-sm', concepto === c ? 'border-indigo-600 bg-indigo-600 font-semibold text-white' : 'border-gray-300 bg-white text-gray-800')}
                                >
                                    {CONCEPTO_DE_FONDO[c]}
                                </button>
                            ))}
                        </div>
                        {concepto === 'SALDO_INICIAL' && (
                            <p className="mt-1 text-xs text-gray-600">Lo que el liceo tiene hoy, antes de anotar nada en el sistema. Se pone una vez.</p>
                        )}
                    </div>
                    <CampoDeDinero valor={dineroDelFondo} alCambiar={setDinero} base={monedas.base} monedas={monedas.aceptadas} />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-medium text-gray-800">
                            Fecha
                            <input required type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
                        </label>
                        <label className="text-sm font-medium text-gray-800">
                            Descripción (opcional)
                            <input maxLength={200} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: rifa de diciembre" className={campo} />
                        </label>
                    </div>
                    {problema && (
                        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {problema}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="contorno" onClick={alCerrar}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={crear.isPending || !dineroDelFondo.monto}>
                            {crear.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <PiggyBank aria-hidden />}
                            Agregar fondos
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Anular (con motivo) ────────────────────────────────────────────────────

function Anular({ alAnular, ocupado }: { alAnular: (motivo: string) => Promise<void>; ocupado: boolean }) {
    const [abierto, setAbierto] = React.useState(false);
    const [motivo, setMotivo] = React.useState('');
    if (!abierto) {
        return (
            <button
                type="button"
                onClick={() => setAbierto(true)}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
                <Ban className="h-3.5 w-3.5" aria-hidden />
                Anular
            </button>
        );
    }
    return (
        <form
            className="flex w-full flex-wrap gap-2"
            onSubmit={async (e) => {
                e.preventDefault();
                await alAnular(motivo);
                setAbierto(false);
            }}
        >
            <label className="min-w-[12rem] flex-1 text-xs font-medium text-gray-700">
                Motivo de la anulación (queda a la vista)
                <input autoFocus required minLength={3} maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={cn(campo, 'mt-0.5')} />
            </label>
            <button type="submit" disabled={ocupado} className="min-h-[44px] self-end rounded-lg bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
                Anular
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="min-h-[44px] self-end rounded-lg px-3 text-sm text-gray-700 hover:bg-gray-100">
                Cancelar
            </button>
        </form>
    );
}

// ─── La vista ───────────────────────────────────────────────────────────────

export function VistaDeGastosYFondos({ ciclo, monedas, cerrado }: { ciclo: string | null; monedas: Monedas; cerrado: boolean }) {
    const { data: g, isLoading: cargandoGastos } = useGastos(true, ciclo);
    const { data: fondos = [], isLoading: cargandoFondos } = useFondos(true, ciclo);
    const anularGasto = useAnularGasto();
    const anularFondo = useAnularFondo();
    const [anotando, setAnotando] = React.useState(false);
    const [agregando, setAgregando] = React.useState(false);
    const fmt = (n: string | number) => dinero(n, monedas.base);
    const gastos = g?.gastos ?? [];
    const total = gastos.filter((x) => !x.anuladoEn).reduce((t, x) => t + Number(x.montoBase), 0);

    const anularCon = (hacer: typeof anularGasto, id: string) => async (motivo: string) => {
        try {
            await hacer.mutateAsync({ id, motivo });
            toast.success('Anulado');
        } catch (err) {
            toast.error(errorDe(err, 'No se pudo anular'));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
                <Button onClick={() => setAnotando(true)}>
                    <ShoppingCart aria-hidden />
                    Anotar un gasto
                </Button>
                <Button variant="contorno" onClick={() => setAgregando(true)}>
                    <PiggyBank aria-hidden />
                    Agregar fondos
                </Button>
            </div>

            <section aria-labelledby="titulo-gastos" className="space-y-2">
                <h2 id="titulo-gastos" className="flex flex-wrap items-baseline gap-x-2 text-lg font-bold text-gray-900">
                    Gastos del ciclo <span className="text-sm font-semibold text-gray-600">{fmt(total)}</span>
                </h2>
                {cargandoGastos ? (
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600" aria-label="Cargando" />
                ) : gastos.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
                        <Receipt className="mx-auto h-8 w-8 text-gray-400" aria-hidden />
                        <p className="mt-2 text-sm text-gray-700">Todavía no hay gastos en este ciclo.</p>
                        <Button className="mt-3" variant="contorno" onClick={() => setAnotando(true)}>
                            <Plus aria-hidden />
                            Anotar el primero
                        </Button>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
                        {gastos.map((x: Gasto) => (
                            <li key={x.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3', x.anuladoEn && 'bg-gray-50')}>
                                <div className="min-w-0 flex-1">
                                    <p className={cn('break-words text-sm font-semibold', x.anuladoEn ? 'text-gray-500 line-through' : 'text-gray-900')}>{x.concepto}</p>
                                    <p className="text-xs text-gray-600">
                                        {fechaCorta(x.fecha)} · {x.categoria}
                                        {x.proveedor ? ` · ${x.proveedor}` : ''}
                                    </p>
                                    {x.anuladoEn && <p className="text-xs font-semibold text-red-800">Anulado: {x.motivoAnulacion}</p>}
                                </div>
                                <span className="text-sm font-bold tabular-nums text-gray-900">{fmt(x.montoBase)}</span>
                                {x.comprobanteId && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            // La imagen se pide con la sesión: no es una dirección pública.
                                            const { default: api } = await import('@/lib/axios');
                                            const r = await api.get(`/finanzas/comprobantes/${x.comprobanteId}`, { responseType: 'blob' });
                                            window.open(URL.createObjectURL(r.data as Blob), '_blank', 'noopener');
                                        }}
                                        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                    >
                                        <Receipt className="h-3.5 w-3.5" aria-hidden />
                                        Ver factura
                                    </button>
                                )}
                                {!x.anuladoEn && !cerrado && <Anular alAnular={anularCon(anularGasto, x.id)} ocupado={anularGasto.isPending} />}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section aria-labelledby="titulo-fondos" className="space-y-2">
                <h2 id="titulo-fondos" className="text-lg font-bold text-gray-900">
                    Fondos agregados en el ciclo
                </h2>
                <p className="text-sm text-gray-600">Lo que entró y no es una cuota. Las cuotas cobradas están en «Estudiantes».</p>
                {cargandoFondos ? (
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600" aria-label="Cargando" />
                ) : fondos.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-700">Ninguno todavía.</p>
                ) : (
                    <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
                        {fondos.map((f) => (
                            <li key={f.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3', f.anuladoEn && 'bg-gray-50')}>
                                <div className="min-w-0 flex-1">
                                    <p className={cn('text-sm font-semibold', f.anuladoEn ? 'text-gray-500 line-through' : 'text-gray-900')}>
                                        {CONCEPTO_DE_FONDO[f.concepto]}
                                        {f.descripcion ? ` · ${f.descripcion}` : ''}
                                    </p>
                                    <p className="text-xs text-gray-600">{fechaCorta(f.fecha)}</p>
                                    {f.anuladoEn && <p className="text-xs font-semibold text-red-800">Anulado: {f.motivoAnulacion}</p>}
                                </div>
                                <span className="text-sm font-bold tabular-nums text-emerald-800">+{fmt(f.montoBase)}</span>
                                {!f.anuladoEn && !cerrado && <Anular alAnular={anularCon(anularFondo, f.id)} ocupado={anularFondo.isPending} />}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <FormularioDeGasto abierto={anotando} alCerrar={() => setAnotando(false)} categorias={g?.categorias ?? ['Otro']} monedas={monedas} />
            <FormularioDeFondo abierto={agregando} alCerrar={() => setAgregando(false)} monedas={monedas} />
        </div>
    );
}

export default VistaDeGastosYFondos;
