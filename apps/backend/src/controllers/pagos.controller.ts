import { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { UserRole, ActionType } from '../utils/prisma-enums';
import { logger } from '../utils/logger';
import { avisar } from '../services/avisos.service';
import { comprimirComprobante, FotoNoValida, PESO_MAXIMO_DE_SUBIDA } from '../services/foto-de-perfil.service';
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
import { avisarSiFalla } from '../utils/sin-callar';

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

export async function leerConfiguracion(prisma: any): Promise<Configuracion> {
    return configuracionDe(await prisma.paymentSettings.findUnique({ where: { id: 'liceo' } }));
}

/** Corta si el módulo está apagado. */
export async function moduloActivo(request: FastifyRequest, reply: FastifyReply): Promise<Configuracion | null> {
    const config = await leerConfiguracion(request.tenantPrisma);
    if (!config.enabled) {
        reply.status(403).send({ error: 'El control de pagos no está activado', code: 'PAYMENTS_DISABLED' });
        return null;
    }
    return config;
}

export async function cicloActivo(prisma: any, academicYearId?: string) {
    const ciclo = academicYearId
        ? await prisma.academicYear.findUnique({ where: { id: academicYearId }, include: { periods: true } })
        : await prisma.academicYear.findFirst({ where: { status: 'ACTIVE' }, include: { periods: true }, orderBy: { startDate: 'desc' } });
    return ciclo;
}

/**
 * LA CONFIGURACIÓN DE UN CICLO (2026-10-01)
 *
 * La suya si ya la tiene (`ajustes_de_pagos_del_ciclo`); si no, la del liceo.
 * Antes había una sola para todo: subir la cuota recalculaba los ciclos
 * pasados con la cuota nueva y salían «debiendo» (PAGOS-CICLO-01).
 * `enabled` es siempre el del liceo: el módulo se enciende o se apaga entero.
 */
export async function configuracionDelCiclo(prisma: any, cicloId: string, liceo?: Configuracion): Promise<Configuracion> {
    const delLiceo = liceo ?? (await leerConfiguracion(prisma));
    const fila = await prisma.ajustesDePagosDelCiclo.findUnique({ where: { academicYearId: cicloId } });
    return fila ? { ...configuracionDe(fila), enabled: delLiceo.enabled } : delLiceo;
}

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

/** Un ciclo cerrado se ve, no se toca: lo cobrado y lo anulado quedan como estaban. */
export const estaCerrado = (ciclo: any) => ciclo?.status === 'COMPLETED';
export const CICLO_CERRADO = { error: 'Ese ciclo escolar ya está cerrado: sus pagos se pueden ver, no cambiar', code: 'CICLO_CERRADO' };

/**
 * Lo pagado (no anulado) por alumno y cuota en un ciclo, en céntimos; la
 * fecha del último pago de cada cuota (para la mora) y quiénes son hermanos
 * (para su descuento). Dos consultas.
 */
export interface PagadoDelCiclo {
    get(studentId: string): Map<string, number> | undefined;
    ultimos: Map<string, Map<string, string>>;
    hermanos: Set<string>;
}
export async function pagadoEnElCiclo(prisma: any, academicYearId: string, studentIds?: string[]): Promise<PagadoDelCiclo> {
    const [filas, tutores]: [Array<{ studentId: string; installmentKey: string; total: Prisma.Decimal; ultimo: Date }>, Array<{ tutorId: string; studentId: string }>] =
        await Promise.all([
            prisma.$queryRaw`
                SELECT p."studentId", a."installmentKey", SUM(a."amountBase") AS total, MAX(p."paidAt") AS ultimo
                FROM payment_allocations a
                JOIN payments p ON p.id = a."paymentId"
                WHERE p."academicYearId" = ${academicYearId}
                  AND p."annulledAt" IS NULL
                  ${studentIds ? Prisma.sql`AND p."studentId" IN (${Prisma.join(studentIds)})` : Prisma.empty}
                GROUP BY p."studentId", a."installmentKey"`,
            // Hermanos: inscritos en el ciclo que comparten representante.
            prisma.$queryRaw`
                SELECT st."tutorId", st."studentId"
                FROM student_tutors st
                JOIN student_classrooms sc ON sc."studentId" = st."studentId" AND sc."academicYearId" = ${academicYearId} AND sc."isActive" = true
                GROUP BY st."tutorId", st."studentId"`,
        ]);
    const porAlumno = new Map<string, Map<string, number>>();
    const ultimos = new Map<string, Map<string, string>>();
    for (const f of filas) {
        if (!porAlumno.has(f.studentId)) porAlumno.set(f.studentId, new Map());
        porAlumno.get(f.studentId)!.set(f.installmentKey, aCentimos(f.total));
        if (!ultimos.has(f.studentId)) ultimos.set(f.studentId, new Map());
        ultimos.get(f.studentId)!.set(f.installmentKey, new Date(f.ultimo).toISOString().slice(0, 10));
    }
    // Desde el 2.º hijo del mismo representante (el primero por cédula paga entero).
    const porTutor = new Map<string, string[]>();
    for (const t of tutores) {
        if (!porTutor.has(t.tutorId)) porTutor.set(t.tutorId, []);
        porTutor.get(t.tutorId)!.push(t.studentId);
    }
    const hermanos = new Set<string>();
    for (const hijos of porTutor.values()) [...new Set(hijos)].sort().slice(1).forEach((h) => hermanos.add(h));
    return { get: (id: string) => porAlumno.get(id), ultimos, hermanos };
}

/**
 * Cómo va un alumno en un ciclo. El descuento (2026-10-01): el suyo (beca) o
 * el de hermanos del liceo, el mayor de los dos, sin sumarse. La mora: si la
 * configuración del ciclo la tiene.
 */
export function resumenDe(
    config: Configuracion,
    ciclo: any,
    plan: { dueDay: number | null; exempt: boolean; descuentoPct?: number | null } | undefined,
    pagado: PagadoDelCiclo,
    studentId: string,
    hoy: string
): ResumenDelAlumno {
    const descuentoPct = Math.max(plan?.descuentoPct ?? 0, pagado.hermanos.has(studentId) ? config.descuentoHermanosPct : 0);
    const cuotas = cuotasDelCiclo({
        config,
        inicio: ciclo.startDate,
        cierre: ciclo.endDate,
        lapsos: ciclo.periods,
        diaDelAlumno: config.dueMode === 'PER_STUDENT' ? plan?.dueDay ?? null : null,
        descuentoPct,
    });
    return estadoDelAlumno({
        cuotas,
        pagadoPorCuota: pagado.get(studentId) ?? new Map(),
        hoy,
        graceDays: config.graceDays,
        exento: Boolean(plan?.exempt),
        mora:
            config.moraTipo === 'NINGUNA'
                ? undefined
                : { tipo: config.moraTipo, valorCents: config.moraValorCents, diasDespues: config.moraDiasDespues, ultimoPago: pagado.ultimos.get(studentId) ?? new Map() },
    });
}

const dineroDe = (r: ResumenDelAlumno) => ({
    state: r.state,
    overdueCount: r.overdueCount,
    owed: deCentimos(r.owedCents),
    paid: deCentimos(r.paidCents),
    total: deCentimos(r.totalCents),
});

export async function hoyDelLiceo(prisma: any) {
    return todayInTimezone(await instituteTimezone(prisma));
}

// ─── Configuración ───────────────────────────────────────────────────────────

/** GET /api/payments/settings — cualquiera con sesión ve si está activo; el admin, todo. */
export async function getPaymentSettings(request: FastifyRequest, reply: FastifyReply) {
    try {
        const prisma = request.tenantPrisma as any;
        const delLiceo = await leerConfiguracion(prisma);
        if (rolDe(request) !== UserRole.ADMIN) return reply.send({ enabled: delLiceo.enabled });
        // Lo que se ve y se edita es lo del ciclo en curso (que es lo que se
        // cobra ahora); al guardar, vale también para los ciclos que vengan.
        const ciclo = await cicloActivo(prisma);
        const config = ciclo ? await configuracionDelCiclo(prisma, ciclo.id, delLiceo) : delLiceo;
        return reply.send({
            ...config,
            feeAmount: deCentimos(config.feeCents),
            enrollmentAmount: deCentimos(config.enrollmentCents),
            moraValor: deCentimos(config.moraValorCents),
            feeCents: undefined,
            enrollmentCents: undefined,
            moraValorCents: undefined,
            cicloEnCurso: ciclo ? { id: ciclo.id, name: ciclo.name } : null,
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
        const ciclo = await cicloActivo(prisma);
        const antes = ciclo ? await configuracionDelCiclo(prisma, ciclo.id) : await leerConfiguracion(prisma);

        // Cambiar la frecuencia con pagos ya registrados en el ciclo dejaría esos
        // pagos repartidos en cuotas que ya no existen: nadie sabría qué se pagó.
        if (datos.frequency !== antes.frequency) {
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
        // Y el ciclo en curso, que es lo que se está cobrando. Los ciclos
        // cerrados se quedan con la suya.
        if (ciclo && !estaCerrado(ciclo)) {
            const { enabled: _encendido, ...delCiclo } = datos;
            await prisma.ajustesDePagosDelCiclo.upsert({
                where: { academicYearId: ciclo.id },
                create: { academicYearId: ciclo.id, ...delCiclo, updatedById: idDe(request) },
                update: { ...delCiclo, updatedById: idDe(request) },
            });
        }

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
            .catch(avisarSiFalla('pagos.controller'));

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
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return;
        const prisma = request.tenantPrisma as any;
        const ciclo = await cicloActivo(prisma, request.query?.academicYearId);
        if (!ciclo) return reply.status(404).send({ error: 'No hay un ciclo escolar activo', code: 'NO_ACTIVE_YEAR' });
        const config = await configuracionDelCiclo(prisma, ciclo.id, delLiceo);

        const [inscritos, planes, pagado, hoy] = await Promise.all([
            prisma.studentClassroom.findMany({
                where: { academicYearId: ciclo.id, isActive: true, student: { status: 'ACTIVE' } },
                select: {
                    student: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                    classroom: { select: { id: true, name: true, grade: true, section: true } },
                },
            }),
            prisma.studentPaymentPlan.findMany({ where: { academicYearId: ciclo.id }, select: { studentId: true, dueDay: true, exempt: true, descuentoPct: true } }),
            pagadoEnElCiclo(prisma, ciclo.id),
            hoyDelLiceo(prisma),
        ]);
        const planDe = new Map<string, any>(planes.map((p: any) => [p.studentId, p]));

        let deudores = 0;
        let deudaTotal = 0;
        let cobrado = 0;
        const secciones = new Map<string, any>();
        /**
         * EL CICLO MES A MES (2026-10-01): lo que se esperaba cobrar, lo
         * cobrado y cuántos deben, por el mes en que vence cada cuota. Es lo
         * que pinta el calendario de 12 meses de Finanzas.
         */
        const meses = new Map<string, { esperado: number; cobrado: number; vencidas: number; porVencer: number; deben: Set<string> }>();
        const delMes = (clave: string) => {
            if (!meses.has(clave)) meses.set(clave, { esperado: 0, cobrado: 0, vencidas: 0, porVencer: 0, deben: new Set() });
            return meses.get(clave)!;
        };

        // Un alumno con dos inscripciones activas en el mismo ciclo (dato mal
        // cargado) contaría doble como deudor: se cuenta una vez.
        const vistos = new Set<string>();
        for (const i of inscritos) {
            if (vistos.has(i.student.id)) continue;
            vistos.add(i.student.id);
            const r = resumenDe(config, ciclo, planDe.get(i.student.id), pagado, i.student.id, hoy);
            if (r.state === 'DEBE') deudores++;
            deudaTotal += r.owedCents;
            cobrado += r.paidCents;
            // Cada cuota que no está pagada, con su estado: para «quién debe este mes».
            const cuotas: Record<string, string> = {};
            for (const c of r.cuotas) {
                const m = delMes(c.dueDate.slice(0, 7));
                if (c.state !== 'EXONERADA') m.esperado += c.amountCents;
                m.cobrado += c.paidCents;
                if (c.state === 'VENCIDA') {
                    m.vencidas++;
                    m.deben.add(i.student.id);
                } else if (c.state === 'PENDIENTE' || c.state === 'ABONADA') m.porVencer++;
                if (c.state === 'VENCIDA' || c.state === 'ABONADA' || c.state === 'PENDIENTE') cuotas[c.key] = c.state;
            }

            if (!secciones.has(i.classroom.id)) secciones.set(i.classroom.id, { ...i.classroom, students: [], debtors: 0 });
            const s = secciones.get(i.classroom.id);
            if (r.state === 'DEBE') s.debtors++;
            s.students.push({
                id: i.student.id,
                firstName: i.student.firstName,
                lastName: i.student.lastName,
                avatar: i.student.avatar,
                ...dineroDe(r),
                cuotas,
            });
        }

        const listado = [...secciones.values()]
            .map((s) => ({
                ...s,
                students: s.students.sort((a: any, b: any) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'es')),
            }))
            .sort((a, b) => a.grade - b.grade || String(a.section).localeCompare(String(b.section)));

        return reply.send({
            academicYear: { id: ciclo.id, name: ciclo.name, startDate: ciclo.startDate, endDate: ciclo.endDate, status: ciclo.status },
            closed: estaCerrado(ciclo),
            today: hoy,
            currency: config.baseCurrency,
            summary: {
                students: vistos.size,
                debtors: deudores,
                owed: deCentimos(deudaTotal),
                collected: deCentimos(cobrado),
            },
            // Las cuotas del ciclo (de una persona cualquiera: son iguales para
            // todos salvo el día propio), para saber en qué mes cae cada una.
            installments: cuotasDelCiclo({ config, inicio: ciclo.startDate, cierre: ciclo.endDate, lapsos: ciclo.periods }).map((c) => ({
                key: c.key,
                label: c.label,
                dueDate: c.dueDate,
                amount: deCentimos(c.amountCents),
            })),
            months: [...meses.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([mes, m]) => ({
                    month: mes,
                    expected: deCentimos(m.esperado),
                    collected: deCentimos(m.cobrado),
                    overdue: m.vencidas,
                    upcoming: m.porVencer,
                    debtors: m.deben.size,
                })),
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

    const r = resumenDe(config, ciclo, plan ?? undefined, pagado, studentId, hoy);
    const nombreDeCuota = new Map(r.cuotas.map((c) => [c.key, c.label]));
    const reportados = await prisma.pagoReportado.findMany({ where: { studentId, academicYearId: ciclo.id }, orderBy: { createdAt: 'desc' }, take: 20 });

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
        plan: {
            dueDay: plan?.dueDay ?? null,
            exempt: plan?.exempt ?? false,
            exemptReason: plan?.exemptReason ?? null,
            descuentoPct: plan?.descuentoPct ?? 0,
            descuentoMotivo: plan?.descuentoMotivo ?? null,
            // El de hermanos lo pone el liceo solo; se dice para que se entienda la cuota.
            hermano: pagado.hermanos.has(studentId) && config.descuentoHermanosPct > 0 ? config.descuentoHermanosPct : 0,
        },
        summary: dineroDe(r),
        installments: r.cuotas.map((c) => ({
            key: c.key,
            label: c.label,
            kind: c.kind,
            dueDate: c.dueDate,
            overdueFrom: sumarDias(c.dueDate, config.graceDays + 1),
            amount: deCentimos(c.amountCents),
            fullAmount: c.fullCents != null ? deCentimos(c.fullCents) : null,
            lateFee: c.lateFeeCents ? deCentimos(c.lateFeeCents) : null,
            paid: deCentimos(c.paidCents),
            pending: deCentimos(c.pendingCents),
            state: c.state,
        })),
        reports: reportados.map((x: any) => ({
            id: x.id,
            estado: x.estado,
            monto: Number(x.monto).toFixed(2),
            moneda: x.moneda,
            metodo: x.metodo,
            referencia: x.referencia,
            fechaDePago: x.fechaDePago.toISOString().slice(0, 10),
            cuotas: (x.installmentKeys as string[]).map((k) => nombreDeCuota.get(k) ?? k),
            motivoRechazo: x.motivoRechazo,
            conCaptura: Boolean(x.comprobanteId),
            createdAt: x.createdAt,
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
export async function getStudentPayments(
    request: FastifyRequest<{ Params: { studentId: string }; Querystring: { academicYearId?: string } }>,
    reply: FastifyReply
) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return;
        const { studentId } = request.params;
        // Misma respuesta para "no existe" y "no es tuyo".
        if (!(await puedeVerPagosDe(request, studentId))) return reply.status(404).send({ error: 'Estudiante no encontrado' });

        const prisma = request.tenantPrisma as any;
        const ciclo = await cicloActivo(prisma, request.query?.academicYearId);
        if (!ciclo) return reply.status(404).send({ error: 'No hay un ciclo escolar activo', code: 'NO_ACTIVE_YEAR' });
        const config = await configuracionDelCiclo(prisma, ciclo.id, delLiceo);

        const ficha = await fichaDelAlumno(prisma, config, ciclo, studentId, await hoyDelLiceo(prisma), rolDe(request) === UserRole.ADMIN);
        if (!ficha) return reply.status(404).send({ error: 'Estudiante no encontrado' });
        return reply.send({
            ...ficha,
            closed: estaCerrado(ciclo),
            // El representante los necesita para reportar su pago; el alumno no.
            methods: rolDe(request) === UserRole.STUDENT ? undefined : config.methods,
            acceptedCurrencies: config.acceptedCurrencies,
            dueMode: config.dueMode,
        });
    } catch (error) {
        return responderError(reply, error, 'Error al obtener los pagos del estudiante');
    }
}

/** GET /api/payments/my-children — el representante, sus representados. */
export async function getMyChildrenPayments(request: FastifyRequest, reply: FastifyReply) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return;
        const prisma = request.tenantPrisma as any;
        const ciclo = await cicloActivo(prisma);
        if (!ciclo) return reply.send({ children: [] });
        const config = await configuracionDelCiclo(prisma, ciclo.id, delLiceo);

        const vinculos = await prisma.studentTutor.findMany({ where: { tutorId: idDe(request) }, select: { studentId: true } });
        const hoy = await hoyDelLiceo(prisma);
        const children = [];
        for (const v of vinculos) {
            const ficha = await fichaDelAlumno(prisma, config, ciclo, v.studentId, hoy, false);
            if (ficha?.student.enrolled) children.push({ ...ficha, closed: false, methods: config.methods, acceptedCurrencies: config.acceptedCurrencies, dueMode: config.dueMode });
        }
        return reply.send({ children });
    } catch (error) {
        return responderError(reply, error, 'Error al obtener los pagos');
    }
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
        if (!config) return;
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
        if (!delLiceo) return;
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
        if (!config) return;
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
        if (!delLiceo) return;
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

/**
 * GET /api/payments/cycles — los ciclos escolares, para elegir cuál mirar.
 * El de en curso primero; los cerrados se ven, no se tocan.
 */
export async function getPaymentCycles(request: FastifyRequest, reply: FastifyReply) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return;
        const prisma = request.tenantPrisma as any;
        const ciclos = await prisma.academicYear.findMany({
            orderBy: { startDate: 'desc' },
            select: { id: true, name: true, status: true, startDate: true, endDate: true, _count: { select: { payments: true } } },
        });
        return reply.send({
            cycles: ciclos.map((c: any) => ({
                id: c.id,
                name: c.name,
                status: c.status,
                startDate: c.startDate,
                endDate: c.endDate,
                closed: estaCerrado(c),
                payments: c._count.payments,
            })),
        });
    } catch (error) {
        return responderError(reply, error, 'Error al leer los ciclos');
    }
}

/**
 * GET /api/payments/month?academicYearId=&month=YYYY-MM — el mes en días, para
 * el calendario: qué cuotas vencen cada día (cuántas y cuánto falta de ellas) y
 * quién pagó cada día. Solo el admin.
 */
export async function getPaymentsMonth(
    request: FastifyRequest<{ Querystring: { academicYearId?: string; month: string } }>,
    reply: FastifyReply
) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return;
        const mes = String(request.query?.month ?? '');
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return reply.status(400).send({ error: 'Mes inválido (AAAA-MM)', code: 'MES_INVALIDO' });
        const prisma = request.tenantPrisma as any;
        const ciclo = await cicloActivo(prisma, request.query?.academicYearId);
        if (!ciclo) return reply.status(404).send({ error: 'No hay un ciclo escolar activo', code: 'NO_ACTIVE_YEAR' });
        const config = await configuracionDelCiclo(prisma, ciclo.id, delLiceo);

        const desde = new Date(`${mes}-01T00:00:00Z`);
        const hasta = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + 1, 1));
        const [inscritos, planes, pagado, hoy, pagos] = await Promise.all([
            prisma.studentClassroom.findMany({
                where: { academicYearId: ciclo.id, isActive: true, student: { status: 'ACTIVE' } },
                select: { student: { select: { id: true, firstName: true, lastName: true } } },
            }),
            prisma.studentPaymentPlan.findMany({ where: { academicYearId: ciclo.id }, select: { studentId: true, dueDay: true, exempt: true, descuentoPct: true } }),
            pagadoEnElCiclo(prisma, ciclo.id),
            hoyDelLiceo(prisma),
            prisma.payment.findMany({
                where: { academicYearId: ciclo.id, annulledAt: null, paidAt: { gte: desde, lt: hasta } },
                orderBy: [{ paidAt: 'asc' }, { receiptNumber: 'asc' }],
                select: {
                    id: true,
                    receiptNumber: true,
                    paidAt: true,
                    method: true,
                    amountBase: true,
                    student: { select: { id: true, firstName: true, lastName: true } },
                },
            }),
        ]);
        const planDe = new Map<string, any>(planes.map((p: any) => [p.studentId, p]));
        const dias = new Map<string, { vencen: number; faltaDeLoQueVence: number; deben: Array<{ id: string; nombre: string; falta: string }>; cobros: any[] }>();
        const delDia = (d: string) => {
            if (!dias.has(d)) dias.set(d, { vencen: 0, faltaDeLoQueVence: 0, deben: [], cobros: [] });
            return dias.get(d)!;
        };
        const vistos = new Set<string>();
        for (const i of inscritos) {
            if (vistos.has(i.student.id)) continue;
            vistos.add(i.student.id);
            const r = resumenDe(config, ciclo, planDe.get(i.student.id), pagado, i.student.id, hoy);
            for (const c of r.cuotas) {
                if (!c.dueDate.startsWith(mes) || c.state === 'EXONERADA') continue;
                const d = delDia(c.dueDate);
                d.vencen++;
                d.faltaDeLoQueVence += c.pendingCents;
                if (c.pendingCents > 0) d.deben.push({ id: i.student.id, nombre: `${i.student.lastName}, ${i.student.firstName}`, falta: deCentimos(c.pendingCents) });
            }
        }
        for (const p of pagos) {
            delDia(p.paidAt.toISOString().slice(0, 10)).cobros.push({
                id: p.id,
                receiptNumber: p.receiptNumber,
                method: p.method,
                amount: p.amountBase.toString(),
                student: { id: p.student.id, nombre: `${p.student.lastName}, ${p.student.firstName}` },
            });
        }
        return reply.send({
            academicYear: { id: ciclo.id, name: ciclo.name },
            currency: config.baseCurrency,
            month: mes,
            today: hoy,
            days: [...dias.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([fecha, d]) => ({
                    date: fecha,
                    due: d.vencen,
                    pendingOfDue: deCentimos(d.faltaDeLoQueVence),
                    debtors: d.deben.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
                    payments: d.cobros,
                    collected: deCentimos(d.cobros.reduce((t, c) => t + aCentimos(c.amount), 0)),
                })),
        });
    } catch (error) {
        return responderError(reply, error, 'Error al leer el mes');
    }
}

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
        if (!(await moduloActivo(request, reply))) return;
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
        if (!(await moduloActivo(request, reply))) return;
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
        if (!delLiceo) return;
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
        if (!(await moduloActivo(request, reply))) return;
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
        if (!(await moduloActivo(request, reply))) return;
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
        if (!(await moduloActivo(request, reply))) return;
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
