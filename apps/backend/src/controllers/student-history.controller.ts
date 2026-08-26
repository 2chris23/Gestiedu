import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

interface StudentHistoryRequest {
    Params: { id: string };
}

/**
 * Obtener historial académico COMPLETO de un estudiante
 * Incluye todos los ciclos escolares en los que ha estado inscrito
 */
export async function getStudentCompleteHistory(
    request: FastifyRequest<StudentHistoryRequest>,
    reply: FastifyReply
) {
    try {
        const { id: studentId } = request.params;
        const prisma = request.tenantPrisma;

        // 1. Información básica del estudiante
        const student = await prisma.user.findUnique({
            where: { id: studentId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatar: true,
                studentCode: true,
                birthDate: true,
                joinDate: true,
            }
        });

        if (!student) {
            return reply.status(404).send({
                error: 'Estudiante no encontrado',
                code: 'STUDENT_NOT_FOUND'
            });
        }

        // 2. Historial de inscripciones (todos los años académicos)
        const enrollmentHistory = await prisma.studentClassroom.findMany({
            where: { studentId },
            include: {
                classroom: {
                    select: {
                        id: true,
                        name: true,
                        grade: true,
                        section: true,
                        teacher: {
                            select: {
                                firstName: true,
                                lastName: true
                            }
                        }
                    }
                },
                academicYear: {
                    select: {
                        id: true,
                        name: true,
                        startDate: true,
                        endDate: true,
                        status: true
                    }
                }
            },
            orderBy: {
                enrollmentDate: 'desc' // Más reciente primero
            }
        });

        // 3. Registros académicos finales (resúmenes por año)
        const academicRecords = await prisma.academicRecord.findMany({
            where: { studentId },
            include: {
                academicYear: {
                    select: {
                        name: true,
                        startDate: true,
                        endDate: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // 4. Calificaciones por año académico (agrupadas)
        const gradesByYear = await prisma.$queryRaw<Array<{
            academicYearId: string;
            academicYearName: string;
            subjectId: string;
            subjectName: string;
            subjectColor: string;
            averageScore: number;
            totalActivities: number;
        }>>`
      SELECT 
        ay.id as "academicYearId",
        ay.name as "academicYearName",
        s.id as "subjectId",
        s.name as "subjectName",
        s.color as "subjectColor",
        AVG(g.score) as "averageScore",
        COUNT(DISTINCT g."activityId")::int as "totalActivities"
      FROM grades g
      INNER JOIN subjects s ON s.id = g."subjectId"
      INNER JOIN periods p ON p.id = g."periodId"
      INNER JOIN academic_years ay ON ay.id = p."academicYearId"
      WHERE g."studentId" = ${studentId}
      GROUP BY ay.id, ay.name, s.id, s.name, s.color
      ORDER BY ay."startDate" DESC, s.name ASC
    `;

        // 5. Asistencia por año académico
        const attendanceByYear = await prisma.$queryRaw<Array<{
            academicYearId: string;
            academicYearName: string;
            totalDays: number;
            presentDays: number;
            lateDays: number;
            absentDays: number;
            attendancePercentage: number;
        }>>`
      SELECT 
        ay.id as "academicYearId",
        ay.name as "academicYearName",
        COUNT(*)::int as "totalDays",
        COUNT(CASE WHEN ar.status = 'PRESENT' THEN 1 END)::int as "presentDays",
        COUNT(CASE WHEN ar.status = 'LATE' THEN 1 END)::int as "lateDays",
        COUNT(CASE WHEN ar.status = 'ABSENT' THEN 1 END)::int as "absentDays",
        (COUNT(CASE WHEN ar.status IN ('PRESENT', 'LATE') THEN 1 END) * 100.0 / COUNT(*)) as "attendancePercentage"
      FROM attendance_records ar
      INNER JOIN classrooms c ON c.id = ar."classroomId"
      INNER JOIN academic_years ay ON ay.id = c."academicYearId"
      WHERE ar."studentId" = ${studentId}
      GROUP BY ay.id, ay.name
      ORDER BY ay."startDate" DESC
    `;

        // 6. Observaciones históricas
        const observations = await prisma.observation.findMany({
            where: { studentId },
            select: {
                id: true,
                title: true,
                description: true,
                type: true,
                date: true,
                createdBy: {
                    select: {
                        firstName: true,
                        lastName: true,
                        role: true
                    }
                }
            },
            orderBy: {
                date: 'desc'
            },
            take: 50 // Limitar a las 50 más recientes
        });

        // 7. Estadísticas globales (toda la vida académica)
        const [globalStats] = await prisma.$queryRaw<Array<{
            totalGrades: number;
            globalAverage: number;
            totalSubjects: number;
            totalActivities: number;
            totalObservations: number;
            totalAttendanceDays: number;
            globalAttendancePercentage: number;
        }>>`
      SELECT 
        COUNT(DISTINCT g.id)::int as "totalGrades",
        AVG(g.score) as "globalAverage",
        COUNT(DISTINCT g."subjectId")::int as "totalSubjects",
        COUNT(DISTINCT g."activityId")::int as "totalActivities",
        (SELECT COUNT(*)::int FROM observations WHERE "studentId" = ${studentId}) as "totalObservations",
        (SELECT COUNT(*)::int FROM attendance_records WHERE "studentId" = ${studentId}) as "totalAttendanceDays",
        (SELECT 
          (COUNT(CASE WHEN status IN ('PRESENT', 'LATE') THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0))
          FROM attendance_records 
          WHERE "studentId" = ${studentId}
        ) as "globalAttendancePercentage"
      FROM grades g
      WHERE g."studentId" = ${studentId}
    `;

        // 8. Organizar calificaciones por año
        const gradesByYearMap = new Map<string, any[]>();
        gradesByYear.forEach(grade => {
            if (!gradesByYearMap.has(grade.academicYearId)) {
                gradesByYearMap.set(grade.academicYearId, []);
            }
            gradesByYearMap.get(grade.academicYearId)!.push({
                subjectId: grade.subjectId,
                subjectName: grade.subjectName,
                subjectColor: grade.subjectColor,
                average: parseFloat(Number(grade.averageScore).toFixed(1)),
                totalActivities: Number(grade.totalActivities),
                status: grade.averageScore >= 10 ? 'Aprobado' : 'Reprobado'
            });
        });

        // 9. Construir respuesta completa
        const completeHistory = {
            student: {
                id: student.id,
                fullName: `${student.firstName} ${student.lastName}`,
                email: student.email,
                avatar: student.avatar,
                studentCode: student.studentCode,
                birthDate: student.birthDate?.toISOString().split('T')[0],
                joinDate: student.joinDate.toISOString().split('T')[0]
            },

            // Estadísticas globales (toda la carrera)
            globalStats: {
                totalYears: enrollmentHistory.length,
                globalAverage: parseFloat(Number(globalStats?.globalAverage || 0).toFixed(1)),
                totalSubjects: Number(globalStats?.totalSubjects || 0),
                totalActivities: Number(globalStats?.totalActivities || 0),
                totalObservations: Number(globalStats?.totalObservations || 0),
                totalAttendanceDays: Number(globalStats?.totalAttendanceDays || 0),
                globalAttendancePercentage: Math.round(Number(globalStats?.globalAttendancePercentage || 0))
            },

            // Historial por año académico
            yearlyHistory: enrollmentHistory.map(enrollment => {
                const yearGrades = gradesByYearMap.get(enrollment.academicYearId) || [];
                const yearAttendance = attendanceByYear.find(a => a.academicYearId === enrollment.academicYearId);
                const yearRecord = academicRecords.find(r => r.academicYearId === enrollment.academicYearId);

                const yearAverage = yearGrades.length > 0
                    ? parseFloat((yearGrades.reduce((sum, g) => sum + g.average, 0) / yearGrades.length).toFixed(1))
                    : 0;

                return {
                    academicYear: {
                        id: enrollment.academicYear.id,
                        name: enrollment.academicYear.name,
                        startDate: enrollment.academicYear.startDate.toISOString().split('T')[0],
                        endDate: enrollment.academicYear.endDate.toISOString().split('T')[0],
                        status: enrollment.academicYear.status
                    },
                    enrollment: {
                        classroom: {
                            id: enrollment.classroom.id,
                            name: enrollment.classroom.name,
                            grade: enrollment.classroom.grade,
                            section: enrollment.classroom.section
                        },
                        teacher: enrollment.classroom.teacher ? {
                            fullName: `${enrollment.classroom.teacher.firstName} ${enrollment.classroom.teacher.lastName}`
                        } : null,
                        enrollmentDate: enrollment.enrollmentDate.toISOString().split('T')[0],
                        isActive: enrollment.isActive
                    },
                    performance: {
                        average: yearAverage,
                        subjects: yearGrades,
                        failedSubjects: yearGrades.filter(g => g.average < 10).length,
                        totalSubjects: yearGrades.length
                    },
                    attendance: yearAttendance ? {
                        totalDays: Number(yearAttendance.totalDays),
                        presentDays: Number(yearAttendance.presentDays),
                        lateDays: Number(yearAttendance.lateDays),
                        absentDays: Number(yearAttendance.absentDays),
                        percentage: Math.round(Number(yearAttendance.attendancePercentage))
                    } : null,
                    finalRecord: yearRecord ? {
                        finalAverage: yearRecord.finalAverage,
                        status: yearRecord.status,
                        sectionSnapshot: yearRecord.sectionSnapshot
                    } : null
                };
            }),

            // Observaciones históricas
            observations: observations.map(o => ({
                id: o.id,
                title: o.title,
                description: o.description,
                type: o.type,
                date: o.date.toISOString().split('T')[0],
                createdBy: `${o.createdBy.firstName} ${o.createdBy.lastName}`,
                createdByRole: o.createdBy.role
            }))
        };

        logger.info('Historial completo obtenido', { studentId, totalYears: enrollmentHistory.length });

        return reply.status(200).send(completeHistory);

    } catch (error) {
        logger.error('Error al obtener historial completo del estudiante', { error, studentId: request.params.id });
        return reply.status(500).send({
            error: 'Error en el servidor',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
}
