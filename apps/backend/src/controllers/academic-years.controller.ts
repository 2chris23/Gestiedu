import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isValidCalendarDate } from '../utils/validators';

const validDateSchema = z.union([
  z.string().refine(isValidCalendarDate, { message: 'Fecha de calendario inválida para el mes' }),
  z.date(),
]).transform((val) => new Date(val));

// Esquema de validación para Periodo (Lapso)
const periodSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    startDate: validDateSchema,
    endDate: validDateSchema,
    isActive: z.boolean().optional().default(false),
    /**
     * Cuándo empieza el contenido del plan de evaluación en este lapso (las
     * semanas de antes son de diagnóstico, con contenido del profesor). Libre:
     * cada liceo lo pone donde le toque, siempre dentro del lapso. `null` o
     * vacío = empieza con el lapso.
     */
    inicioDelPlan: z
      .union([validDateSchema, z.literal('').transform(() => null), z.null()])
      .optional(),
    nombreAntesDelPlan: z
      .string()
      .trim()
      .max(40, 'El nombre de las semanas de antes del plan es muy largo (máximo 40 letras)')
      .nullable()
      .optional()
      // Sin el campo, no se toca; vacío, se borra.
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
  })
  .refine(
    (p) => !p.inicioDelPlan || (p.inicioDelPlan >= p.startDate && p.inicioDelPlan <= p.endDate),
    { message: 'El plan de un lapso tiene que empezar dentro del lapso', path: ['inicioDelPlan'] }
  );

/** Lo del plan que se guarda con el lapso (solo si vino en la petición). */
const delPlan = (p: z.infer<typeof periodSchema>) => ({
  ...(p.inicioDelPlan !== undefined ? { inicioDelPlan: p.inicioDelPlan } : {}),
  ...(p.nombreAntesDelPlan !== undefined ? { nombreAntesDelPlan: p.nombreAntesDelPlan } : {}),
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

export async function invalidateDashboardCache(request: FastifyRequest) {
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
            ...delPlan(p),
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
    const where: any = {};
    if (request.user?.role === 'TEACHER') {
      const profesorId = request.user.userId;
      where.classrooms = {
        some: {
          OR: [
            { teacherId: profesorId },
            { subjects: { some: { teacherId: profesorId } } },
          ],
        },
      };
    } else if (request.user?.role === 'STUDENT') {
      const studentId = request.user.userId;
      where.classrooms = {
        some: {
          studentClassrooms: {
            some: { studentId },
          },
        },
      };
    } else if (request.user?.role === 'TUTOR') {
      const tutorId = request.user.userId;
      where.classrooms = {
        some: {
          studentClassrooms: {
            some: {
              student: {
                studentTutorings: {
                  some: { tutorId },
                },
              },
            },
          },
        },
      };
    }

    const years = await request.tenantPrisma.academicYear.findMany({
      where,
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
              ...delPlan(p),
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
                ...delPlan(p),
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
                ...delPlan(p),
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

    // Chequeo de Actividad Académica: notas o asistencia. Las notas de verdad
    // viven en la clase en vivo (`class_activities.scores`), no solo en la
    // tabla vieja: mirando solo esa, un año con notas de clase y con su
    // asistencia se borraba entero (ANO-03, 20-oct-2026).
    const secciones = yearData.classrooms.map((c) => c.id);
    const [conNotasDeClase, conAsistencia] = secciones.length === 0
      ? [[], 0]
      : await Promise.all([
          prisma.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM class_activities
             WHERE "classroomId" = ANY(${secciones}::text[])
               AND jsonb_typeof(scores) = 'object' AND scores <> '{}'::jsonb
             LIMIT 1`,
          prisma.dailyAttendance.count({ where: { classroomId: { in: secciones } }, take: 1 } as any),
        ]);
    const hasAcademicActivity =
      yearData.periods.some(p => p.grades.length > 0) || conNotasDeClase.length > 0 || conAsistencia > 0;

    if (hasAcademicActivity) {
      return reply.status(409).send({
        error: 'No se puede eliminar el ciclo escolar porque ya existe actividad académica registrada (calificaciones o asistencia).',
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
// ============================================================
// FASE 3.5-C — CIERRE DE CICLO ESCOLAR + PROSECUCIÓN
// ============================================================

/** Instituto resuelto para la request (fail-closed, como institutes.controller). */
export function getRequestInstituteId(request: FastifyRequest): string {
  const instituteId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
  if (!instituteId) {
    throw new Error('No se pudo determinar el instituto. Request abortada por seguridad.');
  }
  return instituteId;
}