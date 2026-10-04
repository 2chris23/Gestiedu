import { PrismaClient } from '@prisma/client';
import { boletaDelAlumno } from './boleta.service';
import { getAcademicConfig } from './promotion/close-cycle.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { DatosDelAlumno, TIPOS_QUE_NO_RESTAN, ordenarElCuadro, sabadoDeLaFoto } from './reglas-del-cuadro';
import { logger } from '../utils/logger';

/**
 * EL CUADRO DE HONOR: LA FOTO DE LOS SÁBADOS (CUADRO-*, 2026-10-04)
 *
 * Cristian: por lapso y por ciclo completo, que se actualice solo los sábados,
 * y que el estudiante vea en su perfil su puntaje y cuántos puestos subió.
 *
 * Antes (Antigravity) se calculaba en cada visita al Inicio, con notas sueltas
 * en crudo, la asistencia y las observaciones de toda la vida, pesos fijos en
 * el código y cinco alumnos inventados si no había datos. Ahora:
 *
 *   - El promedio es el de la BOLETA (`boletaDelAlumno`): el mismo número que
 *     el alumno ve impreso, por lapso y el definitivo del ciclo. Sin notas en
 *     el período, no entra al cuadro.
 *   - La asistencia y las observaciones, solo las de las fechas del período.
 *   - Los pesos, los del liceo (`AcademicConfig.cuadroDeHonor`).
 *   - Se guarda una foto por sábado (`cuadro_de_honor`); la pantalla lee la
 *     última, y «subió N puestos» compara con la de antes.
 */

export const CICLO = 'CICLO';
/** Cuántos alumnos se calculan a la vez (cada boleta son varias consultas). */
const A_LA_VEZ = 4;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

interface Periodo {
    alcance: string;
    desde: Date;
    hasta: Date;
}

/** El ciclo en curso, sus lapsos ya empezados y el ciclo entero. */
async function periodosDelCiclo(prisma: PrismaClient, hoy: string) {
    const ciclo = await prisma.academicYear.findFirst({
        where: { status: 'ACTIVE' as any },
        orderBy: { startDate: 'desc' },
        include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    if (!ciclo) return null;
    const lapsos: Periodo[] = ciclo.periods
        .filter((p) => ymd(p.startDate) <= hoy)
        .map((p) => ({ alcance: p.id, desde: p.startDate, hasta: p.endDate }));
    const periodos: Periodo[] = [...lapsos, { alcance: CICLO, desde: ciclo.startDate, hasta: ciclo.endDate }];
    return { ciclo, periodos };
}

/** ¿Ya está la foto de este sábado? */
export async function hayFoto(prisma: PrismaClient, academicYearId: string, fecha: string): Promise<boolean> {
    return (await (prisma as any).puntajeDelCuadro.count({ where: { academicYearId, fecha: new Date(`${fecha}T00:00:00Z`) } })) > 0;
}

/**
 * Saca la foto del sábado si falta. Se llama al arrancar y cada pocas horas:
 * si el servidor estuvo apagado el sábado, la saca después; si ya está, no
 * hace nada. Devuelve cuántos alumnos entraron (0 si no tocaba).
 */
export async function sacarLaFotoSiFalta(prisma: PrismaClient, instituteId: string, hoyForzado?: string): Promise<number> {
    const hoy = hoyForzado ?? todayInTimezone(await instituteTimezone(prisma));
    const fecha = sabadoDeLaFoto(hoy);
    const delCiclo = await periodosDelCiclo(prisma, hoy);
    if (!delCiclo) return 0;
    if (await hayFoto(prisma, delCiclo.ciclo.id, fecha)) return 0;
    return sacarLaFoto(prisma, instituteId, fecha, hoy);
}

/** Calcula el cuadro de todos los alumnos del ciclo y lo guarda como la foto de `fecha`. */
export async function sacarLaFoto(prisma: PrismaClient, instituteId: string, fecha: string, hoy: string): Promise<number> {
    const delCiclo = await periodosDelCiclo(prisma, hoy);
    if (!delCiclo) return 0;
    const { ciclo, periodos } = delCiclo;
    const config = await getAcademicConfig(instituteId);

    // Los alumnos inscritos en el ciclo, con su año.
    const inscritos = await prisma.studentClassroom.findMany({
        where: { academicYearId: ciclo.id, isActive: true, student: { status: 'ACTIVE' as any, role: 'STUDENT' as any } },
        select: { studentId: true, classroom: { select: { grade: true } } },
    });
    const gradoDe = new Map<string, number>();
    for (const i of inscritos) gradoDe.set(i.studentId, i.classroom.grade);
    const ids = [...gradoDe.keys()];
    if (!ids.length) return 0;

    // El promedio de la boleta de cada uno, por lapso y el definitivo (de a pocos).
    const promedios = new Map<string, Record<string, number | null>>();
    for (let i = 0; i < ids.length; i += A_LA_VEZ) {
        await Promise.all(
            ids.slice(i, i + A_LA_VEZ).map(async (id) => {
                try {
                    const b = await boletaDelAlumno(prisma, instituteId, id, { academicYearId: ciclo.id, hoy });
                    const p: Record<string, number | null> = { [CICLO]: b.promedios.definitivo };
                    for (const per of periodos) if (per.alcance !== CICLO) p[per.alcance] = b.promedios[per.alcance] ?? null;
                    promedios.set(id, p);
                } catch (e) {
                    logger.warn('Cuadro de honor: no se pudo leer la boleta de un alumno', { error: e instanceof Error ? e.message : String(e) });
                }
            })
        );
        // Que la tarea no acapare el proceso que atiende a todos.
        await new Promise((r) => setImmediate(r));
    }

    const filas: any[] = [];
    for (const per of periodos) {
        const [asistencia, observaciones] = await Promise.all([
            prisma.dailyAttendance.groupBy({
                by: ['studentId', 'status'],
                where: { studentId: { in: ids }, date: { gte: per.desde, lte: per.hasta } },
                _count: { _all: true },
            }),
            prisma.observation.groupBy({
                by: ['studentId'],
                where: { studentId: { in: ids }, date: { gte: per.desde, lte: per.hasta }, type: { notIn: TIPOS_QUE_NO_RESTAN } },
                _count: { _all: true },
            }),
        ]);
        const dias = new Map<string, { total: number; vino: number }>();
        for (const a of asistencia as Array<{ studentId: string; status: string; _count: { _all: number } }>) {
            const d = dias.get(a.studentId) ?? { total: 0, vino: 0 };
            d.total += a._count._all;
            if (a.status === 'PRESENT' || a.status === 'LATE') d.vino += a._count._all;
            dias.set(a.studentId, d);
        }
        const obs = new Map(observaciones.map((o) => [o.studentId, o._count._all]));

        const datos: DatosDelAlumno[] = [];
        for (const id of ids) {
            const promedio = promedios.get(id)?.[per.alcance];
            if (promedio === null || promedio === undefined) continue;
            const d = dias.get(id);
            datos.push({
                studentId: id,
                grado: gradoDe.get(id)!,
                promedio,
                asistencia: d && d.total > 0 ? Math.round((d.vino * 100) / d.total) : 100,
                observaciones: obs.get(id) ?? 0,
            });
        }
        for (const f of ordenarElCuadro(datos, config.cuadroDeHonor)) {
            filas.push({
                studentId: f.studentId,
                academicYearId: ciclo.id,
                alcance: per.alcance,
                fecha: new Date(`${fecha}T00:00:00Z`),
                grado: f.grado,
                promedio: f.promedio,
                asistencia: f.asistencia,
                observaciones: f.observaciones,
                puntosNotas: f.puntosNotas,
                puntosAsistencia: f.puntosAsistencia,
                resta: f.resta,
                puntaje: f.puntaje,
                puestoLiceo: f.puestoLiceo,
                puestoAno: f.puestoAno,
            });
        }
    }
    if (!filas.length) return 0;
    // Única por (alumno, ciclo, alcance, sábado): dos procesos a la vez, una foto.
    for (let i = 0; i < filas.length; i += 1000) {
        await (prisma as any).puntajeDelCuadro.createMany({ data: filas.slice(i, i + 1000), skipDuplicates: true });
    }
    return new Set(filas.map((f) => f.studentId)).size;
}

/** La última foto (y la anterior) de un ciclo. */
export async function ultimasFotos(prisma: PrismaClient, academicYearId: string): Promise<{ ultima: Date | null; anterior: Date | null }> {
    const fechas = (await (prisma as any).puntajeDelCuadro.findMany({
        where: { academicYearId },
        distinct: ['fecha'],
        select: { fecha: true },
        orderBy: { fecha: 'desc' },
        take: 2,
    })) as Array<{ fecha: Date }>;
    return { ultima: fechas[0]?.fecha ?? null, anterior: fechas[1]?.fecha ?? null };
}
