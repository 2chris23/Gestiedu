import { AppErrors, createError } from '../middleware/error.middleware';
import { getAcademicConfig } from './promotion/close-cycle.service';
import { datosDelPlantel, mencionDelLiceo } from './constancias.service';

/**
 * LOS GRADUANDOS Y SU TÍTULO DE BACHILLER
 *
 * Del último año del liceo (5to, o 6to en media técnica):
 *
 *   - **Antes de cerrar el año**: los inscritos en ese año, «por cerrar». Sirve
 *     para preparar el acto de grado; el título todavía no se anota.
 *   - **Cerrado el año**: los que EGRESARON (lo decide el cierre, con la labor
 *     social y las pendientes según el liceo: `egresoDe`), y los que no
 *     egresaron todavía («pendiente»), aparte.
 *
 * Por egresado, el admin anota la mención (la del liceo por defecto:
 * `academicConfig.titulo.mencion`), el serial del título y la fecha de
 * expedición. El serial no se repite en el liceo (409). La lista sale para
 * imprimir; la constancia de título en trámite es una constancia más
 * (`constancias.service`, TITULO_EN_TRAMITE).
 *
 * Pruebas: `tests/integration/graduandos.test.ts` (TIT-*).
 */

const nombre = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

async function elAno(prisma: any, idONombre: string) {
    const ano = await prisma.academicYear.findFirst({
        where: { OR: [{ id: idONombre }, { name: idONombre }] },
        select: { id: true, name: true, status: true },
    });
    if (!ano) throw AppErrors.NotFound('Año escolar');
    return ano;
}

export async function graduandos(prisma: any, instituteId: string, idONombre: string, hoy: string) {
    const ano = await elAno(prisma, idONombre);
    const config = await getAcademicConfig(instituteId);
    const ultimo = config.maxGradeLevel;
    const cerrado = ano.status === 'COMPLETED';
    const [mencion, plantel] = await Promise.all([mencionDelLiceo(instituteId), datosDelPlantel(instituteId, hoy)]);

    const inscripciones = await prisma.studentClassroom.findMany({
        where: { academicYearId: ano.id, classroom: { grade: ultimo }, ...(cerrado ? {} : { isActive: true }) },
        select: {
            classroom: { select: { name: true } },
            student: { select: { id: true, firstName: true, lastName: true, tipoDeCedula: true } },
        },
    });
    const [expedientes, titulos] = await Promise.all([
        prisma.academicRecord.findMany({
            where: { academicYearId: ano.id, studentId: { in: inscripciones.map((i: any) => i.student.id) } },
            select: { studentId: true, egreso: true },
        }),
        prisma.titulo.findMany({ where: { academicYearId: ano.id } }),
    ]);
    const egresoDe = new Map<string, string | null>(expedientes.map((e: any) => [e.studentId, e.egreso]));
    const tituloDe = new Map<string, any>(titulos.map((t: any) => [t.studentId, t]));

    const lista = inscripciones
        .map((i: any) => {
            const t = tituloDe.get(i.student.id);
            const egreso = egresoDe.get(i.student.id);
            const estado = !cerrado ? 'POR_CERRAR' : egreso === 'EGRESADO' ? 'EGRESADO' : egreso === 'PENDIENTE' ? 'PENDIENTE' : null;
            return {
                alumno: { id: i.student.id, nombre: nombre(i.student), apellidos: i.student.lastName, tipoDeCedula: i.student.tipoDeCedula },
                seccion: i.classroom.name,
                estado,
                titulo: t ? { mencion: t.mencion, serial: t.serial, fechaDeExpedicion: t.fechaDeExpedicion?.toISOString().slice(0, 10) ?? null } : null,
            };
        })
        // Cerrado el año, los que ni egresaron ni quedaron pendientes (repitieron) no son graduandos.
        .filter((g: any) => g.estado !== null)
        .sort((a: any, b: any) => a.alumno.apellidos.localeCompare(b.alumno.apellidos, 'es'));

    return {
        ciclo: { id: ano.id, nombre: ano.name, cerrado },
        grado: ultimo,
        mencion,
        liceo: plantel.liceo,
        firmante: plantel.firmante,
        graduandos: lista,
        emitidaEl: hoy,
    };
}

export interface DatosDelTitulo {
    mencion?: string | null;
    serial?: string | null;
    fechaDeExpedicion?: string | null;
}

/** Anota (o corrige) el título de un egresado. */
export async function anotarTitulo(prisma: any, instituteId: string, actor: string, idONombre: string, studentId: string, d: DatosDelTitulo) {
    const ano = await elAno(prisma, idONombre);
    const egreso = await prisma.academicRecord.findUnique({
        where: { studentId_academicYearId: { studentId, academicYearId: ano.id } },
        select: { egreso: true },
    });
    if (egreso?.egreso !== 'EGRESADO') throw createError(409, 'El título se anota a quien egresó al cerrar el año', 'NO_EGRESADO');
    const mencion = (d.mencion ?? '').trim() || (await mencionDelLiceo(instituteId));
    const serial = (d.serial ?? '').trim().toUpperCase() || null;
    if (serial && !/^[A-Z0-9-]{3,30}$/.test(serial)) throw createError(400, 'El serial va con letras, números y guiones (3 a 30)', 'TITULO_INVALIDO');
    const fecha = (d.fechaDeExpedicion ?? '').trim() || null;
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw createError(400, 'La fecha de expedición no es válida', 'TITULO_INVALIDO');
    if (serial) {
        const otro = await prisma.titulo.findFirst({ where: { serial, NOT: { studentId, academicYearId: ano.id } }, select: { studentId: true } });
        if (otro) throw createError(409, `Ese serial ya es del título de ${otro.studentId}`, 'SERIAL_REPETIDO');
    }
    const datos = { mencion: mencion.slice(0, 120), serial, fechaDeExpedicion: fecha ? new Date(`${fecha}T00:00:00.000Z`) : null, registradoPor: actor };
    const t = await prisma.titulo.upsert({
        where: { studentId_academicYearId: { studentId, academicYearId: ano.id } },
        create: { studentId, academicYearId: ano.id, ...datos },
        update: datos,
    });
    return { mencion: t.mencion, serial: t.serial, fechaDeExpedicion: t.fechaDeExpedicion?.toISOString().slice(0, 10) ?? null };
}
