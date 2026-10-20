import { getRequestInstituteId } from '../academic-years.controller';
import { FastifyReply, FastifyRequest } from 'fastify';
import { cifrasOficialesDelAno, estaEnRiesgo, promedioOficial } from '../../services/cifras-oficiales.service';
import * as closeCycleService from '../../services/promotion/close-cycle.service';

export const getAcademicYearStats = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const { periodId } = request.query as { periodId?: string };
    const prisma = request.tenantPrisma;

    // 1. Validate Year Exists
    const year = await prisma.academicYear.findUnique({ where: { id } });
    if (!year) return reply.status(404).send({ error: 'Año escolar no encontrado' });

    if (request.user?.role === 'STUDENT' || request.user?.role === 'TUTOR') {
      return reply.status(403).send({ error: 'Las estadísticas del ciclo escolar son solo del personal', code: 'FORBIDDEN' });
    }

    let periodDateFilter: { gte: Date; lte: Date } | undefined;
    if (periodId) {
      const period = await prisma.period.findFirst({
        where: { id: periodId, academicYearId: id },
        select: { id: true, startDate: true, endDate: true },
      });
      if (period) {
        periodDateFilter = {
          gte: period.startDate,
          lte: period.endDate,
        };
      }
    }

    // 2. Aggregate stats efficiently by Grade using direct DB queries
    const yearStats: Record<number, {
      grade: number;
      totalStudents: number;
      totalCapacity: number;
      sumAverages: number;
      minAverage: number;
      maxAverage: number;
      riskCount: number;
      sumAttendance: number | null;
      observationsCount: number;
    }> = {};

    [1, 2, 3, 4, 5].forEach(g => {
      yearStats[g] = {
        grade: g,
        totalStudents: 0,
        totalCapacity: 0,
        sumAverages: 0,
        minAverage: 0,
        maxAverage: 0,
        riskCount: 0,
        sumAttendance: null,
        observationsCount: 0
      };
    });

    const classrooms = await prisma.classroom.findMany({
      where: { academicYearId: id },
      select: {
        id: true,
        grade: true,
        capacity: true,
        _count: {
          select: {
            studentClassrooms: { where: { isActive: true } }
          }
        }
      }
    });

    classrooms.forEach(cls => {
      const g = cls.grade;
      if (yearStats[g]) {
        yearStats[g].totalCapacity += cls.capacity || 35;
        yearStats[g].totalStudents += cls._count.studentClassrooms;
      }
    });

    // Contar observaciones creadas en este ciclo escolar agrupadas por año/grado (filtradas por lapso si se indica)
    const observations = await prisma.observation.findMany({
      where: {
        student: {
          studentClassrooms: {
            some: { academicYearId: id, isActive: true }
          }
        },
        ...(periodDateFilter ? { date: periodDateFilter } : {}),
      },
      select: {
        id: true,
        student: {
          select: {
            studentClassrooms: {
              where: { academicYearId: id, isActive: true },
              select: { classroom: { select: { grade: true } } },
              take: 1
            }
          }
        }
      }
    });

    observations.forEach(obs => {
      const grade = obs.student?.studentClassrooms?.[0]?.classroom?.grade;
      if (grade && yearStats[grade]) {
        yearStats[grade].observationsCount += 1;
      }
    });

    // Las cifras OFICIALES de cada alumno (las de su boleta, `cifras-oficiales.service`),
    // sección por sección y a la vez. El año: la media de sus secciones (MAPA §6,
    // la misma que `yearGradeAverage`); el mínimo, el máximo y el riesgo, de sus
    // alumnos. Antes era la media a pelo de la tabla de notas.
    let minPassing = 10;
    try {
      const config = await closeCycleService.getAcademicConfig(getRequestInstituteId(request));
      minPassing = typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
    } catch {
      minPassing = 10;
    }
    const instDelAno = (request.user as any)?.instituteId ?? (request as any).institute?.id;
    const seccionesDelAno = await cifrasOficialesDelAno(prisma as any, instDelAno, id);
    const gradeEvaluatedStudents = new Map<number, number>();
    const mediasDeSecciones = new Map<number, number[]>();
    for (const { grade, oficiales } of seccionesDelAno) {
      if (!yearStats[grade]) continue;
      const deLaSeccion: number[] = [];
      for (const c of oficiales.values()) {
        const avg = promedioOficial(c, periodId);
        if (avg === null) continue;
        deLaSeccion.push(avg);
        gradeEvaluatedStudents.set(grade, (gradeEvaluatedStudents.get(grade) || 0) + 1);
        if (yearStats[grade].minAverage === 0 || avg < yearStats[grade].minAverage) yearStats[grade].minAverage = avg;
        if (avg > yearStats[grade].maxAverage) yearStats[grade].maxAverage = avg;
        if (estaEnRiesgo(c, minPassing, periodId).enRiesgo) yearStats[grade].riskCount += 1;
      }
      if (deLaSeccion.length > 0) {
        mediasDeSecciones.set(grade, [...(mediasDeSecciones.get(grade) ?? []), Math.round((deLaSeccion.reduce((x, y) => x + y, 0) / deLaSeccion.length) * 100) / 100]);
      }
    }

    // 3. Calcular asistencia por sección y agregarla por año/grado (Nivel Jerárquico)
    const attendanceGroups = await prisma.dailyAttendance.groupBy({
      by: ['classroomId', 'status'],
      where: {
        classroom: { academicYearId: id },
        ...(periodDateFilter ? { date: periodDateFilter } : {}),
      },
      _count: { id: true }
    });

    const classroomAttendanceMap = new Map<string, { attended: number; total: number }>();
    attendanceGroups.forEach(g => {
      if (!classroomAttendanceMap.has(g.classroomId)) {
        classroomAttendanceMap.set(g.classroomId, { attended: 0, total: 0 });
      }
      const item = classroomAttendanceMap.get(g.classroomId)!;
      item.total += g._count.id;
      if (g.status === 'PRESENT' || g.status === 'LATE') {
        item.attended += g._count.id;
      }
    });

    const gradeAttendanceAccum = new Map<number, { sumRates: number; count: number }>();
    [1, 2, 3, 4, 5].forEach(g => gradeAttendanceAccum.set(g, { sumRates: 0, count: 0 }));

    classrooms.forEach(cls => {
      const att = classroomAttendanceMap.get(cls.id);
      if (att && att.total > 0) {
        const sectionRate = (att.attended / att.total) * 100;
        const accum = gradeAttendanceAccum.get(cls.grade);
        if (accum) {
          accum.sumRates += sectionRate;
          accum.count += 1;
        }
      }
    });

    gradeAttendanceAccum.forEach((accum, grade) => {
      if (yearStats[grade]) {
        yearStats[grade].sumAttendance = accum.count > 0 ? (accum.sumRates / accum.count) : null;
      }
    });

    // 4. Format Output instantáneo
    const result: any[] = [];
    for (const stat of Object.values(yearStats)) {
      const evaluatedCount = gradeEvaluatedStudents.get(stat.grade) || 0;
      const secs = mediasDeSecciones.get(stat.grade) ?? [];
      const avg = secs.length > 0 ? secs.reduce((x, y) => x + y, 0) / secs.length : null;
      const minAvg = evaluatedCount > 0 ? stat.minAverage : null;
      const maxAvg = evaluatedCount > 0 ? stat.maxAverage : null;
      const attendance = (stat.sumAttendance !== null && stat.sumAttendance !== undefined)
        ? `${Math.round(stat.sumAttendance)}%`
        : null;

      result.push({
        grade: stat.grade,
        stats: {
          average: avg !== null ? Math.round(avg * 100) / 100 : null,
          minAverage: minAvg,
          maxAverage: maxAvg,
          riskCount: stat.riskCount,
          occupancy: `${stat.totalStudents}/${stat.totalCapacity}`,
          attendance,
          observations: stat.observationsCount
        }
      });
    }

    return reply.send(result);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al calcular estadísticas' });
  }
};
