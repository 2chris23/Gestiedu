import { getDb } from '../evaluation-plan.controller';
import { FastifyRequest, FastifyReply } from 'fastify';
import { criteriosQueCubren } from '../../services/evaluacion-de-la-semana.service';
import { logger } from '../../utils/logger';
import { AppErrors } from '../../middleware/error.middleware';
import { RequestUser } from '../../types/fastify';
import { assertClassroomScope } from '../../services/authorization.service';
import { borrarGuardandoCopia, quienBorra } from '../../utils/papelera';

// ============================================================
// 5. POST /copy — Copiar plan a otras secciones
// ============================================================
export async function copyPlan(
  request: FastifyRequest<{ Body: {
    sourceClassroomId: string;
    sourceSubjectId: string;
    sourceLapso: string;
    targetClassroomIds: string[];
  } }>,
  reply: FastifyReply
) {
  try {
    const { sourceClassroomId, sourceSubjectId, sourceLapso, targetClassroomIds } =
      request.body ?? ({} as any);
    const db = getDb(request);
    const user = request.user as RequestUser;

    if (!user?.userId || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
      throw AppErrors.Forbidden('No tienes permisos');
    }

    if (!sourceClassroomId || !sourceSubjectId || !sourceLapso) {
      throw AppErrors.BadRequest('Faltan parámetros del plan de origen (sección, materia y lapso)');
    }

    if (!Array.isArray(targetClassroomIds) || targetClassroomIds.length === 0) {
      throw AppErrors.BadRequest('Hay que decir a qué secciones se copia el plan');
    }

    /**
     * COPIAR UN PLAN ES ESCRIBIR EN LA SECCIÓN DE DESTINO
     *
     * Aquí solo se miraba el ROL: con ser profesor bastaba. Faltaba lo otro, que
     * es lo que importa: que la sección sea suya.
     *
     * Lo que pasaba en el liceo, reproducido en PLAN-01: un profesor que da
     * Matemáticas en 1ºB podía mandar su plan a 1ºA, que no es suya. Y copiar
     * BORRA lo que había en el destino — así que el plan de la profesora de 1ºA
     * desaparecía y en su lugar quedaba el de él. Respuesta: 200, "copiado".
     *
     * Se comprueba el origen (leer el plan ajeno también es ver lo que no es
     * suyo) y CADA destino, antes de tocar nada: si uno solo no es suyo, no se
     * copia ninguno.
     */
    await assertClassroomScope(db, user as any, sourceClassroomId, {
      subjectId: sourceSubjectId,
      accion: 'planificar',
    });

    for (const targetClassroomId of targetClassroomIds) {
      await assertClassroomScope(db, user as any, targetClassroomId, {
        subjectId: sourceSubjectId,
        accion: 'planificar',
      });
    }

    // Obtener plan origen
    const sourceMeta = await db.evaluationPlanMetadata.findUnique({
      where: { classroomId_subjectId_lapso: { classroomId: sourceClassroomId, subjectId: sourceSubjectId, lapso: sourceLapso } }
    });

    const sourceRows = await db.evaluationPlanRow.findMany({
      where: { classroomId: sourceClassroomId, subjectId: sourceSubjectId, lapso: sourceLapso },
      orderBy: [{ weekNumber: 'asc' }, { orderIndex: 'asc' }]
    });

    // Los instrumentos de sus evaluaciones van con el plan.
    const instrumentos = await db.instrumentoDeEvaluacion.findMany({
      where: { planRowId: { in: sourceRows.map((r: any) => r.id) } },
    });
    const instrumentoDe = new Map(instrumentos.map((i: any) => [i.planRowId, i]));

    let copiedCount = 0;

    for (const targetClassroomId of targetClassroomIds) {
      await db.$transaction(async (tx: any) => {
        // Copiar metadata
        if (sourceMeta) {
          const { id, classroomId: _, createdAt, updatedAt, ...metaData } = sourceMeta;
          await tx.evaluationPlanMetadata.upsert({
            where: { classroomId_subjectId_lapso: { classroomId: targetClassroomId, subjectId: sourceSubjectId, lapso: sourceLapso } },
            update: metaData,
            create: { classroomId: targetClassroomId, subjectId: sourceSubjectId, lapso: sourceLapso, ...metaData }
          });
        }

        // Las actividades del destino que suman a su plan: se vuelven a enganchar
        // a la evaluación nueva que cubra su semana. Borrar las filas las dejaba
        // sin evaluación (la llave es SET NULL) y sus notas salían del promedio
        // sin avisar (SEMEVAL-06).
        const enganchadas = await tx.classActivity.findMany({
          where: { classroomId: targetClassroomId, subjectId: sourceSubjectId, planRow: { lapso: sourceLapso } },
          select: { id: true, planRow: { select: { weekNumber: true } } },
        });

        // Eliminar filas existentes del destino (sin actividades con calificaciones)
        await borrarGuardandoCopia(
          tx,
          'evaluationPlanRow',
          { classroomId: targetClassroomId, subjectId: sourceSubjectId, lapso: sourceLapso },
          quienBorra(request as any)
        );

        // Copiar filas (sin activityId)
        const nuevas: any[] = [];
        for (const row of sourceRows) {
          const { id, classroomId: _, activityId, createdAt, updatedAt, ...rowData } = row;
          const nueva = await tx.evaluationPlanRow.create({
            data: { ...rowData, classroomId: targetClassroomId }
          });
          nuevas.push(nueva);
          const inst: any = instrumentoDe.get(id);
          if (inst) {
            await tx.instrumentoDeEvaluacion.create({ data: { planRowId: nueva.id, tipo: inst.tipo, definicion: inst.definicion } });
          }
        }
        for (const a of enganchadas) {
          const semana = a.planRow?.weekNumber;
          if (semana == null) continue;
          const nueva = criteriosQueCubren(nuevas, semana)[0];
          if (nueva) await tx.classActivity.update({ where: { id: a.id }, data: { planRowId: nueva.id } });
        }
      });
      copiedCount++;
    }

    return reply.send({ success: true, copiedCount });
  } catch (error) {
    logger.error('Error al copiar plan', { error });
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    return reply.status(500).send({ error: 'Error interno del servidor' });
  }
}

// ============================================================
// 5-bis. GET /copy-targets — A qué secciones se puede copiar este plan
// ============================================================

/**
 * LA LISTA LA ARMA EL SERVIDOR, NO LA PANTALLA
 *
 * Copiar un plan **borra** el que hubiera en el destino. Por eso la pantalla no
 * puede ofrecer secciones a ojo: lo que se ofrece tiene que ser exactamente lo
 * que `copyPlan` va a aceptar, y eso solo lo sabe el servidor.
 *
 * Se aplica la misma regla que allí: el profesor solo ve las secciones donde él
 * da **esa misma materia** (ser guía no basta para planificar); el admin, todas
 * las que tengan la materia. Siempre dentro del mismo año escolar, y sin la
 * sección de origen.
 *
 * Si alguien manda una sección que no está en esta lista, `copyPlan` la rechaza
 * igual. Esto es para que nadie se encuentre un botón que no funciona.
 */
export async function getCopyTargets(
  request: FastifyRequest<{ Querystring: { sourceClassroomId: string; subjectId: string } }>,
  reply: FastifyReply
) {
  try {
    const { sourceClassroomId, subjectId } = request.query;
    const db = getDb(request);
    const user = request.user as RequestUser;

    if (!sourceClassroomId || !subjectId) {
      throw AppErrors.BadRequest('Faltan la sección de origen y la materia');
    }

    if (!user?.userId || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
      throw AppErrors.Forbidden('No tienes permisos');
    }

    // Ver el plan de origen ya es ver algo que puede no ser suyo.
    await assertClassroomScope(db, user as any, sourceClassroomId, {
      subjectId,
      accion: 'planificar',
    });

    const origen = await db.classroom.findUnique({
      where: { id: sourceClassroomId },
      select: { academicYearId: true },
    });

    const asignaciones = await db.classroomSubject.findMany({
      where: {
        subjectId,
        classroomId: { not: sourceClassroomId },
        // Un profesor solo puede planificar donde da esa materia. El admin, en
        // cualquiera que la tenga.
        ...(user.role === 'TEACHER' ? { teacherId: user.userId } : {}),
        classroom: {
          isActive: true,
          // Copiar a otro año escolar no tiene sentido: las semanas del lapso
          // son otras.
          ...(origen?.academicYearId ? { academicYearId: origen.academicYearId } : {}),
        },
      },
      select: {
        classroom: { select: { id: true, name: true, grade: true, section: true } },
      },
    });

    const secciones = asignaciones
      .map((a: any) => a.classroom)
      .filter(Boolean)
      .sort((a: any, b: any) =>
        a.grade === b.grade ? String(a.section).localeCompare(String(b.section)) : a.grade - b.grade
      );

    return reply.send({ classrooms: secciones });
  } catch (error) {
    logger.error('Error al listar secciones de destino', { error });
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    return reply.status(500).send({ error: 'Error interno del servidor' });
  }
}
