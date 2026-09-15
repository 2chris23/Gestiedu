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
                            studentClassrooms: { where: { isActive: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.classroom.count({ where })
        ]);

        const formattedClassrooms = classrooms.map((c: any) => ({
            ...c,
            _count: {
                students: c._count?.studentClassrooms ?? 0
            }
        }));

        return {
            classrooms: formattedClassrooms,
            pagination: {
                total,
                page: parseInt(page),
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Obtener aula por ID con detalles completos
     */
    async getClassroomById(prisma: PrismaClient, id: string) {
        const classroom = await prisma.classroom.findUnique({
            where: { id },
            include: {
                teacher: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phone: true
                    }
                },
                studentClassrooms: {
                    where: { isActive: true },
                    include: {
                        student: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                                studentCode: true,
                                avatar: true
                            }
                        }
                    }
                }
            }
        });
        return classroom;
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
        const activeStudentsCount = await prisma.studentClassroom.count({
            where: {
                classroomId: id,
                isActive: true
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
            select: { isActive: true, capacity: true, name: true, academicYearId: true }
        });

        if (!classroom || !classroom.isActive) {
            throw new Error('Aula no encontrada');
        }

        const academicYearId = classroom.academicYearId;
        if (!academicYearId) {
            throw new Error('El aula no está asociada a ningún ciclo escolar');
        }

        // Matricular o reactivar en studentClassroom
        for (const studentId of studentIds) {
            await prisma.studentClassroom.upsert({
                where: {
                    studentId_academicYearId: {
                        studentId,
                        academicYearId
                    }
                },
                update: { classroomId, isActive: true },
                create: {
                    studentId,
                    classroomId,
                    academicYearId,
                    isActive: true
                }
            });
        }

        return {
            message: `${studentIds.length} estudiantes asignados al aula '${classroom.name}'`,
            assigned: studentIds.length
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

        const res = await prisma.studentClassroom.updateMany({
            where: {
                classroomId,
                studentId: { in: studentIds }
            },
            data: { isActive: false }
        });

        return {
            message: `${res.count} estudiantes removidos del aula '${classroom.name}'`,
            removed: res.count
        };
    }

    /**
     * Obtener estadísticas del aula
     */
    async getClassroomStats(id: string, prisma: PrismaClient) {
        const classroom = await this.getClassroomById(prisma, id);

        if (!classroom) {
            throw new Error('Aula no encontrada');
        }

        const [studentsCount, activitiesCount, gradesStats] = await Promise.all([
            // Contar estudiantes
            prisma.studentClassroom.count({
                where: {
                    classroomId: id,
                    isActive: true
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
