import { idDe, rolDe, responderError, moduloActivo, cicloActivo, configuracionDelCiclo, estaCerrado, pagadoEnElCiclo, resumenDe, dineroDe, hoyDelLiceo, puedeVerPagosDe } from '../pagos.controller';
import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '../../utils/prisma-enums';
import {
    Configuracion,
    deCentimos,
    sumarDias,
} from '../../services/pagos.service';

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
        if (!delLiceo) return reply;
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
        if (!delLiceo) return reply;
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
