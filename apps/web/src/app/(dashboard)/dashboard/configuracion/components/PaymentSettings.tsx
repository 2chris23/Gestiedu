'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Save, X, Wallet } from 'lucide-react';
import { ConfiguracionDePagos, errorDe, useGuardarConfiguracionDePagos, usePagosActivos } from '@/hooks/usePagos';
import { cn } from '@/lib/utils';

/**
 * CONFIGURACIÓN DE PAGOS
 *
 * Al activarlo aparece "Pagos" en el menú del administrador. Todo lo del cobro
 * se decide aquí: cada cuánto, qué día, cuánto, en qué moneda y cómo se paga.
 */

const inicial: ConfiguracionDePagos = {
    enabled: false,
    frequency: 'MONTHLY',
    dueMode: 'SAME_DAY',
    dueDay: 5,
    graceDays: 0,
    baseCurrency: 'USD',
    acceptedCurrencies: 'BOTH',
    feeAmount: '0',
    enrollmentEnabled: false,
    enrollmentAmount: '0',
    methods: ['Efectivo', 'Pago Móvil', 'Transferencia', 'Zelle'],
};

const campo = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-100';
const rotulo = 'block text-sm font-medium text-gray-800';
const ayuda = 'mt-1 text-xs text-gray-600';

function Opciones<T extends string>({ valor, opciones, alCambiar }: { valor: T; opciones: Array<{ valor: T; texto: string }>; alCambiar: (v: T) => void }) {
    return (
        <div className="mt-1 flex flex-wrap gap-2" role="radiogroup">
            {opciones.map((o) => (
                <button
                    key={o.valor}
                    type="button"
                    role="radio"
                    aria-checked={valor === o.valor}
                    onClick={() => alCambiar(o.valor)}
                    className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        valor === o.valor ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                    )}
                >
                    {o.texto}
                </button>
            ))}
        </div>
    );
}

export function PaymentSettings() {
    const { data, isLoading } = usePagosActivos();
    const guardar = useGuardarConfiguracionDePagos();
    const [c, setC] = useState<ConfiguracionDePagos>(inicial);
    const [nuevoMetodo, setNuevoMetodo] = useState('');

    useEffect(() => {
        if (data && 'frequency' in data) setC({ ...inicial, ...(data as ConfiguracionDePagos) });
    }, [data]);

    const cambiar = <K extends keyof ConfiguracionDePagos>(k: K, v: ConfiguracionDePagos[K]) => setC((x) => ({ ...x, [k]: v }));
    const simbolo = c.baseCurrency === 'USD' ? '$' : 'Bs';

    const agregarMetodo = () => {
        const m = nuevoMetodo.trim();
        if (m.length < 2 || c.methods.includes(m)) return;
        cambiar('methods', [...c.methods, m]);
        setNuevoMetodo('');
    };

    const enviar = async () => {
        try {
            await guardar.mutateAsync({
                ...c,
                feeAmount: c.feeAmount === '' ? 0 : c.feeAmount,
                enrollmentAmount: c.enrollmentAmount === '' ? 0 : c.enrollmentAmount,
            });
            toast.success(c.enabled ? 'Pagos configurados. "Pagos" ya está en el menú.' : 'Configuración de pagos guardada');
        } catch (e) {
            toast.error(errorDe(e, 'No se pudo guardar'));
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="max-w-3xl space-y-8">
            <label className="flex cursor-pointer items-start gap-4 rounded-xl border border-gray-200 p-4">
                <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) => cambiar('enabled', e.target.checked)}
                    className="mt-1 h-5 w-5 accent-indigo-600"
                />
                <span>
                    <span className="flex items-center gap-2 text-base font-semibold text-gray-900">
                        <Wallet size={18} /> Activar control de pagos
                    </span>
                    <span className={ayuda}>
                        Aparece «Pagos» en el menú del administrador, con los estudiantes del ciclo actual. Los representantes ven el estado de pago de sus representados.
                    </span>
                </span>
            </label>

            <fieldset disabled={!c.enabled} className="space-y-6 disabled:opacity-60">
                <div>
                    <span className={rotulo}>¿Cada cuánto se cobra?</span>
                    <Opciones
                        valor={c.frequency}
                        alCambiar={(v) => cambiar('frequency', v)}
                        opciones={[
                            { valor: 'MONTHLY', texto: 'Mensual' },
                            { valor: 'BIWEEKLY', texto: 'Quincenal' },
                            { valor: 'PER_PERIOD', texto: 'Por lapso' },
                        ]}
                    />
                    <p className={ayuda}>
                        {c.frequency === 'MONTHLY' && 'Una cuota por mes, del mes en que empieza el ciclo al mes en que termina.'}
                        {c.frequency === 'BIWEEKLY' && 'Dos cuotas por mes: el día de pago y 15 días después.'}
                        {c.frequency === 'PER_PERIOD' && 'Una cuota por lapso, que vence al empezar el lapso.'}
                    </p>
                </div>

                {c.frequency !== 'PER_PERIOD' && (
                    <div>
                        <span className={rotulo}>¿Qué día se paga?</span>
                        <Opciones
                            valor={c.dueMode}
                            alCambiar={(v) => cambiar('dueMode', v)}
                            opciones={[
                                { valor: 'SAME_DAY', texto: 'Todos el mismo día' },
                                { valor: 'PER_STUDENT', texto: 'Cada estudiante su día' },
                            ]}
                        />
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <label className={rotulo}>
                                {c.dueMode === 'SAME_DAY' ? 'Día del mes' : 'Día por defecto (se cambia en cada estudiante)'}
                                <input type="number" min={1} max={28} value={c.dueDay} onChange={(e) => cambiar('dueDay', Number(e.target.value))} className={campo} />
                            </label>
                            <label className={rotulo}>
                                Días de gracia
                                <input type="number" min={0} max={60} value={c.graceDays} onChange={(e) => cambiar('graceDays', Number(e.target.value))} className={campo} />
                                <span className={ayuda}>Días después del vencimiento antes de contar como deuda.</span>
                            </label>
                        </div>
                    </div>
                )}

                {c.frequency === 'PER_PERIOD' && (
                    <label className={cn(rotulo, 'max-w-xs')}>
                        Días de gracia
                        <input type="number" min={0} max={60} value={c.graceDays} onChange={(e) => cambiar('graceDays', Number(e.target.value))} className={campo} />
                        <span className={ayuda}>Días después de empezar el lapso antes de contar como deuda.</span>
                    </label>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <span className={rotulo}>Moneda de las cuotas</span>
                        <Opciones
                            valor={c.baseCurrency}
                            alCambiar={(v) => setC((x) => ({ ...x, baseCurrency: v, acceptedCurrencies: x.acceptedCurrencies === 'BOTH' ? 'BOTH' : v }))}
                            opciones={[
                                { valor: 'USD', texto: 'Dólares ($)' },
                                { valor: 'VES', texto: 'Bolívares (Bs)' },
                            ]}
                        />
                    </div>
                    <div>
                        <span className={rotulo}>Se aceptan pagos en</span>
                        <Opciones
                            valor={c.acceptedCurrencies}
                            alCambiar={(v) => cambiar('acceptedCurrencies', v)}
                            opciones={[
                                { valor: c.baseCurrency, texto: c.baseCurrency === 'USD' ? 'Solo dólares' : 'Solo bolívares' },
                                { valor: 'BOTH', texto: 'Ambas' },
                            ]}
                        />
                        {c.acceptedCurrencies === 'BOTH' && <p className={ayuda}>Al cobrar en la otra moneda se pide la tasa del día.</p>}
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className={rotulo}>
                        Monto de cada cuota ({simbolo})
                        <input type="number" min={0} step="0.01" inputMode="decimal" value={c.feeAmount} onChange={(e) => cambiar('feeAmount', e.target.value)} className={campo} />
                    </label>
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                            <input type="checkbox" checked={c.enrollmentEnabled} onChange={(e) => cambiar('enrollmentEnabled', e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                            Cobrar inscripción
                        </label>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            inputMode="decimal"
                            aria-label={`Monto de la inscripción (${simbolo})`}
                            disabled={!c.enrollmentEnabled}
                            value={c.enrollmentAmount}
                            onChange={(e) => cambiar('enrollmentAmount', e.target.value)}
                            className={campo}
                        />
                    </div>
                </div>

                <div>
                    <span className={rotulo}>Métodos de pago</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {c.methods.map((m) => (
                            <span key={m} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 py-1 pl-3 pr-1 text-sm text-gray-800">
                                {m}
                                <button
                                    type="button"
                                    aria-label={`Quitar ${m}`}
                                    onClick={() => cambiar('methods', c.methods.filter((x) => x !== m))}
                                    className="rounded-full p-1 text-gray-600 hover:bg-gray-200"
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                        <input
                            value={nuevoMetodo}
                            maxLength={30}
                            onChange={(e) => setNuevoMetodo(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarMetodo())}
                            placeholder="Otro método (ej.: Binance)"
                            className={cn(campo, 'mt-0')}
                        />
                        <button type="button" onClick={agregarMetodo} className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50">
                            <Plus size={14} /> Añadir
                        </button>
                    </div>
                </div>
            </fieldset>

            <div className="flex justify-end border-t border-gray-200 pt-4">
                <button
                    type="button"
                    onClick={enviar}
                    disabled={guardar.isPending}
                    className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                    {guardar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Guardar
                </button>
            </div>
        </div>
    );
}
