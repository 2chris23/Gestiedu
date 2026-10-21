import { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { UserRole, ActionType } from '../utils/prisma-enums';
import { logger } from '../utils/logger';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import {
    aCentimos,
    Configuracion,
    configuracionDe,
    cuotasDelCiclo,
    deCentimos,
    estadoDelAlumno,
    ResumenDelAlumno,
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

export const idDe = (r: FastifyRequest) => (r.user as any)?.userId ?? (r.user as any)?.id;
export const rolDe = (r: FastifyRequest) => (r.user as any)?.role;

export function responderError(reply: FastifyReply, error: any, porDefecto: string) {
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

export const dineroDe = (r: ResumenDelAlumno) => ({
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
// ─── Un alumno ───────────────────────────────────────────────────────────────

export async function puedeVerPagosDe(request: FastifyRequest, studentId: string): Promise<boolean> {
    const rol = rolDe(request);
    if (rol === UserRole.ADMIN) return true;
    if (rol === UserRole.TUTOR) {
        return (await (request.tenantPrisma as any).studentTutor.count({ where: { tutorId: idDe(request), studentId } })) > 0;
    }
    return false;
}