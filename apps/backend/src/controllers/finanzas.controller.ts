import { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { UserRole, ActionType } from '../utils/prisma-enums';
import { logger } from '../utils/logger';
import { aCentimos, aMonedaBase, deCentimos, Moneda } from '../services/pagos.service';
import {
    cicloActivo,
    CICLO_CERRADO,
    configuracionDelCiclo,
    estaCerrado,
    hoyDelLiceo,
    leerConfiguracion,
    moduloActivo,
    pagadoEnElCiclo,
    resumenDe,
} from './pagos.controller';
import {
    Acuerdo,
    estadoDelPersonal,
    limpio,
    mesesEntre,
    Nomina,
    pagosDelPersonal,
    repartirAlPersonal,
    validarAcuerdo,
    validarFecha,
    validarMonto,
    validarNomina,
} from '../services/finanzas.service';
import { comprimirComprobante, FotoNoValida, PESO_MAXIMO_DE_SUBIDA } from '../services/foto-de-perfil.service';

/**
 * LAS FINANZAS DEL LICEO (2026-10-01)
 *
 * Cristian: «poder ver los fondos del liceo, agregar fondos…, cuánto le deben
 * los estudiantes, cuánto le tiene que pagar a los profesores, fijar fecha de
 * pago para todos o personalizado…, vacaciones…, otro personal…, y gastos».
 *
 * Quién puede qué:
 *   · Admin: todo.
 *   · Profesor (y cualquiera con ficha de personal): SOLO sus propios pagos
 *     (`/mis-pagos`). Nada de los fondos ni de lo de otros.
 *   · Alumno y representante: nada de aquí.
 *
 * Va con el módulo de pagos: apagado, todo responde 403 (PAYMENTS_DISABLED).
 * Nada se borra: un fondo, un gasto o un pago mal anotado se ANULA con motivo.
 */

const idDe = (r: FastifyRequest) => (r.user as any)?.userId ?? (r.user as any)?.id;
const prismaDe = (r: FastifyRequest) => r.tenantPrisma as any;

function responder(reply: FastifyReply, error: any, porDefecto: string) {
    if (error instanceof FotoNoValida) return reply.status(400).send({ error: error.message, code: 'COMPROBANTE_INVALIDO' });
    if (error?.statusCode) return reply.status(error.statusCode).send({ error: error.message, code: error.code });
    logger.error(porDefecto, { error: error instanceof Error ? error.message : String(error) });
    return reply.status(500).send({ error: porDefecto });
}

const fallo = (status: number, error: string, code: string) => Object.assign(new Error(error), { statusCode: status, code });

async function bitacora(request: FastifyRequest, action: string, entity: string, entityId: string, newValues: any, level?: string) {
    await prismaDe(request)
        .auditLog.create({
            data: {
                instituteId: request.institute?.id,
                action,
                entity,
                entityType: entity,
                entityId,
                newValues,
                ...(level ? { level } : {}),
                userId: idDe(request),
            },
        })
        .catch(() => undefined);
}

/** El dinero que manda la pantalla: monto, moneda y tasa → céntimos en la moneda base. */
async function dineroDe(prisma: any, b: any) {
    const config = await leerConfiguracion(prisma);
    const base = config.baseCurrency;
    const moneda = (b?.moneda ?? base) as Moneda;
    if (!['USD', 'VES'].includes(moneda)) throw fallo(400, 'Moneda inválida', 'MONEDA_INVALIDA');
    const montoCents = validarMonto(b?.monto);
    const tasa = b?.tasa == null || b.tasa === '' ? null : Number(b.tasa);
    if (tasa !== null && (!Number.isFinite(tasa) || tasa <= 0 || tasa > 100_000_000)) throw fallo(400, 'Tasa de cambio inválida', 'TASA_INVALIDA');
    const baseCents = aMonedaBase(montoCents, moneda, base, tasa);
    if (baseCents <= 0) throw fallo(400, 'Monto inválido', 'MONTO_INVALIDO');
    return { base, moneda, montoCents, tasa: moneda === base ? null : tasa, baseCents };
}

const ymd = (d: Date | string | null | undefined) => (d ? (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : null);
const fechaDB = (t: string) => new Date(`${t}T00:00:00Z`);

async function elCiclo(request: FastifyRequest<{ Querystring: { academicYearId?: string } }>) {
    const ciclo = await cicloActivo(prismaDe(request), (request.query as any)?.academicYearId);
    if (!ciclo) throw fallo(404, 'No hay un ciclo escolar activo', 'NO_ACTIVE_YEAR');
    return ciclo;
}

// ─── La nómina: ajustes del liceo, acuerdos, lo que se debe ─────────────────

function nominaDe(fila: any | null, ciclo: any): Nomina {
    // Sin ajustes guardados: agosto del ciclo de vacaciones (el MPPE), el último día del mes.
    const mesesDelCiclo = mesesEntre(ymd(ciclo.startDate)!, ymd(ciclo.endDate)!);
    const agosto = mesesDelCiclo.filter((m) => m.endsWith('-08')).slice(-1);
    return {
        diaDePago: fila?.diaDePago ?? 31,
        mesesDeVacaciones: Array.isArray(fila?.mesesDeVacaciones) && fila ? (fila.mesesDeVacaciones as string[]) : agosto,
        cobraEnVacaciones: fila?.cobraEnVacaciones ?? true,
        bonoCents: aCentimos(fila?.bonoVacacional),
        fechaBono: ymd(fila?.fechaBono),
    };
}

function acuerdoDe(fila: any): Acuerdo {
    return {
        montoCents: aCentimos(fila.monto),
        frecuencia: fila.frecuencia,
        diaDePago: fila.diaDePago ?? null,
        fechaUnica: ymd(fila.fechaUnica),
        cobraEnVacaciones: fila.cobraEnVacaciones ?? null,
        bonoCents: fila.bonoVacacional == null ? null : aCentimos(fila.bonoVacacional),
        fechaBono: ymd(fila.fechaBono),
    };
}

const nombreDePersona = (p: any) => (p.user ? `${p.user.firstName} ${p.user.lastName}` : p.nombre ?? 'Sin nombre');

/** Lo pagado (no anulado) a cada persona en un ciclo, por clave, en céntimos. */
async function pagadoAlPersonal(prisma: any, cicloId: string, personalId?: string) {
    const filas: Array<{ personalId: string; clave: string; total: Prisma.Decimal }> = await prisma.$queryRaw`
        SELECT p."personalId", a.clave, SUM(a."montoBase") AS total
        FROM asignaciones_al_personal a
        JOIN pagos_al_personal p ON p.id = a."pagoId"
        WHERE p."academicYearId" = ${cicloId} AND p."anuladoEn" IS NULL
          ${personalId ? Prisma.sql`AND p."personalId" = ${personalId}` : Prisma.empty}
        GROUP BY p."personalId", a.clave`;
    const mapa = new Map<string, Map<string, number>>();
    for (const f of filas) {
        if (!mapa.has(f.personalId)) mapa.set(f.personalId, new Map());
        mapa.get(f.personalId)!.set(f.clave, aCentimos(f.total));
    }
    return mapa;
}

/**
 * Los profesores con cuenta aparecen solos («sin sueldo fijado» hasta que se
 * les ponga). Y un ciclo sin acuerdos trae los del ciclo anterior de quien
 * tenga «guardar para los próximos ciclos». Las dos cosas, sin duplicar:
 * `userId` y (persona, ciclo) son únicos.
 */
async function prepararLaNomina(prisma: any, ciclo: any): Promise<{ traidos: number; desde: string | null }> {
    const profesores = await prisma.user.findMany({ where: { role: UserRole.TEACHER, isActive: true }, select: { id: true } });
    if (profesores.length) {
        await prisma.personal.createMany({ data: profesores.map((u: any) => ({ userId: u.id, cargo: 'Profesor' })), skipDuplicates: true });
    }
    if (estaCerrado(ciclo)) return { traidos: 0, desde: null };
    const yaTiene = await prisma.acuerdoDePago.count({ where: { academicYearId: ciclo.id } });
    if (yaTiene > 0) return { traidos: 0, desde: null };
    const anterior = await prisma.academicYear.findFirst({
        where: { startDate: { lt: ciclo.startDate }, acuerdosDePago: { some: {} } },
        orderBy: { startDate: 'desc' },
        select: { id: true, name: true },
    });
    if (!anterior) return { traidos: 0, desde: null };
    const acuerdos = await prisma.acuerdoDePago.findMany({
        where: { academicYearId: anterior.id, personal: { activo: true, seQuedaParaProximosCiclos: true } },
    });
    if (!acuerdos.length) return { traidos: 0, desde: null };
    const hecho = await prisma.acuerdoDePago.createMany({
        data: acuerdos.map((a: any) => ({
            personalId: a.personalId,
            academicYearId: ciclo.id,
            monto: a.monto,
            frecuencia: a.frecuencia,
            diaDePago: a.diaDePago,
            // La fecha del pago único y la del bono son de su año: no se traen.
            fechaUnica: null,
            cobraEnVacaciones: a.cobraEnVacaciones,
            bonoVacacional: a.bonoVacacional,
            fechaBono: null,
        })).filter((a: any) => a.frecuencia !== 'UNICO'),
        skipDuplicates: true,
    });
    return { traidos: hecho.count, desde: anterior.name };
}

async function cuentasDeLaNomina(prisma: any, ciclo: any, hoy: string, personalId?: string) {
    const [ajustes, personas, pagado] = await Promise.all([
        prisma.ajustesDeNomina.findUnique({ where: { academicYearId: ciclo.id } }),
        prisma.personal.findMany({
            where: personalId ? { id: personalId } : {},
            include: {
                user: { select: { id: true, firstName: true, lastName: true, role: true, isActive: true } },
                acuerdos: { where: { academicYearId: ciclo.id } },
            },
            orderBy: { createdAt: 'asc' },
        }),
        pagadoAlPersonal(prisma, ciclo.id, personalId),
    ]);
    const nomina = nominaDe(ajustes, ciclo);
    const inicio = ymd(ciclo.startDate)!;
    const cierre = ymd(ciclo.endDate)!;
    const filas = personas.map((p: any) => {
        const fila = p.acuerdos[0] ?? null;
        const cuentas = fila
            ? estadoDelPersonal(pagosDelPersonal({ acuerdo: acuerdoDe(fila), nomina, inicio, cierre }), pagado.get(p.id) ?? new Map(), hoy)
            : null;
        return { persona: p, acuerdo: fila, cuentas };
    });
    return { nomina, ajustes, filas };
}

const personaParaLaPantalla = (x: any) => ({
    id: x.persona.id,
    nombre: nombreDePersona(x.persona),
    cedula: x.persona.user?.id ?? x.persona.cedula ?? null,
    cargo: x.persona.cargo,
    conCuenta: Boolean(x.persona.userId),
    activo: x.persona.activo && (x.persona.user ? x.persona.user.isActive : true),
    seQuedaParaProximosCiclos: x.persona.seQuedaParaProximosCiclos,
    notas: x.persona.notas,
    acuerdo: x.acuerdo
        ? {
              monto: x.acuerdo.monto.toString(),
              frecuencia: x.acuerdo.frecuencia,
              diaDePago: x.acuerdo.diaDePago,
              fechaUnica: ymd(x.acuerdo.fechaUnica),
              cobraEnVacaciones: x.acuerdo.cobraEnVacaciones,
              bonoVacacional: x.acuerdo.bonoVacacional?.toString() ?? null,
              fechaBono: ymd(x.acuerdo.fechaBono),
          }
        : null,
    resumen: x.cuentas
        ? {
              total: deCentimos(x.cuentas.totalCents),
              pagado: deCentimos(x.cuentas.pagadoCents),
              pendiente: deCentimos(x.cuentas.pendienteCents),
              vencido: deCentimos(x.cuentas.vencidoCents),
              proximo: x.cuentas.proximo
                  ? { clave: x.cuentas.proximo.clave, etiqueta: x.cuentas.proximo.etiqueta, fecha: x.cuentas.proximo.fecha, falta: deCentimos(x.cuentas.proximo.pendienteCents) }
                  : null,
          }
        : null,
});

const pagosParaLaPantalla = (cuentas: any) =>
    (cuentas?.pagos ?? []).map((p: any) => ({
        clave: p.clave,
        etiqueta: p.etiqueta,
        fecha: p.fecha,
        tipo: p.tipo,
        vacaciones: p.vacaciones,
        monto: deCentimos(p.montoCents),
        pagado: deCentimos(p.pagadoCents),
        pendiente: deCentimos(p.pendienteCents),
        estado: p.estado,
    }));

const nominaParaLaPantalla = (n: Nomina, ajustes: any) => ({
    diaDePago: n.diaDePago,
    mesesDeVacaciones: n.mesesDeVacaciones,
    cobraEnVacaciones: n.cobraEnVacaciones,
    bonoVacacional: deCentimos(n.bonoCents),
    fechaBono: n.fechaBono,
    guardada: Boolean(ajustes),
});

// ─── El resumen: fondos disponibles y el ciclo mes a mes ────────────────────

/** GET /api/finanzas/resumen?academicYearId= */
export async function getResumen(request: FastifyRequest<{ Querystring: { academicYearId?: string } }>, reply: FastifyReply) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return;
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
        if (!(await moduloActivo(request, reply))) return;
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
        if (!delLiceo) return;
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

// ─── Fondos ─────────────────────────────────────────────────────────────────

const CONCEPTOS_DE_FONDO = ['SALDO_INICIAL', 'DONACION', 'OTRO'];

/** GET /api/finanzas/fondos?academicYearId= — los del ciclo (por fecha). */
export async function getFondos(request: FastifyRequest<{ Querystring: { academicYearId?: string } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return;
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
        if (!(await moduloActivo(request, reply))) return;
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

async function anular(request: FastifyRequest<{ Params: { id: string }; Body: { motivo?: string } }>, reply: FastifyReply, modelo: 'fondoDelLiceo' | 'gasto', entidad: string) {
    if (!(await moduloActivo(request, reply))) return;
    const motivo = limpio(request.body?.motivo, 200);
    if (!motivo || motivo.length < 3) return reply.status(400).send({ error: 'Indica el motivo de la anulación', code: 'MOTIVO_REQUERIDO' });
    const hecho = await prismaDe(request)[modelo].updateMany({
        where: { id: request.params.id, anuladoEn: null },
        data: { anuladoEn: new Date(), anuladoPorId: idDe(request), motivoAnulacion: motivo },
    });
    if (hecho.count === 0) return reply.status(404).send({ error: 'No existe o ya está anulado' });
    await bitacora(request, ActionType.UPDATE, entidad, request.params.id, { anulado: true, motivo }, 'SECURITY');
    return reply.send({ message: 'Anulado' });
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
        if (!(await moduloActivo(request, reply))) return;
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
        if (!(await moduloActivo(request, reply))) return;
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
        if (!(await moduloActivo(request, reply))) return;
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
        if (!(await moduloActivo(request, reply))) return;
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
        if (!(await moduloActivo(request, reply))) return;
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

// ─── El personal ────────────────────────────────────────────────────────────

/** GET /api/finanzas/personal?academicYearId= — todos, con lo acordado y lo que se les debe. */
export async function getPersonal(request: FastifyRequest<{ Querystring: { academicYearId?: string } }>, reply: FastifyReply) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return;
        const prisma = prismaDe(request);
        const ciclo = await elCiclo(request);
        const traidos = await prepararLaNomina(prisma, ciclo);
        const { nomina, ajustes, filas } = await cuentasDeLaNomina(prisma, ciclo, await hoyDelLiceo(prisma));
        return reply.send({
            academicYear: { id: ciclo.id, name: ciclo.name, startDate: ymd(ciclo.startDate), endDate: ymd(ciclo.endDate) },
            closed: estaCerrado(ciclo),
            currency: config.baseCurrency,
            methods: config.methods,
            nomina: nominaParaLaPantalla(nomina, ajustes),
            traidos,
            personas: filas.map(personaParaLaPantalla).sort((a: any, b: any) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es')),
        });
    } catch (error) {
        return responder(reply, error, 'Error al leer el personal');
    }
}

/** GET /api/finanzas/personal/:id?academicYearId= — su ficha: lo acordado, lo que se le debe y lo pagado. */
export async function getPersona(request: FastifyRequest<{ Params: { id: string }; Querystring: { academicYearId?: string } }>, reply: FastifyReply) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return;
        const prisma = prismaDe(request);
        const ciclo = await elCiclo(request);
        const { nomina, ajustes, filas } = await cuentasDeLaNomina(prisma, ciclo, await hoyDelLiceo(prisma), request.params.id);
        const x = filas[0];
        if (!x) return reply.status(404).send({ error: 'No encontrado' });
        const pagos = await prisma.pagoAlPersonal.findMany({
            where: { personalId: x.persona.id, academicYearId: ciclo.id },
            include: { asignaciones: true },
            orderBy: [{ fecha: 'desc' }, { numero: 'desc' }],
        });
        const etiqueta = new Map((x.cuentas?.pagos ?? []).map((p: any) => [p.clave, p.etiqueta]));
        return reply.send({
            academicYear: { id: ciclo.id, name: ciclo.name },
            closed: estaCerrado(ciclo),
            currency: config.baseCurrency,
            methods: config.methods,
            acceptedCurrencies: config.acceptedCurrencies,
            nomina: nominaParaLaPantalla(nomina, ajustes),
            persona: personaParaLaPantalla(x),
            debidos: pagosParaLaPantalla(x.cuentas),
            pagos: pagos.map((p: any) => ({
                id: p.id,
                numero: p.numero,
                fecha: ymd(p.fecha),
                metodo: p.metodo,
                referencia: p.referencia,
                moneda: p.moneda,
                monto: p.monto.toString(),
                montoBase: p.montoBase.toString(),
                anulado: Boolean(p.anuladoEn),
                motivoAnulacion: p.motivoAnulacion,
                asignaciones: p.asignaciones.map((a: any) => ({ clave: a.clave, etiqueta: etiqueta.get(a.clave) ?? a.clave, monto: a.montoBase.toString() })),
            })),
        });
    } catch (error) {
        return responder(reply, error, 'Error al leer la ficha');
    }
}

/** POST /api/finanzas/personal — otra persona (sin cuenta): la limpieza, el vigilante… */
export async function crearPersona(request: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return;
        const b: any = request.body ?? {};
        const nombre = limpio(b.nombre, 120);
        const cargo = limpio(b.cargo, 60);
        if (!nombre || nombre.length < 3) return reply.status(400).send({ error: 'Escribe su nombre', code: 'NOMBRE_REQUERIDO' });
        if (!cargo || cargo.length < 2) return reply.status(400).send({ error: 'Escribe su cargo (p. ej. Vigilante)', code: 'CARGO_REQUERIDO' });
        const persona = await prismaDe(request).personal.create({
            data: { nombre, cargo, cedula: limpio(b.cedula, 20), notas: limpio(b.notas, 300), seQuedaParaProximosCiclos: b.seQuedaParaProximosCiclos !== false },
            select: { id: true },
        });
        await bitacora(request, ActionType.CREATE, 'PERSONAL', persona.id, { nombre, cargo });
        return reply.status(201).send({ persona });
    } catch (error) {
        return responder(reply, error, 'Error al agregar a la persona');
    }
}

/** PUT /api/finanzas/personal/:id — cargo, activo, guardar para próximos ciclos (y el nombre, si no tiene cuenta). */
export async function editarPersona(request: FastifyRequest<{ Params: { id: string }; Body: any }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return;
        const prisma = prismaDe(request);
        const b: any = request.body ?? {};
        const actual = await prisma.personal.findUnique({ where: { id: request.params.id } });
        if (!actual) return reply.status(404).send({ error: 'No encontrado' });
        const data: any = {};
        if (b.cargo !== undefined) {
            const cargo = limpio(b.cargo, 60);
            if (!cargo || cargo.length < 2) return reply.status(400).send({ error: 'Escribe su cargo', code: 'CARGO_REQUERIDO' });
            data.cargo = cargo;
        }
        // El nombre y la cédula de quien tiene cuenta los cambia Usuarios, no esto.
        if (!actual.userId) {
            if (b.nombre !== undefined) {
                const nombre = limpio(b.nombre, 120);
                if (!nombre || nombre.length < 3) return reply.status(400).send({ error: 'Escribe su nombre', code: 'NOMBRE_REQUERIDO' });
                data.nombre = nombre;
            }
            if (b.cedula !== undefined) data.cedula = limpio(b.cedula, 20);
        }
        if (typeof b.activo === 'boolean') data.activo = b.activo;
        if (typeof b.seQuedaParaProximosCiclos === 'boolean') data.seQuedaParaProximosCiclos = b.seQuedaParaProximosCiclos;
        if (b.notas !== undefined) data.notas = limpio(b.notas, 300);
        await prisma.personal.update({ where: { id: actual.id }, data });
        await bitacora(request, ActionType.UPDATE, 'PERSONAL', actual.id, data);
        return reply.send({ ok: true });
    } catch (error) {
        return responder(reply, error, 'Error al guardar');
    }
}

/** PUT /api/finanzas/personal/:id/acuerdo?academicYearId= — cuánto, cada cuánto, qué día, sus vacaciones. */
export async function guardarAcuerdo(request: FastifyRequest<{ Params: { id: string }; Querystring: { academicYearId?: string }; Body: any }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return;
        const prisma = prismaDe(request);
        const ciclo = await elCiclo(request);
        if (estaCerrado(ciclo)) return reply.status(409).send(CICLO_CERRADO);
        const persona = await prisma.personal.findUnique({ where: { id: request.params.id }, select: { id: true } });
        if (!persona) return reply.status(404).send({ error: 'No encontrado' });
        const a = validarAcuerdo(request.body);
        const datos = {
            monto: deCentimos(a.montoCents),
            frecuencia: a.frecuencia,
            diaDePago: a.diaDePago,
            fechaUnica: a.fechaUnica ? fechaDB(a.fechaUnica) : null,
            cobraEnVacaciones: a.cobraEnVacaciones,
            bonoVacacional: a.bonoCents == null ? null : deCentimos(a.bonoCents),
            fechaBono: a.fechaBono ? fechaDB(a.fechaBono) : null,
        };
        // Cambiar cada cuánto con pagos hechos dejaría esos pagos en claves que
        // ya no existen: nadie sabría qué se pagó (como en Pagos).
        const antes = await prisma.acuerdoDePago.findUnique({ where: { personalId_academicYearId: { personalId: persona.id, academicYearId: ciclo.id } } });
        if (antes && antes.frecuencia !== a.frecuencia) {
            const hayPagos = await prisma.pagoAlPersonal.count({ where: { personalId: persona.id, academicYearId: ciclo.id, anuladoEn: null } });
            if (hayPagos) return reply.status(409).send({ error: 'Ya tiene pagos en este ciclo: no se puede cambiar cada cuánto se le paga', code: 'FRECUENCIA_BLOQUEADA' });
        }
        await prisma.acuerdoDePago.upsert({
            where: { personalId_academicYearId: { personalId: persona.id, academicYearId: ciclo.id } },
            create: { personalId: persona.id, academicYearId: ciclo.id, ...datos },
            update: datos,
        });
        await bitacora(request, ActionType.UPDATE, 'ACUERDO_DE_PAGO', persona.id, { ciclo: ciclo.id, ...datos });
        return reply.send({ ok: true });
    } catch (error) {
        return responder(reply, error, 'Error al guardar lo acordado');
    }
}

/** PUT /api/finanzas/nomina?academicYearId= — lo del liceo: día de pago de todos, vacaciones, bono. */
export async function guardarNomina(request: FastifyRequest<{ Querystring: { academicYearId?: string }; Body: any }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return;
        const prisma = prismaDe(request);
        const ciclo = await elCiclo(request);
        if (estaCerrado(ciclo)) return reply.status(409).send(CICLO_CERRADO);
        const n = validarNomina(request.body);
        const datos = {
            diaDePago: n.diaDePago,
            mesesDeVacaciones: n.mesesDeVacaciones,
            cobraEnVacaciones: n.cobraEnVacaciones,
            bonoVacacional: deCentimos(n.bonoCents),
            fechaBono: n.fechaBono ? fechaDB(n.fechaBono) : null,
            updatedById: idDe(request),
        };
        await prisma.ajustesDeNomina.upsert({ where: { academicYearId: ciclo.id }, create: { academicYearId: ciclo.id, ...datos }, update: datos });
        await bitacora(request, ActionType.UPDATE, 'AJUSTES_DE_NOMINA', ciclo.id, datos);
        return reply.send({ ok: true });
    } catch (error) {
        return responder(reply, error, 'Error al guardar la nómina');
    }
}

/**
 * POST /api/finanzas/nomina/a-todos?academicYearId= — el mismo sueldo para
 * todos los que se elijan (por defecto, los que aún no tienen). Lo personal de
 * cada uno (su día, sus vacaciones) se respeta.
 */
export async function aplicarATodos(request: FastifyRequest<{ Querystring: { academicYearId?: string }; Body: any }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return;
        const prisma = prismaDe(request);
        const ciclo = await elCiclo(request);
        if (estaCerrado(ciclo)) return reply.status(409).send(CICLO_CERRADO);
        const b: any = request.body ?? {};
        const a = validarAcuerdo({ ...b, fechaUnica: b.fechaUnica });
        if (a.frecuencia === 'UNICO') return reply.status(400).send({ error: 'Para todos: mensual o quincenal', code: 'FRECUENCIA_INVALIDA' });
        const ids: string[] = Array.isArray(b.personalIds) ? b.personalIds.map(String).slice(0, 500) : [];
        if (!ids.length) return reply.status(400).send({ error: 'Elige a quién se le aplica', code: 'SIN_PERSONAS' });
        const personas = await prisma.personal.findMany({ where: { id: { in: ids }, activo: true }, select: { id: true } });
        let hechos = 0;
        for (const p of personas) {
            const antes = await prisma.acuerdoDePago.findUnique({ where: { personalId_academicYearId: { personalId: p.id, academicYearId: ciclo.id } } });
            if (antes && antes.frecuencia !== a.frecuencia) {
                const hayPagos = await prisma.pagoAlPersonal.count({ where: { personalId: p.id, academicYearId: ciclo.id, anuladoEn: null } });
                if (hayPagos) continue;
            }
            await prisma.acuerdoDePago.upsert({
                where: { personalId_academicYearId: { personalId: p.id, academicYearId: ciclo.id } },
                create: { personalId: p.id, academicYearId: ciclo.id, monto: deCentimos(a.montoCents), frecuencia: a.frecuencia },
                update: { monto: deCentimos(a.montoCents), frecuencia: a.frecuencia },
            });
            hechos++;
        }
        await bitacora(request, ActionType.UPDATE, 'ACUERDO_DE_PAGO', ciclo.id, { aTodos: true, personas: hechos, monto: deCentimos(a.montoCents), frecuencia: a.frecuencia });
        return reply.send({ aplicados: hechos, saltados: ids.length - hechos });
    } catch (error) {
        return responder(reply, error, 'Error al aplicar');
    }
}

// ─── Pagar al personal ──────────────────────────────────────────────────────

/** POST /api/finanzas/personal/:id/pagos?academicYearId= */
export async function pagarAlPersonal(request: FastifyRequest<{ Params: { id: string }; Querystring: { academicYearId?: string }; Body: any }>, reply: FastifyReply) {
    try {
        const delLiceo = await moduloActivo(request, reply);
        if (!delLiceo) return;
        const prisma = prismaDe(request);
        const ciclo = await elCiclo(request);
        if (estaCerrado(ciclo)) return reply.status(409).send(CICLO_CERRADO);
        const b: any = request.body ?? {};
        const hoy = await hoyDelLiceo(prisma);
        const fecha = validarFecha(b.fecha, 'la fecha del pago');
        if (fecha > hoy) return reply.status(400).send({ error: 'La fecha del pago no puede ser futura', code: 'FECHA_FUTURA' });
        const config = await configuracionDelCiclo(prisma, ciclo.id, delLiceo);
        if (!config.methods.includes(b.metodo)) return reply.status(400).send({ error: 'Método de pago no configurado', code: 'METODO_INVALIDO' });
        const d = await dineroDe(prisma, b);
        const claves = [...new Set((Array.isArray(b.claves) ? b.claves : []).map(String))];
        if (!claves.length) return reply.status(400).send({ error: 'Elige qué se le paga', code: 'SIN_CLAVES' });

        const personalId = request.params.id;
        const pago = await prisma.$transaction(async (tx: any) => {
            // Dos personas pagándole a la vez lo mismo: la segunda espera y ve lo ya pagado.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`personal:${personalId}`}))`;
            const { filas } = await cuentasDeLaNomina(tx, ciclo, hoy, personalId);
            const x = filas[0];
            if (!x) throw fallo(404, 'No encontrado', 'NO_ENCONTRADO');
            if (!x.cuentas) throw fallo(409, 'No tiene nada acordado en este ciclo: ponle su sueldo primero', 'SIN_ACUERDO');
            const porClave = new Map(x.cuentas.pagos.map((p: any) => [p.clave, p]));
            const elegidos = claves.map((k) => porClave.get(k));
            if (elegidos.some((p) => !p)) throw fallo(400, 'Algún pago elegido no existe', 'CLAVE_DESCONOCIDA');
            if (elegidos.some((p: any) => p.pendienteCents === 0)) throw fallo(409, 'Algún pago elegido ya está pagado', 'YA_PAGADO');
            const falta = elegidos.reduce((t: number, p: any) => t + p.pendienteCents, 0);
            if (d.baseCents > falta) throw fallo(400, `El monto supera lo que falta de esos pagos (${deCentimos(falta)} ${d.base})`, 'MONTO_DE_MAS');
            const reparto = repartirAlPersonal(d.baseCents, elegidos as any);
            return tx.pagoAlPersonal.create({
                data: {
                    personalId,
                    academicYearId: ciclo.id,
                    fecha: fechaDB(fecha),
                    metodo: b.metodo,
                    referencia: limpio(b.referencia, 60),
                    notas: limpio(b.notas, 200),
                    moneda: d.moneda,
                    monto: deCentimos(d.montoCents),
                    tasa: d.tasa,
                    montoBase: deCentimos(d.baseCents),
                    creadoPorId: idDe(request),
                    asignaciones: { create: reparto.map((r) => ({ clave: r.clave, montoBase: deCentimos(r.montoCents) })) },
                },
                select: { id: true, numero: true },
            });
        });
        await bitacora(request, ActionType.CREATE, 'PAGO_AL_PERSONAL', pago.id, { personalId, montoBase: deCentimos(d.baseCents), claves });
        return reply.status(201).send({ pago });
    } catch (error) {
        return responder(reply, error, 'Error al registrar el pago');
    }
}

/** POST /api/finanzas/pagos-al-personal/:id/anular */
export async function anularPagoAlPersonal(request: FastifyRequest<{ Params: { id: string }; Body: { motivo?: string } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return;
        const prisma = prismaDe(request);
        const motivo = limpio(request.body?.motivo, 200);
        if (!motivo || motivo.length < 3) return reply.status(400).send({ error: 'Indica el motivo de la anulación', code: 'MOTIVO_REQUERIDO' });
        const pago = await prisma.pagoAlPersonal.findUnique({ where: { id: request.params.id }, select: { id: true, personalId: true, anuladoEn: true, academicYear: { select: { status: true } } } });
        if (!pago || pago.anuladoEn) return reply.status(404).send({ error: 'No existe o ya está anulado' });
        if (estaCerrado(pago.academicYear)) return reply.status(409).send(CICLO_CERRADO);
        const hecho = await prisma.$transaction(async (tx: any) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`personal:${pago.personalId}`}))`;
            return tx.pagoAlPersonal.updateMany({ where: { id: pago.id, anuladoEn: null }, data: { anuladoEn: new Date(), anuladoPorId: idDe(request), motivoAnulacion: motivo } });
        });
        if (hecho.count === 0) return reply.status(404).send({ error: 'No existe o ya está anulado' });
        await bitacora(request, ActionType.UPDATE, 'PAGO_AL_PERSONAL', pago.id, { anulado: true, motivo }, 'SECURITY');
        return reply.send({ message: 'Pago anulado' });
    } catch (error) {
        return responder(reply, error, 'Error al anular');
    }
}

/**
 * GET /api/finanzas/pagos-al-personal/:id/recibo — para imprimir. El admin, o
 * la persona a la que se le pagó (su propio recibo, nada más).
 */
export async function getReciboDelPersonal(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return;
        const prisma = prismaDe(request);
        const pago = await prisma.pagoAlPersonal.findUnique({
            where: { id: request.params.id },
            include: { asignaciones: true, academicYear: true, personal: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
        });
        const esSuyo = pago?.personal.userId && pago.personal.userId === idDe(request);
        if (!pago || ((request.user as any)?.role !== UserRole.ADMIN && !esSuyo)) return reply.status(404).send({ error: 'No encontrado' });
        const { filas } = await cuentasDeLaNomina(prisma, pago.academicYear, await hoyDelLiceo(prisma), pago.personalId);
        const etiqueta = new Map((filas[0]?.cuentas?.pagos ?? []).map((p: any) => [p.clave, p.etiqueta]));
        return reply.send({
            institute: { name: request.institute?.name ?? '' },
            numero: pago.numero,
            persona: { nombre: nombreDePersona(pago.personal), cedula: pago.personal.user?.id ?? pago.personal.cedula ?? null, cargo: pago.personal.cargo },
            ciclo: pago.academicYear.name,
            fecha: ymd(pago.fecha),
            metodo: pago.metodo,
            referencia: pago.referencia,
            moneda: pago.moneda,
            monto: pago.monto.toString(),
            tasa: pago.tasa?.toString() ?? null,
            monedaBase: config.baseCurrency,
            montoBase: pago.montoBase.toString(),
            anulado: Boolean(pago.anuladoEn),
            motivoAnulacion: pago.motivoAnulacion,
            asignaciones: pago.asignaciones.map((a: any) => ({ etiqueta: etiqueta.get(a.clave) ?? a.clave, monto: a.montoBase.toString() })),
        });
    } catch (error) {
        return responder(reply, error, 'Error al leer el recibo');
    }
}

// ─── Mis pagos (el profesor: SOLO lo suyo) ──────────────────────────────────

/** GET /api/finanzas/mis-pagos?academicYearId= */
export async function getMisPagos(request: FastifyRequest<{ Querystring: { academicYearId?: string } }>, reply: FastifyReply) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return;
        const prisma = prismaDe(request);
        const persona = await prisma.personal.findUnique({ where: { userId: idDe(request) }, select: { id: true } });
        if (!persona) return reply.send({ tiene: false });
        const ciclo = await elCiclo(request);
        const { nomina, ajustes, filas } = await cuentasDeLaNomina(prisma, ciclo, await hoyDelLiceo(prisma), persona.id);
        const x = filas[0];
        if (!x?.acuerdo) return reply.send({ tiene: false });
        const pagos = await prisma.pagoAlPersonal.findMany({
            where: { personalId: persona.id, academicYearId: ciclo.id, anuladoEn: null },
            include: { asignaciones: true },
            orderBy: [{ fecha: 'desc' }, { numero: 'desc' }],
        });
        const etiqueta = new Map((x.cuentas?.pagos ?? []).map((p: any) => [p.clave, p.etiqueta]));
        const p = personaParaLaPantalla(x);
        return reply.send({
            tiene: true,
            academicYear: { id: ciclo.id, name: ciclo.name, startDate: ymd(ciclo.startDate), endDate: ymd(ciclo.endDate) },
            currency: config.baseCurrency,
            nomina: { mesesDeVacaciones: nomina.mesesDeVacaciones, guardada: Boolean(ajustes) },
            persona: { nombre: p.nombre, cargo: p.cargo, acuerdo: p.acuerdo, resumen: p.resumen },
            debidos: pagosParaLaPantalla(x.cuentas),
            pagos: pagos.map((q: any) => ({
                id: q.id,
                numero: q.numero,
                fecha: ymd(q.fecha),
                metodo: q.metodo,
                montoBase: q.montoBase.toString(),
                asignaciones: q.asignaciones.map((a: any) => ({ etiqueta: etiqueta.get(a.clave) ?? a.clave, monto: a.montoBase.toString() })),
            })),
        });
    } catch (error) {
        return responder(reply, error, 'Error al leer tus pagos');
    }
}
