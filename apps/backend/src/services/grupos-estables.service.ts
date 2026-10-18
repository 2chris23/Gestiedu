import { createError } from '../middleware/error.middleware';
import { borrarGuardandoCopia } from '../utils/papelera';
import { lapsoDeLaFecha } from '../utils/lapso-de-la-actividad';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { avisar } from './avisos.service';
import { getAcademicConfig } from './promotion/close-cycle.service';
import { REGLAS_DE_GRUPOS_POR_DEFECTO, esReglasDeGrupos, type ReglasDeGrupos } from './reglas-de-grupos';

/**
 * LOS GRUPOS ESTABLES (Grupos de Creación, Recreación y Producción)
 *
 * Pedido por Cristian (18-oct-2026): «un estudiante elige en qué grupo estar,
 * ya sea fútbol, coser, lectura…». En el liceo venezolano son requisito para
 * el título (Res. 143, G.O. 41.044, art. 12): a una hora común de la semana,
 * cada alumno va a SU grupo, de cualquier sección y año.
 *
 * - **La materia «por grupos»** (`Subject.porGrupos`) sigue siendo la del
 *   horario, la boleta y el resumen final de cada sección; los grupos son una
 *   capa encima. La apreciación se escribe en `Apreciacion` de la materia con
 *   la sección del alumno: nada de lo de abajo cambia.
 * - **El alumno pide** un grupo de su turno con cupo libre; **el profesor del
 *   grupo acepta o rechaza**. Rechazado, puede pedir otro —o el mismo— con cupo.
 * - **Una solicitud viva** (PENDIENTE o ACEPTADA) por alumno, materia y
 *   momento: el índice parcial de la migración lo hace cumplir aunque pidan
 *   dos a la vez.
 * - **El cupo** se cuenta con la fila del grupo bloqueada: dos aceptando a la
 *   vez el último lugar no pueden pasarse (GRUPO_LLENO).
 * - **El momento**: «ANUAL» si el liceo elige una vez al año; si elige en
 *   cada lapso, el id del lapso de hoy (`academicConfig.gruposEstables`).
 * - **Sin grupo**: el admin ve quién no tiene uno aceptado y lo asigna.
 *
 * Pruebas: `tests/integration/grupos-estables.test.ts` (GRUPO-*).
 */

export const AREAS_DE_GRUPO = ['ARTE_Y_PATRIMONIO', 'ACCION_CIENTIFICA', 'ACTIVIDAD_FISICA', 'PRODUCCION'] as const;
export type AreaDeGrupo = (typeof AREAS_DE_GRUPO)[number];
const TURNOS = ['MANANA', 'TARDE', 'INTEGRAL'] as const;

export const MOMENTO_ANUAL = 'ANUAL';

type Prisma = any;
type Emisor = any;
export interface Quien {
    userId: string;
    role: string;
}

const nombreDe = (u: { firstName?: string | null; lastName?: string | null } | null | undefined) =>
    u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '';

/** Un grupo de la mañana no le sirve a un alumno de la tarde; la sección integral va a cualquiera. */
const turnoCompatible = (turnoDelGrupo: string | null, turnoDeLaSeccion: string | null) =>
    !turnoDelGrupo || !turnoDeLaSeccion || turnoDelGrupo === turnoDeLaSeccion || turnoDeLaSeccion === 'INTEGRAL';

async function reglasDe(instituteId: string): Promise<ReglasDeGrupos> {
    const config: any = await getAcademicConfig(instituteId);
    return esReglasDeGrupos(config.gruposEstables) ? config.gruposEstables : REGLAS_DE_GRUPOS_POR_DEFECTO;
}

/** El momento de hoy: «ANUAL», o el lapso de hoy si el liceo elige en cada lapso. */
async function momentoDeHoy(prisma: Prisma, reglas: ReglasDeGrupos, academicYearId: string): Promise<string> {
    if (reglas.eleccion === 'ANUAL') return MOMENTO_ANUAL;
    const [lapsos, zona] = await Promise.all([
        prisma.period.findMany({ where: { academicYearId }, select: { id: true, startDate: true, endDate: true } }),
        instituteTimezone(prisma),
    ]);
    return lapsoDeLaFecha(todayInTimezone(zona), lapsos) ?? MOMENTO_ANUAL;
}

/** El grupo con lo que hace falta para decidir sobre él; 404 si no existe. */
async function elGrupoOFalla(prisma: Prisma, grupoId: string) {
    const grupo = await prisma.grupoEstable.findUnique({
        where: { id: grupoId },
        include: {
            subject: { select: { id: true, name: true, porGrupos: true } },
            academicYear: { select: { id: true, status: true } },
            profesor: { select: { id: true, firstName: true, lastName: true } },
        },
    });
    if (!grupo) throw createError(404, 'Ese grupo no existe', 'GRUPO_NO_ENCONTRADO');
    return grupo;
}

/** Solo el profesor de ESE grupo o el admin. */
function puedeLlevarElGrupo(quien: Quien, grupo: { profesorId: string | null }) {
    if (quien.role === 'ADMIN') return;
    if (quien.role === 'TEACHER' && grupo.profesorId && grupo.profesorId === quien.userId) return;
    throw createError(403, 'Solo el profesor del grupo o el administrador', 'GRUPO_AJENO');
}

/** Cuántos aceptados lleva un grupo en un momento. */
const aceptadosEn = (prisma: Prisma, grupoId: string, momento: string) =>
    prisma.solicitudDeGrupo.count({ where: { grupoId, momento, estado: 'ACEPTADA' } });

/**
 * Bloquea la fila del grupo hasta el final de la transacción: quien llega
 * segundo espera y, al contar, ya ve al primero. Así no se pasa del cupo.
 */
const bloquearElGrupo = (tx: Prisma, grupoId: string) => tx.grupoEstable.update({ where: { id: grupoId }, data: { updatedAt: new Date() } });

const esChoqueDeUnica = (e: any) => e?.code === 'P2002' || /solicitudes_de_grupo_una_viva_key/.test(String(e?.message ?? ''));

// ─────────────────────────────────────────────────────────────────────────
// EL ADMIN: los grupos de una materia
// ─────────────────────────────────────────────────────────────────────────

export async function gruposDeLaMateria(prisma: Prisma, instituteId: string, subjectId: string, academicYearId: string) {
    const [materia, reglas] = await Promise.all([
        prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true, porGrupos: true } }),
        reglasDe(instituteId),
    ]);
    if (!materia) throw createError(404, 'Materia no encontrada', 'NOT_FOUND');
    const momento = await momentoDeHoy(prisma, reglas, academicYearId);
    const grupos = await prisma.grupoEstable.findMany({
        where: { subjectId, academicYearId },
        orderBy: { nombre: 'asc' },
        include: { profesor: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });
    const cuentas = await prisma.solicitudDeGrupo.groupBy({
        by: ['grupoId', 'estado'],
        where: { grupoId: { in: grupos.map((g: any) => g.id) }, momento, estado: { in: ['ACEPTADA', 'PENDIENTE'] } },
        _count: { _all: true },
    });
    const cuenta = (grupoId: string, estado: string) =>
        cuentas.find((c: any) => c.grupoId === grupoId && c.estado === estado)?._count._all ?? 0;
    return {
        materia,
        reglas,
        momento,
        grupos: grupos.map((g: any) => ({
            id: g.id,
            nombre: g.nombre,
            descripcion: g.descripcion,
            area: g.area,
            cupo: g.cupo,
            turno: g.turno,
            activo: g.activo,
            profesor: g.profesor ? { id: g.profesor.id, nombre: nombreDe(g.profesor), avatar: g.profesor.avatar ?? null } : null,
            aceptados: cuenta(g.id, 'ACEPTADA'),
            pendientes: cuenta(g.id, 'PENDIENTE'),
        })),
    };
}

export interface DatosDelGrupo {
    nombre: string;
    descripcion?: string | null;
    area?: string | null;
    profesorId?: string | null;
    cupo: number;
    turno?: string | null;
    activo?: boolean;
}

async function validarDatos(prisma: Prisma, d: Partial<DatosDelGrupo>) {
    if (d.nombre !== undefined && !d.nombre.trim()) throw createError(400, 'El grupo necesita un nombre', 'NOMBRE_VACIO');
    if (d.cupo !== undefined && (!Number.isInteger(d.cupo) || d.cupo < 1 || d.cupo > 500)) {
        throw createError(400, 'El cupo va de 1 a 500', 'CUPO_INVALIDO');
    }
    if (d.area && !AREAS_DE_GRUPO.includes(d.area as AreaDeGrupo)) throw createError(400, 'Esa área no existe', 'AREA_INVALIDA');
    if (d.turno && !TURNOS.includes(d.turno as any)) throw createError(400, 'Ese turno no existe', 'TURNO_INVALIDO');
    if (d.profesorId) {
        const profe = await prisma.user.findUnique({ where: { id: d.profesorId }, select: { role: true } });
        if (!profe || profe.role !== 'TEACHER') throw createError(400, 'El profesor del grupo tiene que ser un profesor', 'PROFESOR_INVALIDO');
    }
}

export async function crearGrupo(prisma: Prisma, subjectId: string, academicYearId: string, d: DatosDelGrupo) {
    const materia = await prisma.subject.findUnique({ where: { id: subjectId }, select: { porGrupos: true } });
    if (!materia) throw createError(404, 'Materia no encontrada', 'NOT_FOUND');
    if (!materia.porGrupos) throw createError(409, 'Esa materia no es por grupos', 'MATERIA_SIN_GRUPOS');
    await validarDatos(prisma, d);
    try {
        return await prisma.grupoEstable.create({
            data: {
                subjectId,
                academicYearId,
                nombre: d.nombre.trim(),
                descripcion: d.descripcion?.trim() || null,
                area: d.area || null,
                profesorId: d.profesorId || null,
                cupo: d.cupo,
                turno: d.turno || null,
                activo: d.activo ?? true,
            },
        });
    } catch (e: any) {
        if (e?.code === 'P2002') throw createError(409, 'Ya hay un grupo con ese nombre', 'GRUPO_REPETIDO');
        throw e;
    }
}

export async function editarGrupo(prisma: Prisma, instituteId: string, grupoId: string, d: Partial<DatosDelGrupo>) {
    const grupo = await elGrupoOFalla(prisma, grupoId);
    await validarDatos(prisma, d);
    if (d.cupo !== undefined) {
        const momento = await momentoDeHoy(prisma, await reglasDe(instituteId), grupo.academicYearId);
        if (d.cupo < (await aceptadosEn(prisma, grupoId, momento))) {
            throw createError(409, 'El cupo no puede ser menor que los que ya están en el grupo', 'CUPO_MENOR');
        }
    }
    try {
        return await prisma.grupoEstable.update({
            where: { id: grupoId },
            data: {
                ...(d.nombre !== undefined ? { nombre: d.nombre.trim() } : {}),
                ...(d.descripcion !== undefined ? { descripcion: d.descripcion?.trim() || null } : {}),
                ...(d.area !== undefined ? { area: d.area || null } : {}),
                ...(d.profesorId !== undefined ? { profesorId: d.profesorId || null } : {}),
                ...(d.cupo !== undefined ? { cupo: d.cupo } : {}),
                ...(d.turno !== undefined ? { turno: d.turno || null } : {}),
                ...(d.activo !== undefined ? { activo: d.activo } : {}),
            },
        });
    } catch (e: any) {
        if (e?.code === 'P2002') throw createError(409, 'Ya hay un grupo con ese nombre', 'GRUPO_REPETIDO');
        throw e;
    }
}

/** Quitar un grupo: con copia en la papelera (y sus solicitudes y asistencias, por la cascada). */
export async function quitarGrupo(prisma: Prisma, grupoId: string, quien: Quien) {
    await elGrupoOFalla(prisma, grupoId);
    return borrarGuardandoCopia(prisma, 'grupoEstable', { id: grupoId }, { usuarioId: quien.userId, motivo: 'grupo estable quitado' });
}

// ─────────────────────────────────────────────────────────────────────────
// EL ALUMNO: elegir
// ─────────────────────────────────────────────────────────────────────────

/** La inscripción activa del alumno (su sección del año en curso). */
async function laSeccionDelAlumno(prisma: Prisma, studentId: string) {
    return prisma.studentClassroom.findFirst({
        where: { studentId, isActive: true, academicYear: { status: 'ACTIVE' } },
        select: {
            academicYearId: true,
            classroom: {
                select: {
                    id: true,
                    name: true,
                    shift: true,
                    subjects: { where: { subject: { porGrupos: true } }, select: { subject: { select: { id: true, name: true } } } },
                },
            },
        },
    });
}

/**
 * Lo que ve el alumno: por cada materia por grupos de su sección, su solicitud
 * (la viva, o la última rechazada con su motivo) y los grupos de su turno con
 * cupo libre. Nunca la lista de quién está en cada grupo.
 */
export async function paraElAlumno(prisma: Prisma, instituteId: string, studentId: string) {
    const inscripcion = await laSeccionDelAlumno(prisma, studentId);
    if (!inscripcion) return { materias: [] };
    const reglas = await reglasDe(instituteId);
    const momento = await momentoDeHoy(prisma, reglas, inscripcion.academicYearId);
    const materias = inscripcion.classroom.subjects.map((s: any) => s.subject);
    if (materias.length === 0) return { materias: [] };

    const [grupos, suyas] = await Promise.all([
        prisma.grupoEstable.findMany({
            where: { subjectId: { in: materias.map((m: any) => m.id) }, academicYearId: inscripcion.academicYearId, activo: true },
            orderBy: { nombre: 'asc' },
            include: { profesor: { select: { firstName: true, lastName: true } } },
        }),
        prisma.solicitudDeGrupo.findMany({
            where: { studentId, academicYearId: inscripcion.academicYearId, momento },
            orderBy: { createdAt: 'desc' },
            include: { grupo: { select: { id: true, nombre: true } } },
        }),
    ]);
    const aceptados = await prisma.solicitudDeGrupo.groupBy({
        by: ['grupoId'],
        where: { grupoId: { in: grupos.map((g: any) => g.id) }, momento, estado: 'ACEPTADA' },
        _count: { _all: true },
    });
    const ocupados = new Map(aceptados.map((a: any) => [a.grupoId, a._count._all]));

    return {
        materias: materias.map((m: any) => {
            const deEsta = suyas.filter((s: any) => s.subjectId === m.id);
            const viva = deEsta.find((s: any) => s.estado === 'PENDIENTE' || s.estado === 'ACEPTADA');
            const ultima = viva ?? deEsta[0] ?? null;
            return {
                materia: { id: m.id, nombre: m.name },
                momento,
                abierta: reglas.abierta,
                solicitud: ultima
                    ? {
                          id: ultima.id,
                          estado: ultima.estado,
                          grupo: ultima.grupo,
                          motivoRechazo: ultima.estado === 'RECHAZADA' ? ultima.motivoRechazo : null,
                      }
                    : null,
                grupos: grupos
                    .filter((g: any) => g.subjectId === m.id && turnoCompatible(g.turno, inscripcion.classroom.shift))
                    .map((g: any) => ({
                        id: g.id,
                        nombre: g.nombre,
                        descripcion: g.descripcion,
                        area: g.area,
                        profesor: nombreDe(g.profesor) || null,
                        cupoLibre: Math.max(0, g.cupo - ((ocupados.get(g.id) as number) ?? 0)),
                    }))
                    .filter((g: any) => g.cupoLibre > 0 || g.id === viva?.grupo?.id),
            };
        }),
    };
}

export async function pedirGrupo(prisma: Prisma, instituteId: string, io: Emisor, studentId: string, grupoId: string) {
    const [grupo, inscripcion, reglas] = await Promise.all([elGrupoOFalla(prisma, grupoId), laSeccionDelAlumno(prisma, studentId), reglasDe(instituteId)]);
    if (!reglas.abierta) throw createError(409, 'La elección de grupo está cerrada', 'ELECCION_CERRADA');
    if (!grupo.activo) throw createError(409, 'Ese grupo no está recibiendo estudiantes', 'GRUPO_INACTIVO');
    if (!inscripcion || inscripcion.academicYearId !== grupo.academicYearId) {
        throw createError(403, 'Ese grupo no es de tu año escolar', 'GRUPO_AJENO');
    }
    if (!inscripcion.classroom.subjects.some((s: any) => s.subject.id === grupo.subjectId)) {
        throw createError(403, 'Tu sección no tiene esa materia', 'GRUPO_AJENO');
    }
    if (!turnoCompatible(grupo.turno, inscripcion.classroom.shift)) {
        throw createError(409, 'Ese grupo es de otro turno', 'TURNO_DISTINTO');
    }
    const momento = await momentoDeHoy(prisma, reglas, grupo.academicYearId);
    if ((await aceptadosEn(prisma, grupoId, momento)) >= grupo.cupo) throw createError(409, 'Ese grupo ya está lleno', 'GRUPO_LLENO');

    let solicitud;
    try {
        solicitud = await prisma.solicitudDeGrupo.create({
            data: { grupoId, subjectId: grupo.subjectId, studentId, academicYearId: grupo.academicYearId, momento },
        });
    } catch (e) {
        if (esChoqueDeUnica(e)) throw createError(409, 'Ya tienes una solicitud o un grupo en esta materia', 'YA_TIENE_SOLICITUD');
        throw e;
    }

    if (grupo.profesorId) {
        const alumno = await prisma.user.findUnique({ where: { id: studentId }, select: { firstName: true, lastName: true } });
        await avisar(prisma, instituteId, io, {
            a: [grupo.profesorId],
            titulo: `Quieren entrar a ${grupo.nombre}`,
            mensaje: `${nombreDe(alumno)} (${inscripcion.classroom.name}) pidió entrar al grupo.`,
            enlace: `/dashboard/grupos/${grupo.id}`,
            tipo: 'GRUPO_SOLICITUD',
        });
    }
    return solicitud;
}

/** El alumno retira su solicitud pendiente (aceptada ya no: eso lo cambia el admin). */
export async function retirarSolicitud(prisma: Prisma, studentId: string, solicitudId: string) {
    const { count } = await prisma.solicitudDeGrupo.updateMany({
        where: { id: solicitudId, studentId, estado: 'PENDIENTE' },
        data: { estado: 'RETIRADA' },
    });
    if (count === 0) throw createError(409, 'Esa solicitud ya no está pendiente', 'YA_DECIDIDA');
    return { retirada: true };
}

// ─────────────────────────────────────────────────────────────────────────
// EL PROFESOR DEL GRUPO: decidir
// ─────────────────────────────────────────────────────────────────────────

/** Los grupos que dirige el profesor en el año en curso, con sus pendientes. */
export async function misGrupos(prisma: Prisma, instituteId: string, profesorId: string) {
    const grupos = await prisma.grupoEstable.findMany({
        where: { profesorId, academicYear: { status: 'ACTIVE' } },
        orderBy: { nombre: 'asc' },
        include: { subject: { select: { id: true, name: true } } },
    });
    if (grupos.length === 0) return { grupos: [] };
    const reglas = await reglasDe(instituteId);
    const momento = await momentoDeHoy(prisma, reglas, grupos[0].academicYearId);
    const cuentas = await prisma.solicitudDeGrupo.groupBy({
        by: ['grupoId', 'estado'],
        where: { grupoId: { in: grupos.map((g: any) => g.id) }, momento, estado: { in: ['ACEPTADA', 'PENDIENTE'] } },
        _count: { _all: true },
    });
    const cuenta = (grupoId: string, estado: string) =>
        cuentas.find((c: any) => c.grupoId === grupoId && c.estado === estado)?._count._all ?? 0;
    return {
        grupos: grupos.map((g: any) => ({
            id: g.id,
            nombre: g.nombre,
            materia: g.subject,
            cupo: g.cupo,
            activo: g.activo,
            aceptados: cuenta(g.id, 'ACEPTADA'),
            pendientes: cuenta(g.id, 'PENDIENTE'),
        })),
    };
}

/** Un grupo por dentro: sus miembros (de varias secciones) y las solicitudes pendientes. */
export async function elGrupo(prisma: Prisma, instituteId: string, quien: Quien, grupoId: string) {
    const grupo = await elGrupoOFalla(prisma, grupoId);
    puedeLlevarElGrupo(quien, grupo);
    const momento = await momentoDeHoy(prisma, await reglasDe(instituteId), grupo.academicYearId);
    const solicitudes = await prisma.solicitudDeGrupo.findMany({
        where: { grupoId, momento, estado: { in: ['ACEPTADA', 'PENDIENTE'] } },
        orderBy: { createdAt: 'asc' },
        include: {
            student: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatar: true,
                    studentClassrooms: { where: { isActive: true, academicYearId: grupo.academicYearId }, select: { classroom: { select: { name: true } } } },
                },
            },
        },
    });
    const fila = (s: any) => ({
        solicitudId: s.id,
        estado: s.estado,
        asignadaPorAdmin: s.asignadaPorAdmin,
        alumno: {
            id: s.student.id,
            nombre: `${s.student.lastName}, ${s.student.firstName}`.trim(),
            avatar: s.student.avatar ?? null,
            seccion: s.student.studentClassrooms[0]?.classroom?.name ?? null,
        },
        pedidaEn: s.createdAt,
    });
    return {
        grupo: {
            id: grupo.id,
            nombre: grupo.nombre,
            descripcion: grupo.descripcion,
            area: grupo.area,
            cupo: grupo.cupo,
            turno: grupo.turno,
            activo: grupo.activo,
            materia: { id: grupo.subject.id, nombre: grupo.subject.name },
            profesor: grupo.profesor ? { id: grupo.profesor.id, nombre: nombreDe(grupo.profesor) } : null,
            cerrado: grupo.academicYear.status === 'COMPLETED',
        },
        momento,
        miembros: solicitudes.filter((s: any) => s.estado === 'ACEPTADA').map(fila),
        pendientes: solicitudes.filter((s: any) => s.estado === 'PENDIENTE').map(fila),
    };
}

export async function decidirSolicitud(
    prisma: Prisma,
    instituteId: string,
    io: Emisor,
    quien: Quien,
    solicitudId: string,
    decision: 'ACEPTAR' | 'RECHAZAR',
    motivo?: string | null
) {
    const solicitud = await prisma.solicitudDeGrupo.findUnique({ where: { id: solicitudId } });
    if (!solicitud) throw createError(404, 'Esa solicitud no existe', 'SOLICITUD_NO_ENCONTRADA');
    const grupo = await elGrupoOFalla(prisma, solicitud.grupoId);
    puedeLlevarElGrupo(quien, grupo);

    const estado = decision === 'ACEPTAR' ? 'ACEPTADA' : 'RECHAZADA';
    await prisma.$transaction(async (tx: Prisma) => {
        if (decision === 'ACEPTAR') {
            await bloquearElGrupo(tx, grupo.id);
            if ((await aceptadosEn(tx, grupo.id, solicitud.momento)) >= grupo.cupo) {
                throw createError(409, 'El grupo ya está lleno', 'GRUPO_LLENO');
            }
        }
        const { count } = await tx.solicitudDeGrupo.updateMany({
            where: { id: solicitudId, estado: 'PENDIENTE' },
            data: {
                estado,
                motivoRechazo: decision === 'RECHAZAR' ? motivo?.trim().slice(0, 300) || null : null,
                revisadoPorId: quien.userId,
                revisadoEn: new Date(),
            },
        });
        if (count === 0) throw createError(409, 'Esa solicitud ya se decidió', 'YA_DECIDIDA');
    });

    await avisar(prisma, instituteId, io, {
        a: [solicitud.studentId],
        titulo: decision === 'ACEPTAR' ? `Entraste a ${grupo.nombre}` : `No entraste a ${grupo.nombre}`,
        mensaje:
            decision === 'ACEPTAR'
                ? `Tu solicitud al grupo ${grupo.nombre} fue aceptada.`
                : `Tu solicitud al grupo ${grupo.nombre} no fue aceptada${motivo?.trim() ? `: ${motivo.trim()}` : ''}. Puedes elegir otro grupo.`,
        enlace: `/dashboard/mi-clase/${grupo.subjectId}`,
        tipo: 'GRUPO_DECISION',
    });
    return { estado };
}

// ─────────────────────────────────────────────────────────────────────────
// EL ADMIN: quién está sin grupo, y asignarlo
// ─────────────────────────────────────────────────────────────────────────

/** Los alumnos de las secciones con esa materia que no tienen grupo aceptado, por sección. */
export async function sinGrupo(prisma: Prisma, instituteId: string, subjectId: string, academicYearId: string) {
    const momento = await momentoDeHoy(prisma, await reglasDe(instituteId), academicYearId);
    const [secciones, solicitudes] = await Promise.all([
        prisma.classroom.findMany({
            where: { academicYearId, subjects: { some: { subjectId } } },
            orderBy: [{ grade: 'asc' }, { name: 'asc' }],
            select: {
                id: true,
                name: true,
                shift: true,
                studentClassrooms: {
                    where: { isActive: true },
                    select: { student: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
                },
            },
        }),
        prisma.solicitudDeGrupo.findMany({
            where: { subjectId, academicYearId, momento, estado: { in: ['ACEPTADA', 'PENDIENTE'] } },
            select: { studentId: true, estado: true, grupo: { select: { nombre: true } } },
        }),
    ]);
    const conGrupo = new Set(solicitudes.filter((s: any) => s.estado === 'ACEPTADA').map((s: any) => s.studentId));
    const pendiente = new Map(solicitudes.filter((s: any) => s.estado === 'PENDIENTE').map((s: any) => [s.studentId, s.grupo.nombre]));
    const porSeccion = secciones
        .map((c: any) => ({
            seccion: { id: c.id, nombre: c.name, turno: c.shift },
            alumnos: c.studentClassrooms
                .map((sc: any) => sc.student)
                .filter((a: any) => !conGrupo.has(a.id))
                .map((a: any) => ({
                    id: a.id,
                    nombre: `${a.lastName}, ${a.firstName}`.trim(),
                    avatar: a.avatar ?? null,
                    pendienteEn: pendiente.get(a.id) ?? null,
                }))
                .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre)),
        }))
        .filter((s: any) => s.alumnos.length > 0);
    return { momento, total: porSeccion.reduce((t: number, s: any) => t + s.alumnos.length, 0), secciones: porSeccion };
}

/** El admin pone a un alumno en un grupo: queda aceptado (y su pendiente, si tenía, retirada). */
export async function asignarAlGrupo(prisma: Prisma, instituteId: string, io: Emisor, quien: Quien, grupoId: string, studentId: string) {
    const grupo = await elGrupoOFalla(prisma, grupoId);
    const inscripcion = await prisma.studentClassroom.findFirst({
        where: { studentId, isActive: true, academicYearId: grupo.academicYearId, classroom: { subjects: { some: { subjectId: grupo.subjectId } } } },
        select: { classroom: { select: { shift: true } } },
    });
    if (!inscripcion) throw createError(400, 'Ese alumno no cursa esa materia este año', 'ALUMNO_AJENO');
    if (!turnoCompatible(grupo.turno, inscripcion.classroom.shift)) throw createError(409, 'Ese grupo es de otro turno', 'TURNO_DISTINTO');
    const momento = await momentoDeHoy(prisma, await reglasDe(instituteId), grupo.academicYearId);

    try {
        await prisma.$transaction(async (tx: Prisma) => {
            await bloquearElGrupo(tx, grupo.id);
            if ((await aceptadosEn(tx, grupo.id, momento)) >= grupo.cupo) throw createError(409, 'El grupo ya está lleno', 'GRUPO_LLENO');
            const yaTiene = await tx.solicitudDeGrupo.findFirst({
                where: { studentId, subjectId: grupo.subjectId, academicYearId: grupo.academicYearId, momento, estado: 'ACEPTADA' },
                select: { id: true },
            });
            if (yaTiene) throw createError(409, 'Ese alumno ya tiene grupo', 'YA_TIENE_GRUPO');
            await tx.solicitudDeGrupo.updateMany({
                where: { studentId, subjectId: grupo.subjectId, academicYearId: grupo.academicYearId, momento, estado: 'PENDIENTE' },
                data: { estado: 'RETIRADA', revisadoPorId: quien.userId, revisadoEn: new Date() },
            });
            await tx.solicitudDeGrupo.create({
                data: {
                    grupoId: grupo.id,
                    subjectId: grupo.subjectId,
                    studentId,
                    academicYearId: grupo.academicYearId,
                    momento,
                    estado: 'ACEPTADA',
                    asignadaPorAdmin: true,
                    revisadoPorId: quien.userId,
                    revisadoEn: new Date(),
                },
            });
        });
    } catch (e) {
        if (esChoqueDeUnica(e)) throw createError(409, 'Ese alumno ya tiene grupo', 'YA_TIENE_GRUPO');
        throw e;
    }

    await avisar(prisma, instituteId, io, {
        a: [studentId],
        titulo: `Tu grupo: ${grupo.nombre}`,
        mensaje: `El liceo te ubicó en el grupo ${grupo.nombre}.`,
        enlace: `/dashboard/mi-clase/${grupo.subjectId}`,
        tipo: 'GRUPO_DECISION',
    });
    return { asignado: true };
}
