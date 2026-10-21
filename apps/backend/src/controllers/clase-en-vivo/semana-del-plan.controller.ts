import { planDeLaFecha, exigirClasePropia, getPlanWeekNumber } from './sesion-de-clase.controller';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { teacherClassroomIds } from '../../services/authorization.service';

/**
 * Buscar estudiantes de todo el instituto (cualquier sección o año) para
 * agregarlos como involucrados en una clase.
 */
export async function searchStudentsForSession(
    request: FastifyRequest<{ Querystring: { search?: string } }>,
    reply: FastifyReply
) {
    try {
        const { search } = request.query;
        const prisma = request.tenantPrisma;

        const where: any = { role: 'STUDENT', isActive: true };
        /**
         * El profesor encuentra a los alumnos de las secciones donde da clase o
         * es guía; el admin, a todos. Antes cualquier profesor sacaba el nombre,
         * la cédula, la foto y la sección de cualquier alumno del liceo con solo
         * escribir una letra (HUECOS_ABIERTOS de `quien-puede-que.test.ts`).
         */
        const quien = request.user as any;
        if (quien?.role !== 'ADMIN') {
            const secciones = await teacherClassroomIds(prisma, quien?.userId ?? quien?.id ?? '');
            where.studentClassrooms = { some: { isActive: true, classroomId: { in: secciones } } };
        }
        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { studentCode: { contains: search, mode: 'insensitive' } },
                { id: { contains: search } },
            ];
        }

        const students = await prisma.user.findMany({
            where,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                studentCode: true,
                studentClassrooms: {
                    where: { isActive: true },
                    take: 1,
                    select: {
                        classroom: {
                            select: {
                                id: true,
                                name: true,
                                academicYear: { select: { name: true } },
                            },
                        },
                    },
                },
            },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
            take: 50,
        });

        const mapped = students.map((s: any) => {
            const activeClassroom = s.studentClassrooms?.[0]?.classroom || null;
            return {
                id: s.id,
                firstName: s.firstName,
                lastName: s.lastName,
                avatar: s.avatar,
                studentCode: s.studentCode,
                classroomName: activeClassroom?.name || null,
                academicYearName: activeClassroom?.academicYear?.name || null,
                classroomId: activeClassroom?.id || null,
            };
        });

        return reply.status(200).send({ students: mapped });
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error searching students for session', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al buscar estudiantes' });
    }
}

const PLAN_ROW_FIELDS = [
    'title', 'label', 'textContent', 'actividadEval', 'tecnicas',
    'instrumentos', 'criterios', 'tipoEvaluacion', 'ponderacion', 'puntos',
];

/**
 * Guardar la fila del plan de evaluación de la semana actual desde la clase en vivo.
 * Espejo del plan: si no existe la fila EVALUATION de la semana, se crea.
 * Persiste columnas personalizadas en metadata.customColumns y valores extra en extraData.
 */
export async function savePlanWeekRow(
    request: FastifyRequest<{
        Body: {
            classroomId: string;
            subjectId: string;
            date: string;
            values: Record<string, any>;
            columns?: Array<{ key: string; label: string; mergeable?: boolean; numeric?: boolean }>;
        };
    }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId, date, values = {}, columns } = request.body;
        const prisma = request.tenantPrisma;

        if (!classroomId || !subjectId || !date) {
            return reply.status(400).send({ error: 'Faltan parámetros requeridos: classroomId, subjectId, date' });
        }

        await exigirClasePropia(request, classroomId, subjectId, 'planificar');

        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
            return reply.status(400).send({ error: 'Fecha inválida' });
        }

        // 1. El plan de ESE lapso (para lapso y columnas)
        const { meta: delLapso, sem } = await planDeLaFecha(prisma, classroomId, subjectId, parsedDate);
        if (sem.antesDelPlan) {
            return reply.status(400).send({
                error: `Esta semana es de ${sem.nombreAntesDelPlan.toLowerCase()}: el plan de evaluación empieza el ${sem.inicioDelPlan!.toISOString().slice(0, 10).split('-').reverse().join('/')}.`,
                code: 'ANTES_DEL_PLAN',
            });
        }
        let meta = delLapso;

        // Si no existe metadata, crearla mínima, del lapso de esa fecha
        if (!meta) {
            meta = await prisma.evaluationPlanMetadata.create({
                data: { classroomId, subjectId, lapso: sem.lapso ?? '1' },
            });
        }

        // 2. Guardar columnas personalizadas si vienen
        if (Array.isArray(columns)) {
            const cleaned = columns.filter((c: any) => c && c.key && c.label);
            await prisma.evaluationPlanMetadata.update({
                where: { id: meta.id },
                data: { customColumns: JSON.stringify(cleaned) },
            });
        }

        // 3. Calcular semana
        const weekNumber = (await getPlanWeekNumber(prisma, classroomId, subjectId, parsedDate))?.semana;
        if (!weekNumber) {
            return reply.status(400).send({ error: 'No se pudo determinar la semana del plan (falta fecha de inicio del ciclo)' });
        }

        // 4. Separar valores conocidos vs extras (columnas personalizadas)
        // Solo actualizar los campos que vienen en values (partial update)
        const known: Record<string, any> = {};
        const extra: Record<string, any> = {};
        Object.entries(values).forEach(([k, v]) => {
            if (PLAN_ROW_FIELDS.includes(k)) known[k] = v;
            else extra[k] = v;
        });

        // 5. Upsert de la fila EVALUATION de la semana (partial update)
        const existing = await prisma.evaluationPlanRow.findFirst({
            where: { classroomId, subjectId, lapso: meta.lapso, weekNumber, rowType: 'EVALUATION' },
        });

        // Solo tocar los campos que vienen explicitamente en values
        const rowData: any = {};
        PLAN_ROW_FIELDS.forEach(field => {
            if (field in known) {
                if (field === 'ponderacion' || field === 'puntos') {
                    rowData[field] = known[field] !== null && known[field] !== ''
                        ? parseFloat(known[field]) : null;
                } else {
                    rowData[field] = known[field] !== undefined ? known[field] : null;
                }
            }
        });

        // extraData: mezclar con existente si hay
        if (Object.keys(extra).length > 0) {
            let existingExtra: any = {};
            if (existing?.extraData) {
                try { existingExtra = JSON.parse(existing.extraData); } catch { /* ignorar */ }
            }
            rowData.extraData = JSON.stringify({ ...existingExtra, ...extra });
        }

        let savedRow;
        if (existing) {
            savedRow = await prisma.evaluationPlanRow.update({
                where: { id: existing.id },
                data: rowData,
            });
        } else {
            const count = await prisma.evaluationPlanRow.count({
                where: { classroomId, subjectId, lapso: meta.lapso },
            });
            savedRow = await prisma.evaluationPlanRow.create({
                data: {
                    classroomId,
                    subjectId,
                    lapso: meta.lapso,
                    rowType: 'EVALUATION',
                    weekNumber,
                    orderIndex: count,
                    ...rowData,
                },
            });
        }

        return reply.status(200).send({ success: true, row: savedRow, weekNumber });
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error saving plan week row', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al guardar la fila del plan' });
    }
}
