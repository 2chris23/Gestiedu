import { prismaDe, responder, bitacora } from '../finanzas.controller';
import { FastifyReply, FastifyRequest } from 'fastify';
import { tasaDelDia } from '../../services/tasa-del-dia.service';
import { ActionType } from '../../utils/prisma-enums';
import {
    moduloActivo,
} from '../pagos.controller';
import {
    limpio,
} from '../../services/finanzas.service';

// ─── Los recurrentes y la tasa del día (2026-10-14) ─────────────────────────

const FUENTE_RECURRENTE = /^(DONACION|OTRO|PERSONAL|GASTO:.{1,40})$/;

/** Una plantilla limpia, o un texto con lo que tiene mal. */
export function recurrenteLimpio(x: any): { ok: true; valor: Record<string, unknown> } | { ok: false; error: string } {
    const nombre = limpio(x?.nombre, 40);
    if (!nombre || nombre.length < 2) return { ok: false, error: 'Cada recurrente lleva un nombre' };
    const tipo = x?.tipo === 'entra' || x?.tipo === 'sale' ? x.tipo : null;
    if (!tipo) return { ok: false, error: `«${nombre}»: ¿ingreso o egreso?` };
    const fuente = typeof x?.fuente === 'string' && FUENTE_RECURRENTE.test(x.fuente) ? x.fuente : null;
    if (!fuente) return { ok: false, error: `«${nombre}»: de qué es no vale` };
    if ((tipo === 'entra') !== (fuente === 'DONACION' || fuente === 'OTRO')) return { ok: false, error: `«${nombre}»: no cuadra con ${tipo === 'entra' ? 'un ingreso' : 'un egreso'}` };
    const monto = Number(x?.monto);
    if (!Number.isFinite(monto) || monto <= 0 || monto > 1e9) return { ok: false, error: `«${nombre}»: el monto no vale` };
    const moneda = x?.moneda === 'USD' || x?.moneda === 'VES' ? x.moneda : null;
    if (!moneda) return { ok: false, error: `«${nombre}»: la moneda no vale` };
    const personaId = fuente === 'PERSONAL' ? limpio(x?.personaId, 64) : null;
    if (fuente === 'PERSONAL' && !personaId) return { ok: false, error: `«${nombre}»: ¿a quién se le paga?` };
    return {
        ok: true,
        valor: {
            id: limpio(x?.id, 40) ?? `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            nombre,
            tipo,
            fuente,
            monto: monto.toFixed(2),
            moneda,
            descripcion: limpio(x?.descripcion, 120),
            metodo: limpio(x?.metodo, 30),
            personaId,
            personaNombre: personaId ? limpio(x?.personaNombre, 120) : null,
        },
    };
}

async function recurrentesDelLiceo(prisma: any): Promise<unknown[]> {
    const fila = await prisma.paymentSettings.findUnique({ where: { id: 'liceo' }, select: { recurrentes: true } });
    return Array.isArray(fila?.recurrentes) ? (fila.recurrentes as unknown[]) : [];
}

/** GET /api/finanzas/recurrentes */
export async function getRecurrentes(request: FastifyRequest, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        return reply.send({ recurrentes: await recurrentesDelLiceo(prismaDe(request)) });
    } catch (error) {
        return responder(reply, error, 'Error al leer los recurrentes');
    }
}

/** PUT /api/finanzas/recurrentes — la lista entera (como las categorías). */
export async function guardarRecurrentes(request: FastifyRequest<{ Body: { recurrentes?: unknown[] } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const lista: Record<string, unknown>[] = [];
        for (const x of request.body?.recurrentes ?? []) {
            const r = recurrenteLimpio(x);
            if (!r.ok) return reply.status(400).send({ error: r.error, code: 'RECURRENTE_INVALIDO' });
            lista.push(r.valor);
        }
        if (lista.length > 30) return reply.status(400).send({ error: 'Como mucho 30 recurrentes', code: 'RECURRENTES_DE_MAS' });
        await prismaDe(request).paymentSettings.upsert({ where: { id: 'liceo' }, create: { id: 'liceo', recurrentes: lista as any }, update: { recurrentes: lista as any } });
        await bitacora(request, ActionType.UPDATE, 'RECURRENTES', 'liceo', { cuantos: lista.length });
        return reply.send({ recurrentes: lista });
    } catch (error) {
        return responder(reply, error, 'Error al guardar los recurrentes');
    }
}

/** GET /api/finanzas/tasa — la tasa del BCV de hoy (`services/tasa-del-dia.service.ts`); null si no se sabe. */
export async function getTasa(request: FastifyRequest, reply: FastifyReply) {
    try {
        return reply.send({ tasa: await tasaDelDia() });
    } catch (error) {
        return responder(reply, error, 'Error al leer la tasa');
    }
}
