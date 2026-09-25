import { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { UserRole, ActionType } from '../utils/prisma-enums';
import { logger } from '../utils/logger';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import {
    aCentimos,
    aMonedaBase,
    Configuracion,
    configuracionDe,
    cuotasDelCiclo,
    deCentimos,
    estadoDelAlumno,
    Moneda,
    repartir,
    ResumenDelAlumno,
    sumarDias,
    validarConfiguracion,
} from '../services/pagos.service';

/**
 * RUTAS DE PAGOS
 *
 * Quién puede qué:
 *   · Admin: todo.
 *   · Representante: ver el estado y los comprobantes de SUS representados.
 *   · Profesor y estudiante: nada (ni saben si el módulo existe más allá de
 *     `enabled`, que hace falta para pintar el menú).
 *
 * Con el módulo apagado, todas las rutas menos la configuración responden 403:
 * apagarlo es apagarlo, también para quien escriba la dirección a mano.
 */

const idDe = (r: FastifyRequest) => (r.user as any)?.userId ?? (r.user as any)?.id;
const rolDe = (r: FastifyRequest) => (r.user as any)?.role;

function responderError(reply: FastifyReply, error: any, porDefecto: string) {
    if (error?.statusCode) return reply.status(error.statusCode).send({ error: error.message, code: error.code });
    logger.error(porDefecto, { error: error instanceof Error ? error.message : String(error) });
    return reply.status(500).send({ error: porDefecto });
}

async function leerConfiguracion(prisma: any): Promise<Configuracion> {
    return configuracionDe(await prisma.paymentSettings.findUnique({ where: { id: 'liceo' } }));
}

/** Corta si el módulo está apagado. */
async function moduloActivo(request: FastifyRequest, reply: FastifyReply): Promise<Configuracion | null> {
    const config = await leerConfiguracion(request.tenantPrisma);
    if (!config.enabled) {
        reply.status(403).send({ error: 'El control de pagos no está activado', code: 'PAYMENTS_DISABLED' });
        return null;
    }
    return config;
}

async function cicloActivo(prisma: any, academicYearId?: string) {
    const ciclo = academicYearId
        ? await prisma.academicYear.findUnique({ where: { id: academicYearId }, include: { periods: true } })
        : await prisma.academicYear.findFirst({ where: { status: 'ACTIVE' }, include: { periods: true }, orderBy: { startDate: 'desc' } });
    return ciclo;
}

/** Lo pagado (no anulado) por alumno y cuota en un ciclo, en céntimos. Una consulta. */
async function pagadoEnElCiclo(prisma: any, academicYearId: string, studentIds?: string[]) {
    const filas: Array<{ studentId: string; installmentKey: string; total: Prisma.Decimal }> = await prisma.$queryRaw`
        SELECT p."studentId", a."installmentKey", SUM(a."amountBase") AS total
        FROM payment_allocations a
        JOIN payments p ON p.id = a."paymentId"
        WHERE p."academicYearId" = ${academicYearId}
          AND p."annulledAt" IS NULL
          ${studentIds ? Prisma.sql`AND p."studentId" IN (${Prisma.join(studentIds)})` : Prisma.empty}
        GROUP BY p."studentId", a."installmentKey"`;
    const porAlumno = new Map<string, Map<string, number>>();
    for (const f of filas) {
        if (!porAlumno.has(f.studentId)) porAlumno.set(f.studentId, new Map());
        porAlumno.get(f.studentId)!.set(f.installmentKey, aCentimos(f.total));
    }
    return porAlumno;
}

function resumenDe(
    config: Configuracion,
    ciclo: any,
    plan: { dueDay: number | null; exempt: boolean } | undefined,
    pagado: Map<string, number> | undefined,
    hoy: string
): ResumenDelAlumno {
    const cuotas = cuotasDelCiclo({
        config,
        inicio: ciclo.startDate,
        cierre: ciclo.endDate,
        lapsos: ciclo.periods,
        diaDelAlumno: config.dueMode === 'PER_STUDENT' ? plan?.dueDay ?? null : null,
    });
    return estadoDelAlumno({ cuotas, pagadoPorCuota: pagado ?? new Map(), hoy, graceDays: config.graceDays, exento: Boolean(plan?.exempt) });
}

const dineroDe = (r: ResumenDelAlumno) => ({
    state: r.state,
    overdueCount: r.overdueCount,
    owed: deCentimos(r.owedCents),
    paid: deCentimos(r.paidCents),
    total: deCentimos(r.totalCents),
});

async function hoyDelLiceo(prisma: any) {
    return todayInTimezone(await instituteTimezone(prisma));
}

// ─── Configuración ───────────────────────────────────────────────────────────

/** GET /api/payments/settings — cualquiera con sesión ve si está activo; el admin, todo. */
export async function getPaymentSettings(request: FastifyRequest, reply: FastifyReply) {
    try {
        const config = await leerConfiguracion(request.tenantPrisma);
        if (rolDe(request) !== UserRole.ADMIN) return reply.send({ enabled: config.enabled });
        return reply.send({
            ...config,
            feeAmount: deCentimos(config.feeCents),
            enrollmentAmount: deCentimos(config.enrollmentCents),
            feeCents: undefined,
            enrollmentCents: undefined,
        });
    } catch (error) {
        return responderError(reply, error, 'Error al leer la configuración de pagos');
    }
}

/** PUT /api/payments/settings — solo admin. */
export async function updatePaymentSettings(request: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
    try {
        const datos = validarConfiguracion(request.body);
        const prisma = request.tenantPrisma as any;
        const antes = await leerConfiguracion(prisma);

        // Cambiar la frecuencia con pagos ya registrados en el ciclo dejaría esos
        // pagos repartidos en cuotas que ya no existen: nadie sabría qué se pagó.
        if (datos.frequency !== antes.frequency) {
            const ciclo = await cicloActivo(prisma);
            const hayPagos = ciclo
                ? await prisma.payment.count({ where: { academicYearId: ciclo.id, annulledAt: null } })
                : 0;
            if (hayPagos > 0) {
                return reply.status(409).send({
                    error: 'No se puede cambiar la frecuencia con pagos registrados en el ciclo actual',
                    code: 'FREQUENCY_LOCKED',
                });
            }
        }

        await prisma.paymentSettings.upsert({
            where: { id: 'liceo' },
            create: { id: 'liceo', ...datos, updatedById: idDe(request) },
            update: { ...datos, updatedById: idDe(request) },
        });

        await prisma.auditLog
            .create({
                data: {
                    instituteId: request.institute?.id,
                    action: ActionType.UPDATE,
                    entity: 'PAYMENT_SETTINGS',
                    entityType: 'PAYMENT_SETTINGS',
                    entityId: 'liceo',
                    oldValues: { ...antes } as any,
                    newValues: datos as any,
                    userId: idDe(request),
                },
            })
            .catch(() => undefined);

        return getPaymentSettings(request, reply);
    } catch (error) {
        return responderError(reply, error, 'Error al guardar la configuración de pagos');
    }
}

// ─── Resumen del ciclo (admin) ───────────────────────────────────────────────

/** GET /api/payments/overview?academicYearId= */
export async function getPaymentsOverview(
    request: FastifyRequest<{ Querystring: { academicYearId?: string } }>,
    reply: FastifyReply
) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return;
        const prisma = request.tenantPrisma as any;
        const ciclo = await cicloActivo(prisma, request.query?.academicYearId);
        if (!ciclo) return reply.status(404).send({ error: 'No hay un ciclo escolar activo', code: 'NO_ACTIVE_YEAR' });

        const [inscritos, planes, pagado, hoy] = await Promise.all([
            prisma.studentClassroom.findMany({
                where: { academicYearId: ciclo.id, isActive: true, student: { status: 'ACTIVE' } },
                select: {
                    student: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                    classroom: { select: { id: true, name: true, grade: true, section: true } },
                },
            }),
            prisma.studentPaymentPlan.findMany({ where: { academicYearId: ciclo.id }, select: { studentId: true, dueDay: true, exempt: true } }),
            pagadoEnElCiclo(prisma, ciclo.id),
            hoyDelLiceo(prisma),
        ]);
        const planDe = new Map<string, any>(planes.map((p: any) => [p.studentId, p]));

        let deudores = 0;
        let deudaTotal = 0;
        let cobrado = 0;
        const secciones = new Map<string, any>();

        // Un alumno con dos inscripciones activas en el mismo ciclo (dato mal
        // cargado) contaría doble como deudor: se cuenta una vez.
        const vistos = new Set<string>();
        for (const i of inscritos) {
            if (vistos.has(i.student.id)) continue;
            vistos.add(i.student.id);
            const r = resumenDe(config, ciclo, planDe.get(i.student.id), pagado.get(i.student.id), hoy);
            if (r.state === 'DEBE') deudores++;
            deudaTotal += r.owedCents;
            cobrado += r.paidCents;

            if (!secciones.has(i.classroom.id)) secciones.set(i.classroom.id, { ...i.classroom, students: [], debtors: 0 });
            const s = secciones.get(i.classroom.id);
            if (r.state === 'DEBE') s.debtors++;
            s.students.push({
                id: i.student.id,
                firstName: i.student.firstName,
                lastName: i.student.lastName,
                avatar: i.student.avatar,
                ...dineroDe(r),
            });
        }

        const listado = [...secciones.values()]
            .map((s) => ({
                ...s,
                students: s.students.sort((a: any, b: any) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'es')),
            }))
            .sort((a, b) => a.grade - b.grade || String(a.section).localeCompare(String(b.section)));

        return reply.send({
            academicYear: { id: ciclo.id, name: ciclo.name, startDate: ciclo.startDate, endDate: ciclo.endDate },
            today: hoy,
            currency: config.baseCurrency,
            summary: {
                students: vistos.size,
                debtors: deudores,
                owed: deCentimos(deudaTotal),
                collected: deCentimos(cobrado),
            },
            classrooms: listado,
        });
    } catch (error) {
        return responderError(reply, error, 'Error al obtener el resumen de pagos');
    }
}

// ─── Un alumno ───────────────────────────────────────────────────────────────

async function puedeVerPagosDe(request: FastifyRequest, studentId: string): Promise<boolean> {
    const rol = rolDe(request);
    if (rol === UserRole.ADMIN) return true;
    if (rol === UserRole.TUTOR) {
        return (await (request.tenantPrisma as any).studentTutor.count({ where: { tutorId: idDe(request), studentId } })) > 0;
    }
    return false;
}

async function fichaDelAlumno(prisma: any, config: Configuracion, ciclo: any, studentId: string, hoy: string, conQuienRegistro: boolean) {
    const [alumno, plan, pagado, pagos] = await Promise.all([
        prisma.user.findFirst({
            where: { id: studentId, role: UserRole.STUDENT },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                studentClassrooms: {
                    where: { academicYearId: ciclo.id, isActive: true },
                    take: 1,
                    select: { classroom: { select: { id: true, name: true } } },
                },
            },
        }),
        prisma.studentPaymentPlan.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: ciclo.id } } }),
        pagadoEnElCiclo(prisma, ciclo.id, [studentId]),
        prisma.payment.findMany({
            where: { studentId, academicYearId: ciclo.id },
            orderBy: [{ paidAt: 'desc' }, { receiptNumber: 'desc' }],
            select: {
                id: true,
                receiptNumber: true,
                paidAt: true,
                method: true,
                reference: true,
                notes: true,
                currency: true,
                amount: true,
                exchangeRate: true,
                amountBase: true,
                annulledAt: true,
                annulReason: true,
                createdById: conQuienRegistro,
                allocations: { select: { installmentKey: true, amountBase: true } },
            },
        }),
    ]);
    if (!alumno) return null;

    const r = resumenDe(config, ciclo, plan ?? undefined, pagado.get(studentId), hoy);
    const nombreDeCuota = new Map(r.cuotas.map((c) => [c.key, c.label]));

    return {
        student: {
            id: alumno.id,
            firstName: alumno.firstName,
            lastName: alumno.lastName,
            avatar: alumno.avatar,
            classroom: alumno.studentClassrooms[0]?.classroom ?? null,
            enrolled: alumno.studentClassrooms.length > 0,
        },
        academicYear: { id: ciclo.id, name: ciclo.name },
        currency: config.baseCurrency,
        plan: { dueDay: plan?.dueDay ?? null, exempt: plan?.exempt ?? false, exemptReason: plan?.exemptReason ?? null },
        summary: dineroDe(r),
        installments: r.cuotas.map((c) => ({
            key: c.key,
            label: c.label,
            kind: c.kind,
            dueDate: c.dueDate,
            overdueFrom: sumarDias(c.dueDate, config.graceDays + 1),
            amount: deCentimos(c.amountCents),
            paid: deCentimos(c.paidCents),
            pending: deCentimos(c.pendingCents),
            state: c.state,
        })),
        payments: pagos.map((p: any) => ({
            ...p,
            amount: p.amount.toString(),
            amountBase: p.amountBase.toString(),
            exchangeRate: p.exchangeRate?.toString() ?? null,
            paidAt: p.paidAt.toISOString().slice(0, 10),
            allocations: p.allocations.map((a: any) => ({
                key: a.installmentKey,
                label: nombreDeCuota.get(a.installmentKey) ?? a.installmentKey,
                amount: a.amountBase.toString(),
            })),
        })),
    };
}

/** GET /api/payments/students/:studentId */
export async function getStudentPayments(request: FastifyRequest<{ Params: { studentId: string } }>, reply: FastifyReply) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return;
        const { studentId } = request.params;
        // Misma respuesta para "no existe" y "no es tuyo".
        if (!(await puedeVerPagosDe(request, studentId))) return reply.status(404).send({ error: 'Estudiante no encontrado' });

        const prisma = request.tenantPrisma as any;
        const ciclo = await cicloActivo(prisma);
        if (!ciclo) return reply.status(404).send({ error: 'No hay un ciclo escolar activo', code: 'NO_ACTIVE_YEAR' });

        const ficha = await fichaDelAlumno(prisma, config, ciclo, studentId, await hoyDelLiceo(prisma), rolDe(request) === UserRole.ADMIN);
        if (!ficha) return reply.status(404).send({ error: 'Estudiante no encontrado' });
        return reply.send({ ...ficha, methods: rolDe(request) === UserRole.ADMIN ? config.methods : undefined, acceptedCurrencies: config.acceptedCurrencies, dueMode: config.dueMode });
    } catch (error) {
        return responderError(reply, error, 'Error al obtener los pagos del estudiante');
    }
}

/** GET /api/payments/my-children — el representante, sus representados. */
export async function getMyChildrenPayments(request: FastifyRequest, reply: FastifyReply) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return;
        const prisma = request.tenantPrisma as any;
        const ciclo = await cicloActivo(prisma);
        if (!ciclo) return reply.send({ children: [] });

        const vinculos = await prisma.studentTutor.findMany({ where: { tutorId: idDe(request) }, select: { studentId: true } });
        const hoy = await hoyDelLiceo(prisma);
        const children = [];
        for (const v of vinculos) {
            const ficha = await fichaDelAlumno(prisma, config, ciclo, v.studentId, hoy, false);
            if (ficha?.student.enrolled) children.push(ficha);
        }
        return reply.send({ children });
    } catch (error) {
        return responderError(reply, error, 'Error al obtener los pagos');
    }
}

/** PUT /api/payments/students/:studentId/plan — día de pago propio y exoneración. */
export async function updateStudentPlan(
    request: FastifyRequest<{ Params: { studentId: string }; Body: { dueDay?: number | null; exempt?: boolean; exemptReason?: string | null } }>,
    reply: FastifyReply
) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return;
        const prisma = request.tenantPrisma as any;
        const { studentId } = request.params;
        const { dueDay = null, exempt = false, exemptReason = null } = request.body ?? {};

        if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28)) {
            return reply.status(400).send({ error: 'El día de pago debe estar entre 1 y 28' });
        }
        const motivo = exemptReason ? String(exemptReason).replace(/[<>]/g, '').trim().slice(0, 200) : null;
        if (exempt && (!motivo || motivo.length < 3)) {
            return reply.status(400).send({ error: 'Indica el motivo de la exoneración', code: 'EXEMPT_REASON_REQUIRED' });
        }

        const ciclo = await cicloActivo(prisma);
        if (!ciclo) return reply.status(404).send({ error: 'No hay un ciclo escolar activo', code: 'NO_ACTIVE_YEAR' });
        const inscrito = await prisma.studentClassroom.count({ where: { studentId, academicYearId: ciclo.id, isActive: true } });
        if (!inscrito) return reply.status(404).send({ error: 'El estudiante no está inscrito en el ciclo actual' });

        await prisma.studentPaymentPlan.upsert({
            where: { studentId_academicYearId: { studentId, academicYearId: ciclo.id } },
            create: { studentId, academicYearId: ciclo.id, dueDay, exempt, exemptReason: exempt ? motivo : null },
            update: { dueDay, exempt, exemptReason: exempt ? motivo : null },
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
}

/** POST /api/payments/students/:studentId/payments */
export async function registerPayment(
    request: FastifyRequest<{ Params: { studentId: string }; Body: PagoNuevo }>,
    reply: FastifyReply
) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return;
        const prisma = request.tenantPrisma as any;
        const { studentId } = request.params;
        const b = request.body;

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

        const ciclo = await cicloActivo(prisma);
        if (!ciclo) return reply.status(404).send({ error: 'No hay un ciclo escolar activo', code: 'NO_ACTIVE_YEAR' });

        const limpio = (t: unknown, max: number) => (t ? String(t).replace(/[<>]/g, '').trim().slice(0, max) || null : null);

        const pago = await prisma.$transaction(async (tx: any) => {
            // Dos personas cobrando al mismo alumno a la vez podrían pagar dos
            // veces la misma cuota. Este candado hace que la segunda espere a
            // la primera y vea lo ya pagado.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pagos:${studentId}`}))`;

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
            const r = resumenDe(config, ciclo, plan ?? undefined, pagado.get(studentId), hoy);
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
            .catch(() => undefined);

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
        if (!config) return;
        const prisma = request.tenantPrisma as any;
        const motivo = String(request.body?.reason ?? '').replace(/[<>]/g, '').trim().slice(0, 200);
        if (motivo.length < 3) return reply.status(400).send({ error: 'Indica el motivo de la anulación', code: 'ANNUL_REASON_REQUIRED' });

        // Verificar que el pago existe antes de adquirir bloqueo
        const paymentInfo = await prisma.payment.findUnique({
            where: { id: request.params.paymentId },
            select: { id: true, studentId: true, annulledAt: true },
        });
        if (!paymentInfo || paymentInfo.annulledAt) {
            return reply.status(404).send({ error: 'Pago no encontrado o ya anulado' });
        }

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
            .catch(() => undefined);
        return reply.send({ message: 'Pago anulado' });
    } catch (error) {
        return responderError(reply, error, 'Error al anular el pago');
    }
}

/** GET /api/payments/:paymentId/receipt — admin o representante del alumno. */
export async function getPaymentReceipt(request: FastifyRequest<{ Params: { paymentId: string } }>, reply: FastifyReply) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return;
        const prisma = request.tenantPrisma as any;
        const pago = await prisma.payment.findUnique({
            where: { id: request.params.paymentId },
            include: {
                student: { select: { id: true, firstName: true, lastName: true } },
                academicYear: { include: { periods: true } },
                allocations: true,
            },
        });
        if (!pago || !(await puedeVerPagosDe(request, pago.studentId))) return reply.status(404).send({ error: 'Pago no encontrado' });

        const plan = await prisma.studentPaymentPlan.findUnique({
            where: { studentId_academicYearId: { studentId: pago.studentId, academicYearId: pago.academicYearId } },
        });
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
