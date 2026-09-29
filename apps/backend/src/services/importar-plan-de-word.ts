import * as cheerio from 'cheerio';

/**
 * LEER EL PLAN DE EVALUACIÓN DE UN WORD
 *
 * Un profesor ya tiene su plan en Word, como la hoja del MPPE: una tabla con
 * la cabecera (docente, cédula, referentes, P.E.I.C.…) ARRIBA de la tabla del
 * plan, dos filas de títulos («Estrategias de evaluación» sobre Actividad,
 * Técnica e Instrumento; «Ponderación» sobre % y Pts.) y celdas unidas (el
 * tema generador de tres evaluaciones, el énfasis curricular de todas).
 *
 * El lector de antes tomaba la PRIMERA fila de la primera tabla como títulos
 * —en esa hoja, el membrete— y no reconocía ninguna columna. Además la web
 * lo llamaba por `/api/api/…` y nunca llegó a funcionar.
 *
 * Aquí: se deshacen las uniones (cada celda ocupa su sitio en la rejilla),
 * se busca la fila de títulos donde esté, se leen las filas del plan hasta
 * «Entregado por» u «Observaciones», cada evaluación va a SU semana («Semana
 * 3 · 28/09/2026 al 02/10/2026» → semana 3), y la cabecera rellena los datos
 * del plan. Si el Word trae el plan de dos años seguidos, se toma el primero.
 */

export interface FilaImportada {
    /** La semana del plan, si la fila dice «Semana N». */
    semana: number | null;
    datos: Record<string, string>;
}

export interface PlanImportado {
    filas: FilaImportada[];
    metadatos: Record<string, string | number>;
}

type Rejilla = string[][];

/** El texto de una celda, con un salto por cada párrafo (Word los separa así). */
function textoDe($: cheerio.CheerioAPI, celda: any): string {
    const parrafos = $(celda)
        .find('p')
        .map((_, p) => $(p).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter(Boolean);
    if (!parrafos.length) return $(celda).text().replace(/\s+/g, ' ').trim();
    // En la hoja del MPPE el texto de una celda estrecha se parte a mano en
    // párrafos («Interacciones que» / «explican el movimiento»): si el
    // siguiente sigue en minúscula y el anterior no cierra la frase, es la
    // misma línea. «SER…» / «HACER…» empiezan en mayúscula y se quedan aparte.
    return parrafos
        .reduce<string[]>((lineas, p) => {
            const ultima = lineas[lineas.length - 1];
            if (ultima !== undefined && /^[a-zñáéíóú(]/.test(p) && !/[.:;]$/.test(ultima)) lineas[lineas.length - 1] = `${ultima} ${p}`;
            else lineas.push(p);
            return lineas;
        }, [])
        .join('\n');
}

/** La tabla con las uniones deshechas: cada celda repetida en todo lo que abarca. */
function rejillaDe($: cheerio.CheerioAPI, tabla: any): Rejilla {
    const rejilla: Rejilla = [];
    $(tabla)
        .find('tr')
        .each((f, tr) => {
            rejilla[f] = rejilla[f] ?? [];
            let c = 0;
            $(tr)
                .children('td,th')
                .each((_, celda) => {
                    while (rejilla[f][c] !== undefined) c++;
                    const ancho = Math.max(1, Math.min(20, Number($(celda).attr('colspan')) || 1));
                    const alto = Math.max(1, Math.min(100, Number($(celda).attr('rowspan')) || 1));
                    const t = textoDe($, celda);
                    for (let df = 0; df < alto; df++) {
                        rejilla[f + df] = rejilla[f + df] ?? [];
                        for (let dc = 0; dc < ancho; dc++) rejilla[f + df][c + dc] = t;
                    }
                    c += ancho;
                });
        });
    return rejilla.map((fila) => Array.from(fila, (v) => v ?? ''));
}

const sinTildes = (t: string) =>
    t
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');

/** De qué columna del plan es un título. `null` = no es de ninguna. */
export function columnaDelTitulo(titulo: string): string | null {
    const t = sinTildes(titulo);
    if (!t) return null;
    if (t.includes('criterio')) return 'criterios';
    if (t.includes('tema') && t.includes('generador')) return 'title';
    if (t.includes('tejido')) return 'label';
    if (t.includes('referente') || t.includes('teorico')) return 'textContent';
    if (t.includes('enfasis')) return 'enfasis';
    if (t.includes('fecha') || /^semanas?$/.test(t)) return 'fecha';
    if (t.includes('tecnica')) return 'tecnicas';
    if (t.includes('instrumento')) return 'instrumentos';
    if (t.includes('tipo')) return 'tipoEvaluacion';
    if (t === '%' || t.includes('ponderacion') || t.includes('porcentaje')) return 'ponderacion';
    if (t.startsWith('pts') || t.includes('punto')) return 'puntos';
    if (t.includes('actividad')) return 'actividadEval';
    return null;
}

/** «14/09/2026» → «2026-09-14»; si no se entiende, `null`. */
function fechaDe(t: string): string | null {
    const m = t.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Los rótulos de la cabecera y a qué dato del plan van. */
const ROTULOS: Array<[RegExp, string]> = [
    [/^docente/, 'nombreDocente'],
    [/^cedula/, 'cedulaDocente'],
    [/^telefono/, 'telefonoDocente'],
    [/^correo/, 'correoDocente'],
    [/^area de formacion/, 'areaFormacion'],
    [/^total de semanas/, 'totalSemanas'],
    [/^desde/, 'fechaDesde'],
    [/^hasta/, 'fechaHasta'],
    [/^referentes eticos/, 'referentesEticos'],
    [/^p\.?e\.?i\.?c/, 'peic'],
    [/^intencionalidad/, 'intencionalidad'],
    [/^tema indispensable/, 'temaIndispensable'],
];

function leerCabecera(filas: Rejilla, metadatos: Record<string, string | number>) {
    for (const fila of filas) {
        // Las celdas distintas, en orden (una unida sale repetida en la rejilla).
        const celdas = fila.filter((t, i) => i === 0 || t !== fila[i - 1]);
        celdas.forEach((t, i) => {
            const rotulo = sinTildes(t).replace(/:$/, '').trim();
            const campo = ROTULOS.find(([re]) => re.test(rotulo))?.[1];
            const valor = celdas[i + 1]?.trim();
            if (!campo || !valor || metadatos[campo] !== undefined) return;
            if (campo === 'totalSemanas') {
                const n = parseInt(valor, 10);
                if (n > 0 && n < 60) metadatos[campo] = n;
            } else if (campo === 'fechaDesde' || campo === 'fechaHasta') {
                const f = fechaDe(valor);
                if (f) metadatos[campo] = f;
            } else {
                metadatos[campo] = valor.slice(0, 500);
            }
        });
    }
}

export function leerPlanDeWord(html: string): PlanImportado {
    const $ = cheerio.load(html);
    const tablas = $('table').toArray();
    for (const tabla of tablas) {
        const rejilla = rejillaDe($, tabla);
        if (rejilla.length > 500) throw new Error('DEMASIADAS_FILAS');

        // La fila de títulos: la primera con tres o más columnas del plan.
        const inicio = rejilla.findIndex((fila) => new Set(fila.map(columnaDelTitulo).filter(Boolean)).size >= 3);
        if (inicio < 0) continue;

        // Columna por columna; una segunda fila de títulos («Actividad» bajo
        // «Estrategias de evaluación», «%» bajo «Ponderación») afina la primera.
        const columnas: Array<string | null> = rejilla[inicio].map(columnaDelTitulo);
        let primeraDeDatos = inicio + 1;
        const segunda = rejilla[inicio + 1] ?? [];
        const deLaSegunda = segunda.map((t, i) => (t !== rejilla[inicio][i] ? columnaDelTitulo(t) : null));
        if (deLaSegunda.filter(Boolean).length >= 2) {
            deLaSegunda.forEach((k, i) => {
                if (k) columnas[i] = k;
            });
            primeraDeDatos++;
        }

        const filas: FilaImportada[] = [];
        let enfasis = '';
        for (let f = primeraDeDatos; f < rejilla.length; f++) {
            const fila = rejilla[f];
            const primera = sinTildes(fila[0] ?? '');
            // Se acaba el plan: la entrega, las observaciones, o empieza otro plan.
            if (/^(entregado por|observaciones?:?$|observaciones:)/.test(primera)) break;
            if (new Set(fila.map(columnaDelTitulo).filter(Boolean)).size >= 3) break;
            if (fila.some((t) => /^(republica bolivariana|plan de lapso)/.test(sinTildes(t)))) break;

            const datos: Record<string, string> = {};
            let semana: number | null = null;
            columnas.forEach((k, i) => {
                if (!k) return;
                const t = (fila[i] ?? '').trim();
                if (!t || datos[k] === t) return;
                if (k === 'fecha') {
                    const s = t.match(/semana\s*(\d{1,2})/i);
                    if (s) semana = Number(s[1]);
                    return;
                }
                if (k === 'enfasis') {
                    enfasis = enfasis || t;
                    return;
                }
                datos[k] = datos[k] ? `${datos[k]}\n${t}` : t;
            });
            // «25%» → «25»; «5 pts.» → «5»: la pantalla recalcula uno con el otro.
            if (datos.ponderacion) datos.ponderacion = (datos.ponderacion.match(/[\d.,]+/)?.[0] ?? '').replace(',', '.');
            if (datos.puntos) datos.puntos = (datos.puntos.match(/[\d.,]+/)?.[0] ?? '').replace(',', '.');
            if (Object.values(datos).some(Boolean)) filas.push({ semana, datos });
        }

        const metadatos: Record<string, string | number> = {};
        leerCabecera(rejilla.slice(0, inicio), metadatos);
        if (enfasis) metadatos.enfasisCurricular = enfasis;
        const observaciones = rejilla.slice(primeraDeDatos).find((fila) => /^observaciones:?$/.test(sinTildes(fila[0] ?? '').trim()));
        const texto = observaciones?.find((t, i) => i > 0 && t.trim());
        if (texto) metadatos.observaciones = texto.slice(0, 4000);

        if (filas.length) return { filas, metadatos };
    }
    return { filas: [], metadatos: {} };
}
