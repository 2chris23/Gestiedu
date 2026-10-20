import { getDb } from '../evaluation-plan.controller';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { AppErrors } from '../../middleware/error.middleware';
import { semanaDelPlanCon } from '../../services/semana-del-plan.service';
import { assertCanSeeClassroom } from '../../services/authorization.service';

// ============================================================
// 6. GET /calendar-data — Datos del plan para calendario
// ============================================================
export async function getCalendarData(
  request: FastifyRequest<{ Querystring: { classroomId: string; startDate: string; endDate: string } }>,
  reply: FastifyReply
) {
  try {
    const { classroomId, startDate, endDate } = request.query;
    const db = getDb(request);

    if (!classroomId || !startDate || !endDate) {
      throw AppErrors.BadRequest('Faltan parámetros requeridos');
    }

    /**
     * ESTA LECTURA NO PREGUNTABA DE QUIÉN ERA LA SECCIÓN
     *
     * Bastaba estar identificado: cambiando el id en la dirección, cualquiera
     * —un alumno, un representante— leía el horario y el plan de evaluación de
     * una sección ajena. El calendario sí es de todos, pero el de lo SUYO.
     */
    await assertCanSeeClassroom(db, request.user as any, classroomId);

    // Obtener schedule blocks de la sección
    const scheduleBlocks = await db.scheduleBlock.findMany({
      where: { classroomId },
      include: {
        classroomSubject: {
          include: {
            subject: { select: { id: true, name: true, slug: true, color: true } },
            teacher: { select: { firstName: true, lastName: true } }
          }
        }
      }
    });

    // Obtener todos los planes del aula (por materia y lapso)
    const allPlanRows = await db.evaluationPlanRow.findMany({
      where: { classroomId },
      orderBy: [{ weekNumber: 'asc' }, { orderIndex: 'asc' }]
    });

    // Obtener metadata de todos los planes
    const allMetadata = await db.evaluationPlanMetadata.findMany({
      where: { classroomId }
    });

    // Los lapsos del año de la sección: la semana del plan de cada día se
    // cuenta igual que en la rejilla y en la clase en vivo.
    const seccion = await db.classroom.findUnique({
      where: { id: classroomId },
      select: {
        academicYear: {
          select: {
            startDate: true,
            periods: { select: { id: true, startDate: true, endDate: true, inicioDelPlan: true, nombreAntesDelPlan: true } },
          },
        },
      },
    });
    const lapsosDelAno = seccion?.academicYear?.periods ?? [];
    const inicioDelAno = seccion?.academicYear?.startDate ?? null;

    // Generar calendario
    const start = new Date(startDate);
    const end = new Date(endDate);
    const calendarData: any[] = [];

    // `startDate`/`endDate` llegan como "YYYY-MM-DD" → medianoche UTC. Todo el
    // recorrido tiene que ir en UTC: con getDay() (hora local), en
    // America/Caracas (UTC-4) cada fecha recibía los bloques del día anterior.
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dayOfWeek = d.getUTCDay(); // 0=Dom, 1=Lun... 6=Sáb
      const dateStr = d.toISOString().split('T')[0];

      // Encontrar bloques para este día
      const dayBlocks = scheduleBlocks.filter((b: any) => b.dayOfWeek === dayOfWeek);

      for (const block of dayBlocks) {
        const subjectId = block.classroomSubject?.subject?.id;
        if (!subjectId) continue;

        /**
         * El plan de ese día: el de su LAPSO. Antes solo se encontraba si el
         * plan tenía `fechaDesde` y `fechaHasta`, que ninguna pantalla
         * escribe: el calendario casi nunca enseñaba la semana.
         */
        const semanaDelDia = semanaDelPlanCon(new Date(d), lapsosDelAno, inicioDelAno);
        const meta = allMetadata.find((m: any) =>
          m.subjectId === subjectId &&
          (semanaDelDia.lapso ? m.lapso === semanaDelDia.lapso : true)
        );
        const sem = meta?.fechaDesde
          ? semanaDelPlanCon(new Date(d), lapsosDelAno, inicioDelAno, new Date(meta.fechaDesde))
          : semanaDelDia;

        let weekNumber: number | undefined;
        let planContent: any = undefined;
        let hasEvaluation = false;
        let evaluationCount = 0;

        if (meta && sem.inicioDelPlan && !sem.antesDelPlan) {
          // Semanas alineadas a LUNES (utils/plan-weeks.ts)
          weekNumber = sem.semana;

          // Obtener contenido de esa semana
          const weekRows = allPlanRows.filter((r: any) =>
            r.subjectId === subjectId && r.lapso === meta.lapso && r.weekNumber === weekNumber
          );

          if (weekRows.length > 0) {
            planContent = {
              headers: weekRows.filter((r: any) => r.rowType === 'HEADER'),
              fields: weekRows.filter((r: any) => r.rowType === 'FIELD'),
              evaluations: weekRows.filter((r: any) => r.rowType === 'EVALUATION'),
              texts: weekRows.filter((r: any) => r.rowType === 'TEXT'),
              indicators: weekRows.filter((r: any) => r.rowType === 'INDICATORS'),
            };
            evaluationCount = planContent.evaluations.length;
            hasEvaluation = evaluationCount > 0;
          }
        }

        calendarData.push({
          date: dateStr,
          dayOfWeek,
          startTime: block.startTime,
          endTime: block.endTime,
          subjectId,
          subjectName: block.classroomSubject?.subject?.name,
          subjectSlug: block.classroomSubject?.subject?.slug,
          subjectColor: block.classroomSubject?.subject?.color,
          teacherName: block.classroomSubject?.teacher
            ? `${block.classroomSubject.teacher.firstName} ${block.classroomSubject.teacher.lastName}`
            : undefined,
          weekNumber,
          planContent,
          hasEvaluation,
          evaluationCount,
          lapso: meta?.lapso,
        });
      }
    }

    return reply.send({ calendarData });
  } catch (error) {
    logger.error('Error al obtener datos del calendario', { error });
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    return reply.status(500).send({ error: 'Error interno del servidor' });
  }
}
