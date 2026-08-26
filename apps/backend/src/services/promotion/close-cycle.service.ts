import { PrismaClient } from '@prisma/client';
import { gradesService } from '../grades.service';
import { getStrategy, Assignment, StudentForPlacement, SectionOption } from './strategies';
import { platformPrisma } from '../../config/database';

/**
 * =====================================================================
 * CIERRE DE CICLO ESCOLAR + PROSECUCIÓN — Fase 3.5 Parte C
 * =====================================================================
 * Regla de negocio: CONFIGURABLE POR INSTITUCIÓN (no fija):
 *   - notaMinimaAprobatoria        (default 10)
 *   - maxMateriasPendientesParaPromover (default 2; 0 = sin pendientes)
 *   - permitePendientesEnUltimoAno (default false)
 *
 * Flujo:
 *  1. prepareClose → calcula el RESULTADO SUGERIDO por estudiante (no definitivo).
 *  2. El admin revisa y edita cada caso en la pantalla de revisión.
 *  3. confirmClose → aplica lo que dejó el admin: AcademicRecord por estudiante,
 *     promoción y asignación de sección en el año siguiente (según la estrategia
 *     elegida, SIEMPRE editable antes de confirmar).
 *
 * Idempotencia: el cierre no puede ejecutarse dos veces sobre el mismo ciclo
 * (si ya existen AcademicRecords de ese año → 409 CLOSE_ALREADY_EXECUTED).
 */

export interface AcademicConfig {
    notaMinimaAprobatoria: number;
    maxMateriasPendientesParaPromover: number;
    permitePendientesEnUltimoAno: boolean;
}

export const DEFAULT_ACADEMIC_CONFIG: AcademicConfig = {
    notaMinimaAprobatoria: 10,
    maxMateriasPendientesParaPromover: 2,
    permitePendientesEnUltimoAno: false,
};

/** Lee (o crea con defaults) la configuración académica del instituto en la platform DB. */
export async function getAcademicConfig(instituteId: string): Promise<AcademicConfig> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    if (!inst) return { ...DEFAULT_ACADEMIC_CONFIG };
    const raw = (inst.academicConfig || {}) as Partial<AcademicConfig>;
    return {
        notaMinimaAprobatoria: typeof raw.notaMinimaAprobatoria === 'number' ? raw.notaMinimaAprobatoria : DEFAULT_ACADEMIC_CONFIG.notaMinimaAprobatoria,
        maxMateriasPendientesParaPromover: typeof raw.maxMateriasPendientesParaPromover === 'number' ? raw.maxMateriasPendientesParaPromover : DEFAULT_ACADEMIC_CONFIG.maxMateriasPendientesParaPromover,
        permitePendientesEnUltimoAno: typeof raw.permitePendientesEnUltimoAno === 'boolean' ? raw.permitePendientesEnUltimoAno : DEFAULT_ACADEMIC_CONFIG.permitePendientesEnUltimoAno,
    };
}

export async function updateAcademicConfig(instituteId: string, patch: Partial<AcademicConfig>): Promise<AcademicConfig> {
    const current = await getAcademicConfig(instituteId);
    const next: AcademicConfig = {
        notaMinimaAprobatoria: patch.notaMinimaAprobatoria ?? current.notaMinimaAprobatoria,
        maxMateriasPendientesParaPromover: patch.maxMateriasPendientesParaPromover ?? current.maxMateriasPendientesParaPromover,
        permitePendientesEnUltimoAno: patch.permitePendientesEnUltimoAno ?? current.permitePendientesEnUltimoAno,
    };
    await platformPrisma.institute.update({
        where: { id: instituteId },
        data: { academicConfig: next as any },
    });
    return next;
}

export type SuggestionStatus = 'PROMOVIDO' | 'PROMOVIDO_CON_PENDIENTES' | 'NO_PROMOVIDO';

export interface StudentSuggestion {
    studentId: string;
    name: string;
    gender: string | null;
    currentSection: string | null;
    gradeLevel: number;
    subjectGrades: Array<{ subjectId: string; subjectName: string; average: number; approved: boolean }>;
    pendingCount: number;
    finalAverage: number;
    suggestedStatus: SuggestionStatus;
}

export interface PrepareCloseResult {
    academicYearId: string;
    config: AcademicConfig;
    suggestions: StudentSuggestion[];
}

/** 1. Calcula los resultados SUGERIDOS (no definitivos). */
export async function prepareClose(prisma: any, academicYearId: string, instituteId: string): Promise<PrepareCloseResult> {
    const config = await getAcademicConfig(instituteId);

    const enrollments = await prisma.studentClassroom.findMany({
        where: { academicYearId, isActive: true },
        include: {
            student: {
                select: {
                    id: true, firstName: true, lastName: true, gender: true,
                },
            },
            classroom: {
                select: {
                    id: true, section: true, grade: true,
                    subjects: {
                        include: { subject: { select: { id: true, name: true } } },
                    },
                },
            },
        },
    });

    const suggestions: StudentSuggestion[] = [];
    for (const enr of enrollments) {
        const classroom = enr.classroom;
        const subjectGrades: StudentSuggestion['subjectGrades'] = [];
        for (const cs of classroom.subjects) {
            // Promedio final por materia (Nivel 2 combinando los lapsos)
            const avg = await gradesService.calculateWeightedSubjectAverage(prisma, enr.studentId, cs.subjectId);
            subjectGrades.push({
                subjectId: cs.subjectId,
                subjectName: cs.subject.name,
                average: avg,
                approved: avg >= config.notaMinimaAprobatoria,
            });
        }
        // Pendientes = materias reprobadas. Una materia SIN notas (0) NO cuenta
        // como reprobada (no hay dato); solo cuentan las calificadas bajo la nota.
        const pendingCount = subjectGrades.filter(sg => sg.average > 0 && sg.average < config.notaMinimaAprobatoria).length;
        const graded = subjectGrades.filter(sg => sg.average > 0);
        const finalAverage = graded.length > 0
            ? Math.round((graded.reduce((a, b) => a + b.average, 0) / graded.length) * 100) / 100
            : 0;

        let suggestedStatus: SuggestionStatus;
        if (pendingCount === 0) {
            suggestedStatus = 'PROMOVIDO';
        } else if (classroom.grade === 5 && !config.permitePendientesEnUltimoAno) {
            // Último año: sin pendientes permitidas (configurable)
            suggestedStatus = 'NO_PROMOVIDO';
        } else if (pendingCount <= config.maxMateriasPendientesParaPromover) {
            suggestedStatus = 'PROMOVIDO_CON_PENDIENTES';
        } else {
            suggestedStatus = 'NO_PROMOVIDO';
        }

        suggestions.push({
            studentId: enr.studentId,
            name: `${enr.student.firstName} ${enr.student.lastName}`.trim(),
            gender: enr.student.gender,
            currentSection: classroom.section,
            gradeLevel: classroom.grade,
            subjectGrades,
            pendingCount,
            finalAverage,
            suggestedStatus,
        });
    }

    return { academicYearId, config, suggestions };
}

export interface CloseDecision {
    studentId: string;
    /** Resultado FINAL tras la revisión del admin (puede diferir de la sugerencia). */
    finalResult: SuggestionStatus;
    /** Sección asignada en el año siguiente (editable por el admin). */
    assignedClassroomId?: string | null;
}

export interface CloseConfirmInput {
    academicYearId: string;
    decisions: CloseDecision[];
    strategyKey?: string;
    strategyMode?: string;
}

export interface CloseConfirmResult {
    closed: boolean;
    records: Array<{ studentId: string; finalResult: string; assignedClassroomId: string | null }>;
    placements: Assignment[];
}

/**
 * 2. Aplica el cierre SOLO con los datos confirmados por el admin.
 * Idempotente: si el ciclo ya tiene AcademicRecords → 409.
 */
export async function confirmClose(    prisma: PrismaClient,
    input: CloseConfirmInput,
    instituteId: string
): Promise<CloseConfirmResult> {
    // ============================================================
    // CORRECCIÓN (Parte 1 — atomicidad): TODA la operación de cierre corre
    // dentro de UNA ÚNICA transacción. Si cualquier paso falla (record,
    // enrollment, marcado final), TODO se revierte y el ciclo queda
    // exactamente como estaba → un reintento siempre es seguro.
    // El marcado "COMPLETED" es LITERALMENTE el último paso de la tx.
    // ============================================================
    return prisma.$transaction(async (tx) => {
        // Idempotencia: no se puede cerrar dos veces el mismo ciclo
        const existing = await tx.academicRecord.count({ where: { academicYearId: input.academicYearId } });
        if (existing > 0) {
            throw Object.assign(new Error('El ciclo ya fue cerrado'), { code: 'CLOSE_ALREADY_EXECUTED', statusCode: 409 });
        }

        // Datos base para los registros (mismos que prepareClose usa)
        const prepared = await prepareClose(tx, input.academicYearId, instituteId);
        const config = prepared.config;

        const decisionById = new Map(input.decisions.map(d => [d.studentId, d]));

        // Año siguiente (por fecha) para la estrategia por defecto
        const currentYear = await tx.academicYear.findUnique({ where: { id: input.academicYearId }, select: { startDate: true } });
        const nextAcademicYear = currentYear
            ? await tx.academicYear.findFirst({
                where: { startDate: { gt: currentYear.startDate } },
                orderBy: { startDate: 'asc' },
                select: { id: true, name: true, classrooms: { select: { id: true, section: true } } },
            })
            : null;

        // Aplicar decisiones del admin (finalResult + sección manual si vino)
        const promotedStudents: Array<{ suggestion: StudentSuggestion; decision: CloseDecision }> = [];
        const manualSectionAssignments = new Map<string, string | null>();

        for (const s of prepared.suggestions) {
            const decision = decisionById.get(s.studentId) || {
                studentId: s.studentId,
                finalResult: s.suggestedStatus,
                assignedClassroomId: null,
            };
            if (decision.assignedClassroomId !== undefined) {
                manualSectionAssignments.set(s.studentId, decision.assignedClassroomId);
            }
            if (decision.finalResult !== 'NO_PROMOVIDO') {
                promotedStudents.push({ suggestion: s, decision });
            }
        }

        // Estrategia de asignación de sección (para los promocionados sin sección manual)
        let placements: Assignment[] = [];
        if (nextAcademicYear && promotedStudents.length > 0) {
            const sections: SectionOption[] = nextAcademicYear.classrooms.map(c => ({ id: c.id, section: c.section }));
            const studentsForPlacement: StudentForPlacement[] = promotedStudents.map(({ suggestion }) => ({
                id: suggestion.studentId,
                average: suggestion.finalAverage,
                gender: suggestion.gender,
                currentSection: suggestion.currentSection,
                name: suggestion.name,
            }));
            if (input.strategyKey && input.strategyKey !== 'manual') {
                const strategy = getStrategy(input.strategyKey);
                placements = strategy.assign(studentsForPlacement, sections, { mode: input.strategyMode });
            }
        }

        // Resolver aulas destino (para conocer su academicYearId al matricular)
        const assignedIds = new Set<string>();
        promotedStudents.forEach(({ suggestion }) => {
            const manual = manualSectionAssignments.get(suggestion.studentId);
            const auto = placements.find(p => p.studentId === suggestion.studentId);
            const id = manual !== undefined ? manual : auto?.sectionId ?? null;
            if (id) assignedIds.add(id);
        });
        const destClassrooms = assignedIds.size > 0
            ? await tx.classroom.findMany({
                where: { id: { in: [...assignedIds] } },
                select: { id: true, academicYearId: true },
            })
            : [];
        const academicYearByClassroom = new Map(destClassrooms.map(c => [c.id, c.academicYearId]));

        // 1) Escribir AcademicRecords + matricular en el aula destino (mismo paso atómico)
        const records: CloseConfirmResult['records'] = [];
        for (const { suggestion, decision } of promotedStudents) {
            const manual = manualSectionAssignments.get(suggestion.studentId);
            const auto = placements.find(p => p.studentId === suggestion.studentId);
            const assignedId = manual !== undefined ? manual : auto?.sectionId ?? null;

            await tx.academicRecord.create({
                data: {
                    studentId: suggestion.studentId,
                    academicYearId: input.academicYearId,
                    sectionSnapshot: suggestion.currentSection || '',
                    finalAverage: suggestion.finalAverage,
                    status: 'COMPLETED',
                    finalResult: decision.finalResult,
                    pendingSubjects: suggestion.subjectGrades.filter(sg => sg.average > 0 && sg.average < config.notaMinimaAprobatoria).map(sg => sg.subjectName),
                    subjectGrades: suggestion.subjectGrades.map(sg => ({ subjectId: sg.subjectId, subjectName: sg.subjectName, average: sg.average })),
                    assignedClassroomId: assignedId,
                },
            });

            // APLICAR la promoción: matricular en el aula destino del año elegido.
            // Si la sección destino no existe → error DENTRO de la transacción
            // (todo se revierte; el ciclo queda exactamente como estaba).
            if (assignedId) {
                const destYearId = academicYearByClassroom.get(assignedId);
                if (!destYearId) {
                    throw Object.assign(new Error(`Sección destino inválida: ${assignedId}`), { code: 'INVALID_ASSIGNED_CLASSROOM', statusCode: 400 });
                }
                await tx.studentClassroom.upsert({
                    where: { studentId_academicYearId: { studentId: suggestion.studentId, academicYearId: destYearId } },
                    update: { classroomId: assignedId, isActive: true },
                    create: {
                        studentId: suggestion.studentId,
                        classroomId: assignedId,
                        academicYearId: destYearId,
                        isActive: true,
                    },
                });
                await tx.user.update({
                    where: { id: suggestion.studentId },
                    data: { classroomId: assignedId },
                });
            }
            records.push({ studentId: suggestion.studentId, finalResult: decision.finalResult, assignedClassroomId: assignedId });
        }

        // Repitentes: registro sin promoción
        for (const s of prepared.suggestions) {
            if (decisionById.get(s.studentId)?.finalResult === 'NO_PROMOVIDO' || (!decisionById.has(s.studentId) && s.suggestedStatus === 'NO_PROMOVIDO')) {
                await tx.academicRecord.create({
                    data: {
                        studentId: s.studentId,
                        academicYearId: input.academicYearId,
                        sectionSnapshot: s.currentSection || '',
                        finalAverage: s.finalAverage,
                        status: 'COMPLETED',
                        finalResult: 'NO_PROMOVIDO',
                        pendingSubjects: s.subjectGrades.filter(sg => sg.average > 0 && sg.average < config.notaMinimaAprobatoria).map(sg => sg.subjectName),
                        subjectGrades: s.subjectGrades.map(sg => ({ subjectId: sg.subjectId, subjectName: sg.subjectName, average: sg.average })),
                        assignedClassroomId: null,
                    },
                });
                records.push({ studentId: s.studentId, finalResult: 'NO_PROMOVIDO', assignedClassroomId: null });
            }
        }

        // 2) ÚLTIMO paso de la transacción: marcar el año como COMPLETED
        await tx.academicYear.update({
            where: { id: input.academicYearId },
            data: { status: 'COMPLETED' as any },
        });

        return { closed: true, records, placements };
    });
}

export { listStrategies } from './strategies';

// ============================================================
// PARTE 2 (página de promoción) — contexto por niveles + estrategia
// ============================================================

export interface PromotionContext {
    currentYear: { id: string; name: string };
    suggestions: StudentSuggestion[];
    /** Años destino disponibles (desde el actual en adelante; el admin puede
     *  elegir CUALQUIERA — repitencia en el mismo grado del año siguiente,
     *  salto excepcional a un año posterior, etc.). */
    destinationYears: Array<{
        id: string;
        name: string;
        sections: Array<{ id: string; name: string; section: string; grade: number }>;
    }>;
}

/** Contexto para la página de promoción (carga por niveles, una sola llamada). */
export async function getPromotionContext(prisma: PrismaClient, academicYearId: string, instituteId: string): Promise<PromotionContext> {
    const [currentYear, suggestions, years] = await Promise.all([
        prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true, name: true, startDate: true } }),
        prepareClose(prisma, academicYearId, instituteId),
        prisma.academicYear.findMany({
            select: {
                id: true,
                name: true,
                startDate: true,
                classrooms: { select: { id: true, name: true, section: true, grade: true } },
            },
        }),
    ]);

    if (!currentYear) throw new Error('Academic year not found');

    // Años destino: TODOS desde el ciclo actual en adelante (año destino libre,
    // no limitado al inmediato siguiente — incluye repitencia en el mismo grado
    // del ciclo siguiente y saltos excepcionales).
    const destinationYears = years
        .filter(y => y.startDate >= currentYear.startDate)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
        .map(y => ({
            id: y.id,
            name: y.name,
            sections: y.classrooms.map(c => ({ id: c.id, name: c.name, section: c.section, grade: c.grade })),
        }));

    return { currentYear: { id: currentYear.id, name: currentYear.name }, suggestions: suggestions.suggestions, destinationYears };
}

export interface StrategyPreviewResult {
    assignments: Array<{ studentId: string; sectionId: string | null }>;
    /** Año destino usado por la estrategia (el inmediato siguiente, o null). */
    yearId: string | null;
}

/** Previsualiza una estrategia sobre TODOS los estudiantes (punto de partida editable). */
export async function previewStrategyAssignment(
    prisma: PrismaClient,
    academicYearId: string,
    instituteId: string,
    strategyKey: string,
    strategyMode?: string
): Promise<StrategyPreviewResult> {
    const prepared = await prepareClose(prisma, academicYearId, instituteId);
    const currentYear = await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { startDate: true } });
    const nextYear = currentYear
        ? await prisma.academicYear.findFirst({
            where: { startDate: { gt: currentYear.startDate } },
            orderBy: { startDate: 'asc' },
            select: { id: true, classrooms: { select: { id: true, section: true } } },
        })
        : null;

    const students: StudentForPlacement[] = prepared.suggestions
        .filter(s => s.suggestedStatus !== 'NO_PROMOVIDO')
        .map(s => ({
            id: s.studentId,
            average: s.finalAverage,
            gender: s.gender,
            currentSection: s.currentSection,
            name: s.name,
        }));

    if (!nextYear || students.length === 0) {
        return { assignments: students.map(s => ({ studentId: s.id, sectionId: null })), yearId: nextYear?.id ?? null };
    }

    const sections: SectionOption[] = nextYear.classrooms.map(c => ({ id: c.id, section: c.section }));
    const strategy = getStrategy(strategyKey);
    const assignments = strategy.assign(students, sections, { mode: strategyMode });
    return { assignments, yearId: nextYear.id };
}

/**
 * Completitud de asignación: estudiantes (promovidos) SIN destino.
 * La página deshabilita "Confirmar y Cerrar Ciclo" mientras este arreglo no
 * esté vacío (100% de TODOS los años/secciones con destino asignado).
 */
export function missingAssignmentIds(
    suggestions: Array<Pick<StudentSuggestion, 'studentId' | 'suggestedStatus'>>,
    assignments: Map<string, string | null> | Record<string, string | null>
): string[] {
    const get = (sid: string): string | null | undefined =>
        assignments instanceof Map ? assignments.get(sid) : assignments[sid];
    return suggestions
        .filter(s => s.suggestedStatus !== 'NO_PROMOVIDO')
        .filter(s => !get(s.studentId))
        .map(s => s.studentId);
}
