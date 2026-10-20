import { idDe, rolDe, responderError, moduloActivo, cicloActivo, configuracionDelCiclo, hoyDelLiceo, puedeVerPagosDe } from '../pagos.controller';
import { registerPayment } from './cobros.controller';
import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '../../utils/prisma-enums';
import { avisar } from '../../services/avisos.service';
import { comprimirComprobante, FotoNoValida, PESO_MAXIMO_DE_SUBIDA } from '../../services/foto-de-perfil.service';
import {
    deCentimos,
    Moneda,
} from '../../services/pagos.service';
import { avisarSiFalla } from '../../utils/sin-callar';

// ─── El representante reporta su pago (2026-10-01) ──────────────────────────
//
// Idea que eligió Cristian: el representante dice «pagué» con la captura del
// pago móvil, y el admin solo lo confirma. Hasta confirmarse NO cuenta para
// nada; confirmado, es un pago de verdad (con su comprobante). El alumno no
// reporta (no sube nada: la regla de siempre).

const comprobanteDeDinero = (b: any) => ({
    installmentKeys: [...new Set((Array.isArray(b?.installmentKeys) ? b.installmentKeys : []).map(String))].slice(0, 60) as string[],
    amount: b?.amount,
    currency: b?.currency,
    exchangeRate: b?.exchangeRate ?? null,
    method: b?.method,
    reference: b?.reference ?? null,
    paidAt: b?.paidAt,
});

async function admins(prisma: any): Promise<string[]> {
    return (await prisma.user.findMany({ where: { role: UserRole.ADMIN, isActive: true }, select: { id: true } })).map((u: any) => u.id);
}

/** POST /api/payments/comprobantes — la captura (multipart). Admin o representante. */
export async function subirCaptura(request: FastifyRequest, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const rol = rolDe(request);
        if (rol !== UserRole.ADMIN && rol !== UserRole.TUTOR) return reply.status(403).send({ error: 'No autorizado', code: 'FORBIDDEN' });
        const archivo = await (request as any).file({ limits: { fileSize: PESO_MAXIMO_DE_SUBIDA, files: 1 } });
        if (!archivo) return reply.status(400).send({ error: 'No llegó ninguna imagen', code: 'COMPROBANTE_INVALIDO' });
        const original: Buffer = await archivo.toBuffer();
        if (archivo.file?.truncated) return reply.status(413).send({ error: 'La imagen pesa más de 5 MB', code: 'COMPROBANTE_GRANDE' });
        const { data, size } = await comprimirComprobante(original);
        const fila = await (request.tenantPrisma as any).comprobante.create({ data: { data: new Uint8Array(data), tamano: size, subidoPorId: idDe(request) }, select: { id: true } });
        return reply.status(201).send({ comprobante: fila });
    } catch (error) {
        if (error instanceof FotoNoValida) return reply.status(400).send({ error: error.message, code: 'COMPROBANTE_INVALIDO' });
        return responderError(reply, error, 'Error al subir la imagen');
    }
}

/** GET /api/payments/reportes/:id/captura — el admin, o el representante que la subió. */
export async function getCaptura(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const prisma = request.tenantPrisma as any;
        const r = await prisma.pagoReportado.findUnique({ where: { id: request.params.id }, select: { comprobanteId: true, reportadoPorId: true } });
        if (!r?.comprobanteId || (rolDe(request) !== UserRole.ADMIN && r.reportadoPorId !== idDe(request))) return reply.status(404).send({ error: 'No encontrado' });
        const fila = await prisma.comprobante.findUnique({ where: { id: r.comprobanteId } });
        if (!fila) return reply.status(404).send({ error: 'No encontrado' });
        return reply.header('Content-Type', 'image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=86400').send(Buffer.from(fila.data));
    } catch (error) {
        return responderError(reply, error, 'Error al leer la imagen');
    }
}

/** POST /api/payments/students/:studentId/reportes — el representante: «pagué». */
export async function reportarPago(request: FastifyRequest<{ Params: { studentId: string }; Body: any }>, reply: FastifyReply) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return reply;
        if (rolDe(request) !== UserRole.TUTOR) return reply.status(403).send({ error: 'Solo el representante reporta sus pagos', code: 'FORBIDDEN' });
        const prisma = request.tenantPrisma as any;
        const { studentId } = request.params;
        // Misma respuesta para «no existe» y «no es tuyo».
        if (!(await puedeVerPagosDe(request, studentId))) return reply.status(404).send({ error: 'Estudiante no encontrado' });
        const ciclo = await cicloActivo(prisma);
        if (!ciclo) return reply.status(404).send({ error: 'No hay un ciclo escolar activo', code: 'NO_ACTIVE_YEAR' });
        const config = await configuracionDelCiclo(prisma, ciclo.id, delLiceo);
        const b = comprobanteDeDinero(request.body);
        const hoy = await hoyDelLiceo(prisma);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.paidAt)) || b.paidAt > hoy) return reply.status(400).send({ error: 'La fecha del pago no puede ser futura', code: 'INVALID_DATE' });
        const aceptadas: Moneda[] = config.acceptedCurrencies === 'BOTH' ? ['USD', 'VES'] : [config.acceptedCurrencies];
        if (!aceptadas.includes(b.currency)) return reply.status(400).send({ error: 'El liceo no acepta pagos en esa moneda' });
        if (!config.methods.includes(b.method)) return reply.status(400).send({ error: 'Método de pago no configurado' });
        const montoCents = Math.round(Number(b.amount) * 100);
        if (!Number.isFinite(montoCents) || montoCents <= 0 || montoCents > 1_000_000_000) return reply.status(400).send({ error: 'Monto inválido' });
        const tasa = b.exchangeRate == null || b.exchangeRate === '' ? null : Number(b.exchangeRate);
        if (b.currency !== config.baseCurrency && !(tasa && tasa > 0)) return reply.status(400).send({ error: 'Falta la tasa de cambio (bolívares por dólar)' });
        if (!b.installmentKeys.length) return reply.status(400).send({ error: 'Elige qué cuotas pagaste' });
        const cuerpo: any = request.body ?? {};
        const comprobanteId = cuerpo.comprobanteId ? String(cuerpo.comprobanteId) : null;
        if (comprobanteId) {
            const suya = await prisma.comprobante.count({ where: { id: comprobanteId, subidoPorId: idDe(request) } });
            if (!suya) return reply.status(400).send({ error: 'La captura no se encontró: súbela otra vez', code: 'COMPROBANTE_INVALIDO' });
        }
        const limpio = (t: unknown, max: number) => (t ? String(t).replace(/[<>]/g, '').trim().slice(0, max) || null : null);
        const fila = await prisma.pagoReportado.create({
            data: {
                studentId,
                academicYearId: ciclo.id,
                reportadoPorId: idDe(request),
                installmentKeys: b.installmentKeys,
                moneda: b.currency,
                monto: deCentimos(montoCents),
                tasa: b.currency === config.baseCurrency ? null : tasa,
                metodo: b.method,
                referencia: limpio(b.reference, 60),
                fechaDePago: new Date(`${b.paidAt}T00:00:00Z`),
                comprobanteId,
            },
            select: { id: true },
        });
        const alumno = await prisma.user.findUnique({ where: { id: studentId }, select: { firstName: true, lastName: true } });
        await avisar(prisma, request.institute?.id ?? '', (request.server as any).io, {
            a: await admins(prisma),
            titulo: 'Un representante reportó un pago',
            mensaje: `${alumno?.firstName ?? ''} ${alumno?.lastName ?? ''}: ${deCentimos(montoCents)} ${b.currency} por ${b.method}. Confírmalo en Finanzas.`,
            enlace: '/dashboard/pagos?vista=estudiantes',
            tipo: 'PAGO_REPORTADO',
        }).catch(avisarSiFalla('pagos.controller'));
        return reply.status(201).send({ reporte: fila });
    } catch (error) {
        return responderError(reply, error, 'Error al reportar el pago');
    }
}

/** GET /api/payments/reportes?estado=PENDIENTE — los reportados, para el admin. */
export async function getReportes(request: FastifyRequest<{ Querystring: { estado?: string } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const prisma = request.tenantPrisma as any;
        const estado = ['PENDIENTE', 'CONFIRMADO', 'RECHAZADO'].includes(String(request.query?.estado)) ? String(request.query.estado) : 'PENDIENTE';
        const filas = await prisma.pagoReportado.findMany({ where: { estado }, orderBy: { createdAt: 'asc' }, take: 200 });
        const ids = [...new Set(filas.flatMap((f: any) => [f.studentId, f.reportadoPorId]))];
        const personas = new Map<string, any>((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } })).map((u: any) => [u.id, u]));
        const nombre = (id: string) => (personas.get(id) ? `${personas.get(id).firstName} ${personas.get(id).lastName}` : id);
        return reply.send({
            reportes: filas.map((f: any) => ({
                id: f.id,
                estado: f.estado,
                alumno: { id: f.studentId, nombre: nombre(f.studentId) },
                representante: nombre(f.reportadoPorId),
                monto: Number(f.monto).toFixed(2),
                moneda: f.moneda,
                tasa: f.tasa?.toString() ?? null,
                metodo: f.metodo,
                referencia: f.referencia,
                fechaDePago: f.fechaDePago.toISOString().slice(0, 10),
                installmentKeys: f.installmentKeys,
                conCaptura: Boolean(f.comprobanteId),
                motivoRechazo: f.motivoRechazo,
                createdAt: f.createdAt,
            })),
        });
    } catch (error) {
        return responderError(reply, error, 'Error al leer los pagos reportados');
    }
}

/**
 * Cobra con la MISMA lógica que «Registrar pago» (validaciones, candado por
 * alumno, reparto): se le pasa a `registerPayment` lo reportado como si lo
 * hubiera tecleado el admin que confirma.
 */
async function cobrarComoAdmin(request: FastifyRequest, studentId: string, cuerpo: any): Promise<{ status: number; body: any }> {
    const falsa: any = Object.create(request);
    falsa.params = { studentId };
    falsa.body = cuerpo;
    const respuesta: any = {
        codigo: 200,
        cuerpo: undefined,
        status(c: number) {
            this.codigo = c;
            return this;
        },
        send(x: any) {
            this.cuerpo = x;
            return this;
        },
        header() {
            return this;
        },
    };
    await registerPayment(falsa, respuesta);
    return { status: respuesta.codigo, body: respuesta.cuerpo };
}

/** POST /api/payments/reportes/:id/confirmar — el admin: es un pago de verdad. */
export async function confirmarReporte(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const prisma = request.tenantPrisma as any;
        const r = await prisma.pagoReportado.findUnique({ where: { id: request.params.id } });
        if (!r || r.estado !== 'PENDIENTE') return reply.status(404).send({ error: 'No hay un pago reportado pendiente con ese número' });
        // Se marca primero (solo uno gana): dos admins confirmando a la vez no cobran dos veces.
        const tomado = await prisma.pagoReportado.updateMany({ where: { id: r.id, estado: 'PENDIENTE' }, data: { estado: 'CONFIRMANDO' } });
        if (tomado.count === 0) return reply.status(409).send({ error: 'Otro ya lo está revisando', code: 'YA_REVISADO' });
        const cobro = await cobrarComoAdmin(request, r.studentId, {
            installmentKeys: r.installmentKeys,
            amount: r.monto.toString(),
            currency: r.moneda,
            exchangeRate: r.tasa?.toString() ?? null,
            method: r.metodo,
            reference: r.referencia,
            notes: 'Reportado por el representante',
            paidAt: r.fechaDePago.toISOString().slice(0, 10),
            academicYearId: r.academicYearId,
        });
        if (cobro.status !== 201) {
            await prisma.pagoReportado.update({ where: { id: r.id }, data: { estado: 'PENDIENTE' } });
            return reply.status(cobro.status).send(cobro.body);
        }
        await prisma.pagoReportado.update({
            where: { id: r.id },
            data: { estado: 'CONFIRMADO', paymentId: cobro.body.payment.id, revisadoPorId: idDe(request), revisadoEn: new Date() },
        });
        await avisar(prisma, request.institute?.id ?? '', (request.server as any).io, {
            a: [r.reportadoPorId],
            titulo: 'Tu pago fue confirmado',
            mensaje: `El liceo confirmó tu pago de ${Number(r.monto).toFixed(2)} ${r.moneda}. Ya tienes tu comprobante.`,
            enlace: '/dashboard',
            tipo: 'PAGO_CONFIRMADO',
        }).catch(avisarSiFalla('pagos.controller'));
        return reply.send({ payment: cobro.body.payment });
    } catch (error) {
        return responderError(reply, error, 'Error al confirmar el pago');
    }
}

/** POST /api/payments/reportes/:id/rechazar { motivo } — y se le dice por qué. */
export async function rechazarReporte(request: FastifyRequest<{ Params: { id: string }; Body: { motivo?: string } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const prisma = request.tenantPrisma as any;
        const motivo = String(request.body?.motivo ?? '').replace(/[<>]/g, '').trim().slice(0, 200);
        if (motivo.length < 3) return reply.status(400).send({ error: 'Indica por qué se rechaza (lo verá el representante)', code: 'MOTIVO_REQUERIDO' });
        const r = await prisma.pagoReportado.findUnique({ where: { id: request.params.id } });
        if (!r) return reply.status(404).send({ error: 'No encontrado' });
        const hecho = await prisma.pagoReportado.updateMany({
            where: { id: r.id, estado: 'PENDIENTE' },
            data: { estado: 'RECHAZADO', motivoRechazo: motivo, revisadoPorId: idDe(request), revisadoEn: new Date() },
        });
        if (hecho.count === 0) return reply.status(409).send({ error: 'Ya fue revisado', code: 'YA_REVISADO' });
        await avisar(prisma, request.institute?.id ?? '', (request.server as any).io, {
            a: [r.reportadoPorId],
            titulo: 'Tu pago no se pudo confirmar',
            mensaje: `Motivo: ${motivo}`,
            enlace: '/dashboard',
            tipo: 'PAGO_RECHAZADO',
        }).catch(avisarSiFalla('pagos.controller'));
        return reply.send({ message: 'Rechazado' });
    } catch (error) {
        return responderError(reply, error, 'Error al rechazar');
    }
}
