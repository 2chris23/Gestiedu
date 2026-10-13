import { Prisma } from '@prisma/client';
import { createError } from '../middleware/error.middleware';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { borrarGuardandoCopia } from '../utils/papelera';
import { InstrumentoInvalido, maximoDelInstrumento, notaDelInstrumento, validarInstrumento, type Instrumento, type Marcas } from '../utils/instrumentos';
import { getAcademicConfig, type AcademicConfig } from './promotion/close-cycle.service';
import { laPendiente, puedeEvaluar, recalcular, notaDelLiceo, revisarNota, validarLaOpcion, losAfectados, type QuienPide } from './materias-pendientes.service';

/**
 * LA CLASE DE PENDIENTES COMO UNA CLASE DE VERDAD (octubre 2026)
 *
 * Lo que la hace «igual que las clases normales, pero distinta» (Cristian):
 *
 *   - EL PLAN, momento a momento (`EvaluacionDelMomento`): qué se evalúa,
 *     cuánto pesa (las de un momento suman 100) y con qué instrumento (la
 *     misma cuenta de la clase: `utils/instrumentos.ts`). Sin plan, la nota de
 *     cada opción va a mano: es el estilo de cada profesor.
 *   - LAS NOTAS DEL PLAN (`NotaDePendiente`), por alumno y opción. Con todas
 *     las del momento puestas, la nota de esa opción sale sola (Σ nota × peso
 *     ÷ 100, con el redondeo del liceo) y sigue la cuenta de la pendiente.
 *   - LOS ENCUENTROS (`EncuentroDePendiente`): tutorías y evaluaciones, con
 *     fecha, hora y aula, y su asistencia (presente, ausente, justificado). De
 *     ahí sale el acta de presentación (circular 000004: la lista completa,
 *     la firma de cada uno, «IN» al que faltó). Faltar a la evaluación de una
 *     opción la marca como no presentada, como lo dice el acta.
 *
 * Lo hacen el profesor de la clase y el admin; el servidor lo exige.
 * Pruebas: `plan-de-pendientes.test.ts` (PEND-17…).
 */

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** La clase, si quien pide es su profesor o el admin. */
async function laClase(prisma: any, quien: QuienPide, claseId: string) {
    const clase = await prisma.classroomSubject.findUnique({
        where: { id: claseId },
        select: { id: true, teacherId: true, classroom: { select: { academicYear: { select: { status: true } } } } },
    });
    if (!clase) throw createError(404, 'Clase no encontrada', 'NOT_FOUND');
    if (quien.role !== 'ADMIN' && !(quien.role === 'TEACHER' && clase.teacherId === quien.id)) {
        throw createError(403, 'El plan y los encuentros de las pendientes los lleva el profesor de la clase', 'FORBIDDEN');
    }
    if (clase.classroom.academicYear.status === 'COMPLETED') throw createError(409, 'El año escolar ya se cerró', 'CICLO_CERRADO');
    return clase;
}

/** El plan, los encuentros (con su asistencia) y las notas del plan de una clase. */
export async function planYEncuentrosDeLaClase(prisma: any, claseId: string) {
    const [plan, encuentros, notas] = await Promise.all([
        prisma.evaluacionDelMomento.findMany({ where: { claseId }, orderBy: [{ momento: 'asc' }, { orden: 'asc' }, { createdAt: 'asc' }] }),
        prisma.encuentroDePendiente.findMany({
            where: { claseId },
            include: { asistencias: { select: { materiaPendienteId: true, estado: true } } },
            orderBy: [{ fecha: 'asc' }, { hora: 'asc' }, { createdAt: 'asc' }],
        }),
        prisma.notaDePendiente.findMany({
            where: { evaluacion: { claseId } },
            select: { evaluacionId: true, materiaPendienteId: true, opcion: true, nota: true, desglose: true },
        }),
    ]);
    return {
        plan: plan.map((e: any) => ({
            id: e.id,
            momento: e.momento,
            nombre: e.nombre,
            peso: e.peso,
            instrumento: e.instrumento ?? null,
            contenidos: e.contenidos ?? null,
        })),
        encuentros: encuentros.map((e: any) => ({
            id: e.id,
            momento: e.momento,
            tipo: e.tipo as 'TUTORIA' | 'EVALUACION',
            opcion: e.opcion,
            fecha: ymd(e.fecha),
            hora: e.hora,
            aula: e.aula,
            tema: e.tema,
            asistencias: Object.fromEntries(e.asistencias.map((a: any) => [a.materiaPendienteId, a.estado])),
        })),
        notasDelPlan: notas,
    };
}

// ── EL PLAN ────────────────────────────────────────────────────────────────

export interface EvaluacionDelPlan {
    id?: string;
    nombre: string;
    peso: number;
    instrumento?: unknown;
    contenidos?: string | null;
}

/**
 * Rehace las opciones que salen del plan en un momento: con todas las notas
 * de sus evaluaciones, la nota de la opción es la suma ponderada; si falta
 * alguna (o el plan cambió), la que había salido del plan se rehace. Lo puesto
 * a mano no se toca, y no se abre una opción que la cuenta no deja abrir.
 */
async function rehacerDesdeElPlan(tx: any, config: AcademicConfig, claseId: string, momento: number, soloIds?: string[]) {
    const hoy = todayInTimezone(await instituteTimezone(tx));
    const evaluaciones = await tx.evaluacionDelMomento.findMany({ where: { claseId, momento }, select: { id: true, peso: true } });
    const pendientes = await tx.materiaPendiente.findMany({
        where: { claseId, ...(soloIds ? { id: { in: soloIds } } : {}) },
        include: {
            opciones: true,
            evaluaciones: { orderBy: { momento: 'asc' } },
            ciclo: { select: { status: true } },
        },
    });
    if (pendientes.length === 0) return;
    const notas = evaluaciones.length
        ? await tx.notaDePendiente.findMany({
              where: { evaluacionId: { in: evaluaciones.map((e: any) => e.id) }, materiaPendienteId: { in: pendientes.map((p: any) => p.id) } },
              select: { evaluacionId: true, materiaPendienteId: true, opcion: true, nota: true, registradaPorId: true, updatedAt: true },
          })
        : [];
    const afectados = new Set<string>();
    for (const p of pendientes) {
        for (const opcion of [1, 2]) {
            const suyas = notas.filter((n: any) => n.materiaPendienteId === p.id && n.opcion === opcion);
            const puesta = p.opciones.find((o: any) => o.momento === momento && o.opcion === opcion);
            const completa = evaluaciones.length > 0 && evaluaciones.every((e: any) => suyas.some((n: any) => n.evaluacionId === e.id));
            if (completa) {
                if (puesta && !puesta.delPlan) continue; // la puso el profesor a mano: manda
                const nota = notaDelLiceo(config, evaluaciones.reduce((s: number, e: any) => s + suyas.find((n: any) => n.evaluacionId === e.id)!.nota * e.peso, 0) / 100);
                if (puesta && puesta.nota === nota && puesta.asistio) continue;
                if (!puesta) {
                    try {
                        await validarLaOpcion(tx, p, config, momento, opcion);
                    } catch {
                        continue; // el momento aún no se abre para este alumno (o no tiene 2ª): se queda en las notas del plan
                    }
                }
                const ultima = suyas.reduce((a: any, b: any) => (a.updatedAt > b.updatedAt ? a : b));
                const valores = {
                    nota,
                    asistio: true,
                    justificada: false,
                    delPlan: true,
                    fecha: puesta?.fecha ?? new Date(`${hoy}T00:00:00.000Z`),
                    registradaPorId: ultima.registradaPorId ?? null,
                };
                await tx.opcionDePendiente.upsert({
                    where: { materiaPendienteId_momento_opcion: { materiaPendienteId: p.id, momento, opcion } },
                    update: valores,
                    create: { materiaPendienteId: p.id, momento, opcion, ...valores },
                });
                for (const id of await losAfectados(tx, p, config, momento, opcion)) afectados.add(id);
            } else if (puesta?.delPlan) {
                // Salió del plan y el plan ya no está completo: se rehace (las notas siguen en el plan).
                const copia = { motivo: 'el plan del momento ya no está completo' };
                await borrarGuardandoCopia(tx, 'opcionDePendiente', { id: puesta.id }, copia);
                if (opcion === 1) await borrarGuardandoCopia(tx, 'evaluacionDePendiente', { materiaPendienteId: p.id, momento }, copia);
                for (const id of await losAfectados(tx, p, config, momento, opcion)) afectados.add(id);
            }
        }
    }
    if (afectados.size) await recalcular(tx, config, [...afectados]);
}

/**
 * Guarda el plan de un momento: sus evaluaciones con su peso (suman 100) y su
 * instrumento. Quitar una evaluación con notas pide confirmarlo (409
 * `EVALUACION_CON_NOTAS`), como el plan de la clase; se va a la papelera.
 */
export async function guardarPlanDelMomento(
    prisma: any,
    instituteId: string,
    quien: QuienPide,
    claseId: string,
    momento: number,
    evaluaciones: EvaluacionDelPlan[],
    opciones: { confirmar?: boolean } = {}
) {
    await laClase(prisma, quien, claseId);
    const config = await getAcademicConfig(instituteId);
    if (!Number.isInteger(momento) || momento < 1 || momento > config.pendientes.momentos) {
        throw createError(400, `Los momentos van del 1 al ${config.pendientes.momentos}`, 'MOMENTO_INVALIDO');
    }
    if (evaluaciones.length > 10) throw createError(400, 'Hasta 10 evaluaciones por momento', 'PLAN_INVALIDO');
    const limpias = evaluaciones.map((e, i) => {
        const nombre = (e.nombre ?? '').trim();
        if (nombre.length < 1 || nombre.length > 120) throw createError(400, 'Cada evaluación lleva un nombre (hasta 120 letras)', 'PLAN_INVALIDO');
        if (!Number.isInteger(e.peso) || e.peso < 1 || e.peso > 100) throw createError(400, 'El peso de cada evaluación va de 1 a 100', 'PLAN_INVALIDO');
        let instrumento: Instrumento | null = null;
        if (e.instrumento != null) {
            try {
                instrumento = validarInstrumento(e.instrumento);
            } catch (err) {
                if (err instanceof InstrumentoInvalido) throw createError(400, `El instrumento de «${nombre}»: ${err.message}`, 'INSTRUMENTO_INVALIDO');
                throw err;
            }
        }
        const contenidos = e.contenidos?.trim() ? e.contenidos.trim().slice(0, 2000) : null;
        return { id: e.id, nombre, peso: e.peso, instrumento, contenidos, orden: i };
    });
    if (limpias.length > 0 && limpias.reduce((s, e) => s + e.peso, 0) !== 100) {
        throw createError(400, 'Las evaluaciones de un momento suman 100 %', 'PLAN_INVALIDO');
    }
    const antes = await prisma.evaluacionDelMomento.findMany({ where: { claseId, momento }, include: { _count: { select: { notas: true } } } });
    const quedan = new Set(limpias.map((e) => e.id).filter(Boolean));
    const seVan = antes.filter((e: any) => !quedan.has(e.id));
    if (!opciones.confirmar && seVan.some((e: any) => e._count.notas > 0)) {
        throw createError(409, `Quitar «${seVan.find((e: any) => e._count.notas > 0).nombre}» se lleva sus notas: confírmalo`, 'EVALUACION_CON_NOTAS');
    }
    if (limpias.some((e) => e.id && !antes.some((a: any) => a.id === e.id))) throw createError(400, 'Esa evaluación no es de este momento', 'PLAN_INVALIDO');

    await prisma.$transaction(async (tx: any) => {
        for (const e of seVan) {
            await borrarGuardandoCopia(tx, 'evaluacionDelMomento', { id: e.id }, { usuarioId: quien.id, motivo: 'evaluación del plan de pendientes quitada' });
        }
        for (const e of limpias) {
            const datos = { nombre: e.nombre, peso: e.peso, instrumento: e.instrumento ?? undefined, contenidos: e.contenidos, orden: e.orden };
            if (e.id) await tx.evaluacionDelMomento.update({ where: { id: e.id }, data: { ...datos, instrumento: e.instrumento ?? Prisma.DbNull } });
            else await tx.evaluacionDelMomento.create({ data: { claseId, momento, ...datos } });
        }
        await rehacerDesdeElPlan(tx, config, claseId, momento);
    }, { timeout: 30000 });
    return planYEncuentrosDeLaClase(prisma, claseId);
}

/**
 * La nota de un alumno en una evaluación del plan, en una opción. Con
 * instrumento, se marcan sus criterios y la nota sale de ellos (llevada a
 * 20); sin él, la nota directa. Sin nota (null), se quita (a la papelera).
 */
export async function ponerNotaDelPlan(
    prisma: any,
    instituteId: string,
    quien: QuienPide,
    datos: { id: string; evaluacionId: string; opcion: number; nota?: number | null; marcas?: Marcas | null }
) {
    const p = await laPendiente(prisma, datos.id);
    puedeEvaluar(p, quien);
    if (p.ciclo.status === 'COMPLETED') throw createError(409, 'El año escolar ya se cerró', 'CICLO_CERRADO');
    if (datos.opcion !== 1 && datos.opcion !== 2) throw createError(400, 'La opción es la 1ª o la 2ª', 'OPCION_INVALIDA');
    const ev = await prisma.evaluacionDelMomento.findUnique({ where: { id: datos.evaluacionId } });
    if (!ev || ev.claseId !== p.claseId) throw createError(400, 'Esa evaluación no es del plan de su clase', 'EVALUACION_INVALIDA');
    const config = await getAcademicConfig(instituteId);
    await validarLaOpcion(prisma, p, config, ev.momento, datos.opcion);

    let nota: number | null = null;
    let desglose: Marcas | null = null;
    if (ev.instrumento && datos.marcas) {
        const def = ev.instrumento as Instrumento;
        let cruda: number | null;
        try {
            cruda = notaDelInstrumento(def, datos.marcas);
        } catch (err) {
            if (err instanceof InstrumentoInvalido) throw createError(400, err.message, 'MARCAS_INVALIDAS');
            throw err;
        }
        if (cruda == null) throw createError(400, 'Faltan criterios por marcar en el instrumento', 'INSTRUMENTO_INCOMPLETO');
        const maximo = maximoDelInstrumento(def);
        nota = notaDelLiceo(config, maximo > 0 ? (cruda / maximo) * 20 : 0);
        desglose = datos.marcas;
    } else if (datos.nota != null) {
        revisarNota(datos.nota);
        nota = notaDelLiceo(config, datos.nota);
    }

    await prisma.$transaction(async (tx: any) => {
        const clave = { evaluacionId_materiaPendienteId_opcion: { evaluacionId: ev.id, materiaPendienteId: p.id, opcion: datos.opcion } };
        if (nota == null) {
            await borrarGuardandoCopia(tx, 'notaDePendiente', { evaluacionId: ev.id, materiaPendienteId: p.id, opcion: datos.opcion }, {
                usuarioId: quien.id,
                motivo: 'nota del plan de pendientes quitada',
            });
        } else {
            const valores = { nota, desglose: desglose ?? undefined, registradaPorId: quien.id };
            await tx.notaDePendiente.upsert({
                where: clave,
                update: valores,
                create: { evaluacionId: ev.id, materiaPendienteId: p.id, opcion: datos.opcion, ...valores },
            });
        }
        await rehacerDesdeElPlan(tx, config, p.claseId, ev.momento, [p.id]);
    });
    const despues = await prisma.materiaPendiente.findUnique({ where: { id: p.id }, select: { estado: true, notaFinal: true } });
    return { nota, estado: despues.estado, notaFinal: despues.notaFinal };
}

// ── LOS ENCUENTROS Y SU ASISTENCIA ─────────────────────────────────────────

export interface DatosDelEncuentro {
    momento: number;
    tipo: 'TUTORIA' | 'EVALUACION';
    opcion?: number | null;
    fecha: string;
    hora?: string | null;
    aula?: string | null;
    tema?: string | null;
}

function revisarEncuentro(config: AcademicConfig, d: DatosDelEncuentro) {
    if (!Number.isInteger(d.momento) || d.momento < 1 || d.momento > config.pendientes.momentos) {
        throw createError(400, `Los momentos van del 1 al ${config.pendientes.momentos}`, 'MOMENTO_INVALIDO');
    }
    if (d.tipo !== 'TUTORIA' && d.tipo !== 'EVALUACION') throw createError(400, 'Un encuentro es una tutoría o una evaluación', 'ENCUENTRO_INVALIDO');
    if (d.tipo === 'EVALUACION' && d.opcion !== 1 && d.opcion !== 2) throw createError(400, 'Una evaluación es de la 1ª o de la 2ª opción', 'ENCUENTRO_INVALIDO');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha ?? '')) throw createError(400, 'La fecha va como AAAA-MM-DD', 'FECHA_INVALIDA');
    if (d.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora)) throw createError(400, 'La hora va como HH:MM', 'HORA_INVALIDA');
    const texto = (v: string | null | undefined, max: number) => (v && v.trim() ? v.trim().slice(0, max) : null);
    return {
        momento: d.momento,
        tipo: d.tipo,
        opcion: d.tipo === 'EVALUACION' ? d.opcion! : null,
        fecha: new Date(`${d.fecha}T00:00:00.000Z`),
        hora: d.hora || null,
        aula: texto(d.aula, 60),
        tema: texto(d.tema, 200),
    };
}

export async function crearEncuentro(prisma: any, instituteId: string, quien: QuienPide, claseId: string, datos: DatosDelEncuentro) {
    await laClase(prisma, quien, claseId);
    const config = await getAcademicConfig(instituteId);
    const e = await prisma.encuentroDePendiente.create({ data: { claseId, ...revisarEncuentro(config, datos), creadoPorId: quien.id } });
    return { id: e.id };
}

export async function editarEncuentro(prisma: any, instituteId: string, quien: QuienPide, id: string, datos: DatosDelEncuentro) {
    const e = await prisma.encuentroDePendiente.findUnique({ where: { id }, select: { claseId: true } });
    if (!e) throw createError(404, 'Encuentro no encontrado', 'NOT_FOUND');
    await laClase(prisma, quien, e.claseId);
    const config = await getAcademicConfig(instituteId);
    await prisma.encuentroDePendiente.update({ where: { id }, data: revisarEncuentro(config, datos) });
    return { id };
}

export async function borrarEncuentro(prisma: any, quien: QuienPide, id: string) {
    const e = await prisma.encuentroDePendiente.findUnique({ where: { id }, select: { claseId: true } });
    if (!e) throw createError(404, 'Encuentro no encontrado', 'NOT_FOUND');
    await laClase(prisma, quien, e.claseId);
    await borrarGuardandoCopia(prisma, 'encuentroDePendiente', { id }, { usuarioId: quien.id, motivo: 'encuentro de pendientes quitado' });
    return { borrado: true };
}

/**
 * La asistencia de un encuentro, de una vez (la lista entera). En una
 * evaluación, quien falta queda como no presentado en esa opción («IN»;
 * justificado, no cuenta) y quien vino deja de estarlo; lo que ya tiene nota
 * no se pisa.
 */
export async function pasarAsistencia(
    prisma: any,
    instituteId: string,
    quien: QuienPide,
    encuentroId: string,
    asistencias: Array<{ materiaPendienteId: string; estado: 'PRESENTE' | 'AUSENTE' | 'JUSTIFICADO' }>
) {
    const e = await prisma.encuentroDePendiente.findUnique({ where: { id: encuentroId } });
    if (!e) throw createError(404, 'Encuentro no encontrado', 'NOT_FOUND');
    await laClase(prisma, quien, e.claseId);
    if (asistencias.some((a) => !['PRESENTE', 'AUSENTE', 'JUSTIFICADO'].includes(a.estado))) {
        throw createError(400, 'Presente, ausente o justificado', 'ASISTENCIA_INVALIDA');
    }
    const ids = [...new Set(asistencias.map((a) => a.materiaPendienteId))];
    const deLaClase = await prisma.materiaPendiente.findMany({ where: { id: { in: ids }, claseId: e.claseId }, select: { id: true } });
    if (deLaClase.length !== ids.length) throw createError(400, 'Hay alumnos que no son de esta clase', 'ALUMNO_INVALIDO');
    const config = await getAcademicConfig(instituteId);

    await prisma.$transaction(async (tx: any) => {
        for (const a of asistencias) {
            await tx.asistenciaDePendiente.upsert({
                where: { encuentroId_materiaPendienteId: { encuentroId, materiaPendienteId: a.materiaPendienteId } },
                update: { estado: a.estado },
                create: { encuentroId, materiaPendienteId: a.materiaPendienteId, estado: a.estado },
            });
        }
        if (e.tipo !== 'EVALUACION' || !e.opcion) return;
        const afectados = new Set<string>();
        const todas = new Map(
            (await tx.materiaPendiente.findMany({ where: { id: { in: ids } }, include: { opciones: true, evaluaciones: true } })).map((p: any) => [p.id, p])
        );
        for (const a of asistencias) {
            const p: any = todas.get(a.materiaPendienteId);
            const puesta = p.opciones.find((o: any) => o.momento === e.momento && o.opcion === e.opcion);
            if (a.estado === 'PRESENTE') {
                // Vino: ya no es «no presentado» (su nota llega con el plan o a mano).
                if (puesta && !puesta.asistio) {
                    const copia = { usuarioId: quien.id, motivo: 'vino a la evaluación: deja de estar «no presentado»' };
                    await borrarGuardandoCopia(tx, 'opcionDePendiente', { id: puesta.id }, copia);
                    if (e.opcion === 1) await borrarGuardandoCopia(tx, 'evaluacionDePendiente', { materiaPendienteId: p.id, momento: e.momento }, copia);
                    for (const id of await losAfectados(tx, p, config, e.momento, e.opcion)) afectados.add(id);
                }
                continue;
            }
            if (puesta && puesta.asistio && puesta.nota != null) continue; // tiene nota: no se pisa
            if (!puesta) {
                try {
                    await validarLaOpcion(tx, p, config, e.momento, e.opcion);
                } catch {
                    continue; // ese momento u opción no es suyo todavía
                }
            }
            const valores = { nota: null, asistio: false, justificada: a.estado === 'JUSTIFICADO', delPlan: false, fecha: e.fecha, registradaPorId: quien.id };
            await tx.opcionDePendiente.upsert({
                where: { materiaPendienteId_momento_opcion: { materiaPendienteId: p.id, momento: e.momento, opcion: e.opcion } },
                update: valores,
                create: { materiaPendienteId: p.id, momento: e.momento, opcion: e.opcion, ...valores },
            });
            for (const id of await losAfectados(tx, p, config, e.momento, e.opcion)) afectados.add(id);
        }
        if (afectados.size) await recalcular(tx, config, [...afectados]);
    }, { timeout: 30000 });
    return planYEncuentrosDeLaClase(prisma, e.claseId);
}
