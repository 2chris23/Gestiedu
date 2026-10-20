import { PrismaClient } from '@prisma/client';
import { assertCanSeeClassroom } from './authorization.service';
import { cifrasOficialesDeLaSeccion, notaOficial, promedioOficial, mediaOficial, type CifrasOficiales } from './cifras-oficiales.service';
import { esCualitativa } from './apreciaciones.service';
import { AppErrors } from '../middleware/error.middleware';

/**
 * EL CUADRO GENERAL DE LA SECCIÓN GUÍA
 *
 * Muestra a los profesores guías el cuadro completo de calificaciones
 * de todos sus alumnos en todas las materias de la sección, por lapso
 * o para todo el ciclo.
 *
 * Las cifras son las de la boleta (`cifras-oficiales.service`), en bloque:
 * la misma nota de cada materia y el mismo promedio que en cualquier otra
 * pantalla (`barrido-de-cifras.ts` lo compara).
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

    // 4. Las cifras OFICIALES, en bloque: las de la boleta (MAPA §0). Antes el
    //    cuadro hacía su propia cuenta —sin el redondeo del Ministerio por
    //    lapso, a una décima, y el promedio del alumno como la media de sus
    //    materias—, y el guía veía otro número que la boleta (20-oct-2026).
    const oficiales = studentIds.length > 0
        ? await cifrasOficialesDeLaSeccion(prisma, undefined, classroomId, studentIds)
        : new Map<string, CifrasOficiales>();

    // Las materias con apreciación no llevan número (CUALI-*).
    const cualitativasSet = new Set<string>(
        classroom.subjects.filter((cs) => (cs.subject as any).evaluacion === 'CUALITATIVA').map((cs) => cs.subjectId)
    );
    for (const cs of classroom.subjects) {
        if (!cualitativasSet.has(cs.subjectId) && (await esCualitativa(prisma, cs.subjectId))) cualitativasSet.add(cs.subjectId);
    }

    // 5. Estructurar filas de estudiantes y acumuladores de materias
    const notasDeLaMateria = new Map<string, number[]>();
    subjectIds.forEach((sid) => notasDeLaMateria.set(sid, []));

    const estudiantesCuadro = students.map((student) => {
        const c = oficiales.get(student.id);
        const grades: Record<string, { promedio: number | null; conNotas: boolean; cualitativa: boolean }> = {};

        classroom.subjects.forEach((cs) => {
            const sid = cs.subjectId;
            const esCuali = cualitativasSet.has(sid);
            const nota = esCuali ? null : notaOficial(c, sid, periodId);
            grades[sid] = { promedio: nota, conNotas: nota !== null, cualitativa: esCuali };
            if (nota !== null) notasDeLaMateria.get(sid)!.push(nota);
        });

        return {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            name: `${student.firstName} ${student.lastName}`,
            cedula: student.studentCode || student.id,
            avatar: student.avatar,
            grades,
            generalAverage: promedioOficial(c, periodId),
        };
    });

    // 6. Estructurar columnas de materias con promedio general de materia
    const materiasCuadro = classroom.subjects.map((cs) => {
        const sid = cs.subjectId;
        const esCuali = cualitativasSet.has(sid);
        // La materia en la sección: la media de las notas oficiales de sus
        // alumnos, como el resumen de la sección y la tarjeta de la materia.
        const subjectAvg = esCuali ? null : mediaOficial(notasDeLaMateria.get(sid) ?? []);

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
