import api from '@/lib/axios';
import { entregarArchivo } from '@/lib/horario-en-archivo';

/**
 * EL COMPROBANTE DE PAGO
 *
 * Se dibuja desde los datos que devuelve el servidor (nunca desde lo que hay en
 * pantalla): así el comprobante dice lo que está registrado, y un pago anulado
 * sale marcado ANULADO aunque alguien tenga abierta una pantalla vieja.
 *
 * Como el de un Pago Móvil (Cristian, 2026-10-14, con el de su banco): se toca
 * el pago, sale la hoja con los datos y «Compartir» manda UNA IMAGEN; nada de
 * PDF ni de archivo que guardar. La imagen es la misma hoja: el nombre del
 * liceo, el monto grande en verde y los datos uno debajo de otro.
 */

export interface DatosDelComprobante {
    institute: { name: string };
    receiptNumber: number;
    student: { id: string; firstName: string; lastName: string };
    academicYear: string;
    paidAt: string;
    method: string;
    reference: string | null;
    currency: 'USD' | 'VES';
    amount: string;
    exchangeRate: string | null;
    baseCurrency: 'USD' | 'VES';
    amountBase: string;
    annulled: boolean;
    annulReason: string | null;
    allocations: Array<{ label: string; amount: string }>;
    /** Para el recibo de un pago al personal (2026-10-01): lo que cambia del dibujo. */
    titulo?: string;
    rotuloPersona?: string;
    cargo?: string | null;
    rotuloMonto?: string;
}

const formato = (valor: string, moneda: 'USD' | 'VES') => {
    const t = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(valor));
    return moneda === 'USD' ? `$${t}` : `Bs ${t}`;
};

const fechaLarga = (ymd: string) => {
    const [a, m, d] = ymd.split('-').map(Number);
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${d} de ${meses[m - 1]} de ${a}`;
};

function recortar(ctx: CanvasRenderingContext2D, texto: string, ancho: number) {
    if (ctx.measureText(texto).width <= ancho) return texto;
    let t = texto;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > ancho) t = t.slice(0, -1);
    return `${t}…`;
}

/** Los renglones de la hoja y de la imagen: los mismos, en el mismo orden. */
export function renglonesDelComprobante(d: DatosDelComprobante): Array<[string, string]> {
    const r: Array<[string, string]> = [
        ['Número de recibo', String(d.receiptNumber).padStart(6, '0')],
        [d.rotuloPersona ?? 'Estudiante', `${d.student.firstName} ${d.student.lastName}`.trim()],
    ];
    if (d.student.id) r.push(['Cédula', d.student.id]);
    if (d.cargo) r.push(['Cargo', d.cargo]);
    r.push(['Fecha', fechaLarga(d.paidAt)]);
    r.push(['Forma de pago', d.method]);
    if (d.reference) r.push(['Referencia', d.reference]);
    if (d.currency !== d.baseCurrency && d.exchangeRate) {
        r.push(['Tasa', `${formato(d.exchangeRate, 'VES')} por $1`]);
        r.push(['Equivale a', formato(d.amountBase, d.baseCurrency)]);
    }
    if (d.allocations.length) r.push(['Concepto', d.allocations.map((a) => a.label).join(', ')]);
    r.push(['Ciclo escolar', d.academicYear]);
    return r;
}

export const montoDelComprobante = (d: DatosDelComprobante) => formato(d.amount, d.currency);

/** Parte un texto en renglones que quepan en `ancho`. */
function enRenglones(ctx: CanvasRenderingContext2D, texto: string, ancho: number, max = 3): string[] {
    const palabras = texto.split(/\s+/);
    const salida: string[] = [];
    let linea = '';
    for (const p of palabras) {
        const prueba = linea ? `${linea} ${p}` : p;
        if (ctx.measureText(prueba).width <= ancho) linea = prueba;
        else {
            if (linea) salida.push(linea);
            linea = p;
        }
    }
    if (linea) salida.push(linea);
    if (salida.length > max) {
        const resto = salida.slice(max - 1).join(' ');
        return [...salida.slice(0, max - 1), recortar(ctx, resto, ancho)];
    }
    return salida;
}

async function dibujar(d: DatosDelComprobante): Promise<HTMLCanvasElement> {
    const ANCHO = 900;
    const M = 70;
    const familia = (typeof document !== 'undefined' && getComputedStyle(document.body).fontFamily) || 'system-ui, sans-serif';
    if ((document as any).fonts?.ready) await (document as any).fonts.ready;

    // Primero se mide (cuántos renglones lleva cada dato) y luego se pinta.
    const medidor = document.createElement('canvas').getContext('2d')!;
    medidor.font = `600 30px ${familia}`;
    const renglones = renglonesDelComprobante(d).map(([r, v]) => [r, enRenglones(medidor, v, ANCHO - 2 * M)] as const);
    const ALTO = 470 + renglones.reduce((t, [, v]) => t + 42 + v.length * 40 + 22, 0) + (d.annulled ? 70 : 0) + 90;

    const lienzo = document.createElement('canvas');
    lienzo.width = ANCHO;
    lienzo.height = ALTO;
    const ctx = lienzo.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ANCHO, ALTO);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    const centro = ANCHO / 2;

    let y = 70;
    ctx.fillStyle = '#111827';
    ctx.font = `700 36px ${familia}`;
    ctx.fillText(recortar(ctx, d.institute.name || 'Liceo', ANCHO - 2 * M), centro, y);
    y += 60;
    ctx.fillStyle = '#4b5563';
    ctx.font = `500 28px ${familia}`;
    ctx.fillText(d.titulo ?? 'Pago recibido', centro, y);
    y += 60;

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(M, y);
    ctx.lineTo(ANCHO - M, y);
    ctx.stroke();
    y += 36;

    ctx.fillStyle = '#6b7280';
    ctx.font = `500 24px ${familia}`;
    ctx.fillText((d.rotuloMonto ?? 'Monto').toUpperCase(), centro, y);
    y += 40;
    ctx.fillStyle = d.annulled ? '#9ca3af' : '#15803d';
    ctx.font = `700 64px ${familia}`;
    ctx.fillText(formato(d.amount, d.currency), centro, y);
    y += 100;

    ctx.beginPath();
    ctx.moveTo(M, y);
    ctx.lineTo(ANCHO - M, y);
    ctx.stroke();
    y += 34;

    for (const [rotulo, valor] of renglones) {
        ctx.fillStyle = '#6b7280';
        ctx.font = `500 22px ${familia}`;
        ctx.fillText(rotulo.toUpperCase(), centro, y);
        y += 42;
        ctx.fillStyle = '#111827';
        ctx.font = `600 30px ${familia}`;
        for (const linea of valor) {
            ctx.fillText(linea, centro, y);
            y += 40;
        }
        y += 22;
    }

    if (d.annulled) {
        ctx.fillStyle = '#b91c1c';
        ctx.font = `700 28px ${familia}`;
        ctx.fillText(recortar(ctx, `ANULADO${d.annulReason ? `: ${d.annulReason}` : ''}`, ANCHO - 2 * M), centro, y + 10);
        // Marca de agua cruzada: que no se pueda recortar y usar como válido.
        ctx.save();
        ctx.translate(ANCHO / 2, ALTO / 2);
        ctx.rotate(-Math.PI / 6);
        ctx.fillStyle = 'rgba(185, 28, 28, 0.14)';
        ctx.font = `800 150px ${familia}`;
        ctx.textBaseline = 'middle';
        ctx.fillText('ANULADO', 0, 0);
        ctx.restore();
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
    }

    ctx.fillStyle = '#9ca3af';
    ctx.font = `500 20px ${familia}`;
    ctx.fillText('Generado con Gestiedu', centro, ALTO - 60);
    return lienzo;
}

/** Lo que el servidor tiene de un cobro a un estudiante. */
export async function leerComprobante(paymentId: string): Promise<DatosDelComprobante> {
    const { data } = await api.get(`/payments/${paymentId}/receipt`);
    return data as DatosDelComprobante;
}

/** Lo que el servidor tiene de un pago al personal, con los rótulos del recibo. */
export async function leerReciboDelPersonal(pagoId: string): Promise<DatosDelComprobante> {
    const { data: r } = await api.get(`/finanzas/pagos-al-personal/${pagoId}/recibo`);
    return {
        institute: r.institute,
        receiptNumber: r.numero,
        student: { id: r.persona.cedula ?? '', firstName: r.persona.nombre, lastName: '' },
        academicYear: r.ciclo,
        paidAt: r.fecha,
        method: r.metodo,
        reference: r.referencia,
        currency: r.moneda,
        amount: r.monto,
        exchangeRate: r.tasa,
        baseCurrency: r.monedaBase,
        amountBase: r.montoBase,
        annulled: r.anulado,
        annulReason: r.motivoAnulacion,
        allocations: r.asignaciones.map((a: any) => ({ label: a.etiqueta, amount: a.monto })),
        titulo: 'Pago al personal',
        rotuloPersona: 'Pagado a',
        cargo: r.persona.cargo,
        rotuloMonto: 'Monto pagado',
    };
}

/** «Compartir»: la imagen al compartir del teléfono (WhatsApp…); en el ordenador, se baja. */
export async function compartirComprobante(d: DatosDelComprobante) {
    const lienzo = await dibujar(d);
    const blob = await new Promise<Blob>((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo generar'))), 'image/png'));
    const nombre = `${d.rotuloPersona ? 'recibo-personal' : 'comprobante'}-${String(d.receiptNumber).padStart(6, '0')}.png`;
    return entregarArchivo(blob, nombre);
}

