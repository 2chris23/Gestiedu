/**
 * QUÉ COMPROBANTE ENSEÑAR (2026-10-14)
 *
 * La hoja del comprobante (`HojaDeComprobante`) vive una sola vez en el
 * armazón; esto es el timbre para abrirla desde cualquier sitio, también desde
 * el botón de un aviso («Pago registrado · Ver»), que no está dentro de
 * ninguna pantalla. Sin React: se puede llamar desde donde sea.
 */

import type { DatosDelComprobante } from '@/lib/comprobante-de-pago';

export interface ComprobantePedido {
    /**
     * Un cobro a un estudiante o un pago al personal (se leen del servidor), o
     * un movimiento sin recibo —un fondo, un gasto— con sus datos ya puestos.
     */
    tipo: 'cobro' | 'personal' | 'movimiento';
    id: string;
    /** Quien puede anularlo (el admin): sale «Anular pago» dentro. */
    editable?: boolean;
    /** Solo con `movimiento`: lo que se enseña, tal cual. */
    datos?: DatosDelComprobante;
}

type Oyente = (p: ComprobantePedido) => void;
const oyentes = new Set<Oyente>();

export function abrirComprobante(p: ComprobantePedido) {
    oyentes.forEach((o) => o(p));
}

/** La hoja se apunta; devuelve con qué borrarse. */
export function alAbrirComprobante(o: Oyente): () => void {
    oyentes.add(o);
    return () => {
        oyentes.delete(o);
    };
}
