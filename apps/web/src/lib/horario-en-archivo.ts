import type { ScheduleBlock } from '@/components/schedule/UniversalScheduleViewer';
import type { Period } from '@/utils/schedule.utils';

/**
 * EL HORARIO COMO IMAGEN O PDF
 *
 * ─── POR QUÉ SE DIBUJA Y NO SE FOTOGRAFÍA LA PANTALLA ───────────────────────
 *
 * Lo fácil sería "sacarle una foto" al horario que se ve. Sale mal por tres
 * lados: lo que se ve es el carril de **hoy** (no la semana), la foto trae los
 * botones, las flechas y el resaltado de la clase en curso, y en un teléfono de
 * 375 px el horario semanal ni cabe.
 *
 * Así que se dibuja **desde los datos**, en un lienzo de tamaño fijo: siempre la
 * semana completa, con el mismo aspecto en un teléfono que en un monitor, y
 * legible al imprimirlo en una hoja carta.
 *
 * ─── POR QUÉ EL PDF ESTÁ ESCRITO A MANO ─────────────────────────────────────
 *
 * La librería habitual (jsPDF) cargaba **diez avisos de seguridad**, uno de
 * ellos crítico, en la versión que se instalaba. Para meter UNA imagen en UNA
 * página no hace falta: un PDF así son cinco objetos y una tabla de posiciones.
 * Menos código de terceros en el navegador de cada alumno es menos superficie.
 */

const DIAS = [
    { key: 'Lun', nombre: 'Lunes' },
    { key: 'Mar', nombre: 'Martes' },
    { key: 'Mié', nombre: 'Miércoles' },
    { key: 'Jue', nombre: 'Jueves' },
    { key: 'Vie', nombre: 'Viernes' },
];

/** Fondo claro y texto oscuro de cada materia. Contraste de texto ≥ 7:1. */
const PALETA = [
    { fondo: '#e0e7ff', borde: '#6366f1', texto: '#312e81' },
    { fondo: '#d1fae5', borde: '#10b981', texto: '#064e3b' },
    { fondo: '#fef3c7', borde: '#f59e0b', texto: '#78350f' },
    { fondo: '#ffe4e6', borde: '#f43f5e', texto: '#881337' },
    { fondo: '#cffafe', borde: '#06b6d4', texto: '#164e63' },
    { fondo: '#ede9fe', borde: '#8b5cf6', texto: '#4c1d95' },
    { fondo: '#e0f2fe', borde: '#0ea5e9', texto: '#0c4a6e' },
    { fondo: '#fce7f3', borde: '#ec4899', texto: '#831843' },
];

export interface DatosDelHorario {
    bloques: ScheduleBlock[];
    periodos: Period[];
    titulo: string;
    subtitulo?: string;
    /** "2026-09-16", la fecha del liceo — no la del teléfono. */
    fecha: string;
}

/** Si la configuración no llegó, los tramos salen de las propias clases. */
function tramosDe(bloques: ScheduleBlock[], periodos: Period[]): Period[] {
    if (periodos.length > 0) return [...periodos].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const unicos = new Map<string, Period>();
    for (const b of bloques) {
        const k = `${b.startTime}-${b.endTime}`;
        if (!unicos.has(k)) {
            unicos.set(k, { id: k, startTime: b.startTime, endTime: b.endTime, label: '', type: 'class' });
        }
    }
    return [...unicos.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

const claveDeMateria = (b: ScheduleBlock) => (b.subjectId || b.subject || '').trim().toLowerCase();

/** Parte un texto en líneas que quepan en `ancho`, con puntos suspensivos si sobra. */
function lineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number, maximo: number): string[] {
    const palabras = texto.split(/\s+/).filter(Boolean);
    const salida: string[] = [];
    let actual = '';
    for (const p of palabras) {
        const prueba = actual ? `${actual} ${p}` : p;
        if (ctx.measureText(prueba).width <= ancho) {
            actual = prueba;
        } else {
            if (actual) salida.push(actual);
            actual = p;
        }
    }
    if (actual) salida.push(actual);
    if (salida.length > maximo) {
        const cortadas = salida.slice(0, maximo);
        let ultima = cortadas[maximo - 1];
        while (ultima.length > 1 && ctx.measureText(`${ultima}…`).width > ancho) ultima = ultima.slice(0, -1);
        cortadas[maximo - 1] = `${ultima}…`;
        return cortadas;
    }
    return salida.map((l) => {
        if (ctx.measureText(l).width <= ancho) return l;
        let r = l;
        while (r.length > 1 && ctx.measureText(`${r}…`).width > ancho) r = r.slice(0, -1);
        return `${r}…`;
    });
}

function rectanguloRedondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function fechaLegible(ymd: string): string {
    const [a, m, d] = ymd.split('-').map(Number);
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return a && m && d ? `${d} de ${meses[m - 1]} de ${a}` : ymd;
}

/**
 * Dibuja la semana en un lienzo. Tamaño de hoja carta apaisada a 150 ppp
 * (1650 × 1275): nítido impreso y liviano para mandarlo por WhatsApp.
 */
export async function dibujarHorario(datos: DatosDelHorario): Promise<HTMLCanvasElement> {
    const ANCHO = 1650;
    const ALTO = 1275;
    const MARGEN = 60;

    // La letra de la app. next/font le cambia el nombre a Inter, así que se
    // pregunta cuál es en vez de escribirlo.
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
        await (document as any).fonts.ready;
    }
    const familia =
        (typeof document !== 'undefined' && getComputedStyle(document.body).fontFamily) ||
        'system-ui, sans-serif';

    const lienzo = document.createElement('canvas');
    lienzo.width = ANCHO;
    lienzo.height = ALTO;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('Este navegador no puede dibujar el horario');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ANCHO, ALTO);
    ctx.textBaseline = 'top';

    // ── Cabecera ────────────────────────────────────────────────────────────
    ctx.fillStyle = '#111827';
    ctx.font = `700 40px ${familia}`;
    ctx.fillText(lineas(ctx, datos.titulo, ANCHO - MARGEN * 2 - 360, 1)[0] ?? '', MARGEN, MARGEN);
    if (datos.subtitulo) {
        ctx.fillStyle = '#4b5563';
        ctx.font = `500 24px ${familia}`;
        ctx.fillText(lineas(ctx, datos.subtitulo, ANCHO - MARGEN * 2 - 360, 1)[0] ?? '', MARGEN, MARGEN + 52);
    }
    ctx.fillStyle = '#6b7280';
    ctx.font = `500 20px ${familia}`;
    ctx.textAlign = 'right';
    ctx.fillText(fechaLegible(datos.fecha), ANCHO - MARGEN, MARGEN + 8);
    ctx.textAlign = 'left';

    // ── Rejilla ─────────────────────────────────────────────────────────────
    const tramos = tramosDe(datos.bloques, datos.periodos);
    const arriba = MARGEN + 120;
    const cabeceraDias = 52;
    const anchoHora = 150;
    const anchoDia = (ANCHO - MARGEN * 2 - anchoHora) / DIAS.length;

    const PESO_RECESO = 0.45;
    const pesos = tramos.map((t) => (t.type === 'break' ? PESO_RECESO : 1));
    const disponible = ALTO - arriba - cabeceraDias - MARGEN;
    const unidad = Math.min(130, disponible / Math.max(1, pesos.reduce((a, b) => a + b, 0)));
    const ys: number[] = [];
    let y = arriba + cabeceraDias;
    for (const p of pesos) {
        ys.push(y);
        y += p * unidad;
    }
    const fondoRejilla = y;

    ctx.font = `700 22px ${familia}`;
    ctx.fillStyle = '#374151';
    ctx.textAlign = 'center';
    DIAS.forEach((d, i) => {
        ctx.fillText(d.nombre, MARGEN + anchoHora + anchoDia * i + anchoDia / 2, arriba + 14);
    });
    ctx.textAlign = 'left';

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGEN, arriba + cabeceraDias);
    ctx.lineTo(ANCHO - MARGEN, arriba + cabeceraDias);
    ctx.stroke();

    // Colores estables por materia: la misma materia, el mismo color en toda la semana.
    const colores = new Map<string, (typeof PALETA)[number]>();
    for (const b of [...datos.bloques].sort((a, b) => a.subject.localeCompare(b.subject))) {
        const k = claveDeMateria(b);
        if (!colores.has(k)) colores.set(k, PALETA[colores.size % PALETA.length]);
    }

    tramos.forEach((t, i) => {
        const alto = pesos[i] * unidad;
        const yy = ys[i];

        ctx.fillStyle = '#6b7280';
        ctx.font = `600 18px ${familia}`;
        ctx.fillText(t.startTime, MARGEN, yy + 10);
        ctx.fillStyle = '#9ca3af';
        ctx.font = `500 16px ${familia}`;
        ctx.fillText(t.endTime, MARGEN, yy + 32);

        if (t.type === 'break') {
            ctx.fillStyle = '#f3f4f6';
            rectanguloRedondo(ctx, MARGEN + anchoHora, yy + 4, anchoDia * DIAS.length - 6, alto - 8, 10);
            ctx.fill();
            ctx.fillStyle = '#6b7280';
            ctx.font = `600 18px ${familia}`;
            ctx.textAlign = 'center';
            ctx.fillText(t.label || 'Receso', MARGEN + anchoHora + (anchoDia * DIAS.length) / 2, yy + alto / 2 - 10);
            ctx.textAlign = 'left';
        }
    });

    // Una clase que ocupa varios tramos seguidos se dibuja como UN bloque alto,
    // igual que en la pantalla.
    DIAS.forEach((dia, col) => {
        let i = 0;
        while (i < tramos.length) {
            const t = tramos[i];
            if (t.type === 'break') {
                i++;
                continue;
            }
            const clase = datos.bloques.find(
                (b) => b.day === dia.key && b.startTime <= t.startTime && b.endTime > t.startTime
            );
            if (!clase) {
                i++;
                continue;
            }
            let fin = i + 1;
            while (fin < tramos.length && tramos[fin].type !== 'break') {
                const sig = datos.bloques.find(
                    (b) => b.day === dia.key && b.startTime <= tramos[fin].startTime && b.endTime > tramos[fin].startTime
                );
                if (!sig || claveDeMateria(sig) !== claveDeMateria(clase) || (sig.detail ?? '') !== (clase.detail ?? '')) break;
                fin++;
            }

            const x = MARGEN + anchoHora + anchoDia * col + 3;
            const yy = ys[i] + 4;
            const w = anchoDia - 6;
            const h = ys[fin - 1] + pesos[fin - 1] * unidad - ys[i] - 8;
            const c = colores.get(claveDeMateria(clase)) ?? PALETA[0];

            ctx.fillStyle = c.fondo;
            rectanguloRedondo(ctx, x, yy, w, h, 12);
            ctx.fill();
            ctx.fillStyle = c.borde;
            ctx.fillRect(x, yy + 8, 6, h - 16);

            const anchoTexto = w - 30;
            const cabenLineas = Math.max(1, Math.floor((h - 20) / 26));
            ctx.fillStyle = c.texto;
            ctx.font = `700 21px ${familia}`;
            const nombre = lineas(ctx, clase.subject, anchoTexto, Math.min(2, cabenLineas));
            let ty = yy + 12;
            for (const l of nombre) {
                ctx.fillText(l, x + 18, ty);
                ty += 26;
            }
            // "Sin aula" es la ausencia de un dato, no un dato: en papel solo estorba.
            const lugar = [clase.location, clase.classroom].find((v) => v && !/^sin aula$/i.test(v.trim()));
            const extra = [clase.detail, lugar].filter(Boolean).join(' · ');
            const cabenExtra = Math.floor((yy + h - 10 - ty) / 22);
            if (extra && cabenExtra >= 1) {
                ctx.font = `500 17px ${familia}`;
                for (const l of lineas(ctx, extra, anchoTexto, Math.min(3, cabenExtra))) {
                    ctx.fillText(l, x + 18, ty + 2);
                    ty += 22;
                }
            }
            i = fin;
        }
    });

    if (datos.bloques.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = `500 24px ${familia}`;
        ctx.textAlign = 'center';
        ctx.fillText('Sin clases asignadas', ANCHO / 2, (arriba + fondoRejilla) / 2);
        ctx.textAlign = 'left';
    }

    ctx.fillStyle = '#9ca3af';
    ctx.font = `500 16px ${familia}`;
    ctx.fillText('Gestiedu', MARGEN, ALTO - MARGEN + 20);

    return lienzo;
}

function aBlob(lienzo: HTMLCanvasElement, tipo: string, calidad?: number): Promise<Blob> {
    return new Promise((resolve, reject) =>
        lienzo.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar el archivo'))), tipo, calidad)
    );
}

/**
 * Un PDF de una página con una imagen JPEG encima, en hoja carta (apaisada o vertical).
 *
 * La estructura mínima que exige el formato: catálogo → páginas → página →
 * imagen + contenido, y al final la tabla con dónde empieza cada objeto. Todo
 * lo que va en texto es ASCII, así que cada carácter es un byte y las
 * posiciones se cuentan directo.
 */
export function pdfConUnaImagen(jpeg: Uint8Array, anchoPx: number, altoPx: number): Blob {
    // Hoja carta (8,5 × 11 in a 72 pt), apaisada o vertical según la imagen.
    const vertical = altoPx > anchoPx;
    const ANCHO_PT = vertical ? 612 : 792;
    const ALTO_PT = vertical ? 792 : 612;
    const escala = Math.min(ANCHO_PT / anchoPx, ALTO_PT / altoPx);
    const w = anchoPx * escala;
    const h = altoPx * escala;
    const x = (ANCHO_PT - w) / 2;
    const y = (ALTO_PT - h) / 2;

    const enc = new TextEncoder();
    const partes: Uint8Array[] = [];
    const posiciones: number[] = [];
    let largo = 0;
    const poner = (p: Uint8Array | string) => {
        const bytes = typeof p === 'string' ? enc.encode(p) : p;
        partes.push(bytes);
        largo += bytes.length;
    };
    const objeto = (n: number, cuerpo: string) => {
        posiciones[n] = largo;
        poner(`${n} 0 obj\n${cuerpo}\nendobj\n`);
    };

    poner('%PDF-1.4\n');
    // Cuatro bytes altos en un comentario: le dicen a quien lo lea que es binario.
    poner(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
    objeto(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objeto(
        3,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO_PT} ${ALTO_PT}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
    );

    posiciones[4] = largo;
    poner(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${anchoPx} /Height ${altoPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
    );
    poner(jpeg);
    poner('\nendstream\nendobj\n');

    const dibujo = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
    objeto(5, `<< /Length ${dibujo.length} >>\nstream\n${dibujo}\nendstream`);

    const inicioTabla = largo;
    let tabla = `xref\n0 6\n0000000000 65535 f \n`;
    for (let n = 1; n <= 5; n++) tabla += `${String(posiciones[n]).padStart(10, '0')} 00000 n \n`;
    poner(`${tabla}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${inicioTabla}\n%%EOF\n`);

    return new Blob(partes as BlobPart[], { type: 'application/pdf' });
}

export async function horarioComoPng(datos: DatosDelHorario): Promise<Blob> {
    return aBlob(await dibujarHorario(datos), 'image/png');
}

export async function horarioComoPdf(datos: DatosDelHorario): Promise<Blob> {
    const lienzo = await dibujarHorario(datos);
    const jpeg = new Uint8Array(await (await aBlob(lienzo, 'image/jpeg', 0.92)).arrayBuffer());
    return pdfConUnaImagen(jpeg, lienzo.width, lienzo.height);
}

/** Un nombre de archivo sin tildes ni símbolos, que no rompa en ningún sistema. */
export function nombreDeArchivo(titulo: string, extension: 'png' | 'pdf'): string {
    const base = titulo
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .replace(/^horario-?/, '')
        .slice(0, 60);
    return `horario-${base || 'semanal'}.${extension}`;
}

/**
 * Entrega el archivo.
 *
 * En el teléfono se abre el menú de **compartir** (WhatsApp, guardar en
 * archivos…): dentro de la app empaquetada un "descargar" normal no hace nada,
 * y en el teléfono compartir es lo que la gente quiere hacer con un horario.
 * Donde no se puede compartir archivos, se descarga.
 */
export async function entregarArchivo(blob: Blob, nombre: string): Promise<'compartido' | 'descargado' | 'cancelado'> {
    const archivo = new File([blob], nombre, { type: blob.type });
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    const tactil = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

    if (tactil && nav.share && nav.canShare?.({ files: [archivo] })) {
        try {
            await nav.share({ files: [archivo], title: nombre });
            return 'compartido';
        } catch (e: any) {
            if (e?.name === 'AbortError') return 'cancelado';
            // Si compartir falla por otra cosa, se intenta descargar.
        }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'descargado';
}
