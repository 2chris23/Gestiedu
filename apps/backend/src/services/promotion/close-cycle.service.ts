import { PrismaClient } from '@prisma/client';
import { gradesService } from '../grades.service';
import { getStrategy, Assignment, StudentForPlacement, SectionOption } from './strategies';
import { platformPrisma } from '../../config/database';

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
    isLastGrade: boolean;
    defaultTargetGrade: number | null;
    defaultTargetSection: string | null;
    subjectGrades: Array<{ subjectId: string; subjectName: string; average: number; approved: boolean }>;
    failedSubjects: Array<{ name: string; average: number }>;
    pendingCount: number;
    finalAverage: number;
    suggestedStatus: SuggestionStatus;
}

export interface PrepareCloseResult {
    academicYearId: string;
    config: AcademicConfig;
    suggestions: StudentSuggestion[];
}

/** 1. Calcula los resultados sugeridos evaluando notas reales y reglas de grado */
export async function prepareClose(prisma: any, academicYearId: string, instituteId: string): Promise<PrepareCloseResult> {
    const config = await getAcademicConfig(instituteId);

    const enrollments = await prisma.studentClassroom.findMany({
        where: { academicYearId, isActive: true },
        include: {
            student: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    gender: true,
                },
            },
            classroom: {
                select: {
                    id: true,
                    section: true,
                    grade: true,
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
            const avg = await gradesService.calculateWeightedSubjectAverage(prisma, enr.studentId, cs.subjectId);
            subjectGrades.push({
                subjectId: cs.subjectId,
                subjectName: cs.subject.name,
                average: avg,
                approved: avg >= config.notaMinimaAprobatoria,
            });
        }

        const failed = subjectGrades.filter(sg => sg.average > 0 && sg.average < config.notaMinimaAprobatoria);
        const pendingCount = failed.length;
        const graded = subjectGrades.filter(sg => sg.average > 0);
        const finalAverage = graded.length > 0
            ? Math.round((graded.reduce((a, b) => a + b.average, 0) / graded.length) * 100) / 100
            : 0;

        const isLastGrade = classroom.grade >= 5;

        let suggestedStatus: SuggestionStatus;
        if (pendingCount === 0) {
            suggestedStatus = 'PROMOVIDO';
        } else if (isLastGrade && !config.permitePendientesEnUltimoAno) {
            suggestedStatus = 'NO_PROMOVIDO';
        } else if (pendingCount <= config.maxMateriasPendientesParaPromover) {
            suggestedStatus = 'PROMOVIDO_CON_PENDIENTES';
        } else {
            suggestedStatus = 'NO_PROMOVIDO';
        }

        let defaultTargetGrade: number | null = null;
        if (isLastGrade) {
            defaultTargetGrade = null; // Egresado
        } else if (suggestedStatus === 'NO_PROMOVIDO') {
            defaultTargetGrade = classroom.grade; // Repite en su mismo año
        } else {
            defaultTargetGrade = classroom.grade + 1; // Pasa al siguiente año
        }

        suggestions.push({
            studentId: enr.studentId,
            name: `${enr.student.firstName} ${enr.student.lastName}`.trim(),
            gender: enr.student.gender,
            currentSection: classroom.section,
            gradeLevel: classroom.grade,
            isLastGrade,
            defaultTargetGrade,
            defaultTargetSection: classroom.section,
            subjectGrades,
            failedSubjects: failed.map(f => ({ name: f.subjectName, average: f.average })),
            pendingCount,
            finalAverage,
            suggestedStatus,
        });
    }

    return { academicYearId, config, suggestions };
}

export interface CloseDecision {
    studentId: string;
    finalResult: SuggestionStatus;
    action?: 'ENROLL' | 'GRADUATE' | 'RETIRE_KEEP_HISTORY' | 'RETIRE_DELETE';
    targetGrade?: number | null;
    assignedClassroomId?: string | null;
    targetSectionLetter?: string | null;
}

export interface CloseConfirmInput {
    academicYearId: string;
    decisions: CloseDecision[];
    strategyKey?: string;
    strategyMode?: string;
    autoCreateNextYear?: boolean;
    nextYearName?: string;
}

export interface CloseConfirmResult {
    closed: boolean;
    records: Array<{ studentId: string; finalResult: string; assignedClassroomId: string | null }>;
    placements: Assignment[];
}

/** 2. Ejecución atómica de Cierre de Ciclo Escolar */
export async function confirmClose(
    prisma: PrismaClient,
    input: CloseConfirmInput,
    instituteId: string
): Promise<CloseConfirmResult> {
    return prisma.$transaction(async (tx) => {
        // 1. Verificar idempotencia
        const existing = await tx.academicRecord.count({ where: { academicYearId: input.academicYearId } });
        if (existing > 0) {
            throw Object.assign(new Error('El ciclo ya fue cerrado'), { code: 'CLOSE_ALREADY_EXECUTED', statusCode: 409 });
        }

        const prepared = await prepareClose(tx, input.academicYearId, instituteId);
        const config = prepared.config;
        const currentYear = await tx.academicYear.findUnique({
            where: { id: input.academicYearId },
            include: {
                classrooms: {
                    include: {
                        subjects: true,
                    },
                },
            },
        });

        if (!currentYear) {
            throw new Error('Academic year not found');
        }

        // 2. Buscar o crear automáticamente el año escolar destino si se requiere
        let nextAcademicYear = await tx.academicYear.findFirst({
            where: { startDate: { gt: currentYear.startDate } },
            orderBy: { startDate: 'asc' },
            include: {
                classrooms: true,
            },
        });

        if (!nextAcademicYear && (input.autoCreateNextYear || true)) {
            // Calcular nombre del siguiente ciclo (ej. 2026-2027 -> 2027-2028)
            let nextName = input.nextYearName;
            if (!nextName) {
                const match = currentYear.name.match(/(\d{4})-(\d{4})/);
                if (match) {
                    const y1 = parseInt(match[1]) + 1;
                    const y2 = parseInt(match[2]) + 1;
                    nextName = `${y1}-${y2}`;
                } else {
                    nextName = `${currentYear.name} (Siguiente)`;
                }
            }

            const nextStart = new Date(currentYear.endDate);
            nextStart.setMonth(nextStart.getMonth() + 1);
            const nextEnd = new Date(nextStart);
            nextEnd.setFullYear(nextEnd.getFullYear() + 1);

            nextAcademicYear = await tx.academicYear.create({
                data: {
                    name: nextName,
                    startDate: nextStart,
                    endDate: nextEnd,
                    status: 'ACTIVE',
                    isActive: true,
                },
                include: { classrooms: true },
            });

            // Crear periodo por defecto en el nuevo año
            await tx.period.create({
                data: {
                    academicYearId: nextAcademicYear.id,
                    name: '1er Lapso',
                    startDate: nextStart,
                    endDate: new Date(nextStart.getTime() + 90 * 24 * 60 * 60 * 1000),
                    isActive: true,
                },
            });
        }

        const decisionById = new Map(input.decisions.map(d => [d.studentId, d]));

        // Mapear materias existentes por grado para replicarlas al auto-crear aulas
        const subjectsByGrade = new Map<number, string[]>();
        currentYear.classrooms.forEach(c => {
            if (!subjectsByGrade.has(c.grade)) {
                subjectsByGrade.set(c.grade, c.subjects.map(s => s.subjectId));
            }
        });

        // 3. Procesar cada estudiante
        const records: CloseConfirmResult['records'] = [];
        const placements: Assignment[] = [];

        for (const s of prepared.suggestions) {
            const decision = decisionById.get(s.studentId) || {
                studentId: s.studentId,
                finalResult: s.suggestedStatus,
                action: s.isLastGrade ? 'GRADUATE' : 'ENROLL',
                assignedClassroomId: null,
            };

            // Caso A: Eliminar definitivamente al estudiante
            if (decision.action === 'RETIRE_DELETE') {
                await tx.studentClassroom.deleteMany({ where: { studentId: s.studentId } });
                await tx.grade.deleteMany({ where: { studentId: s.studentId } });
                await tx.user.delete({ where: { id: s.studentId } });
                continue;
            }

            // Caso B: Retirado con conservación de historial
            if (decision.action === 'RETIRE_KEEP_HISTORY') {
                await tx.academicRecord.create({
                    data: {
                        studentId: s.studentId,
                        academicYearId: input.academicYearId,
                        sectionSnapshot: s.currentSection || '',
                        finalAverage: s.finalAverage,
                        status: 'RETIRADO',
                        finalResult: 'NO_PROMOVIDO',
                        pendingSubjects: s.failedSubjects.map(f => f.name),
                        subjectGrades: s.subjectGrades.map(sg => ({ subjectId: sg.subjectId, subjectName: sg.subjectName, average: sg.average })),
                        assignedClassroomId: null,
                    },
                });
                records.push({ studentId: s.studentId, finalResult: 'RETIRADO', assignedClassroomId: null });
                placements.push({ studentId: s.studentId, sectionId: null });
                continue;
            }

            // Caso C: Estudiante de 5to año (Egresado / Graduado)
            if (s.isLastGrade || decision.action === 'GRADUATE') {
                await tx.academicRecord.create({
                    data: {
                        studentId: s.studentId,
                        academicYearId: input.academicYearId,
                        sectionSnapshot: s.currentSection || '',
                        finalAverage: s.finalAverage,
                        status: 'COMPLETED',
                        finalResult: decision.finalResult === 'NO_PROMOVIDO' ? 'NO_PROMOVIDO' : 'PROMOVIDO',
                        pendingSubjects: s.failedSubjects.map(f => f.name),
                        subjectGrades: s.subjectGrades.map(sg => ({ subjectId: sg.subjectId, subjectName: sg.subjectName, average: sg.average })),
                        assignedClassroomId: null,
                    },
                });
                records.push({ studentId: s.studentId, finalResult: 'GRADUATED', assignedClassroomId: null });
                placements.push({ studentId: s.studentId, sectionId: null });
                continue;
            }

            // Caso D: Matricular en el ciclo destino
            let targetClassroomId = decision.assignedClassroomId;

            // Si no vino un ID directo pero sí targetGrade y targetSection (o auto-resolución)
            if (!targetClassroomId && nextAcademicYear) {
                const targetGrade = decision.targetGrade ?? s.defaultTargetGrade ?? s.gradeLevel + 1;
                const targetSection = (decision.targetSectionLetter || s.currentSection || 'A').toUpperCase();

                // Buscar aula en el año destino
                let targetClassroom = await tx.classroom.findFirst({
                    where: {
                        academicYearId: nextAcademicYear.id,
                        grade: targetGrade,
                        section: targetSection,
                    },
                });

                // Auto-crear aula si no existe en el año nuevo
                if (!targetClassroom) {
                    const gradeName = `${targetGrade}º Año ${targetSection}`;
                    targetClassroom = await tx.classroom.create({
                        data: {
                            name: gradeName,
                            slug: `${targetGrade}er-ano-${targetSection.toLowerCase()}-${nextAcademicYear.id}`,
                            grade: targetGrade,
                            section: targetSection,
                            capacity: 35,
                            academicYearId: nextAcademicYear.id,
                        },
                    });

                    // Copiar materias de referencia para este grado
                    const refSubjects = subjectsByGrade.get(targetGrade) || subjectsByGrade.get(1) || [];
                    for (const subId of refSubjects) {
                        await tx.classroomSubject.create({
                            data: {
                                classroomId: targetClassroom.id,
                                subjectId: subId,
                                weeklyBlocks: 4,
                            },
                        }).catch(() => {});
                    }
                }

                targetClassroomId = targetClassroom.id;
            }

            // Guardar registro académico histórico en el ciclo que se cierra
            await tx.academicRecord.create({
                data: {
                    studentId: s.studentId,
                    academicYearId: input.academicYearId,
                    sectionSnapshot: s.currentSection || '',
                    finalAverage: s.finalAverage,
                    status: 'COMPLETED',
                    finalResult: decision.finalResult,
                    pendingSubjects: s.failedSubjects.map(f => f.name),
                    subjectGrades: s.subjectGrades.map(sg => ({ subjectId: sg.subjectId, subjectName: sg.subjectName, average: sg.average })),
                    assignedClassroomId: targetClassroomId,
                },
            });

            // Matricular en el aula destino en el año nuevo
            if (targetClassroomId && nextAcademicYear) {
                await tx.studentClassroom.upsert({
                    where: {
                        studentId_academicYearId: {
                            studentId: s.studentId,
                            academicYearId: nextAcademicYear.id,
                        },
                    },
                    update: { classroomId: targetClassroomId, isActive: true },
                    create: {
                        studentId: s.studentId,
                        classroomId: targetClassroomId,
                        academicYearId: nextAcademicYear.id,
                        isActive: true,
                    },
                });

                await tx.user.update({
                    where: { id: s.studentId },
                    data: { classroomId: targetClassroomId },
                }).catch(() => {});
            }

            records.push({ studentId: s.studentId, finalResult: decision.finalResult, assignedClassroomId: targetClassroomId });
            placements.push({ studentId: s.studentId, sectionId: targetClassroomId });
        }

        // 4. Cerrar el año escolar actual
        await tx.academicYear.update({
            where: { id: input.academicYearId },
            data: { status: 'COMPLETED', isActive: false },
        });

        return { closed: true, records, placements };
    });
}

export interface PromotionContext {
    currentYear: { id: string; name: string };
    suggestions: StudentSuggestion[];
    destinationYears: Array<{
        id: string;
        name: string;
        sections: Array<{
            id: string;
            name: string;
            section: string;
            grade: number;
            capacity: number | null;
            totalStudents: number;
            maleCount: number;
            femaleCount: number;
        }>;
    }>;
    suggestedNextYearName: string;
}

/** Contexto completo para la pantalla de promoción */
export async function getPromotionContext(prisma: PrismaClient, academicYearId: string, instituteId: string): Promise<PromotionContext> {
    const [currentYear, suggestionsData, allYears] = await Promise.all([
        prisma.academicYear.findUnique({
            where: { id: academicYearId },
            select: { id: true, name: true, startDate: true, endDate: true },
        }),
        prepareClose(prisma, academicYearId, instituteId),
        prisma.academicYear.findMany({
            orderBy: { startDate: 'asc' },
            include: {
                classrooms: {
                    include: {
                        studentClassrooms: {
                            where: { isActive: true },
                            include: {
                                student: { select: { gender: true } },
                            },
                        },
                    },
                },
            },
        }),
    ]);

    if (!currentYear) throw new Error('Academic year not found');

    // Calcular nombre sugerido para el siguiente año
    let suggestedNextYearName = '2027-2028';
    const match = currentYear.name.match(/(\d{4})-(\d{4})/);
    if (match) {
        suggestedNextYearName = `${parseInt(match[1]) + 1}-${parseInt(match[2]) + 1}`;
    }

    const destinationYears = allYears
        .filter(y => y.startDate >= currentYear.startDate)
        .map(y => ({
            id: y.id,
            name: y.name,
            sections: y.classrooms.map(c => {
                const total = c.studentClassrooms.length;
                const maleCount = c.studentClassrooms.filter(sc => sc.student.gender === 'MASCULINO').length;
                const femaleCount = c.studentClassrooms.filter(sc => sc.student.gender === 'FEMENINO').length;
                return {
                    id: c.id,
                    name: c.name,
                    section: c.section,
                    grade: c.grade,
                    capacity: c.capacity,
                    totalStudents: total,
                    maleCount,
                    femaleCount,
                };
            }),
        }));

    return {
        currentYear: { id: currentYear.id, name: currentYear.name },
        suggestions: suggestionsData.suggestions,
        destinationYears,
        suggestedNextYearName,
    };
}

/** Previsualiza la asignación de una estrategia automática sobre los estudiantes */
export async function previewStrategyAssignment(
    prisma: PrismaClient,
    academicYearId: string,
    instituteId: string,
    strategyKey: string,
    strategyMode?: string
): Promise<{ assignments: Array<{ studentId: string; sectionId: string | null; targetGrade: number | null; targetSectionLetter: string | null }>; yearId: string | null }> {
    const prepared = await prepareClose(prisma, academicYearId, instituteId);
    const currentYear = await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { startDate: true } });
    
    const nextYear = currentYear
        ? await prisma.academicYear.findFirst({
            where: { startDate: { gt: currentYear.startDate } },
            orderBy: { startDate: 'asc' },
            include: {
                classrooms: {
                    select: { id: true, section: true, grade: true, capacity: true },
                },
            },
        })
        : null;

    const students: StudentForPlacement[] = prepared.suggestions.map(s => ({
        id: s.studentId,
        average: s.finalAverage,
        gender: s.gender,
        currentSection: s.currentSection,
        currentGrade: s.gradeLevel,
        targetGrade: s.defaultTargetGrade,
        isLastGrade: s.isLastGrade,
        name: s.name,
    }));

    const sections: SectionOption[] = (nextYear?.classrooms || []).map(c => ({
        id: c.id,
        section: c.section,
        grade: c.grade,
        capacity: c.capacity,
    }));

    const strategy = getStrategy(strategyKey);
    const rawAssignments = strategy.assign(students, sections, { mode: strategyMode });

    const assignments = rawAssignments.map(a => {
        const student = students.find(s => s.id === a.studentId);
        const section = sections.find(sec => sec.id === a.sectionId);
        return {
            studentId: a.studentId,
            sectionId: a.sectionId,
            targetGrade: student?.targetGrade ?? null,
            targetSectionLetter: section?.section ?? student?.currentSection ?? 'A',
        };
    });

    return { assignments, yearId: nextYear?.id ?? null };
}

export { listStrategies } from './strategies';
