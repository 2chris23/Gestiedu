import { QuienPide, incluir, comoFila, cicloEnCurso, ymdDe, cronogramaDelCiclo } from '../materias-pendientes.service';
import { createError } from '../../middleware/error.middleware';
import { borrarGuardandoCopia } from '../../utils/papelera';
import { getAcademicConfig } from '../promotion/configuracion-academica';
import { asignarLasClases } from '../promotion/clase-de-la-pendiente';

// ── EL CRONOGRAMA ──────────────────────────────────────────────────────────

export interface MomentoDelCronograma {
    numero: number;
    desde1: string;
    hasta1: string;
    desde2: string | null;
    hasta2: string | null;
}

const masDias = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** El n-ésimo lunes de un mes (UTC). */
function lunes(ano: number, mes: number, n = 1): Date {
    const primero = new Date(Date.UTC(ano, mes, 1));
    const hasta = (8 - primero.getUTCDay()) % 7; // días hasta el primer lunes
    return masDias(primero, hasta + (n - 1) * 7);
}

/**
 * Las fechas que se proponen sin guardar nada: las de la Circular 0007 (una
 * semana en octubre, diciembre, enero y junio, y la 2ª opción la semana
 * siguiente). Con otro número de momentos, repartidos de octubre a junio.
 */
export function cronogramaPropuesto(inicioDelAno: Date, momentos: number): MomentoDelCronograma[] {
    const ano = inicioDelAno.getUTCMonth() >= 6 ? inicioDelAno.getUTCFullYear() : inicioDelAno.getUTCFullYear() - 1;
    const semanas: Date[] =
        momentos === 4
            ? [lunes(ano, 9), lunes(ano, 11), lunes(ano + 1, 0, 4), lunes(ano + 1, 5)]
            : Array.from({ length: momentos }, (_, i) => {
                  const mes = 9 + (momentos === 1 ? 8 : Math.round((i * 8) / (momentos - 1)));
                  return lunes(ano + Math.floor(mes / 12), mes % 12);
              });
    return semanas.map((d, i) => ({
        numero: i + 1,
        desde1: ymdDe(d),
        hasta1: ymdDe(masDias(d, 4)),
        desde2: ymdDe(masDias(d, 7)),
        hasta2: ymdDe(masDias(d, 11)),
    }));
}

/** El cronograma de un año (el en curso si no se dice): lo guardado o lo que se propone. */
export async function cronograma(prisma: any, instituteId: string, cicloId?: string) {
    const id = cicloId ?? (await cicloEnCurso(prisma));
    const config = await getAcademicConfig(instituteId);
    if (!id) return { cicloId: null, ciclo: null, propuesto: true, momentos: [] as MomentoDelCronograma[] };
    return cronogramaDelCiclo(prisma, id, config.pendientes.momentos);
}

/** El admin guarda las fechas de los momentos de un año. Cada ventana, de su inicio a su fin; la 2ª, después de la 1ª. */
export async function guardarCronograma(prisma: any, instituteId: string, quien: QuienPide, cicloId: string, momentos: MomentoDelCronograma[]) {
    const ciclo = await prisma.academicYear.findUnique({ where: { id: cicloId }, select: { id: true } });
    if (!ciclo) throw createError(404, 'Año escolar no encontrado', 'NOT_FOUND');
    const config = await getAcademicConfig(instituteId);
    const fecha = /^\d{4}-\d{2}-\d{2}$/;
    const numeros = new Set<number>();
    for (const m of momentos) {
        const bien =
            Number.isInteger(m.numero) &&
            m.numero >= 1 &&
            m.numero <= config.pendientes.momentos &&
            !numeros.has(m.numero) &&
            fecha.test(m.desde1) &&
            fecha.test(m.hasta1) &&
            m.desde1 <= m.hasta1 &&
            (m.desde2 == null) === (m.hasta2 == null) &&
            (m.desde2 == null || (fecha.test(m.desde2) && fecha.test(m.hasta2!) && m.desde2 <= m.hasta2! && m.desde2 > m.hasta1));
        if (!bien) throw createError(400, `Las fechas del momento ${m.numero} no cuadran: cada opción va de su inicio a su fin, y la 2ª después de la 1ª`, 'FECHAS_INVALIDAS');
        numeros.add(m.numero);
    }
    const dia = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
    await prisma.$transaction(async (tx: any) => {
        for (const m of momentos) {
            const datos = { desde1: dia(m.desde1)!, hasta1: dia(m.hasta1)!, desde2: dia(m.desde2), hasta2: dia(m.hasta2) };
            await tx.momentoDePendiente.upsert({
                where: { cicloId_numero: { cicloId, numero: m.numero } },
                update: datos,
                create: { cicloId, numero: m.numero, ...datos },
            });
        }
        // Los momentos de más (el liceo bajó cuántos hay) se van, con su copia.
        await borrarGuardandoCopia(tx, 'momentoDePendiente', { cicloId, numero: { gt: config.pendientes.momentos } }, { usuarioId: quien.id, motivo: 'momento del cronograma de pendientes que ya no existe' });
    });
    return cronogramaDelCiclo(prisma, cicloId, config.pendientes.momentos);
}

/**
 * El acta de compromiso de un alumno: sus materias pendientes de un año, con
 * quién las evalúa. De aquí sale la hoja que firman el alumno, su
 * representante y los docentes.
 */
export async function actaDeCompromiso(prisma: any, studentId: string, cicloId?: string) {
    const alumno = await prisma.user.findUnique({
        where: { id: studentId },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            studentTutorings: { select: { relationship: true, tutor: { select: { firstName: true, lastName: true, id: true } } } },
        },
    });
    if (!alumno || alumno.role !== 'STUDENT') throw createError(404, 'Estudiante no encontrado', 'NOT_FOUND');
    const ciclo = cicloId ?? (await cicloEnCurso(prisma));
    if (ciclo) await asignarLasClases(prisma, ciclo);
    const filas = ciclo
        ? await prisma.materiaPendiente.findMany({ where: { studentId, cicloId: ciclo }, include: incluir, orderBy: { gradoDeOrigen: 'asc' } })
        : [];
    const inscripcion = ciclo
        ? await prisma.studentClassroom.findUnique({
              where: { studentId_academicYearId: { studentId, academicYearId: ciclo } },
              select: { classroom: { select: { name: true } } },
          })
        : null;
    return {
        alumno: { cedula: alumno.id, nombre: `${alumno.firstName} ${alumno.lastName}` },
        representantes: (alumno.studentTutorings ?? []).map((t: any) => ({
            nombre: `${t.tutor.firstName} ${t.tutor.lastName}`,
            cedula: t.tutor.id,
            parentesco: t.relationship,
        })),
        seccion: inscripcion?.classroom?.name ?? null,
        ciclo: filas[0]?.ciclo?.name ?? null,
        pendientes: filas.map((p: any) => comoFila(p, inscripcion?.classroom?.name ?? null)),
    };
}
