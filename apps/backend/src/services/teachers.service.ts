import { PrismaClient } from '@prisma/client';

export class TeachersService {
    /**
     * Obtener todos los profesores
     */
    async getAllTeachers(query: any, prisma: PrismaClient) {
        const { page = 1, limit = 10, search, isActive = true } = query;
        const skip = (page - 1) * limit;

        const where: any = { 
            role: 'TEACHER',
            isActive 
        };

        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [teachers, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    isActive: true,
                    createdAt: true,
                    _count: {
                        select: {
                            classroomsAsTeacher: true,
                            subjectTeachings: true
                        }
                    }
                },
                orderBy: [
                    { lastName: 'asc' },
                    { firstName: 'asc' }
                ],
                skip,
                take: limit
            }),
            prisma.user.count({ where })
        ]);

        return {
            teachers,
            pagination: {
                total,
                page: parseInt(page),
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Obtener profesor por ID
     */
    async getTeacherById(id: string, prisma: PrismaClient) {
        return prisma.user.findUnique({
            where: { 
                id,
                role: 'TEACHER'
            },
            include: {
                subjectTeachings: {
                    select: {
                        subject: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                                color: true
                            }
                        }
                    }
                },
                classroomsAsTeacher: {
                    select: {
                        id: true,
                        name: true,
                        grade: true,
                        section: true
                    }
                }
            }
        });
    }

    /**
     * Crear profesor
     */
    async createTeacher(data: any, prisma: PrismaClient) {
        return prisma.user.create({
            data: {
                ...data,
                role: 'TEACHER'
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                isActive: true,
                createdAt: true
            }
        });
    }

    /**
     * Actualizar profesor
     */
    async updateTeacher(id: string, data: any, prisma: PrismaClient) {
        return prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                birthDate: true,
                gender: true,
                address: true,
                isActive: true,
                updatedAt: true
            }
        });
    }

    /**
     * Eliminar profesor (soft delete)
     */
    async deleteTeacher(id: string, prisma: PrismaClient) {
        const teacher = await prisma.user.findUnique({
            where: { id, role: 'TEACHER' },
            select: { isActive: true }
        });

        if (!teacher || !teacher.isActive) {
            throw new Error('Profesor no encontrado');
        }

        // Verificar que no tenga aulas asignadas activas
        const activeClassroomsCount = await prisma.classroom.count({
            where: {
                teacherId: id,
                isActive: true
            }
        });

        if (activeClassroomsCount > 0) {
            throw new Error('No se puede eliminar un profesor con aulas asignadas activas');
        }

        return prisma.user.update({
            where: { id },
            data: { isActive: false }
        });
    }

    /**
     * Obtener materias del profesor
     */
    async getTeacherSubjects(id: string, prisma: PrismaClient) {
        const teacher = await prisma.user.findUnique({
            where: { id, role: 'TEACHER' },
            include: {
                subjectTeachings: {
                    select: {
                        subject: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                                color: true
                            }
                        }
                    }
                }
            }
        });

        return teacher?.subjectTeachings?.map(st => st.subject) || [];
    }

    /**
     * Obtener aulas del profesor
     */
    async getTeacherClassrooms(id: string, prisma: PrismaClient) {
        const teacher = await prisma.user.findUnique({
            where: { id, role: 'TEACHER' },
            include: {
                classroomsAsTeacher: {
                    select: {
                        id: true,
                        name: true,
                        grade: true,
                        section: true,
                        capacity: true,
                        isActive: true,
                        _count: {
                            select: {
                                students: true
                            }
                        }
                    }
                }
            }
        });

        return teacher?.classroomsAsTeacher || [];
    }
}
