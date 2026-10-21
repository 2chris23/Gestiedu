import { responderError, moduloActivo, cicloActivo, configuracionDelCiclo, estaCerrado, pagadoEnElCiclo, resumenDe, dineroDe, hoyDelLiceo } from '../pagos.controller';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
    aCentimos,
    cuotasDelCiclo,
    deCentimos,
} from '../../services/pagos.service';

// ─── Resumen del ciclo (admin) ───────────────────────────────────────────────

/** GET /api/payments/overview?academicYearId= */
export async function getPaymentsOverview(
    request: FastifyRequest<{ Querystring: { academicYearId?: string } }>,
    reply: FastifyReply
) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return reply;
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
                // Lo de cada mes, con su beca o su descuento (para cobrar desde
                // «Ingreso»): la cuota menor, que es la que no lleva mora.
                mensualidad: deCentimos(
                    r.cuotas.filter((c: any) => c.kind === 'CUOTA' && c.state !== 'EXONERADA').reduce((m: number | null, c: any) => (m === null || c.amountCents < m ? c.amountCents : m), null) ?? 0
                ),
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

/**
 * GET /api/payments/cycles — los ciclos escolares, para elegir cuál mirar.
 * El de en curso primero; los cerrados se ven, no se tocan.
 */
export async function getPaymentCycles(request: FastifyRequest, reply: FastifyReply) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return reply;
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
        if (!delLiceo) return reply;
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
