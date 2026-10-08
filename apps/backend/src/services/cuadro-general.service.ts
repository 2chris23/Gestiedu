import { PrismaClient } from '@prisma/client';
import { assertCanSeeClassroom } from './authorization.service';
import { bulkSubjectAveragesConDatos, BulkAverageDetail } from './bulk-averages.service';
import { esCualitativa } from './apreciaciones.service';
import { AppErrors } from '../middleware/error.middleware';

/**
 * EL CUADRO GENERAL DE LA SECCIÓN GUÍA
 *
 * Muestra a los profesores guías el cuadro completo de calificaciones
 * de todos sus alumnos en todas las materias de la sección, por lapso
 * o para todo el ciclo.
 *
 * Utiliza bulkSubjectAveragesConDatos para calcular los promedios en bloque
 * con paridad matemática total y sin problemas de consultas N+1.
 */

export interface CuadroGeneralOpciones {
    classroomId: string;
    periodId?: string;
    userId: string;
    userRole: string;
}

export async function cuadroGeneralDeLaSeccion(
    prisma: PrismaClient,
    opciones: CuadroGeneralOpciones
) {
    const { classroomId, periodId, userId, userRole } = opciones;

    // 1. Verificar permiso sobre el aula
    await assertCanSeeClassroom(prisma, { userId, role: userRole } as any, classroomId);

    // 2. Obtener datos de la sección
    const classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
        include: {
            academicYear: {
                include: {
                    periods: {
                        orderBy: { startDate: 'asc' },
                    },
                },
            },
            teacher: {
                select: { id: true, firstName: true, lastName: true },
            },
            subjects: {
                include: {
                    subject: {
                        select: { id: true, name: true, code: true, color: true, evaluacion: true, slug: true },
                    },
                    teacher: {
                        select: { id: true, firstName: true, lastName: true },
                    },
                },
                orderBy: {
                    subject: { name: 'asc' },
                },
            },
        },
    });

    if (!classroom) {
        throw AppErrors.NotFound('Sección no encontrada');
    }

    // Las notas de TODOS los alumnos: solo el admin y el guía. `assertCanSeeClassroom`
    // deja pasar al alumno y a su representante (su horario es suyo), y por ahí
    // recibían nombre, cédula y notas de los 30 compañeros.
    if (userRole !== 'ADMIN' && !(userRole === 'TEACHER' && classroom.teacherId === userId)) {
        throw AppErrors.Forbidden('Solo el profesor guía de esta sección y el administrador pueden ver el cuadro general');
    }

    // 3. Estudiantes activos en la sección
    const enrollments = await prisma.studentClassroom.findMany({
        where: { classroomId, isActive: true },
        include: {
            student: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    studentCode: true,
                    avatar: true,
                },
            },
        },
        orderBy: [
            { student: { lastName: 'asc' } },
            { student: { firstName: 'asc' } },
        ],
    });

    const students = enrollments.map((e) => e.student);
    const studentIds = students.map((s) => s.id);
    const subjectIds = classroom.subjects.map((cs) => cs.subjectId);

    // 4. Calcular notas en bloque si hay estudiantes y materias
    let bulk: BulkAverageDetail = new Map();
    if (studentIds.length > 0 && subjectIds.length > 0) {
        bulk = await bulkSubjectAveragesConDatos(prisma, {
            classroomId,
            studentIds,
            subjectIds,
            periodId,
        });
    }

    // Identificar materias cualitativas (para no incluirlas en promedios numéricos)
    const cualitativasSet = new Set<string>();
    for (const cs of classroom.subjects) {
        if (await esCualitativa(prisma, cs.subjectId)) {
            cualitativasSet.add(cs.subjectId);
        }
    }

    // 5. Estructurar filas de estudiantes y acumuladores de materias
    const subjectGradesSum = new Map<string, { sum: number; count: number }>();
    subjectIds.forEach((sid) => subjectGradesSum.set(sid, { sum: 0, count: 0 }));

    const estudiantesCuadro = students.map((student) => {
        const studentGradesMap = bulk.get(student.id);
        const grades: Record<string, { promedio: number | null; conNotas: boolean; cualitativa: boolean }> = {};
        const numericAverages: number[] = [];

        classroom.subjects.forEach((cs) => {
            const sid = cs.subjectId;
            const esCuali = cualitativasSet.has(sid);
            const detalle = studentGradesMap?.get(sid);

            if (detalle && detalle.conNotas) {
                const rounded = Math.round(detalle.promedio * 10) / 10;
                grades[sid] = {
                    promedio: rounded,
                    conNotas: true,
                    cualitativa: esCuali,
                };

                if (!esCuali) {
                    numericAverages.push(rounded);
                    const acc = subjectGradesSum.get(sid)!;
                    acc.sum += rounded;
                    acc.count += 1;
                }
            } else {
                grades[sid] = {
                    promedio: null,
                    conNotas: false,
                    cualitativa: esCuali,
                };
            }
        });

        const generalAverage =
            numericAverages.length > 0
                ? Math.round((numericAverages.reduce((a, b) => a + b, 0) / numericAverages.length) * 10) / 10
                : null;

        return {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            name: `${student.firstName} ${student.lastName}`,
            cedula: student.studentCode || student.id,
            avatar: student.avatar,
            grades,
            generalAverage,
        };
    });

    // 6. Estructurar columnas de materias con promedio general de materia
    const materiasCuadro = classroom.subjects.map((cs) => {
        const sid = cs.subjectId;
        const esCuali = cualitativasSet.has(sid);
        const acc = subjectGradesSum.get(sid);
        const subjectAvg =
            !esCuali && acc && acc.count > 0 ? Math.round((acc.sum / acc.count) * 10) / 10 : null;

        return {
            id: cs.subject.id,
            name: cs.subject.name,
            code: cs.subject.code,
            color: cs.subject.color,
            slug: cs.subject.slug,
            cualitativa: esCuali,
            teacherId: cs.teacherId,
            teacherName: cs.teacher ? `${cs.teacher.firstName} ${cs.teacher.lastName}` : null,
            esMia: userRole === 'TEACHER' && cs.teacherId === userId,
            average: subjectAvg,
        };
    });

    return {
        classroom: {
            id: classroom.id,
            name: classroom.name,
            grade: classroom.grade,
            section: classroom.section,
            shift: classroom.shift,
            teacherName: classroom.teacher ? `${classroom.teacher.firstName} ${classroom.teacher.lastName}` : null,
        },
        academicYear: classroom.academicYear
            ? {
                  id: classroom.academicYear.id,
                  name: classroom.academicYear.name,
                  status: classroom.academicYear.status,
                  periods: classroom.academicYear.periods.map((p) => ({
                      id: p.id,
                      name: p.name,
                      startDate: p.startDate,
                      endDate: p.endDate,
                      isActive: p.isActive,
                  })),
              }
            : null,
        periodId: periodId ?? null,
        subjects: materiasCuadro,
        students: estudiantesCuadro,
    };
}
