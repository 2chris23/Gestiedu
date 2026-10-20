import { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { UserRole, ActionType } from '../utils/prisma-enums';
import { logger } from '../utils/logger';
import { aCentimos, aMonedaBase, Moneda } from '../services/pagos.service';
import {
    cicloActivo,
    estaCerrado,
    leerConfiguracion,
    moduloActivo,
} from './pagos.controller';
import {
    Acuerdo,
    estadoDelPersonal,
    limpio,
    mesesEntre,
    Nomina,
    pagosDelPersonal,
    validarMonto,
} from '../services/finanzas.service';
import { FotoNoValida } from '../services/foto-de-perfil.service';
import { avisarSiFalla } from '../utils/sin-callar';

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

export const idDe = (r: FastifyRequest) => (r.user as any)?.userId ?? (r.user as any)?.id;
export const prismaDe = (r: FastifyRequest) => r.tenantPrisma as any;

export function responder(reply: FastifyReply, error: any, porDefecto: string) {
    if (error instanceof FotoNoValida) return reply.status(400).send({ error: error.message, code: 'COMPROBANTE_INVALIDO' });
    if (error?.statusCode) return reply.status(error.statusCode).send({ error: error.message, code: error.code });
    logger.error(porDefecto, { error: error instanceof Error ? error.message : String(error) });
    return reply.status(500).send({ error: porDefecto });
}

export const fallo = (status: number, error: string, code: string) => Object.assign(new Error(error), { statusCode: status, code });

export async function bitacora(request: FastifyRequest, action: string, entity: string, entityId: string, newValues: any, level?: string) {
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
        .catch(avisarSiFalla('finanzas.controller'));
}

/** El dinero que manda la pantalla: monto, moneda y tasa → céntimos en la moneda base. */
export async function dineroDe(prisma: any, b: any) {
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

export const ymd = (d: Date | string | null | undefined) => (d ? (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : null);
export const fechaDB = (t: string) => new Date(`${t}T00:00:00Z`);

export async function elCiclo(request: FastifyRequest<{ Querystring: { academicYearId?: string } }>) {
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

export const nombreDePersona = (p: any) => (p.user ? `${p.user.firstName} ${p.user.lastName}` : p.nombre ?? 'Sin nombre');

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
export async function prepararLaNomina(prisma: any, ciclo: any): Promise<{ traidos: number; desde: string | null }> {
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

export async function cuentasDeLaNomina(prisma: any, ciclo: any, hoy: string, personalId?: string) {
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

export async function anular(request: FastifyRequest<{ Params: { id: string }; Body: { motivo?: string } }>, reply: FastifyReply, modelo: 'fondoDelLiceo' | 'gasto', entidad: string) {
    if (!(await moduloActivo(request, reply))) return reply;
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