import { createError } from '../middleware/error.middleware';
import { borrarGuardandoCopia, type QuienBorra } from '../utils/papelera';

/**
 * EL COMEDOR (PAE)
 *
 * Un módulo que el liceo activa o no, como los pagos (Configuración →
 * «Comedor (PAE)»). Apagado, sus rutas responden 403 `PAE_APAGADO` y no sale
 * en el menú. Solo el admin (decidido: dar acceso a la gente del comedor
 * pediría un rol nuevo solo para eso).
 *
 * Por día y comida (desayuno, almuerzo, merienda: las que dé el liceo): las
 * raciones recibidas y las servidas, el menú y lo que haya que anotar. Un
 * registro por día y comida. El resumen del mes cuenta días servidos,
 * raciones recibidas y servidas, y la diferencia.
 *
 * Pruebas: `tests/integration/pae.test.ts` (PAE-*).
 */

export const COMIDAS_POR_DEFECTO = ['DESAYUNO', 'ALMUERZO'];
const COMIDAS_POSIBLES = ['DESAYUNO', 'ALMUERZO', 'MERIENDA', 'CENA'];
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-\d{2}$/;

const mal = (mensaje: string, code = 'PAE_DATOS_INVALIDOS') => createError(400, mensaje, code);

export async function configDelComedor(prisma: any) {
    const fila = await prisma.paeConfig.findUnique({ where: { id: 'liceo' } });
    const comidas = Array.isArray(fila?.comidas) && fila.comidas.length > 0 ? (fila.comidas as string[]) : COMIDAS_POR_DEFECTO;
    return { enabled: Boolean(fila?.enabled), comidas };
}

export async function guardarConfigDelComedor(prisma: any, datos: { enabled: boolean; comidas: string[] }) {
    if (typeof datos?.enabled !== 'boolean') throw mal('Falta decir si el comedor está activo');
    const comidas = [...new Set((datos.comidas ?? []).map((c) => String(c).toUpperCase()))];
    if (comidas.length === 0) throw mal('Elige al menos una comida');
    const raras = comidas.filter((c) => !COMIDAS_POSIBLES.includes(c));
    if (raras.length) throw mal(`Comida desconocida: ${raras.join(', ')}`);
    await prisma.paeConfig.upsert({
        where: { id: 'liceo' },
        update: { enabled: datos.enabled, comidas },
        create: { id: 'liceo', enabled: datos.enabled, comidas },
    });
    return configDelComedor(prisma);
}

/** Apagado, nada del comedor responde. */
export async function exigirComedorActivo(prisma: any) {
    const c = await configDelComedor(prisma);
    if (!c.enabled) throw createError(403, 'El comedor (PAE) no está activado en este liceo', 'PAE_APAGADO');
    return c;
}

const comoDia = (d: Date) => d.toISOString().slice(0, 10);
const deLaFila = (r: any) => ({
    fecha: comoDia(r.fecha),
    comida: r.comida,
    recibidas: r.recibidas,
    servidas: r.servidas,
    menu: r.menu ?? null,
    observaciones: r.observaciones ?? null,
});

/** Lo del mes («YYYY-MM») y su resumen. */
export async function registrosDelMes(prisma: any, mes: string) {
    const c = await exigirComedorActivo(prisma);
    if (!MES.test(mes)) throw mal('Mes inválido (AAAA-MM)');
    const [y, m] = mes.split('-').map(Number);
    const desde = new Date(Date.UTC(y, m - 1, 1));
    const hasta = new Date(Date.UTC(y, m, 1));
    const filas = await prisma.paeRegistro.findMany({
        where: { fecha: { gte: desde, lt: hasta } },
        orderBy: [{ fecha: 'asc' }, { comida: 'asc' }],
    });
    const registros = filas.map(deLaFila);
    const porComida = c.comidas.map((comida) => {
        const suyas = registros.filter((r: any) => r.comida === comida);
        const recibidas = suyas.reduce((s: number, r: any) => s + r.recibidas, 0);
        const servidas = suyas.reduce((s: number, r: any) => s + r.servidas, 0);
        return { comida, dias: suyas.length, recibidas, servidas, diferencia: recibidas - servidas };
    });
    const recibidas = registros.reduce((s: number, r: any) => s + r.recibidas, 0);
    const servidas = registros.reduce((s: number, r: any) => s + r.servidas, 0);
    return {
        mes,
        comidas: c.comidas,
        registros,
        resumen: {
            diasServidos: new Set(registros.map((r: any) => r.fecha)).size,
            recibidas,
            servidas,
            diferencia: recibidas - servidas,
            porComida,
        },
    };
}

/** Anota (o corrige) lo de un día y una comida. */
export async function registrarDia(
    prisma: any,
    fecha: string,
    comida: string,
    datos: { recibidas: number; servidas: number; menu?: string | null; observaciones?: string | null },
    quien: string | null,
    hoy: string
) {
    const c = await exigirComedorActivo(prisma);
    if (!DIA.test(fecha)) throw mal('Fecha inválida (AAAA-MM-DD)');
    if (fecha > hoy) throw mal('No se anota el comedor de un día que no ha llegado', 'FUTURE_DATE');
    const laComida = String(comida).toUpperCase();
    if (!c.comidas.includes(laComida)) throw mal(`El liceo no da ${laComida.toLowerCase()} en el comedor`);
    const entero = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 100000;
    if (!entero(datos?.recibidas) || !entero(datos?.servidas)) throw mal('Las raciones son números enteros, de 0 en adelante');
    const valores = {
        recibidas: datos.recibidas,
        servidas: datos.servidas,
        menu: datos.menu?.trim() || null,
        observaciones: datos.observaciones?.trim() || null,
        registradoPor: quien,
    };
    const fila = await prisma.paeRegistro.upsert({
        where: { fecha_comida: { fecha: new Date(`${fecha}T00:00:00.000Z`), comida: laComida } },
        update: valores,
        create: { fecha: new Date(`${fecha}T00:00:00.000Z`), comida: laComida, ...valores },
    });
    // Se sirvió más de lo que llegó: no se prohíbe (pudo quedar de otro día),
    // pero se dice, que es justo lo que la zona pregunta.
    const aviso =
        datos.servidas > datos.recibidas
            ? `Se sirvieron ${datos.servidas - datos.recibidas} raciones más de las recibidas: anota de dónde salieron en las observaciones.`
            : null;
    return { registro: deLaFila(fila), aviso };
}

/** Quita lo de un día y una comida (con copia en la papelera). */
export async function borrarDia(prisma: any, fecha: string, comida: string, quien: QuienBorra) {
    await exigirComedorActivo(prisma);
    if (!DIA.test(fecha)) throw mal('Fecha inválida (AAAA-MM-DD)');
    const n = await borrarGuardandoCopia(
        prisma,
        'paeRegistro',
        { fecha: new Date(`${fecha}T00:00:00.000Z`), comida: String(comida).toUpperCase() },
        quien
    );
    if (!n) throw createError(404, 'No hay nada anotado ese día en esa comida', 'NOT_FOUND');
    return { borrado: true };
}
