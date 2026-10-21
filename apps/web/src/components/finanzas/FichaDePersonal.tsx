'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Clock3, Gift, Loader2, Lock, Palmtree, Receipt, Save, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { campo } from '@/components/finanzas/CampoDeDinero';
import {
    ESTADO_DE_PAGO_AL_PERSONAL,
    FRECUENCIA,
    useEditarPersona,
    useGuardarAcuerdo,
    type FichaDePersonal as Ficha,
    type FrecuenciaDelPersonal,
} from '@/hooks/useFinanzas';
import { dinero, errorDe, type Moneda } from '@/hooks/usePagos';

import { abrirComprobante } from '@/lib/comprobante-abierto';
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
    const r = ficha.persona.resumen;

    return (
        <div className="min-w-0 space-y-6">
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
                    <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Lo del ciclo</h3>
                    {/* Solo se mira: pagar va por «Registrar pago» (Nuevo movimiento), que
                        empieza por lo más viejo que se le debe. */}
                    <ul aria-label="Pagos del ciclo" className="divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200">
                        {ficha.debidos.map((d) => {
                            const e = ESTADO_DE_PAGO_AL_PERSONAL[d.estado];
                            const Icono = d.tipo === 'BONO' ? Gift : d.estado === 'PAGADO' ? CheckCircle2 : d.estado === 'VENCIDO' ? AlertTriangle : Clock3;
                            return (
                                <li key={d.clave} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
                                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', e.clases)}>
                                        <Icono className="h-4 w-4" aria-hidden />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[15px] text-gray-900">{d.etiqueta}</span>
                                        <span className="block text-sm text-gray-600">
                                            {d.estado === 'ABONADO' ? `Abonado ${fmt(d.pagado)}` : `Se paga el ${fechaCorta(d.fecha)}`}
                                            {d.vacaciones && d.tipo === 'SUELDO' ? ' · vacaciones' : ''}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <span className="block text-[15px] font-semibold tabular-nums text-gray-900">{fmt(d.monto)}</span>
                                        <span className={cn('block text-xs font-semibold', d.estado === 'VENCIDO' ? 'text-red-700' : d.estado === 'PAGADO' ? 'text-emerald-700' : 'text-gray-600')}>
                                            {e.texto}
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            <section>
                <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Pagos hechos</h3>
                {ficha.pagos.length === 0 ? (
                    <p className="text-sm text-gray-600">Todavía no se le ha pagado nada en este ciclo.</p>
                ) : (
                    <ul className="divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200">
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

function PagoHecho({ pago, editable }: { pago: Ficha['pagos'][number]; base: Moneda; editable: boolean }) {
    const concepto = pago.asignaciones.map((a) => a.etiqueta).join(', ');
    return (
        <li>
            <button
                type="button"
                onClick={() => abrirComprobante({ tipo: 'personal', id: pago.id, editable })}
                aria-label={`Comprobante Nº ${String(pago.numero).padStart(6, '0')}`}
                className={cn('flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-gray-100', pago.anulado && 'opacity-70')}
            >
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', pago.anulado ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700')}>
                    <Receipt className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                    <span className={cn('block text-[15px] font-semibold tabular-nums', pago.anulado ? 'text-gray-500 line-through' : 'text-gray-900')}>
                        {dinero(pago.monto, pago.moneda)} <span className="font-normal text-gray-600">· {pago.metodo}</span>
                    </span>
                    <span className="block truncate text-sm text-gray-600">
                        {fechaCorta(pago.fecha)}{concepto ? ` · ${concepto}` : ''}
                    </span>
                </span>
                <span className="shrink-0 text-right text-xs text-gray-500">
                    {pago.anulado ? <span className="font-semibold text-red-700">Anulado</span> : `Nº ${String(pago.numero).padStart(6, '0')}`}
                </span>
            </button>
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
