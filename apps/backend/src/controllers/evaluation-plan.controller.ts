import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { AppErrors } from '../middleware/error.middleware';
import { RequestUser } from '../types/fastify';
import * as mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import { planWeekNumberFromRange } from '../utils/plan-weeks';
import { assertClassroomScope, assertCanSeeClassroom } from '../services/authorization.service';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { versionDelPlan, filaSinCambios } from '../utils/version-del-plan';

/** Alguien guardó este plan después de que quien guarda ahora lo abriera. */
class PlanCambiadoEnOtroSitio extends Error {}

// Helper para obtener el cliente DB del tenant.
// SEGURIDAD: No hay fallback al platform DB. Si tenantPrisma no está resuelto,
// la request debe fallar (fail-closed) para evitar filtrar datos entre institutos.
function getDb(request: FastifyRequest) {
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
              autoPopulated.lapsoStartDate = period.startDate;
              autoPopulated.lapsoEndDate = period.endDate;
              // Calcular semanas asegurando que los dias sobrantes cuenten como semana (Math.ceil)
              const start = new Date(period.startDate);
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
    logger.error('Error al guardar filas del plan', { error });
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    return reply.status(500).send({ error: 'Error interno del servidor' });
  }
}

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

        // Eliminar filas existentes del destino (sin actividades con calificaciones)
        await borrarGuardandoCopia(
          tx,
          'evaluationPlanRow',
          { classroomId: targetClassroomId, subjectId: sourceSubjectId, lapso: sourceLapso },
          quienBorra(request as any)
        );

        // Copiar filas (sin activityId)
        for (const row of sourceRows) {
          const { id, classroomId: _, activityId, createdAt, updatedAt, ...rowData } = row;
          await tx.evaluationPlanRow.create({
            data: { ...rowData, classroomId: targetClassroomId }
          });
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

        // Encontrar lapso activo para esta fecha
        const meta = allMetadata.find((m: any) => 
          m.subjectId === subjectId &&
          m.fechaDesde && m.fechaHasta &&
          new Date(m.fechaDesde) <= d && d <= new Date(m.fechaHasta)
        );

        let weekNumber: number | undefined;
        let planContent: any = undefined;
        let hasEvaluation = false;
        let evaluationCount = 0;

        if (meta && meta.fechaDesde) {
          // Calcular semana (CORRECCIÓN: alineada a LUNES — Semana 2 inicia en
          // el primer lunes posterior a la semana inicial; utils/plan-weeks.ts)
          const lapsoStart = new Date(meta.fechaDesde);
          weekNumber = planWeekNumberFromRange(lapsoStart, d);

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

// ============================================================
// Import Word Document Parsing
// ============================================================
export async function parseWordFile(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = await request.file();
    if (!data) {
      throw AppErrors.BadRequest('No se ha subido ningún archivo');
    }

    // SEGURIDAD: Validar extensión .docx (parser-docx-memory-exhaustion-eval-plan)
    if (!data.filename || !data.filename.toLowerCase().endsWith('.docx')) {
      throw AppErrors.BadRequest('Solo se admiten documentos en formato Word (.docx)');
    }

    const buffer = await data.toBuffer();

    // SEGURIDAD: Limitar tamaño del archivo a 2MB
    if (buffer.length > 2 * 1024 * 1024) {
      throw AppErrors.BadRequest('El documento excede el tamaño máximo permitido (2MB)');
    }

    // SEGURIDAD: Validar cabecera mágica PKZip (0x50, 0x4B, 0x03, 0x04)
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      buffer[2] !== 0x03 ||
      buffer[3] !== 0x04
    ) {
      throw AppErrors.BadRequest('El archivo subido no es un documento .docx válido');
    }

    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value;

    const $ = cheerio.load(html);
    const table = $('table').first();

    if (!table.length) {
      throw AppErrors.BadRequest('El documento no contiene ninguna tabla válida para procesar');
    }

    // SEGURIDAD: Limitar número máximo de filas para evitar bloqueo del bucle de eventos
    const trElements = table.find('tr');
    if (trElements.length > 500) {
      throw AppErrors.BadRequest('El documento contiene demasiadas filas en la tabla (máximo 500)');
    }

    const rows: Record<string, string>[] = [];
    const headerMapping: Record<number, string> = {};

    // Keys mapping heuristic
    const mapHeaderToKey = (text: string) => {
      text = text.toLowerCase();
      if (text.includes('tema')) return 'title';
      if (text.includes('tejido')) return 'label';
      if (text.includes('referente') || text.includes('teórico') || text.includes('teorico')) return 'textContent';
      if (text.includes('actividad')) return 'actividadEval';
      if (text.includes('técnica') || text.includes('tecnica')) return 'tecnicas';
      if (text.includes('instrumento')) return 'instrumentos';
      if (text.includes('criterio')) return 'criterios';
      if (text.includes('tipo')) return 'tipoEvaluacion';
      if (text.includes('%') || text.includes('ponderación') || text.includes('ponderacion')) return 'ponderacion';
      if (text.includes('punto') || text.includes('pts')) return 'puntos';
      return null;
    };

    table.find('tr').each((rowIndex, tr) => {
      const isHeader = rowIndex === 0;
      const rowData: Record<string, string> = {};
      let hasData = false;

      $(tr).find('td, th').each((colIndex, cell) => {
        const text = $(cell).text().trim();
        if (isHeader) {
          const key = mapHeaderToKey(text);
          if (key) headerMapping[colIndex] = key;
        } else {
          const key = headerMapping[colIndex];
          if (key) {
            rowData[key] = text;
            if (text.length > 0) hasData = true;
          }
        }
      });

      if (!isHeader && hasData) {
        rows.push(rowData);
      }
    });

    return reply.send({ success: true, rows });
  } catch (error: any) {
    logger.error('Error al parsear documento Word', { error: error.message });
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    return reply.status(500).send({ error: 'Error procesando el archivo Word. Asegúrate de que no esté dañado y contenga una tabla.' });
  }
}
