'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { BellRing, Check, Image as Imagen, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { descargarComprobante } from '@/lib/comprobante-de-pago';
import { dinero, errorDe, PagoPorConfirmar, useConfirmarReporte, usePagosPorConfirmar, useRechazarReporte, verCaptura } from '@/hooks/usePagos';

/**
 * LOS PAGOS POR CONFIRMAR (2026-10-01)
 *
 * Lo que los representantes dicen que pagaron, con su captura. Confirmar lo
 * cobra de verdad (la misma cuenta que «Registrar pago») y le avisa; rechazar
 * pide el motivo, que él verá. Si no hay ninguno, no se pinta nada.
 */
export function PagosPorConfirmar() {
    const { data: reportes = [] } = usePagosPorConfirmar(true);
    if (reportes.length === 0) return null;
    return (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4" aria-labelledby="por-confirmar">
            <h2 id="por-confirmar" className="flex items-center gap-2 text-base font-bold text-amber-950">
                <BellRing className="h-5 w-5" aria-hidden />
                {reportes.length === 1 ? '1 pago por confirmar' : `${reportes.length} pagos por confirmar`}
            </h2>
            <p className="mt-1 text-sm text-amber-950">Los reportó el representante. Revisa que el dinero llegó a la cuenta antes de confirmarlo.</p>
            <ul className="mt-3 space-y-2">
                {reportes.map((r) => (
                    <Reporte key={r.id} r={r} />
                ))}
            </ul>
        </section>
    );
}

function Reporte({ r }: { r: PagoPorConfirmar }) {
    const confirmar = useConfirmarReporte();
    const rechazar = useRechazarReporte();
    const [rechazando, setRechazando] = React.useState(false);
    const [motivo, setMotivo] = React.useState('');
    const fecha = r.fechaDePago.split('-').reverse().join('/');

    const alConfirmar = async () => {
        try {
            const pago = await confirmar.mutateAsync(r.id);
            toast.success(`Pago confirmado · comprobante Nº ${String(pago.receiptNumber).padStart(6, '0')}`, {
                action: { label: 'Descargar', onClick: () => descargarComprobante(pago.id, 'png') },
            });
        } catch (e) {
            toast.error(errorDe(e, 'No se pudo confirmar el pago'));
        }
    };
    const alRechazar = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await rechazar.mutateAsync({ id: r.id, motivo });
            toast.success('Rechazado: el representante verá el motivo');
        } catch (err) {
            toast.error(errorDe(err, 'No se pudo rechazar'));
        }
    };

    return (
        <li className="rounded-xl border border-amber-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{r.alumno.nombre}</p>
                    <p className="text-sm text-gray-700">
                        {dinero(r.monto, r.moneda)} · {r.metodo}
                        {r.referencia && ` · Ref. ${r.referencia}`} · pagado el {fecha}
                    </p>
                    <p className="text-xs text-gray-600">Lo reportó {r.representante}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {r.conCaptura && (
                        <Button variant="contorno" onClick={() => verCaptura(r.id).catch(() => toast.error('No se pudo abrir la captura'))}>
                            <Imagen aria-hidden />
                            Ver captura
                        </Button>
                    )}
                    <Button onClick={alConfirmar} disabled={confirmar.isPending}>
                        {confirmar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                        Confirmar
                    </Button>
                    <Button variant="contorno" onClick={() => setRechazando((v) => !v)} aria-expanded={rechazando}>
                        <X aria-hidden />
                        Rechazar
                    </Button>
                </div>
            </div>
            {rechazando && (
                <form onSubmit={alRechazar} className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="min-w-0 flex-1 text-sm font-medium text-gray-800">
                        ¿Por qué? (lo verá el representante)
                        <input
                            required
                            minLength={3}
                            maxLength={200}
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            placeholder="Ej.: no llegó a la cuenta"
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                        />
                    </label>
                    <Button type="submit" variant="contorno" disabled={rechazar.isPending}>
                        Rechazar el pago
                    </Button>
                </form>
            )}
        </li>
    );
}
