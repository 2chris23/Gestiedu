import { PrismaClient } from '@prisma/client';
import { sectionAverage, sectionStudentAverages } from './aggregation.service';

export class ClassroomsService {
    /**
     * Obtener todas las aulas
     */
    async getAllClassrooms(query: any, prisma: PrismaClient) {
        const { page = 1, limit = 10, search, grade, isActive = true } = query;
        const skip = (page - 1) * limit;

        const where: any = { isActive };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }

        if (grade) {
            where.grade = grade;
        }

        const [classrooms, total] = await Promise.all([
            prisma.classroom.findMany({
                where,
                include: {
                    teacher: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true
                        }
                    },
                    _count: {
                        select: {
                            students: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.classroom.count({ where })
        ]);

        return {
            classrooms,
            pagination: {
                total,
                page: parseInt(page),
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Obtener aula por ID
     */
    async getClassroomById(id: string, prisma: PrismaClient) {
        return prisma.classroom.findUnique({
            where: { id },
            include: {
                teacher: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                },
                students: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                }
            }
        });
    }

    /**
     * Obtener aula por slug (también acepta slug sin año si la DB lo tiene con año)
     */
    async getClassroomBySlug(slug: string, prisma: PrismaClient, yearName?: string) {
        const include = {
            teacher: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    avatar: true
                }
            },
            students: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                }
            },
            academicYear: {
                select: {
                    id: true,
                    name: true,
                    status: true,
                    // Fase 3.5 — lapsos del ciclo para el filtro por Momento
                    periods: {
                        select: { id: true, name: true, isActive: true },
                        take: 3,
                        orderBy: { startDate: 'asc' as const },
                    },
                }
            }
        };

        // Try exact match first
        const exact = await prisma.classroom.findUnique({ where: { slug }, include });
        if (exact) return exact;

        // Fallback: try slug with year suffix (e.g. "1er-ano-a" → "1er-ano-a-2025-2026")
        if (yearName) {
            const withYear = `${slug}-${yearName}`;
            const withYearResult = await prisma.classroom.findUnique({ where: { slug: withYear }, include });
            if (withYearResult) return withYearResult;
        }

        // Last resort: prefix search (slug starts with the given slug)
        const prefixResult = await prisma.classroom.findFirst({
            where: { slug: { startsWith: `${slug}-` } },
            include
        });
        return prefixResult || null;
    }

    /**
     * Crear aula
     */
    async createClassroom(data: any, prisma: PrismaClient) {
        return prisma.classroom.create({
            data,
            include: {
                teacher: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                }
            }
        });
    }

    /**
     * Actualizar aula
     */
    async updateClassroom(id: string, data: any, prisma: PrismaClient) {
        return prisma.classroom.update({
            where: { id },
            data,
            include: {
                teacher: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                }
            }
        });
    }

    /**
     * Eliminar aula (soft delete)
     */
    async deleteClassroom(id: string, prisma: PrismaClient) {
        const classroom = await prisma.classroom.findUnique({
            where: { id },
            select: { isActive: true, name: true }
        });

        if (!classroom || !classroom.isActive) {
            throw new Error('Aula no encontrada');
        }

        // Verificar que no tenga estudiantes activos
        const activeStudentsCount = await prisma.user.count({
            where: {
                classroomId: id,
                isActive: true,
                role: 'STUDENT'
            }
        });

        if (activeStudentsCount > 0) {
            throw new Error('No se puede eliminar un aula con estudiantes activos');
        }

        return prisma.classroom.update({
            where: { id },
            data: { isActive: false }
        });
    }

    /**
     * Asignar estudiantes al aula
     */
    async assignStudentsToClassroom(classroomId: string, studentIds: string[], prisma: PrismaClient) {
        const classroom = await prisma.classroom.findUnique({
            where: { id: classroomId },
            select: { isActive: true, capacity: true, name: true }
        });

        if (!classroom || !classroom.isActive) {
            throw new Error('Aula no encontrada');
        }

        // Verificar que los estudiantes existen y están activos
        const students = await prisma.user.findMany({
            where: {
                id: { in: studentIds },
                role: 'STUDENT',
                isActive: true
            },
            select: { id: true, classroomId: true }
        });

        if (students.length !== studentIds.length) {
            throw new Error('Algunos estudiantes no fueron encontrados o no están activos');
        }

        // Filtrar estudiantes que no están ya asignados al aula
        const studentsToAssign = students.filter(student => student.classroomId !== classroomId);

        if (studentsToAssign.length === 0) {
            return {
                message: 'Todos los estudiantes ya están asignados a esta aula',
                assigned: 0
            };
        }

        // Verificar capacidad del aula
        const currentStudentCount = await prisma.user.count({
            where: {
                classroomId: classroomId,
                isActive: true,
                role: 'STUDENT'
            }
        });

        if (classroom.capacity && (currentStudentCount + studentsToAssign.length) > classroom.capacity) {
            throw new Error(`La capacidad del aula sería excedida. Capacidad: ${classroom.capacity}, Actuales: ${currentStudentCount}, A asignar: ${studentsToAssign.length}`);
        }

        // Asignar estudiantes
        await prisma.user.updateMany({
            where: {
                id: { in: studentsToAssign.map(s => s.id) }
            },
            data: {
                classroomId: classroomId
            }
        });

        return {
            message: `${studentsToAssign.length} estudiantes asignados al aula '${classroom.name}'`,
            assigned: studentsToAssign.length
        };
    }

    /**
     * Remover estudiantes del aula
     */
    async removeStudentsFromClassroom(classroomId: string, studentIds: string[], prisma: PrismaClient) {
        const classroom = await prisma.classroom.findUnique({
            where: { id: classroomId },
            select: { isActive: true, name: true }
        });

        if (!classroom || !classroom.isActive) {
            throw new Error('Aula no encontrada');
        }

        // Verificar que los estudiantes están asignados al aula
        const studentsInClassroom = await prisma.user.findMany({
            where: {
                id: { in: studentIds },
                classroomId: classroomId,
                role: 'STUDENT',
                isActive: true
            },
            select: { id: true }
        });

        if (studentsInClassroom.length === 0) {
            return {
                message: 'Ningún estudiante está asignado a esta aula',
                removed: 0
            };
        }

        // Remover estudiantes del aula
        await prisma.user.updateMany({
            where: {
                id: { in: studentsInClassroom.map(s => s.id) }
            },
            data: {
                classroomId: null
            }
        });

        return {
            message: `${studentsInClassroom.length} estudiantes removidos del aula '${classroom.name}'`,
            removed: studentsInClassroom.length
        };
    }

    /**
     * Obtener estadísticas del aula
     */
    async getClassroomStats(id: string, prisma: PrismaClient) {
        const classroom = await this.getClassroomById(id, prisma);

        if (!classroom) {
            throw new Error('Aula no encontrada');
        }

        const [studentsCount, activitiesCount, gradesStats] = await Promise.all([
            // Contar estudiantes
            prisma.user.count({
                where: {
                    classroomId: id,
                    isActive: true,
                    role: 'STUDENT'
                }
            }),
            // Contar actividades
            prisma.activity.count({
                where: {
                    classroomId: id,
                    isActive: true
                }
            }),
            // Estadísticas de calificaciones (solo para contar total)
            prisma.grade.aggregate({
                where: {
                    activity: {
                        classroomId: id,
                        isActive: true
                    }
                },
                _count: { score: true }
            })
        ]);

        // CORRECCIÓN (jerarquía de agregación): el promedio del aula es el
        // NIVEL 4 (promedio de los N3 de las materias con datos) y min/max se
        // derivan de los promedios NIVEL 2 por estudiante — antes: AVG simple
        // de la tabla grades (ignoraba criterios y ClassActivity.scores).
        const n4 = await sectionAverage(prisma, id);
        const studentAverages = await sectionStudentAverages(prisma, id);

        return {
            classroomInfo: {
                id: classroom.id,
                name: classroom.name,
                grade: classroom.grade,
                section: classroom.section,
                capacity: classroom.capacity
            },
            studentsCount,
            activitiesCount,
            gradesStats: {
                totalGrades: gradesStats._count.score,
                averageGrade: n4.hasData ? Number(n4.average.toFixed(2)) : null,
                minGrade: studentAverages.length > 0 ? Number(Math.min(...studentAverages).toFixed(2)) : null,
                maxGrade: studentAverages.length > 0 ? Number(Math.max(...studentAverages).toFixed(2)) : null
            },
            utilizationRate: classroom.capacity ? (studentsCount / classroom.capacity * 100).toFixed(2) : null
        };
    }
}
