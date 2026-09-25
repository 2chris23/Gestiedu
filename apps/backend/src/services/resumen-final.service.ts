import { PrismaClient } from '@prisma/client';
import { platformPrisma } from '../config/database';
import { gradesService } from './grades.service';
import { getAcademicConfig, condicionSugerida, SuggestionStatus } from './promotion/close-cycle.service';
import { AppErrors } from '../middleware/error.middleware';

/**
 * EL RESUMEN FINAL DEL RENDIMIENTO DE UNA SECCIÓN
 *
 * Al cerrar el año, control de estudios llena para cada sección el «Resumen
 * Final del Rendimiento Estudiantil» del MPPE: una fila por alumno, una
 * columna por materia con su definitiva, y abajo cuántos aprobaron y
 * reprobaron cada una. Gestiedu tenía todas esas notas pero no las juntaba:
 * se pasaban a mano, alumno por alumno, desde cada boleta.
 *
 * Aquí se juntan con las MISMAS reglas que el cierre:
 *   - la definitiva de cada materia con el redondeo del liceo;
 *   - si la reprobó y presentó revisión, la nota de la revisión
 *     (`services/revision.service.ts`);
 *   - «sin notas» sale vacío y no cuenta ni como aprobada ni como reprobada;
 *   - la condición (promovido, con pendientes, repite) con `condicionSugerida`,
 *     la del cierre; con el ciclo ya cerrado, la que dejó el admin.
 *
 * Solo alumnos con inscripción activa en la sección; los retirados se cuentan
 * aparte. Lo ven el admin y el profesor GUÍA de la sección (son promedios de
 * todas las materias).
 *
 * Pruebas: `tests/integration/funcional-resumen-final.test.ts` (RES-01…04).
 */

export interface ResumenFinal {
    liceo: { nombre: string; codigo: string | null; direccion: string | null; ciudad: string | null };
    ciclo: { id: string; nombre: string; cerrado: boolean };
    seccion: { id: string; grado: number; seccion: string; turno: string | null; guia: string | null };
    materias: Array<{ id: string; nombre: string }>;
    alumnos: Array<{
        cedula: string;
        apellidos: string;
        nombres: string;
        sexo: string | null;
        notas: Record<string, { definitiva: number | null; revision: number | null }>;
        reprobadas: number;
        promedio: number | null;
        condicion: SuggestionStatus;
    }>;
    porMateria: Record<string, { aprobados: number; reprobados: number; sinNotas: number }>;
    totales: { inscritos: number; retirados: number; promovidos: number; conPendientes: number; noPromovidos: number };
    reglas: { notaMinima: number; redondeo: 'MPPE' | 'NINGUNO'; maxPendientes: number };
    emitidoEl: string;
}

const media = (valores: number[]): number | null =>
    valores.length === 0 ? null : Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;

export async function resumenFinalDeLaSeccion(
    prisma: PrismaClient,
    instituteId: string,
    classroomId: string,
    hoy: string
): Promise<ResumenFinal> {
    const seccion = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: {
            id: true,
            grade: true,
            section: true,
            shift: true,
            academicYearId: true,
            academicYear: { select: { id: true, name: true, status: true } },
            teacher: { select: { firstName: true, lastName: true } },
            subjects: { select: { subject: { select: { id: true, name: true } } } },
        },
    });
    if (!seccion || !seccion.academicYearId || !seccion.academicYear) throw AppErrors.NotFound('Sección');
    const academicYearId = seccion.academicYearId;
    const ciclo = seccion.academicYear;

    const [config, liceo, inscripciones, revisiones, actas] = await Promise.all([
        getAcademicConfig(instituteId),
        platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { name: true, code: true, address: true, city: true } }),
        prisma.studentClassroom.findMany({
            where: { classroomId, academicYearId },
            select: {
                isActive: true,
                student: { select: { id: true, firstName: true, lastName: true, gender: true } },
            },
        }),
        (prisma as any).notaDeRevision.findMany({
            where: { academicYearId },
            select: { studentId: true, subjectId: true, score: true },
        }),
        prisma.academicRecord.findMany({
            where: { academicYearId },
            select: { studentId: true, finalResult: true },
        }),
    ]);
    const redondeo = config.redondeoDeDefinitivas ?? 'MPPE';
    const minima = config.notaMinimaAprobatoria;
    const revisionDe = new Map<string, number>(revisiones.map((r: any) => [`${r.studentId}|${r.subjectId}`, r.score]));
    const actaDe = new Map<string, string | null>(actas.map((a) => [a.studentId, a.finalResult]));
    const ultimoAno = config.maxGradeLevel ?? (config.modalidad === 'MEDIA_TECNICA' ? 6 : 5);

    const materias = seccion.subjects
        .map((s) => s.subject)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const activos = inscripciones
        .filter((i) => i.isActive)
        .map((i) => i.student)
        .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'es'));

    const porMateria: ResumenFinal['porMateria'] = {};
    for (const m of materias) porMateria[m.id] = { aprobados: 0, reprobados: 0, sinNotas: 0 };

    // La definitiva de cada alumno en cada materia; de a cinco alumnos, cada
    // uno con sus materias a la vez (como el cierre, que va de a 25).
    const definitivas = new Map<string, { promedio: number; conNotas: boolean }>();
    for (let i = 0; i < activos.length; i += 5) {
        await Promise.all(
            activos.slice(i, i + 5).flatMap((a) =>
                materias.map(async (m) => {
                    const d = await gradesService.promedioDeLaMateria(prisma, a.id, m.id, undefined, undefined, redondeo);
                    definitivas.set(`${a.id}|${m.id}`, { promedio: d.promedio, conNotas: d.conNotas });
                })
            )
        );
    }

    const alumnos: ResumenFinal['alumnos'] = [];
    for (const a of activos) {
        const notas: ResumenFinal['alumnos'][number]['notas'] = {};
        const queCuentan: number[] = [];
        let reprobadas = 0;
        for (const m of materias) {
            const def = definitivas.get(`${a.id}|${m.id}`)!;
            if (!def.conNotas) {
                notas[m.id] = { definitiva: null, revision: null };
                porMateria[m.id].sinNotas++;
                continue;
            }
            const revision = def.promedio < minima ? (revisionDe.get(`${a.id}|${m.id}`) ?? null) : null;
            const cuenta = revision ?? def.promedio;
            notas[m.id] = { definitiva: def.promedio, revision };
            queCuentan.push(cuenta);
            if (cuenta >= minima) porMateria[m.id].aprobados++;
            else {
                porMateria[m.id].reprobados++;
                reprobadas++;
            }
        }
        const acta = actaDe.get(a.id);
        alumnos.push({
            cedula: a.id,
            apellidos: a.lastName,
            nombres: a.firstName,
            sexo: a.gender ?? null,
            notas,
            reprobadas,
            promedio: media(queCuentan),
            condicion: (acta as SuggestionStatus) || condicionSugerida(reprobadas, seccion.grade >= ultimoAno, config),
        });
    }

    return {
        liceo: {
            nombre: liceo?.name ?? '',
            codigo: liceo?.code ?? null,
            direccion: liceo?.address ?? null,
            ciudad: liceo?.city ?? null,
        },
        ciclo: { id: ciclo.id, nombre: ciclo.name, cerrado: ciclo.status === 'COMPLETED' },
        seccion: {
            id: seccion.id,
            grado: seccion.grade,
            seccion: seccion.section,
            turno: (seccion as any).shift ?? null,
            guia: seccion.teacher ? `${seccion.teacher.firstName} ${seccion.teacher.lastName}` : null,
        },
        materias: materias.map((m) => ({ id: m.id, nombre: m.name })),
        alumnos,
        porMateria,
        totales: {
            inscritos: alumnos.length,
            retirados: inscripciones.filter((i) => !i.isActive).length,
            promovidos: alumnos.filter((a) => a.condicion === 'PROMOVIDO').length,
            conPendientes: alumnos.filter((a) => a.condicion === 'PROMOVIDO_CON_PENDIENTES').length,
            noPromovidos: alumnos.filter((a) => a.condicion === 'NO_PROMOVIDO').length,
        },
        reglas: { notaMinima: minima, redondeo, maxPendientes: config.maxMateriasPendientesParaPromover },
        emitidoEl: hoy,
    };
}

/** El admin, o el profesor guía de la sección. */
export async function puedeVerElResumen(
    prisma: PrismaClient,
    user: { id?: string; userId?: string; role?: string } | null | undefined,
    classroomId: string
): Promise<boolean> {
    const actor = user?.userId ?? user?.id;
    if (!actor || !user?.role) return false;
    if (user.role === 'ADMIN') return true;
    if (user.role !== 'TEACHER') return false;
    return (await prisma.classroom.count({ where: { id: classroomId, teacherId: actor } })) > 0;
}
