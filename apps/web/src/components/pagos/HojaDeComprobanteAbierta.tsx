'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Share2, XCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { compartirComprobante, leerComprobante, leerReciboDelPersonal, montoDelComprobante, renglonesDelComprobante } from '@/lib/comprobante-de-pago';
import { type ComprobantePedido } from '@/lib/comprobante-abierto';
import { errorDe, useAnularPago } from '@/hooks/usePagos';
import { useAnularPagoAlPersonal } from '@/hooks/useFinanzas';
import { cn } from '@/lib/utils';

/**
 * EL COMPROBANTE, COMO UN PAGO MÓVIL (2026-10-14)
 *
 * Cristian, con el de su banco en la mano: «es un clic y te muestra el pago,
 * dice la información y compartir; no hace falta guardar archivo ni PDF». Se
 * toca un pago en cualquier lista y sale esta hoja: el liceo, «Pago recibido»,
 * el monto grande y los datos uno debajo de otro. «Compartir» manda la imagen
 * (la misma hoja) al compartir del teléfono; en el ordenador, se baja.
 *
 * Vive UNA vez en el armazón y se abre con `abrirComprobante(...)` desde
 * donde sea: la lista de pagos, el aviso de «Pago registrado», «Mis pagos».
 * Anular va dentro, pequeño y en rojo, solo para quien puede.
 */
export function Hoja({ pedido, alCerrar }: { pedido: ComprobantePedido; alCerrar: () => void }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['comprobante', pedido.tipo, pedido.id],
        queryFn: () => (pedido.datos ? Promise.resolve(pedido.datos) : pedido.tipo === 'cobro' ? leerComprobante(pedido.id) : leerReciboDelPersonal(pedido.id)),
        // Siempre lo de ahora: un pago recién anulado sale anulado.
        staleTime: 0,
    });
    const [compartiendo, setCompartiendo] = React.useState(false);
    const [anulando, setAnulando] = React.useState(false);
    const [motivo, setMotivo] = React.useState('');
    const anularCobro = useAnularPago();
    const anularAlPersonal = useAnularPagoAlPersonal();
    const anulandoAhora = anularCobro.isPending || anularAlPersonal.isPending;

    const compartir = async () => {
        if (!data) return;
        setCompartiendo(true);
        try {
            const r = await compartirComprobante(data);
            if (r === 'actualizar') toast.error('Para compartir, actualiza la app');
        } catch (e) {
            toast.error(errorDe(e, 'No se pudo preparar la imagen'));
        } finally {
            setCompartiendo(false);
        }
    };

    const anular = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (pedido.tipo === 'cobro') await anularCobro.mutateAsync({ paymentId: pedido.id, reason: motivo });
            else await anularAlPersonal.mutateAsync({ id: pedido.id, motivo });
            toast.success(pedido.tipo === 'cobro' ? 'Pago anulado' : 'Pago anulado: vuelve a los fondos');
            alCerrar();
        } catch (err) {
            toast.error(errorDe(err, 'No se pudo anular'));
        }
    };

    const titulo = data?.annulled ? 'Pago anulado' : (data?.titulo ?? (pedido.tipo === 'cobro' ? 'Pago recibido' : 'Pago al personal'));

    return (
        <Sheet open onOpenChange={(v) => !v && alCerrar()}>
            <SheetContent
                side="bottom"
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="modo-claro zona-segura-abajo flex max-h-[92dvh] flex-col rounded-t-[28px] bg-white px-5 pb-4 pt-6 sm:mx-auto sm:max-w-md"
            >
                <SheetTitle className="text-center text-base font-semibold text-gray-700">{titulo}</SheetTitle>
                <SheetDescription className="sr-only">Los datos del pago y el botón para compartirlo</SheetDescription>

                {isLoading ? (
                    <div className="flex justify-center py-16">
                        <Loader2 className="h-7 w-7 animate-spin text-indigo-600" aria-label="Cargando el comprobante" />
                    </div>
                ) : error || !data ? (
                    <p className="py-10 text-center text-sm text-red-700">{errorDe(error, 'No se pudo cargar el comprobante')}</p>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <p className="mt-1 text-center text-lg font-bold text-gray-900">{data.institute.name}</p>
                        <div className="mt-4 border-y border-gray-100 py-5 text-center">
                            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                {data.annulled ? <XCircle className="h-4 w-4 text-red-600" aria-hidden /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />}
                                {data.rotuloMonto ?? 'Monto'}
                            </p>
                            <p className={cn('mt-1 text-4xl font-bold tabular-nums', data.annulled ? 'text-gray-400 line-through' : 'text-emerald-700')}>{montoDelComprobante(data)}</p>
                            {data.annulled && <p className="mt-2 text-sm font-semibold text-red-700">Anulado{data.annulReason ? `: ${data.annulReason}` : ''}</p>}
                        </div>
                        {/* Como el de Bancamiga: el monto en medio y los datos a la izquierda, uno debajo de otro. */}
                        <dl className="space-y-3 px-1 py-4 text-left">
                            {renglonesDelComprobante(data).map(([r, v]) => (
                                <div key={r}>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-indigo-700">{r}</dt>
                                    <dd className="break-words text-[15px] font-semibold text-gray-900">{v}</dd>
                                </div>
                            ))}
                        </dl>

                        {pedido.editable && !data.annulled && (
                            <div className="pb-2 text-center">
                                {anulando ? (
                                    <form onSubmit={anular} className="flex gap-2">
                                        <input
                                            autoFocus
                                            required
                                            minLength={3}
                                            maxLength={200}
                                            value={motivo}
                                            onChange={(e) => setMotivo(e.target.value)}
                                            placeholder="Motivo de la anulación"
                                            aria-label="Motivo de la anulación"
                                            className="min-h-[44px] min-w-0 flex-1 rounded-full bg-gray-100 px-4 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-red-500"
                                        />
                                        <button type="submit" disabled={anulandoAhora} className="min-h-[44px] shrink-0 rounded-full bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
                                            Anular
                                        </button>
                                    </form>
                                ) : (
                                    <button type="button" onClick={() => setAnulando(true)} className="min-h-[44px] px-3 text-sm font-medium text-red-700">
                                        Anular pago
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-3 space-y-2">
                    <button
                        type="button"
                        onClick={compartir}
                        disabled={!data || compartiendo}
                        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 text-base font-semibold text-white active:bg-emerald-800 disabled:opacity-60"
                    >
                        {compartiendo ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Share2 className="h-5 w-5" aria-hidden />}
                        Compartir
                    </button>
                    <button type="button" onClick={alCerrar} className="min-h-[52px] w-full rounded-2xl bg-gray-100 text-base font-semibold text-gray-900 active:bg-gray-200">
                        Cerrar
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

export default Hoja;
