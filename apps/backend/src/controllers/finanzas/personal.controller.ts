import { idDe, prismaDe, responder, fallo, bitacora, dineroDe, ymd, fechaDB, elCiclo, nombreDePersona, prepararLaNomina, cuentasDeLaNomina } from '../finanzas.controller';
import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole, ActionType } from '../../utils/prisma-enums';
import { deCentimos } from '../../services/pagos.service';
import {
    CICLO_CERRADO,
    configuracionDelCiclo,
    estaCerrado,
    hoyDelLiceo,
    moduloActivo,
} from '../pagos.controller';
import {
    limpio,
    Nomina,
    repartirAlPersonal,
    validarAcuerdo,
    validarFecha,
    validarNomina,
} from '../../services/finanzas.service';

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

/**
 * Las áreas del personal (2026-10-14): «Profesor» primero, siempre; luego las
 * que creó el admin y las de los cargos que ya existen (un «Vigilante» de
 * antes sale como su área aunque nadie la haya creado).
 */
const AREA_DE_LOS_PROFESORES = 'Profesor';

async function areasDelPersonal(prisma: any, cargos: string[] = []): Promise<string[]> {
    const fila = await prisma.paymentSettings.findUnique({ where: { id: 'liceo' }, select: { areasDelPersonal: true } });
    const creadas = Array.isArray(fila?.areasDelPersonal) ? (fila.areasDelPersonal as unknown[]).map(String) : [];
    const vistas = new Set<string>([AREA_DE_LOS_PROFESORES.toLowerCase()]);
    const lista = [AREA_DE_LOS_PROFESORES];
    for (const a of [...creadas, ...cargos]) {
        const clave = a.trim().toLowerCase();
        if (!clave || vistas.has(clave)) continue;
        vistas.add(clave);
        lista.push(a.trim());
    }
    return lista;
}

/** PUT /api/finanzas/areas — las áreas que crea el admin (Cocina, Limpieza…). */
export async function guardarAreas(request: FastifyRequest<{ Body: { areas?: unknown[] } }>, reply: FastifyReply) {
    try {
        if (!(await moduloActivo(request, reply))) return reply;
        const vistas = new Set<string>();
        const lista: string[] = [];
        for (const a of request.body?.areas ?? []) {
            const area = limpio(a, 40);
            if (!area || area.length < 2) return reply.status(400).send({ error: 'Cada área lleva un nombre de 2 letras o más', code: 'AREA_INVALIDA' });
            const clave = area.toLowerCase();
            // «Profesor» va siempre: no se guarda ni se puede quitar.
            if (clave === AREA_DE_LOS_PROFESORES.toLowerCase() || clave === 'profesores' || vistas.has(clave)) continue;
            vistas.add(clave);
            lista.push(area);
        }
        if (lista.length > 30) return reply.status(400).send({ error: 'Como mucho 30 áreas', code: 'AREAS_DE_MAS' });
        const prisma = prismaDe(request);
        await prisma.paymentSettings.upsert({ where: { id: 'liceo' }, create: { id: 'liceo', areasDelPersonal: lista }, update: { areasDelPersonal: lista } });
        await bitacora(request, ActionType.UPDATE, 'AREAS_DEL_PERSONAL', 'liceo', { areas: lista });
        return reply.send({ areas: await areasDelPersonal(prisma) });
    } catch (error) {
        return responder(reply, error, 'Error al guardar las áreas');
    }
}

// ─── El personal ────────────────────────────────────────────────────────────

/** GET /api/finanzas/personal?academicYearId= — todos, con lo acordado y lo que se les debe. */
export async function getPersonal(request: FastifyRequest<{ Querystring: { academicYearId?: string } }>, reply: FastifyReply) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return reply;
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
            areas: await areasDelPersonal(prisma, filas.map((x: any) => String(x.persona.cargo ?? ''))),
        });
    } catch (error) {
        return responder(reply, error, 'Error al leer el personal');
    }
}

/** GET /api/finanzas/personal/:id?academicYearId= — su ficha: lo acordado, lo que se le debe y lo pagado. */
export async function getPersona(request: FastifyRequest<{ Params: { id: string }; Querystring: { academicYearId?: string } }>, reply: FastifyReply) {
    try {
        const config = await moduloActivo(request, reply);
        if (!config) return reply;
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
        if (!(await moduloActivo(request, reply))) return reply;
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
        if (!(await moduloActivo(request, reply))) return reply;
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
        if (!(await moduloActivo(request, reply))) return reply;
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
        if (!(await moduloActivo(request, reply))) return reply;
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
        if (!(await moduloActivo(request, reply))) return reply;
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
        // Lo de antes y quién tiene pagos, de una vez (antes, dos consultas por persona).
        const personalIds = personas.map((p: any) => p.id as string);
        const [acuerdos, conPagos] = await Promise.all([
            prisma.acuerdoDePago.findMany({ where: { personalId: { in: personalIds }, academicYearId: ciclo.id }, select: { personalId: true, frecuencia: true } }),
            prisma.pagoAlPersonal.groupBy({ by: ['personalId'], where: { personalId: { in: personalIds }, academicYearId: ciclo.id, anuladoEn: null } }),
        ]);
        const frecuenciaDe = new Map(acuerdos.map((x: any) => [x.personalId, x.frecuencia]));
        const tienePagos = new Set(conPagos.map((x: any) => x.personalId));
        for (const p of personas) {
            const antes = frecuenciaDe.get(p.id);
            if (antes && antes !== a.frecuencia && tienePagos.has(p.id)) continue;
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
        if (!delLiceo) return reply;
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
        if (!(await moduloActivo(request, reply))) return reply;
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
        if (!config) return reply;
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
        if (!config) return reply;
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
