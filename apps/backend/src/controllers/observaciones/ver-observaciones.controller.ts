import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../../utils/logger';
import { assertClassroomScope, assertCanSeeStudent } from '../../services/authorization.service';

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

    /**
     * Los otros alumnos de una observación de grupo, solo para el personal.
     *
     * Al alumno y a su representante les llegaban el nombre, el código y la foto
     * de cada compañero implicado. Lo suyo es suyo; lo de los demás, no.
     */
    const rolQueMira = (request.user as any)?.role;
    const esPersonal = rolQueMira === 'ADMIN' || rolQueMira === 'TEACHER';

    // Enriquecer cada observación con otros involucrados si pertenece a un groupId
    // Los compañeros de TODAS las observaciones de grupo, en UNA consulta (antes,
    // una por observación: con un alumno con muchas, decenas a la vez sobre el
    // mismo pozo de conexiones; regla «nunca por culpa del sistema»).
    const grupos = esPersonal ? [...new Set(observations.map((o: any) => o.groupId).filter(Boolean))] : [];
    const companerosDe = new Map<string, any[]>();
    if (grupos.length) {
      const todos = await prisma.observation.findMany({
        where: { groupId: { in: grupos as string[] }, studentId: { not: studentId } },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              studentCode: true,
              avatar: true,
              studentClassrooms: { where: { isActive: true }, take: 1, include: { classroom: { select: { name: true } } } },
            },
          },
        },
      });
      for (const p of todos as any[]) {
        if (!companerosDe.has(p.groupId)) companerosDe.set(p.groupId, []);
        companerosDe.get(p.groupId)!.push(p);
      }
    }

    const enriched = await Promise.all(
      observations.map(async (obs: any) => {
        let otherInvolved: any[] = [];
        if (obs.groupId && esPersonal) {
          const peers = companerosDe.get(obs.groupId) ?? [];
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

    if (request.user?.role === 'TEACHER') {
      const cls = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: { teacherId: true },
      });
      if (cls?.teacherId !== request.user.userId) {
        where.createdById = request.user.userId;
      }
    }

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

    const whereSubject: any = {
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
    };

    if (request.user?.role === 'TEACHER') {
      whereSubject.createdById = request.user.userId;
    }

    const observations = await prisma.observation.findMany({
      where: whereSubject,
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
