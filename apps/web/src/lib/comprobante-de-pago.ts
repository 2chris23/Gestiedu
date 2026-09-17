import api from '@/lib/axios';
import { entregarArchivo, pdfConUnaImagen } from '@/lib/horario-en-archivo';

/**
 * EL COMPROBANTE DE PAGO
 *
 * Se dibuja desde los datos que devuelve el servidor (nunca desde lo que hay en
 * pantalla): así el comprobante dice lo que está registrado, y un pago anulado
 * sale marcado ANULADO aunque alguien tenga abierta una pantalla vieja.
 *
 * Tamaño media carta vertical a 150 ppp: se lee en el teléfono y se imprime.
 */

interface DatosDelComprobante {
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

async function dibujar(d: DatosDelComprobante): Promise<HTMLCanvasElement> {
    const ANCHO = 1100;
    const M = 70;
    const filas = d.allocations.length;
    const ALTO = 1050 + filas * 52 + (d.annulled ? 60 : 0);

    if ((document as any).fonts?.ready) await (document as any).fonts.ready;
    const familia = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';

    const lienzo = document.createElement('canvas');
    lienzo.width = ANCHO;
    lienzo.height = ALTO;
    const ctx = lienzo.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ANCHO, ALTO);
    ctx.textBaseline = 'top';

    // Franja superior
    ctx.fillStyle = '#4338ca';
    ctx.fillRect(0, 0, ANCHO, 14);

    let y = M;
    ctx.fillStyle = '#111827';
    ctx.font = `700 34px ${familia}`;
    ctx.fillText(recortar(ctx, d.institute.name || 'Liceo', ANCHO - 2 * M), M, y);
    y += 50;
    ctx.fillStyle = '#4b5563';
    ctx.font = `500 24px ${familia}`;
    ctx.fillText(`Comprobante de pago Nº ${String(d.receiptNumber).padStart(6, '0')}`, M, y);
    y += 36;
    ctx.fillText(`Ciclo escolar ${d.academicYear}`, M, y);
    y += 60;

    const par = (rotulo: string, valor: string) => {
        ctx.fillStyle = '#6b7280';
        ctx.font = `500 22px ${familia}`;
        ctx.fillText(rotulo, M, y);
        ctx.fillStyle = '#111827';
        ctx.font = `600 26px ${familia}`;
        ctx.fillText(recortar(ctx, valor, ANCHO - 2 * M - 260), M + 260, y - 2);
        y += 50;
    };

    par('Estudiante', `${d.student.firstName} ${d.student.lastName}`);
    par('Cédula', d.student.id);
    par('Fecha', fechaLarga(d.paidAt));
    par('Método', d.method);
    if (d.reference) par('Referencia', d.reference);

    y += 16;
    ctx.fillStyle = '#eef2ff';
    ctx.fillRect(M, y, ANCHO - 2 * M, 120);
    ctx.fillStyle = '#3730a3';
    ctx.font = `500 22px ${familia}`;
    ctx.fillText('Monto recibido', M + 30, y + 22);
    ctx.font = `700 48px ${familia}`;
    ctx.fillText(formato(d.amount, d.currency), M + 30, y + 54);
    if (d.currency !== d.baseCurrency && d.exchangeRate) {
        ctx.textAlign = 'right';
        ctx.font = `500 20px ${familia}`;
        ctx.fillText(`Tasa ${formato(d.exchangeRate, 'VES')} por $1`, ANCHO - M - 30, y + 30);
        ctx.font = `600 24px ${familia}`;
        ctx.fillText(`Equivale a ${formato(d.amountBase, d.baseCurrency)}`, ANCHO - M - 30, y + 66);
        ctx.textAlign = 'left';
    }
    y += 160;

    ctx.fillStyle = '#374151';
    ctx.font = `700 22px ${familia}`;
    ctx.fillText('Se aplicó a', M, y);
    y += 44;
    for (const a of d.allocations) {
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(M, y - 10);
        ctx.lineTo(ANCHO - M, y - 10);
        ctx.stroke();
        ctx.fillStyle = '#111827';
        ctx.font = `500 24px ${familia}`;
        ctx.fillText(recortar(ctx, a.label, ANCHO - 2 * M - 260), M, y);
        ctx.textAlign = 'right';
        ctx.font = `600 24px ${familia}`;
        ctx.fillText(formato(a.amount, d.baseCurrency), ANCHO - M, y);
        ctx.textAlign = 'left';
        y += 52;
    }

    if (d.annulled) {
        y += 10;
        ctx.fillStyle = '#b91c1c';
        ctx.font = `700 24px ${familia}`;
        ctx.fillText(recortar(ctx, `ANULADO${d.annulReason ? `: ${d.annulReason}` : ''}`, ANCHO - 2 * M), M, y);
        // Marca de agua cruzada: que no se pueda recortar y usar como válido.
        ctx.save();
        ctx.translate(ANCHO / 2, ALTO / 2);
        ctx.rotate(-Math.PI / 6);
        ctx.fillStyle = 'rgba(185, 28, 28, 0.14)';
        ctx.font = `800 170px ${familia}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ANULADO', 0, 0);
        ctx.restore();
        ctx.textBaseline = 'top';
    }

    ctx.fillStyle = '#9ca3af';
    ctx.font = `500 18px ${familia}`;
    ctx.fillText('Generado con Gestiedu', M, ALTO - M + 10);
    return lienzo;
}

export async function descargarComprobante(paymentId: string, formatoArchivo: 'png' | 'pdf') {
    const { data } = await api.get(`/payments/${paymentId}/receipt`);
    const lienzo = await dibujar(data as DatosDelComprobante);
    const nombre = `comprobante-${String(data.receiptNumber).padStart(6, '0')}.${formatoArchivo}`;
    const aBlob = (tipo: string, q?: number) =>
        new Promise<Blob>((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo generar'))), tipo, q));

    if (formatoArchivo === 'png') return entregarArchivo(await aBlob('image/png'), nombre);
    const jpeg = new Uint8Array(await (await aBlob('image/jpeg', 0.92)).arrayBuffer());
    return entregarArchivo(pdfConUnaImagen(jpeg, lienzo.width, lienzo.height), nombre);
}
