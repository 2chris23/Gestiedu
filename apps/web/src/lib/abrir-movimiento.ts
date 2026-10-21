/**
 * ABRIR «NUEVO MOVIMIENTO» YA LLENO (2026-10-15)
 *
 * Cristian: en la ficha de un estudiante solo se mira; «Registrar pago» lleva
 * a Ingreso con todo puesto (es un ingreso, de ese estudiante, de su
 * mensualidad). Lo mismo con una persona del personal y el Egreso. El panel
 * vive en la página de Finanzas; esto es el timbre para abrirlo desde una ficha.
 */

export interface MovimientoPedido {
    tipo: 'entra' | 'sale';
    estudiante?: { id: string; nombre: string; seccion: string };
    persona?: { id: string; nombre: string };
}

type Oyente = (p: MovimientoPedido) => void;
const oyentes = new Set<Oyente>();

export function abrirMovimiento(p: MovimientoPedido) {
    oyentes.forEach((o) => o(p));
}

export function alAbrirMovimiento(o: Oyente): () => void {
    oyentes.add(o);
    return () => {
        oyentes.delete(o);
    };
}
