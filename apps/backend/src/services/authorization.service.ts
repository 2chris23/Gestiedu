/**
 * QUIÉN PUEDE VER Y TOCAR QUÉ
 *
 * Las reglas del liceo, en un solo sitio:
 *
 *   ESTUDIANTE    solo mira lo suyo. No escribe nada.
 *   REPRESENTANTE solo mira a los estudiantes que representa. No escribe nada.
 *   PROFESOR      pone notas, pasa asistencia, arma el plan y deja observaciones
 *                 ÚNICAMENTE de las clases que imparte; y ve a los estudiantes
 *                 de esas clases y de sus secciones guía.
 *   ADMIN         todo lo de su liceo.
 *
 * El rol lo comprueban los guardianes de las rutas (`requireTeacher`, etc.).
 * Aquí se comprueba lo otro, que es lo que se escapaba: que la clase sea SUYA.
 */
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../utils/prisma-enums';
import { AppErrors } from '../middleware/error.middleware';

export interface ActingUser {
    id?: string;
    userId?: string;
    role?: UserRole | string;
}

const idOf = (user?: ActingUser | null) => user?.userId ?? user?.id ?? null;
const isAdmin = (user?: ActingUser | null) => user?.role === UserRole.ADMIN;

/** Secciones donde el profesor da clase o es el guía. */
export async function teacherClassroomIds(prisma: PrismaClient, teacherId: string): Promise<string[]> {
    const [asignaturas, guia] = await Promise.all([
        prisma.classroomSubject.findMany({ where: { teacherId }, select: { classroomId: true } }),
        prisma.classroom.findMany({ where: { teacherId }, select: { id: true } }),
    ]);
    return Array.from(new Set([...asignaturas.map((a) => a.classroomId), ...guia.map((c) => c.id)]));
}

/** ¿Da clase en esa sección, o es su profesor guía? */
export async function teacherHandlesClassroom(
    prisma: PrismaClient,
    teacherId: string,
    classroomId: string
): Promise<boolean> {
    const [imparte, esGuia] = await Promise.all([
        prisma.classroomSubject.count({ where: { classroomId, teacherId } }),
        prisma.classroom.count({ where: { id: classroomId, teacherId } }),
    ]);
    return imparte > 0 || esGuia > 0;
}

/** ¿Imparte ESA materia en ESA sección? (para notas y plan de evaluación) */
export async function teacherHandlesSubject(
    prisma: PrismaClient,
    teacherId: string,
    classroomId: string,
    subjectId: string
): Promise<boolean> {
    const n = await prisma.classroomSubject.count({ where: { classroomId, subjectId, teacherId } });
    return n > 0;
}

/**
 * Corta la petición si el profesor no tiene nada que ver con esa sección.
 * El administrador pasa siempre; un estudiante o representante, nunca.
 */
export async function assertClassroomScope(
    prisma: PrismaClient,
    user: ActingUser | null | undefined,
    classroomId: string,
    opciones: { subjectId?: string; accion?: string } = {}
): Promise<void> {
    if (isAdmin(user)) return;

    const teacherId = idOf(user);
    if (!teacherId || user?.role !== UserRole.TEACHER) {
        throw AppErrors.Forbidden('No tienes permisos sobre esta sección');
    }

    const permitido = opciones.subjectId
        ? (await teacherHandlesSubject(prisma, teacherId, classroomId, opciones.subjectId)) ||
          // El profesor guía también puede sobre su sección (asistencia, observaciones)
          (!opciones.accion?.startsWith('plan') &&
              (await prisma.classroom.count({ where: { id: classroomId, teacherId } })) > 0)
        : await teacherHandlesClassroom(prisma, teacherId, classroomId);

    if (!permitido) {
        throw AppErrors.Forbidden(
            opciones.accion
                ? `Solo puedes ${opciones.accion} en las clases que impartes`
                : 'Solo puedes trabajar en las clases que impartes'
        );
    }
}

/**
 * ¿Puede este usuario ver los datos de ese estudiante?
 * El propio estudiante, su representante, un profesor que le da clase (o es su
 * guía) y el administrador.
 */
export async function canSeeStudent(
    prisma: PrismaClient,
    user: ActingUser | null | undefined,
    studentId: string
): Promise<boolean> {
    if (isAdmin(user)) return true;

    const actorId = idOf(user);
    if (!actorId) return false;
    if (actorId === studentId) return true;

    if (user?.role === UserRole.TUTOR) {
        const n = await prisma.studentTutor.count({ where: { tutorId: actorId, studentId } });
        return n > 0;
    }

    if (user?.role === UserRole.TEACHER) {
        const suyas = await teacherClassroomIds(prisma, actorId);
        if (suyas.length === 0) return false;
        const n = await prisma.studentClassroom.count({
            where: { studentId, isActive: true, classroomId: { in: suyas } },
        });
        return n > 0;
    }

    return false;
}

export async function assertCanSeeStudent(
    prisma: PrismaClient,
    user: ActingUser | null | undefined,
    studentId: string
): Promise<void> {
    if (!(await canSeeStudent(prisma, user, studentId))) {
        throw AppErrors.Forbidden('Solo puedes consultar a tus estudiantes');
    }
}

/**
 * ¿Puede este usuario MIRAR lo que pasa en esa sección?
 *
 * Mirar no es tocar. El horario en vivo de una sección —el tema de la semana y
 * si hay actividades— lo ven también el alumno que estudia ahí y su
 * representante; escribir sigue siendo del profesor de esa clase.
 *
 * Sin esto, el alumno no veía su propio horario con contenido (pantalla en
 * blanco con guiones) y cualquier profesor podía asomarse a una sección ajena.
 */
export async function canSeeClassroom(
    prisma: PrismaClient,
    user: ActingUser | null | undefined,
    classroomId: string
): Promise<boolean> {
    if (isAdmin(user)) return true;

    const actorId = idOf(user);
    if (!actorId) return false;

    if (user?.role === UserRole.TEACHER) {
        return teacherHandlesClassroom(prisma, actorId, classroomId);
    }

    if (user?.role === UserRole.STUDENT) {
        const n = await prisma.studentClassroom.count({
            where: { studentId: actorId, classroomId, isActive: true },
        });
        return n > 0;
    }

    if (user?.role === UserRole.TUTOR) {
        const n = await prisma.studentClassroom.count({
            where: { classroomId, isActive: true, student: { studentTutorings: { some: { tutorId: actorId } } } },
        });
        return n > 0;
    }

    return false;
}

export async function assertCanSeeClassroom(
    prisma: PrismaClient,
    user: ActingUser | null | undefined,
    classroomId: string
): Promise<void> {
    if (!(await canSeeClassroom(prisma, user, classroomId))) {
        throw AppErrors.Forbidden('Esa sección no es tuya');
    }
}
