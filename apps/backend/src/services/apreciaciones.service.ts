import { PrismaClient } from '@prisma/client';
import { RedisCache } from '../config/redis';
import { platformPrisma } from '../config/database';
import { createError } from '../middleware/error.middleware';
import { borrarGuardandoCopia } from '../utils/papelera';

/**
 * LAS MATERIAS QUE SE EVALÚAN CON APRECIACIÓN
 *
 * En media general hay áreas que no llevan nota de 01 a 20: Orientación y
 * Convivencia, Grupos de Creación, Recreación y Producción… Se evalúan con
 * una apreciación («Consolidado», «En proceso», «Iniciado»), y el liceo
 * decide cuáles y con qué palabras (`academicConfig.apreciaciones`).
 *
 * - **No cuentan** en ningún promedio ni en la promoción. El filtro está en
 *   el origen: el promedio de una materia cualitativa sale «sin notas»
 *   (`gradesService.promedioDelLapso`, `bulkSubjectAveragesConDatos`,
 *   `studentsWithNoteInSubject`), y todo lo de encima —sección, año, ciclo,
 *   riesgo, cierre— ya deja fuera lo que no tiene notas. Así no hay que
 *   acordarse en cada pantalla.
 * - La apreciación la pone el profesor que da esa materia en esa sección (o
 *   el admin), por lapso y la final del año.
 * - La ven el alumno y su representante en la boleta.
 *
 * Pruebas: `tests/integration/apreciaciones.test.ts` (CUALI-01…05).
 */

/**
 * Para las consultas que promedian notas de VARIAS materias a la vez
 * (`grade.groupBy`, `grade.aggregate`…): solo las de materias con nota.
 */
export const NOTAS_QUE_CUENTAN = { subject: { evaluacion: 'NUMERICA' as const } };

export const APRECIACIONES_POR_DEFECTO = ['Consolidado', 'En proceso', 'Iniciado'];
export const MOMENTO_FINAL = 'FINAL';

const CLAVE_CUALITATIVAS = 'materias:cualitativas';

/** Una lista de apreciaciones válida: de 2 a 10 palabras distintas, de 1 a 40 letras. */
export function esListaDeApreciaciones(valor: unknown): valor is string[] {
    if (!Array.isArray(valor) || valor.length < 2 || valor.length > 10) return false;
    const limpias = valor.map((v) => (typeof v === 'string' ? v.trim() : ''));
    if (limpias.some((v) => v.length < 1 || v.length > 40)) return false;
    return new Set(limpias.map((v) => v.toLowerCase())).size === limpias.length;
}

export async function apreciacionesDelLiceo(instituteId: string): Promise<string[]> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    const lista = ((inst?.academicConfig || {}) as any).apreciaciones;
    return esListaDeApreciaciones(lista) ? lista.map((v) => v.trim()) : [...APRECIACIONES_POR_DEFECTO];
}

/**
 * Los ids de las materias cualitativas del liceo. Se guardan un minuto en la
 * memoria rápida: esto se pregunta en cada promedio. Cambiar la forma de
 * evaluar de una materia lo olvida (`olvidarMateriasCualitativas`).
 */
export async function materiasCualitativas(prisma: PrismaClient | any): Promise<Set<string>> {
    const guardadas = await RedisCache.get<string[]>(CLAVE_CUALITATIVAS);
    if (Array.isArray(guardadas)) return new Set(guardadas);
    const filas: Array<{ id: string }> = await prisma.subject.findMany({
        where: { evaluacion: 'CUALITATIVA' },
        select: { id: true },
    });
    const ids = filas.map((f) => f.id);
    await RedisCache.set(CLAVE_CUALITATIVAS, ids, 60);
    return new Set(ids);
}

export async function esCualitativa(prisma: PrismaClient | any, subjectId: string): Promise<boolean> {
    return (await materiasCualitativas(prisma)).has(subjectId);
}

export async function olvidarMateriasCualitativas(): Promise<void> {
    await RedisCache.del(CLAVE_CUALITATIVAS);
}

/** Las materias de la lista que SÍ llevan nota (las que cuentan para promediar). */
export async function soloLasQueCuentan(prisma: PrismaClient | any, subjectIds: string[]): Promise<string[]> {
    if (subjectIds.length === 0) return subjectIds;
    const cualitativas = await materiasCualitativas(prisma);
    return cualitativas.size === 0 ? subjectIds : subjectIds.filter((id) => !cualitativas.has(id));
}

export interface ApreciacionesDeLaMateria {
    materia: { id: string; nombre: string };
    valores: string[];
    momentos: Array<{ id: string; nombre: string }>;
    alumnos: Array<{ id: string; nombre: string; apreciaciones: Record<string, { valor: string; observacion: string | null }> }>;
    cerrado: boolean;
}

async function laSeccion(prisma: any, classroomId: string, subjectId: string) {
    const seccion = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: {
            id: true,
            academicYearId: true,
            academicYear: { select: { status: true, periods: { select: { id: true, name: true, startDate: true }, orderBy: { startDate: 'asc' } } } },
            subjects: { where: { subjectId }, select: { subject: { select: { id: true, name: true, evaluacion: true } } } },
        },
    });
    if (!seccion || !seccion.academicYearId) throw createError(404, 'Sección no encontrada', 'NOT_FOUND');
    const materia = seccion.subjects[0]?.subject;
    if (!materia) throw createError(404, 'Esa materia no es de la sección', 'MATERIA_AJENA');
    if (materia.evaluacion !== 'CUALITATIVA') {
        throw createError(409, 'Esta materia se evalúa con nota, no con apreciación', 'MATERIA_NUMERICA');
    }
    return seccion;
}

/** Los alumnos de la sección con sus apreciaciones en esa materia, por lapso y la final. */
export async function apreciacionesDeLaMateria(
    prisma: PrismaClient | any,
    instituteId: string,
    classroomId: string,
    subjectId: string
): Promise<ApreciacionesDeLaMateria> {
    const seccion = await laSeccion(prisma, classroomId, subjectId);
    const [inscritos, puestas, valores] = await Promise.all([
        prisma.studentClassroom.findMany({
            where: { classroomId, isActive: true },
            select: { student: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
        }),
        prisma.apreciacion.findMany({
            where: { subjectId, academicYearId: seccion.academicYearId, classroomId },
            select: { studentId: true, momento: true, valor: true, observacion: true },
        }),
        apreciacionesDelLiceo(instituteId),
    ]);

    const porAlumno = new Map<string, Record<string, { valor: string; observacion: string | null }>>();
    for (const a of puestas) {
        const suyas = porAlumno.get(a.studentId) ?? {};
        suyas[a.momento] = { valor: a.valor, observacion: a.observacion };
        porAlumno.set(a.studentId, suyas);
    }

    return {
        materia: { id: seccion.subjects[0].subject.id, nombre: seccion.subjects[0].subject.name },
        valores,
        momentos: [
            ...seccion.academicYear.periods.map((p: any) => ({ id: p.id, nombre: p.name })),
            { id: MOMENTO_FINAL, nombre: 'Final' },
        ],
        alumnos: inscritos.map((i: any) => ({
            id: i.student.id,
            nombre: `${i.student.lastName}, ${i.student.firstName}`.trim(),
            apreciaciones: porAlumno.get(i.student.id) ?? {},
        })),
        cerrado: seccion.academicYear.status === 'COMPLETED',
    };
}

/**
 * Guarda las apreciaciones de un momento (un lapso o la final). Un valor
 * vacío la quita, con copia en la papelera como todo borrado.
 */
export async function guardarApreciaciones(
    prisma: PrismaClient | any,
    instituteId: string,
    datos: {
        classroomId: string;
        subjectId: string;
        momento: string;
        items: Array<{ studentId: string; valor: string; observacion?: string | null }>;
        quien: string;
    }
): Promise<{ guardadas: number; quitadas: number }> {
    const seccion = await laSeccion(prisma, datos.classroomId, datos.subjectId);
    if (seccion.academicYear.status === 'COMPLETED') {
        throw createError(409, 'El año escolar ya se cerró', 'CICLO_CERRADO');
    }
    const esFinal = datos.momento === MOMENTO_FINAL;
    if (!esFinal && !seccion.academicYear.periods.some((p: any) => p.id === datos.momento)) {
        throw createError(400, 'Ese lapso no es de este año escolar', 'MOMENTO_INVALIDO');
    }

    const valores = await apreciacionesDelLiceo(instituteId);
    const permitido = new Map(valores.map((v) => [v.toLowerCase(), v]));
    const inscritos = new Set(
        (
            await prisma.studentClassroom.findMany({
                where: { classroomId: datos.classroomId, isActive: true, studentId: { in: datos.items.map((i) => i.studentId) } },
                select: { studentId: true },
            })
        ).map((i: any) => i.studentId)
    );

    for (const item of datos.items) {
        if (!inscritos.has(item.studentId)) throw createError(400, 'Ese alumno no es de la sección', 'ALUMNO_AJENO');
        const valor = (item.valor ?? '').trim();
        if (valor && !permitido.has(valor.toLowerCase())) {
            throw createError(400, `«${valor}» no es una apreciación del liceo (${valores.join(', ')})`, 'APRECIACION_INVALIDA');
        }
    }

    let guardadas = 0;
    let quitadas = 0;
    await prisma.$transaction(async (tx: any) => {
        for (const item of datos.items) {
            const valor = permitido.get((item.valor ?? '').trim().toLowerCase());
            const clave = {
                studentId: item.studentId,
                subjectId: datos.subjectId,
                academicYearId: seccion.academicYearId,
                momento: datos.momento,
            };
            if (!valor) {
                quitadas += await borrarGuardandoCopia(tx, 'apreciacion', clave, {
                    usuarioId: datos.quien,
                    motivo: 'apreciación quitada',
                });
                continue;
            }
            const observacion = item.observacion?.trim() ? item.observacion.trim().slice(0, 300) : null;
            await tx.apreciacion.upsert({
                where: { studentId_subjectId_academicYearId_momento: clave },
                update: { valor, observacion, registradaPorId: datos.quien, classroomId: datos.classroomId },
                create: {
                    ...clave,
                    classroomId: datos.classroomId,
                    periodId: esFinal ? null : datos.momento,
                    valor,
                    observacion,
                    registradaPorId: datos.quien,
                },
            });
            guardadas++;
        }
    });
    return { guardadas, quitadas };
}

/**
 * Las apreciaciones de un alumno en un año, por materia: la de cada lapso y la
 * final. Para la boleta y el resumen final.
 */
export async function apreciacionesDelAlumno(
    prisma: PrismaClient | any,
    studentId: string,
    academicYearId: string
): Promise<Map<string, Record<string, string>>> {
    const filas = await prisma.apreciacion.findMany({
        where: { studentId, academicYearId },
        select: { subjectId: true, momento: true, valor: true },
    });
    const out = new Map<string, Record<string, string>>();
    for (const f of filas) {
        const suyas = out.get(f.subjectId) ?? {};
        suyas[f.momento] = f.valor;
        out.set(f.subjectId, suyas);
    }
    return out;
}

/** Las apreciaciones finales de un año: «alumno|materia» → valor. Para el cierre. */
export async function apreciacionesFinalesDelCiclo(prisma: PrismaClient | any, academicYearId: string): Promise<Map<string, string>> {
    const filas = await prisma.apreciacion.findMany({
        where: { academicYearId, momento: MOMENTO_FINAL },
        select: { studentId: true, subjectId: true, valor: true },
    });
    return new Map(filas.map((f: any) => [`${f.studentId}|${f.subjectId}`, f.valor]));
}
