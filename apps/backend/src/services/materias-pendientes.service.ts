import { PrismaClient } from '@prisma/client';
import { createError } from '../middleware/error.middleware';
import { borrarGuardandoCopia } from '../utils/papelera';
import { getAcademicConfig } from './promotion/close-cycle.service';
import { redondearComoElMPPE } from './grades.service';

/**
 * LA MATERIA PENDIENTE, DE VERDAD
 *
 * La que el alumno reprobó y arrastra al año siguiente (la crea el cierre del
 * año, `close-cycle.service`). Antes era un texto en el expediente: no se
 * podía evaluar, no salía en la boleta y el cierre siguiente la ignoraba.
 *
 *   - La evalúa UN profesor: por defecto el que da esa materia en ese grado
 *     el año en que se cursa; el admin lo cambia.
 *   - En varios momentos (`academicConfig.pendientes.momentos`, 4 por
 *     defecto, como la circular del MPPE). Cómo se aprueba lo dice el liceo:
 *       · MOMENTO_APROBADO (por defecto): aprobada en cuanto un momento llega
 *         a la nota mínima; esa es su nota final. Sin aprobar ninguno de todos
 *         los momentos: NO_APROBADA, con la mejor.
 *       · PROMEDIO: con todos los momentos puestos, la media decide.
 *   - La ven el alumno y su representante (la boleta), el admin y el profesor
 *     que la evalúa.
 *   - El cierre del año siguiente la cuenta: sin aprobar, según
 *     `pendienteNoAprobada` (no se promueve, o sigue pendiente).
 *
 * Pruebas: `tests/integration/materias-pendientes.test.ts` (PEND-01…08).
 */

const NOTA_MAXIMA = 20;

export interface QuienPide {
    id: string;
    role: string;
}

const incluir = {
    student: { select: { id: true, firstName: true, lastName: true } },
    subject: { select: { id: true, name: true } },
    profesor: { select: { id: true, firstName: true, lastName: true } },
    cicloDeOrigen: { select: { id: true, name: true } },
    ciclo: { select: { id: true, name: true, status: true } },
    evaluaciones: { orderBy: { momento: 'asc' as const } },
};

function comoFila(p: any) {
    return {
        id: p.id,
        alumno: { id: p.student.id, nombre: `${p.student.lastName}, ${p.student.firstName}` },
        materia: { id: p.subject.id, nombre: p.subject.name },
        gradoDeOrigen: p.gradoDeOrigen,
        cicloDeOrigen: p.cicloDeOrigen?.name ?? null,
        notaDeOrigen: p.notaDeOrigen,
        ciclo: { id: p.ciclo.id, nombre: p.ciclo.name, cerrado: p.ciclo.status === 'COMPLETED' },
        profesor: p.profesor ? { id: p.profesor.id, nombre: `${p.profesor.firstName} ${p.profesor.lastName}` } : null,
        estado: p.estado as 'PENDIENTE' | 'APROBADA' | 'NO_APROBADA',
        notaFinal: p.notaFinal,
        momentos: p.evaluaciones.map((e: any) => ({
            momento: e.momento,
            nota: e.nota,
            fecha: e.fecha.toISOString().slice(0, 10),
            observaciones: e.observaciones,
        })),
    };
}

/** El año escolar en curso (el activo o, si no hay, el más reciente sin cerrar). */
async function cicloEnCurso(prisma: any): Promise<string | null> {
    const activo =
        (await prisma.academicYear.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startDate: 'desc' }, select: { id: true } })) ??
        (await prisma.academicYear.findFirst({ where: { status: { not: 'COMPLETED' } }, orderBy: { startDate: 'asc' }, select: { id: true } }));
    return activo?.id ?? null;
}

/**
 * La lista: el admin ve todas las del año; el profesor, las que evalúa él.
 */
export async function listarPendientes(prisma: any, instituteId: string, quien: QuienPide, opciones: { cicloId?: string } = {}) {
    const cicloId = opciones.cicloId ?? (await cicloEnCurso(prisma));
    const config = await getAcademicConfig(instituteId);
    if (!cicloId) return { cicloId: null, momentos: config.pendientes.momentos, forma: config.pendientes.formaDeCalificar, minima: config.notaMinimaAprobatoria, pendientes: [] };
    const where: any = { cicloId };
    if (quien.role !== 'ADMIN') where.profesorId = quien.id;
    const filas = await prisma.materiaPendiente.findMany({
        where,
        include: incluir,
        orderBy: [{ gradoDeOrigen: 'asc' }, { subject: { name: 'asc' } }, { student: { lastName: 'asc' } }],
    });
    return {
        cicloId,
        momentos: config.pendientes.momentos,
        forma: config.pendientes.formaDeCalificar,
        minima: config.notaMinimaAprobatoria,
        pendientes: filas.map(comoFila),
    };
}

/** Las de un alumno (todas: las que cursa y las de años anteriores). */
export async function pendientesDelAlumno(prisma: any, studentId: string) {
    const filas = await prisma.materiaPendiente.findMany({
        where: { studentId },
        include: incluir,
        orderBy: [{ ciclo: { startDate: 'desc' } }, { gradoDeOrigen: 'asc' }],
    });
    return filas.map(comoFila);
}

async function laPendiente(prisma: any, id: string) {
    const p = await prisma.materiaPendiente.findUnique({ where: { id }, include: incluir });
    if (!p) throw createError(404, 'Materia pendiente no encontrada', 'NOT_FOUND');
    return p;
}

function puedeEvaluar(p: any, quien: QuienPide) {
    if (quien.role === 'ADMIN') return;
    if (quien.role === 'TEACHER' && p.profesorId === quien.id) return;
    throw createError(403, 'La evalúa el profesor asignado a esta materia pendiente', 'FORBIDDEN');
}

/**
 * Recalcula el estado con la forma del liceo. Devuelve lo que hay que guardar.
 */
export function estadoDeLaPendiente(
    notas: Array<{ momento: number; nota: number }>,
    reglas: { momentos: number; formaDeCalificar: 'MOMENTO_APROBADO' | 'PROMEDIO' },
    minima: number,
    redondeo: 'MPPE' | 'NINGUNO' = 'MPPE'
): { estado: 'PENDIENTE' | 'APROBADA' | 'NO_APROBADA'; notaFinal: number | null } {
    const redondear = (n: number) => (redondeo === 'NINGUNO' ? Math.round(n * 100) / 100 : redondearComoElMPPE(n));
    const ordenadas = [...notas].sort((a, b) => a.momento - b.momento);
    if (reglas.formaDeCalificar === 'PROMEDIO') {
        if (ordenadas.length < reglas.momentos) return { estado: 'PENDIENTE', notaFinal: null };
        const media = redondear(ordenadas.reduce((s, n) => s + n.nota, 0) / ordenadas.length);
        return { estado: media >= minima ? 'APROBADA' : 'NO_APROBADA', notaFinal: media };
    }
    const aprobado = ordenadas.find((n) => n.nota >= minima);
    if (aprobado) return { estado: 'APROBADA', notaFinal: aprobado.nota };
    if (ordenadas.length >= reglas.momentos) {
        return { estado: 'NO_APROBADA', notaFinal: Math.max(...ordenadas.map((n) => n.nota)) };
    }
    return { estado: 'PENDIENTE', notaFinal: null };
}

async function recalcular(tx: any, instituteId: string, materiaPendienteId: string) {
    const config = await getAcademicConfig(instituteId);
    const notas = await tx.evaluacionDePendiente.findMany({ where: { materiaPendienteId }, select: { momento: true, nota: true } });
    const nuevo = estadoDeLaPendiente(notas, config.pendientes, config.notaMinimaAprobatoria, config.redondeoDeDefinitivas);
    await tx.materiaPendiente.update({ where: { id: materiaPendienteId }, data: nuevo });
    return nuevo;
}

/** Pone (o corrige) la nota de un momento. */
export async function evaluarMomento(
    prisma: PrismaClient | any,
    instituteId: string,
    quien: QuienPide,
    datos: { id: string; momento: number; nota: unknown; fecha: string; observaciones?: string | null }
) {
    const p = await laPendiente(prisma, datos.id);
    puedeEvaluar(p, quien);
    if (p.ciclo.status === 'COMPLETED') throw createError(409, 'El año escolar ya se cerró', 'CICLO_CERRADO');
    const config = await getAcademicConfig(instituteId);
    if (!Number.isInteger(datos.momento) || datos.momento < 1 || datos.momento > config.pendientes.momentos) {
        throw createError(400, `Los momentos van del 1 al ${config.pendientes.momentos}`, 'MOMENTO_INVALIDO');
    }
    if (typeof datos.nota !== 'number' || !Number.isFinite(datos.nota) || datos.nota < 0 || datos.nota > NOTA_MAXIMA) {
        throw createError(400, `La nota va de 0 a ${NOTA_MAXIMA}`, 'NOTA_INVALIDA');
    }
    const yaEsta = p.evaluaciones.find((e: any) => e.momento === datos.momento);
    // Aprobada, ya no hay más momentos: solo se corrige uno que ya estaba.
    if (p.estado === 'APROBADA' && !yaEsta) {
        throw createError(409, 'La materia ya está aprobada', 'YA_APROBADA');
    }
    // Los momentos van en orden: no se salta uno.
    const anteriores = p.evaluaciones.filter((e: any) => e.momento < datos.momento).length;
    if (!yaEsta && anteriores < datos.momento - 1) {
        throw createError(400, `Primero el momento ${anteriores + 1}`, 'MOMENTO_INVALIDO');
    }
    const nota = config.redondeoDeDefinitivas === 'NINGUNO' ? Math.round(datos.nota * 100) / 100 : redondearComoElMPPE(datos.nota);
    const fecha = new Date(`${datos.fecha}T00:00:00.000Z`);
    return prisma.$transaction(async (tx: any) => {
        await tx.evaluacionDePendiente.upsert({
            where: { materiaPendienteId_momento: { materiaPendienteId: p.id, momento: datos.momento } },
            update: { nota, fecha, observaciones: datos.observaciones ?? null, registradaPorId: quien.id },
            create: {
                materiaPendienteId: p.id,
                momento: datos.momento,
                nota,
                fecha,
                observaciones: datos.observaciones ?? null,
                registradaPorId: quien.id,
            },
        });
        return recalcular(tx, instituteId, p.id);
    });
}

/** Quita la nota de un momento (con copia en la papelera) y recalcula. */
export async function quitarMomento(prisma: any, instituteId: string, quien: QuienPide, id: string, momento: number) {
    const p = await laPendiente(prisma, id);
    puedeEvaluar(p, quien);
    if (p.ciclo.status === 'COMPLETED') throw createError(409, 'El año escolar ya se cerró', 'CICLO_CERRADO');
    const ultimo = Math.max(0, ...p.evaluaciones.map((e: any) => e.momento));
    if (momento !== ultimo) throw createError(409, 'Solo se quita el último momento puesto', 'NO_ES_EL_ULTIMO');
    return prisma.$transaction(async (tx: any) => {
        const n = await borrarGuardandoCopia(tx, 'evaluacionDePendiente', { materiaPendienteId: id, momento }, {
            usuarioId: quien.id,
            motivo: 'momento de materia pendiente quitado',
        });
        if (n === 0) throw createError(404, 'Ese momento no tiene nota', 'NOT_FOUND');
        return recalcular(tx, instituteId, id);
    });
}

/** El admin cambia quién la evalúa. */
export async function asignarProfesor(prisma: any, id: string, profesorId: string | null) {
    await laPendiente(prisma, id);
    if (profesorId) {
        const profe = await prisma.user.findUnique({ where: { id: profesorId }, select: { role: true, isActive: true } });
        if (!profe || profe.role !== 'TEACHER' || !profe.isActive) throw createError(400, 'Ese no es un profesor activo', 'PROFESOR_INVALIDO');
    }
    await prisma.materiaPendiente.update({ where: { id }, data: { profesorId } });
    return comoFila(await laPendiente(prisma, id));
}

/**
 * El acta de compromiso de un alumno: sus materias pendientes de un año, con
 * quién las evalúa. De aquí sale la hoja que firman el alumno, su
 * representante y los docentes.
 */
export async function actaDeCompromiso(prisma: any, studentId: string, cicloId?: string) {
    const alumno = await prisma.user.findUnique({
        where: { id: studentId },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            studentTutorings: { select: { relationship: true, tutor: { select: { firstName: true, lastName: true, id: true } } } },
        },
    });
    if (!alumno || alumno.role !== 'STUDENT') throw createError(404, 'Estudiante no encontrado', 'NOT_FOUND');
    const ciclo = cicloId ?? (await cicloEnCurso(prisma));
    const filas = ciclo
        ? await prisma.materiaPendiente.findMany({ where: { studentId, cicloId: ciclo }, include: incluir, orderBy: { gradoDeOrigen: 'asc' } })
        : [];
    const inscripcion = ciclo
        ? await prisma.studentClassroom.findUnique({
              where: { studentId_academicYearId: { studentId, academicYearId: ciclo } },
              select: { classroom: { select: { name: true } } },
          })
        : null;
    return {
        alumno: { cedula: alumno.id, nombre: `${alumno.firstName} ${alumno.lastName}` },
        representantes: (alumno.studentTutorings ?? []).map((t: any) => ({
            nombre: `${t.tutor.firstName} ${t.tutor.lastName}`,
            cedula: t.tutor.id,
            parentesco: t.relationship,
        })),
        seccion: inscripcion?.classroom?.name ?? null,
        ciclo: filas[0]?.ciclo?.name ?? null,
        pendientes: filas.map(comoFila),
    };
}
