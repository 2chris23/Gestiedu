import { UserRole } from '../utils/prisma-enums';
import { PaginationInput } from '../utils/validators';
import { PrismaClient } from '@prisma/client';
import { RedisCache } from '../config/redis';
import { ErrorFactory, NotFoundError, ConflictError, UserNotFoundError } from '../utils/errors';
import { logBusiness, logError } from '../utils/logger';

// Tipos locales para student (reemplazan class-validator DTOs)
interface CreateStudentData {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
    birthDate?: string;
    address?: string;
    gender?: string;
    avatar?: string;
    classroomId?: string;
    studentCode?: string;
    parentName?: string;
    parentPhone?: string;
    parentEmail?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
}

interface UpdateStudentData {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    birthDate?: string;
    address?: string;
    gender?: string;
    avatar?: string;
    classroomId?: string;
    studentCode?: string;
    parentName?: string;
    parentPhone?: string;
    parentEmail?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
}

interface StudentFiltersBase {
    search?: string;
    classroomId?: string;
    grade?: string;
    gender?: string;
    isActive?: string;
}

interface StudentFilters extends StudentFiltersBase {
    hasGrades?: boolean;
    attendanceRate?: 'low' | 'medium' | 'high';
}

export class StudentsService {
    private cachePrefix = 'students';
    private cacheTTL = 600; // 10 minutos

    /**
     * Obtener estudiantes con filtros avanzados y paginación
     */
    async findMany(filters: StudentFilters = {}, pagination: PaginationInput = { page: 1, limit: 10 }, prisma: any) {
        const where: any = {
            role: 'STUDENT',
            isActive: true,
            ...this.buildFilter(filters)
        };

        const cacheKey = `students:filters:${JSON.stringify(filters)}:page:${pagination.page}`;
        const cached = await RedisCache.get<any>(cacheKey);

        if (cached) {
            return cached;
        }

        const [students, total] = await Promise.all([
            prisma.user.findMany({
                where,
                include: this.getStudentRelations(),
                orderBy: [
                    { lastName: 'asc' },
                    { firstName: 'asc' }
                ],
                skip: (pagination.page - 1) * pagination.limit,
                take: pagination.limit
            }),
            prisma.user.count({ where })
        ]);

        const result = {
            students,
            pagination: {
                total,
                page: pagination.page,
                totalPages: Math.ceil(total / pagination.limit)
            }
        };

        await RedisCache.set(cacheKey, result, this.cacheTTL); // Cachear por 10 minutos

        return result;
    }

    // Obtener detalles de un estudiante
    async getStudentById(prisma: PrismaClient, studentId: string) {
        const student = await prisma.user.findUnique({
            where: {
                id: studentId,
                role: 'STUDENT',
                isActive: true
            },
            include: this.getStudentRelations()
        });

        if (!student) {
            throw new NotFoundError('Estudiante', studentId);
        }

        return student;
    }

    // Crear un nuevo estudiante
    async createStudent(prisma: PrismaClient, data: CreateStudentData) {
        await this.checkDuplicateEmail(prisma, data.email);
        await this.checkDuplicateStudentCode(prisma, data.studentCode);
        await this.checkClassroomCapacity(prisma, data.classroomId);

        const student = await prisma.user.create({
            data: {
                ...data as any,
                role: 'STUDENT',
                isActive: true
            },
            include: {
                classroom: {
                    select: {
                        id: true,
                        name: true,
                        grade: true,
                        section: true
                    }
                }
            }
        });

        await this.clearCacheRelatedToClassroom(data.classroomId);

        return student;
    }

    // Actualizar estudiante existente
    async updateStudent(prisma: PrismaClient, studentId: string, data: UpdateStudentData) {
        const existingStudent = await prisma.user.findUnique({
            where: {
                id: studentId,
                role: 'STUDENT'
            }
        });

        if (!existingStudent) {
            throw new NotFoundError('Estudiante', studentId);
        }

        await this.checkDuplicateEmail(prisma, data.email, studentId);
        await this.checkDuplicateStudentCode(prisma, data.studentCode, studentId);
        await this.checkClassroomCapacity(prisma, data.classroomId, studentId);

        const student = await prisma.user.update({
            where: { id: studentId },
            data: {
                ...data as any
            },
            include: {
                classroom: {
                    select: {
                        id: true,
                        name: true,
                        grade: true,
                        section: true
                    }
                }
            }
        });

        await this.clearCacheRelatedToClassroom(data.classroomId);

        return student;
    }

    // Eliminar estudiante (soft delete)
    async deleteStudent(prisma: PrismaClient, studentId: string) {
        const existingStudent = await prisma.user.findUnique({
            where: {
                id: studentId,
                role: 'STUDENT',
                isActive: true
            }
        });

        if (!existingStudent) {
            throw new NotFoundError('Estudiante', studentId);
        }

        await prisma.user.update({
            where: { id: studentId },
            data: { isActive: false }
        });

        // Limpiar cache relacionado
        await this.clearCacheRelatedToClassroom(existingStudent.classroomId ?? undefined);
    }

    // Obtener perfil completo de un estudiante
    async getStudentProfile(prisma: PrismaClient, studentId: string) {
        const student = await prisma.user.findUnique({
            where: {
                id: studentId,
                role: 'STUDENT',
                isActive: true
            },
            include: this.getStudentRelations()
        });

        if (!student) {
            throw new NotFoundError('Estudiante', studentId);
        }

        const [grades, attendance, activities] = await Promise.all([
            prisma.grade.findMany({
                where: { studentId },
                include: {
                    subject: {
                        select: {
                            id: true,
                            name: true,
                            code: true
                        }
                    },
                    activity: {
                        select: {
                            id: true,
                            title: true,
                            type: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: 10
            }),
            prisma.dailyAttendance.findMany({
                where: { studentId },
                include: {
                    classroom: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: { date: 'desc' },
                take: 10
            }),
            student.classroomId ? prisma.activity.findMany({
                where: {
                    classroomId: student.classroomId,
                    isActive: true,
                    startDate: {
                        gte: new Date()
                    }
                },
                include: {
                    subject: {
                        select: {
                            id: true,
                            name: true,
                            code: true
                        }
                    }
                },
                orderBy: { startDate: 'asc' },
                take: 5
            }) : []
        ]);

        return {
            student,
            academic: {
                recentGrades: grades,
                upcomingActivities: activities,
                totalGrades: await prisma.grade.count({ where: { studentId } })
            },
            attendance: {
                recentRecords: attendance,
                totalRecords: await prisma.dailyAttendance.count({ where: { studentId } })
            }
        };
    }

    // Obtener estadísticas completas del estudiante
    async getStudentStats(prisma: PrismaClient, studentId: string) {
        const student = await prisma.user.findUnique({
            where: {
                id: studentId,
                role: 'STUDENT',
                isActive: true
            },
            select: { id: true }
        });

        if (!student) {
            throw new NotFoundError('Estudiante', studentId);
        }

        const [gradesStats, subjectStats, attendanceStats] = await Promise.all([
            prisma.grade.aggregate({
                where: { studentId },
                _avg: { score: true },
                _min: { score: true },
                _max: { score: true },
                _count: { score: true }
            }),
            prisma.grade.groupBy({
                by: ['subjectId'],
                where: { studentId },
                _avg: { score: true },
                _count: { score: true },
                orderBy: {
                    _avg: {
                        score: 'desc'
                    }
                }
            }),
            prisma.dailyAttendance.groupBy({
                by: ['status'],
                where: { studentId },
                _count: { status: true }
            })
        ]);

        const subjectIds = subjectStats.map(s => s.subjectId);
        const subjects = await prisma.subject.findMany({
            where: { id: { in: subjectIds } },
            select: { id: true, name: true, code: true }
        });

        const subjectMap = new Map(subjects.map(s => [s.id, s]));

        const stats = {
            overall: {
                averageGrade: gradesStats._avg.score ? Number(gradesStats._avg.score.toFixed(2)) : null,
                bestGrade: gradesStats._max.score || null,
                worstGrade: gradesStats._min.score || null,
                totalGrades: gradesStats._count.score
            },
            bySubject: subjectStats.map(stat => ({
                subject: subjectMap.get(stat.subjectId),
                average: Number((stat._avg.score ?? 0).toFixed(2)),
                count: stat._count.score
            })),
            attendance: attendanceStats.reduce((acc, stat) => {
                acc[stat.status.toLowerCase()] = stat._count.status;
                return acc;
            }, {} as Record<string, number>)
        };

        const totalAttendance = Object.values(stats.attendance).reduce((sum, count) => sum + count, 0);
        if (totalAttendance > 0) {
            const attendedDays = (stats.attendance.presente || 0) + (stats.attendance.tardanza || 0) + (stats.attendance.justificada || 0);
            stats.attendance.rate = Number((attendedDays / totalAttendance * 100).toFixed(2));
        }

        return stats;
    }

    // Construir filtros avanzados para estudiantes
    private buildFilter(filters: StudentFiltersBase) {
        const filter: any = {};

        if (filters.classroomId) {
            filter.classroomId = filters.classroomId;
        }

        if (filters.grade) {
            filter.grade = filters.grade;
        }

        if (filters.search) {
            filter.OR = [
                { firstName: { contains: filters.search, mode: 'insensitive' } },
                { lastName: { contains: filters.search, mode: 'insensitive' } },
                { email: { contains: filters.search, mode: 'insensitive' } },
                { studentCode: { contains: filters.search, mode: 'insensitive' } }
            ];
        }

        return filter;
    }

    // Relaciones a incluir al obtener estudiantes
    private getStudentRelations() {
        return {
            classroom: {
                select: {
                    id: true,
                    name: true,
                    grade: true,
                    section: true,
                    teacher: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true
                        }
                    }
                }
            },
            _count: {
                select: {
                    grades: true,
                    attendance: true
                }
            }
        };
    }

    // Verificar duplicados de email
    private async checkDuplicateEmail(prisma: PrismaClient, email?: string, studentId?: string) {
        if (email) {
            const existingStudent = await prisma.user.findFirst({
                where: {
                    email,
                    role: 'STUDENT',
                    isActive: true,
                    ...(studentId && { id: { not: studentId } })
                }
            });

            if (existingStudent) {
                throw new ConflictError(`Ya existe un estudiante con el email '${email}'`);
            }
        }
    }

    // Verificar duplicados de código de estudiante
    private async checkDuplicateStudentCode(prisma: PrismaClient, code?: string, studentId?: string) {
        if (code) {
            const existingStudent = await prisma.user.findFirst({
                where: {
                    studentCode: code,
                    role: 'STUDENT',
                    isActive: true,
                    ...(studentId && { id: { not: studentId } })
                }
            });

            if (existingStudent) {
                throw new ConflictError(`Ya existe un estudiante con el código '${code}'`);
            }
        }
    }

    // Verificar capacidad del aula
    private async checkClassroomCapacity(prisma: PrismaClient, classroomId?: string, studentId?: string) {
        if (classroomId) {
            const classroom = await prisma.classroom.findUnique({
                where: { id: classroomId },
                select: { capacity: true, isActive: true }
            });

            if (!classroom || !classroom.isActive) {
                throw new NotFoundError('Aula', classroomId);
            }

            if (classroom.capacity) {
                const count = await prisma.user.count({
                    where: {
                        classroomId,
                        role: 'STUDENT',
                        isActive: true,
                        ...(studentId && { id: { not: studentId } })
                    }
                });

                if (count >= classroom.capacity) {
                    throw new ConflictError('El aula ha alcanzado su capacidad máxima');
                }
            }
        }
    }

    // Limpiar caché relacionado al aula
    private async clearCacheRelatedToClassroom(classroomId?: string) {
        if (classroomId) {
            const pattern = `students:classroom:${classroomId}:*`;
            await RedisCache.clearPattern(pattern);
        }
    }
}
