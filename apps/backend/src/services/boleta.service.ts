import { PrismaClient } from '@prisma/client';
import { platformPrisma } from '../config/database';
import { gradesService, redondearComoElMPPE } from './grades.service';
import { getAcademicConfig } from './promotion/close-cycle.service';
import { AppErrors } from '../middleware/error.middleware';
import { apreciacionesDelAlumno, MOMENTO_FINAL } from './apreciaciones.service';
import { bulkSubjectAveragesConDatos } from './bulk-averages.service';

/**
 * LA BOLETA DEL ALUMNO
 *
 * Al terminar cada lapso, el liceo entrega la boleta: la nota de cada materia
 * en cada lapso, las inasistencias y, al final del año, la definitiva. Aquí se
 * junta todo con las MISMAS reglas que el resto del sistema:
 *
 *   - la nota de un lapso es `gradesService.promedioDeLaMateria` de ese lapso,
 *     con el redondeo del liceo (`redondeoDeDefinitivas`, MPPE por defecto:
 *     0,50 o más sube al entero);
 *   - la definitiva es la de todo el ciclo, igual que al cerrarlo;
 *   - una materia sin notas sale vacía (null), no en 0: un 0 es una nota y
 *     «sin notas» no (CERO-*);
 *   - si reprobó una materia y la presentó en revisión, la nota de la
 *     revisión es la que cuenta (`revision`; `services/revision.service.ts`);
 *   - una materia que se evalúa con apreciación (Orientación, Grupos de
 *     Creación…) no lleva nota ni entra en los promedios: sale su
 *     apreciación de cada lapso y la final (`apreciaciones`, CUALI-04);
 *   - las materias pendientes de años anteriores que cursa este año, con la
 *     nota de cada momento y su estado (`materias-pendientes.service`);
 *   - las inasistencias salen de la asistencia diaria de las fechas del lapso:
 *     sin justificar (ABSENT), justificadas (EXCUSED) y tardanzas (LATE).
 *
 * La boleta no depende de los pagos: en Venezuela no se puede condicionar la
 * entrega de boletines y constancias al pago de la mensualidad.
 *
 * Pruebas: `tests/integration/funcional-boleta.test.ts` (BOL-01…04).
 */

export interface BoletaDelAlumno {
    liceo: { nombre: string; codigo: string | null; direccion: string | null; ciudad: string | null; telefono: string | null };
    alumno: { cedula: string; nombres: string; apellidos: string; codigo: string | null };
    ciclo: { id: string; nombre: string };
    seccion: { id: string; grado: number; seccion: string; turno: string | null; guia: string | null };
    lapsos: Array<{ id: string; nombre: string; desde: string; hasta: string }>;
    materias: Array<{
        id: string;
        nombre: string;
        notas: Record<string, number | null>;
        definitiva: number | null;
        /** La nota de la revisión, si la reprobó y la presentó: es la que cuenta. */
        revision: number | null;
        aprobada: boolean | null;
        /** Se evalúa con apreciación, no con nota: no entra en los promedios. */
        cualitativa: boolean;
        /** Su apreciación por lapso (id del lapso) y la final (`FINAL`). */
        apreciaciones: Record<string, string | null>;
    }>;
    inasistencias: Record<string, { injustificadas: number; justificadas: number; tardanzas: number }>;
    /** Las materias pendientes de años anteriores que cursa este año. */
    materiasPendientes: Array<{
        materia: string;
        gradoDeOrigen: number;
        cicloDeOrigen: string | null;
        estado: 'PENDIENTE' | 'APROBADA' | 'NO_APROBADA';
        notaFinal: number | null;
        momentos: Array<{ momento: number; nota: number }>;
    }>;
    promedios: Record<string, number | null> & { definitivo: number | null };
    reglas: { notaMinima: number; redondeo: 'MPPE' | 'NINGUNO' };
    emitidaEl: string;
}

const media = (valores: number[]): number | null =>
    valores.length === 0 ? null : Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;

/**
 * LA CUENTA OFICIAL DE LA BOLETA (REVISION-FASE-E, punto 3)
 *
 * Fuente única de verdad para el cálculo del promedio general de la boleta:
 *   1. Para cada materia no cualitativa, cada lapso con notas se redondea
 *      según la regla del liceo (MPPE: 0,50 o más sube al entero).
 *   2. La definitiva de la materia es la media de esos lapsos, redondeada otra vez.
 *   3. Si reprobó y presentó revisión, la nota de revisión es la que cuenta.
 *   4. El promedio definitivo es la media de las definitivas que cuentan, a 2 decimales.
 */
export function calcularPromedioBoletaDesdeLapsos(
    materiasConLapsos: Array<{
        lapsos: number[];
        revision?: number | null;
        cualitativa?: boolean;
    }>,
    redondeo: 'MPPE' | 'NINGUNO' = 'MPPE',
    notaMinima: number = 10
): number | null {
    const definitivas: number[] = [];

    for (const m of materiasConLapsos) {
        if (m.cualitativa) continue;
        if (!m.lapsos || m.lapsos.length === 0) continue;

        const notasDelLapsoValidas = m.lapsos.map((p) =>
            redondeo === 'MPPE' ? redondearComoElMPPE(p) : p
        );

        const definitiva = notasDelLapsoValidas.length > 0
            ? (redondeo === 'MPPE'
                ? redondearComoElMPPE(notasDelLapsoValidas.reduce((a, b) => a + b, 0) / notasDelLapsoValidas.length)
                : Math.round((notasDelLapsoValidas.reduce((a, b) => a + b, 0) / notasDelLapsoValidas.length) * 100) / 100)
            : null;

        if (definitiva === null) continue;

        const revision = definitiva < notaMinima ? (m.revision ?? null) : null;
        const queCuenta = revision ?? definitiva;
        if (queCuenta !== null) {
            definitivas.push(queCuenta);
        }
    }

    return media(definitivas);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function boletaDelAlumno(
    prisma: PrismaClient,
    instituteId: string,
    studentId: string,
    opciones: { academicYearId?: string; hoy: string }
): Promise<BoletaDelAlumno> {
    const alumno = await prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, firstName: true, lastName: true, studentCode: true, role: true },
    });
    if (!alumno || alumno.role !== 'STUDENT') throw AppErrors.NotFound('Estudiante');

    // La inscripción del ciclo pedido; si no se pide, la vigente (la activa del
    // ciclo en curso, o la más reciente).
    const inscripciones = await prisma.studentClassroom.findMany({
        where: { studentId, ...(opciones.academicYearId ? { academicYearId: opciones.academicYearId } : {}) },
        include: {
            academicYear: { select: { id: true, name: true, status: true, startDate: true } },
            classroom: {
                select: {
                    id: true,
                    grade: true,
                    section: true,
                    shift: true,
                    teacher: { select: { firstName: true, lastName: true } },
                    subjects: { select: { subject: { select: { id: true, name: true, evaluacion: true } } } },
                },
            },
        },
    });
    const orden = (i: (typeof inscripciones)[number]) =>
        (i.academicYear.status === 'ACTIVE' ? 2 : 0) + (i.isActive ? 1 : 0);
    const inscripcion = [...inscripciones].sort(
        (a, b) => orden(b) - orden(a) || b.academicYear.startDate.getTime() - a.academicYear.startDate.getTime()
    )[0];
    if (!inscripcion) throw AppErrors.NotFound('Inscripción del estudiante');

    const [config, liceo, lapsos] = await Promise.all([
        getAcademicConfig(instituteId),
        platformPrisma.institute.findUnique({
            where: { id: instituteId },
            select: { name: true, code: true, address: true, city: true, phone: true },
        }),
        prisma.period.findMany({
            where: { academicYearId: inscripcion.academicYearId },
            select: { id: true, name: true, startDate: true, endDate: true },
            orderBy: { startDate: 'asc' },
        }),
    ]);
    const redondeo = config.redondeoDeDefinitivas ?? 'MPPE';

    const materiasDeLaSeccion = inscripcion.classroom.subjects
        .map((s) => s.subject)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const revisiones = new Map<string, number>(
        (
            await (prisma as any).notaDeRevision.findMany({
                where: { studentId, academicYearId: inscripcion.academicYearId },
                select: { subjectId: true, score: true },
            })
        ).map((r: any) => [r.subjectId, r.score])
    );

    const apreciaciones = await apreciacionesDelAlumno(prisma, studentId, inscripcion.academicYearId);
    const aulaSeccionId = inscripcion.classroom?.id;
    const cuantitativas = materiasDeLaSeccion.filter((m) => m.evaluacion !== 'CUALITATIVA');
    const calculadosPorLapso = new Map<string, Map<string, { promedio: number; conNotas: boolean }>>();
    if (aulaSeccionId && cuantitativas.length > 0 && lapsos.length > 0) {
        await Promise.all(
            lapsos.map(async (l) => {
                const res = await bulkSubjectAveragesConDatos(prisma, {
                    classroomId: aulaSeccionId,
                    studentIds: [studentId],
                    subjectIds: cuantitativas.map((m) => m.id),
                    periodId: l.id,
                });
                calculadosPorLapso.set(l.id, res.get(studentId) ?? new Map());
            })
        );
    }

    const materias = await Promise.all(
        materiasDeLaSeccion.map(async (m) => {
            if (m.evaluacion === 'CUALITATIVA') {
                const suyas = apreciaciones.get(m.id) ?? {};
                const porMomento: Record<string, string | null> = {};
                for (const l of lapsos) porMomento[l.id] = suyas[l.id] ?? null;
                porMomento[MOMENTO_FINAL] = suyas[MOMENTO_FINAL] ?? null;
                return {
                    id: m.id,
                    nombre: m.name,
                    notas: Object.fromEntries(lapsos.map((l) => [l.id, null])) as Record<string, number | null>,
                    definitiva: null,
                    revision: null,
                    aprobada: null,
                    cualitativa: true,
                    apreciaciones: porMomento,
                };
            }
            const notas: Record<string, number | null> = {};
            const notasDelLapsoValidas: number[] = [];
            const porLapsoEnBloque = Boolean(aulaSeccionId && calculadosPorLapso.size > 0);
            const definitivaF = (n: number) => (redondeo === 'MPPE' ? redondearComoElMPPE(n) : n);

            if (porLapsoEnBloque) {
                for (const l of lapsos) {
                    const dato = calculadosPorLapso.get(l.id)?.get(m.id);
                    if (dato && dato.conNotas) {
                        const redon = definitivaF(dato.promedio);
                        notas[l.id] = redon;
                        notasDelLapsoValidas.push(redon);
                    } else {
                        notas[l.id] = null;
                    }
                }
            } else {
                // Consultar los lapsos de esta materia en paralelo
                await Promise.all(
                    lapsos.map(async (l) => {
                        const d = await gradesService.promedioDeLaMateria(prisma, studentId, m.id, l.id, undefined, redondeo);
                        if (d.conNotas) {
                            notas[l.id] = d.promedio;
                            notasDelLapsoValidas.push(d.promedio);
                        } else {
                            notas[l.id] = null;
                        }
                    })
                );
            }

            // La definitiva es la media de los lapsos que tienen nota; se calcula en memoria sin volver a consultar la BD
            const definitiva = notasDelLapsoValidas.length > 0
                ? (redondeo === 'MPPE'
                    ? redondearComoElMPPE(notasDelLapsoValidas.reduce((a, b) => a + b, 0) / notasDelLapsoValidas.length)
                    : Math.round((notasDelLapsoValidas.reduce((a, b) => a + b, 0) / notasDelLapsoValidas.length) * 100) / 100)
                : null;
            // La revisión solo cuenta sobre una materia reprobada (como al cerrar).
            const revision =
                definitiva !== null && definitiva < config.notaMinimaAprobatoria ? (revisiones.get(m.id) ?? null) : null;
            const queCuenta = revision ?? definitiva;
            return {
                id: m.id,
                nombre: m.name,
                notas,
                definitiva,
                revision,
                aprobada: queCuenta === null ? null : queCuenta >= config.notaMinimaAprobatoria,
                cualitativa: false,
                apreciaciones: {},
            };
        })
    );

    const asistencia = lapsos.length === 0 ? [] : await prisma.dailyAttendance.findMany({
        where: {
            studentId,
            date: { gte: lapsos[0].startDate, lte: lapsos[lapsos.length - 1].endDate },
            status: { in: ['ABSENT', 'EXCUSED', 'LATE'] },
        },
        select: { date: true, status: true },
    });
    const inasistencias: BoletaDelAlumno['inasistencias'] = {};
    for (const l of lapsos) {
        const desde = ymd(l.startDate);
        const hasta = ymd(l.endDate);
        const delLapso = asistencia.filter((a) => ymd(a.date) >= desde && ymd(a.date) <= hasta);
        inasistencias[l.id] = {
            injustificadas: delLapso.filter((a) => a.status === 'ABSENT').length,
            justificadas: delLapso.filter((a) => a.status === 'EXCUSED').length,
            tardanzas: delLapso.filter((a) => a.status === 'LATE').length,
        };
    }

    const promedios = { definitivo: media(materias.map((m) => m.revision ?? m.definitiva).filter((n): n is number => n !== null)) } as BoletaDelAlumno['promedios'];
    for (const l of lapsos) {
        promedios[l.id] = media(materias.map((m) => m.notas[l.id]).filter((n): n is number => n !== null));
    }

    const pendientes = await (prisma as any).materiaPendiente.findMany({
        where: { studentId, cicloId: inscripcion.academicYearId },
        select: {
            gradoDeOrigen: true,
            estado: true,
            notaFinal: true,
            subject: { select: { name: true } },
            cicloDeOrigen: { select: { name: true } },
            evaluaciones: { select: { momento: true, nota: true }, orderBy: { momento: 'asc' } },
        },
        orderBy: { gradoDeOrigen: 'asc' },
    });

    const c = inscripcion.classroom;
    return {
        liceo: {
            nombre: liceo?.name ?? '',
            codigo: liceo?.code ?? null,
            direccion: liceo?.address ?? null,
            ciudad: liceo?.city ?? null,
            telefono: liceo?.phone ?? null,
        },
        alumno: { cedula: alumno.id, nombres: alumno.firstName, apellidos: alumno.lastName, codigo: alumno.studentCode ?? null },
        ciclo: { id: inscripcion.academicYear.id, nombre: inscripcion.academicYear.name },
        seccion: {
            id: c.id,
            grado: c.grade,
            seccion: c.section,
            turno: (c as any).shift ?? null,
            guia: c.teacher ? `${c.teacher.firstName} ${c.teacher.lastName}` : null,
        },
        lapsos: lapsos.map((l) => ({ id: l.id, nombre: l.name, desde: ymd(l.startDate), hasta: ymd(l.endDate) })),
        materias,
        inasistencias,
        materiasPendientes: pendientes.map((p: any) => ({
            materia: p.subject.name,
            gradoDeOrigen: p.gradoDeOrigen,
            cicloDeOrigen: p.cicloDeOrigen?.name ?? null,
            estado: p.estado,
            notaFinal: p.notaFinal,
            momentos: p.evaluaciones,
        })),
        promedios,
        reglas: { notaMinima: config.notaMinimaAprobatoria, redondeo },
        emitidaEl: opciones.hoy,
    };
}

/**
 * ¿Quién ve la boleta? El admin, el propio alumno, su representante y el
 * profesor GUÍA de su sección: la boleta son los promedios de todas las
 * materias, y el profesor ve promedios solo de sus secciones guía (CLAUDE.md,
 * «Permisos»). Un profesor que solo le da una materia no la ve entera.
 */
export async function puedeVerLaBoleta(
    prisma: PrismaClient,
    user: { id?: string; userId?: string; role?: string } | null | undefined,
    studentId: string
): Promise<boolean> {
    const actor = user?.userId ?? user?.id;
    if (!actor || !user?.role) return false;
    if (user.role === 'ADMIN') return true;
    if (user.role === 'STUDENT') return actor === studentId;
    if (user.role === 'TUTOR') {
        return (await prisma.studentTutor.count({ where: { tutorId: actor, studentId } })) > 0;
    }
    if (user.role === 'TEACHER') {
        const n = await prisma.studentClassroom.count({
            where: { studentId, classroom: { teacherId: actor } },
        });
        return n > 0;
    }
    return false;
}
