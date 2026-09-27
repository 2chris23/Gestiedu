import { createError } from '../middleware/error.middleware';
import { borrarGuardandoCopia } from '../utils/papelera';
import { getAcademicConfig } from './promotion/close-cycle.service';
import { avanceDe, type ReglasDeLaborSocial, type AvanceDeLaborSocial } from './promotion/reglas-del-fin-de-ano';

export { avanceDe, type AvanceDeLaborSocial };

/**
 * LA LABOR SOCIAL (LAS HORAS COMUNITARIAS)
 *
 * Los alumnos de los últimos años hacen labor social —requisito para el
 * título de bachiller (Reglamento de la LOE, art. 27)— y cada uno la hace
 * distinta: en otro sitio, en otro proyecto, con otras horas. Se anota cada
 * actividad: qué, dónde, cuántas horas, quién la supervisó.
 *
 *   - La anotan el ADMIN y el PROFESOR GUÍA de la sección del alumno (una
 *     salida de toda la sección se anota a varios de una vez). Nadie más.
 *   - El alumno y su representante solo la ven («45 de 60 h»).
 *   - Solo en los grados que diga el liceo (5to por defecto) y si la tiene
 *     activa.
 *   - Cuenta por horas (las del liceo) o, con 0 horas, por proyecto: se
 *     cumple con la actividad que culmina el proyecto.
 *   - En el cierre del último año es requisito para egresar según el liceo
 *     (BLOQUEA / AVISA / NO): `close-cycle.service`.
 *   - Borrar una actividad guarda copia en la papelera.
 *
 * Pruebas: `tests/integration/labor-social.test.ts` (LABOR-01…07).
 */

type Quien = { id: string; role: string };

/** El avance de muchos alumnos a la vez (para el cierre y la lista). */
export async function avancesDe(prisma: any, instituteId: string, studentIds: string[]): Promise<Map<string, AvanceDeLaborSocial>> {
    const config = await getAcademicConfig(instituteId);
    const filas = studentIds.length
        ? await prisma.actividadDeLaborSocial.findMany({
              where: { studentId: { in: studentIds } },
              select: { studentId: true, horas: true, culminaElProyecto: true },
          })
        : [];
    const porAlumno = new Map<string, Array<{ horas: number; culminaElProyecto: boolean }>>();
    for (const f of filas) porAlumno.set(f.studentId, [...(porAlumno.get(f.studentId) ?? []), f]);
    return new Map(studentIds.map((id) => [id, avanceDe(porAlumno.get(id) ?? [], config.laborSocial)]));
}

/** La sección de este año de un alumno, con su guía. */
async function seccionActual(prisma: any, studentId: string) {
    return prisma.studentClassroom.findFirst({
        where: { studentId, isActive: true, academicYear: { status: 'ACTIVE' } },
        select: { academicYearId: true, classroom: { select: { id: true, name: true, grade: true, teacherId: true } } },
    });
}

/**
 * ¿Puede anotarle labor social? El admin, o el profesor GUÍA de su sección de
 * este año. Da la sección, o corta con 403/409.
 */
async function puedeAnotar(prisma: any, reglas: ReglasDeLaborSocial, quien: Quien, studentId: string) {
    if (!reglas.activa) throw createError(409, 'El liceo no tiene la labor social activa', 'LABOR_SOCIAL_INACTIVA');
    const seccion = await seccionActual(prisma, studentId);
    if (!seccion) throw createError(404, 'Ese alumno no está inscrito en el año en curso', 'NOT_FOUND');
    if (!reglas.grados.includes(seccion.classroom.grade)) {
        throw createError(409, `La labor social es de ${reglas.grados.map((g) => `${g}º`).join(', ')} año`, 'FUERA_DE_LABOR_SOCIAL');
    }
    if (quien.role === 'ADMIN') return seccion;
    if (quien.role === 'TEACHER' && seccion.classroom.teacherId === quien.id) return seccion;
    throw createError(403, 'La labor social la anotan el admin y el profesor guía de la sección', 'FORBIDDEN');
}

export interface DatosDeActividad {
    fecha: string;
    horas: number;
    que: string;
    donde?: string | null;
    proyecto?: string | null;
    responsable?: string | null;
    observaciones?: string | null;
    culminaElProyecto?: boolean;
}

function revisar(d: DatosDeActividad) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha ?? '')) throw createError(400, 'La fecha va como AAAA-MM-DD', 'FECHA_INVALIDA');
    if (typeof d.horas !== 'number' || !Number.isFinite(d.horas) || d.horas <= 0 || d.horas > 24) {
        throw createError(400, 'Las horas de una actividad van de más de 0 a 24', 'HORAS_INVALIDAS');
    }
    const que = (d.que ?? '').trim();
    if (que.length < 3) throw createError(400, 'Di qué se hizo (al menos 3 letras)', 'FALTA_QUE');
    const texto = (v: string | null | undefined, max: number) => (v && v.trim() ? v.trim().slice(0, max) : null);
    return {
        fecha: new Date(`${d.fecha}T00:00:00.000Z`),
        horas: Math.round(d.horas * 100) / 100,
        que: que.slice(0, 200),
        donde: texto(d.donde, 160),
        proyecto: texto(d.proyecto, 160),
        responsable: texto(d.responsable, 120),
        observaciones: texto(d.observaciones, 500),
        culminaElProyecto: d.culminaElProyecto === true,
    };
}

/**
 * Anota una actividad a uno o varios alumnos (una salida de toda la
 * sección). Si alguno no es suyo, no se anota a nadie.
 */
export async function anotarActividad(prisma: any, instituteId: string, quien: Quien, alumnos: string[], datos: DatosDeActividad) {
    const config = await getAcademicConfig(instituteId);
    const unicos = [...new Set(alumnos)];
    if (unicos.length === 0 || unicos.length > 60) throw createError(400, 'De 1 a 60 alumnos a la vez', 'ALUMNOS_INVALIDOS');
    const limpio = revisar(datos);
    const secciones = [];
    for (const id of unicos) secciones.push({ id, seccion: await puedeAnotar(prisma, config.laborSocial, quien, id) });
    const grupo = unicos.length > 1 ? `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` : null;
    await prisma.actividadDeLaborSocial.createMany({
        data: secciones.map(({ id, seccion }) => ({
            ...limpio,
            studentId: id,
            academicYearId: seccion.academicYearId,
            grupo,
            registradaPorId: quien.id,
        })),
    });
    return { anotadas: unicos.length, grupo };
}

export async function borrarActividad(prisma: any, instituteId: string, quien: Quien, id: string) {
    const actividad = await prisma.actividadDeLaborSocial.findUnique({ where: { id }, select: { studentId: true } });
    if (!actividad) throw createError(404, 'Actividad no encontrada', 'NOT_FOUND');
    const config = await getAcademicConfig(instituteId);
    await puedeAnotar(prisma, { ...config.laborSocial, grados: [1, 2, 3, 4, 5, 6] }, quien, actividad.studentId);
    await borrarGuardandoCopia(prisma, 'actividadDeLaborSocial', { id }, { usuarioId: quien.id, motivo: 'actividad de labor social quitada' });
    return { borrada: true };
}

/**
 * La lista para la pantalla «Labor social»: los alumnos de los grados del
 * liceo con su avance. El admin, todos; el guía, los de sus secciones.
 */
export async function listaDeLaborSocial(prisma: any, instituteId: string, quien: Quien) {
    const config = await getAcademicConfig(instituteId);
    const reglas = config.laborSocial;
    const inscripciones = reglas.activa
        ? await prisma.studentClassroom.findMany({
              where: {
                  isActive: true,
                  academicYear: { status: 'ACTIVE' },
                  classroom: { grade: { in: reglas.grados }, ...(quien.role === 'ADMIN' ? {} : { teacherId: quien.id }) },
                  student: { isActive: true },
              },
              select: {
                  student: { select: { id: true, firstName: true, lastName: true } },
                  classroom: { select: { id: true, name: true, grade: true } },
              },
              orderBy: [{ classroom: { grade: 'asc' } }, { classroom: { section: 'asc' } }, { student: { lastName: 'asc' } }],
          })
        : [];
    const avances = await avancesDe(prisma, instituteId, inscripciones.map((i: any) => i.student.id));
    return {
        reglas,
        alumnos: inscripciones.map((i: any) => ({
            alumno: { id: i.student.id, nombre: `${i.student.lastName}, ${i.student.firstName}` },
            seccion: { id: i.classroom.id, nombre: i.classroom.name, grado: i.classroom.grade },
            ...avances.get(i.student.id)!,
        })),
    };
}

/** Lo de un alumno: sus actividades y su avance (lo ven él, su representante y el personal). */
export async function laborSocialDelAlumno(prisma: any, instituteId: string, studentId: string, quien: Quien) {
    const config = await getAcademicConfig(instituteId);
    const actividades = await prisma.actividadDeLaborSocial.findMany({
        where: { studentId },
        orderBy: { fecha: 'desc' },
        include: { registradaPor: { select: { firstName: true, lastName: true } }, academicYear: { select: { name: true } } },
    });
    let puedeAnotarAqui = false;
    try {
        await puedeAnotar(prisma, config.laborSocial, quien, studentId);
        puedeAnotarAqui = true;
    } catch {
        puedeAnotarAqui = false;
    }
    // ¿Le toca? Si está en un grado que la hace, o si ya tiene actividades.
    const seccion = await seccionActual(prisma, studentId);
    const aplica =
        config.laborSocial.activa &&
        (actividades.length > 0 || (!!seccion && config.laborSocial.grados.includes(seccion.classroom.grade)));
    return {
        reglas: config.laborSocial,
        aplica,
        avance: avanceDe(actividades, config.laborSocial),
        puedeAnotar: puedeAnotarAqui,
        actividades: actividades.map((a: any) => ({
            id: a.id,
            fecha: a.fecha.toISOString().slice(0, 10),
            horas: a.horas,
            que: a.que,
            donde: a.donde,
            proyecto: a.proyecto,
            responsable: a.responsable,
            observaciones: a.observaciones,
            culminaElProyecto: a.culminaElProyecto,
            ciclo: a.academicYear?.name ?? null,
            registradaPor: a.registradaPor ? `${a.registradaPor.firstName} ${a.registradaPor.lastName}` : null,
        })),
    };
}

/**
 * Para la constancia de labor social cumplida: las horas y el proyecto. Sin
 * cumplir, no hay constancia (409 LABOR_SOCIAL_NO_CUMPLIDA).
 */
export async function extrasDeLaborSocial(prisma: any, instituteId: string, studentId: string): Promise<Record<string, string>> {
    const config = await getAcademicConfig(instituteId);
    const actividades = await prisma.actividadDeLaborSocial.findMany({
        where: { studentId },
        orderBy: { fecha: 'desc' },
        select: { horas: true, culminaElProyecto: true, proyecto: true },
    });
    const avance = avanceDe(actividades, config.laborSocial);
    if (!avance.cumplida) {
        throw createError(
            409,
            avance.porProyecto
                ? 'El alumno no ha culminado su proyecto de labor social'
                : `El alumno lleva ${avance.horas} de ${avance.requeridas} horas de labor social`,
            'LABOR_SOCIAL_NO_CUMPLIDA'
        );
    }
    const proyecto = actividades.find((a: any) => a.proyecto)?.proyecto;
    return {
        horas: String(avance.horas).replace('.', ','),
        proyecto: proyecto ? ` en el proyecto «${proyecto}»` : '',
    };
}
