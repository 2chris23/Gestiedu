/**
 * EL CALENDARIO ESCOLAR DEL MPPE, COMO PLANTILLA
 *
 * Cada año el Ministerio publica el calendario escolar y cada liceo lo copia a
 * mano en su sistema. Estas son sus reglas de siempre, para el año que se pida
 * (medidas con el de 2025-2026: personal el 8 de septiembre, alumnos el 15,
 * diagnóstico hasta el 15 de octubre, vacaciones del 15 de diciembre al 12 de
 * enero, carnaval 16 y 17 de febrero, Semana Santa 2 y 3 de abril, fin el 31
 * de julio):
 *
 *   - empieza el TERCER lunes de septiembre (los alumnos; el personal, una
 *     semana antes);
 *   - el 1er lapso llega al viernes antes del 15 de diciembre, con un mes de
 *     diagnóstico al principio (el plan de evaluación empieza a los 30 días);
 *   - el 2º, del SEGUNDO lunes de enero al viernes antes de Semana Santa;
 *   - el 3º, del lunes después de Pascua al 31 de julio.
 *
 * Es solo el punto de partida: todo se puede cambiar después, y cada liceo lo
 * hace (CLAUDE.md, «las reglas de negocio son configurables»).
 *
 * La misma cuenta vive en el servidor (`utils/calendario-mppe.ts`), como
 * `franjas-del-horario`. Pruebas: CAL-MPPE-01…03 en los dos lados.
 */

export interface LapsoDeLaPlantilla {
    nombre: string;
    inicio: string;
    fin: string;
    inicioDelPlan: string | null;
    nombreAntesDelPlan: string | null;
}

export interface FeriadoDeLaPlantilla {
    nombre: string;
    desde: string;
    hasta: string;
}

export interface PlantillaDelAnoEscolar {
    nombre: string;
    inicio: string;
    fin: string;
    /** Cuándo empieza el personal (docentes y administrativos). */
    inicioDelPersonal: string;
    lapsos: LapsoDeLaPlantilla[];
    feriados: FeriadoDeLaPlantilla[];
}

const DIA = 24 * 60 * 60 * 1000;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const ymd = (f: Date) => f.toISOString().slice(0, 10);
const mas = (f: Date, dias: number) => new Date(f.getTime() + dias * DIA);

/** El domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
export function domingoDePascua(anio: number): Date {
    const a = anio % 19;
    const b = Math.floor(anio / 100);
    const c = anio % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return utc(anio, mes, dia);
}

/** El n-ésimo lunes (1 = el primero) de un mes. */
function lunesNumero(anio: number, mes: number, n: number): Date {
    const primero = utc(anio, mes, 1);
    const hastaElLunes = (8 - primero.getUTCDay()) % 7; // 0 si el 1 ya es lunes
    return mas(primero, hastaElLunes + (n - 1) * 7);
}

/** El último viernes ANTES de una fecha (sin contarla). */
function viernesAntesDe(f: Date): Date {
    const atras = ((f.getUTCDay() - 5 + 7) % 7) || 7;
    return mas(f, -atras);
}

export function calendarioComoElMPPE(anioDeInicio: number): PlantillaDelAnoEscolar {
    const siguiente = anioDeInicio + 1;
    const inicio = lunesNumero(anioDeInicio, 9, 3);
    const inicioDelPersonal = mas(inicio, -7);
    const finPrimero = viernesAntesDe(utc(anioDeInicio, 12, 15));
    const inicioSegundo = lunesNumero(siguiente, 1, 2);
    const pascua = domingoDePascua(siguiente);
    const domingoDeRamos = mas(pascua, -7);
    const finSegundo = viernesAntesDe(domingoDeRamos);
    const inicioTercero = mas(pascua, 1);
    const fin = utc(siguiente, 7, 31);

    return {
        nombre: `${anioDeInicio}-${siguiente}`,
        inicio: ymd(inicio),
        fin: ymd(fin),
        inicioDelPersonal: ymd(inicioDelPersonal),
        lapsos: [
            { nombre: 'Primer Lapso', inicio: ymd(inicio), fin: ymd(finPrimero), inicioDelPlan: ymd(mas(inicio, 30)), nombreAntesDelPlan: 'Diagnóstico' },
            { nombre: 'Segundo Lapso', inicio: ymd(inicioSegundo), fin: ymd(finSegundo), inicioDelPlan: null, nombreAntesDelPlan: null },
            { nombre: 'Tercer Lapso', inicio: ymd(inicioTercero), fin: ymd(fin), inicioDelPlan: null, nombreAntesDelPlan: null },
        ],
        feriados: [
            { nombre: 'Día de la Resistencia Indígena', desde: `${anioDeInicio}-10-12`, hasta: `${anioDeInicio}-10-12` },
            { nombre: 'Vacaciones de Navidad', desde: ymd(mas(finPrimero, 1)), hasta: ymd(mas(inicioSegundo, -1)) },
            { nombre: 'Carnaval', desde: ymd(mas(pascua, -48)), hasta: ymd(mas(pascua, -47)) },
            { nombre: 'Semana Santa', desde: ymd(mas(pascua, -3)), hasta: ymd(mas(pascua, -2)) },
            { nombre: 'Declaración de la Independencia', desde: `${siguiente}-04-19`, hasta: `${siguiente}-04-19` },
            { nombre: 'Día del Trabajador', desde: `${siguiente}-05-01`, hasta: `${siguiente}-05-01` },
            { nombre: 'Batalla de Carabobo', desde: `${siguiente}-06-24`, hasta: `${siguiente}-06-24` },
            { nombre: 'Día de la Independencia', desde: `${siguiente}-07-05`, hasta: `${siguiente}-07-05` },
            { nombre: 'Natalicio del Libertador', desde: `${siguiente}-07-24`, hasta: `${siguiente}-07-24` },
        ],
    };
}
