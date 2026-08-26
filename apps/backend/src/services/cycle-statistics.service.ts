import { PrismaClient } from '@prisma/client';
import { RedisCache } from '../config/redis';
import { logger } from '../utils/logger';
import { CACHE_TTL } from '../utils/constants';
import { AttendanceStatus } from '../utils/prisma-enums';
import {
    getCurrentAcademicYear,
    getStudentCurrentEnrollment
} from '../utils/academic-year.utils';
import { gradesService } from './grades.service';
import {
    subjectSectionAverage,
    studentsWithNoteInSubject,
    sectionAverage,
    yearGradeAverage,
    cycleAverage,
} from './aggregation.service';

/**
 * SERVICIO UNIFICADO DE ESTADÍSTICAS - "The Unified Stats Engine"
 * 
 * Motor completo de estadísticas con 5 niveles jerárquicos:
 * - Nivel 0: Estudiante Individual (Máximo Detalle)
 * - Nivel 1: Promedio por Materia Específica
 * - Nivel 2: Promedio General de Sección
 * - Nivel 3: Promedio de Grado/Año
 * - Nivel 4: Promedio Global del Ciclo Escolar
 * 
 * Métricas integradas en todos los niveles:
 * ✅ Promedios de calificaciones
 * ✅ Riesgo académico (estudiantes < 9.5)
 * ✅ Asistencia (%)
 * ✅ Tasas de aprobación
 * 
 * Utiliza detección automática de ciclo actual por fechas.
 */

// Constantes
const PASSING_GRADE = 9.5;      // Nota mínima de aprobación (0-20)
const MIN_ATTENDANCE = 80;      // Asistencia mínima aceptable (%)

/**
 * ========================================
 * NIVEL 0: ESTUDIANTE INDIVIDUAL
 * ========================================
 */

export interface StudentStatisticsResult {
    // Información básica
    studentId: string;
    studentName: string;
    studentCode: string;

    // Promedio histórico (todos los ciclos)
    historicalAverage: number;
    totalCyclesCompleted: number;

    // Ubicación actual (detectada automáticamente)
    currentEnrollment: {
        academicYear: string;
        academicYearId: string;
        grade: number;
        section: string;
        sectionId: string;
        sectionName: string;
    } | null;

    // Estadísticas del ciclo actual (global)
    currentCycleStats: {
        globalAverage: number;
        attendanceRate: number;
        totalObservations: number;
        academicStatus: string;       // "EXCELENTE" | "REGULAR" | "EN_RIESGO" | "CRITICO",
        failingSubjects: number;
        attendanceStats: {
            total: number;
            present: number;
            absent: number;
            late: number;
        };
    };

    // Desglose por materia (ciclo actual)
    subjectDetails: Array<{
        subjectId: string;
        subjectName: string;
        average: number;
        isAtRisk: boolean;
        attendanceRate: number;
        gradeCount: number;
    }>;

    hasData: boolean;
}

/**
 * ========================================
 * OTROS NIVELES (1-4)
 * ========================================
 */

export interface SubjectAverageResult {
    sectionId: string;
    subjectId: string;
    average: number;
    studentCount: number;
    studentsAtRisk: number;
    studentsPassing: number;
    passingRate: number;
    attendanceRate: number;
    hasData: boolean;
}

export interface SectionGlobalAverageResult {
    sectionId: string;
    globalAverage: number;
    studentsAtRisk: number;
    totalStudents: number;
    attendanceRate: number;
    studentsWithLowAttendance: number;
    totalObservations: number;              // ✨ Total de observaciones en la sección
    studentsWithObservations: number;       // ✨ Estudiantes con observaciones
    averageObservationsPerStudent: number;  // ✨ Promedio de observaciones
    subjectAverages: Array<{
        subjectId: string;
        subjectName: string;
        average: number;
        studentsAtRisk: number;
        attendanceRate: number;
    }>;
    hasData: boolean;
}

export interface GradeAverageResult {
    academicYearId: string;
    gradeLevel: number;
    average: number;
    totalStudents: number;
    studentsAtRisk: number;
    passingRate: number;
    attendanceRate: number;
    totalObservations: number;              // ✨ Total de observaciones en el grado
    studentsWithObservations: number;       // ✨ Estudiantes con observaciones
    sectionAverages: Array<{
        sectionId: string;
        sectionName: string;
        average: number;
        studentsAtRisk: number;
        attendanceRate: number;
        totalObservations: number;          // ✨ Por sección
    }>;
    hasData: boolean;
}

export interface CycleGlobalAverageResult {
    academicYearId: string;
    cycleName: string;
    globalAverage: number;
    totalStudents: number;
    studentsAtRisk: number;
    passingRate: number;
    attendanceRate: number;
    totalObservations: number;              // ✨ Total de observaciones en el ciclo
    studentsWithObservations: number;       // ✨ Estudiantes con observaciones
    gradeAverages: Array<{
        gradeLevel: number;
        average: number;
        studentsAtRisk: number;
        totalStudents: number;
        attendanceRate: number;
        totalObservations: number;          // ✨ Por grado
    }>;
    hasData: boolean;
}

class CycleStatisticsService {
    /**
     * ========================================
     * HELPERS INTERNOS: CÁLCULO DE ASISTENCIA
     * (Integrado desde attendance.service.ts)
     * ========================================
     */

    /**
     * Calcula la tasa de asistencia de un estudiante
     */
    private async calculateStudentAttendance(
        prisma: PrismaClient,
        studentId: string,
        sectionId?: string,
        dateFrom?: Date,
        dateTo?: Date
    ): Promise<{
        total: number;
        present: number;
        absent: number;
        late: number;
        rate: number;
    }> {
        const dateFilter: any = {};
        if (dateFrom) dateFilter.gte = dateFrom;
        if (dateTo) dateFilter.lte = dateTo;

        const where: any = { studentId };
        if (sectionId) where.classroomId = sectionId;
        if (Object.keys(dateFilter).length > 0) where.date = dateFilter;

        const records = await prisma.dailyAttendance.findMany({
            where,
            select: { status: true }
        });

        const present = records.filter(r => r.status === AttendanceStatus.PRESENT).length;
        const absent = records.filter(r => r.status === AttendanceStatus.ABSENT).length;
        const late = records.filter(r => r.status === AttendanceStatus.LATE).length;
        const total = records.length;

        const rate = total > 0
            ? ((present + late) / total) * 100
            : 0;

        return {
            total,
            present,
            absent,
            late,
            rate: Math.round(rate * 10) / 10
        };
    }

    /**
     * Calcula la tasa de asistencia promedio de una sección
     */
    private async calculateSectionAttendance(
        prisma: PrismaClient,
        sectionId: string,
        dateFrom?: Date,
        dateTo?: Date
    ): Promise<number> {
        const dateFilter: any = {};
        if (dateFrom) dateFilter.gte = dateFrom;
        if (dateTo) dateFilter.lte = dateTo;

        const where: any = { classroomId: sectionId };
        if (Object.keys(dateFilter).length > 0) where.date = dateFilter;

        const records = await prisma.dailyAttendance.findMany({
            where,
            select: { status: true }
        });

        if (records.length === 0) return 0;

        const attended = records.filter(
            r => r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE
        ).length;

        return Math.round((attended / records.length) * 100 * 10) / 10;
    }

    /**
     * ========================================
     * HELPERS INTERNOS: CÁLCULO DE OBSERVACIONES
     * ========================================
     */

    /**
     * Calcula métricas de observaciones para una sección
     */
    private async calculateSectionObservations(
        prisma: PrismaClient,
        sectionId: string
    ): Promise<{
        total: number;
        studentsWithObservations: number;
        average: number;
    }> {
        // Obtener estudiantes de la sección
        const enrollments = await prisma.studentClassroom.findMany({
            where: {
                classroomId: sectionId,
                isActive: true
            },
            select: { studentId: true }
        });

        const studentIds = enrollments.map(e => e.studentId);

        if (studentIds.length === 0) {
            return { total: 0, studentsWithObservations: 0, average: 0 };
        }

        // Contar observaciones de estos estudiantes
        const [totalObservations, studentsWithObs] = await Promise.all([
            prisma.observation.count({
                where: {
                    studentId: { in: studentIds }
                }
            }),
            prisma.observation.groupBy({
                by: ['studentId'],
                where: {
                    studentId: { in: studentIds }
                },
                _count: {
                    id: true
                }
            })
        ]);

        const studentsWithObservations = studentsWithObs.length;
        const average = studentIds.length > 0
            ? totalObservations / studentIds.length
            : 0;

        return {
            total: totalObservations,
            studentsWithObservations,
            average: Math.round(average * 10) / 10
        };
    }

    /**
     * ========================================
     * NIVEL 0: ESTADÍSTICAS DE ESTUDIANTE INDIVIDUAL
     * ========================================
     */

    async getStudentStatistics(prisma: PrismaClient, studentId: string): Promise<StudentStatisticsResult> {
        const cacheKey = `stats:student:${studentId}:full`;

        try {
            const cached = await RedisCache.get<StudentStatisticsResult>(cacheKey);
            if (cached) return cached;

            // 1. Obtener información básica del estudiante
            const student = await prisma.user.findUnique({
                where: { id: studentId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    studentCode: true,
                    instituteId: true
                }
            });

            if (!student) {
                throw new Error(`Student not found: ${studentId}`);
            }

            const currentEnrollment = await getStudentCurrentEnrollment(prisma, studentId, student.instituteId!);

            // 3. Calcular promedio histórico (todos los ciclos)
            // ✅ OPTIMIZADO: Bulk fetch de todos los enrollments y records
            const allEnrollments = await prisma.studentClassroom.findMany({
                where: { studentId },
                include: {
                    academicYear: {
                        select: {
                            id: true,
                            name: true,
                            status: true
                        }
                    }
                }
            });

            let historicalSum = 0;
            let cyclesWithGrades = 0;

            // Fetch records for COMPLETED years
            const completedYearIds = allEnrollments
                .filter(e => e.academicYear.status === 'COMPLETED')
                .map(e => e.academicYearId);

            const academicRecords = await prisma.academicRecord.findMany({
                where: {
                    studentId,
                    academicYearId: { in: completedYearIds }
                },
                select: { academicYearId: true, finalAverage: true }
            });

            const recordsMap = new Map();
            academicRecords.forEach(r => recordsMap.set(r.academicYearId, r.finalAverage));

            // Fetch grades for ACTIVE/UPCOMING years (where no record exists yet)
            const activeYearIds = allEnrollments
                .filter(e => e.academicYear.status !== 'COMPLETED')
                .map(e => e.academicYearId);

            // Fetch ALL periods for active years to map back
            const periods = await prisma.period.findMany({
                where: { academicYearId: { in: activeYearIds } },
                select: { id: true, academicYearId: true }
            });
            const periodYearMap = new Map();
            periods.forEach(p => periodYearMap.set(p.id, p.academicYearId));

            const gradesInActiveYears = await prisma.grade.findMany({
                where: {
                    studentId,
                    periodId: { in: periods.map(p => p.id) }
                },
                select: { score: true, periodId: true }
            });

            const activeYearGrades = new Map<string, number[]>();
            gradesInActiveYears.forEach(g => {
                const yearId = periodYearMap.get(g.periodId);
                if (yearId) {
                    if (!activeYearGrades.has(yearId)) activeYearGrades.set(yearId, []);
                    activeYearGrades.get(yearId)!.push(g.score ?? 0);
                }
            });

            // Calculate Historical Average
            for (const enrollment of allEnrollments) {
                if (enrollment.academicYear.status === 'COMPLETED') {
                    const avg = recordsMap.get(enrollment.academicYearId);
                    if (avg && avg > 0) {
                        historicalSum += avg;
                        cyclesWithGrades++;
                    }
                } else {
                    const scores = activeYearGrades.get(enrollment.academicYearId);
                    if (scores && scores.length > 0) {
                        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                        if (avg > 0) {
                            historicalSum += avg;
                            cyclesWithGrades++;
                        }
                    }
                }
            }

            const historicalAverage = cyclesWithGrades > 0
                ? Math.round((historicalSum / cyclesWithGrades) * 100) / 100
                : 0;

            // 4. Estadísticas del ciclo actual
            let currentCycleStats: StudentStatisticsResult['currentCycleStats'];
            let subjectDetails: StudentStatisticsResult['subjectDetails'] = [];

            if (currentEnrollment) {
                // ✅ OPTIMIZADO: 3 Queries paralelas para todo lo del ciclo actual
                const [classroomSubjects, allCurrentGrades, attendanceRecords, observationCount] = await Promise.all([
                    prisma.classroomSubject.findMany({
                        where: { classroomId: currentEnrollment.sectionId },
                        include: {
                            subject: { select: { id: true, name: true } }
                        }
                    }),
                    prisma.grade.findMany({
                        where: {
                            studentId,
                            subject: { classroomSubjects: { some: { classroomId: currentEnrollment.sectionId } } },
                            period: { academicYearId: currentEnrollment.academicYearId }
                        },
                        select: {
                            score: true,
                            subjectId: true
                        }
                    }),
                    prisma.dailyAttendance.findMany({
                        where: {
                            studentId,
                            classroomId: currentEnrollment.sectionId
                        },
                        select: { status: true }
                    }),
                    prisma.observation.count({
                        where: { studentId }
                    })
                ]);

                // Process Grades per Subject
                let totalAverage = 0;
                let subjectsWithGrades = 0;
                let failingSubjects = 0;

                const gradesBySubject = new Map<string, number[]>();
                allCurrentGrades.forEach(g => {
                    if (!gradesBySubject.has(g.subjectId)) gradesBySubject.set(g.subjectId, []);
                    gradesBySubject.get(g.subjectId)!.push(g.score ?? 0);
                });

                // Calculate Attendance Rate (Global)
                const totalAttendance = attendanceRecords.length;
                const presentOrLate = attendanceRecords.filter(r =>
                    r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE
                ).length;
                const globalAttendanceRate = totalAttendance > 0
                    ? Math.round((presentOrLate / totalAttendance) * 100 * 10) / 10
                    : 0;

                // Subject Details
                for (const cs of classroomSubjects) {
                    const scores = gradesBySubject.get(cs.subjectId) || [];
                    const avg = scores.length > 0
                        ? scores.reduce((a, b) => a + b, 0) / scores.length
                        : 0;

                    if (scores.length > 0) {
                        totalAverage += avg;
                        subjectsWithGrades++;
                        if (avg < PASSING_GRADE) failingSubjects++;
                    }

                    subjectDetails.push({
                        subjectId: cs.subjectId,
                        subjectName: cs.subject.name,
                        average: Math.round(avg * 100) / 100,
                        isAtRisk: avg > 0 && avg < PASSING_GRADE,
                        attendanceRate: globalAttendanceRate,
                        gradeCount: scores.length
                    });
                }

                const globalAverage = subjectsWithGrades > 0
                    ? totalAverage / subjectsWithGrades
                    : 0;

                // Determine Academic Status
                let academicStatus: string;
                if (globalAverage >= 18) {
                    academicStatus = 'EXCELENTE';
                } else if (failingSubjects >= 2) {
                    academicStatus = 'CRITICO';
                } else if (globalAverage < PASSING_GRADE || failingSubjects >= 1) {
                    academicStatus = 'EN_RIESGO';
                } else {
                    academicStatus = 'REGULAR';
                }

                currentCycleStats = {
                    globalAverage: Math.round(globalAverage * 100) / 100,
                    attendanceRate: globalAttendanceRate,
                    totalObservations: observationCount,
                    academicStatus,
                    failingSubjects,
                    attendanceStats: {
                        total: totalAttendance,
                        present: attendanceRecords.filter(r => r.status === AttendanceStatus.PRESENT).length,
                        absent: attendanceRecords.filter(r => r.status === AttendanceStatus.ABSENT).length,
                        late: attendanceRecords.filter(r => r.status === AttendanceStatus.LATE).length
                    }
                };
            } else {
                // Empty stats
                currentCycleStats = {
                    globalAverage: 0,
                    attendanceRate: 0,
                    totalObservations: 0,
                    academicStatus: 'SIN_ENROLLMENT',
                    failingSubjects: 0,
                    attendanceStats: { total: 0, present: 0, absent: 0, late: 0 }
                };
            }

            const result: StudentStatisticsResult = {
                studentId,
                studentName: `${student.firstName} ${student.lastName}`,
                studentCode: student.studentCode || '',
                historicalAverage,
                totalCyclesCompleted: cyclesWithGrades,
                currentEnrollment: currentEnrollment ? {
                    academicYear: currentEnrollment.academicYearName,
                    academicYearId: currentEnrollment.academicYearId,
                    grade: currentEnrollment.grade,
                    section: currentEnrollment.section,
                    sectionId: currentEnrollment.sectionId,
                    sectionName: currentEnrollment.sectionName
                } : null,
                currentCycleStats,
                subjectDetails,
                hasData: cyclesWithGrades > 0 || subjectDetails.length > 0
            };

            await RedisCache.set(cacheKey, result, CACHE_TTL.SHORT);

            logger.info('Student statistics calculated', {
                studentId,
                historicalAverage,
                currentAverage: currentCycleStats.globalAverage,
                academicStatus: currentCycleStats.academicStatus
            });

            return result;
        } catch (error) {
            logger.error('Error calculating student statistics', {
                error: error instanceof Error ? error.message : 'Unknown error',
                studentId
            });

            throw error;
        }
    }

    /**
     * ========================================
     * NIVEL 1: PROMEDIO POR MATERIA ESPECÍFICA
     * ========================================
     */

    async getSubjectAverage(
        prisma: PrismaClient,
        sectionId: string,
        subjectId: string
    ): Promise<SubjectAverageResult> {
        const cacheKey = `stats:subject:${sectionId}:${subjectId}`;

        try {
            const cached = await RedisCache.get<SubjectAverageResult>(cacheKey);
            if (cached) return cached;

            // Obtener estudiantes de la sección
            const enrollments = await prisma.studentClassroom.findMany({
                where: {
                    classroomId: sectionId,
                    isActive: true
                },
                select: { studentId: true }
            });

            const studentIds = enrollments.map(e => e.studentId);

            if (studentIds.length === 0) {
                return {
                    sectionId,
                    subjectId,
                    average: 0,
                    studentCount: 0,
                    studentsAtRisk: 0,
                    studentsPassing: 0,
                    passingRate: 0,
                    attendanceRate: 0,
                    hasData: false
                };
            }

            // Calcular promedio de la materia — JERARQUÍA (Nivel 3):
            // promedio de los N2 por estudiante excluyendo estudiantes SIN notas
            // (Grade o ClassActivity.scores — las notas de Clase en Vivo cuentan).
            const n3 = await subjectSectionAverage(prisma, sectionId, subjectId);

            // Estudiantes con datos (para riesgo/aprobación) = los que el N3
            // reconoce; sus N2 se consultan una vez más (con cache) para el
            // conteo de riesgo/aprobación en la misma escala ponderada.
            const studentsWithData = await studentsWithNoteInSubject(prisma, sectionId, subjectId);
            let totalAverage = 0;
            let studentsWithGrades = 0;
            let studentsAtRisk = 0;
            let studentsPassing = 0;

            for (const studentId of studentsWithData) {
                const avg = await gradesService.calculateWeightedSubjectAverage(prisma, studentId, subjectId);
                totalAverage += avg;
                studentsWithGrades++;
                if (avg < PASSING_GRADE) {
                    studentsAtRisk++;
                } else {
                    studentsPassing++;
                }
            }

            const average = n3.hasData ? n3.average : 0;

            const passingRate = studentsWithGrades > 0
                ? Math.round((studentsPassing / studentsWithGrades) * 100 * 10) / 10
                : 0;

            // Calcular asistencia de la sección
            const attendanceRate = await this.calculateSectionAttendance(prisma, sectionId);

            const result: SubjectAverageResult = {
                sectionId,
                subjectId,
                average,
                studentCount: studentIds.length,
                studentsAtRisk,
                studentsPassing,
                passingRate,
                attendanceRate,
                hasData: n3.hasData
            };

            await RedisCache.set(cacheKey, result, CACHE_TTL.MEDIUM);

            return result;
        } catch (error) {
            logger.error('Error calculating subject average', {
                error: error instanceof Error ? error.message : 'Unknown error',
                sectionId,
                subjectId
            });
            throw error;
        }
    }

    /**
     * ========================================
     * NIVEL 2: PROMEDIO GENERAL DE SECCIÓN
     * ========================================
     */

    async getSectionGlobalAverage(
        prisma: PrismaClient,
        sectionId: string
    ): Promise<SectionGlobalAverageResult> {
        const cacheKey = `stats:section:${sectionId}:global`;

        try {
            const cached = await RedisCache.get<SectionGlobalAverageResult>(cacheKey);
            if (cached) return cached;

            // ✅ OPTIMIZADO: Fetch initial data (Students & Subjects)
            const [enrollments, classroomSubjects] = await Promise.all([
                prisma.studentClassroom.findMany({
                    where: { classroomId: sectionId, isActive: true },
                    select: { studentId: true }
                }),
                prisma.classroomSubject.findMany({
                    where: { classroomId: sectionId },
                    include: { subject: { select: { id: true, name: true } } }
                })
            ]);

            const studentIds = enrollments.map(e => e.studentId);

            if (studentIds.length === 0) {
                return {
                    sectionId,
                    globalAverage: 0,
                    studentsAtRisk: 0,
                    totalStudents: 0,
                    attendanceRate: 0,
                    studentsWithLowAttendance: 0,
                    totalObservations: 0,
                    studentsWithObservations: 0,
                    averageObservationsPerStudent: 0,
                    subjectAverages: [],
                    hasData: false
                };
            }

            // ✅ OPTIMIZADO: Massive Parallel Fetch
            const [allGrades, attendanceRecords, observationStats] = await Promise.all([
                // 1. All grades for this section's students in these subjects
                prisma.grade.findMany({
                    where: {
                        studentId: { in: studentIds },
                        subjectId: { in: classroomSubjects.map(cs => cs.subjectId) }
                    },
                    select: {
                        studentId: true,
                        subjectId: true,
                        score: true
                    }
                }),
                // 2. All attendance for this section
                prisma.dailyAttendance.findMany({
                    where: { classroomId: sectionId },
                    select: { studentId: true, status: true }
                }),
                // 3. Observations
                this.calculateSectionObservations(prisma, sectionId)
            ]);

            // --- Process Subject Averages (JERARQUÍA: Nivel 3 y 4) ---
            // Cada materia = Nivel 3 (promedio de N2 por estudiante, excluye sin
            // notas e incluye ClassActivity.scores); el promedio global de la
            // sección = Nivel 4 (promedio de los N3 con datos).
            const subjectAverages: any[] = [];

            // Calculate attendance rate for the section
            const totalRecords = attendanceRecords.length;
            const attended = attendanceRecords.filter(r =>
                r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE
            ).length;
            const sectionAttendanceRate = totalRecords > 0
                ? Math.round((attended / totalRecords) * 100 * 10) / 10
                : 0;

            const ssa: SubjectAverageResult[] = [];

            for (const cs of classroomSubjects) {
                const n3 = await subjectSectionAverage(prisma, sectionId, cs.subjectId);
                const studentsWithData = await studentsWithNoteInSubject(prisma, sectionId, cs.subjectId);
                let subjectStudentsAtRisk = 0;
                for (const studentId of studentsWithData) {
                    const avg2 = await gradesService.calculateWeightedSubjectAverage(prisma, studentId, cs.subjectId);
                    if (avg2 !== 0 && avg2 < PASSING_GRADE) subjectStudentsAtRisk++;
                }

                ssa.push({
                    sectionId,
                    subjectId: cs.subjectId,
                    average: n3.hasData ? n3.average : 0,
                    studentCount: studentsWithData.size,
                    studentsAtRisk: subjectStudentsAtRisk,
                    studentsPassing: 0,
                    passingRate: 0,
                    attendanceRate: sectionAttendanceRate,
                    hasData: n3.hasData,
                });

                subjectAverages.push({
                    subjectId: cs.subjectId,
                    subjectName: cs.subject.name,
                    average: n3.hasData ? Math.round(n3.average * 100) / 100 : 0,
                    studentsAtRisk: subjectStudentsAtRisk,
                    attendanceRate: sectionAttendanceRate
                });
            }

            const globalAverage = (await sectionAverage(prisma, sectionId)).average;

            // --- Calculate Students At Risk (Global) ---
            // Nivel 2 por estudiante (promedio de materias con datos, jamás 0
            // por una materia sin notas — la materia no calificada no baja el
            // promedio del estudiante).
            let studentsAtRisk = 0;
            for (const sId of studentIds) {
                let sSum = 0;
                let sCount = 0;
                for (const cs of classroomSubjects) {
                    const withData = await studentsWithNoteInSubject(prisma, sectionId, cs.subjectId);
                    if (withData.has(sId)) {
                        sSum += await gradesService.calculateWeightedSubjectAverage(prisma, sId, cs.subjectId);
                        sCount++;
                    }
                }
                const sAvg = sCount > 0 ? sSum / sCount : 0;
                if (sCount > 0 && sAvg < PASSING_GRADE) {
                    studentsAtRisk++;
                }
            }

            // --- Low Attendance ---
            const studentAttendanceStats = new Map<string, { present: number, total: number }>();
            attendanceRecords.forEach(r => {
                const s = studentAttendanceStats.get(r.studentId) || { present: 0, total: 0 };
                s.total++;
                if (r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE) {
                    s.present++;
                }
                studentAttendanceStats.set(r.studentId, s);
            });

            let studentsWithLowAttendance = 0;
            studentIds.forEach(sId => {
                const stats = studentAttendanceStats.get(sId);
                if (stats && stats.total > 0) {
                    const rate = (stats.present / stats.total) * 100;
                    if (rate < MIN_ATTENDANCE) studentsWithLowAttendance++;
                } else if (!stats || stats.total === 0) {
                    // No data or total 0 => Low? Assuming 0 records is bad or neutral?
                    // Consistent with original which returned 0 rate for empty records.
                    // 0 < 80 => Low.
                    studentsWithLowAttendance++;
                }
            });

            const result: SectionGlobalAverageResult = {
                sectionId,
                globalAverage,
                studentsAtRisk,
                totalStudents: studentIds.length,
                attendanceRate: sectionAttendanceRate,
                studentsWithLowAttendance,
                totalObservations: observationStats.total,
                studentsWithObservations: observationStats.studentsWithObservations,
                averageObservationsPerStudent: observationStats.average,
                subjectAverages,
                hasData: globalAverage > 0
            };

            await RedisCache.set(cacheKey, result, CACHE_TTL.MEDIUM);

            return result;
        } catch (error) {
            logger.error('Error calculating section global average', {
                error: error instanceof Error ? error.message : 'Unknown error',
                sectionId
            });
            throw error;
        }
    }

    /**
     * ========================================
     * NIVEL 3: PROMEDIO DE GRADO/AÑO
     * ========================================
     */

    async getGradeAverage(
        prisma: PrismaClient,
        academicYearId: string,
        gradeLevel: number
    ): Promise<GradeAverageResult> {
        const cacheKey = `stats:grade:${academicYearId}:${gradeLevel}`;

        try {
            const cached = await RedisCache.get<GradeAverageResult>(cacheKey);
            if (cached) return cached;

            // Obtener todas las secciones del grado
            const sections = await prisma.classroom.findMany({
                where: {
                    academicYearId,
                    grade: gradeLevel
                },
                select: {
                    id: true,
                    name: true
                }
            });

            if (sections.length === 0) {
                return {
                    academicYearId,
                    gradeLevel,
                    average: 0,
                    totalStudents: 0,
                    studentsAtRisk: 0,
                    passingRate: 0,
                    attendanceRate: 0,
                    totalObservations: 0,
                    studentsWithObservations: 0,
                    sectionAverages: [],
                    hasData: false
                };
            }

            // Calcular promedio por sección
            const sectionAverages = [];
            let totalGradeAverage = 0;
            let totalStudents = 0;
            let totalStudentsAtRisk = 0;
            let totalAttendance = 0;
            let totalObservations = 0;
            let sectionsWithData = 0;

            // ✅ OPTIMIZADO: Calcular estadísticas de todas las secciones en paralelo
            const sectionStatsPromises = sections.map(section =>
                this.getSectionGlobalAverage(prisma, section.id).then(stats => ({
                    section,
                    stats
                }))
            );

            const sectionResults = await Promise.all(sectionStatsPromises);

            // ✅ OPTIMIZADO: Obtener todos los estudiantes del grado en una sola query
            const allStudentIds = await prisma.studentClassroom.findMany({
                where: {
                    classroomId: { in: sections.map(s => s.id) },
                    isActive: true
                },
                select: { studentId: true },
                distinct: ['studentId']
            });

            const studentIds = allStudentIds.map(e => e.studentId);

            // Obtener estudiantes con observaciones en una sola query
            const studentsWithObs = await prisma.observation.groupBy({
                by: ['studentId'],
                where: {
                    studentId: { in: studentIds }
                },
                _count: {
                    id: true
                }
            });

            const studentsWithObservationsSet = new Set(
                studentsWithObs.map(s => s.studentId)
            );

            // Procesar resultados
            for (const { section, stats } of sectionResults) {
                if (stats.hasData) {
                    totalGradeAverage += stats.globalAverage;
                    sectionsWithData++;
                }

                totalStudents += stats.totalStudents;
                totalStudentsAtRisk += stats.studentsAtRisk;
                totalAttendance += stats.attendanceRate;
                totalObservations += stats.totalObservations;

                sectionAverages.push({
                    sectionId: section.id,
                    sectionName: section.name,
                    average: stats.globalAverage,
                    studentsAtRisk: stats.studentsAtRisk,
                    attendanceRate: stats.attendanceRate,
                    totalObservations: stats.totalObservations
                });
            }

            // CORRECCIÓN (jerarquía): promedio del AÑO = NIVEL 5 — promedio de
            // los Nivel 4 (sección) de las secciones con datos del grado.
            const average = (await yearGradeAverage(prisma, academicYearId, gradeLevel)).average;

            const attendanceRate = sections.length > 0
                ? Math.round((totalAttendance / sections.length) * 10) / 10
                : 0;

            const passingRate = totalStudents > 0
                ? Math.round(((totalStudents - totalStudentsAtRisk) / totalStudents) * 100 * 10) / 10
                : 0;

            const result: GradeAverageResult = {
                academicYearId,
                gradeLevel,
                average,
                totalStudents,
                studentsAtRisk: totalStudentsAtRisk,
                passingRate,
                attendanceRate,
                totalObservations,
                studentsWithObservations: studentsWithObservationsSet.size,
                sectionAverages,
                hasData: sectionsWithData > 0
            };

            await RedisCache.set(cacheKey, result, CACHE_TTL.MEDIUM);

            return result;
        } catch (error) {
            logger.error('Error calculating grade average', {
                error: error instanceof Error ? error.message : 'Unknown error',
                academicYearId,
                gradeLevel
            });
            throw error;
        }
    }

    /**
     * ========================================
     * NIVEL 4: PROMEDIO GLOBAL DEL CICLO ESCOLAR
     * ========================================
     */

    async getCycleGlobalAverage(
        prisma: PrismaClient,
        academicYearId: string
    ): Promise<CycleGlobalAverageResult> {
        const cacheKey = `stats:cycle:${academicYearId}:global`;

        try {
            const cached = await RedisCache.get<CycleGlobalAverageResult>(cacheKey);
            if (cached) return cached;

            // Verificar que el año académico existe
            const academicYear = await prisma.academicYear.findUnique({
                where: { id: academicYearId },
                select: { name: true }
            });

            if (!academicYear) {
                throw new Error(`Academic year not found: ${academicYearId}`);
            }

            // Obtener estadísticas de todos los grados (1-5)
            const gradeAverages = [];
            let totalCycleAverage = 0;
            let totalStudents = 0;
            let totalStudentsAtRisk = 0;
            let totalAttendance = 0;
            let totalObservations = 0;
            let gradesWithData = 0;

            // ✅ OPTIMIZADO: Calcular todos los grados en paralelo (5 requests simultáneos)
            const gradeStatsPromises = Array.from({ length: 5 }, (_, i) => i + 1).map(gradeLevel =>
                this.getGradeAverage(prisma, academicYearId, gradeLevel).then(stats => ({
                    gradeLevel,
                    stats
                }))
            );

            const gradeResults = await Promise.all(gradeStatsPromises);

            // ✅ OPTIMIZADO: Obtener todos los estudiantes del ciclo en UNA sola query
            const allCycleStudents = await prisma.studentClassroom.findMany({
                where: {
                    academicYearId,
                    isActive: true
                },
                select: { studentId: true },
                distinct: ['studentId']
            });

            const allStudentIds = allCycleStudents.map(e => e.studentId);

            // Obtener estudiantes con observaciones en UNA sola query
            const studentsWithObs = await prisma.observation.groupBy({
                by: ['studentId'],
                where: {
                    studentId: { in: allStudentIds }
                },
                _count: {
                    id: true
                }
            });

            const studentsWithObservationsSet = new Set(
                studentsWithObs.map(s => s.studentId)
            );

            // Procesar resultados de grados
            for (const { gradeLevel, stats } of gradeResults) {
                if (stats.hasData) {
                    totalCycleAverage += stats.average;
                    gradesWithData++;
                }

                totalStudents += stats.totalStudents;
                totalStudentsAtRisk += stats.studentsAtRisk;
                totalAttendance += stats.attendanceRate;
                totalObservations += stats.totalObservations;

                gradeAverages.push({
                    gradeLevel,
                    average: stats.average,
                    studentsAtRisk: stats.studentsAtRisk,
                    totalStudents: stats.totalStudents,
                    attendanceRate: stats.attendanceRate,
                    totalObservations: stats.totalObservations
                });
            }

            // CORRECCIÓN (jerarquía): promedio GLOBAL del ciclo = NIVEL 6 —
            // promedio de los Nivel 5 (años) de los grados con datos del ciclo.
            const globalAverage = (await cycleAverage(prisma, academicYearId)).average;

            const attendanceRate = gradesWithData > 0
                ? Math.round((totalAttendance / 5) * 10) / 10
                : 0;

            const passingRate = totalStudents > 0
                ? Math.round(((totalStudents - totalStudentsAtRisk) / totalStudents) * 100 * 10) / 10
                : 0;

            const result: CycleGlobalAverageResult = {
                academicYearId,
                cycleName: academicYear.name,
                globalAverage,
                totalStudents,
                studentsAtRisk: totalStudentsAtRisk,
                passingRate,
                attendanceRate,
                totalObservations,
                studentsWithObservations: studentsWithObservationsSet.size,
                gradeAverages,
                hasData: gradesWithData > 0
            };

            await RedisCache.set(cacheKey, result, CACHE_TTL.LONG);

            return result;
        } catch (error) {
            logger.error('Error calculating cycle global average', {
                error: error instanceof Error ? error.message : 'Unknown error',
                academicYearId
            });
            throw error;
        }
    }

    /**
     * ========================================
     * CACHE MANAGEMENT
     * ========================================
     */

    async clearSectionCache(prisma: PrismaClient, sectionId: string): Promise<void> {
        try {
            // Limpiar cache de sección y todas sus materias
            const classroomSubjects = await prisma.classroomSubject.findMany({
                where: { classroomId: sectionId },
                select: { subjectId: true }
            });

            const keys = [
                `stats:section:${sectionId}:global`,
                ...classroomSubjects.map(cs => `stats:subject:${sectionId}:${cs.subjectId}`)
            ];

            await Promise.all(keys.map(key => RedisCache.del(key)));

            logger.info('Section cache cleared', { sectionId, keysCleared: keys.length });
        } catch (error) {
            logger.error('Error clearing section cache', {
                error: error instanceof Error ? error.message : 'Unknown error',
                sectionId
            });
            throw error;
        }
    }

    async clearCycleCache(prisma: PrismaClient, academicYearId: string): Promise<void> {
        try {
            // Limpiar cache de todo el ciclo
            const keys = [
                `stats:cycle:${academicYearId}:global`
            ];

            // Limpiar cache de todos los grados
            for (let gradeLevel = 1; gradeLevel <= 5; gradeLevel++) {
                keys.push(`stats:grade:${academicYearId}:${gradeLevel}`);
            }

            // Limpiar cache de todas las secciones
            const sections = await prisma.classroom.findMany({
                where: { academicYearId },
                select: { id: true }
            });

            for (const section of sections) {
                await this.clearSectionCache(prisma, section.id);
            }

            await Promise.all(keys.map(key => RedisCache.del(key)));

            logger.info('Cycle cache cleared', { academicYearId, keysCleared: keys.length });
        } catch (error) {
            logger.error('Error clearing cycle cache', {
                error: error instanceof Error ? error.message : 'Unknown error',
                academicYearId
            });
            throw error;
        }
    }
}

export const cycleStatisticsService = new CycleStatisticsService();
export default cycleStatisticsService;
