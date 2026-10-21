'use client';

import * as React from 'react';
import { diferido } from '@/components/common/Diferido';
import { alAbrirComprobante, type ComprobantePedido } from '@/lib/comprobante-abierto';

/**
 * EL COMPROBANTE, COMO UN PAGO MÓVIL (2026-10-14)
 *
 * Vive UNA vez en el armazón y se abre con `abrirComprobante(...)` desde
 * donde sea. Aquí solo se escucha: la hoja (y lo que dibuja la imagen) baja
 * la primera vez que se abre, no con cada pantalla (CARGA-01).
 */
const Hoja = diferido(() => import('./HojaDeComprobanteAbierta'), { sinEsqueleto: true });

export function HojaDeComprobante() {
    const [pedido, setPedido] = React.useState<ComprobantePedido | null>(null);
    React.useEffect(() => alAbrirComprobante(setPedido), []);
    if (!pedido) return null;
    return <Hoja key={`${pedido.tipo}-${pedido.id}`} pedido={pedido} alCerrar={() => setPedido(null)} />;
}

export default HojaDeComprobante;
