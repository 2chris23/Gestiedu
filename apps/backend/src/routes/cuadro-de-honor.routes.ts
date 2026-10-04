import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { UserRole } from '../utils/prisma-enums';
import { CICLO, ultimasFotos } from '../services/cuadro-de-honor.service';

/**
 * EL CUADRO DE HONOR (`/api/cuadro-de-honor`, 2026-10-04)
 *
 *   GET /                  el admin: el top del liceo o de un año, de un lapso o del ciclo
 *   GET /alumno/:studentId el alumno (lo suyo), su representante y el admin:
 *                          su puntaje, el desglose y cuántos puestos subió.
 *                          Al alumno y al representante NUNCA el puesto ni a
 *                          los demás (lo decidió Cristian); el admin, sí.
 *
 * Se lee la foto del último sábado (`cuadro-de-honor.service.ts`): no se
 * calcula nada al abrir la pantalla.
 */

const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function cicloEnCurso(prisma: any) {
    return prisma.academicYear.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
        include: { periods: { orderBy: { startDate: 'asc' }, select: { id: true, name: true, startDate: true } } },
    });
}

export async function cuadroDeHonorRoutes(fastify: FastifyInstance) {
    fastify.get<{ Querystring: { alcance?: string; ano?: number; cuantos?: number } }>(
        '/',
        {
            preHandler: [authenticate, requireAdmin],
            schema: {
                querystring: {
                    type: 'object',
                    properties: {
                        alcance: { type: 'string', maxLength: 64 },
                        ano: { type: 'integer', minimum: 1, maximum: 6 },
                        cuantos: { type: 'integer', minimum: 1, maximum: 50 },
                    },
                },
            },
        },
        async (request, reply) => {
            const prisma = request.tenantPrisma as any;
            const ciclo = await cicloEnCurso(prisma);
            if (!ciclo) return reply.send({ fecha: null, alcances: [], filas: [] });
            const alcances = [
                ...ciclo.periods.map((p: any) => ({ id: p.id, nombre: p.name })),
                { id: CICLO, nombre: 'Ciclo completo' },
            ];
            const alcance = request.query.alcance && alcances.some((a) => a.id === request.query.alcance) ? request.query.alcance : CICLO;
            const { ultima, anterior } = await ultimasFotos(prisma, ciclo.id);
            if (!ultima) return reply.send({ fecha: null, alcance, alcances, filas: [] });
            const ano = request.query.ano;
            const campoDePuesto = ano ? 'puestoAno' : 'puestoLiceo';
            const filas = await prisma.puntajeDelCuadro.findMany({
                where: { academicYearId: ciclo.id, alcance, fecha: ultima, ...(ano ? { grado: ano } : {}) },
                orderBy: [{ [campoDePuesto]: 'asc' }, { promedio: 'desc' }],
                take: request.query.cuantos ?? 10,
            });
            const ids = filas.map((f: any) => f.studentId);
            const [personas, antes, secciones] = await Promise.all([
                prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, avatar: true } }),
                anterior
                    ? prisma.puntajeDelCuadro.findMany({ where: { academicYearId: ciclo.id, alcance, fecha: anterior, studentId: { in: ids } } })
                    : [],
                prisma.studentClassroom.findMany({
                    where: { studentId: { in: ids }, academicYearId: ciclo.id, isActive: true },
                    select: { studentId: true, classroom: { select: { name: true } } },
                }),
            ]);
            const persona = new Map<string, any>(personas.map((p: any) => [p.id, p]));
            const previa = new Map<string, any>((antes as any[]).map((p) => [p.studentId, p]));
            const seccion = new Map<string, string>(secciones.map((s: any) => [s.studentId, s.classroom.name]));
            return reply.send({
                fecha: ymd(ultima),
                alcance,
                alcances,
                filas: filas.map((f: any) => {
                    const p = persona.get(f.studentId);
                    const a = previa.get(f.studentId);
                    return {
                        id: f.studentId,
                        nombre: p ? `${p.firstName} ${p.lastName}` : f.studentId,
                        avatar: p?.avatar ?? null,
                        seccion: seccion.get(f.studentId) ?? null,
                        grado: f.grado,
                        puesto: f[campoDePuesto],
                        subio: a ? a[campoDePuesto] - f[campoDePuesto] : null,
                        puntaje: num(f.puntaje),
                        promedio: num(f.promedio),
                        asistencia: f.asistencia,
                        observaciones: f.observaciones,
                        desglose: { notas: num(f.puntosNotas), asistencia: num(f.puntosAsistencia), resta: num(f.resta) },
                    };
                }),
            });
        }
    );

    fastify.get<{ Params: { studentId: string } }>(
        '/alumno/:studentId',
        {
            preHandler: [authenticate],
            schema: { params: { type: 'object', required: ['studentId'], properties: { studentId: { type: 'string', minLength: 1, maxLength: 64 } } } },
        },
        async (request, reply) => {
            const prisma = request.tenantPrisma as any;
            const user = request.user as any;
            const yo = user?.userId ?? user?.id;
            const { studentId } = request.params;
            const esAdmin = user?.role === UserRole.ADMIN;
            // El alumno, lo suyo; el representante, lo de sus representados;
            // el admin, todo. El profesor no: es un número de TODAS las materias.
            let puede = esAdmin || (user?.role === UserRole.STUDENT && yo === studentId);
            if (!puede && user?.role === UserRole.TUTOR) {
                puede = (await prisma.studentTutor.count({ where: { tutorId: yo, studentId } })) > 0;
            }
            if (!puede) return reply.status(403).send({ error: 'No autorizado', code: 'FORBIDDEN' });

            const ciclo = await cicloEnCurso(prisma);
            if (!ciclo) return reply.send({ fecha: null, alcances: [] });
            const { ultima, anterior } = await ultimasFotos(prisma, ciclo.id);
            if (!ultima) return reply.send({ fecha: null, alcances: [] });
            const [mias, antes] = await Promise.all([
                prisma.puntajeDelCuadro.findMany({ where: { academicYearId: ciclo.id, fecha: ultima, studentId } }),
                anterior ? prisma.puntajeDelCuadro.findMany({ where: { academicYearId: ciclo.id, fecha: anterior, studentId } }) : [],
            ]);
            const previa = new Map<string, any>((antes as any[]).map((p) => [p.alcance, p]));
            const nombreDe = new Map<string, string>([...ciclo.periods.map((p: any) => [p.id, p.name]), [CICLO, 'Ciclo completo']]);
            const orden = [...ciclo.periods.map((p: any) => p.id), CICLO];
            return reply.send({
                fecha: ymd(ultima),
                alcances: mias
                    .sort((a: any, b: any) => orden.indexOf(a.alcance) - orden.indexOf(b.alcance))
                    .map((f: any) => {
                        const a = previa.get(f.alcance);
                        return {
                            alcance: f.alcance,
                            nombre: nombreDe.get(f.alcance) ?? f.alcance,
                            puntaje: num(f.puntaje),
                            // Cuántos puestos subió EN SU AÑO desde el sábado anterior
                            // (negativo: bajó; null: es su primera foto).
                            subio: a ? a.puestoAno - f.puestoAno : null,
                            desglose: {
                                promedio: num(f.promedio),
                                asistencia: f.asistencia,
                                observaciones: f.observaciones,
                                notas: num(f.puntosNotas),
                                puntosAsistencia: num(f.puntosAsistencia),
                                resta: num(f.resta),
                            },
                            ...(esAdmin ? { puestoAno: f.puestoAno, puestoLiceo: f.puestoLiceo } : {}),
                        };
                    }),
            });
        }
    );
}
