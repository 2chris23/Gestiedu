import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { AppErrors } from '../middleware/error.middleware';
import { RequestUser } from '../types/fastify';
import * as mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import { planWeekNumberFromRange } from '../utils/plan-weeks';

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

    return reply.send({ rows, grouped });
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
  } }>,
  reply: FastifyReply
) {
  try {
    const { classroomId, subjectId, lapso, rows } = request.body;
    const db = getDb(request);
    const user = request.user as RequestUser;

    if (!user?.userId || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
      throw AppErrors.Forbidden('No tienes permisos');
    }

    if (!classroomId || !subjectId || !lapso) {
      throw AppErrors.BadRequest('Faltan parámetros requeridos');
    }

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

    // Obtener filas actuales
    const currentRows = await db.evaluationPlanRow.findMany({
      where: { classroomId, subjectId, lapso }
    });

    const currentIds = currentRows.map((r: any) => r.id);
    const incomingIds = rows.filter((r: any) => r.id && !r.id.startsWith('new_')).map((r: any) => r.id);
    const idsToDelete = currentIds.filter((id: string) => !incomingIds.includes(id));

    const result = await db.$transaction(async (tx: any) => {
      // Eliminar filas removidas
      if (idsToDelete.length > 0) {
        // Verificar si alguna tiene actividad con calificaciones
        const rowsToDelete = await tx.evaluationPlanRow.findMany({
          where: { id: { in: idsToDelete }, activityId: { not: null } },
          select: { activityId: true }
        });
        
        const actIds = rowsToDelete.map((r: any) => r.activityId).filter(Boolean);
        if (actIds.length > 0) {
          const withGrades = await tx.grade.count({
            where: { activityId: { in: actIds } }
          });
          if (withGrades > 0) {
            throw AppErrors.BadRequest('No se pueden eliminar filas con evaluaciones que ya tienen calificaciones');
          }
          // Eliminar actividades sin calificaciones
          await tx.activity.deleteMany({ where: { id: { in: actIds } } });
        }

        await tx.evaluationPlanRow.deleteMany({
          where: { id: { in: idsToDelete } }
        });
      }

      // Upsert filas
      const savedRows = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowData: any = {
          classroomId,
          subjectId,
          lapso,
          rowType: row.rowType,
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
          ponderacion: row.ponderacion != null
            ? parseFloat(row.ponderacion)
            : Math.round(((row.puntos || 0) / 20) * 100 * 100) / 100, // derivada de Puntos
          puntos: row.puntos != null ? parseFloat(row.puntos) : null,
          tipoEvaluacion: row.tipoEvaluacion || null,
          indicadores: row.indicadores || null,
          extraData: row.extraData || null,
        };

        let savedRow;
        if (row.id && !row.id.startsWith('new_')) {
          savedRow = await tx.evaluationPlanRow.update({
            where: { id: row.id },
            data: rowData
          });
        } else {
          savedRow = await tx.evaluationPlanRow.create({
            data: rowData
          });
        }

        // Para filas tipo EVALUATION con ponderación: auto-crear/actualizar Activity
        // PONDERACIÓN DERIVADA: si no vino, se calcula desde Puntos (puntos/20*100).
        const ponderacionVal = row.ponderacion != null
          ? parseFloat(row.ponderacion)
          : Math.round(((row.puntos || 0) / 20) * 100);
        if (row.rowType === 'EVALUATION' && ponderacionVal > 0) {
          const actData = {
            title: row.actividadEval || 'Actividad Evaluativa',
            type: row.tipoEvaluacion || 'OTHER',
            scope: 'CLASSROOM',
            startDate: new Date(),
            maxGrade: row.puntos || 20,
            weight: row.puntos || 0, // Puntos como referencia de peso del criterio
            classroomId,
            subjectId,
            lapso,
            orderIndex: i,
          };

          if (savedRow.activityId) {
            await tx.activity.update({
              where: { id: savedRow.activityId },
              data: actData
            });
          } else {
            const newActivity = await tx.activity.create({
              data: { ...actData, createdBy: user.userId }
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

      return savedRows;
    });

    return reply.send({ success: true, rows: result });
  } catch (error) {
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
    const { sourceClassroomId, sourceSubjectId, sourceLapso, targetClassroomIds } = request.body;
    const db = getDb(request);
    const user = request.user as RequestUser;

    if (!user?.userId || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
      throw AppErrors.Forbidden('No tienes permisos');
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
        await tx.evaluationPlanRow.deleteMany({
          where: { classroomId: targetClassroomId, subjectId: sourceSubjectId, lapso: sourceLapso }
        });

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

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon... 6=Sat
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

    const buffer = await data.toBuffer();
    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value;

    const $ = cheerio.load(html);
    const table = $('table').first();

    if (!table.length) {
      throw AppErrors.BadRequest('El documento no contiene ninguna tabla válida para procesar');
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
