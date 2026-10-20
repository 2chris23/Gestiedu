import { idDe, prismaDe, responder, bitacora, dineroDe, ymd, fechaDB, elCiclo, anular } from '../finanzas.controller';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ActionType } from '../../utils/prisma-enums';
import { deCentimos } from '../../services/pagos.service';
import {
    hoyDelLiceo,
    moduloActivo,
} from '../pagos.controller';
import {
    limpio,
    validarFecha,
} from '../../services/finanzas.service';
import { comprimirComprobante, PESO_MAXIMO_DE_SUBIDA } from '../../services/foto-de-perfil.service';

// ─── Fondos ─────────────────────────────────────────────────────────────────

const CONCEPTOS_DE_FONDO = ['SALDO_INICIAL', 'DONACION', 'OTRO'];

/** GET /api/finanzas/fondos?academicYearId= — los del ciclo (por fecha). */
export async function getFondos(request: FastifyRequest<{ Querystring: { academicYearId?: string } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const ciclo = await elCiclo(request);
        const filas = await prismaDe(request).fondoDelLiceo.findMany({
            where: { fecha: { gte: ciclo.startDate, lte: ciclo.endDate } },
            orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
        });
        return reply.send({ fondos: filas.map((f: any) => ({ ...f, fecha: ymd(f.fecha), monto: f.monto.toString(), tasa: f.tasa?.toString() ?? null, montoBase: f.montoBase.toString() })) });
    } catch (error) {
        return responder(reply, error, 'Error al leer los fondos');
    }
}

/** POST /api/finanzas/fondos — agregar fondos (el saldo con que se empieza, una donación…). */
export async function crearFondo(request: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const prisma = prismaDe(request);
        const b: any = request.body ?? {};
        if (!CONCEPTOS_DE_FONDO.includes(b.concepto)) return reply.status(400).send({ error: 'Concepto inválido', code: 'CONCEPTO_INVALIDO' });
        const fecha = validarFecha(b.fecha);
        if (fecha > (await hoyDelLiceo(prisma))) return reply.status(400).send({ error: 'La fecha no puede ser futura', code: 'FECHA_FUTURA' });
        const d = await dineroDe(prisma, b);
        const fondo = await prisma.fondoDelLiceo.create({
            data: {
                fecha: fechaDB(fecha),
                concepto: b.concepto,
                descripcion: limpio(b.descripcion, 200),
                moneda: d.moneda,
                monto: deCentimos(d.montoCents),
                tasa: d.tasa,
                montoBase: deCentimos(d.baseCents),
                creadoPorId: idDe(request),
            },
        });
        await bitacora(request, ActionType.CREATE, 'FONDO', fondo.id, { concepto: b.concepto, montoBase: deCentimos(d.baseCents) });
        return reply.status(201).send({ fondo: { id: fondo.id } });
    } catch (error) {
        return responder(reply, error, 'Error al agregar fondos');
    }
}

/** POST /api/finanzas/fondos/:id/anular */
export async function anularFondo(request: FastifyRequest<{ Params: { id: string }; Body: { motivo?: string } }>, reply: FastifyReply) {
    try {
        return await anular(request, reply, 'fondoDelLiceo', 'FONDO');
    } catch (error) {
        return responder(reply, error, 'Error al anular');
    }
}

// ─── Gastos y sus facturas ──────────────────────────────────────────────────

const CATEGORIAS_POR_DEFECTO = ['Mantenimiento', 'Reparación', 'Compras', 'Servicios', 'Otro'];

async function categoriasDelLiceo(prisma: any): Promise<string[]> {
    const fila = await prisma.paymentSettings.findUnique({ where: { id: 'liceo' }, select: { categoriasDeGasto: true } });
    const lista = Array.isArray(fila?.categoriasDeGasto) ? (fila.categoriasDeGasto as unknown[]).map(String) : [];
    return lista.length ? lista : CATEGORIAS_POR_DEFECTO;
}

/** GET /api/finanzas/gastos?academicYearId= */
export async function getGastos(request: FastifyRequest<{ Querystring: { academicYearId?: string } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const prisma = prismaDe(request);
        const ciclo = await elCiclo(request);
        const [filas, categorias] = await Promise.all([
            prisma.gasto.findMany({ where: { fecha: { gte: ciclo.startDate, lte: ciclo.endDate } }, orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }] }),
            categoriasDelLiceo(prisma),
        ]);
        return reply.send({
            categorias,
            gastos: filas.map((g: any) => ({ ...g, fecha: ymd(g.fecha), monto: g.monto.toString(), tasa: g.tasa?.toString() ?? null, montoBase: g.montoBase.toString() })),
        });
    } catch (error) {
        return responder(reply, error, 'Error al leer los gastos');
    }
}

/** POST /api/finanzas/gastos */
export async function crearGasto(request: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const prisma = prismaDe(request);
        const b: any = request.body ?? {};
        const concepto = limpio(b.concepto, 120);
        if (!concepto || concepto.length < 2) return reply.status(400).send({ error: 'Di qué se compró o se pagó', code: 'CONCEPTO_REQUERIDO' });
        const categorias = await categoriasDelLiceo(prisma);
        if (!categorias.includes(b.categoria)) return reply.status(400).send({ error: 'Elige una categoría de la lista', code: 'CATEGORIA_INVALIDA' });
        const fecha = validarFecha(b.fecha);
        if (fecha > (await hoyDelLiceo(prisma))) return reply.status(400).send({ error: 'La fecha no puede ser futura', code: 'FECHA_FUTURA' });
        const d = await dineroDe(prisma, b);
        if (b.comprobanteId) {
            const existe = await prisma.comprobante.count({ where: { id: String(b.comprobanteId) } });
            if (!existe) return reply.status(400).send({ error: 'La factura no se encontró: súbela otra vez', code: 'COMPROBANTE_INVALIDO' });
        }
        const gasto = await prisma.gasto.create({
            data: {
                fecha: fechaDB(fecha),
                concepto,
                categoria: b.categoria,
                proveedor: limpio(b.proveedor, 120),
                notas: limpio(b.notas, 300),
                moneda: d.moneda,
                monto: deCentimos(d.montoCents),
                tasa: d.tasa,
                montoBase: deCentimos(d.baseCents),
                comprobanteId: b.comprobanteId ? String(b.comprobanteId) : null,
                creadoPorId: idDe(request),
            },
        });
        await bitacora(request, ActionType.CREATE, 'GASTO', gasto.id, { concepto, montoBase: deCentimos(d.baseCents) });
        return reply.status(201).send({ gasto: { id: gasto.id } });
    } catch (error) {
        return responder(reply, error, 'Error al anotar el gasto');
    }
}

/** POST /api/finanzas/gastos/:id/anular */
export async function anularGasto(request: FastifyRequest<{ Params: { id: string }; Body: { motivo?: string } }>, reply: FastifyReply) {
    try {
        return await anular(request, reply, 'gasto', 'GASTO');
    } catch (error) {
        return responder(reply, error, 'Error al anular');
    }
}

/** PUT /api/finanzas/categorias { categorias: string[] } */
export async function guardarCategorias(request: FastifyRequest<{ Body: { categorias?: unknown[] } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const lista = [...new Set((request.body?.categorias ?? []).map((c) => limpio(c, 40)).filter((c): c is string => !!c && c.length >= 2))];
        if (lista.length < 1 || lista.length > 20) return reply.status(400).send({ error: 'Entre 1 y 20 categorías', code: 'CATEGORIAS_INVALIDAS' });
        await prismaDe(request).paymentSettings.upsert({ where: { id: 'liceo' }, create: { id: 'liceo', categoriasDeGasto: lista }, update: { categoriasDeGasto: lista } });
        return reply.send({ categorias: lista });
    } catch (error) {
        return responder(reply, error, 'Error al guardar las categorías');
    }
}

/** POST /api/finanzas/comprobantes — la foto de una factura (multipart, una imagen). */
export async function subirComprobante(request: FastifyRequest, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const archivo = await (request as any).file({ limits: { fileSize: PESO_MAXIMO_DE_SUBIDA, files: 1 } });
        if (!archivo) return reply.status(400).send({ error: 'No llegó ninguna imagen', code: 'COMPROBANTE_INVALIDO' });
        const original: Buffer = await archivo.toBuffer();
        if (archivo.file?.truncated) return reply.status(413).send({ error: 'La imagen pesa más de 5 MB', code: 'COMPROBANTE_GRANDE' });
        const { data, size } = await comprimirComprobante(original);
        const fila = await prismaDe(request).comprobante.create({ data: { data: new Uint8Array(data), tamano: size, subidoPorId: idDe(request) }, select: { id: true } });
        return reply.status(201).send({ comprobante: fila });
    } catch (error) {
        return responder(reply, error, 'Error al subir la imagen');
    }
}

/** GET /api/finanzas/comprobantes/:id — la imagen (solo el admin). */
export async function getComprobante(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const fila = await prismaDe(request).comprobante.findUnique({ where: { id: request.params.id } });
        if (!fila) return reply.status(404).send({ error: 'No encontrado' });
        return reply
            .header('Content-Type', 'image/webp')
            .header('X-Content-Type-Options', 'nosniff')
            .header('Content-Disposition', 'inline')
            .header('Cache-Control', 'private, max-age=86400')
            .send(Buffer.from(fila.data));
    } catch (error) {
        return responder(reply, error, 'Error al leer la imagen');
    }
}
