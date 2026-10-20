import { prismaDe, responder, ymd, fechaDB, elCiclo, nombreDePersona, prepararLaNomina, cuentasDeLaNomina } from '../finanzas.controller';
import { FastifyReply, FastifyRequest } from 'fastify';
import { aCentimos, deCentimos } from '../../services/pagos.service';
import {
    configuracionDelCiclo,
    estaCerrado,
    hoyDelLiceo,
    moduloActivo,
    pagadoEnElCiclo,
    resumenDe,
} from '../pagos.controller';
import {
    mesesEntre,
} from '../../services/finanzas.service';

// ─── El resumen: fondos disponibles y el ciclo mes a mes ────────────────────

/** GET /api/finanzas/resumen?academicYearId= */
export async function getResumen(request: FastifyRequest<{ Querystring: { academicYearId?: string } }>, reply: FastifyReply) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return reply;
        const prisma = prismaDe(request);
        const ciclo = await elCiclo(request);
        const config = await configuracionDelCiclo(prisma, ciclo.id, delLiceo);
        const hoy = await hoyDelLiceo(prisma);
        const inicio = ymd(ciclo.startDate)!;
        const cierre = ymd(ciclo.endDate)!;
        const desde = fechaDB(inicio);
        const hasta = fechaDB(cierre);
        await prepararLaNomina(prisma, ciclo);

        // Lo que hay: desde siempre, sin anulados.
        const [[totales], inscritos, planes, pagadoAlumnos, cobrosDelCiclo, fondosDelCiclo, gastosDelCiclo, pagosPersonalDelCiclo, nomina, saldoInicial] = await Promise.all([
            prisma.$queryRaw`
                SELECT
                  (SELECT COALESCE(SUM("montoBase"),0) FROM fondos_del_liceo WHERE "anuladoEn" IS NULL) AS fondos,
                  (SELECT COALESCE(SUM("amountBase"),0) FROM payments WHERE "annulledAt" IS NULL) AS cobros,
                  (SELECT COALESCE(SUM("montoBase"),0) FROM pagos_al_personal WHERE "anuladoEn" IS NULL) AS personal,
                  (SELECT COALESCE(SUM("montoBase"),0) FROM gastos WHERE "anuladoEn" IS NULL) AS gastos`,
            prisma.studentClassroom.findMany({ where: { academicYearId: ciclo.id, isActive: true, student: { status: 'ACTIVE' } }, select: { studentId: true } }),
            prisma.studentPaymentPlan.findMany({ where: { academicYearId: ciclo.id }, select: { studentId: true, dueDay: true, exempt: true, descuentoPct: true } }),
            pagadoEnElCiclo(prisma, ciclo.id),
            prisma.payment.findMany({ where: { academicYearId: ciclo.id, annulledAt: null }, select: { paidAt: true, amountBase: true } }),
            prisma.fondoDelLiceo.findMany({ where: { anuladoEn: null, fecha: { gte: desde, lte: hasta } }, select: { fecha: true, montoBase: true } }),
            prisma.gasto.findMany({ where: { anuladoEn: null, fecha: { gte: desde, lte: hasta } }, select: { fecha: true, montoBase: true, categoria: true } }),
            prisma.pagoAlPersonal.findMany({ where: { academicYearId: ciclo.id, anuladoEn: null }, select: { fecha: true, montoBase: true } }),
            cuentasDeLaNomina(prisma, ciclo, hoy),
            prisma.fondoDelLiceo.count({ where: { concepto: 'SALDO_INICIAL', anuladoEn: null } }),
        ]);

        // Lo que deben los alumnos (las mismas cuentas que Pagos).
        const planDe = new Map<string, any>(planes.map((p: any) => [p.studentId, p]));
        let deudaAlumnos = 0;
        let porCobrarAlumnos = 0;
        let deudores = 0;
        const porCobrarPorMes = new Map<string, number>();
        const vistos = new Set<string>();
        for (const i of inscritos) {
            if (vistos.has(i.studentId)) continue;
            vistos.add(i.studentId);
            const r = resumenDe(config, ciclo, planDe.get(i.studentId), pagadoAlumnos, i.studentId, hoy);
            deudaAlumnos += r.owedCents;
            if (r.state === 'DEBE') deudores++;
            for (const c of r.cuotas) {
                if (c.state === 'EXONERADA') continue;
                porCobrarAlumnos += c.pendingCents;
                porCobrarPorMes.set(c.dueDate.slice(0, 7), (porCobrarPorMes.get(c.dueDate.slice(0, 7)) ?? 0) + c.pendingCents);
            }
        }

        // Lo que falta pagar al personal, y por mes.
        let porPagarPersonal = 0;
        let vencidoPersonal = 0;
        let sinSueldo = 0;
        const porPagarPorMes = new Map<string, number>();
        for (const f of nomina.filas) {
            if (!f.cuentas) {
                if (f.persona.activo) sinSueldo++;
                continue;
            }
            porPagarPersonal += f.cuentas.pendienteCents;
            vencidoPersonal += f.cuentas.vencidoCents;
            for (const p of f.cuentas.pagos) porPagarPorMes.set(p.fecha.slice(0, 7), (porPagarPorMes.get(p.fecha.slice(0, 7)) ?? 0) + p.pendienteCents);
        }

        const meses = mesesEntre(inicio, cierre).map((m) => ({ mes: m, entra: 0, sale: 0, gastos: 0, porCobrar: porCobrarPorMes.get(m) ?? 0, porPagar: porPagarPorMes.get(m) ?? 0 }));
        const delMes = new Map(meses.map((m) => [m.mes, m]));
        for (const c of cobrosDelCiclo) {
            const m = delMes.get(ymd(c.paidAt)!.slice(0, 7));
            if (m) m.entra += aCentimos(c.amountBase);
        }
        for (const f of fondosDelCiclo) {
            const m = delMes.get(ymd(f.fecha)!.slice(0, 7));
            if (m) m.entra += aCentimos(f.montoBase);
        }
        for (const p of pagosPersonalDelCiclo) {
            const m = delMes.get(ymd(p.fecha)!.slice(0, 7));
            if (m) m.sale += aCentimos(p.montoBase);
        }
        const gastosPorCategoria = new Map<string, number>();
        for (const g of gastosDelCiclo) {
            const m = delMes.get(ymd(g.fecha)!.slice(0, 7));
            if (m) {
                m.sale += aCentimos(g.montoBase);
                m.gastos += aCentimos(g.montoBase);
            }
            gastosPorCategoria.set(g.categoria, (gastosPorCategoria.get(g.categoria) ?? 0) + aCentimos(g.montoBase));
        }

        const disponibles = aCentimos(totales.fondos) + aCentimos(totales.cobros) - aCentimos(totales.personal) - aCentimos(totales.gastos);
        const reportados = await prisma.$queryRaw`SELECT to_regclass('public.pagos_reportados') IS NOT NULL AS hay`
            .then(async ([x]: any) => (x?.hay ? Number((await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM pagos_reportados WHERE estado = 'PENDIENTE'`)[0].n) : 0))
            .catch(() => 0);

        return reply.send({
            academicYear: { id: ciclo.id, name: ciclo.name, startDate: inicio, endDate: cierre, status: ciclo.status },
            closed: estaCerrado(ciclo),
            today: hoy,
            currency: config.baseCurrency,
            fondosDisponibles: deCentimos(disponibles),
            tieneSaldoInicial: saldoInicial > 0,
            alumnos: { deben: deCentimos(deudaAlumnos), deudores, porCobrar: deCentimos(porCobrarAlumnos), cobrado: deCentimos(cobrosDelCiclo.reduce((t: number, c: any) => t + aCentimos(c.amountBase), 0)) },
            personal: { porPagar: deCentimos(porPagarPersonal), vencido: deCentimos(vencidoPersonal), sinSueldo, personas: nomina.filas.filter((f: any) => f.cuentas).length },
            gastos: {
                delCiclo: deCentimos(gastosDelCiclo.reduce((t: number, g: any) => t + aCentimos(g.montoBase), 0)),
                porCategoria: [...gastosPorCategoria.entries()].sort((a, b) => b[1] - a[1]).map(([categoria, c]) => ({ categoria, monto: deCentimos(c) })),
            },
            pagosPorConfirmar: reportados,
            months: meses.map((m) => ({
                month: m.mes,
                in: deCentimos(m.entra),
                out: deCentimos(m.sale),
                expenses: deCentimos(m.gastos),
                toCollect: deCentimos(m.porCobrar),
                toPay: deCentimos(m.porPagar),
            })),
        });
    } catch (error) {
        return responder(reply, error, 'Error al leer las finanzas');
    }
}

/** GET /api/finanzas/mes?academicYearId=&mes=AAAA-MM — fondos, gastos y nómina de cada día. */
export async function getMes(request: FastifyRequest<{ Querystring: { academicYearId?: string; mes?: string } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const mes = String(request.query?.mes ?? '');
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return reply.status(400).send({ error: 'Mes inválido (AAAA-MM)', code: 'MES_INVALIDO' });
        const prisma = prismaDe(request);
        const ciclo = await elCiclo(request);
        const hoy = await hoyDelLiceo(prisma);
        const desde = fechaDB(`${mes}-01`);
        const hasta = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + 1, 1));
        const [fondos, gastos, pagos, nomina] = await Promise.all([
            prisma.fondoDelLiceo.findMany({ where: { anuladoEn: null, fecha: { gte: desde, lt: hasta } }, orderBy: { fecha: 'asc' } }),
            prisma.gasto.findMany({ where: { anuladoEn: null, fecha: { gte: desde, lt: hasta } }, orderBy: { fecha: 'asc' } }),
            prisma.pagoAlPersonal.findMany({
                where: { anuladoEn: null, fecha: { gte: desde, lt: hasta } },
                include: { personal: { include: { user: { select: { firstName: true, lastName: true } } } } },
                orderBy: { fecha: 'asc' },
            }),
            cuentasDeLaNomina(prisma, ciclo, hoy),
        ]);
        const dias = new Map<string, any>();
        const dia = (d: string) => {
            if (!dias.has(d)) dias.set(d, { date: d, fondos: [], gastos: [], pagados: [], tocaPagar: [] });
            return dias.get(d);
        };
        for (const f of fondos) dia(ymd(f.fecha)!).fondos.push({ id: f.id, concepto: f.concepto, descripcion: f.descripcion, monto: f.montoBase.toString() });
        for (const g of gastos) dia(ymd(g.fecha)!).gastos.push({ id: g.id, concepto: g.concepto, categoria: g.categoria, monto: g.montoBase.toString(), conFactura: Boolean(g.comprobanteId) });
        for (const p of pagos) dia(ymd(p.fecha)!).pagados.push({ id: p.id, numero: p.numero, persona: nombreDePersona(p.personal), personalId: p.personalId, monto: p.montoBase.toString() });
        for (const f of nomina.filas) {
            for (const p of f.cuentas?.pagos ?? []) {
                if (!p.fecha.startsWith(mes) || p.pendienteCents === 0) continue;
                dia(p.fecha).tocaPagar.push({ personalId: f.persona.id, persona: nombreDePersona(f.persona), etiqueta: p.etiqueta, falta: deCentimos(p.pendienteCents), estado: p.estado });
            }
        }
        return reply.send({ month: mes, today: hoy, days: [...dias.values()].sort((a, b) => a.date.localeCompare(b.date)) });
    } catch (error) {
        return responder(reply, error, 'Error al leer el mes');
    }
}

/**
 * GET /api/finanzas/reporte?mes=AAAA-MM — EL REPORTE DEL MES (2026-10-01)
 *
 * Lo que eligió Cristian: una hoja por mes para la junta o la dirección.
 * Con qué se empezó el mes, lo que entró (cobros por método y fondos), lo que
 * salió (personal y gastos por categoría), con qué se acabó y lo que deben los
 * estudiantes al cierre del mes. Las mismas cuentas que el Resumen: el saldo
 * es TODO lo que entró menos TODO lo que salió, sin lo anulado.
 */
export async function getReporteDelMes(request: FastifyRequest<{ Querystring: { academicYearId?: string; mes?: string } }>, reply: FastifyReply) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return reply;
        const mes = String(request.query?.mes ?? '');
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return reply.status(400).send({ error: 'Mes inválido (AAAA-MM)', code: 'MES_INVALIDO' });
        const prisma = prismaDe(request);
        const ciclo = await elCiclo(request);
        const config = await configuracionDelCiclo(prisma, ciclo.id, delLiceo);
        const hoy = await hoyDelLiceo(prisma);
        const desde = fechaDB(`${mes}-01`);
        const hasta = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + 1, 1));
        const ultimoDia = ymd(new Date(hasta.getTime() - 86_400_000))!;

        const [[antes], cobros, fondos, personal, gastos, inscritos, planes, pagado] = await Promise.all([
            prisma.$queryRaw`
                SELECT
                  (SELECT COALESCE(SUM("montoBase"),0) FROM fondos_del_liceo WHERE "anuladoEn" IS NULL AND fecha < ${desde}) AS fondos,
                  (SELECT COALESCE(SUM("amountBase"),0) FROM payments WHERE "annulledAt" IS NULL AND "paidAt" < ${desde}) AS cobros,
                  (SELECT COALESCE(SUM("montoBase"),0) FROM pagos_al_personal WHERE "anuladoEn" IS NULL AND fecha < ${desde}) AS personal,
                  (SELECT COALESCE(SUM("montoBase"),0) FROM gastos WHERE "anuladoEn" IS NULL AND fecha < ${desde}) AS gastos`,
            prisma.$queryRaw`
                SELECT method AS metodo, COUNT(*)::int AS cuantos, COALESCE(SUM("amountBase"),0) AS total
                FROM payments WHERE "annulledAt" IS NULL AND "paidAt" >= ${desde} AND "paidAt" < ${hasta}
                GROUP BY method ORDER BY total DESC`,
            prisma.fondoDelLiceo.findMany({ where: { anuladoEn: null, fecha: { gte: desde, lt: hasta } }, orderBy: { fecha: 'asc' } }),
            prisma.pagoAlPersonal.findMany({
                where: { anuladoEn: null, fecha: { gte: desde, lt: hasta } },
                include: { personal: { include: { user: { select: { firstName: true, lastName: true } } } } },
                orderBy: { fecha: 'asc' },
            }),
            prisma.gasto.findMany({ where: { anuladoEn: null, fecha: { gte: desde, lt: hasta } }, orderBy: { fecha: 'asc' } }),
            prisma.studentClassroom.findMany({ where: { academicYearId: ciclo.id, isActive: true, student: { status: 'ACTIVE' } }, select: { studentId: true } }),
            prisma.studentPaymentPlan.findMany({ where: { academicYearId: ciclo.id }, select: { studentId: true, dueDay: true, exempt: true, descuentoPct: true } }),
            pagadoEnElCiclo(prisma, ciclo.id),
        ]);

        const inicioCents = aCentimos(antes.fondos) + aCentimos(antes.cobros) - aCentimos(antes.personal) - aCentimos(antes.gastos);
        const cobrosCents = cobros.reduce((t: number, c: any) => t + aCentimos(c.total), 0);
        const fondosCents = fondos.reduce((t: number, f: any) => t + aCentimos(f.montoBase), 0);
        const personalCents = personal.reduce((t: number, p: any) => t + aCentimos(p.montoBase), 0);
        const gastosCents = gastos.reduce((t: number, g: any) => t + aCentimos(g.montoBase), 0);
        const porCategoria = new Map<string, number>();
        for (const g of gastos) porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? 0) + aCentimos(g.montoBase));

        // Lo que deben al cierre del mes (o hoy, si el mes no ha terminado).
        const corte = ultimoDia < hoy ? ultimoDia : hoy;
        const planDe = new Map<string, any>(planes.map((p: any) => [p.studentId, p]));
        let deben = 0;
        let deudores = 0;
        for (const id of new Set<string>(inscritos.map((i: any) => i.studentId))) {
            const r = resumenDe(config, ciclo, planDe.get(id), pagado, id, corte);
            deben += r.owedCents;
            if (r.state === 'DEBE') deudores++;
        }

        return reply.send({
            month: mes,
            academicYear: { id: ciclo.id, name: ciclo.name },
            currency: config.baseCurrency,
            corte,
            saldoInicial: deCentimos(inicioCents),
            entradas: {
                total: deCentimos(cobrosCents + fondosCents),
                cobros: deCentimos(cobrosCents),
                cobrosPorMetodo: cobros.map((c: any) => ({ metodo: c.metodo, cuantos: c.cuantos, monto: deCentimos(aCentimos(c.total)) })),
                fondos: fondos.map((f: any) => ({ fecha: ymd(f.fecha), concepto: f.concepto, descripcion: f.descripcion, monto: deCentimos(aCentimos(f.montoBase)) })),
            },
            salidas: {
                total: deCentimos(personalCents + gastosCents),
                personal: deCentimos(personalCents),
                pagosAlPersonal: personal.map((p: any) => ({ fecha: ymd(p.fecha), numero: p.numero, persona: nombreDePersona(p.personal), monto: deCentimos(aCentimos(p.montoBase)) })),
                gastos: deCentimos(gastosCents),
                gastosPorCategoria: [...porCategoria.entries()].sort((a, b) => b[1] - a[1]).map(([categoria, c]) => ({ categoria, monto: deCentimos(c) })),
                listaDeGastos: gastos.map((g: any) => ({ fecha: ymd(g.fecha), concepto: g.concepto, categoria: g.categoria, proveedor: g.proveedor, monto: deCentimos(aCentimos(g.montoBase)) })),
            },
            saldoFinal: deCentimos(inicioCents + cobrosCents + fondosCents - personalCents - gastosCents),
            alumnos: { deben: deCentimos(deben), deudores },
        });
    } catch (error) {
        return responder(reply, error, 'Error al preparar el reporte del mes');
    }
}
