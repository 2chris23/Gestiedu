import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as aggregationService from '../services/aggregation.service';
import * as closeCycleService from '../services/promotion/close-cycle.service';

// Esquema de validación para Periodo (Lapso)
const periodSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  startDate: z.string().or(z.date()).transform((val) => new Date(val)),
  endDate: z.string().or(z.date()).transform((val) => new Date(val)),
  isActive: z.boolean().optional().default(false),
});

// Esquema de validación para crear/actualizar Año Escolar
const academicYearSchema = z.object({
  name: z.string().min(4, 'El nombre debe tener al menos 4 caracteres'),
  startDate: z.string().or(z.date()).transform((val) => new Date(val)),
  endDate: z.string().or(z.date()).transform((val) => new Date(val)),
  status: z.enum(['ACTIVE', 'COMPLETED', 'UPCOMING']).optional().default('UPCOMING'),
  periods: z.array(periodSchema).optional(),
});

const statusSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'UPCOMING']),
});

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

    const newYear = await request.tenantPrisma.academicYear.create({
      data: {
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
        periods: data.periods && data.periods.length > 0 ? {
          create: data.periods.map((p) => ({
            name: p.name,
            startDate: p.startDate,
            endDate: p.endDate,
            isActive: p.isActive,
          })),
        } : undefined,
      },
      include: {
        periods: true,
      },
    });

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

    await prisma.academicYear.delete({
      where: { id },
    });

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

    // 2. Fetch all classrooms for this year with student data
    const classrooms = await prisma.classroom.findMany({
      where: { academicYearId: id },
      include: {
        _count: { select: { studentClassrooms: true } },
        studentClassrooms: {
          where: { isActive: true }, // Only active enrollments
          include: {
            student: {
              include: {
                grades: { where: { period: { academicYearId: id } } }, // Only grades for this year
                attendance: { where: { date: { gte: year.startDate, lte: year.endDate } } },
                observations: { where: { createdAt: { gte: year.startDate, lte: year.endDate } } }
              }
            }
          }
        }
      }
    });

    // 3. Aggregate by Year (Grade)
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
        minAverage: 20, // Init with max possible
        maxAverage: 0,
        riskCount: 0,
        sumAttendance: 0,
        observationsCount: 0
      };
    });

    classrooms.forEach(cls => {
      const g = cls.grade;
      if (!yearStats[g]) return;

      const capacity = cls.capacity || 35;
      yearStats[g].totalCapacity += capacity;
      yearStats[g].totalStudents += cls.studentClassrooms.length;

      cls.studentClassrooms.forEach(item => {
        const student = item.student;

        // Average Calculation
        const grades = student.grades || [];
        const validGrades = grades.filter(g => g.score !== null);
        const studentAvg = validGrades.length > 0
          ? validGrades.reduce((sum, g) => sum + (g.score || 0), 0) / validGrades.length
          : 0;

        if (validGrades.length > 0) {
          yearStats[g].sumAverages += studentAvg;
          if (studentAvg < yearStats[g].minAverage) yearStats[g].minAverage = studentAvg;
          if (studentAvg > yearStats[g].maxAverage) yearStats[g].maxAverage = studentAvg;
        }

        // Risk Calculation: Avg < 10
        if (studentAvg < 10 && validGrades.length > 0) {
          yearStats[g].riskCount++;
        }

        // Attendance Calculation
        const attendanceRecords = student.attendance || [];
        const totalDays = attendanceRecords.length;
        const presentDays = attendanceRecords.filter(a => a.status === 'PRESENT').length;
        const attentionPercent = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

        if (totalDays > 0) {
          yearStats[g].sumAttendance += attentionPercent;
        }

        // Observations
        yearStats[g].observationsCount += (student.observations || []).length;
      });
    });

    // 4. Format Output
    // CORRECCIÓN (jerarquía de agregación): el promedio de cada grado = NIVEL 5
    // (promedio de los N4 de sus secciones), y min/max/riesgo se derivan de los
    // promedios NIVEL 2 por estudiante (nunca 0 por notas inexistentes; las
    // notas de Clase en Vivo cuentan). Antes: promedio simple de grades 0-20.
    // Fase 3.5: `periodId` opcional filtra toda la cadena por lapso/momento.
    const periodId = (request.query as any)?.periodId || undefined;
    const result: any[] = [];
    for (const stat of Object.values(yearStats)) {
      const details = await aggregationService.yearGradeStudentDetails(prisma, id, stat.grade, periodId);
      const n5 = await aggregationService.yearGradeAverage(prisma, id, stat.grade, periodId);

      const studentAverages = details.studentAverages;
      const avg = n5.average;
      const minAvg = studentAverages.length > 0 ? Math.min(...studentAverages).toFixed(1) : '0.0';
      const maxAvg = studentAverages.length > 0 ? Math.max(...studentAverages).toFixed(1) : '0.0';
      const riskCount = studentAverages.filter(a => a < 10).length;
      const attendance = stat.totalStudents > 0 ? Math.round(stat.sumAttendance / stat.totalStudents) : 0;

      result.push({
        grade: stat.grade,
        stats: {
          average: Number(avg.toFixed(1)),
          minAverage: Number(minAvg),
          maxAverage: Number(maxAvg),
          riskCount,
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
        nextYearName: body.nextYearName,
      },
      getRequestInstituteId(request)
    );
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
