/**
 * PROMEDIOS DE UNA SECCIÓN EN BLOQUE
 *
 * Calcula el promedio de muchos estudiantes en muchas materias con 4 consultas,
 * aplicando las MISMAS reglas que `gradesService.calculateWeightedSubjectAverage`
 * para un solo estudiante (ver docs/MAPA_DE_CALCULOS.md, niveles 0-2):
 *
 *   - Con plan de evaluación: cada criterio (fila EVALUATION con puntos > 0) vale
 *     (promedio normalizado ÷ 20) × puntos; si lo calificado no cubre los 20
 *     puntos, se escala a 20.
 *   - Sin plan: promedio simple de TODAS las notas del estudiante en esa materia,
 *     incluidas las de Clase en Vivo que viven en `ClassActivity.scores` aunque
 *     no estén vinculadas a ninguna fila del plan.
 *   - Sin lapso concreto: promedio simple de los lapsos que tienen notas.
 *
 * Por qué existe: el listado de una sección calculaba el promedio SOLO con la
 * tabla `grades`, así que un profesor podía poner 17 en Clase en Vivo y ver
 * "Sin calificar" en la lista. La alternativa —llamar a la función por
 * estudiante— disparaba unas 20 consultas por estudiante y materia: cientos por
 * cada carga de la lista.
 *
 * `tests/integration/bulk-averages-parity.test.ts` comprueba que este cálculo y
 * el de un solo estudiante dan el mismo número.
 */
import { PrismaClient } from '@prisma/client';
import { calculateLapsoAverage, CriterionInput, CriterionActivityGrade } from '../utils/lapso-average';

export interface BulkAverageParams {
    classroomId: string;
    studentIds: string[];
    subjectIds: string[];
    /** Lapso concreto; si se omite se combinan todos los del ciclo. */
    periodId?: string;
}

/** studentId → subjectId → promedio (0 si no tiene notas). */
export type BulkAverageResult = Map<string, Map<string, number>>;

/** Mismo mapeo de nombre de lapso que `gradesService`. */
export function periodNameToLapso(periodName?: string | null): string {
    if (!periodName) return '1';
    const name = periodName.toLowerCase();
    if (name.includes('segundo') || name.includes('2do') || name.includes('2er') || name.includes('ii')) return '2';
    if (name.includes('tercer') || name.includes('3ro') || name.includes('3er') || name.includes('iii')) return '3';
    return '1';
}

function parseScores(raw: unknown): Record<string, number | null> {
    try {
        return (typeof raw === 'string' ? JSON.parse(raw) : (raw as any)) || {};
    } catch {
        return {};
    }
}

/** Nota del lapso a partir de sus criterios, escalada a 20 (nivel 2). */
function lapsoNote(criteria: CriterionInput[]): number {
    if (criteria.length === 0) return 0;
    const result = calculateLapsoAverage(criteria);
    const gradedPts = criteria
        .filter((c) => c.activities.some((a) => a.score !== null && a.score !== undefined && !Number.isNaN(a.score)))
        .reduce((s, c) => s + (c.puntos || 0), 0);
    const scaled = gradedPts > 0 && gradedPts < 20 ? result.total * (20 / gradedPts) : result.total;
    return Math.round(scaled * 100) / 100;
}

export async function bulkSubjectAverages(
    prisma: PrismaClient,
    { classroomId, studentIds, subjectIds, periodId }: BulkAverageParams
): Promise<BulkAverageResult> {
    const empty: BulkAverageResult = new Map(studentIds.map((id) => [id, new Map<string, number>()]));
    if (studentIds.length === 0 || subjectIds.length === 0) return empty;

    // --- 4 consultas para toda la sección ---
    const [periods, rows, grades, activities] = await Promise.all([
        periodId
            ? prisma.period.findMany({ where: { id: periodId }, select: { id: true, name: true } })
            : prisma.period.findMany({
                  where: { academicYear: { classrooms: { some: { id: classroomId } } } },
                  select: { id: true, name: true },
                  orderBy: { startDate: 'asc' },
              }),
        prisma.evaluationPlanRow.findMany({
            where: { classroomId, subjectId: { in: subjectIds }, rowType: 'EVALUATION' },
            select: { id: true, puntos: true, activityId: true, subjectId: true, lapso: true },
        }),
        prisma.grade.findMany({
            where: { studentId: { in: studentIds }, subjectId: { in: subjectIds } },
            select: { studentId: true, subjectId: true, score: true, periodId: true, activityId: true },
        }),
        prisma.classActivity.findMany({
            where: { classroomId, subjectId: { in: subjectIds } },
            select: { id: true, subjectId: true, planRowId: true, maxScore: true, scores: true },
        }),
    ]);

    if (periods.length === 0) return empty;

    // --- Índices en memoria ---
    const actScores = activities.map((a) => ({
        subjectId: a.subjectId,
        planRowId: a.planRowId,
        maxScore: a.maxScore ?? 20,
        scores: parseScores(a.scores),
    }));

    const gradesByStudent = new Map<string, typeof grades>();
    for (const g of grades) {
        if (!gradesByStudent.has(g.studentId)) gradesByStudent.set(g.studentId, []);
        gradesByStudent.get(g.studentId)!.push(g);
    }

    const result: BulkAverageResult = new Map(studentIds.map((id) => [id, new Map<string, number>()]));

    for (const subjectId of subjectIds) {
        // Notas sueltas de Clase en Vivo de esta materia (sin criterio del plan)
        const subjectActs = actScores.filter((a) => a.subjectId === subjectId);

        for (const studentId of studentIds) {
            const studentGrades = (gradesByStudent.get(studentId) ?? []).filter((g) => g.subjectId === subjectId);
            const notasPorLapso: number[] = [];

            for (const period of periods) {
                const lapso = periodNameToLapso(period.name);
                const criterios = rows.filter(
                    (r) => r.subjectId === subjectId && r.lapso === lapso && (r.puntos || 0) > 0
                );

                let criteria: CriterionInput[];

                if (criterios.length === 0) {
                    // Sin plan: todas las notas valen igual, vengan de donde vengan
                    const acts: CriterionActivityGrade[] = [];
                    studentGrades
                        .filter((g) => g.periodId === period.id && g.score !== null)
                        .forEach((g) => acts.push({ score: g.score as number, maxScore: 20 }));
                    subjectActs.forEach((a) => {
                        const score = a.scores[studentId];
                        if (score !== undefined && score !== null) acts.push({ score, maxScore: a.maxScore });
                    });
                    criteria = acts.length > 0 ? [{ puntos: 20, activities: acts }] : [];
                } else {
                    criteria = criterios.map((r) => {
                        const acts: CriterionActivityGrade[] = [];
                        if (r.activityId) {
                            studentGrades
                                .filter((g) => g.activityId === r.activityId && g.score !== null)
                                .forEach((g) => acts.push({ score: g.score as number, maxScore: 20 }));
                        }
                        subjectActs
                            .filter((a) => a.planRowId === r.id)
                            .forEach((a) => {
                                const score = a.scores[studentId];
                                if (score !== undefined && score !== null)
                                    acts.push({ score, maxScore: a.maxScore });
                            });
                        return { puntos: r.puntos || 0, activities: acts };
                    });
                }

                const nota = lapsoNote(criteria);
                if (nota > 0) notasPorLapso.push(nota);
            }

            // Un lapso sin notas no pesa (regla de exclusión)
            const promedio =
                notasPorLapso.length > 0
                    ? Math.round((notasPorLapso.reduce((a, b) => a + b, 0) / notasPorLapso.length) * 100) / 100
                    : 0;
            result.get(studentId)!.set(subjectId, promedio);
        }
    }

    return result;
}
