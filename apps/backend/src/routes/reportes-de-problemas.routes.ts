import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'crypto';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { avisar } from '../services/avisos.service';
import { taparEnTexto } from '../utils/datos-en-registros';
import { avisarSiFalla } from '../utils/sin-callar';

/**
 * «REPORTAR UN PROBLEMA» (18-oct-2026)
 *
 * Cristian: «que cualquier usuario pueda reportar un error y me llega a mi
 * panel admin». Cualquiera con sesión manda qué pasó; le llega al admin de su
 * liceo (aviso y lista en Configuración) y la huella de los errores de su
 * pantalla (`lib/reportar-fallo.ts`) lo une con lo que ve el superadmin.
 *
 *   POST  /api/reportes-de-problemas           cualquiera con sesión
 *   GET   /api/reportes-de-problemas           el admin, todos; los demás, los suyos
 *   PATCH /api/reportes-de-problemas/:id       el admin: estado y respuesta (le llega al autor)
 */

const ESTADOS = ['abierto', 'visto', 'resuelto'] as const;
const yo = (r: FastifyRequest) => ({ id: (r.user as any)?.userId ?? (r.user as any)?.id, role: (r.user as any)?.role as string });

export async function reportesDeProblemasRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/reportes-de-problemas',
        {
            preHandler: [authenticate],
            config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
            schema: {
                body: {
                    type: 'object',
                    required: ['texto'],
                    additionalProperties: false,
                    properties: {
                        texto: { type: 'string', minLength: 3, maxLength: 2000 },
                        pantalla: { type: 'string', maxLength: 300 },
                        version: { type: 'string', maxLength: 40 },
                        aparato: { type: 'string', maxLength: 200 },
                        huellas: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 64 } },
                    },
                },
            },
        } as any,
        async (request: FastifyRequest, reply: FastifyReply) => {
            const b = request.body as { texto: string; pantalla?: string; version?: string; aparato?: string; huellas?: string[] };
            const prisma = request.tenantPrisma as any;
            const quien = yo(request);
            const id = randomUUID();
            await prisma.$executeRawUnsafe(
                `INSERT INTO "reportes_de_problemas" ("id","autorId","texto","pantalla","version","aparato","huellas") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                id,
                quien.id,
                b.texto.trim(),
                b.pantalla ? b.pantalla.split('?')[0] : null,
                b.version ?? null,
                b.aparato ?? null,
                b.huellas ?? []
            );
            const admins: Array<{ id: string }> = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
            const instituteId = (request as any).institute?.id ?? (request.user as any)?.instituteId ?? '';
            void avisar(prisma, instituteId, (request.server as any).io, {
                a: admins.map((a) => a.id).filter((a) => a !== quien.id),
                titulo: 'Reportaron un problema',
                mensaje: taparEnTexto(b.texto.trim()).slice(0, 200),
                enlace: '/dashboard/configuracion?seccion=problemas',
                tipo: 'WARNING',
            } as any).catch(avisarSiFalla('reporte-de-problema'));
            return reply.status(201).send({ id });
        }
    );

    fastify.get('/reportes-de-problemas', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
        const prisma = request.tenantPrisma as any;
        const quien = yo(request);
        const q = request.query as { estado?: string; pagina?: string };
        const pagina = Math.max(1, Number(q.pagina) || 1);
        const esAdmin = quien.role === 'ADMIN';
        const condiciones: string[] = [];
        const args: unknown[] = [];
        if (!esAdmin) {
            args.push(quien.id);
            condiciones.push(`r."autorId" = $${args.length}`);
        }
        if (q.estado && (ESTADOS as readonly string[]).includes(q.estado)) {
            args.push(q.estado);
            condiciones.push(`r."estado" = $${args.length}`);
        }
        const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
        args.push(20, (pagina - 1) * 20);
        const filas = await prisma.$queryRawUnsafe(
            `SELECT r.*, u."firstName" || ' ' || u."lastName" AS autor, u.role AS "rolDelAutor"
               FROM "reportes_de_problemas" r LEFT JOIN users u ON u.id = r."autorId"
               ${donde} ORDER BY CASE r."estado" WHEN 'resuelto' THEN 1 ELSE 0 END, r."creadoEn" DESC
               LIMIT $${args.length - 1} OFFSET $${args.length}`,
            ...args
        );
        const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int n FROM "reportes_de_problemas" r ${donde}`, ...args.slice(0, -2));
        return { reportes: filas, total: n, pagina };
    });

    fastify.patch(
        '/reportes-de-problemas/:id',
        {
            preHandler: [authenticate, requireAdmin],
            schema: {
                body: {
                    type: 'object',
                    additionalProperties: false,
                    properties: { estado: { type: 'string', enum: [...ESTADOS] }, respuesta: { type: 'string', maxLength: 2000 } },
                },
            },
        } as any,
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { id } = request.params as { id: string };
            const b = request.body as { estado?: string; respuesta?: string };
            const prisma = request.tenantPrisma as any;
            const [r] = await prisma.$queryRawUnsafe(`SELECT "autorId", "respuesta" FROM "reportes_de_problemas" WHERE id = $1`, id);
            if (!r) return reply.status(404).send({ error: 'Ese reporte no existe', code: 'REPORTE_NO_EXISTE' });
            await prisma.$executeRawUnsafe(
                `UPDATE "reportes_de_problemas" SET "estado" = COALESCE($2, "estado"), "respuesta" = COALESCE($3, "respuesta"),
                   "respondidoPor" = CASE WHEN $3 IS NULL THEN "respondidoPor" ELSE $4 END, "actualizadoEn" = now() WHERE id = $1`,
                id,
                b.estado ?? null,
                b.respuesta?.trim() || null,
                yo(request).id
            );
            if (b.respuesta?.trim() && b.respuesta.trim() !== r.respuesta) {
                const instituteId = (request as any).institute?.id ?? (request.user as any)?.instituteId ?? '';
                void avisar(prisma, instituteId, (request.server as any).io, {
                    a: [r.autorId],
                    titulo: 'Te respondieron sobre el problema que reportaste',
                    mensaje: b.respuesta.trim().slice(0, 200),
                    enlace: '/dashboard/configuracion?seccion=reportar',
                } as any).catch(avisarSiFalla('respuesta-a-reporte'));
            }
            return { ok: true };
        }
    );
}
