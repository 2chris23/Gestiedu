import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import logger from '../utils/logger';
import { assertClassroomScope } from '../services/authorization.service';
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
