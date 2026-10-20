import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { AppErrors } from '../middleware/error.middleware';
import { RequestUser } from '../types/fastify';
import { NOMBRE_ANTES_DEL_PLAN } from '../services/semana-del-plan.service';
import { assertClassroomScope } from '../services/authorization.service';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { versionDelPlan, filaSinCambios } from '../utils/version-del-plan';

/** Alguien guardó este plan después de que quien guarda ahora lo abriera. */
class PlanCambiadoEnOtroSitio extends Error {}

/**
 * Una evaluación del plan con notas puestas no se quita ni se deja sin puntos
 * guardando el plan: sus actividades quedaban sin evaluación y su nota salía
 * del promedio del lapso sin que nadie se enterase (SEMEVAL-05).
 */
class EvaluacionConNotas extends Error {
  constructor(public evaluaciones: string[]) {
    super('evaluación con notas');
  }
}

/** ¿Alguna de estas actividades de clase tiene una nota puesta? */
const conNotaPuesta = (a: { scores: any }) =>
  Boolean(a.scores && typeof a.scores === 'object' && Object.values(a.scores).some((v) => v !== null && v !== undefined && v !== ''));

// Helper para obtener el cliente DB del tenant.
// SEGURIDAD: No hay fallback al platform DB. Si tenantPrisma no está resuelto,
// la request debe fallar (fail-closed) para evitar filtrar datos entre institutos.
export function getDb(request: FastifyRequest) {
  const db = (request as any).tenantPrisma;
  if (!db) {
    throw AppErrors.Forbidden('No se pudo determinar el instituto. Request abortada por seguridad.');
  }
  return db;
}

// ============================================================
// 1. GET /metadata — Obtener metadatos con auto-llenado
// ============================================================
export async function getEvaluationPlanMetadata(
  request: FastifyRequest<{ Querystring: { classroomId: string; subjectId: string; lapso: string } }>,
  reply: FastifyReply
) {
  try {
    const { classroomId, subjectId, lapso } = request.query;
    const db = getDb(request);

    if (!classroomId || !subjectId || !lapso) {
      throw AppErrors.BadRequest('Faltan parámetros requeridos (classroomId, subjectId, lapso)');
    }

    // La cabecera lleva la cédula, el teléfono y el correo del profesor: la
    // consulta quien puede ver las filas del plan, ni uno más. Antes la leía
    // cualquiera con sesión, un alumno de otra sección incluido.
    await assertClassroomScope(db, request.user as any, classroomId, { subjectId, accion: 'consultar el plan' });

    // Obtener metadata guardada
    const metadata = await db.evaluationPlanMetadata.findUnique({
      where: {
        classroomId_subjectId_lapso: { classroomId, subjectId, lapso }
      }
    });

    // Auto-populate institutional data
    const autoPopulated: any = {};

    try {
      // Classroom + Subject info
      const classroomSubject = await db.classroomSubject.findUnique({
        where: { classroomId_subjectId: { classroomId, subjectId } },
        include: {
          teacher: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          subject: { select: { name: true, color: true } },
          classroom: {
            select: {
              name: true, grade: true, section: true,
              academicYearId: true,
              institute: {
                select: { name: true, logo: true, ministryLogo: true, ministryText: true }
              }
            }
          }
        }
      });

      if (classroomSubject) {
        const t = classroomSubject.teacher;
        const s = classroomSubject.subject;
        const c = classroomSubject.classroom;

        autoPopulated.teacherName = t ? `${t.firstName} ${t.lastName}` : undefined;
        autoPopulated.teacherEmail = t?.email;
        autoPopulated.teacherPhone = t?.phone;
        autoPopulated.teacherCedula = t?.id;
        autoPopulated.subjectName = s?.name;
        autoPopulated.subjectColor = s?.color;
        autoPopulated.classroomName = c?.name;
        autoPopulated.classroomGrade = c?.grade;
        autoPopulated.classroomSection = c?.section;
        autoPopulated.instituteName = c?.institute?.name;
        autoPopulated.instituteLogo = c?.institute?.logo;
        autoPopulated.ministryLogo = c?.institute?.ministryLogo;
        autoPopulated.ministryText = c?.institute?.ministryText;

        /**
         * LAS SECCIONES DEL MISMO AÑO DONDE ESTE PROFESOR DA ESTA MATERIA
         *
         * El plan en papel dice «AÑO: 5TO · SECCIONES: A-B-C-D»: un profesor
         * entrega un plan para todas sus secciones de ese año (lo copia con
         * «Copiar a otra sección»).
         */
        if (t && c?.academicYearId) {
          const hermanas = await db.classroomSubject.findMany({
            where: { subjectId, teacherId: t.id, classroom: { academicYearId: c.academicYearId, grade: c.grade } },
            select: { classroom: { select: { section: true } } },
          });
          autoPopulated.seccionesDelProfesor = [...new Set(hermanas.map((h: any) => h.classroom.section).filter(Boolean))].sort();
        }

        // Academic Year + Periods
        if (c?.academicYearId) {
          const academicYear = await db.academicYear.findUnique({
            where: { id: c.academicYearId },
            include: { periods: { orderBy: { startDate: 'asc' } } }
          });

          if (academicYear) {
            autoPopulated.academicYearName = academicYear.name;

            // AUTO-GENERATION FALLBACK: If 0 periods exist, dynamically generate them!
            let activePeriods = academicYear.periods || [];
            if (activePeriods.length === 0) {
              const start = new Date(academicYear.startDate);
              const end = new Date(academicYear.endDate);
              const totalDuration = end.getTime() - start.getTime();
              const periodDuration = totalDuration / 3;

              const p1Start = new Date(start);
              const p1End = new Date(start.getTime() + periodDuration);
              
              const p2Start = new Date(p1End.getTime() + 24 * 60 * 60 * 1000);
              const p2End = new Date(start.getTime() + 2 * periodDuration);
              
              const p3Start = new Date(p2End.getTime() + 24 * 60 * 60 * 1000);
              const p3End = new Date(end);

              const createdPeriods = [];
              const periodNames = ['Primer Lapso', 'Segundo Lapso', 'Tercer Lapso'];
              const periodDates = [
                { start: p1Start, end: p1End },
                { start: p2Start, end: p2End },
                { start: p3Start, end: p3End },
              ];

              for (let i = 0; i < 3; i++) {
                const p = await db.period.create({
                  data: {
                    name: periodNames[i],
                    startDate: periodDates[i].start,
                    endDate: periodDates[i].end,
                    isActive: i === 0, // p1 active by default
                    academicYearId: academicYear.id,
                  }
                });
                createdPeriods.push(p);
              }
              activePeriods = createdPeriods;
            }

            // Calcular fechas del lapso basado en los períodos
            const lapsoIndex = parseInt(lapso) - 1;
            const period = activePeriods[lapsoIndex];
            if (period) {
              // Las semanas del plan cuentan desde que EMPIEZA EL PLAN, que el
              // liceo puede poner después del inicio del lapso (semanas de
              // diagnóstico: `Period.inicioDelPlan`). Igual que la clase en
              // vivo (`services/semana-del-plan.service.ts`).
              const inicioDelPlan = (period as any).inicioDelPlan ?? period.startDate;
              autoPopulated.lapsoStartDate = inicioDelPlan;
              autoPopulated.lapsoEndDate = period.endDate;
              autoPopulated.inicioDelLapso = period.startDate;
              autoPopulated.nombreAntesDelPlan = (period as any).nombreAntesDelPlan?.trim() || NOMBRE_ANTES_DEL_PLAN;
              // Calcular semanas asegurando que los dias sobrantes cuenten como semana (Math.ceil)
              const start = new Date(inicioDelPlan);
              const end = new Date(period.endDate);
              const diffMs = end.getTime() - start.getTime();
              const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
              autoPopulated.lapsoWeeks = Math.max(1, diffWeeks);
            }
          }
        }
      }
    } catch (autoErr) {
      logger.warn('Error al auto-poblar datos del plan', { error: autoErr });
    }

    return reply.send({ metadata, autoPopulated });
  } catch (error) {
    logger.error('Error al obtener metadatos del plan de evaluación', { error });
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    return reply.status(500).send({ error: 'Error interno del servidor' });
  }
}

// ============================================================
// 2. POST /metadata — Guardar/Actualizar metadatos
// ============================================================
export async function upsertEvaluationPlanMetadata(
  request: FastifyRequest<{ Body: any }>,
  reply: FastifyReply
) {
  try {
    const { classroomId, subjectId, lapso, ...data } = request.body as any;
    const db = getDb(request);
    const user = request.user as RequestUser;

    if (!user?.userId) throw AppErrors.Forbidden('Usuario no autenticado');
    if (!classroomId || !subjectId || !lapso) throw AppErrors.BadRequest('Faltan parámetros requeridos');

    /**
     * LA CABECERA DEL PLAN TAMBIÉN ES EL PLAN
     *
     * Las filas del plan (`batchUpsertRows`) sí comprobaban quién escribe. Esta
     * función, que guarda la CABECERA —el nombre del profesor, su cédula, su
     * teléfono, su correo, las fechas del lapso— no comprobaba nada: cualquiera
     * con una sesión abierta, un alumno incluido, podía reescribir la cabecera
     * del plan de cualquier clase del liceo.
     *
     * Es la misma comprobación que usan las filas, ni una más. La cazó
     * `puertas-sin-cerradura` (PUERTA-03).
     */
    await assertClassroomScope(db, user as any, classroomId, { subjectId, accion: 'planificar' });

    const metadata = await db.evaluationPlanMetadata.upsert({
      where: { classroomId_subjectId_lapso: { classroomId, subjectId, lapso } },
      update: {
        nombreDocente: data.nombreDocente,
        cedulaDocente: data.cedulaDocente,
        telefonoDocente: data.telefonoDocente,
        correoDocente: data.correoDocente,
        areaFormacion: data.areaFormacion,
        annoSeccion: data.annoSeccion,
        periodoEscolar: data.periodoEscolar,
        totalSemanas: data.totalSemanas,
        fechaDesde: data.fechaDesde,
        fechaHasta: data.fechaHasta,
        peic: data.peic,
        enfasisCurricular: data.enfasisCurricular,
        referentesEticos: data.referentesEticos,
        intencionalidad: data.intencionalidad,
        temaIndispensable: data.temaIndispensable,
        observaciones: data.observaciones,
        customColumns: data.customColumns,
      },
      create: {
        classroomId,
        subjectId,
        lapso,
        nombreDocente: data.nombreDocente,
        cedulaDocente: data.cedulaDocente,
        telefonoDocente: data.telefonoDocente,
        correoDocente: data.correoDocente,
        areaFormacion: data.areaFormacion,
        annoSeccion: data.annoSeccion,
        periodoEscolar: data.periodoEscolar,
        totalSemanas: data.totalSemanas,
        fechaDesde: data.fechaDesde,
        fechaHasta: data.fechaHasta,
        peic: data.peic,
        enfasisCurricular: data.enfasisCurricular,
        referentesEticos: data.referentesEticos,
        intencionalidad: data.intencionalidad,
        temaIndispensable: data.temaIndispensable,
        observaciones: data.observaciones,
        customColumns: data.customColumns,
      }
    });

    return reply.send({ metadata });
  } catch (error) {
    logger.error('Error al guardar metadatos', { error });
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    return reply.status(500).send({ error: 'Error interno del servidor' });
  }
}

// ============================================================
// 3. GET /rows — Obtener filas del plan agrupadas por semana
// ============================================================
export async function getEvaluationPlanRows(
  request: FastifyRequest<{ Querystring: { classroomId: string; subjectId: string; lapso: string } }>,
  reply: FastifyReply
) {
  try {
    const { classroomId, subjectId, lapso } = request.query;
    const db = getDb(request);

    if (!classroomId || !subjectId || !lapso) {
      throw AppErrors.BadRequest('Faltan parámetros requeridos');
    }

    // El plan de una sección lo consulta quien imparte ahí (o el administrador)
    await assertClassroomScope(db, request.user as any, classroomId, { subjectId, accion: 'consultar el plan' });

    const rows = await db.evaluationPlanRow.findMany({
      where: { classroomId, subjectId, lapso },
      orderBy: [{ weekNumber: 'asc' }, { orderIndex: 'asc' }]
    });

    // Agrupar por semana
    const grouped: Record<number, any[]> = {};
    for (const row of rows) {
      if (!grouped[row.weekNumber]) grouped[row.weekNumber] = [];
      grouped[row.weekNumber].push(row);
    }

    return reply.send({ rows, grouped, version: versionDelPlan(rows) });
  } catch (error) {
    logger.error('Error al obtener filas del plan', { error });
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    return reply.status(500).send({ error: 'Error interno del servidor' });
  }
}

// ============================================================
// 4. POST /rows/batch — Guardado masivo de filas
// ============================================================
export async function batchUpsertRows(
  request: FastifyRequest<{ Body: {
    classroomId: string;
    subjectId: string;
    lapso: string;
    rows: any[];
    /** La versión del plan que tenía delante quien guarda (`GET /rows`). */
    version?: string;
  } }>,
  reply: FastifyReply
) {
  try {
    const { classroomId, subjectId, lapso, rows, version } = request.body ?? ({} as any);
    const db = getDb(request);
    const user = request.user as RequestUser;

    if (!user?.userId || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
      throw AppErrors.Forbidden('No tienes permisos');
    }

    if (!classroomId || !subjectId || !lapso) {
      throw AppErrors.BadRequest('Faltan parámetros requeridos');
    }

    // Sin esto, `rows.filter` de más abajo reventaba y el profesor recibía
    // "Error interno del servidor": un mensaje que no dice nada y hace pensar
    // que el sistema está roto, cuando lo que pasa es que faltó la lista.
    if (!Array.isArray(rows)) {
      throw AppErrors.BadRequest('Falta la lista de filas del plan (rows)');
    }

    // El plan es de quien imparte esa materia en esa sección
    await assertClassroomScope(db, user as any, classroomId, { subjectId, accion: 'planificar' });

    // ============================================================
    // VALIDACIÓN BLOQUEANTE: la suma de puntos de los criterios debe
    // ser EXACTAMENTE 20 (escala oficial venezolana 01-20).
    // Cada fila/bloque EVALUATION es un criterio; Puntos es la única
    // fuente de verdad (Ponderación se deriva = puntos/20*100).
    // ============================================================
    const criterios = rows.filter((r: any) => r.rowType === 'EVALUATION');
    const sumaPuntos = criterios.reduce((sum: number, r: any) => sum + (parseFloat(r.puntos) || 0), 0);

    if (criterios.length > 0 && Math.abs(sumaPuntos - 20) > 0.009) {
      return reply.status(400).send({
        success: false,
        error: `La suma de puntos de los criterios es ${sumaPuntos} y debe ser exactamente 20 (escala oficial 01-20). Ajusta los puntos de los criterios de este lapso.`,
        code: 'PLAN_PUNTOS_NOT_20',
        currentSum: sumaPuntos,
      });
    }

    const quien = quienBorra(request as any);
    const result = await db.$transaction(async (tx: any) => {
      // Un plan se guarda de uno en uno: dos guardados a la vez del mismo plan
      // leerían las mismas filas y el segundo borraría lo que añadió el primero.
      await tx.$executeRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`plan|${classroomId}|${subjectId}|${lapso}`}))`;

      // Las filas de ahora se leen DENTRO de la transacción, después del
      // candado: leídas antes, otro guardado podía colarse en medio.
      const currentRows = await tx.evaluationPlanRow.findMany({
        where: { classroomId, subjectId, lapso }
      });

      // Si quien guarda tenía delante otra versión, alguien guardó entretanto
      // (otra pestaña, otro dispositivo). No se toca nada: ver `version-del-plan.ts`.
      if (version && version !== versionDelPlan(currentRows)) {
        throw new PlanCambiadoEnOtroSitio();
      }

      const savedRows = [];
      const usedIds = new Set<string>();
      // Evaluaciones que tenían puntos y se quedan sin ellos: si tienen notas, no.
      const bajanACero: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rawPuntos = row.puntos != null ? parseFloat(row.puntos) : null;
        const calcPonderacion = rawPuntos != null && rawPuntos > 0
          ? Math.round((rawPuntos / 20) * 100 * 100) / 100
          : (row.ponderacion != null ? parseFloat(row.ponderacion) : null);

        const rowData: any = {
          classroomId,
          subjectId,
          lapso,
          rowType: row.rowType || 'EVALUATION',
          weekNumber: row.weekNumber,
          endWeekNumber: row.endWeekNumber || null,
          orderIndex: i,
          title: row.title || null,
          headingLevel: row.headingLevel || null,
          label: row.label || null,
          content: row.content || null,
          textContent: row.textContent || null,
          actividadEval: row.actividadEval || null,
          tecnicas: row.tecnicas || null,
          instrumentos: row.instrumentos || null,
          criterios: row.criterios || null,
          ponderacion: calcPonderacion,
          puntos: rawPuntos,
          tipoEvaluacion: row.tipoEvaluacion || null,
          indicadores: row.indicadores || null,
          extraData: row.extraData || null,
        };

        // Buscar coincidencia existente por id o por (weekNumber + rowType)
        let existingMatch = null;
        if (row.id && !row.id.startsWith('new_')) {
          existingMatch = currentRows.find((cr: any) => cr.id === row.id);
        }
        if (!existingMatch && row.weekNumber) {
          existingMatch = currentRows.find((cr: any) => cr.weekNumber === row.weekNumber && cr.rowType === (row.rowType || 'EVALUATION') && !usedIds.has(cr.id));
        }

        if (existingMatch && (existingMatch.puntos ?? 0) > 0 && !(rawPuntos != null && rawPuntos > 0)) {
          bajanACero.push(existingMatch.id);
        }

        let savedRow;
        let cambio = true;
        if (existingMatch && filaSinCambios(existingMatch, rowData)) {
          // Igual que la guardada: no se reescribe (ver `filaSinCambios`).
          usedIds.add(existingMatch.id);
          savedRow = existingMatch;
          cambio = false;
        } else if (existingMatch) {
          usedIds.add(existingMatch.id);
          savedRow = await tx.evaluationPlanRow.update({
            where: { id: existingMatch.id },
            data: rowData
          });
        } else {
          savedRow = await tx.evaluationPlanRow.create({
            data: rowData
          });
          usedIds.add(savedRow.id);
        }

        // Para filas tipo EVALUATION con ponderación o puntos: auto-crear/actualizar Activity
        const ponderacionVal = calcPonderacion || 0;
        if (row.rowType === 'EVALUATION' && (ponderacionVal > 0 || (rawPuntos && rawPuntos > 0))) {
          const actData = {
            title: row.actividadEval || row.title || 'Actividad Evaluativa',
            type: row.tipoEvaluacion || 'OTHER',
            scope: 'CLASSROOM',
            maxGrade: rawPuntos || 20,
            weight: rawPuntos || 0, // Puntos como referencia de peso del criterio
            classroomId,
            subjectId,
            lapso,
            orderIndex: i,
          };

          if (savedRow.activityId) {
            // Si la fila no cambió, su actividad tampoco. Y la fecha de la
            // actividad es la de cuando se creó: antes cada guardado del plan
            // la ponía en «hoy», a todas las actividades del lapso.
            if (cambio) {
              await tx.activity.update({
                where: { id: savedRow.activityId },
                data: actData
              });
            }
          } else {
            const newActivity = await tx.activity.create({
              data: { ...actData, startDate: new Date(), createdBy: user.userId }
            });
            await tx.evaluationPlanRow.update({
              where: { id: savedRow.id },
              data: { activityId: newActivity.id }
            });
            savedRow.activityId = newActivity.id;
          }
        }

        savedRows.push(savedRow);
      }

      // Eliminar filas removidas que no tengan notas
      const idsToDelete = currentRows
        .filter((cr: any) => !usedIds.has(cr.id))
        .map((cr: any) => cr.id);

      const enRiesgo = [...idsToDelete, ...bajanACero];
      if (enRiesgo.length > 0) {
        const actividades = await tx.classActivity.findMany({
          where: { planRowId: { in: enRiesgo } },
          select: { planRowId: true, scores: true },
        });
        const conNotas = [...new Set(actividades.filter(conNotaPuesta).map((a: any) => a.planRowId as string))];
        if (conNotas.length > 0) {
          const nombres = currentRows
            .filter((cr: any) => conNotas.includes(cr.id))
            .map((cr: any) => `${cr.actividadEval || 'Evaluación'} (semana ${cr.weekNumber})`);
          throw new EvaluacionConNotas(nombres);
        }
      }

      if (idsToDelete.length > 0) {
        const rowsWithGrades = await tx.evaluationPlanRow.findMany({
          where: {
            id: { in: idsToDelete },
            activityId: { not: null },
            activity: { grades: { some: {} } }
          },
          select: { id: true, activityId: true }
        });

        const gradeRowIds = new Set(rowsWithGrades.map((r: any) => r.id));
        const safeIdsToDelete = idsToDelete.filter((id: string) => !gradeRowIds.has(id));

        if (safeIdsToDelete.length > 0) {
          const actsToDelete = currentRows
            .filter((cr: any) => safeIdsToDelete.includes(cr.id) && cr.activityId)
            .map((cr: any) => cr.activityId)
            .filter(Boolean);

          if (actsToDelete.length > 0) {
            await borrarGuardandoCopia(tx, 'activity', { id: { in: actsToDelete } }, quien);
          }
          await borrarGuardandoCopia(tx, 'evaluationPlanRow', { id: { in: safeIdsToDelete } }, quien);
        }
      }

      const despues = await tx.evaluationPlanRow.findMany({
        where: { classroomId, subjectId, lapso },
        select: { id: true, updatedAt: true },
      });
      return { savedRows, version: versionDelPlan(despues) };
    }, {
      // Un plan largo son decenas de filas: los 5 s de fábrica de Prisma se
      // quedaban cortos con el servidor cargado, y entonces se perdía el
      // guardado ENTERO. Mismo margen que el guardado de la clase en vivo.
      timeout: 20000,
      maxWait: 10000,
    });

    return reply.send({ success: true, rows: result.savedRows, version: result.version });
  } catch (error) {
    if (error instanceof PlanCambiadoEnOtroSitio) {
      return reply.status(409).send({
        success: false,
        error: 'Este plan se guardó desde otro sitio (otra pestaña u otro dispositivo) mientras lo editabas. No se ha cambiado nada: tus cambios siguen en pantalla.',
        code: 'PLAN_CAMBIADO_EN_OTRO_SITIO',
      });
    }
    if (error instanceof EvaluacionConNotas) {
      return reply.status(409).send({
        success: false,
        error: `No se guardó: ${error.evaluaciones.join(', ')} ya tiene notas puestas en la clase. Si la quitas o la dejas sin puntos, esas notas saldrían del promedio del lapso. Muévela de semana o cambia sus puntos, pero no la dejes en 0.`,
        code: 'EVALUACION_CON_NOTAS',
        evaluaciones: error.evaluaciones,
      });
    }
    logger.error('Error al guardar filas del plan', { error });
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    return reply.status(500).send({ error: 'Error interno del servidor' });
  }
}

// ============================================================
// LEGACY: batchUpsertActivities (mantener compatibilidad)
// ============================================================
export async function batchUpsertActivities(
  request: FastifyRequest<{ Body: any }>,
  reply: FastifyReply
) {
  // Redirect to batchUpsertRows for backward compatibility
  return batchUpsertRows(request as any, reply);
}
