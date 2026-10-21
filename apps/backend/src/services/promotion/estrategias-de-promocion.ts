import { prepareClose, PromotionContext } from './close-cycle.service';
import { PrismaClient } from '@prisma/client';
import { getStrategy, StudentForPlacement, SectionOption } from './strategies';

/** Contexto completo para la pantalla de promoción */
/**
 * Estudiantes que todavía NO tienen destino. Mientras la lista no esté vacía, el
 * botón "Confirmar" del cierre de ciclo tiene que seguir bloqueado: cerrar el
 * año con alguien sin destino lo deja fuera del ciclo siguiente.
 *
 * Acepta tanto un Map como un objeto plano, que es como lo maneja la pantalla.
 * Un valor vacío (null, '' o ausente) cuenta como "sin destino"; una acción
 * terminal (graduado, retirado) cuenta como destino.
 */
export function missingAssignmentIds(
    suggestions: Array<{ studentId: string }>,
    assignments: Map<string, string | null | undefined> | Record<string, string | null | undefined>
): string[] {
    const valueOf = (studentId: string) =>
        assignments instanceof Map ? assignments.get(studentId) : assignments[studentId];

    return suggestions.filter((s) => !valueOf(s.studentId)).map((s) => s.studentId);
}

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

    const siguiente = allYears.find((y) => y.startDate > currentYear.startDate);

    return {
        currentYear: { id: currentYear.id, name: currentYear.name },
        suggestions: suggestionsData.suggestions,
        destinationYears,
        suggestedNextYearName,
        nextYear: siguiente ? { id: siguiente.id, name: siguiente.name } : null,
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
        // Sin sección solo quien no va a ninguna: el de 5to que repite, sí.
        isLastGrade: s.defaultTargetGrade === null,
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
