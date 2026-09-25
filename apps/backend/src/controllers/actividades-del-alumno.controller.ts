import { FastifyReply, FastifyRequest } from 'fastify';
import { assertCanSeeStudent } from '../services/authorization.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { logger } from '../utils/logger';

/**
 * QUÉ LE FALTA Y QUÉ YA LE EVALUARON A UN ALUMNO
 *
 * El liceo ya guardaba las actividades de cada clase, pero no había ninguna
 * pantalla que dijera *cuáles* le faltan a un alumno: el perfil solo enseñaba
 * un número de materias reprobadas. Un representante que pregunta «¿qué debe
 * mi hijo?» no tenía respuesta.
 *
 * QUÉ CUENTA COMO ENTREGADA. En este sistema el alumno no sube nada —así se
 * decidió—, así que la entrega la deja constancia el profesor al ponerle la
 * nota. Por eso:
 *
 *   EVALUADA  — tiene nota puesta en esa actividad.
 *   VENCIDA   — no tiene nota y la fecha ya pasó.
 *   PENDIENTE — no tiene nota y la fecha aún no llega (o no tiene fecha).
 *
 * Se dice así en la pantalla, con esas palabras, para no prometer un "entregado"
 * que nadie registra.
 *
 * Lo ve el propio alumno, su representante, un profesor suyo y el admin
 * (`assertCanSeeStudent`). Nadie escribe nada aquí: es solo de lectura.
 */

export type EstadoDeActividad = 'EVALUADA' | 'VENCIDA' | 'PENDIENTE';

const soloElDia = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

export async function actividadesDelAlumno(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { academicYearId?: string } }>,
    reply: FastifyReply
) {
    try {
        const prisma = request.tenantPrisma;
        const studentId = request.params.id;
        const { academicYearId } = request.query;

        await assertCanSeeStudent(prisma, request.user as any, studentId);

        const inscripciones = await prisma.studentClassroom.findMany({
            where: {
                studentId,
                isActive: true,
                ...(academicYearId ? { classroom: { academicYearId } } : {}),
            },
            select: {
                classroom: {
                    select: {
                        id: true,
                        name: true,
                        shift: true,
                        academicYear: { select: { id: true, name: true, status: true } },
                    },
                },
            },
        });

        // Sin año pedido, el ciclo en curso; si ninguno está activo, el último.
        const delCicloActual = academicYearId
            ? inscripciones
            : inscripciones.filter((i) => i.classroom?.academicYear?.status === 'ACTIVE');
        const elegidas = (delCicloActual.length ? delCicloActual : inscripciones).filter((i) => i.classroom);
        const classroomIds = elegidas.map((i) => i.classroom!.id);

        if (classroomIds.length === 0) {
            return reply.status(200).send({
                actividades: [],
                resumen: { pendientes: 0, vencidas: 0, evaluadas: 0 },
            });
        }

        const actividades = await prisma.classActivity.findMany({
            where: { classroomId: { in: classroomIds } },
            select: {
                id: true,
                title: true,
                description: true,
                type: true,
                tag: true,
                target: true,
                dueDate: true,
                maxScore: true,
                scores: true,
                createdAt: true,
                classroomId: true,
                subject: { select: { id: true, name: true, color: true } },
                classSession: { select: { date: true } },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        });

        const hoy = todayInTimezone(await instituteTimezone(prisma));
        const nombreDeLaSeccion = new Map(elegidas.map((i) => [i.classroom!.id, i.classroom!.name]));

        const lista = actividades.map((a) => {
            const notas = (a.scores ?? {}) as Record<string, number | null>;
            const nota = notas?.[studentId];
            const tieneNota = typeof nota === 'number' && !Number.isNaN(nota);
            // La fecha que le importa al alumno: la de entrega si la hay; si no,
            // el día de la clase donde se puso.
            const fecha = a.dueDate ?? a.classSession?.date ?? null;
            const dia = fecha ? soloElDia(fecha) : null;

            const estado: EstadoDeActividad = tieneNota
                ? 'EVALUADA'
                : dia && dia < hoy
                  ? 'VENCIDA'
                  : 'PENDIENTE';

            return {
                id: a.id,
                title: a.title,
                description: a.description,
                type: a.type,
                tag: a.tag,
                fecha: dia,
                maxScore: a.maxScore ?? null,
                nota: tieneNota ? nota : null,
                estado,
                subject: a.subject,
                classroom: { id: a.classroomId, name: nombreDeLaSeccion.get(a.classroomId) ?? '' },
            };
        });

        const resumen = {
            pendientes: lista.filter((a) => a.estado === 'PENDIENTE').length,
            vencidas: lista.filter((a) => a.estado === 'VENCIDA').length,
            evaluadas: lista.filter((a) => a.estado === 'EVALUADA').length,
        };

        return reply.status(200).send({ actividades: lista, resumen });
    } catch (error) {
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error listando actividades del alumno', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'No se pudieron cargar las actividades' });
    }
}
