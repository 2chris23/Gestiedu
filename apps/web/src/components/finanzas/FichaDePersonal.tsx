'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Ban, Check, CheckCircle2, Clock3, Download, FileText, Gift, Loader2, Lock, Palmtree, Receipt, Save, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CampoDeDinero, campo, type Dinero } from '@/components/finanzas/CampoDeDinero';
import {
    ESTADO_DE_PAGO_AL_PERSONAL,
    FRECUENCIA,
    useAnularPagoAlPersonal,
    useEditarPersona,
    useGuardarAcuerdo,
    usePagarAlPersonal,
    type FichaDePersonal as Ficha,
    type FrecuenciaDelPersonal,
} from '@/hooks/useFinanzas';
import { dinero, errorDe, type Moneda } from '@/hooks/usePagos';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { descargarReciboDelPersonal } from '@/lib/comprobante-de-pago';
import { nombreDelMes } from '@/lib/calendario-del-ciclo';
import { cn } from '@/lib/utils';

/**
 * LA FICHA DE UNA PERSONA DEL PERSONAL (2026-10-01)
 *
 * Arriba lo acordado (cuánto, cada cuánto, qué día, sus vacaciones). Debajo,
 * como en la ficha de un alumno, sus pagos del ciclo en baldosas: se tocan las
 * que se le pagan y se registra el pago, con su recibo. Y sus datos: el cargo,
 * si sigue activo y si se trae al ciclo siguiente.
 */

const fechaCorta = (ymd: string) => ymd.split('-').reverse().join('/');
const aCent = (v: string | number) => Math.round(Number(v) * 100);

export function FichaDePersonal({ ficha, ciclo }: { ficha: Ficha; ciclo: string | null }) {
    const cerrado = ficha.closed;
    const base = ficha.currency;
    const fmt = (n: string | number) => dinero(n, base);
    const [elegidos, setElegidos] = React.useState<Set<string>>(new Set());
    React.useEffect(() => setElegidos(new Set()), [ficha.persona.id]);
    const pendientes = ficha.debidos.filter((d) => aCent(d.pendiente) > 0);
    const r = ficha.persona.resumen;

    return (
        <div className="space-y-6">
            {cerrado && (
                <p className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                    <Lock className="h-4 w-4 shrink-0 text-gray-600" aria-hidden />
                    El ciclo {ficha.academicYear.name} está cerrado: se ve, no se cambia.
                </p>
            )}

            {r && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                    <span>
                        Pagado <strong className="text-gray-900">{fmt(r.pagado)}</strong> de {fmt(r.total)}
                    </span>
                    {Number(r.vencido) > 0 && (
                        <span className="inline-flex items-center gap-1 font-semibold text-red-800">
                            <AlertTriangle className="h-4 w-4" aria-hidden />
                            Atrasado {fmt(r.vencido)}
                        </span>
                    )}
                    {r.proximo && (
                        <span>
                            Próximo: {r.proximo.etiqueta}, el {fechaCorta(r.proximo.fecha)}
                        </span>
                    )}
                </div>
            )}

            <Acordado ficha={ficha} ciclo={ciclo} />

            {ficha.persona.acuerdo && (
                <section>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">Sus pagos del ciclo</h3>
                        {!cerrado && pendientes.length > 0 && (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setElegidos(new Set(pendientes.filter((d) => d.estado === 'VENCIDO').map((d) => d.clave)))}
                                    className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                                >
                                    Los atrasados
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setElegidos(new Set(pendientes.slice(0, 1).map((d) => d.clave)))}
                                    className="min-h-[44px] rounded-lg border border-indigo-300 bg-indigo-50 px-3 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                                >
                                    El próximo
                                </button>
                            </div>
                        )}
                    </div>
                    {!cerrado && pendientes.length > 0 && <p className="mb-2 text-xs text-gray-600">Toca lo que se le paga para elegirlo.</p>}
                    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Pagos del ciclo">
                        {ficha.debidos.map((d) => {
                            const e = ESTADO_DE_PAGO_AL_PERSONAL[d.estado];
                            const sePuede = !cerrado && aCent(d.pendiente) > 0;
                            const elegido = elegidos.has(d.clave);
                            const Icono = d.tipo === 'BONO' ? Gift : d.estado === 'PAGADO' ? CheckCircle2 : d.estado === 'VENCIDO' ? AlertTriangle : Clock3;
                            const contenido = (
                                <>
                                    <span className="flex items-start justify-between gap-1">
                                        <span className="min-w-0 break-words text-sm font-bold leading-tight text-gray-900">{d.etiqueta}</span>
                                        {elegido && <Check className="h-4 w-4 shrink-0 text-indigo-700" aria-hidden />}
                                    </span>
                                    <span className="text-sm font-semibold tabular-nums text-gray-900">{fmt(d.monto)}</span>
                                    <span className={cn('inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold', e.clases)}>
                                        <Icono className="h-3.5 w-3.5" aria-hidden />
                                        {e.texto}
                                    </span>
                                    <span className="text-xs text-gray-600">
                                        {d.estado === 'ABONADO' ? `Abonado ${fmt(d.pagado)}` : `Se paga el ${fechaCorta(d.fecha)}`}
                                        {d.vacaciones && d.tipo === 'SUELDO' ? ' · vacaciones' : ''}
                                    </span>
                                </>
                            );
                            const clases = cn(
                                'flex h-full min-h-[44px] w-full flex-col gap-1 rounded-xl border p-2 text-left',
                                elegido ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-gray-200 bg-white',
                                sePuede && !elegido && 'hover:bg-gray-50'
                            );
                            return (
                                <li key={d.clave}>
                                    {sePuede ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setElegidos((s) => {
                                                    const n = new Set(s);
                                                    n.has(d.clave) ? n.delete(d.clave) : n.add(d.clave);
                                                    return n;
                                                })
                                            }
                                            aria-pressed={elegido}
                                            aria-label={`${d.etiqueta}, ${e.texto}, ${fmt(d.pendiente)} por pagar. ${elegido ? 'Elegido' : 'Tocar para elegirlo'}`}
                                            className={clases}
                                        >
                                            {contenido}
                                        </button>
                                    ) : (
                                        <div className={cn(clases, 'bg-gray-50/60')}>{contenido}</div>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </section>
            )}

            {!cerrado && elegidos.size > 0 && <Pagar ficha={ficha} ciclo={ciclo} elegidos={[...elegidos]} alTerminar={() => setElegidos(new Set())} />}

            <section>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">Pagos hechos</h3>
                {ficha.pagos.length === 0 ? (
                    <p className="text-sm text-gray-600">Todavía no se le ha pagado nada en este ciclo.</p>
                ) : (
                    <ul className="space-y-2">
                        {ficha.pagos.map((p) => (
                            <PagoHecho key={p.id} pago={p} base={base} editable={!cerrado} />
                        ))}
                    </ul>
                )}
            </section>

            <SusDatos ficha={ficha} />
        </div>
    );
}

// ─── Lo acordado ────────────────────────────────────────────────────────────

function Acordado({ ficha, ciclo }: { ficha: Ficha; ciclo: string | null }) {
    const a = ficha.persona.acuerdo;
    const guardar = useGuardarAcuerdo(ciclo);
    const [monto, setMonto] = React.useState(a?.monto ?? '');
    const [frecuencia, setFrecuencia] = React.useState<FrecuenciaDelPersonal>(a?.frecuencia ?? 'MENSUAL');
    const [dia, setDia] = React.useState(a?.diaDePago?.toString() ?? '');
    const [fechaUnica, setFechaUnica] = React.useState(a?.fechaUnica ?? '');
    const [vacaciones, setVacaciones] = React.useState<'LICEO' | 'SI' | 'NO'>(a?.cobraEnVacaciones == null ? 'LICEO' : a.cobraEnVacaciones ? 'SI' : 'NO');
    const [bono, setBono] = React.useState(a?.bonoVacacional ?? '');
    const [fechaBono, setFechaBono] = React.useState(a?.fechaBono ?? '');
    const [problema, setProblema] = React.useState<string | null>(null);
    const n = ficha.nomina;
    const diaDelLiceo = n.diaDePago >= 31 ? 'el último del mes' : `el día ${n.diaDePago}`;
    const vacacionesDelLiceo = n.mesesDeVacaciones.length ? n.mesesDeVacaciones.map(nombreDelMes).join(', ') : 'ninguno';

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        setProblema(null);
        try {
            await guardar.mutateAsync({
                id: ficha.persona.id,
                monto,
                frecuencia,
                diaDePago: frecuencia === 'MENSUAL' && dia ? Number(dia) : null,
                fechaUnica: frecuencia === 'UNICO' ? fechaUnica : null,
                cobraEnVacaciones: vacaciones === 'LICEO' ? null : vacaciones === 'SI',
                bonoVacacional: bono === '' ? null : bono,
                fechaBono: fechaBono || null,
            });
            toast.success('Guardado');
        } catch (err) {
            setProblema(errorDe(err, 'No se pudo guardar'));
        }
    };

    return (
        <form onSubmit={enviar} className="space-y-4 rounded-xl border border-gray-200 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-700">
                <Wallet className="h-4 w-4 text-indigo-600" aria-hidden />
                Lo acordado en este ciclo
            </h3>
            {!a && <p className="text-sm text-amber-900">Sin sueldo fijado todavía: ponle cuánto y cada cuánto se le paga.</p>}
            <div>
                <span className="text-sm font-medium text-gray-800">Cada cuánto se le paga</span>
                <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Cada cuánto se le paga">
                    {(['MENSUAL', 'QUINCENAL', 'UNICO'] as FrecuenciaDelPersonal[]).map((f) => (
                        <button
                            key={f}
                            type="button"
                            role="radio"
                            aria-checked={frecuencia === f}
                            disabled={ficha.closed}
                            onClick={() => setFrecuencia(f)}
                            className={cn('min-h-[44px] rounded-lg border px-3 text-sm', frecuencia === f ? 'border-indigo-600 bg-indigo-600 font-semibold text-white' : 'border-gray-300 bg-white text-gray-800')}
                        >
                            {FRECUENCIA[f]}
                        </button>
                    ))}
                </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-gray-800">
                    {frecuencia === 'QUINCENAL' ? 'Cuánto en cada quincena' : frecuencia === 'UNICO' ? 'Cuánto' : 'Cuánto al mes'} ({ficha.currency === 'USD' ? '$' : 'Bs'})
                    <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={monto} disabled={ficha.closed} onChange={(e) => setMonto(e.target.value)} className={campo} />
                </label>
                {frecuencia === 'MENSUAL' && (
                    <label className="text-sm font-medium text-gray-800">
                        Su día de pago (opcional)
                        <input type="number" min={1} max={31} value={dia} disabled={ficha.closed} onChange={(e) => setDia(e.target.value)} placeholder={`El del liceo: ${diaDelLiceo}`} className={campo} />
                        <span className="mt-1 block text-xs text-gray-600">Vacío = {diaDelLiceo}. 31 = el último día de cada mes.</span>
                    </label>
                )}
                {frecuencia === 'QUINCENAL' && <p className="self-end text-xs text-gray-600">Se le paga el 15 y el último día de cada mes.</p>}
                {frecuencia === 'UNICO' && (
                    <label className="text-sm font-medium text-gray-800">
                        Fecha del pago
                        <input required type="date" value={fechaUnica} disabled={ficha.closed} onChange={(e) => setFechaUnica(e.target.value)} className={campo} />
                    </label>
                )}
            </div>
            {frecuencia !== 'UNICO' && (
                <fieldset className="space-y-3 rounded-lg bg-amber-50/50 p-3">
                    <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-gray-800">
                        <Palmtree className="h-4 w-4 text-amber-700" aria-hidden />
                        Vacaciones
                    </legend>
                    <p className="text-xs text-gray-700">Meses de vacaciones del liceo: {vacacionesDelLiceo}.</p>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="¿Cobra en vacaciones?">
                        {(
                            [
                                ['LICEO', `Como el liceo (${n.cobraEnVacaciones ? 'cobra' : 'no cobra'})`],
                                ['SI', 'Cobra en vacaciones'],
                                ['NO', 'No cobra en vacaciones'],
                            ] as const
                        ).map(([v, t]) => (
                            <button
                                key={v}
                                type="button"
                                role="radio"
                                aria-checked={vacaciones === v}
                                disabled={ficha.closed}
                                onClick={() => setVacaciones(v)}
                                className={cn('min-h-[44px] rounded-lg border px-3 text-sm', vacaciones === v ? 'border-amber-600 bg-amber-600 font-semibold text-white' : 'border-gray-300 bg-white text-gray-800')}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-medium text-gray-800">
                            Su bono vacacional (opcional)
                            <input type="number" min="0" step="0.01" inputMode="decimal" value={bono} disabled={ficha.closed} onChange={(e) => setBono(e.target.value)} placeholder={`El del liceo: ${dinero(n.bonoVacacional, ficha.currency)}`} className={campo} />
                        </label>
                        <label className="text-sm font-medium text-gray-800">
                            Fecha del bono (opcional)
                            <input type="date" value={fechaBono} disabled={ficha.closed} onChange={(e) => setFechaBono(e.target.value)} className={campo} />
                        </label>
                    </div>
                </fieldset>
            )}
            {problema && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {problema}
                </p>
            )}
            {!ficha.closed && (
                <div className="flex justify-end">
                    <Button type="submit" disabled={guardar.isPending || !monto}>
                        {guardar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                        Guardar lo acordado
                    </Button>
                </div>
            )}
        </form>
    );
}

// ─── Pagar ──────────────────────────────────────────────────────────────────

function Pagar({ ficha, ciclo, elegidos, alTerminar }: { ficha: Ficha; ciclo: string | null; elegidos: string[]; alTerminar: () => void }) {
    const hoy = useSchoolToday();
    const pagar = usePagarAlPersonal(ciclo);
    const base = ficha.currency;
    const monedas: Moneda[] = ficha.acceptedCurrencies === 'BOTH' ? ['USD', 'VES'] : [ficha.acceptedCurrencies];
    const falta = ficha.debidos.filter((d) => elegidos.includes(d.clave)).reduce((t, d) => t + aCent(d.pendiente), 0);
    const [d, setD] = React.useState<Dinero>({ monto: (falta / 100).toFixed(2), moneda: base, tasa: '' });
    const [metodo, setMetodo] = React.useState(ficha.methods[0] ?? '');
    const [fecha, setFecha] = React.useState(hoy);
    const [referencia, setReferencia] = React.useState('');
    const [problema, setProblema] = React.useState<string | null>(null);
    React.useEffect(() => setD((x) => (x.moneda === base ? { ...x, monto: (falta / 100).toFixed(2) } : x)), [falta, base]);

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        setProblema(null);
        try {
            const pago = await pagar.mutateAsync({
                id: ficha.persona.id,
                claves: elegidos,
                monto: d.monto,
                moneda: d.moneda,
                tasa: d.moneda === base ? null : d.tasa,
                metodo,
                fecha,
                referencia: referencia || null,
            });
            toast.success(`Pago registrado · recibo Nº ${String(pago.numero).padStart(6, '0')}`, {
                action: { label: 'Descargar', onClick: () => descargarReciboDelPersonal(pago.id, 'png') },
            });
            alTerminar();
        } catch (err) {
            setProblema(errorDe(err, 'No se pudo registrar el pago'));
        }
    };

    return (
        <form onSubmit={enviar} className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
            <p className="text-sm text-gray-800">
                {elegidos.length} {elegidos.length === 1 ? 'pago elegido' : 'pagos elegidos'} · falta <strong>{dinero(falta / 100, base)}</strong>
            </p>
            <CampoDeDinero valor={d} alCambiar={setD} base={base} monedas={monedas} rotulo="Cuánto se le paga" ayuda="Si es menos, queda como abono." />
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-gray-800">
                    Fecha del pago
                    <input required type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
                </label>
                <label className="text-sm font-medium text-gray-800">
                    Referencia (opcional)
                    <input maxLength={60} value={referencia} onChange={(e) => setReferencia(e.target.value)} className={campo} />
                </label>
            </div>
            <div>
                <span className="text-sm font-medium text-gray-800">Método</span>
                <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Método de pago">
                    {ficha.methods.map((m) => (
                        <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={metodo === m}
                            onClick={() => setMetodo(m)}
                            className={cn('min-h-[44px] rounded-lg border px-3 text-sm', metodo === m ? 'border-indigo-600 bg-indigo-600 font-semibold text-white' : 'border-gray-300 bg-white text-gray-800')}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>
            {problema && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {problema}
                </p>
            )}
            <div className="flex justify-end">
                <Button type="submit" disabled={pagar.isPending || !metodo || !d.monto}>
                    {pagar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
                    Registrar pago
                </Button>
            </div>
        </form>
    );
}

function PagoHecho({ pago, base, editable }: { pago: Ficha['pagos'][number]; base: Moneda; editable: boolean }) {
    const anular = useAnularPagoAlPersonal();
    const [anulando, setAnulando] = React.useState(false);
    const [motivo, setMotivo] = React.useState('');
    const [bajando, setBajando] = React.useState<null | 'png' | 'pdf'>(null);
    const bajar = async (f: 'png' | 'pdf') => {
        setBajando(f);
        try {
            await descargarReciboDelPersonal(pago.id, f);
        } catch (e) {
            toast.error(errorDe(e, 'No se pudo generar el recibo'));
        } finally {
            setBajando(null);
        }
    };
    return (
        <li className={cn('rounded-xl border px-3 py-2.5', pago.anulado ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white')}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Receipt size={16} className="text-gray-500" aria-hidden />
                <span className={cn('text-sm font-semibold', pago.anulado ? 'text-gray-500 line-through' : 'text-gray-900')}>
                    {dinero(pago.monto, pago.moneda)}
                    {pago.moneda !== base && <span className="font-normal text-gray-600"> ({dinero(pago.montoBase, base)})</span>}
                </span>
                <span className="text-sm text-gray-700">
                    {fechaCorta(pago.fecha)} · {pago.metodo}
                    {pago.referencia ? ` · Ref. ${pago.referencia}` : ''}
                </span>
                <span className="text-xs text-gray-600">Nº {String(pago.numero).padStart(6, '0')}</span>
                {pago.anulado && <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">Anulado: {pago.motivoAnulacion}</span>}
                <span className="ml-auto flex gap-1">
                    <button type="button" onClick={() => bajar('png')} disabled={!!bajando} aria-label="Recibo en imagen" title="Recibo en imagen" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100">
                        {bajando === 'png' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    </button>
                    <button type="button" onClick={() => bajar('pdf')} disabled={!!bajando} aria-label="Recibo en PDF" title="Recibo en PDF" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100">
                        {bajando === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                    </button>
                    {editable && !pago.anulado && (
                        <button type="button" onClick={() => setAnulando((v) => !v)} aria-label="Anular pago" title="Anular pago" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-red-700 hover:bg-red-50">
                            <Ban size={16} />
                        </button>
                    )}
                </span>
            </div>
            <p className="mt-1 text-xs text-gray-600">{pago.asignaciones.map((a) => `${a.etiqueta} (${dinero(a.monto, base)})`).join(' · ')}</p>
            {anulando && (
                <form
                    onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                            await anular.mutateAsync({ id: pago.id, motivo });
                            toast.success('Pago anulado: vuelve a los fondos');
                            setAnulando(false);
                        } catch (err) {
                            toast.error(errorDe(err, 'No se pudo anular'));
                        }
                    }}
                    className="mt-2 flex flex-wrap gap-2"
                >
                    <label className="min-w-[12rem] flex-1 text-xs font-medium text-gray-700">
                        Motivo de la anulación (queda a la vista)
                        <input autoFocus required minLength={3} maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={cn(campo, 'mt-0.5')} />
                    </label>
                    <button type="submit" disabled={anular.isPending} className="min-h-[44px] self-end rounded-lg bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
                        Anular
                    </button>
                </form>
            )}
        </li>
    );
}

// ─── Sus datos ──────────────────────────────────────────────────────────────

function SusDatos({ ficha }: { ficha: Ficha }) {
    const p = ficha.persona;
    const editar = useEditarPersona();
    const [cargo, setCargo] = React.useState(p.cargo);
    const [nombre, setNombre] = React.useState(p.nombre);
    const [activo, setActivo] = React.useState(p.activo);
    const [seQueda, setSeQueda] = React.useState(p.seQuedaParaProximosCiclos);
    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await editar.mutateAsync({ id: p.id, cargo, activo, seQuedaParaProximosCiclos: seQueda, ...(p.conCuenta ? {} : { nombre }) });
            toast.success('Guardado');
        } catch (err) {
            toast.error(errorDe(err, 'No se pudo guardar'));
        }
    };
    return (
        <form onSubmit={enviar} className="space-y-3 rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">Sus datos</h3>
            {p.conCuenta ? (
                <p className="text-xs text-gray-600">Tiene cuenta en el sistema: su nombre y su cédula se cambian en Usuarios.</p>
            ) : (
                <label className="block text-sm font-medium text-gray-800">
                    Nombre
                    <input required minLength={3} maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
                </label>
            )}
            <label className="block text-sm font-medium text-gray-800">
                Cargo
                <input required minLength={2} maxLength={60} value={cargo} onChange={(e) => setCargo(e.target.value)} className={campo} />
            </label>
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-5 w-5 accent-indigo-600" />
                Sigue trabajando en el liceo
            </label>
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={seQueda} onChange={(e) => setSeQueda(e.target.checked)} className="h-5 w-5 accent-indigo-600" />
                Traerlo al ciclo siguiente con lo mismo acordado
            </label>
            <div className="flex justify-end">
                <Button type="submit" variant="contorno" disabled={editar.isPending}>
                    {editar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                    Guardar sus datos
                </Button>
            </div>
        </form>
    );
}

export default FichaDePersonal;
