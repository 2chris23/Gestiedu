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
import { fechaDeLaActividad, lapsoDeLaFecha } from '../utils/lapso-de-la-actividad';

export interface BulkAverageParams {
    classroomId: string;
    studentIds: string[];
    subjectIds: string[];
    /** Lapso concreto; si se omite se combinan todos los del ciclo. */
    periodId?: string;
}

/** studentId → subjectId → promedio (0 si no tiene notas). */
export type BulkAverageResult = Map<string, Map<string, number>>;

/**
 * studentId → subjectId → promedio y si hay notas.
 *
 * Un 0 es una nota: con solo el número, «sacó 0» y «no tiene notas» se
 * confunden (ver `gradesService.promedioDelLapso`).
 */
export type BulkAverageDetail = Map<string, Map<string, { promedio: number; conNotas: boolean }>>;

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

/** Nota del lapso a partir de sus criterios, escalada a 20 (nivel 2), y si tiene notas. */
function lapsoNote(criteria: CriterionInput[]): { nota: number; conNotas: boolean } {
    if (criteria.length === 0) return { nota: 0, conNotas: false };
    const result = calculateLapsoAverage(criteria);
    const gradedPts = criteria
        .filter((c) => c.activities.some((a) => a.score !== null && a.score !== undefined && !Number.isNaN(a.score)))
        .reduce((s, c) => s + (c.puntos || 0), 0);
    // Igual que `gradesService.promedioDelLapso`: se escala a 20 siempre que lo
    // calificado no sean justo 20 puntos (dos planes, si se cambió de sección).
    const scaled = gradedPts > 0 && Math.abs(gradedPts - 20) > 0.009 ? result.total * (20 / gradedPts) : result.total;
    return { nota: Math.round(scaled * 100) / 100, conNotas: result.gradedActivities > 0 };
}

export async function bulkSubjectAverages(
    prisma: PrismaClient,
    params: BulkAverageParams
): Promise<BulkAverageResult> {
    const detalle = await bulkSubjectAveragesConDatos(prisma, params);
    const result: BulkAverageResult = new Map();
    detalle.forEach((materias, studentId) => {
        const numeros = new Map<string, number>();
        materias.forEach((v, subjectId) => numeros.set(subjectId, v.promedio));
        result.set(studentId, numeros);
    });
    return result;
}

export async function bulkSubjectAveragesConDatos(
    prisma: PrismaClient,
    { classroomId, studentIds, subjectIds, periodId }: BulkAverageParams
): Promise<BulkAverageDetail> {
    const empty: BulkAverageDetail = new Map(
        studentIds.map((id) => [id, new Map<string, { promedio: number; conNotas: boolean }>()])
    );
    if (studentIds.length === 0 || subjectIds.length === 0) return empty;

    // --- 4 consultas para toda la sección ---
    //
    // Las filas del plan y las actividades se piden del CICLO entero (no solo de
    // esta sección) para el alumno que se cambió de sección: sus notas de la
    // anterior siguen contando (SEC-05, mismas reglas que
    // `gradesService.seccionesDelAlumno`). Siguen siendo 4 consultas: de las
    // otras secciones solo vienen las actividades con notas de estos alumnos.
    const delMismoCiclo = { academicYear: { classrooms: { some: { id: classroomId } } } };
    const [lapsosDelCiclo, rowsDelCiclo, grades, activities] = await Promise.all([
        // Todos los lapsos del ciclo, con sus fechas: hacen falta para saber de
        // qué lapso es una nota suelta de Clase en Vivo (LAP-03).
        prisma.period.findMany({
            where: periodId ? { OR: [{ id: periodId }, delMismoCiclo] } : delMismoCiclo,
            select: { id: true, name: true, startDate: true, endDate: true },
            orderBy: { startDate: 'asc' },
        }),
        prisma.evaluationPlanRow.findMany({
            where: { classroom: delMismoCiclo, subjectId: { in: subjectIds }, rowType: 'EVALUATION' },
            select: { id: true, puntos: true, activityId: true, subjectId: true, lapso: true, classroomId: true },
        }),
        prisma.grade.findMany({
            where: { studentId: { in: studentIds }, subjectId: { in: subjectIds } },
            select: { studentId: true, subjectId: true, score: true, periodId: true, activityId: true },
        }),
        prisma.$queryRaw<Array<{
            id: string;
            subjectId: string;
            planRowId: string | null;
            maxScore: number | null;
            scores: unknown;
            classroomId: string;
            fechaDeLaClase: Date | null;
            dueDate: Date | null;
            createdAt: Date | null;
        }>>`
            SELECT ca.id, ca."subjectId", ca."planRowId", ca."maxScore", ca.scores, ca."classroomId",
                   cs.date AS "fechaDeLaClase", ca."dueDate", ca."createdAt"
              FROM class_activities ca
              JOIN classrooms c ON c.id = ca."classroomId"
              LEFT JOIN class_sessions cs ON cs.id = ca."classSessionId"
              JOIN classrooms mia ON mia.id = ${classroomId}
             WHERE ca."subjectId" = ANY(${subjectIds}::text[])
               AND c."academicYearId" = mia."academicYearId"
               AND (ca."classroomId" = ${classroomId}
                    OR (jsonb_typeof(ca.scores) = 'object' AND ca.scores ?| ${studentIds}::text[]))`,
    ]);

    const periods = periodId ? lapsosDelCiclo.filter((p) => p.id === periodId) : lapsosDelCiclo;
    if (periods.length === 0) return empty;

    const rows = rowsDelCiclo.filter((r) => r.classroomId === classroomId);
    const lapsoDeLaFila = new Map(rowsDelCiclo.map((r) => [r.id, r.lapso]));
    /** De qué lapso (id) es cada actividad: la del criterio, por su criterio; la suelta, por su fecha. */
    const deQueLapso = (a: { planRowId: string | null; fechaDeLaClase: Date | null; dueDate: Date | null; createdAt: Date | null }) =>
        a.planRowId && lapsoDeLaFila.has(a.planRowId)
            ? { porCriterio: lapsoDeLaFila.get(a.planRowId)! }
            : { porFecha: lapsoDeLaFecha(fechaDeLaActividad(a), lapsosDelCiclo) };

    /**
     * EL ALUMNO QUE SE CAMBIÓ DE SECCIÓN TRAE SUS NOTAS
     *
     * Además de esta sección, cuentan las otras del mismo ciclo donde el alumno
     * tiene notas de la materia: una actividad de clase con su nota, o una fila
     * del plan cuya actividad tiene su nota. Sin esto, la lista de la sección
     * nueva enseñaba un promedio sin lo que sacó en la anterior (SEC-05).
     */
    const otrasDe = new Map<string, Set<string>>();
    const apuntar = (studentId: string, subjectId: string, aula: string) => {
        const k = `${studentId}|${subjectId}`;
        if (!otrasDe.has(k)) otrasDe.set(k, new Set());
        otrasDe.get(k)!.add(aula);
    };
    const actividadesDeFuera = activities.filter((a) => a.classroomId !== classroomId);
    for (const a of actividadesDeFuera) {
        const notas = parseScores(a.scores);
        for (const sid of studentIds) {
            if (typeof notas[sid] === 'number') apuntar(sid, a.subjectId, a.classroomId);
        }
    }
    const filaDeLaActividad = new Map<string, string>();
    for (const r of rowsDelCiclo) {
        if (r.activityId && r.classroomId !== classroomId) filaDeLaActividad.set(r.activityId, r.classroomId);
    }
    if (filaDeLaActividad.size > 0) {
        for (const g of grades) {
            const aula = g.activityId ? filaDeLaActividad.get(g.activityId) : undefined;
            if (aula && g.score !== null) apuntar(g.studentId, g.subjectId, aula);
        }
    }
    const filasDeFuera = rowsDelCiclo.filter((r) => r.classroomId !== classroomId);

    // --- Índices en memoria ---
    const actScores = activities.filter((a) => a.classroomId === classroomId).map((a) => ({
        subjectId: a.subjectId,
        planRowId: a.planRowId,
        maxScore: a.maxScore ?? 20,
        scores: parseScores(a.scores),
        lapso: deQueLapso(a),
    }));
    const actScoresDeFuera = actividadesDeFuera.map((a) => ({
        classroomId: a.classroomId,
        subjectId: a.subjectId,
        planRowId: a.planRowId,
        maxScore: a.maxScore ?? 20,
        scores: parseScores(a.scores),
        lapso: deQueLapso(a),
    }));

    const gradesByStudent = new Map<string, typeof grades>();
    for (const g of grades) {
        if (!gradesByStudent.has(g.studentId)) gradesByStudent.set(g.studentId, []);
        gradesByStudent.get(g.studentId)!.push(g);
    }

    const result: BulkAverageDetail = new Map(
        studentIds.map((id) => [id, new Map<string, { promedio: number; conNotas: boolean }>()])
    );

    for (const subjectId of subjectIds) {
        // Notas sueltas de Clase en Vivo de esta materia (sin criterio del plan)
        const subjectActs = actScores.filter((a) => a.subjectId === subjectId);

        for (const studentId of studentIds) {
            const studentGrades = (gradesByStudent.get(studentId) ?? []).filter((g) => g.subjectId === subjectId);
            const notasPorLapso: number[] = [];
            const suyasDeFuera = otrasDe.get(`${studentId}|${subjectId}`);
            const susFilas = suyasDeFuera
                ? [...rows, ...filasDeFuera.filter((r) => suyasDeFuera.has(r.classroomId))]
                : rows;
            const susActs = suyasDeFuera
                ? [...subjectActs, ...actScoresDeFuera.filter((a) => a.subjectId === subjectId && suyasDeFuera.has(a.classroomId))]
                : subjectActs;

            for (const period of periods) {
                const lapso = periodNameToLapso(period.name);
                const criterios = susFilas.filter(
                    (r) => r.subjectId === subjectId && r.lapso === lapso && (r.puntos || 0) > 0
                );

                let criteria: CriterionInput[];

                if (criterios.length === 0) {
                    // Sin plan: todas las notas valen igual, vengan de donde vengan
                    const acts: CriterionActivityGrade[] = [];
                    studentGrades
                        .filter((g) => g.periodId === period.id && g.score !== null)
                        .forEach((g) => acts.push({ score: g.score as number, maxScore: 20 }));
                    susActs.forEach((a) => {
                        // Solo las de ESTE lapso (LAP-03): antes entraban todas en todos.
                        const esDeEsteLapso = 'porCriterio' in a.lapso
                            ? a.lapso.porCriterio === lapso
                            : a.lapso.porFecha === null || a.lapso.porFecha === period.id;
                        if (!esDeEsteLapso) return;
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
                        susActs
                            .filter((a) => a.planRowId === r.id)
                            .forEach((a) => {
                                const score = a.scores[studentId];
                                if (score !== undefined && score !== null)
                                    acts.push({ score, maxScore: a.maxScore });
                            });
                        return { puntos: r.puntos || 0, activities: acts };
                    });
                }

                // Un lapso sin notas no pesa (regla de exclusión); uno con
                // notas en 0, sí: un 0 es una nota.
                const { nota, conNotas } = lapsoNote(criteria);
                if (conNotas) notasPorLapso.push(nota);
            }

            const promedio =
                notasPorLapso.length > 0
                    ? Math.round((notasPorLapso.reduce((a, b) => a + b, 0) / notasPorLapso.length) * 100) / 100
                    : 0;
            result.get(studentId)!.set(subjectId, { promedio, conNotas: notasPorLapso.length > 0 });
        }
    }

    return result;
}
