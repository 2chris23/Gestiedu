import { AppErrors, createError } from '../middleware/error.middleware';
import { teacherClassroomIds } from './authorization.service';
import { avisar } from './avisos.service';
import { datosDelPlantel, valoresDelAlumno, fechaLarga } from './constancias.service';
import { plantillaDe, parrafosDe } from './plantillas-de-documentos.service';

/**
 * LAS OBSERVACIONES, EN UN PANEL PROPIO; Y CITAR AL REPRESENTANTE DESDE ELLAS
 *
 *   - **El panel** (`observacionesDelPanel`): lo que la persona puede ver —el
 *     admin, todo; el profesor, lo de las secciones donde da clase o es guía,
 *     y lo que escribió él—, con filtros. Crear sin estar en una clase va por
 *     la ruta de siempre (`POST /observations`) con la sección del alumno.
 *   - **Citar** (`citar`): dentro de una observación, día, hora, lugar y
 *     motivo. Al crearla se AVISA a cada representante del alumno (campana y
 *     teléfono, `avisos.service`): en la pantalla bloqueada solo «Citación del
 *     liceo: martes 14, 8:00 a. m.», nunca el motivo.
 *   - **¿Vino?** (`marcarAsistencia`): sí o no, y lo que se habló.
 *   - **La hoja** (`hojaDeCitacion`): para imprimir (plantilla `CITACION`).
 *
 * Citan y marcan: el admin, el profesor guía de la sección del alumno y quien
 * escribió la observación. El representante ve las de sus representados, sin
 * tocarlas; el alumno no las ve (son para su representante).
 *
 * Pruebas: `tests/integration/citaciones.test.ts` (OBS-PANEL-*, CITA-*).
 */

type Quien = { id: string; role: string };
type Emisor = Parameters<typeof avisar>[2];

const nombre = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}` : '');
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «2026-10-14» → «martes 14 de octubre de 2026». */
export function diaLargo(ymd: string): string {
    const [y, m, d] = ymd.split('-').map(Number);
    return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${fechaLarga(ymd)}`;
}

/** «14:30» → «2:30 p. m.» */
export function horaLegible(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    const sufijo = h < 12 ? 'a. m.' : 'p. m.';
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${sufijo}`;
}

/** La sección de este año del alumno, con su guía. */
async function seccionActual(prisma: any, studentId: string) {
    const i = await prisma.studentClassroom.findFirst({
        where: { studentId, isActive: true, academicYear: { status: 'ACTIVE' } },
        select: { classroom: { select: { id: true, name: true, grade: true, section: true, shift: true, teacherId: true } }, academicYear: { select: { name: true } } },
    });
    return i ?? null;
}

/** ¿Puede citar (y marcar) sobre esta observación? */
async function puedeCitar(prisma: any, quien: Quien, obs: { studentId: string; createdById: string }): Promise<boolean> {
    if (quien.role === 'ADMIN') return true;
    if (quien.role !== 'TEACHER') return false;
    if (obs.createdById === quien.id) return true;
    const seccion = await seccionActual(prisma, obs.studentId);
    return seccion?.classroom.teacherId === quien.id;
}

// ─── El panel ────────────────────────────────────────────────────────────────

export interface FiltrosDelPanel {
    classroomId?: string;
    studentId?: string;
    tipo?: string;
    desde?: string;
    hasta?: string;
    conCitacion?: boolean;
    pagina?: number;
}

export async function observacionesDelPanel(prisma: any, quien: Quien, f: FiltrosDelPanel) {
    if (quien.role !== 'ADMIN' && quien.role !== 'TEACHER') throw AppErrors.Forbidden('El panel de observaciones es del personal');
    const where: any = { AND: [] as any[] };
    if (quien.role === 'TEACHER') {
        const suyas = await teacherClassroomIds(prisma, quien.id);
        where.AND.push({ OR: [{ classroomId: { in: suyas } }, { createdById: quien.id }] });
    }
    if (f.classroomId) where.AND.push({ classroomId: f.classroomId });
    if (f.studentId) where.AND.push({ studentId: f.studentId });
    if (f.tipo) where.AND.push({ type: f.tipo });
    if (f.desde) where.AND.push({ date: { gte: new Date(`${f.desde}T00:00:00.000Z`) } });
    if (f.hasta) where.AND.push({ date: { lte: new Date(`${f.hasta}T23:59:59.999Z`) } });
    if (f.conCitacion) where.AND.push({ citaciones: { some: {} } });

    const porPagina = 20;
    const pagina = Math.max(1, f.pagina ?? 1);
    const [filas, total] = await Promise.all([
        prisma.observation.findMany({
            where,
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            skip: (pagina - 1) * porPagina,
            take: porPagina,
            select: {
                id: true,
                title: true,
                description: true,
                type: true,
                date: true,
                studentId: true,
                createdById: true,
                student: { select: { firstName: true, lastName: true } },
                createdBy: { select: { firstName: true, lastName: true } },
                classroom: { select: { id: true, name: true, teacherId: true } },
                subject: { select: { name: true } },
                citaciones: { orderBy: { fecha: 'desc' } },
            },
        }),
        prisma.observation.count({ where }),
    ]);

    // Quién es guía de la sección de HOY de cada alumno (para «puede citar»).
    const alumnos = [...new Set(filas.map((o: any) => o.studentId))];
    const guias = new Map<string, string | null>();
    if (quien.role === 'TEACHER' && alumnos.length) {
        const inscritos = await prisma.studentClassroom.findMany({
            where: { studentId: { in: alumnos }, isActive: true, academicYear: { status: 'ACTIVE' } },
            select: { studentId: true, classroom: { select: { teacherId: true } } },
        });
        for (const i of inscritos) guias.set(i.studentId, i.classroom.teacherId);
    }

    return {
        observaciones: filas.map((o: any) => ({
            id: o.id,
            titulo: o.title,
            descripcion: o.description,
            tipo: o.type,
            fecha: o.date.toISOString().slice(0, 10),
            alumno: { id: o.studentId, nombre: nombre(o.student) },
            seccion: o.classroom ? { id: o.classroom.id, nombre: o.classroom.name } : null,
            materia: o.subject?.name ?? null,
            autor: nombre(o.createdBy),
            puedeCitar: quien.role === 'ADMIN' || o.createdById === quien.id || guias.get(o.studentId) === quien.id,
            citaciones: o.citaciones.map(citacionLegible),
        })),
        total,
        pagina,
        paginas: Math.max(1, Math.ceil(total / porPagina)),
    };
}

function citacionLegible(c: any) {
    const fecha = c.fecha.toISOString().slice(0, 10);
    return {
        id: c.id,
        fecha,
        hora: c.hora,
        cuando: `${diaLargo(fecha)}, ${horaLegible(c.hora)}`,
        lugar: c.lugar,
        motivo: c.motivo,
        estado: c.estado as 'PENDIENTE' | 'ASISTIO' | 'NO_ASISTIO',
        loQueSeHablo: c.loQueSeHablo,
    };
}

// ─── Citar ───────────────────────────────────────────────────────────────────

export interface DatosDeLaCitacion {
    fecha: string;
    hora: string;
    lugar: string;
    motivo: string;
}

export async function citar(prisma: any, instituteId: string, io: Emisor, quien: Quien, observationId: string, d: DatosDeLaCitacion, hoy: string) {
    const obs = await prisma.observation.findUnique({
        where: { id: observationId },
        select: { id: true, studentId: true, createdById: true, student: { select: { firstName: true, lastName: true } } },
    });
    if (!obs) throw AppErrors.NotFound('Observación');
    if (!(await puedeCitar(prisma, quien, obs))) {
        throw AppErrors.Forbidden('Citan el admin, el profesor guía del alumno y quien escribió la observación');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) || Number.isNaN(Date.parse(d.fecha))) throw createError(400, 'La fecha no es válida', 'CITACION_INVALIDA');
    if (d.fecha < hoy) throw createError(400, 'No se puede citar para un día que ya pasó', 'CITACION_INVALIDA');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora)) throw createError(400, 'La hora no es válida', 'CITACION_INVALIDA');
    const lugar = String(d.lugar ?? '').trim();
    const motivo = String(d.motivo ?? '').trim();
    if (lugar.length < 3 || lugar.length > 120) throw createError(400, 'El lugar va de 3 a 120 letras', 'CITACION_INVALIDA');
    if (motivo.length < 5 || motivo.length > 500) throw createError(400, 'El motivo va de 5 a 500 letras', 'CITACION_INVALIDA');

    const c = await prisma.citacion.create({
        data: { observationId, studentId: obs.studentId, fecha: new Date(`${d.fecha}T00:00:00.000Z`), hora: d.hora, lugar, motivo, citadaPor: quien.id },
    });

    // A cada representante: en la campana, el motivo; en la pantalla bloqueada, solo cuándo.
    const representantes = await prisma.studentTutor.findMany({ where: { studentId: obs.studentId }, select: { tutorId: true } });
    const cuando = `${diaLargo(d.fecha)}, ${horaLegible(d.hora)}`;
    await avisar(prisma, instituteId, io, {
        a: representantes.map((r: any) => r.tutorId),
        titulo: `Citación: ${obs.student.firstName}`,
        mensaje: `${cuando}, en ${lugar}. Motivo: ${motivo}`,
        enlace: `/dashboard/citaciones/${c.id}`,
        tipo: 'CITACION',
        alTelefono: { titulo: 'Citación del liceo', cuerpo: cuando.charAt(0).toUpperCase() + cuando.slice(1) },
    });
    return { ...citacionLegible(c), alumnoId: obs.studentId, avisados: representantes.length };
}

export async function marcarAsistencia(prisma: any, quien: Quien, citacionId: string, estado: string, loQueSeHablo?: string | null) {
    const c = await prisma.citacion.findUnique({ where: { id: citacionId }, include: { observation: { select: { studentId: true, createdById: true } } } });
    if (!c) throw AppErrors.NotFound('Citación');
    if (!(await puedeCitar(prisma, quien, c.observation))) throw AppErrors.Forbidden('Marcan el admin, el guía del alumno y quien escribió la observación');
    if (!['PENDIENTE', 'ASISTIO', 'NO_ASISTIO'].includes(estado)) throw createError(400, 'Vino, no vino, o pendiente', 'CITACION_INVALIDA');
    const texto = loQueSeHablo == null ? null : String(loQueSeHablo).trim().slice(0, 2000) || null;
    const hecha = await prisma.citacion.update({
        where: { id: citacionId },
        data: { estado, loQueSeHablo: texto, marcadaPor: quien.id, marcadaEl: new Date() },
    });
    return citacionLegible(hecha);
}

/** ¿Puede VER esta citación? Quien puede citar, y los representantes del alumno. */
async function puedeVer(prisma: any, quien: Quien, c: { studentId: string; observation: { studentId: string; createdById: string } }) {
    if (await puedeCitar(prisma, quien, c.observation)) return true;
    if (quien.role === 'TUTOR') return (await prisma.studentTutor.count({ where: { tutorId: quien.id, studentId: c.studentId } })) > 0;
    return false;
}

/** La hoja de la citación, para imprimir. */
export async function hojaDeCitacion(prisma: any, instituteId: string, quien: Quien, citacionId: string, hoy: string) {
    const c = await prisma.citacion.findUnique({
        where: { id: citacionId },
        include: {
            observation: { select: { studentId: true, createdById: true, title: true } },
            student: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    tipoDeCedula: true,
                    studentTutorings: { orderBy: { createdAt: 'asc' }, select: { relationship: true, tutor: { select: { id: true, firstName: true, lastName: true } } } },
                },
            },
        },
    });
    if (!c || !(await puedeVer(prisma, quien, c))) throw AppErrors.NotFound('Citación');

    const [plantel, plantilla, seccion] = await Promise.all([
        datosDelPlantel(instituteId, c.createdAt.toISOString().slice(0, 10)),
        plantillaDe(instituteId, 'CITACION'),
        seccionActual(prisma, c.studentId),
    ]);
    const tutores = c.student.studentTutorings;
    // Si la ve un representante, la hoja va a su nombre.
    const principal = tutores.find((t: any) => t.tutor.id === quien.id) ?? tutores[0];
    const legible = citacionLegible(c);
    const valores = {
        ...plantel.valores,
        ...valoresDelAlumno(c.student, seccion?.classroom ?? null, seccion?.academicYear.name ?? '', plantel.nivel),
        cursa: 'cursa',
        representante: principal ? nombre(principal.tutor) : 'representante',
        fechaDeLaCitacion: diaLargo(legible.fecha),
        horaDeLaCitacion: horaLegible(c.hora),
        lugarDeLaCitacion: c.lugar,
        motivoDeLaCitacion: c.motivo,
    };
    const esPersonal = quien.role === 'ADMIN' || quien.role === 'TEACHER';
    return {
        titulo: plantilla.titulo,
        parrafos: parrafosDe(plantilla.texto, valores),
        firmante: plantel.firmante,
        alumno: { id: c.student.id, nombre: nombre(c.student) },
        representante: principal ? { nombre: nombre(principal.tutor), parentesco: principal.relationship } : null,
        citacion: legible,
        puedeMarcar: esPersonal && (await puedeCitar(prisma, quien, c.observation)),
        emitidaEl: hoy,
    };
}

/** Las citaciones de los representados de un representante (para su Inicio). */
export async function citacionesDelRepresentante(prisma: any, tutorId: string) {
    const suyos = await prisma.studentTutor.findMany({ where: { tutorId }, select: { studentId: true } });
    const filas = await prisma.citacion.findMany({
        where: { studentId: { in: suyos.map((s: any) => s.studentId) } },
        orderBy: { fecha: 'desc' },
        take: 20,
        include: { student: { select: { firstName: true, lastName: true } } },
    });
    return filas.map((c: any) => ({ ...citacionLegible(c), alumno: { id: c.studentId, nombre: nombre(c.student) } }));
}
