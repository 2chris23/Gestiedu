'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, X, Wallet } from 'lucide-react';
import { Ajustes, BotonGuardar, CargandoAjustes, Fila, FilaCampo, FilaInterruptor, Grupo, Opciones } from '@/components/configuracion/ajustes';
import { ConfiguracionDePagos, errorDe, useGuardarConfiguracionDePagos, usePagosActivos } from '@/hooks/usePagos';

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
    descuentoHermanosPct: 0,
    moraTipo: 'NINGUNA',
    moraValor: '0',
    moraDiasDespues: 0,
    recordatorioDiasAntes: 3,
};

const DE_LA_FRECUENCIA: Record<ConfiguracionDePagos['frequency'], string> = {
    MONTHLY: 'Una cuota por mes, del mes en que empieza el ciclo al mes en que termina.',
    BIWEEKLY: 'Dos cuotas por mes: el día de pago y 15 días después.',
    PER_PERIOD: 'Una cuota por lapso, que vence al empezar el lapso.',
};

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
                moraValor: c.moraTipo === 'NINGUNA' || !c.moraValor ? '0' : c.moraValor,
            });
            toast.success(c.enabled ? 'Pagos configurados. «Finanzas» ya está en el menú.' : 'Configuración de pagos guardada');
        } catch (e) {
            toast.error(errorDe(e, 'No se pudo guardar'));
        }
    };

    if (isLoading) return <CargandoAjustes />;

    const numero = (k: 'dueDay' | 'graceDays' | 'descuentoHermanosPct' | 'moraDiasDespues' | 'recordatorioDiasAntes') => (e: React.ChangeEvent<HTMLInputElement>) =>
        cambiar(k, Number(e.target.value));

    return (
        <Ajustes>
            <Grupo id="pagos-activos">
                <FilaInterruptor
                    icono={Wallet}
                    titulo="Control de pagos"
                    descripcion="Aparece «Finanzas» en el menú. Los representantes ven lo que deben sus representados."
                    checked={c.enabled}
                    onChange={(v) => cambiar('enabled', v)}
                />
            </Grupo>

            <fieldset disabled={!c.enabled} className="min-w-0 space-y-7 disabled:opacity-60">
                <Grupo id="cuotas" titulo="Las cuotas" pie={DE_LA_FRECUENCIA[c.frequency]}>
                    <Fila etiqueta="¿Cada cuánto se cobra?" apilada>
                        <Opciones
                            etiqueta="¿Cada cuánto se cobra?"
                            valor={c.frequency}
                            alCambiar={(v) => cambiar('frequency', v)}
                            opciones={[
                                { valor: 'MONTHLY', texto: 'Mensual' },
                                { valor: 'BIWEEKLY', texto: 'Quincenal' },
                                { valor: 'PER_PERIOD', texto: 'Por lapso' },
                            ]}
                        />
                    </Fila>
                    {c.frequency !== 'PER_PERIOD' && (
                        <Fila etiqueta="¿Qué día se paga?" apilada>
                            <Opciones
                                etiqueta="¿Qué día se paga?"
                                valor={c.dueMode}
                                alCambiar={(v) => cambiar('dueMode', v)}
                                opciones={[
                                    { valor: 'SAME_DAY', texto: 'Todos el mismo día' },
                                    { valor: 'PER_STUDENT', texto: 'Cada uno su día' },
                                ]}
                            />
                        </Fila>
                    )}
                    {c.frequency !== 'PER_PERIOD' && (
                        <FilaCampo
                            etiqueta={c.dueMode === 'SAME_DAY' ? 'Día del mes' : 'Día por defecto'}
                            ayuda={c.dueMode === 'SAME_DAY' ? undefined : 'Se cambia en la ficha de cada estudiante.'}
                            type="number"
                            min={1}
                            max={28}
                            value={c.dueDay}
                            onChange={numero('dueDay')}
                        />
                    )}
                    <FilaCampo
                        etiqueta="Días de gracia"
                        ayuda={c.frequency === 'PER_PERIOD' ? 'Desde que empieza el lapso, antes de contar como deuda.' : 'Desde el vencimiento, antes de contar como deuda.'}
                        type="number"
                        min={0}
                        max={60}
                        value={c.graceDays}
                        onChange={numero('graceDays')}
                    />
                    <FilaCampo
                        etiqueta={`Monto de cada cuota (${simbolo})`}
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={c.feeAmount}
                        onChange={(e) => cambiar('feeAmount', e.target.value)}
                    />
                    <FilaInterruptor titulo="Cobrar inscripción" checked={c.enrollmentEnabled} onChange={(v) => cambiar('enrollmentEnabled', v)} />
                    {c.enrollmentEnabled && (
                        <FilaCampo
                            etiqueta={`Monto de la inscripción (${simbolo})`}
                            type="number"
                            min={0}
                            step="0.01"
                            inputMode="decimal"
                            value={c.enrollmentAmount}
                            onChange={(e) => cambiar('enrollmentAmount', e.target.value)}
                        />
                    )}
                </Grupo>

                <Grupo id="monedas" titulo="Monedas" pie={c.acceptedCurrencies === 'BOTH' ? 'Al cobrar en la otra moneda se pone la tasa del BCV del día.' : undefined}>
                    <Fila etiqueta="Moneda de las cuotas" apilada>
                        <Opciones
                            etiqueta="Moneda de las cuotas"
                            valor={c.baseCurrency}
                            alCambiar={(v) => setC((x) => ({ ...x, baseCurrency: v, acceptedCurrencies: x.acceptedCurrencies === 'BOTH' ? 'BOTH' : v }))}
                            opciones={[
                                { valor: 'USD', texto: 'Dólares ($)' },
                                { valor: 'VES', texto: 'Bolívares (Bs)' },
                            ]}
                        />
                    </Fila>
                    <Fila etiqueta="Se aceptan pagos en" apilada>
                        <Opciones
                            etiqueta="Se aceptan pagos en"
                            valor={c.acceptedCurrencies}
                            alCambiar={(v) => cambiar('acceptedCurrencies', v)}
                            opciones={[
                                { valor: c.baseCurrency, texto: c.baseCurrency === 'USD' ? 'Solo dólares' : 'Solo bolívares' },
                                { valor: 'BOTH', texto: 'Ambas' },
                            ]}
                        />
                    </Fila>
                </Grupo>

                <Grupo id="descuentos" titulo="Descuentos, mora y recordatorio" pie="Las becas de cada estudiante se ponen en su ficha. El descuento es el mayor entre la beca y el de hermanos, nunca la suma.">
                    <FilaCampo
                        etiqueta="Descuento por hermanos"
                        ayuda="Desde el 2.º hijo del mismo representante. 0 = sin descuento."
                        sufijo="%"
                        type="number"
                        min={0}
                        max={100}
                        value={c.descuentoHermanosPct ?? 0}
                        onChange={numero('descuentoHermanosPct')}
                    />
                    <Fila etiqueta="Recargo por mora" descripcion="Una vez por cuota no completada a tiempo, pasados los días de gracia. Al exonerado, nunca." apilada>
                        <Opciones
                            etiqueta="Recargo por mora"
                            valor={(c.moraTipo ?? 'NINGUNA') as 'NINGUNA' | 'FIJA' | 'PORCENTAJE'}
                            opciones={[
                                { valor: 'NINGUNA', texto: 'Sin recargo' },
                                { valor: 'FIJA', texto: 'Monto fijo' },
                                { valor: 'PORCENTAJE', texto: 'Porcentaje' },
                            ]}
                            alCambiar={(v) => cambiar('moraTipo', v)}
                        />
                    </Fila>
                    {c.moraTipo && c.moraTipo !== 'NINGUNA' && (
                        <>
                            <FilaCampo
                                etiqueta={c.moraTipo === 'FIJA' ? 'Cuánto' : 'Qué porcentaje'}
                                sufijo={c.moraTipo === 'FIJA' ? simbolo : '%'}
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                value={c.moraValor ?? ''}
                                onChange={(e) => cambiar('moraValor', e.target.value)}
                            />
                            <FilaCampo etiqueta="Días después del vencimiento" type="number" min={0} max={90} value={c.moraDiasDespues ?? 0} onChange={numero('moraDiasDespues')} />
                        </>
                    )}
                    <FilaCampo
                        etiqueta="Recordar al representante"
                        ayuda="Días antes del vencimiento; le llega un aviso al teléfono. 0 = no recordar."
                        sufijo="días antes"
                        type="number"
                        min={0}
                        max={15}
                        value={c.recordatorioDiasAntes ?? 3}
                        onChange={numero('recordatorioDiasAntes')}
                    />
                </Grupo>

                <Grupo id="metodos" titulo="Métodos de pago">
                    {c.methods.map((m) => (
                        <Fila key={m} etiqueta={m}>
                            <button
                                type="button"
                                aria-label={`Quitar ${m}`}
                                onClick={() => cambiar('methods', c.methods.filter((x) => x !== m))}
                                className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-red-700"
                            >
                                <X size={18} />
                            </button>
                        </Fila>
                    ))}
                    <div className="flex min-h-[56px] items-center gap-2 px-4 py-1.5">
                        <input
                            value={nuevoMetodo}
                            maxLength={30}
                            onChange={(e) => setNuevoMetodo(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarMetodo())}
                            placeholder="Otro método (ej.: Binance)"
                            aria-label="Otro método de pago"
                            className="min-h-[44px] min-w-0 flex-1 bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-400"
                        />
                        <button
                            type="button"
                            onClick={agregarMetodo}
                            className="flex min-h-[40px] items-center gap-1 rounded-full bg-gray-100 px-4 text-sm font-medium text-gray-800 hover:bg-gray-200"
                        >
                            <Plus size={14} /> Añadir
                        </button>
                    </div>
                </Grupo>
            </fieldset>

            <BotonGuardar type="button" texto="Guardar" onClick={enviar} guardando={guardar.isPending} />
        </Ajustes>
    );
}
