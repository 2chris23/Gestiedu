import { idDe, responderError, moduloActivo, cicloActivo, configuracionDelCiclo, estaCerrado, CICLO_CERRADO, pagadoEnElCiclo, resumenDe, hoyDelLiceo, puedeVerPagosDe } from '../pagos.controller';
import { getStudentPayments } from './ficha-de-pagos.controller';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ActionType } from '../../utils/prisma-enums';
import {
    aMonedaBase,
    Configuracion,
    cuotasDelCiclo,
    deCentimos,
    Moneda,
    repartir,
} from '../../services/pagos.service';
import { avisarSiFalla } from '../../utils/sin-callar';

/** La configuración como fila de `ajustes_de_pagos_del_ciclo`. */
function filaDeAjustes(c: Configuracion) {
    return {
        frequency: c.frequency,
        dueMode: c.dueMode,
        dueDay: c.dueDay,
        graceDays: c.graceDays,
        baseCurrency: c.baseCurrency,
        acceptedCurrencies: c.acceptedCurrencies,
        feeAmount: deCentimos(c.feeCents),
        enrollmentEnabled: c.enrollmentEnabled,
        enrollmentAmount: deCentimos(c.enrollmentCents),
        methods: c.methods,
        descuentoHermanosPct: c.descuentoHermanosPct,
        moraTipo: c.moraTipo,
        moraValor: deCentimos(c.moraValorCents),
        moraDiasDespues: c.moraDiasDespues,
        recordatorioDiasAntes: c.recordatorioDiasAntes,
    };
}

/**
 * Desde el primer pago, el ciclo se queda con su configuración aunque cambie la
 * del liceo. `skipDuplicates`: dos cobros a la vez no chocan por congelarla.
 */
async function congelarConfiguracion(tx: any, cicloId: string, config: Configuracion, quien: string | undefined) {
    await tx.ajustesDePagosDelCiclo.createMany({
        data: [{ academicYearId: cicloId, ...filaDeAjustes(config), updatedById: quien ?? null }],
        skipDuplicates: true,
    });
}

/** PUT /api/payments/students/:studentId/plan — día de pago propio y exoneración. */
export async function updateStudentPlan(
    request: FastifyRequest<{
        Params: { studentId: string };
        Querystring: { academicYearId?: string };
        Body: { dueDay?: number | null; exempt?: boolean; exemptReason?: string | null; descuentoPct?: number; descuentoMotivo?: string | null };
    }>,
    reply: FastifyReply
) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return reply;
        const prisma = request.tenantPrisma as any;
        const { studentId } = request.params;
        const { dueDay = null, exempt = false, exemptReason = null, descuentoPct = 0, descuentoMotivo = null } = request.body ?? {};
        // Beca o descuento propio (2026-10-01): un porcentaje entero, con su motivo.
        if (!Number.isInteger(descuentoPct) || descuentoPct < 0 || descuentoPct > 100) {
            return reply.status(400).send({ error: 'El descuento es un porcentaje entre 0 y 100', code: 'DESCUENTO_INVALIDO' });
        }
        const porQue = descuentoMotivo ? String(descuentoMotivo).replace(/[<>]/g, '').trim().slice(0, 200) : null;
        if (descuentoPct > 0 && (!porQue || porQue.length < 3)) {
            return reply.status(400).send({ error: 'Indica el motivo del descuento (beca, hijo de docente…)', code: 'DESCUENTO_SIN_MOTIVO' });
        }

        if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28)) {
            return reply.status(400).send({ error: 'El día de pago debe estar entre 1 y 28' });
        }
        const motivo = exemptReason ? String(exemptReason).replace(/[<>]/g, '').trim().slice(0, 200) : null;
        if (exempt && (!motivo || motivo.length < 3)) {
            return reply.status(400).send({ error: 'Indica el motivo de la exoneración', code: 'EXEMPT_REASON_REQUIRED' });
        }

        const ciclo = await cicloActivo(prisma, request.query?.academicYearId);
        if (!ciclo) return reply.status(404).send({ error: 'No hay un ciclo escolar activo', code: 'NO_ACTIVE_YEAR' });
        if (estaCerrado(ciclo)) return reply.status(409).send(CICLO_CERRADO);
        const inscrito = await prisma.studentClassroom.count({ where: { studentId, academicYearId: ciclo.id, isActive: true } });
        if (!inscrito) return reply.status(404).send({ error: 'El estudiante no está inscrito en ese ciclo' });

        await prisma.studentPaymentPlan.upsert({
            where: { studentId_academicYearId: { studentId, academicYearId: ciclo.id } },
            create: { studentId, academicYearId: ciclo.id, dueDay, exempt, exemptReason: exempt ? motivo : null, descuentoPct, descuentoMotivo: descuentoPct > 0 ? porQue : null },
            update: { dueDay, exempt, exemptReason: exempt ? motivo : null, descuentoPct, descuentoMotivo: descuentoPct > 0 ? porQue : null },
        });
        request.aQuienAfecta = { studentIds: [studentId] };
        return getStudentPayments(request as any, reply);
    } catch (error) {
        return responderError(reply, error, 'Error al guardar el plan de pago');
    }
}

// ─── Registrar y anular ──────────────────────────────────────────────────────

interface PagoNuevo {
    installmentKeys: string[];
    amount: number | string;
    currency: Moneda;
    exchangeRate?: number | string | null;
    method: string;
    reference?: string | null;
    notes?: string | null;
    paidAt: string;
    /** El ciclo al que va (por defecto, el que está en curso). */
    academicYearId?: string;
}

/** POST /api/payments/students/:studentId/payments */
export async function registerPayment(
    request: FastifyRequest<{ Params: { studentId: string }; Body: PagoNuevo }>,
    reply: FastifyReply
) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return reply;
        const prisma = request.tenantPrisma as any;
        const { studentId } = request.params;
        const b = request.body;
        const ciclo = await cicloActivo(prisma, b?.academicYearId);
        if (!ciclo) return reply.status(404).send({ error: 'No hay un ciclo escolar activo', code: 'NO_ACTIVE_YEAR' });
        if (estaCerrado(ciclo)) return reply.status(409).send(CICLO_CERRADO);
        const config = await configuracionDelCiclo(prisma, ciclo.id, delLiceo);

        const hoy = await hoyDelLiceo(prisma);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.paidAt)) || b.paidAt > hoy) {
            return reply.status(400).send({ error: 'La fecha del pago no puede ser futura', code: 'INVALID_DATE' });
        }
        const aceptadas: Moneda[] = config.acceptedCurrencies === 'BOTH' ? ['USD', 'VES'] : [config.acceptedCurrencies];
        if (!aceptadas.includes(b.currency)) return reply.status(400).send({ error: 'El liceo no acepta pagos en esa moneda' });
        if (!config.methods.includes(b.method)) return reply.status(400).send({ error: 'Método de pago no configurado' });

        const montoCents = Math.round(Number(b.amount) * 100);
        if (!Number.isFinite(montoCents) || montoCents <= 0 || montoCents > 1_000_000_000) {
            return reply.status(400).send({ error: 'Monto inválido' });
        }
        const tasa = b.exchangeRate == null || b.exchangeRate === '' ? null : Number(b.exchangeRate);
        if (tasa !== null && (!Number.isFinite(tasa) || tasa <= 0 || tasa > 100_000_000)) {
            return reply.status(400).send({ error: 'Tasa de cambio inválida' });
        }
        const baseCents = aMonedaBase(montoCents, b.currency, config.baseCurrency, tasa);
        if (baseCents <= 0) return reply.status(400).send({ error: 'Monto inválido' });

        const claves = [...new Set((b.installmentKeys ?? []).map(String))];
        if (claves.length === 0) return reply.status(400).send({ error: 'Elige al menos una cuota' });

        const limpio = (t: unknown, max: number) => (t ? String(t).replace(/[<>]/g, '').trim().slice(0, max) || null : null);

        const pago = await prisma.$transaction(async (tx: any) => {
            // Dos personas cobrando al mismo alumno a la vez podrían pagar dos
            // veces la misma cuota. Este candado hace que la segunda espere a
            // la primera y vea lo ya pagado.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pagos:${studentId}`}))`;
            // Desde el primer pago, el ciclo se queda con esta configuración.
            await congelarConfiguracion(tx, ciclo.id, config, idDe(request));

            // SEGURIDAD: Prevenir pagos duplicados idénticos enviados simultáneamente (payments-missing-idempotency-race-condition)
            const refLimpia = limpio(b.reference, 60);
            const duplicadoReciente = await tx.payment.findFirst({
                where: {
                    studentId,
                    academicYearId: ciclo.id,
                    amount: deCentimos(montoCents),
                    method: b.method,
                    reference: refLimpia,
                    annulledAt: null,
                    createdAt: { gte: new Date(Date.now() - 30 * 1000) },
                },
                select: { id: true },
            });
            if (duplicadoReciente) {
                throw Object.assign(
                    new Error('Se detectó un pago idéntico registrado recientemente para este estudiante'),
                    { statusCode: 409, code: 'DUPLICATE_PAYMENT_DETECTED' }
                );
            }

            const inscrito = await tx.studentClassroom.count({ where: { studentId, academicYearId: ciclo.id, isActive: true } });
            if (!inscrito) throw Object.assign(new Error('El estudiante no está inscrito en el ciclo actual'), { statusCode: 404, code: 'NOT_ENROLLED' });

            const plan = await tx.studentPaymentPlan.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: ciclo.id } } });
            if (plan?.exempt) throw Object.assign(new Error('El estudiante está exonerado'), { statusCode: 409, code: 'STUDENT_EXEMPT' });

            const pagado = await pagadoEnElCiclo(tx, ciclo.id, [studentId]);
            const r = resumenDe(config, ciclo, plan ?? undefined, pagado, studentId, hoy);
            const porClave = new Map(r.cuotas.map((c) => [c.key, c]));
            const elegidas = claves.map((k) => porClave.get(k));
            if (elegidas.some((c) => !c)) throw Object.assign(new Error('Alguna cuota elegida no existe'), { statusCode: 400, code: 'UNKNOWN_INSTALLMENT' });
            if (elegidas.some((c) => c!.pendingCents === 0)) {
                throw Object.assign(new Error('Alguna cuota elegida ya está pagada'), { statusCode: 409, code: 'ALREADY_PAID' });
            }
            const debe = elegidas.reduce((s, c) => s + c!.pendingCents, 0);
            if (baseCents > debe) {
                throw Object.assign(
                    new Error(`El monto supera lo que falta de esas cuotas (${deCentimos(debe)} ${config.baseCurrency})`),
                    { statusCode: 400, code: 'AMOUNT_EXCEEDS_DEBT' }
                );
            }

            const reparto = repartir(baseCents, elegidas as any);
            return tx.payment.create({
                data: {
                    studentId,
                    academicYearId: ciclo.id,
                    paidAt: new Date(`${b.paidAt}T00:00:00Z`),
                    method: b.method,
                    reference: limpio(b.reference, 60),
                    notes: limpio(b.notes, 200),
                    currency: b.currency,
                    amount: deCentimos(montoCents),
                    exchangeRate: b.currency === config.baseCurrency ? null : tasa,
                    amountBase: deCentimos(baseCents),
                    createdById: idDe(request),
                    allocations: { create: reparto.map((x) => ({ installmentKey: x.key, amountBase: deCentimos(x.amountCents) })) },
                },
                select: { id: true, receiptNumber: true },
            });
        });

        request.aQuienAfecta = { studentIds: [studentId] };
        await prisma.auditLog
            .create({
                data: {
                    instituteId: request.institute?.id,
                    action: ActionType.CREATE,
                    entity: 'PAYMENT',
                    entityType: 'PAYMENT',
                    entityId: pago.id,
                    newValues: { studentId, amount: deCentimos(montoCents), currency: b.currency, keys: claves } as any,
                    userId: idDe(request),
                },
            })
            .catch(avisarSiFalla('pagos.controller'));

        return reply.status(201).send({ payment: pago });
    } catch (error) {
        return responderError(reply, error, 'Error al registrar el pago');
    }
}

/** POST /api/payments/:paymentId/annul  { reason } */
export async function annulPayment(
    request: FastifyRequest<{ Params: { paymentId: string }; Body: { reason?: string } }>,
    reply: FastifyReply
) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return reply;
        const prisma = request.tenantPrisma as any;
        const motivo = String(request.body?.reason ?? '').replace(/[<>]/g, '').trim().slice(0, 200);
        if (motivo.length < 3) return reply.status(400).send({ error: 'Indica el motivo de la anulación', code: 'ANNUL_REASON_REQUIRED' });

        // Verificar que el pago existe antes de adquirir bloqueo
        const paymentInfo = await prisma.payment.findUnique({
            where: { id: request.params.paymentId },
            select: { id: true, studentId: true, annulledAt: true, academicYear: { select: { status: true } } },
        });
        if (!paymentInfo || paymentInfo.annulledAt) {
            return reply.status(404).send({ error: 'Pago no encontrado o ya anulado' });
        }
        if (estaCerrado(paymentInfo.academicYear)) return reply.status(409).send(CICLO_CERRADO);

        // SEGURIDAD: Serializar la anulación con el candado del estudiante para evitar condiciones de carrera con nuevos cobros
        const hecho = await prisma.$transaction(async (tx: any) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pagos:${paymentInfo.studentId}`}))`;

            return tx.payment.updateMany({
                where: { id: request.params.paymentId, annulledAt: null },
                data: { annulledAt: new Date(), annulledById: idDe(request), annulReason: motivo },
            });
        });
        if (hecho.count === 0) return reply.status(404).send({ error: 'Pago no encontrado o ya anulado' });

        request.aQuienAfecta = { studentIds: [paymentInfo.studentId] };
        await prisma.auditLog
            .create({
                data: {
                    instituteId: request.institute?.id,
                    action: ActionType.UPDATE,
                    entity: 'PAYMENT',
                    entityType: 'PAYMENT',
                    entityId: request.params.paymentId,
                    level: 'SECURITY',
                    newValues: { annulled: true, reason: motivo } as any,
                    userId: idDe(request),
                },
            })
            .catch(avisarSiFalla('pagos.controller'));
        return reply.send({ message: 'Pago anulado' });
    } catch (error) {
        return responderError(reply, error, 'Error al anular el pago');
    }
}

/** GET /api/payments/:paymentId/receipt — admin o representante del alumno. */
export async function getPaymentReceipt(request: FastifyRequest<{ Params: { paymentId: string } }>, reply: FastifyReply) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return reply;
        const prisma = request.tenantPrisma as any;
        const pago = await prisma.payment.findUnique({
            where: { id: request.params.paymentId },
            include: {
                student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
                academicYear: { include: { periods: true } },
                allocations: true,
            },
        });
        if (!pago || !(await puedeVerPagosDe(request, pago.studentId))) return reply.status(404).send({ error: 'Pago no encontrado' });

        const plan = await prisma.studentPaymentPlan.findUnique({
            where: { studentId_academicYearId: { studentId: pago.studentId, academicYearId: pago.academicYearId } },
        });
        const config = await configuracionDelCiclo(prisma, pago.academicYearId, delLiceo);
        const cuotas = cuotasDelCiclo({
            config,
            inicio: pago.academicYear.startDate,
            cierre: pago.academicYear.endDate,
            lapsos: pago.academicYear.periods,
            diaDelAlumno: config.dueMode === 'PER_STUDENT' ? plan?.dueDay ?? null : null,
        });
        const nombre = new Map(cuotas.map((c) => [c.key, c.label]));

        return reply.send({
            institute: { name: request.institute?.name ?? '' },
            receiptNumber: pago.receiptNumber,
            student: pago.student,
            academicYear: pago.academicYear.name,
            paidAt: pago.paidAt.toISOString().slice(0, 10),
            method: pago.method,
            reference: pago.reference,
            currency: pago.currency,
            amount: pago.amount.toString(),
            exchangeRate: pago.exchangeRate?.toString() ?? null,
            baseCurrency: config.baseCurrency,
            amountBase: pago.amountBase.toString(),
            annulled: Boolean(pago.annulledAt),
            annulReason: pago.annulReason,
            allocations: pago.allocations.map((a: any) => ({ label: nombre.get(a.installmentKey) ?? a.installmentKey, amount: a.amountBase.toString() })),
        });
    } catch (error) {
        return responderError(reply, error, 'Error al obtener el comprobante');
    }
}
