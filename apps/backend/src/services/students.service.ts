import { PrismaClient } from '@prisma/client';
import { RedisCache } from '../config/redis';
import { NotFoundError, ConflictError } from '../utils/errors';
import { hashPassword } from '../utils/bcrypt';

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

export class StudentsService {
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

        const { classroomId, ...userData } = data as any;

        // La contraseña llega en texto plano desde el body y se guardaba tal cual
        // (a diferencia de users.service.ts, que sí hashea). El login compara con
        // bcrypt, así que además de ser una fuga era un estudiante que no podía
        // entrar nunca.
        if (userData.password) {
            userData.password = await hashPassword(userData.password);
        }

        const student = await prisma.user.create({
            data: {
                ...userData,
                role: 'STUDENT',
                isActive: true
            },
        });

        if (classroomId) {
            const classroom = await prisma.classroom.findUnique({
                where: { id: classroomId },
                select: { academicYearId: true }
            });
            if (classroom?.academicYearId) {
                await prisma.studentClassroom.create({
                    data: {
                        studentId: student.id,
                        classroomId,
                        academicYearId: classroom.academicYearId,
                        isActive: true
                    }
                });
            }
        }

        await this.clearCacheRelatedToClassroom(classroomId);

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

        const { classroomId, ...userData } = data as any;

        // Igual que en `createStudent`: si el admin manda contraseña nueva, se
        // guarda hasheada, nunca en plano.
        if (userData.password) {
            userData.password = await hashPassword(userData.password);
        }

        const student = await prisma.user.update({
            where: { id: studentId },
            data: {
                ...userData
            },
        });

        if (classroomId) {
            const classroom = await prisma.classroom.findUnique({
                where: { id: classroomId },
                select: { academicYearId: true }
            });
            if (classroom?.academicYearId) {
                await prisma.studentClassroom.upsert({
                    where: {
                        studentId_academicYearId: {
                            studentId,
                            academicYearId: classroom.academicYearId
                        }
                    },
                    update: { classroomId, isActive: true },
                    create: {
                        studentId,
                        classroomId,
                        academicYearId: classroom.academicYearId,
                        isActive: true
                    }
                });
            }
        }

        await this.clearCacheRelatedToClassroom(classroomId);

        return student;
    }

    // Relaciones a incluir al obtener estudiantes
    private getStudentRelations() {
        return {
            studentClassrooms: {
                where: { isActive: true },
                include: {
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
                const count = await prisma.studentClassroom.count({
                    where: {
                        classroomId,
                        isActive: true,
                        ...(studentId && { studentId: { not: studentId } })
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

/**
 * Instancia compartida, igual que `gradesService` y el resto de servicios.
 * Antes solo se exportaba la clase y nadie la instanciaba: el service estaba
 * completo pero muerto, mientras el controller mantenía su propia copia rota.
 */
export const studentsService = new StudentsService();
