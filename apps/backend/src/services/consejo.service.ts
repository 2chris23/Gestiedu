import { AppErrors, createError } from '../middleware/error.middleware';
import { borrarGuardandoCopia } from '../utils/papelera';
import { getAcademicConfig } from './promotion/close-cycle.service';
import { bulkSubjectAveragesConDatos } from './bulk-averages.service';
import { redondearComoElMPPE } from './grades.service';
import { datosDelPlantel, fechaLarga, gradoLegible } from './constancias.service';
import { plantillaDe, parrafosDe } from './plantillas-de-documentos.service';

/**
 * EL CONSEJO DE SECCIÓN
 *
 * Al cerrar cada lapso, los profesores de la sección se reúnen y revisan a
 * los alumnos. El acta dice cuándo fue, quién asistió, qué casos se trataron
 * (con lo tratado y el acuerdo de cada uno) y los acuerdos generales. Una por
 * sección y lapso.
 *
 *   - El sistema **propone** los casos: materias reprobadas en el lapso (por
 *     debajo de la mínima del liceo), asistencia por debajo de la mínima del
 *     liceo, u observaciones en el lapso. Se añaden o quitan a mano.
 *   - La escriben el admin y el profesor GUÍA de la sección; la leen los
 *     profesores que dan clase en ella. Alumnos y representantes, no.
 *   - Borrar el acta (o quitar un caso al guardar) guarda copia.
 *
 * El texto de apertura y cierre del acta es del liceo (plantilla
 * `ACTA_CONSEJO`). Pruebas: `tests/integration/consejo.test.ts` (CONSEJO-*).
 */

type Quien = { id: string; role: string };
const nombre = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function laSeccion(prisma: any, classroomId: string) {
    const s = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: {
            id: true,
            name: true,
            grade: true,
            section: true,
            academicYearId: true,
            teacherId: true,
            teacher: { select: { id: true, firstName: true, lastName: true } },
            academicYear: { select: { name: true } },
            subjects: { select: { teacherId: true, subject: { select: { id: true, name: true, evaluacion: true } }, teacher: { select: { id: true, firstName: true, lastName: true } } } },
        },
    });
    if (!s) throw AppErrors.NotFound('Sección');
    return s;
}

function permisos(s: any, quien: Quien) {
    const escribe = quien.role === 'ADMIN' || (quien.role === 'TEACHER' && s.teacherId === quien.id);
    const lee = escribe || (quien.role === 'TEACHER' && s.subjects.some((x: any) => x.teacherId === quien.id));
    return { escribe, lee };
}

async function elLapso(prisma: any, s: any, periodId: string) {
    const p = await prisma.period.findUnique({ where: { id: periodId }, select: { id: true, name: true, startDate: true, endDate: true, academicYearId: true } });
    if (!p || p.academicYearId !== s.academicYearId) throw AppErrors.NotFound('Lapso');
    return p;
}

/** Los profesores de la sección (el guía y los que dan clase), con sus materias. */
function profesoresDe(s: any) {
    const porId = new Map<string, { id: string; nombre: string; materias: string[] }>();
    if (s.teacher) porId.set(s.teacher.id, { id: s.teacher.id, nombre: nombre(s.teacher), materias: ['Guía'] });
    for (const cs of s.subjects) {
        if (!cs.teacher) continue;
        const p = porId.get(cs.teacher.id) ?? { id: cs.teacher.id, nombre: nombre(cs.teacher), materias: [] as string[] };
        p.materias.push(cs.subject.name);
        porId.set(cs.teacher.id, p);
    }
    return [...porId.values()];
}

/** Los alumnos que el sistema propone para el consejo, y por qué. */
async function propuestos(prisma: any, instituteId: string, s: any, lapso: any) {
    const config = await getAcademicConfig(instituteId);
    const inscritos = await prisma.studentClassroom.findMany({
        where: { classroomId: s.id, isActive: true },
        select: { student: { select: { id: true, firstName: true, lastName: true } } },
    });
    const ids = inscritos.map((i: any) => i.student.id);
    if (ids.length === 0) return { alumnos: [], propuestos: [] };
    const numericas = s.subjects.filter((x: any) => x.subject.evaluacion !== 'CUALITATIVA').map((x: any) => x.subject);
    const [promedios, asistencia, observaciones] = await Promise.all([
        bulkSubjectAveragesConDatos(prisma, { classroomId: s.id, studentIds: ids, subjectIds: numericas.map((m: any) => m.id), periodId: lapso.id }),
        prisma.dailyAttendance.groupBy({
            by: ['studentId', 'status'],
            where: { classroomId: s.id, studentId: { in: ids }, date: { gte: lapso.startDate, lte: lapso.endDate } },
            _count: { _all: true },
        }),
        prisma.observation.groupBy({
            by: ['studentId'],
            where: { studentId: { in: ids }, date: { gte: lapso.startDate, lte: new Date(lapso.endDate.getTime() + 86399999) } },
            _count: { _all: true },
        }),
    ]);
    const asis = new Map<string, { total: number; vino: number }>();
    for (const a of asistencia) {
        const x = asis.get(a.studentId) ?? { total: 0, vino: 0 };
        x.total += a._count._all;
        if (a.status === 'PRESENT' || a.status === 'LATE') x.vino += a._count._all;
        asis.set(a.studentId, x);
    }
    const obs = new Map<string, number>(observaciones.map((o: any) => [o.studentId, o._count._all]));

    const alumnos = inscritos
        .map((i: any) => ({ id: i.student.id, nombre: nombre(i.student), apellidos: i.student.lastName }))
        .sort((a: any, b: any) => a.apellidos.localeCompare(b.apellidos, 'es'));
    const lista = [];
    for (const a of alumnos) {
        // La nota del lapso con el redondeo del liceo, como la boleta: un 9,6 que
        // la boleta enseña como 10 no es una reprobada en el consejo.
        const redondeo = (n: number) => (config.redondeoDeDefinitivas === 'NINGUNO' ? n : redondearComoElMPPE(n));
        const reprobadas = numericas
            .map((m: any) => ({ materia: m.name, ...(promedios.get(a.id)?.get(m.id) ?? { promedio: 0, conNotas: false }) }))
            .map((x: any) => ({ ...x, promedio: redondeo(x.promedio) }))
            .filter((x: any) => x.conNotas && x.promedio < config.notaMinimaAprobatoria)
            .map((x: any) => ({ materia: x.materia, nota: x.promedio }));
        const a2 = asis.get(a.id);
        const pct = a2 && a2.total > 0 ? Math.round((a2.vino / a2.total) * 1000) / 10 : null;
        const bajaAsistencia = pct !== null && pct < config.asistenciaMinima;
        const nObs = obs.get(a.id) ?? 0;
        if (reprobadas.length || bajaAsistencia || nObs) {
            lista.push({ alumno: { id: a.id, nombre: a.nombre }, motivos: { reprobadas, asistencia: bajaAsistencia ? pct : null, observaciones: nObs } });
        }
    }
    return { alumnos: alumnos.map((a: any) => ({ id: a.id, nombre: a.nombre })), propuestos: lista };
}

/** Los lapsos de la sección, con si ya tienen acta. */
export async function consejosDeLaSeccion(prisma: any, quien: Quien, classroomId: string) {
    const s = await laSeccion(prisma, classroomId);
    const { lee, escribe } = permisos(s, quien);
    if (!lee) throw AppErrors.Forbidden('El consejo lo ven el admin y los profesores de la sección');
    const [lapsos, actas] = await Promise.all([
        prisma.period.findMany({ where: { academicYearId: s.academicYearId }, orderBy: { startDate: 'asc' }, select: { id: true, name: true } }),
        prisma.consejoDeSeccion.findMany({ where: { classroomId }, select: { periodId: true, fecha: true } }),
    ]);
    const hecha = new Map<string, Date>(actas.map((a: any) => [a.periodId, a.fecha]));
    return {
        seccion: { id: s.id, nombre: s.name },
        puedeEscribir: escribe,
        lapsos: lapsos.map((l: any) => ({ id: l.id, nombre: l.name, acta: hecha.has(l.id) ? ymd(hecha.get(l.id)!) : null })),
    };
}

export async function consejo(prisma: any, instituteId: string, quien: Quien, classroomId: string, periodId: string) {
    const s = await laSeccion(prisma, classroomId);
    const { lee, escribe } = permisos(s, quien);
    if (!lee) throw AppErrors.Forbidden('El consejo lo ven el admin y los profesores de la sección');
    const lapso = await elLapso(prisma, s, periodId);
    const [acta, sugerencia] = await Promise.all([
        prisma.consejoDeSeccion.findUnique({
            where: { classroomId_periodId: { classroomId, periodId } },
            include: { casos: { orderBy: { orden: 'asc' }, include: { student: { select: { id: true, firstName: true, lastName: true } } } } },
        }),
        propuestos(prisma, instituteId, s, lapso),
    ]);
    return {
        seccion: { id: s.id, nombre: s.name, grado: s.grade, seccion: s.section, ciclo: s.academicYear.name },
        lapso: { id: lapso.id, nombre: lapso.name, desde: ymd(lapso.startDate), hasta: ymd(lapso.endDate) },
        puedeEscribir: escribe,
        profesores: profesoresDe(s),
        alumnos: sugerencia.alumnos,
        propuestos: sugerencia.propuestos,
        acta: acta
            ? {
                  fecha: ymd(acta.fecha),
                  asistentes: acta.asistentes,
                  acuerdosGenerales: acta.acuerdosGenerales,
                  casos: acta.casos.map((c: any) => ({ alumno: { id: c.studentId, nombre: nombre(c.student) }, motivos: c.motivos, loTratado: c.loTratado, acuerdo: c.acuerdo })),
              }
            : null,
    };
}

export interface ActaNueva {
    fecha: string;
    asistentes: Array<{ id: string; asistio: boolean }>;
    acuerdosGenerales?: string | null;
    casos: Array<{ studentId: string; loTratado?: string | null; acuerdo?: string | null }>;
}

export async function guardarConsejo(prisma: any, instituteId: string, quien: Quien, classroomId: string, periodId: string, d: ActaNueva) {
    const s = await laSeccion(prisma, classroomId);
    if (!permisos(s, quien).escribe) throw AppErrors.Forbidden('El acta la escriben el admin y el profesor guía de la sección');
    const lapso = await elLapso(prisma, s, periodId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw createError(400, 'La fecha del consejo no es válida', 'ACTA_INVALIDA');
    const profesores = profesoresDe(s);
    const asistio = new Map(d.asistentes.map((a) => [a.id, !!a.asistio]));
    const asistentes = profesores.map((p) => ({ ...p, asistio: asistio.get(p.id) ?? false }));
    const inscritos = new Set(
        (await prisma.studentClassroom.findMany({ where: { classroomId, isActive: true }, select: { studentId: true } })).map((x: any) => x.studentId)
    );
    const casos = d.casos.filter((c, i, todos) => todos.findIndex((o) => o.studentId === c.studentId) === i);
    for (const c of casos) if (!inscritos.has(c.studentId)) throw createError(400, 'Un caso es de un alumno que no está en la sección', 'ACTA_INVALIDA');
    const { propuestos: sugeridos } = await propuestos(prisma, instituteId, s, lapso);
    const motivosDe = new Map(sugeridos.map((p: any) => [p.alumno.id, p.motivos]));
    const texto = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

    const acta = await prisma.consejoDeSeccion.upsert({
        where: { classroomId_periodId: { classroomId, periodId } },
        create: { classroomId, periodId, fecha: new Date(`${d.fecha}T00:00:00.000Z`), asistentes, acuerdosGenerales: texto(d.acuerdosGenerales, 4000), escritoPor: quien.id },
        update: { fecha: new Date(`${d.fecha}T00:00:00.000Z`), asistentes, acuerdosGenerales: texto(d.acuerdosGenerales, 4000), escritoPor: quien.id },
    });
    // Los casos que se quitaron, con copia; los que siguen, al día.
    const quedan = casos.map((c) => c.studentId);
    await borrarGuardandoCopia(prisma, 'casoDelConsejo', { consejoId: acta.id, studentId: { notIn: quedan } }, { usuarioId: quien.id, motivo: 'caso quitado del acta' });
    for (const [orden, c] of casos.entries()) {
        const datos = { loTratado: texto(c.loTratado, 2000), acuerdo: texto(c.acuerdo, 2000), orden, motivos: motivosDe.get(c.studentId) ?? { aMano: true } };
        await prisma.casoDelConsejo.upsert({
            where: { consejoId_studentId: { consejoId: acta.id, studentId: c.studentId } },
            create: { consejoId: acta.id, studentId: c.studentId, ...datos },
            update: datos,
        });
    }
    return consejo(prisma, instituteId, quien, classroomId, periodId);
}

export async function borrarConsejo(prisma: any, quien: Quien, classroomId: string, periodId: string) {
    const s = await laSeccion(prisma, classroomId);
    if (!permisos(s, quien).escribe) throw AppErrors.Forbidden('El acta la borran el admin y el profesor guía');
    const n = await borrarGuardandoCopia(prisma, 'consejoDeSeccion', { classroomId, periodId }, { usuarioId: quien.id, motivo: 'acta del consejo borrada' });
    if (n === 0) throw AppErrors.NotFound('Acta');
    return { borrada: true };
}

/** El acta para imprimir, con el texto del liceo. */
export async function actaParaImprimir(prisma: any, instituteId: string, quien: Quien, classroomId: string, periodId: string, hoy: string) {
    const c = await consejo(prisma, instituteId, quien, classroomId, periodId);
    if (!c.acta) throw createError(404, 'Este lapso todavía no tiene acta', 'SIN_ACTA');
    const [plantel, plantilla, s] = await Promise.all([datosDelPlantel(instituteId, hoy), plantillaDe(instituteId, 'ACTA_CONSEJO'), laSeccion(prisma, classroomId)]);
    const parrafos = parrafosDe(plantilla.texto, {
        ...plantel.valores,
        grado: gradoLegible(c.seccion.grado),
        seccion: c.seccion.seccion,
        ciclo: c.seccion.ciclo,
        lapso: c.lapso.nombre,
        fechaDelConsejo: fechaLarga(c.acta.fecha),
        guia: s.teacher ? nombre(s.teacher) : '',
    });
    return { ...c, titulo: plantilla.titulo, parrafos, firmante: plantel.firmante, emitidaEl: hoy };
}
