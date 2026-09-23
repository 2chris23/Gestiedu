import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as aggregationService from '../services/aggregation.service';
import * as closeCycleService from '../services/promotion/close-cycle.service';
import { isValidCalendarDate } from '../utils/validators';

const validDateSchema = z.union([
  z.string().refine(isValidCalendarDate, { message: 'Fecha de calendario inválida para el mes' }),
  z.date(),
]).transform((val) => new Date(val));

// Esquema de validación para Periodo (Lapso)
const periodSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  startDate: validDateSchema,
  endDate: validDateSchema,
  isActive: z.boolean().optional().default(false),
});

// Esquema de validación para crear/actualizar Año Escolar
const academicYearSchema = z.object({
  name: z.string().min(4, 'El nombre debe tener al menos 4 caracteres'),
  startDate: validDateSchema,
  endDate: validDateSchema,
  status: z.enum(['ACTIVE', 'COMPLETED', 'UPCOMING']).optional().default('UPCOMING'),
  periods: z.array(periodSchema).optional(),
});

import { RedisCache } from '../config/redis';
import { conLiceo } from '../config/ambito-del-liceo';

const statusSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'UPCOMING']),
});

async function invalidateDashboardCache(request: FastifyRequest) {
  try {
    const instituteId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
    if (instituteId) {
      await conLiceo(instituteId, () => RedisCache.delete(`dashboard:admin:${instituteId}`));
    }
  } catch {
    // Fail-safe para no interrumpir la respuesta principal
  }
}

export const createAcademicYear = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const data = academicYearSchema.parse(request.body);

    const existingYear = await request.tenantPrisma.academicYear.findFirst({
      where: {
        name: data.name,
      },
    });

    if (existingYear) {
      return reply.status(409).send({
        error: 'Ya existe un año escolar con ese nombre',
        code: 'YEAR_EXISTS',
      });
    }

    // Si se intenta crear como ACTIVE, hay que desactivar el anterior
    if (data.status === 'ACTIVE') {
      await request.tenantPrisma.academicYear.updateMany({
        where: { status: 'ACTIVE' },
        data: { status: 'COMPLETED' },
      });
    }

    // Un ciclo sin lapsos deja sin base los promedios (todo se calcula por
    // lapso). Si no vienen, se crean los tres del calendario venezolano
    // repartiendo el año en tres partes iguales; enviarlos explícitamente manda.
    const lapsosPorDefecto = () => {
      const inicio = new Date(data.startDate);
      const fin = new Date(data.endDate);
      const total = fin.getTime() - inicio.getTime();
      if (!(total > 0)) return [];
      const nombres = ['Primer Lapso', 'Segundo Lapso', 'Tercer Lapso'];
      return nombres.map((name, i) => {
        const desde = new Date(inicio.getTime() + (total * i) / 3);
        const hasta = new Date(inicio.getTime() + (total * (i + 1)) / 3 - 1);
        return { name, startDate: desde, endDate: hasta, isActive: i === 0 };
      });
    };

    const periodosACrear =
      data.periods && data.periods.length > 0
        ? data.periods.map((p) => ({
            name: p.name,
            startDate: p.startDate,
            endDate: p.endDate,
            isActive: p.isActive,
          }))
        : lapsosPorDefecto();

    const newYear = await request.tenantPrisma.academicYear.create({
      data: {
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
        periods: periodosACrear.length > 0 ? { create: periodosACrear } : undefined,
      },
      include: {
        periods: true,
      },
    });

    await invalidateDashboardCache(request);
    return reply.status(201).send(newYear);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Zod validation error (createAcademicYear):', JSON.stringify(error.errors, null, 2));
      return reply.status(400).send({ error: 'Datos inválidos', details: error.errors });
    }
    // Manejar constraint de unicidad (P2002) — el año ya existe
    if ((error as any)?.code === 'P2002') {
      return reply.status(409).send({
        error: 'Ya existe un año escolar con ese nombre',
        code: 'YEAR_EXISTS',
      });
    }
    console.error('Error al crear año escolar (DETALLE):', error);
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al crear año escolar' });
  }
};

export const getAcademicYears = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const years = await request.tenantPrisma.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        _count: {
          select: { classrooms: true },
        },
        periods: {
          orderBy: { startDate: 'asc' },
        },
      },
    });
    return reply.send(years);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al obtener años escolares' });
  }
};

export const getActiveAcademicYear = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const prisma = request.tenantPrisma;

    // 1. Try to find explicitly ACTIVE year
    let activeYear = await prisma.academicYear.findFirst({
      where: {
        status: 'ACTIVE'
      },
      include: {
        periods: {
          orderBy: { startDate: 'asc' },
        },
      },
    });

    // 2. Smart Detection: If no active year, find one matching today's date
    if (!activeYear) {
      const today = new Date();
      request.log.info(`[SmartCycle] No active year found. Searching for year covering today: ${today.toISOString()}`);

      const matchingYear = await prisma.academicYear.findFirst({
        where: {
          startDate: { lte: today },
          endDate: { gte: today },
        },
        include: {
          periods: {
            orderBy: { startDate: 'asc' },
          },
        },
      });

      if (matchingYear) {
        request.log.info(`[SmartCycle] Found matching year: ${matchingYear.name}. Auto-activating...`);

        // Auto-activate
        activeYear = await prisma.academicYear.update({
          where: { id: matchingYear.id },
          data: { status: 'ACTIVE' },
          include: {
            periods: {
              orderBy: { startDate: 'asc' },
            },
          },
        });
      }
    }

    if (!activeYear) {
      // Optional: If still no year, maybe return the closest one or just 404? 
      // For now, 404 is appropriate as it requires setup.
      return reply.status(404).send({ error: 'No hay año escolar activo ni vigente para la fecha actual.', code: 'NO_ACTIVE_YEAR' });
    }

    return reply.send(activeYear);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al obtener año activo' });
  }
};

export const changeYearStatus = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const { status } = statusSchema.parse(request.body);

    const year = await request.tenantPrisma.academicYear.findUnique({
      where: { id },
    });

    if (!year) {
      return reply.status(404).send({ error: 'Año escolar no encontrado' });
    }

    // Lógica de transición
    if (status === 'ACTIVE') {
      // Desactivar cualquier otro año activo -> pasan a COMPLETED
      await request.tenantPrisma.academicYear.updateMany({
        where: {
          status: 'ACTIVE',
          id: { not: id }, // Excluir el actual por si acaso
        },
        data: { status: 'COMPLETED' },
      });
    }

    const updatedYear = await request.tenantPrisma.academicYear.update({
      where: { id },
      data: { status },
    });

    await invalidateDashboardCache(request);
    return reply.send(updatedYear);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: 'Estado inválido', details: error.errors });
    }
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al cambiar estado del año escolar' });
  }
};

export const updateAcademicYear = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const data = academicYearSchema.partial().parse(request.body);

    const year = await request.tenantPrisma.academicYear.findUnique({
      where: { id },
      include: { periods: true }
    });

    if (!year) {
      return reply.status(404).send({ error: 'Año escolar no encontrado' });
    }

    const updatedYear = await request.tenantPrisma.academicYear.update({
      where: { id },
      data: {
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
      },
    });

    // Upsert periods if provided
    if (data.periods) {
      for (const p of data.periods) {
        if (p.id) {
          // Update existing period
          await request.tenantPrisma.period.update({
            where: { id: p.id },
            data: {
              name: p.name,
              startDate: p.startDate,
              endDate: p.endDate,
              isActive: p.isActive,
            },
          });
        } else {
          // Check if there is an existing period with the same name for this year
          const existingPeriod = year.periods.find(ep => ep.name === p.name);
          if (existingPeriod) {
            await request.tenantPrisma.period.update({
              where: { id: existingPeriod.id },
              data: {
                startDate: p.startDate,
                endDate: p.endDate,
                isActive: p.isActive,
              },
            });
          } else {
            // Create new period
            await request.tenantPrisma.period.create({
              data: {
                name: p.name,
                startDate: p.startDate,
                endDate: p.endDate,
                isActive: p.isActive,
                academicYearId: id,
              },
            });
          }
        }
      }
    }

    const finalYear = await request.tenantPrisma.academicYear.findUnique({
      where: { id },
      include: {
        periods: {
          orderBy: { startDate: 'asc' },
        },
      },
    });

    await invalidateDashboardCache(request);
    return reply.send(finalYear);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: 'Datos inválidos', details: error.errors });
    }
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al actualizar año escolar' });
  }
};


import { comparePassword } from '../utils/bcrypt';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';

export const deleteAcademicYear = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const { password } = request.body as { password: string }; // Password is now required

    if (!password) {
      return reply.status(400).send({ error: 'Se requiere la contraseña del administrador' });
    }

    const userId = (request.user as any).userId;
    const prisma = request.tenantPrisma;

    // 1. Verificar contraseña del administrador
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return reply.status(401).send({ error: 'Usuario no autenticado' });

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return reply.status(403).send({ error: 'Contraseña incorrecta', code: 'INVALID_PASSWORD' });
    }

    // 2. Verificar datos del año escolar (Actividad y Estudiantes)
    const yearData = await prisma.academicYear.findUnique({
      where: { id },
      include: {
        periods: {
          include: {
            grades: {
              select: { id: true },
              take: 1 // Solo necesitamos saber si existe al menos una
            }
          }
        },
        classrooms: {
          include: {
            studentClassrooms: {
              select: { id: true },
              take: 1
            }
          }
        },
      },
    });

    if (!yearData) {
      return reply.status(404).send({ error: 'Año escolar no encontrado' });
    }

    // Chequeo de Actividad Académica (Notas registradas)
    const hasAcademicActivity = yearData.periods.some(p => p.grades.length > 0);

    // Chequeo de Estudiantes Inscritos
    const hasStudents = yearData.classrooms.some(c => c.studentClassrooms.length > 0);

    if (hasAcademicActivity) {
      return reply.status(409).send({
        error: 'No se puede eliminar el ciclo escolar porque ya existe actividad académica registrada (calificaciones).',
        detail: 'Solo se puede archivar este ciclo.',
        code: 'HAS_ACADEMIC_ACTIVITY_MUST_ARCHIVE',
      });
    }

    // Si tiene estudiantes pero NO notas, permitimos borrar (se eliminarán las inscripciones en cascada)
    // El frontend ya habrá advertido de esto.

    // Borrar un año escolar arrastra las inscripciones. Copia antes.
    await borrarGuardandoCopia(prisma, 'academicYear', { id }, quienBorra(request as any));

    await invalidateDashboardCache(request);
    return reply.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: 'Datos inválidos', details: error.errors });
    }
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al eliminar año escolar' });
  }
};

export const getAcademicYearStats = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const prisma = request.tenantPrisma;

    // 1. Validate Year Exists
    const year = await prisma.academicYear.findUnique({ where: { id } });
    if (!year) return reply.status(404).send({ error: 'Año escolar no encontrado' });

    // 2. Aggregate stats efficiently by Grade using direct DB queries
    const yearStats: Record<number, {
      grade: number;
      totalStudents: number;
      totalCapacity: number;
      sumAverages: number;
      minAverage: number;
      maxAverage: number;
      riskCount: number;
      sumAttendance: number;
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
        sumAttendance: 0,
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

    // Contar observaciones creadas en este ciclo escolar agrupadas por año/grado
    const observations = await prisma.observation.findMany({
      where: {
        student: {
          studentClassrooms: {
            some: { academicYearId: id, isActive: true }
          }
        }
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

    // Calcular promedios por estudiante y por materia para detectar estudiantes en riesgo real (<10 pts)
    const studentSubjectGrades = await prisma.grade.groupBy({
      by: ['studentId', 'subjectId'],
      where: {
        period: { academicYearId: id },
        score: { not: null }
      },
      _avg: { score: true }
    });

    if (studentSubjectGrades.length > 0) {
      const studentIds = Array.from(new Set(studentSubjectGrades.map(sg => sg.studentId)));
      const studentClassrooms = await prisma.studentClassroom.findMany({
        where: {
          studentId: { in: studentIds },
          academicYearId: id,
          isActive: true
        },
        select: {
          studentId: true,
          classroom: { select: { grade: true } }
        }
      });

      const studentGradeMap = new Map(studentClassrooms.map(sc => [sc.studentId, sc.classroom.grade]));

      // 0. Obtener nota mínima aprobatoria configurable del instituto
      let minPassing = 10;
      try {
        const instId = getRequestInstituteId(request);
        const config = await closeCycleService.getAcademicConfig(instId);
        minPassing = typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
      } catch {
        minPassing = 10;
      }

      // 1. Acumular promedios generales por estudiante
      const studentOverallAverages = new Map<string, { sum: number; count: number }>();
      const studentFailedSubjects = new Map<string, number>();

      studentSubjectGrades.forEach(ssg => {
        const studentId = ssg.studentId;
        const subjAvg = ssg._avg.score || 0;

        if (!studentOverallAverages.has(studentId)) {
          studentOverallAverages.set(studentId, { sum: 0, count: 0 });
        }
        const current = studentOverallAverages.get(studentId)!;
        current.sum += subjAvg;
        current.count += 1;

        if (subjAvg < minPassing) {
          studentFailedSubjects.set(studentId, (studentFailedSubjects.get(studentId) || 0) + 1);
        }
      });

      // 2. Acumular estadísticas del grado (Año)
      studentOverallAverages.forEach((data, studentId) => {
        const grade = studentGradeMap.get(studentId);
        if (grade && yearStats[grade]) {
          const avg = data.count > 0 ? (data.sum / data.count) : 0;
          yearStats[grade].sumAverages += avg;

          if (yearStats[grade].minAverage === 0 || avg < yearStats[grade].minAverage) {
            yearStats[grade].minAverage = avg;
          }
          if (avg > yearStats[grade].maxAverage) {
            yearStats[grade].maxAverage = avg;
          }

          // Un estudiante está en riesgo académico si tiene materias reprobadas (< minPassing) o su promedio es < minPassing
          const failedCount = studentFailedSubjects.get(studentId) || 0;
          if (failedCount > 0 || avg < minPassing) {
            yearStats[grade].riskCount += 1;
          }
        }
      });
    }

    // 3. Calcular asistencia por sección y agregarla por año/grado (Nivel Jerárquico)
    const attendanceGroups = await prisma.dailyAttendance.groupBy({
      by: ['classroomId', 'status'],
      where: {
        classroom: { academicYearId: id }
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
        yearStats[grade].sumAttendance = accum.count > 0 ? (accum.sumRates / accum.count) : 0;
      }
    });

    // 4. Format Output instantáneo
    const result: any[] = [];
    for (const stat of Object.values(yearStats)) {
      const avg = stat.sumAverages > 0 && stat.totalStudents > 0 ? (stat.sumAverages / stat.totalStudents) : 0;
      const attendance = stat.sumAttendance > 0 ? Math.round(stat.sumAttendance) : 0;

      result.push({
        grade: stat.grade,
        stats: {
          average: Number(avg.toFixed(1)),
          minAverage: Number(stat.minAverage.toFixed(1)),
          maxAverage: Number(stat.maxAverage.toFixed(1)),
          riskCount: stat.riskCount,
          occupancy: `${stat.totalStudents}/${stat.totalCapacity}`,
          attendance: `${attendance}%`,
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

// ============================================================
// FASE 3.5-C — CIERRE DE CICLO ESCOLAR + PROSECUCIÓN
// ============================================================

/** Instituto resuelto para la request (fail-closed, como institutes.controller). */
function getRequestInstituteId(request: FastifyRequest): string {
  const instituteId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
  if (!instituteId) {
    throw new Error('No se pudo determinar el instituto. Request abortada por seguridad.');
  }
  return instituteId;
}

/** 1. Calcula los RESULTADOS SUGERIDOS por estudiante (no definitivos). */
export const prepareAcademicYearClose = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const prisma = request.tenantPrisma;
    const result = await closeCycleService.prepareClose(prisma, id, getRequestInstituteId(request));
    return reply.status(200).send(result);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al preparar el cierre del ciclo' });
  }
};

/** 2. Confirma la REVISIÓN del admin y ejecuta el cierre (idempotente). */
export const confirmAcademicYearClose = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const prisma = request.tenantPrisma;

    const result = await closeCycleService.confirmClose(
      prisma,
      {
        academicYearId: id,
        decisions: body.decisions || [],
        strategyKey: body.strategyKey,
        strategyMode: body.strategyMode,
        autoCreateNextYear: body.autoCreateNextYear ?? true,
        nextYearName: body.nextYearName || body.suggestedNextYearName,
      },
      getRequestInstituteId(request),
      quienBorra(request as any)
    );
    await invalidateDashboardCache(request);
    return reply.status(200).send(result);
  } catch (error: any) {
    request.log.error(error);
    if (error?.code === 'CLOSE_ALREADY_EXECUTED') {
      return reply.status(409).send({ error: 'El ciclo ya fue cerrado', code: 'CLOSE_ALREADY_EXECUTED' });
    }
    return reply.status(500).send({ error: 'Error al confirmar el cierre del ciclo' });
  }
};

/** Estrategias de asignación de sección disponibles (para la pantalla de revisión). */
export const getCloseStrategies = async (_request: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).send({ strategies: closeCycleService.listStrategies() });
};

/** Fase 3.5 Parte 2 — contexto por niveles de la página de promoción. */
export const getPromotionContext = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const context = await closeCycleService.getPromotionContext(
      request.tenantPrisma,
      id,
      getRequestInstituteId(request)
    );
    return reply.status(200).send(context);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al obtener el contexto de promoción' });
  }
};

/** Fase 3.5 Parte 2 — previsualizar estrategia automática (punto de partida editable). */
export const previewPromotionStrategy = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const result = await closeCycleService.previewStrategyAssignment(
      request.tenantPrisma,
      id,
      getRequestInstituteId(request),
      body.strategyKey || 'manual',
      body.strategyMode
    );
    return reply.status(200).send(result);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al aplicar la estrategia' });
  }
};
