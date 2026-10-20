import { FastifyReply, FastifyRequest } from 'fastify';
import { cifrasOficialesDeLaSeccion, estaEnRiesgo, promedioOficial } from '../../services/cifras-oficiales.service';
import { getAcademicConfig } from '../../services/promotion/configuracion-academica';

function puedeVerLosNumeros(request: FastifyRequest, classroom: { teacherId: string | null }): boolean {
  const u = request.user as any;
  if (u?.role === 'ADMIN') return true;
  return u?.role === 'TEACHER' && !!classroom.teacherId && classroom.teacherId === (u.userId ?? u.id);
}

/**
 * Obtener estadísticas académicas de una sección/aula específica (Promedio, Riesgo, Ocupación, Asistencia, Observaciones)
 */
export const getClassroomStats = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const { periodId } = request.query as { periodId?: string };
    const prisma = request.tenantPrisma;

    // Buscar aula por ID o por slug
    const classroom = await prisma.classroom.findFirst({
      where: {
        OR: [
          { id },
          { slug: id }
        ]
      },
      include: {
        academicYear: { select: { id: true, name: true } },
      }
    });

    if (!classroom) {
      return reply.status(404).send({ error: 'Aula/Sección no encontrada' });
    }
    if (!puedeVerLosNumeros(request, classroom)) {
      return reply.status(403).send({ error: 'Los promedios de la sección son de su guía y del administrador', code: 'FORBIDDEN' });
    }

    const classroomId = classroom.id;

    // Obtener todos los estudiantes activos en esta sección
    const studentClassrooms = await prisma.studentClassroom.findMany({
      where: { classroomId, isActive: true },
      select: { studentId: true }
    });

    const studentIds = studentClassrooms.map(sc => sc.studentId);
    const totalStudents = studentIds.length;
    const totalCapacity = classroom.capacity || 35;

    // 1. Observaciones registradas para estudiantes de esta sección (filtradas por lapso si se indica)
    let obsPeriodFilter: any = {};
    if (periodId) {
      const period = await prisma.period.findUnique({
        where: { id: periodId },
        select: { startDate: true, endDate: true },
      });
      if (period) {
        obsPeriodFilter = {
          gte: period.startDate,
          lte: period.endDate,
        };
      }
    }

    const observationsCount = studentIds.length > 0 ? await prisma.observation.count({
      where: {
        studentId: { in: studentIds },
        ...(obsPeriodFilter.gte ? { date: obsPeriodFilter } : {}),
      }
    }) : 0;

    // 2. Asistencia promedio de los estudiantes de la sección (filtrada por lapso si se indica)
    let attendancePercentage: number | null = null;
    if (studentIds.length > 0) {
      const params: any[] = [...studentIds];
      let dateCondition = '';
      if (obsPeriodFilter.gte && obsPeriodFilter.lte) {
        params.push(obsPeriodFilter.gte, obsPeriodFilter.lte);
        dateCondition = ` AND a."date" >= $${params.length - 1} AND a."date" <= $${params.length}`;
      }
      const attendanceQuery = `
        SELECT
          COUNT(a.id) as "totalCount",
          CAST(COALESCE(
            (COUNT(CASE WHEN a.status IN ('PRESENT', 'LATE') THEN 1 END) * 100.0) /
            NULLIF(COUNT(a.id), 0),
            0
          ) AS FLOAT) as "attendancePercentage"
        FROM daily_attendance a
        WHERE a."studentId" IN (${studentIds.map((_, i) => `$${i + 1}`).join(',')})${dateCondition}
      `;
      const result = await prisma.$queryRawUnsafe<Array<{ totalCount: string | number; attendancePercentage: number }>>(attendanceQuery, ...params);
      const totalCount = Number(result[0]?.totalCount || 0);
      if (totalCount > 0) {
        attendancePercentage = Math.round(Number(result[0]?.attendancePercentage || 0));
      }
    }

    // 3. Calificaciones y Promedios
    let average = 0;
    let minAverage = 0;
    let maxAverage = 0;
    let riskCount = 0;
    let studentsWithGrades = 0;

    if (studentIds.length > 0) {
      let minPassing = 10;
      try {
        const instId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
        if (instId) {
          const config = await getAcademicConfig(instId);
          minPassing = typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
        }
      } catch {
        minPassing = 10;
      }

      // La cifra OFICIAL de cada alumno (la de su boleta, `cifras-oficiales.service`):
      // antes se hacía la media a pelo de la tabla de notas, sin Clase en Vivo
      // ni el plan, y el máximo salía 13,7 con un alumno en 17,47.
      const instId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
      const oficiales = instId ? await cifrasOficialesDeLaSeccion(prisma as any, instId, classroomId, studentIds) : new Map();

      let sumStudentAverages = 0;
      let currentMin = 20;
      let currentMax = 0;

      studentIds.forEach(sid => {
        const c = oficiales.get(sid);
        const avg = promedioOficial(c, periodId);
        if (avg === null) return;
        sumStudentAverages += avg;
        studentsWithGrades += 1;
        if (avg < currentMin) currentMin = avg;
        if (avg > currentMax) currentMax = avg;
        if (estaEnRiesgo(c, minPassing, periodId).enRiesgo) riskCount += 1;
      });

      if (studentsWithGrades > 0) {
        average = Math.round((sumStudentAverages / studentsWithGrades) * 100) / 100;
        minAverage = currentMin;
        maxAverage = currentMax;
      }
    }

    return reply.status(200).send({
      average: studentsWithGrades > 0 ? average : null,
      minAverage: studentsWithGrades > 0 ? minAverage : null,
      maxAverage: studentsWithGrades > 0 ? maxAverage : null,
      riskCount,
      occupancy: `${totalStudents}/${totalCapacity}`,
      attendance: attendancePercentage !== null ? `${attendancePercentage}%` : null,
      observations: observationsCount
    });

  } catch (error) {
    request.log.error({ error }, 'Error al obtener estadísticas del aula');
    return reply.status(500).send({
      error: 'Error en el servidor al obtener estadísticas de la sección',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};
