import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import logger from '../utils/logger';
import { assertClassroomScope, assertCanSeeStudent } from '../services/authorization.service';
import { AppErrors } from '../middleware/error.middleware';
import { instituteTimezone, isFutureDate, todayInTimezone } from '../utils/school-time';
import { crearORecuperar } from '../utils/concurrencia';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';

interface RequestUser {
  userId: string;
  instituteId?: string;
  role: string;
}

/**
 * Crear una o múltiples observaciones (grupo de estudiantes en un mismo incidente).
 */
export async function createObservation(
  request: FastifyRequest<{
    Body: {
      title: string;
      description?: string;
      type?: string;
      date?: string;
      studentIds: string[];
      classroomId?: string;
      subjectId?: string;
      classSessionId?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { title, description, type = 'OBSERVACION', date, studentIds, classroomId, subjectId, classSessionId } = request.body;
    const prisma = request.tenantPrisma;
    const user = request.user as RequestUser;

    if (!title || !studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return reply.status(400).send({ error: 'Título y al menos un estudiante involucrado son requeridos' });
    }

    // Solo se dejan observaciones de las clases propias, y a los alumnos de
    // ESA sección. Antes, sin `classroomId` no se miraba nada, y con él no se
    // miraba a quién: el profesor de 1.º A dejaba observaciones en el
    // expediente de cualquier alumno del liceo (`quien-puede-que.test.ts`).
    if (user?.role !== 'ADMIN') {
      if (!classroomId) {
        return reply.status(403).send({ error: 'Las observaciones se dejan desde una sección que llevas', code: 'FORBIDDEN' });
      }
      await assertClassroomScope(prisma, user as any, classroomId, {
        subjectId,
        accion: 'dejar observaciones',
      });
      const unicos = Array.from(new Set(studentIds));
      const inscritos = await prisma.studentClassroom.count({
        where: { classroomId, isActive: true, studentId: { in: unicos } },
      });
      if (inscritos !== unicos.length) {
        return reply.status(403).send({ error: 'Solo a los alumnos de esa sección', code: 'FORBIDDEN' });
      }
    }

    const zonaLiceo = await instituteTimezone(prisma);
    if (date && isFutureDate(date, zonaLiceo)) {
      return reply.status(400).send({
        error: 'No se puede dejar una observación con fecha futura',
        code: 'FUTURE_DATE',
        today: todayInTimezone(zonaLiceo),
      });
    }

    // Sin fecha explícita manda el reloj del servidor, no el del dispositivo
    const obsDate = date ? new Date(date) : new Date();
    const groupId = studentIds.length > 1 ? randomUUID() : null;

    // Si viene subjectId como slug o id, resolver id real de subject
    let finalSubjectId = subjectId || null;
    if (finalSubjectId) {
      const sub = await prisma.subject.findFirst({
        where: { OR: [{ id: finalSubjectId }, { slug: finalSubjectId }] },
        select: { id: true },
      });
      if (sub) finalSubjectId = sub.id;
    }

    // Si no viene classSessionId pero sí classroomId y finalSubjectId, encontrar o crear la ClassSession
    let finalSessionId = classSessionId || null;
    if (!finalSessionId && classroomId && finalSubjectId) {
      const startOfDay = new Date(obsDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(obsDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      // DOS A LA VEZ
      //
      // Antes: buscar la clase, no encontrarla, crearla. Dos observaciones
      // simultáneas (un doble clic basta) la creaban las dos y la segunda
      // chocaba contra la base: "Error en el servidor" y la observación
      // perdida. Ahora, si alguien se adelantó por milisegundos, se usa la
      // clase que ya existe.
      const materiaId = finalSubjectId;
      const buscarClase = () =>
        prisma.classSession.findFirst({
          where: { classroomId, subjectId: materiaId, date: { gte: startOfDay, lte: endOfDay } },
        });

      const session =
        (await buscarClase()) ??
        (await crearORecuperar(
          () =>
            prisma.classSession.create({
              data: {
                classroomId,
                subjectId: materiaId,
                date: obsDate,
                status: 'ACTIVE',
              },
            }),
          buscarClase
        ));
      finalSessionId = session.id;
    }

    // LA MISMA OBSERVACIÓN NO SE DEJA DOS VECES
    //
    // Mismo profesor, mismo alumno, mismo día y mismo título es la misma
    // observación: se devuelve la que ya está en vez de dejar dos iguales en
    // el historial del alumno. Para dejar dos de verdad basta con que digan
    // cosas distintas, que es lo normal.
    const inicioDelDia = new Date(obsDate);
    inicioDelDia.setUTCHours(0, 0, 0, 0);
    const finDelDia = new Date(obsDate);
    finDelDia.setUTCHours(23, 59, 59, 999);

    const yaLaDejo = await prisma.observation.findMany({
      where: {
        createdById: user.userId,
        studentId: { in: studentIds },
        title,
        date: { gte: inicioDelDia, lte: finDelDia },
      },
    });
    const alumnosConLaMisma = new Set(yaLaDejo.map((o) => o.studentId));
    const alumnosPendientes = studentIds.filter((id: string) => !alumnosConLaMisma.has(id));

    if (alumnosPendientes.length === 0) {
      return reply.status(200).send({
        success: true,
        message: 'Esa observación ya estaba registrada',
        groupId,
        observations: yaLaDejo,
        repetida: true,
      });
    }

    const created = await prisma.$transaction(async (tx: any) => {
      const records = [];
      for (const studentId of alumnosPendientes) {
        const obs = await tx.observation.create({
          data: {
            title,
            description: description || null,
            type: type || 'OBSERVACION',
            date: obsDate,
            studentId,
            createdById: user.userId,
            classroomId: classroomId || null,
            subjectId: finalSubjectId,
            classSessionId: finalSessionId,
            groupId,
            instituteId: user.instituteId || null,
          },
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                studentCode: true,
                avatar: true,
              },
            },
          },
        });
        records.push(obs);
      }
      return records;
    });

    // A quién le toca esta observación: a los alumnos nombrados, a sus
    // representantes, y al personal de la sección.
    //
    // Sin esto se avisaba al liceo entero y se tiraba su caché completa. Medido:
    // con 30 profesores escribiendo, las lecturas de los demás pasaron de 387 ms
    // a 2.938 ms — porque cada observación mandaba a los 300 lectores otra vez a
    // la base de datos, sin que a ninguno le hubiera cambiado nada.
    request.aQuienAfecta = {
      studentIds: alumnosPendientes,
      classroomId: classroomId || undefined,
    };

    return reply.status(201).send({
      success: true,
      message: `${created.length} observación(es) registrada(s) exitosamente`,
      groupId,
      observations: created,
    });
  } catch (error) {
    // Los errores con código propio (permisos, no encontrado…) se responden
    // tal cual: convertirlos en 500 esconde el motivo real.
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'No autorizado',
        code: (error as any).code || 'FORBIDDEN',
      });
    }
    logger.error('Error creating observation', {
      error: error instanceof Error ? error.message : String(error),
    });
    return reply.status(500).send({ error: 'Error al registrar observación' });
  }
}

/**
 * Obtener historial de observaciones de un estudiante con detalle de otros involucrados.
 */
export async function getStudentObservations(
  request: FastifyRequest<{
    Params: { studentId: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { studentId } = request.params;
    const prisma = request.tenantPrisma;

    // Las observaciones de un estudiante son suyas: las ve él, su representante,
    // un profesor que le da clase y el administrador. Antes las veía cualquiera.
    await assertCanSeeStudent(prisma, request.user as any, studentId);

    const observations = await prisma.observation.findMany({
      where: { studentId },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    // Enriquecer cada observación con otros involucrados si pertenece a un groupId
    const enriched = await Promise.all(
      observations.map(async (obs: any) => {
        let otherInvolved: any[] = [];
        if (obs.groupId) {
          const peers = await prisma.observation.findMany({
            where: {
              groupId: obs.groupId,
              studentId: { not: studentId },
            },
            include: {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  studentCode: true,
                  avatar: true,
                  studentClassrooms: {
                    where: { isActive: true },
                    take: 1,
                    include: { classroom: { select: { name: true } } },
                  },
                },
              },
            },
          });
          otherInvolved = peers.map((p: any) => ({
            id: p.student.id,
            name: `${p.student.firstName} ${p.student.lastName}`,
            studentCode: p.student.studentCode,
            avatar: p.student.avatar,
            classroomName: p.student.studentClassrooms?.[0]?.classroom?.name || 'Otra sección',
          }));
        }

        return {
          id: obs.id,
          groupId: obs.groupId,
          title: obs.title,
          description: obs.description,
          type: obs.type,
          date: obs.date,
          createdAt: obs.createdAt,
          teacher: obs.createdBy
            ? {
                id: obs.createdBy.id,
                name: `${obs.createdBy.firstName} ${obs.createdBy.lastName}`,
                role: obs.createdBy.role,
              }
            : null,
          subject: obs.subject
            ? {
                id: obs.subject.id,
                name: obs.subject.name,
                color: obs.subject.color,
              }
            : null,
          classroom: obs.classroom
            ? {
                id: obs.classroom.id,
                name: obs.classroom.name,
              }
            : null,
          otherInvolved,
        };
      })
    );

    return reply.status(200).send({
      total: enriched.length,
      observations: enriched,
    });
  } catch (error) {
    // Los errores con código propio (permisos, no encontrado…) se responden
    // tal cual: convertirlos en 500 esconde el motivo real.
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'No autorizado',
        code: (error as any).code || 'FORBIDDEN',
      });
    }
    logger.error('Error getting student observations', {
      error: error instanceof Error ? error.message : String(error),
    });
    return reply.status(500).send({ error: 'Error al obtener observaciones del estudiante' });
  }
}

/**
 * Obtener observaciones de un aula/sección completa.
 */
export async function getClassroomObservations(
  request: FastifyRequest<{
    Params: { classroomId: string };
    Querystring: { subjectId?: string; periodId?: string; startDate?: string; endDate?: string; search?: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { classroomId } = request.params;
    const { subjectId, periodId, startDate, endDate, search } = request.query;
    const prisma = request.tenantPrisma;

    // Solo quien imparte en esa sección (o su guía, o el administrador)
    await assertClassroomScope(prisma, request.user as any, classroomId, { accion: "ver observaciones" });

    const baseClassroomFilter: any = {
      OR: [
        { classroomId },
        {
          student: {
            studentClassrooms: {
              some: { classroomId, isActive: true },
            },
          },
        },
      ],
    };

    const where: any = { ...baseClassroomFilter };

    if (subjectId) {
      let finalSubjectId = subjectId;
      const sub = await prisma.subject.findFirst({
        where: { OR: [{ id: subjectId }, { slug: subjectId }] },
        select: { id: true },
      });
      if (sub) finalSubjectId = sub.id;
      where.subjectId = finalSubjectId;
    }

    if (periodId) {
      const period = await prisma.period.findUnique({
        where: { id: periodId },
        select: { startDate: true, endDate: true },
      });
      if (period) {
        where.date = {
          gte: period.startDate,
          lte: period.endDate,
        };
      }
    } else if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { student: { firstName: { contains: search, mode: 'insensitive' } } },
            { student: { lastName: { contains: search, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const observations = await prisma.observation.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true,
            avatar: true,
            studentClassrooms: {
              where: { isActive: true },
              take: 1,
              include: {
                classroom: {
                  select: { name: true, grade: true, section: true },
                },
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            color: true,
            slug: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    const groupedMap = new Map<string, any>();
    for (const o of observations) {
      const key = o.groupId || o.id;
      const studentData = {
        id: o.student.id,
        name: `${o.student.firstName} ${o.student.lastName}`,
        studentCode: o.student.studentCode,
        avatar: o.student.avatar,
        classroomName: o.student.studentClassrooms?.[0]?.classroom?.name || 'Otra sección',
      };

      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          id: o.id,
          groupId: o.groupId,
          title: o.title,
          description: o.description,
          type: o.type,
          date: o.date,
          createdAt: o.createdAt,
          classroomId: o.classroomId || classroomId,
          subjectId: o.subjectId,
          classSessionId: o.classSessionId,
          teacher: o.createdBy
            ? { id: o.createdBy.id, name: `${o.createdBy.firstName} ${o.createdBy.lastName}`, role: o.createdBy.role }
            : null,
          subject: o.subject
            ? { id: o.subject.id, name: o.subject.name, color: o.subject.color, slug: o.subject.slug }
            : null,
          classroom: o.classroom
            ? { id: o.classroom.id, name: o.classroom.name, grade: o.classroom.grade, section: o.classroom.section }
            : null,
          students: [studentData],
          allObservationIds: [o.id],
        });
      } else {
        const existing = groupedMap.get(key);
        if (!existing.students.some((st: any) => st.id === studentData.id)) {
          existing.students.push(studentData);
        }
        existing.allObservationIds.push(o.id);
      }
    }

    const groupedList = Array.from(groupedMap.values());

    return reply.status(200).send({
      total: groupedList.length,
      observations: groupedList,
    });
  } catch (error) {
    // Los errores con código propio (permisos, no encontrado…) se responden
    // tal cual: convertirlos en 500 esconde el motivo real.
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'No autorizado',
        code: (error as any).code || 'FORBIDDEN',
      });
    }
    logger.error('Error getting classroom observations', {
      error: error instanceof Error ? error.message : String(error),
    });
    return reply.status(500).send({ error: 'Error al obtener observaciones de la sección' });
  }
}

/**
 * Obtener observaciones de una materia específica en una sección.
 */
export async function getSubjectObservations(
  request: FastifyRequest<{
    Params: { classroomId: string; subjectId: string };
    Querystring: { periodId?: string; startDate?: string; endDate?: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { classroomId, subjectId } = request.params;
    const { periodId, startDate, endDate } = (request.query || {}) as {
      periodId?: string;
      startDate?: string;
      endDate?: string;
    };
    const prisma = request.tenantPrisma;

    let targetSubjectId = subjectId;
    const sub = await prisma.subject.findFirst({
      where: { OR: [{ id: subjectId }, { slug: subjectId }] },
      select: { id: true, name: true, color: true, slug: true },
    });
    if (sub) {
      targetSubjectId = sub.id;
    }

    /**
     * Mismo caso que en `getSessionObservations`: aquí tampoco había guardia, y
     * un alumno podía pedir las observaciones de una materia de una sección que
     * no es la suya. Lo vigilan OBS-04 y OBS-05.
     *
     * Se comprueba DESPUÉS de resolver el identificador de la materia porque la
     * ruta acepta también el nombre corto (`slug`), y el permiso se comprueba
     * sobre la materia de verdad.
     */
    await assertClassroomScope(prisma, request.user as any, classroomId, {
      subjectId: targetSubjectId,
      accion: 'ver observaciones',
    });

    let dateFilter: any = {};
    if (periodId) {
      const period = await prisma.period.findUnique({
        where: { id: periodId },
        select: { startDate: true, endDate: true },
      });
      if (period) {
        dateFilter = {
          gte: period.startDate,
          lte: period.endDate,
        };
      }
    } else if (startDate || endDate) {
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) dateFilter.lte = new Date(endDate);
    }

    const observations = await prisma.observation.findMany({
      where: {
        subjectId: targetSubjectId,
        ...(dateFilter.gte ? { date: dateFilter } : {}),
        OR: [
          { classroomId },
          {
            student: {
              studentClassrooms: {
                some: { classroomId, isActive: true },
              },
            },
          },
        ],
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true,
            avatar: true,
            studentClassrooms: {
              where: { isActive: true },
              take: 1,
              include: {
                classroom: {
                  select: { name: true, grade: true, section: true },
                },
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            color: true,
            slug: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    const groupedMap = new Map<string, any>();
    for (const o of observations) {
      const key = o.groupId || o.id;
      const studentData = {
        id: o.student.id,
        name: `${o.student.firstName} ${o.student.lastName}`,
        studentCode: o.student.studentCode,
        avatar: o.student.avatar,
        classroomName: o.student.studentClassrooms?.[0]?.classroom?.name || 'Otra sección',
      };

      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          id: o.id,
          groupId: o.groupId,
          title: o.title,
          description: o.description,
          type: o.type,
          date: o.date,
          createdAt: o.createdAt,
          classroomId: o.classroomId || classroomId,
          subjectId: o.subjectId || targetSubjectId,
          classSessionId: o.classSessionId,
          teacher: o.createdBy
            ? { id: o.createdBy.id, name: `${o.createdBy.firstName} ${o.createdBy.lastName}`, role: o.createdBy.role }
            : null,
          subject: o.subject || sub
            ? {
                id: o.subject?.id || sub?.id,
                name: o.subject?.name || sub?.name,
                color: o.subject?.color || sub?.color,
                slug: o.subject?.slug || sub?.slug,
              }
            : null,
          classroom: o.classroom
            ? { id: o.classroom.id, name: o.classroom.name, grade: o.classroom.grade, section: o.classroom.section }
            : null,
          students: [studentData],
          allObservationIds: [o.id],
        });
      } else {
        const existing = groupedMap.get(key);
        if (!existing.students.some((st: any) => st.id === studentData.id)) {
          existing.students.push(studentData);
        }
        existing.allObservationIds.push(o.id);
      }
    }

    const groupedList = Array.from(groupedMap.values());

    return reply.status(200).send({
      total: groupedList.length,
      observations: groupedList,
    });
  } catch (error) {
    // Los errores con código propio (permisos, no encontrado…) se responden
    // tal cual: convertirlos en 500 esconde el motivo real.
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'No autorizado',
        code: (error as any).code || 'FORBIDDEN',
      });
    }
    logger.error('Error getting subject observations', {
      error: error instanceof Error ? error.message : String(error),
    });
    return reply.status(500).send({ error: 'Error al obtener observaciones de la materia' });
  }
}

/**
 * Obtener observaciones creadas durante una sesión de clase en vivo.
 */
export async function getSessionObservations(
  request: FastifyRequest<{
    Params: { sessionId: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { sessionId } = request.params;
    const prisma = request.tenantPrisma;

    /**
     * LA CONDUCTA NO LA LEE CUALQUIERA
     *
     * Esta ruta solo pedía tener sesión abierta. Con eso, un alumno cualquiera
     * pedía las observaciones de CUALQUIER clase del liceo y recibía, con
     * nombre y apellido, quién se portó mal, quién llegó tarde y qué escribió
     * el profesor. Lo vigilan OBS-02 y OBS-03.
     *
     * Las observaciones son de la clase, así que se pregunta de qué clase es la
     * sesión y se aplica la misma regla que en el resto: el profesor, sobre las
     * suyas; el administrador, sobre todas.
     */
    const sesion = await prisma.classSession.findUnique({
      where: { id: sessionId },
      select: { classroomId: true, subjectId: true },
    });

    if (!sesion) {
      return reply.status(404).send({ error: 'Clase no encontrada', code: 'SESSION_NOT_FOUND' });
    }

    await assertClassroomScope(prisma, request.user as any, sesion.classroomId, {
      subjectId: sesion.subjectId,
      accion: 'ver observaciones',
    });

    const observations = await prisma.observation.findMany({
      where: { classSessionId: sessionId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true,
            avatar: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Agrupar por groupId si varias filas pertenecen al mismo incidente
    const groupedMap = new Map<string, any>();
    for (const obs of observations) {
      const key = obs.groupId || obs.id;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          id: obs.id,
          groupId: obs.groupId,
          title: obs.title,
          description: obs.description,
          type: obs.type,
          date: obs.date,
          createdAt: obs.createdAt,
          teacher: obs.createdBy ? `${obs.createdBy.firstName} ${obs.createdBy.lastName}` : null,
          students: [],
        });
      }
      groupedMap.get(key).students.push({
        id: obs.student.id,
        name: `${obs.student.firstName} ${obs.student.lastName}`,
        studentCode: obs.student.studentCode,
        avatar: obs.student.avatar,
      });
    }

    return reply.status(200).send({
      total: groupedMap.size,
      observations: Array.from(groupedMap.values()),
    });
  } catch (error) {
    // Los errores con código propio (permisos, no encontrado…) se responden
    // tal cual: convertirlos en 500 esconde el motivo real.
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'No autorizado',
        code: (error as any).code || 'FORBIDDEN',
      });
    }
    logger.error('Error getting session observations', {
      error: error instanceof Error ? error.message : String(error),
    });
    return reply.status(500).send({ error: 'Error al obtener observaciones de la sesión' });
  }
}

/**
 * Eliminar una observación.
 */
export async function deleteObservation(
  request: FastifyRequest<{
    Params: { id: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const prisma = request.tenantPrisma;
    const user = request.user as RequestUser;

    const obs = await prisma.observation.findUnique({ where: { id } });
    if (!obs) {
      return reply.status(404).send({ error: 'Observación no encontrada' });
    }

    /**
     * BORRAR UNA OBSERVACIÓN AJENA
     *
     * La ruta solo pedía ser profesor. Con eso, CUALQUIER profesor del liceo
     * podía borrar la observación que otro había escrito sobre un alumno de
     * otra sección. La papelera guardaba la copia, sí, pero la observación
     * desaparecía del expediente del alumno y nadie se enteraba. Lo vigila
     * OBS-07.
     *
     * Se aplica la misma regla que para escribirla: la clase tiene que ser
     * suya. Si la observación no está atada a ninguna sección (las hay
     * antiguas, con `classroomId` vacío), la borra solo el administrador.
     */
    if (obs.classroomId) {
      await assertClassroomScope(prisma, user as any, obs.classroomId, {
        subjectId: obs.subjectId || undefined,
        accion: 'borrar observaciones',
      });
    } else if (user?.role !== 'ADMIN') {
      throw AppErrors.Forbidden('Solo el administrador puede borrar esta observación');
    }

    const quien = quienBorra(request as any);
    if (obs.groupId) {
      const delGrupo = await prisma.observation.findMany({
        where: { groupId: obs.groupId },
        select: { studentId: true },
      });
      request.aQuienAfecta = {
        studentIds: [...new Set(delGrupo.map((o) => o.studentId))],
        classroomId: obs.classroomId || undefined,
      };
      await borrarGuardandoCopia(prisma, 'observation', { groupId: obs.groupId }, quien);
    } else {
      request.aQuienAfecta = {
        studentIds: [obs.studentId],
        classroomId: obs.classroomId || undefined,
      };
      await borrarGuardandoCopia(prisma, 'observation', { id }, quien);
    }
    return reply.status(200).send({ success: true, message: 'Observación eliminada' });
  } catch (error) {
    // Los errores con código propio (permisos, no encontrado…) se responden
    // tal cual: convertirlos en 500 esconde el motivo real.
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'No autorizado',
        code: (error as any).code || 'FORBIDDEN',
      });
    }
    logger.error('Error deleting observation', {
      error: error instanceof Error ? error.message : String(error),
    });
    return reply.status(500).send({ error: 'Error al eliminar observación' });
  }
}
