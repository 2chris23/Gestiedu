import { PrismaClient } from '@prisma/client';
import { createError } from '../middleware/error.middleware';
import { borrarGuardandoCopia } from '../utils/papelera';
import { calendarioComoElMPPE } from '../utils/calendario-mppe';
import { nombreDeLaSeccion, slugDeLaSeccion } from '../utils/nombre-de-la-seccion';
import { bulkSubjectAveragesConDatos } from './bulk-averages.service';
import {
    prepareClose,
    getAcademicConfig,
    esCondicion,
    gradoDeDestino,
    anoSiguiente,
    profesorParaLaPendiente,
    SuggestionStatus,
    StudentSuggestion,
} from './promotion/close-cycle.service';

/**
 * EL FIN DEL AÑO ESCOLAR, POR PASOS
 *
 * Lo que hace control de estudios al terminar el año, en el orden en que lo
 * hace, cada paso con su estado (pantalla `/dashboard/academico/<año>/cierre`):
 *
 *   1. ¿Está todo cargado? Qué sección y materia tiene alumnos sin notas del
 *      último lapso (o sin apreciación final), y de qué profesor. Solo avisa.
 *   2. Resultado final: definitivas y condición sugerida; el Resumen Final.
 *   3. Revisión: la pone el PROFESOR de la materia (`revision.service`), con
 *      las partes que diga el liceo; el admin corrige.
 *   4. Decisión por alumno: la sugerencia con las reglas del liceo; el admin la
 *      cambia con un MOTIVO que queda anotado (`DecisionDeFinDeAno`).
 *   5. El año siguiente: se crea desde aquí con el calendario del MPPE y
 *      copiando la estructura de este (secciones, materias con sus horas y,
 *      si se pide, profesores y horarios).
 *   6. Colocar y cerrar (`close-cycle.service.confirmClose`).
 *
 * Y después de cerrar, **corregir** la decisión de un alumno (con motivo):
 * se rehacen su expediente, su matrícula y sus materias pendientes.
 *
 * Pruebas: `tests/integration/fin-de-ano.test.ts` (CIERRE-01…10).
 */

async function elCiclo(prisma: any, academicYearId: string) {
    const ciclo = await prisma.academicYear.findUnique({
        where: { id: academicYearId },
        select: { id: true, name: true, status: true, startDate: true, endDate: true },
    });
    if (!ciclo) throw createError(404, 'Año escolar no encontrado', 'NOT_FOUND');
    return ciclo;
}

// ─── 1. ¿Está todo cargado? ─────────────────────────────────────────────────

export interface Faltante {
    seccion: { id: string; nombre: string };
    materia: { id: string; nombre: string; cualitativa: boolean };
    profesor: string | null;
    sinNota: number;
    total: number;
    alumnos: string[];
}

/**
 * Las materias de cada sección con alumnos SIN notas en el último lapso (o
 * sin la apreciación final, si la materia es cualitativa). Una nota en 0 es
 * una nota: no falta.
 */
export async function faltantesDelUltimoLapso(prisma: any, academicYearId: string): Promise<{ lapso: { id: string; nombre: string } | null; faltantes: Faltante[] }> {
    await elCiclo(prisma, academicYearId);
    const lapsos = await prisma.period.findMany({
        where: { academicYearId },
        orderBy: { startDate: 'desc' },
        select: { id: true, name: true },
        take: 1,
    });
    const ultimo = lapsos[0] ?? null;
    const secciones = await prisma.classroom.findMany({
        where: { academicYearId, isActive: true },
        orderBy: [{ grade: 'asc' }, { section: 'asc' }],
        select: {
            id: true,
            name: true,
            studentClassrooms: {
                where: { isActive: true },
                select: { student: { select: { id: true, firstName: true, lastName: true } } },
            },
            subjects: {
                select: {
                    subjectId: true,
                    subject: { select: { name: true, evaluacion: true } },
                    teacher: { select: { firstName: true, lastName: true } },
                },
            },
        },
    });

    const finales = new Set<string>(
        (
            await prisma.apreciacion.findMany({
                where: { academicYearId, momento: 'FINAL' },
                select: { studentId: true, subjectId: true },
            })
        ).map((a: any) => `${a.studentId}|${a.subjectId}`)
    );

    const faltantes: Faltante[] = [];
    for (const s of secciones) {
        const alumnos = s.studentClassrooms.map((sc: any) => sc.student);
        if (alumnos.length === 0) continue;
        const numericas = s.subjects.filter((m: any) => m.subject.evaluacion !== 'CUALITATIVA').map((m: any) => m.subjectId);
        const promedios = ultimo && numericas.length > 0
            ? await bulkSubjectAveragesConDatos(prisma, {
                  classroomId: s.id,
                  studentIds: alumnos.map((a: any) => a.id),
                  subjectIds: numericas,
                  periodId: ultimo.id,
              })
            : new Map();
        for (const m of s.subjects) {
            const cualitativa = m.subject.evaluacion === 'CUALITATIVA';
            const sin = alumnos.filter((a: any) =>
                cualitativa ? !finales.has(`${a.id}|${m.subjectId}`) : !promedios.get(a.id)?.get(m.subjectId)?.conNotas
            );
            if (sin.length === 0) continue;
            faltantes.push({
                seccion: { id: s.id, nombre: s.name },
                materia: { id: m.subjectId, nombre: m.subject.name, cualitativa },
                profesor: m.teacher ? `${m.teacher.firstName} ${m.teacher.lastName}` : null,
                sinNota: sin.length,
                total: alumnos.length,
                alumnos: sin.slice(0, 10).map((a: any) => `${a.lastName}, ${a.firstName}`),
            });
        }
    }
    return { lapso: ultimo ? { id: ultimo.id, nombre: ultimo.name } : null, faltantes };
}

// ─── Estado de los pasos ────────────────────────────────────────────────────

export async function estadoDelFinDeAno(prisma: any, instituteId: string, academicYearId: string) {
    const ciclo = await elCiclo(prisma, academicYearId);
    const cerrado = ciclo.status === 'COMPLETED';
    const [config, siguiente] = await Promise.all([getAcademicConfig(instituteId), anoSiguiente(prisma, academicYearId)]);
    const seccionesDelSiguiente = siguiente
        ? await prisma.classroom.count({ where: { academicYearId: siguiente.id } })
        : 0;

    if (cerrado) {
        const expedientes = await prisma.academicRecord.findMany({
            where: { academicYearId },
            select: { finalResult: true, status: true, motivo: true, egreso: true },
        });
        return {
            ciclo: { id: ciclo.id, nombre: ciclo.name, estado: ciclo.status },
            cerrado,
            resultado: {
                alumnos: expedientes.length,
                promovidos: expedientes.filter((e: any) => e.finalResult === 'PROMOVIDO' && e.status !== 'RETIRADO').length,
                conPendientes: expedientes.filter((e: any) => e.finalResult === 'PROMOVIDO_CON_PENDIENTES').length,
                noPromovidos: expedientes.filter((e: any) => e.finalResult === 'NO_PROMOVIDO' && e.status !== 'RETIRADO').length,
                egresados: expedientes.filter((e: any) => e.egreso === 'EGRESADO').length,
            },
            revision: null,
            decisiones: { cambiadas: expedientes.filter((e: any) => !!e.motivo).length },
            anoSiguiente: siguiente ? { id: siguiente.id, nombre: siguiente.name, secciones: seccionesDelSiguiente } : null,
            config: reglasDe(config),
        };
    }

    const preparado = await prepareClose(prisma, academicYearId, instituteId);
    const sugerencias = preparado.suggestions;
    const reprobadasEnElAno = sugerencias.flatMap((s) =>
        s.subjectGrades.filter((g) => g.conNotas && (g.definitivaDeLapsos ?? g.average) < config.notaMinimaAprobatoria)
    );
    return {
        ciclo: { id: ciclo.id, nombre: ciclo.name, estado: ciclo.status },
        cerrado,
        resultado: {
            alumnos: sugerencias.length,
            promovidos: sugerencias.filter((s) => s.condicionFinal === 'PROMOVIDO').length,
            conPendientes: sugerencias.filter((s) => s.condicionFinal === 'PROMOVIDO_CON_PENDIENTES').length,
            noPromovidos: sugerencias.filter((s) => s.condicionFinal === 'NO_PROMOVIDO').length,
            egresados: sugerencias.filter((s) => s.isLastGrade && s.condicionFinal === 'PROMOVIDO').length,
        },
        revision: { reprobadas: reprobadasEnElAno.length, conRevision: reprobadasEnElAno.filter((g) => g.revision != null).length },
        decisiones: { cambiadas: sugerencias.filter((s) => s.decision).length },
        anoSiguiente: siguiente ? { id: siguiente.id, nombre: siguiente.name, secciones: seccionesDelSiguiente } : null,
        config: reglasDe(config),
    };
}

function reglasDe(config: Awaited<ReturnType<typeof getAcademicConfig>>) {
    return {
        notaMinimaAprobatoria: config.notaMinimaAprobatoria,
        maxMateriasPendientesParaPromover: config.maxMateriasPendientesParaPromover,
        revision: config.revision,
        ultimoAnoConPendientes: config.ultimoAnoConPendientes,
        pendienteNoAprobada: config.pendienteNoAprobada,
        pendientes: config.pendientes,
        maxGradeLevel: config.maxGradeLevel,
    };
}

// ─── 3. Revisión: la lista del admin ───────────────────────────────────────

/** Cada materia reprobada en el año, con su revisión si ya la tiene. */
export async function reprobadasParaRevision(prisma: any, instituteId: string, academicYearId: string) {
    const ciclo = await elCiclo(prisma, academicYearId);
    const config = await getAcademicConfig(instituteId);
    const { suggestions } = await prepareClose(prisma, academicYearId, instituteId);
    const profesores = new Map<string, string>();
    for (const cs of await prisma.classroomSubject.findMany({
        where: { classroom: { academicYearId } },
        select: { classroomId: true, subjectId: true, teacher: { select: { firstName: true, lastName: true } } },
    })) {
        if (cs.teacher) profesores.set(`${cs.classroomId}|${cs.subjectId}`, `${cs.teacher.firstName} ${cs.teacher.lastName}`);
    }
    const seccionDe = new Map<string, { id: string; nombre: string }>();
    for (const sc of await prisma.studentClassroom.findMany({
        where: { academicYearId, isActive: true },
        select: { studentId: true, classroom: { select: { id: true, name: true } } },
    })) {
        seccionDe.set(sc.studentId, { id: sc.classroom.id, nombre: sc.classroom.name });
    }
    const filas = suggestions.flatMap((s) => {
        const reprobadas = s.subjectGrades.filter((g) => g.conNotas && (g.definitivaDeLapsos ?? g.average) < config.notaMinimaAprobatoria);
        const seccion = seccionDe.get(s.studentId) ?? null;
        return reprobadas.map((g) => ({
            alumno: { id: s.studentId, nombre: s.name },
            seccion,
            materia: { id: g.subjectId, nombre: g.subjectName },
            profesor: seccion ? (profesores.get(`${seccion.id}|${g.subjectId}`) ?? null) : null,
            definitiva: g.definitivaDeLapsos ?? g.average,
            revision: g.revision ?? null,
            reprobadasDelAlumno: reprobadas.length,
            fueraDeRevision: config.revision.maxMaterias !== null && reprobadas.length > config.revision.maxMaterias,
        }));
    });
    return { ciclo: { id: ciclo.id, nombre: ciclo.name, cerrado: ciclo.status === 'COMPLETED' }, reglas: config.revision, minima: config.notaMinimaAprobatoria, filas };
}

// ─── 4. Decisiones del admin, con motivo ───────────────────────────────────

export async function decidir(
    prisma: any,
    instituteId: string,
    academicYearId: string,
    studentId: string,
    datos: { condicion: unknown; motivo: unknown; quien: string }
) {
    const ciclo = await elCiclo(prisma, academicYearId);
    if (ciclo.status === 'COMPLETED') {
        throw createError(409, 'El año ya se cerró: usa «Corregir» en el alumno', 'CICLO_CERRADO');
    }
    if (!esCondicion(datos.condicion)) throw createError(400, 'La condición no es válida', 'CONDICION_INVALIDA');
    const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim() : '';

    const { suggestions } = await prepareClose(prisma, academicYearId, instituteId);
    const suya = suggestions.find((s) => s.studentId === studentId);
    if (!suya) throw createError(404, 'El alumno no está inscrito en este año escolar', 'NOT_FOUND');

    // Volver a la sugerencia es quitar la decisión (con copia, como todo borrado).
    if (datos.condicion === suya.suggestedStatus) {
        await borrarGuardandoCopia(prisma, 'decisionDeFinDeAno', { academicYearId, studentId }, {
            usuarioId: datos.quien,
            motivo: 'vuelve a la condición sugerida',
        });
        return { condicion: suya.suggestedStatus, sugerida: true };
    }
    if (motivo.length < 5) {
        throw createError(400, 'Escribe por qué decides distinto de lo que sugiere el sistema (queda anotado).', 'FALTA_EL_MOTIVO');
    }
    await prisma.decisionDeFinDeAno.upsert({
        where: { academicYearId_studentId: { academicYearId, studentId } },
        update: { condicion: datos.condicion, motivo: motivo.slice(0, 500), decididaPor: datos.quien },
        create: { academicYearId, studentId, condicion: datos.condicion, motivo: motivo.slice(0, 500), decididaPor: datos.quien },
    });
    return { condicion: datos.condicion, sugerida: false };
}

// ─── 5. El año siguiente, como el MPPE y con la estructura de este ─────────

export interface OpcionesDelAnoSiguiente {
    nombre?: string;
    inicio?: string;
    fin?: string;
    lapsos?: Array<{ nombre: string; inicio: string; fin: string; inicioDelPlan?: string | null; nombreAntesDelPlan?: string | null }>;
    copiar?: { secciones?: boolean; profesores?: boolean; horarios?: boolean };
}

const esFecha = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

export async function crearAnoSiguiente(prisma: any, academicYearId: string, opciones: OpcionesDelAnoSiguiente = {}) {
    const ciclo = await elCiclo(prisma, academicYearId);
    if (await anoSiguiente(prisma, academicYearId)) {
        throw createError(409, 'El año escolar siguiente ya existe', 'YA_EXISTE_EL_SIGUIENTE');
    }

    // Las fechas: las que manden, o el calendario del MPPE del año que sigue.
    const inicioActual = ciclo.startDate as Date;
    const anioDeInicio = inicioActual.getUTCMonth() >= 6 ? inicioActual.getUTCFullYear() + 1 : inicioActual.getUTCFullYear();
    const plantilla = calendarioComoElMPPE(anioDeInicio);
    const nombre = (opciones.nombre ?? plantilla.nombre).trim();
    const inicio = opciones.inicio ?? plantilla.inicio;
    const fin = opciones.fin ?? plantilla.fin;
    const lapsos = opciones.lapsos ?? plantilla.lapsos.map((l) => ({
        nombre: l.nombre,
        inicio: l.inicio,
        fin: l.fin,
        inicioDelPlan: l.inicioDelPlan,
        nombreAntesDelPlan: l.nombreAntesDelPlan,
    }));

    if (!nombre || nombre.length > 40) throw createError(400, 'El nombre del año va de 1 a 40 letras', 'NOMBRE_INVALIDO');
    if (!esFecha(inicio) || !esFecha(fin) || inicio >= fin) throw createError(400, 'Las fechas del año no son válidas', 'FECHAS_INVALIDAS');
    if (dia(inicio) <= (ciclo.startDate as Date)) {
        throw createError(400, 'El año siguiente tiene que empezar después que este', 'FECHAS_INVALIDAS');
    }
    if (!Array.isArray(lapsos) || lapsos.length < 1 || lapsos.length > 6) throw createError(400, 'Hacen falta de 1 a 6 lapsos', 'LAPSOS_INVALIDOS');
    for (const [i, l] of lapsos.entries()) {
        if (!l?.nombre?.trim() || !esFecha(l.inicio) || !esFecha(l.fin) || l.inicio > l.fin || l.inicio < inicio || l.fin > fin) {
            throw createError(400, `El lapso ${i + 1} no cabe en el año o sus fechas no son válidas`, 'LAPSOS_INVALIDOS');
        }
        if (i > 0 && l.inicio <= lapsos[i - 1].fin) throw createError(400, 'Los lapsos se pisan', 'LAPSOS_INVALIDOS');
        if (l.inicioDelPlan && (!esFecha(l.inicioDelPlan) || l.inicioDelPlan < l.inicio || l.inicioDelPlan > l.fin)) {
            throw createError(400, `El plan del lapso ${i + 1} tiene que empezar dentro del lapso`, 'LAPSOS_INVALIDOS');
        }
    }
    if (await prisma.academicYear.findFirst({ where: { name: nombre }, select: { id: true } })) {
        throw createError(409, `Ya hay un año escolar llamado ${nombre}`, 'NOMBRE_EN_USO');
    }

    const copiar = { secciones: opciones.copiar?.secciones !== false, profesores: !!opciones.copiar?.profesores, horarios: !!opciones.copiar?.horarios };
    const secciones = copiar.secciones
        ? await prisma.classroom.findMany({
              where: { academicYearId, isActive: true },
              include: { subjects: { include: { scheduleBlocks: { where: { blockType: 'CLASS' } } } } },
          })
        : [];

    return prisma.$transaction(async (tx: any) => {
        const nuevo = await tx.academicYear.create({
            data: { name: nombre, startDate: dia(inicio), endDate: dia(fin), status: 'UPCOMING', isActive: false },
        });
        for (const [i, l] of lapsos.entries()) {
            await tx.period.create({
                data: {
                    academicYearId: nuevo.id,
                    name: l.nombre.trim(),
                    startDate: dia(l.inicio),
                    endDate: dia(l.fin),
                    isActive: i === 0,
                    inicioDelPlan: l.inicioDelPlan ? dia(l.inicioDelPlan) : null,
                    nombreAntesDelPlan: l.inicioDelPlan ? (l.nombreAntesDelPlan?.trim() || null) : null,
                },
            });
        }

        let materias = 0;
        let bloques = 0;
        for (const s of secciones) {
            const nombreDeSeccion = s.name || nombreDeLaSeccion(s.grade, s.section, s.shift);
            const copia = await tx.classroom.create({
                data: {
                    name: nombreDeSeccion,
                    slug: slugDeLaSeccion(nombreDeSeccion, nombre),
                    description: s.description,
                    section: s.section,
                    grade: s.grade,
                    shift: s.shift,
                    capacity: s.capacity,
                    academicYearId: nuevo.id,
                    teacherId: copiar.profesores ? s.teacherId : null,
                },
            });
            for (const m of s.subjects) {
                const cs = await tx.classroomSubject.create({
                    data: {
                        classroomId: copia.id,
                        subjectId: m.subjectId,
                        weeklyBlocks: m.weeklyBlocks,
                        hoursPerWeek: m.hoursPerWeek,
                        teacherId: copiar.profesores ? m.teacherId : null,
                    },
                });
                materias++;
                if (copiar.horarios && m.scheduleBlocks.length > 0) {
                    const hecho = await tx.scheduleBlock.createMany({
                        data: m.scheduleBlocks.map((b: any) => ({
                            classroomId: copia.id,
                            classroomSubjectId: cs.id,
                            dayOfWeek: b.dayOfWeek,
                            startTime: b.startTime,
                            endTime: b.endTime,
                            blockType: 'CLASS',
                            location: b.location,
                            notes: b.notes,
                        })),
                    });
                    bloques += hecho.count;
                }
            }
        }
        return { id: nuevo.id, nombre: nuevo.name, inicio, fin, lapsos: lapsos.length, secciones: secciones.length, materias, bloques };
    }, { timeout: 60000, maxWait: 15000 });
}

// ─── Corregir después de cerrar ────────────────────────────────────────────

/**
 * La decisión equivocada de un alumno, arreglada después de cerrar el año:
 * se rehacen su expediente (con motivo, quién y cuándo), su matrícula en el
 * año siguiente y sus materias pendientes. Las pendientes que ya tienen algún
 * momento evaluado no se tocan.
 */
export async function corregirDecision(
    prisma: any,
    instituteId: string,
    academicYearId: string,
    studentId: string,
    datos: { condicion: unknown; motivo: unknown; destinoClassroomId?: string | null; quien: string }
) {
    const ciclo = await elCiclo(prisma, academicYearId);
    if (ciclo.status !== 'COMPLETED') {
        throw createError(409, 'El año todavía no se ha cerrado: decide en el paso 4', 'CICLO_ABIERTO');
    }
    if (!esCondicion(datos.condicion)) throw createError(400, 'La condición no es válida', 'CONDICION_INVALIDA');
    const condicion = datos.condicion as SuggestionStatus;
    const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim() : '';
    if (motivo.length < 5) throw createError(400, 'Escribe por qué se corrige (queda anotado).', 'FALTA_EL_MOTIVO');

    const expediente = await prisma.academicRecord.findUnique({
        where: { studentId_academicYearId: { studentId, academicYearId } },
    });
    if (!expediente) throw createError(404, 'Ese alumno no tiene expediente en este año', 'NOT_FOUND');
    if (expediente.status === 'RETIRADO') throw createError(409, 'El alumno se retiró', 'RETIRADO');

    const config = await getAcademicConfig(instituteId);
    const inscripcion = await prisma.studentClassroom.findUnique({
        where: { studentId_academicYearId: { studentId, academicYearId } },
        select: { classroom: { select: { grade: true, section: true, shift: true } } },
    });
    if (!inscripcion) throw createError(404, 'Ese alumno no estaba inscrito en este año', 'NOT_FOUND');
    const grado = inscripcion.classroom.grade;
    const ultimoAno = config.maxGradeLevel ?? 5;
    const esUltimo = grado >= ultimoAno;
    const destinoGrado = gradoDeDestino(grado, esUltimo, condicion);
    const siguiente = await anoSiguiente(prisma, academicYearId);

    // La sección de destino: la que diga el admin, o la de la misma letra y turno.
    let destino: { id: string } | null = null;
    if (destinoGrado !== null) {
        if (!siguiente) throw createError(409, 'No existe el año escolar siguiente', 'SIN_ANO_SIGUIENTE');
        if (datos.destinoClassroomId) {
            destino = await prisma.classroom.findFirst({
                where: { id: datos.destinoClassroomId, academicYearId: siguiente.id, grade: destinoGrado },
                select: { id: true },
            });
            if (!destino) throw createError(400, `Esa sección no es de ${destinoGrado}º año del año siguiente`, 'DESTINO_INVALIDO');
        } else {
            destino =
                (await prisma.classroom.findFirst({
                    where: { academicYearId: siguiente.id, grade: destinoGrado, section: inscripcion.classroom.section, shift: inscripcion.classroom.shift },
                    select: { id: true },
                })) ??
                (await prisma.classroom.findFirst({
                    where: { academicYearId: siguiente.id, grade: destinoGrado },
                    orderBy: { section: 'asc' },
                    select: { id: true },
                }));
            if (!destino) throw createError(409, `No hay secciones de ${destinoGrado}º año en el año siguiente`, 'SIN_SECCION_DE_DESTINO');
        }
    }

    const reprobadas: Array<{ subjectId: string; average: number }> = ((expediente.subjectGrades as any[]) ?? [])
        .filter((g) => !g.cualitativa && typeof g.average === 'number' && g.average < config.notaMinimaAprobatoria)
        .map((g) => ({ subjectId: g.subjectId, average: g.average }));
    const egreso = esUltimo && condicion !== 'NO_PROMOVIDO'
        ? condicion === 'PROMOVIDO_CON_PENDIENTES' && config.ultimoAnoConPendientes !== 'EGRESA' ? 'PENDIENTE' : 'EGRESADO'
        : null;

    await prisma.$transaction(async (tx: any) => {
        await tx.academicRecord.update({
            where: { id: expediente.id },
            data: {
                finalResult: condicion,
                motivo,
                decididaPor: datos.quien,
                corregidoEl: new Date(),
                egreso,
                assignedClassroomId: destino?.id ?? null,
            },
        });

        // La matrícula del año siguiente.
        if (siguiente) {
            const matricula = await tx.studentClassroom.findUnique({
                where: { studentId_academicYearId: { studentId, academicYearId: siguiente.id } },
            });
            if (destino) {
                if (matricula) {
                    await tx.studentClassroom.update({ where: { id: matricula.id }, data: { classroomId: destino.id, isActive: true } });
                } else {
                    await tx.studentClassroom.create({ data: { studentId, classroomId: destino.id, academicYearId: siguiente.id, isActive: true } });
                }
            } else if (matricula) {
                await borrarGuardandoCopia(tx, 'studentClassroom', { id: matricula.id }, {
                    usuarioId: datos.quien,
                    motivo: `corrección del cierre ${academicYearId}: ya no va a ninguna sección`,
                });
            }

            // Sus pendientes nacidas de este año: se rehacen (las evaluadas se quedan).
            const suyas = await tx.materiaPendiente.findMany({
                where: { studentId, cicloDeOrigenId: academicYearId, cicloId: siguiente.id },
                include: { _count: { select: { evaluaciones: true } } },
            });
            const quedan = new Set<string>();
            for (const p of suyas) {
                if (p._count.evaluaciones > 0 || (condicion === 'PROMOVIDO_CON_PENDIENTES' && reprobadas.some((r) => r.subjectId === p.subjectId))) {
                    quedan.add(p.subjectId);
                    continue;
                }
                await borrarGuardandoCopia(tx, 'materiaPendiente', { id: p.id }, {
                    usuarioId: datos.quien,
                    motivo: `corrección del cierre ${academicYearId}`,
                });
            }
            if (condicion === 'PROMOVIDO_CON_PENDIENTES') {
                for (const r of reprobadas) {
                    if (quedan.has(r.subjectId)) continue;
                    await tx.materiaPendiente.create({
                        data: {
                            studentId,
                            subjectId: r.subjectId,
                            gradoDeOrigen: grado,
                            cicloDeOrigenId: academicYearId,
                            notaDeOrigen: r.average,
                            cicloId: siguiente.id,
                            profesorId: await profesorParaLaPendiente(tx, siguiente.id, grado, r.subjectId, inscripcion.classroom.section),
                        },
                    });
                }
            }
        }

        await tx.auditLog.create({
            data: {
                instituteId,
                action: 'UPDATE',
                entity: 'ACADEMIC_RECORD',
                entityType: 'ACADEMIC_RECORD',
                entityId: expediente.id,
                oldValues: { finalResult: expediente.finalResult, assignedClassroomId: expediente.assignedClassroomId, egreso: expediente.egreso },
                newValues: { finalResult: condicion, assignedClassroomId: destino?.id ?? null, egreso },
                metadata: { motivo, correccionDelCierre: academicYearId },
                userId: datos.quien,
            },
        });
    });

    return { condicion, destinoClassroomId: destino?.id ?? null, egreso };
}

/**
 * Los expedientes de un año ya cerrado, para corregir: condición, la que
 * sugería el sistema, el motivo si se cambió, y adónde fue.
 */
export async function expedientesDelCierre(prisma: any, academicYearId: string) {
    const ciclo = await elCiclo(prisma, academicYearId);
    const siguiente = await anoSiguiente(prisma, academicYearId);
    const [expedientes, inscripciones, secciones] = await Promise.all([
        prisma.academicRecord.findMany({
            where: { academicYearId },
            include: { student: { select: { id: true, firstName: true, lastName: true } } },
        }),
        prisma.studentClassroom.findMany({
            where: { academicYearId },
            select: { studentId: true, classroom: { select: { grade: true, name: true } } },
        }),
        siguiente
            ? prisma.classroom.findMany({
                  where: { academicYearId: siguiente.id },
                  orderBy: [{ grade: 'asc' }, { section: 'asc' }],
                  select: { id: true, name: true, grade: true },
              })
            : [],
    ]);
    const seccionDe = new Map<string, { grade: number; name: string }>(inscripciones.map((i: any) => [i.studentId, i.classroom]));
    const nombreDe = new Map<string, string>(secciones.map((s: any) => [s.id, s.name]));
    return {
        ciclo: { id: ciclo.id, nombre: ciclo.name, cerrado: ciclo.status === 'COMPLETED' },
        anoSiguiente: siguiente ? { id: siguiente.id, nombre: siguiente.name, secciones } : null,
        expedientes: expedientes
            .map((e: any) => ({
                alumno: { id: e.student.id, nombre: `${e.student.lastName}, ${e.student.firstName}` },
                grado: seccionDe.get(e.studentId)?.grade ?? null,
                seccion: seccionDe.get(e.studentId)?.name ?? e.sectionSnapshot,
                condicion: e.finalResult,
                sugerida: e.condicionSugerida,
                motivo: e.motivo,
                corregidoEl: e.corregidoEl,
                egreso: e.egreso,
                retirado: e.status === 'RETIRADO',
                destino: e.assignedClassroomId ? { id: e.assignedClassroomId, nombre: nombreDe.get(e.assignedClassroomId) ?? null } : null,
            }))
            .sort((a: any, b: any) => (a.grado ?? 0) - (b.grado ?? 0) || a.alumno.nombre.localeCompare(b.alumno.nombre, 'es')),
    };
}

/** Para la pantalla: lo que hay que mostrar de cada alumno en el paso 4. */
export function filaDeDecision(s: StudentSuggestion) {
    return {
        alumno: { id: s.studentId, nombre: s.name },
        grado: s.gradeLevel,
        seccion: s.currentSection,
        esUltimoAno: s.isLastGrade,
        promedio: s.finalAverage,
        reprobadas: s.failedSubjects.map((f) => ({ id: f.subjectId, nombre: f.name, nota: f.average, revision: f.revision ?? null })),
        pendientesArrastradas: s.pendientesArrastradas,
        sugerida: s.suggestedStatus,
        motivoDeLaSugerencia: s.motivoDeLaSugerencia,
        decision: s.decision,
        condicion: s.condicionFinal,
    };
}

