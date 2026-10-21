import { getAcademicConfig, AcademicConfig } from './configuracion-academica';
import { gradesService, redondearComoElMPPE } from '../grades.service';
import { bulkSubjectAveragesConDatos, BulkAverageDetail } from '../bulk-averages.service';
import { Assignment } from './strategies';
import { apreciacionesFinalesDelCiclo } from '../apreciaciones.service';
import {
    avanceDe,
    AvanceDeLaborSocial,
} from './reglas-del-fin-de-ano';

export type SuggestionStatus = 'PROMOVIDO' | 'PROMOVIDO_CON_PENDIENTES' | 'NO_PROMOVIDO';
export const CONDICIONES: SuggestionStatus[] = ['PROMOVIDO', 'PROMOVIDO_CON_PENDIENTES', 'NO_PROMOVIDO'];
export function esCondicion(valor: unknown): valor is SuggestionStatus {
    return typeof valor === 'string' && (CONDICIONES as string[]).includes(valor);
}

/**
 * Lo que le toca al alumno según cuántas materias reprobó y las reglas del
 * liceo. La usan el cierre y el resumen final, para que digan lo mismo.
 *
 *   - sin reprobadas: promovido;
 *   - más que el tope: no promovido (repite);
 *   - en el último año, según `ultimoAnoConPendientes`: REPITE (lo del MPPE)
 *     o con pendientes (SOLO_PENDIENTES o EGRESA, que el cierre trata distinto).
 */
export function condicionSugerida(pendientes: number, esUltimoAno: boolean, config: AcademicConfig): SuggestionStatus {
    if (pendientes === 0) return 'PROMOVIDO';
    if (pendientes > config.maxMateriasPendientesParaPromover) return 'NO_PROMOVIDO';
    if (esUltimoAno && config.ultimoAnoConPendientes === 'REPITE') return 'NO_PROMOVIDO';
    return 'PROMOVIDO_CON_PENDIENTES';
}

/** El grado al que va el alumno según su condición; null = no va a ninguna sección. */
export function gradoDeDestino(
    grado: number,
    esUltimoAno: boolean,
    condicion: SuggestionStatus
): number | null {
    if (condicion === 'NO_PROMOVIDO') return grado; // repite, también en el último año
    if (esUltimoAno) return null; // egresa, o solo cursa sus pendientes
    return grado + 1;
}

export interface StudentSuggestion {
    studentId: string;
    name: string;
    gender: string | null;
    currentSection: string | null;
    currentShift?: string | null;
    gradeLevel: number;
    isLastGrade: boolean;
    defaultTargetGrade: number | null;
    defaultTargetSection: string | null;
    defaultTargetShift?: string | null;
    /** `conNotas`: si tiene alguna nota en la materia. Un 0 es una nota; «sin notas», no. */
    /**
     * `average` es la definitiva que cuenta para la promoción: la de los
     * lapsos o, si la reprobó y presentó revisión, la nota de la revisión
     * (`revision`, y `definitivaDeLapsos` guarda la de antes).
     */
    subjectGrades: Array<{
        subjectId: string;
        subjectName: string;
        average: number;
        approved: boolean;
        conNotas?: boolean;
        revision?: number | null;
        definitivaDeLapsos?: number;
        /** Se evalúa con apreciación: no cuenta para promediar ni para promover. */
        cualitativa?: boolean;
        apreciacion?: string | null;
    }>;
    failedSubjects: Array<{ subjectId?: string; name: string; average: number; revision?: number | null }>;
    /** Las materias pendientes de años anteriores que cursaba este año. */
    pendientesArrastradas: Array<{ id: string; subjectId: string; subjectName: string; gradoDeOrigen: number; estado: string }>;
    pendingCount: number;
    finalAverage: number;
    suggestedStatus: SuggestionStatus;
    /** Por qué sugiere eso, en palabras. */
    motivoDeLaSugerencia: string;
    /** Su labor social, si es de un grado que la hace (`labor-social.service`). */
    laborSocial: AvanceDeLaborSocial | null;
    /** Lo que decidió el admin antes de cerrar, si es distinto (con su motivo). */
    decision: { condicion: SuggestionStatus; motivo: string; decididaPor: string | null } | null;
    /** La que vale: la del admin o, si no decidió nada, la sugerida. */
    condicionFinal: SuggestionStatus;
}

export interface PrepareCloseResult {
    academicYearId: string;
    config: AcademicConfig;
    suggestions: StudentSuggestion[];
}

function explicar(
    s: { reprobadas: number; sinAprobar: number; esUltimoAno: boolean; condicion: SuggestionStatus },
    config: AcademicConfig
): string {
    const materias = (n: number) => (n === 1 ? '1 materia' : `${n} materias`);
    if (s.sinAprobar > 0 && config.pendienteNoAprobada === 'REPITE') {
        return `No aprobó ${materias(s.sinAprobar)} pendiente${s.sinAprobar === 1 ? '' : 's'} del año anterior.`;
    }
    if (s.reprobadas === 0) return s.esUltimoAno ? 'Aprobó todo: egresa.' : 'Aprobó todas las materias.';
    if (s.condicion === 'NO_PROMOVIDO') {
        return s.reprobadas > config.maxMateriasPendientesParaPromover
            ? `${materias(s.reprobadas)} sin aprobar (el tope del liceo es ${config.maxMateriasPendientesParaPromover}).`
            : `Último año con ${materias(s.reprobadas)} sin aprobar: repite.`;
    }
    if (s.esUltimoAno) {
        return config.ultimoAnoConPendientes === 'EGRESA'
            ? `Egresa y presenta aparte ${materias(s.reprobadas)} pendiente${s.reprobadas === 1 ? '' : 's'}.`
            : `No egresa todavía: cursa solo ${materias(s.reprobadas)} pendiente${s.reprobadas === 1 ? '' : 's'}.`;
    }
    return `Pasa con ${materias(s.reprobadas)} pendiente${s.reprobadas === 1 ? '' : 's'}.`;
}

/** Lo que se añade a la sugerencia si al que egresa le falta la labor social. */
function avisoDeLabor(labor: AvanceDeLaborSocial | null, egresaria: boolean, config: AcademicConfig): string {
    if (!labor || labor.cumplida || !egresaria || config.laborSocial.paraEgresar === 'NO') return '';
    const falta = labor.porProyecto ? 'no ha culminado su proyecto de labor social' : `lleva ${labor.horas} de ${labor.requeridas} h de labor social`;
    return config.laborSocial.paraEgresar === 'BLOQUEA'
        ? ` Pero ${falta}: no egresa hasta cumplirla.`
        : ` Ojo: ${falta}.`;
}

/**
 * El egreso del alumno de último año que no repite: EGRESADO, o PENDIENTE si
 * solo cursa sus pendientes o si el liceo exige la labor social para egresar
 * y no la ha cumplido.
 */
export function egresoDe(
    condicion: SuggestionStatus,
    config: AcademicConfig,
    labor: AvanceDeLaborSocial | null,
    egresoForzado = false
): 'EGRESADO' | 'PENDIENTE' {
    if (egresoForzado) return 'EGRESADO';
    if (condicion === 'PROMOVIDO_CON_PENDIENTES' && config.ultimoAnoConPendientes !== 'EGRESA') return 'PENDIENTE';
    if (labor && !labor.cumplida && config.laborSocial.paraEgresar === 'BLOQUEA') return 'PENDIENTE';
    return 'EGRESADO';
}

/** 1. Calcula los resultados sugeridos evaluando notas reales y reglas de grado */
/** `${classroomId}|${periodId}` → alumno → materia → promedio del lapso y si tiene notas. */
type PromediosPorSeccionYLapso = Map<string, BulkAverageDetail>;

async function promediosPorSeccionYLapso(
    prisma: any,
    enrollments: Array<{ studentId: string; classroom: { id: string; subjects: Array<{ subjectId: string; subject: { evaluacion?: string | null } }> } }>,
    lapsos: string[]
): Promise<PromediosPorSeccionYLapso> {
    const secciones = new Map<string, { alumnos: string[]; materias: string[] }>();
    for (const e of enrollments) {
        const s = secciones.get(e.classroom.id) ?? {
            alumnos: [],
            // Las de apreciación no se promedian: el cierre las trata aparte.
            materias: [...new Set(e.classroom.subjects.filter((cs) => cs.subject.evaluacion !== 'CUALITATIVA').map((cs) => cs.subjectId))],
        };
        s.alumnos.push(e.studentId);
        secciones.set(e.classroom.id, s);
    }
    const trabajos = [...secciones].flatMap(([aula, s]) => lapsos.map((periodId) => ({ aula, periodId, s })));
    const salida: PromediosPorSeccionYLapso = new Map();
    // De cuatro en cuatro: cada una son unas pocas consultas grandes.
    for (let i = 0; i < trabajos.length; i += 4) {
        await Promise.all(
            trabajos.slice(i, i + 4).map(async ({ aula, periodId, s }) => {
                salida.set(
                    `${aula}|${periodId}`,
                    s.materias.length
                        ? await bulkSubjectAveragesConDatos(prisma, { classroomId: aula, studentIds: s.alumnos, subjectIds: s.materias, periodId })
                        : new Map()
                );
            })
        );
    }
    return salida;
}

/**
 * La definitiva de una materia con los promedios en bloque: la MISMA cuenta
 * que `gradesService.promedioDeLaMateria` con lapsos (cada lapso con notas,
 * redondeado si el liceo usa el del MPPE; su media a dos decimales y otra vez
 * el redondeo). Un lapso sin notas no pesa; uno con un 0, sí.
 */
function definitivaDeLaMateria(
    enBloque: PromediosPorSeccionYLapso,
    aula: string,
    studentId: string,
    subjectId: string,
    lapsos: string[],
    redondeo?: 'MPPE' | 'NINGUNO'
): { promedio: number; conNotas: boolean } {
    const definitiva = (n: number) => (redondeo === 'MPPE' ? redondearComoElMPPE(n) : n);
    const sums = lapsos
        .map((p) => enBloque.get(`${aula}|${p}`)?.get(studentId)?.get(subjectId))
        .filter((d): d is { promedio: number; conNotas: boolean } => Boolean(d?.conNotas))
        .map((d) => definitiva(d.promedio));
    if (sums.length === 0) return { promedio: 0, conNotas: false };
    const global = sums.reduce((a, b) => a + b, 0) / sums.length;
    return { promedio: definitiva(Math.round(global * 100) / 100), conNotas: true };
}

export async function prepareClose(prisma: any, academicYearId: string, instituteId: string): Promise<PrepareCloseResult> {
    const config = await getAcademicConfig(instituteId);

    const enrollments = await prisma.studentClassroom.findMany({
        where: { academicYearId, isActive: true },
        include: {
            student: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    gender: true,
                },
            },
            classroom: {
                select: {
                    id: true,
                    section: true,
                    grade: true,
                    shift: true,
                    subjects: {
                        include: { subject: { select: { id: true, name: true, evaluacion: true } } },
                    },
                },
            },
        },
    });

    // Las notas de revisión del ciclo (`services/revision.service.ts`): la de
    // una materia reprobada es su definitiva para la promoción (REV-*).
    const revisiones = new Map<string, number>(
        (
            await prisma.notaDeRevision.findMany({
                where: { academicYearId },
                select: { studentId: true, subjectId: true, score: true },
            })
        ).map((r: any) => [`${r.studentId}|${r.subjectId}`, r.score])
    );

    // Las materias con apreciación no cuentan: van al expediente con su
    // apreciación final y nada más (CUALI-03).
    const apreciaciones = await apreciacionesFinalesDelCiclo(prisma, academicYearId);

    /**
     * LOS LAPSOS DE ESTE AÑO, NO LOS DE «LA INSCRIPCIÓN ACTIVA»
     *
     * Sin lapsos, el promedio del alumno busca los de su inscripción activa,
     * y un año cerrado no desactiva la suya: el alumno que ya pasó a 2do tiene
     * dos, y la definitiva de 2do salía con las notas de 1ero (CIERRE-10).
     */
    const lapsosDelAno: string[] = (
        await prisma.period.findMany({ where: { academicYearId }, select: { id: true } })
    ).map((p: any) => p.id);

    /**
     * LOS PROMEDIOS, EN BLOQUE POR SECCIÓN Y LAPSO (2026-10-06)
     *
     * Se pedían alumno por alumno, materia por materia y lapso por lapso
     * (`gradesService.promedioDeLaMateria`): con 600 alumnos, unas 18.000
     * cuentas y 47 s medidos en frío. La pantalla del cierre esperaba eso, y
     * la primera descarga del admin también (101 s de sus 153).
     * `bulkSubjectAveragesConDatos` aplica las mismas reglas con un puñado de
     * consultas por sección y lapso (paridad: `bulk-averages-parity.test.ts`),
     * y la definitiva se saca igual que en `promedioDeLaMateria` (MAPA §1).
     */
    const enBloque = lapsosDelAno.length > 0 ? await promediosPorSeccionYLapso(prisma, enrollments, lapsosDelAno) : null;

    // Lo que decidió el admin antes de cerrar (paso 4), con su motivo.
    const decisiones = new Map<string, any>(
        (await prisma.decisionDeFinDeAno.findMany({ where: { academicYearId } })).map((d: any) => [d.studentId, d])
    );

    // Las materias pendientes de años anteriores que se cursaban en este.
    const arrastradas = new Map<string, StudentSuggestion['pendientesArrastradas']>();
    for (const p of await prisma.materiaPendiente.findMany({
        where: { cicloId: academicYearId },
        select: { id: true, studentId: true, subjectId: true, gradoDeOrigen: true, estado: true, subject: { select: { name: true } } },
    })) {
        const suyas = arrastradas.get(p.studentId) ?? [];
        suyas.push({ id: p.id, subjectId: p.subjectId, subjectName: p.subject.name, gradoDeOrigen: p.gradoDeOrigen, estado: p.estado });
        arrastradas.set(p.studentId, suyas);
    }

    // La labor social de los que están en los grados que la hacen.
    const reglasDeLabor = config.laborSocial;
    const conLabor = reglasDeLabor.activa
        ? enrollments.filter((e: any) => reglasDeLabor.grados.includes(e.classroom.grade)).map((e: any) => e.studentId)
        : [];
    const actividadesDeLabor = new Map<string, Array<{ horas: number; culminaElProyecto: boolean }>>();
    if (conLabor.length > 0) {
        for (const a of await prisma.actividadDeLaborSocial.findMany({
            where: { studentId: { in: conLabor } },
            select: { studentId: true, horas: true, culminaElProyecto: true },
        })) {
            actividadesDeLabor.set(a.studentId, [...(actividadesDeLabor.get(a.studentId) ?? []), a]);
        }
    }
    const laborDe = (studentId: string) =>
        conLabor.includes(studentId) ? avanceDe(actividadesDeLabor.get(studentId) ?? [], reglasDeLabor) : null;

    const suggestions: StudentSuggestion[] = [];
    const chunkSize = 25;
    for (let i = 0; i < enrollments.length; i += chunkSize) {
        const chunk = enrollments.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(
            chunk.map(async (enr: any) => {
                const classroom = enr.classroom;
                const subjectGrades: StudentSuggestion['subjectGrades'] = await Promise.all(
                    classroom.subjects.map(async (cs: any) => {
                        if (cs.subject.evaluacion === 'CUALITATIVA') {
                            return {
                                subjectId: cs.subjectId,
                                subjectName: cs.subject.name,
                                average: 0,
                                approved: true,
                                conNotas: false,
                                cualitativa: true,
                                apreciacion: apreciaciones.get(`${enr.studentId}|${cs.subjectId}`) ?? null,
                            };
                        }
                        // La definitiva, con el redondeo del liceo (MPPE por defecto): un
                        // 9,5 es un 10 aprobado, no una materia pendiente (RED-01…04).
                        const { promedio: avg, conNotas } = enBloque
                            ? definitivaDeLaMateria(enBloque, classroom.id, enr.studentId, cs.subjectId, lapsosDelAno, config.redondeoDeDefinitivas)
                            : await gradesService.promedioDeLaMateria(
                                  prisma, enr.studentId, cs.subjectId, undefined, lapsosDelAno, config.redondeoDeDefinitivas
                              );
                        const revision = revisiones.get(`${enr.studentId}|${cs.subjectId}`);
                        const usaRevision = conNotas && avg < config.notaMinimaAprobatoria && revision !== undefined;
                        const definitiva = usaRevision ? (revision as number) : avg;
                        return {
                            subjectId: cs.subjectId,
                            subjectName: cs.subject.name,
                            average: definitiva,
                            approved: definitiva >= config.notaMinimaAprobatoria,
                            conNotas,
                            revision: usaRevision ? (revision as number) : null,
                            definitivaDeLapsos: avg,
                        };
                    })
                );

                // Pendiente es la materia CON notas por debajo de la mínima. Se
                // miraba `average > 0`, y el alumno con todo en 0 —el que no
                // entregó nada— salía promovido sin pendientes (CERO-03).
                const failed = subjectGrades.filter(sg => sg.conNotas && sg.average < config.notaMinimaAprobatoria);
                const graded = subjectGrades.filter(sg => sg.conNotas);
                const finalAverage = graded.length > 0
                    ? Math.round((graded.reduce((a, b) => a + b.average, 0) / graded.length) * 100) / 100
                    : 0;

                const ultimoAno = config.maxGradeLevel ?? (config.modalidad === 'MEDIA_TECNICA' ? 6 : 5);
                const isLastGrade = classroom.grade >= ultimoAno;

                // Las pendientes de antes que no aprobó: o no se promueve (lo
                // del MPPE) o se arrastran y cuentan en el tope.
                const deAntes = arrastradas.get(enr.studentId) ?? [];
                const sinAprobar = deAntes.filter((p) => p.estado !== 'APROBADA').length;
                const pendingCount = failed.length + (config.pendienteNoAprobada === 'SIGUE_PENDIENTE' ? sinAprobar : 0);
                const suggestedStatus: SuggestionStatus =
                    sinAprobar > 0 && config.pendienteNoAprobada === 'REPITE'
                        ? 'NO_PROMOVIDO'
                        : condicionSugerida(pendingCount, isLastGrade, config);

                const guardada = decisiones.get(enr.studentId);
                const decision = guardada && esCondicion(guardada.condicion)
                    ? { condicion: guardada.condicion as SuggestionStatus, motivo: guardada.motivo, decididaPor: guardada.decididaPor ?? null }
                    : null;
                const condicionFinal = decision?.condicion ?? suggestedStatus;

                return {
                    studentId: enr.studentId,
                    name: `${enr.student.firstName} ${enr.student.lastName}`.trim(),
                    gender: enr.student.gender,
                    currentSection: classroom.section,
                    currentShift: classroom.shift || 'MANANA',
                    gradeLevel: classroom.grade,
                    isLastGrade,
                    defaultTargetGrade: gradoDeDestino(classroom.grade, isLastGrade, condicionFinal),
                    defaultTargetSection: classroom.section,
                    defaultTargetShift: classroom.shift || 'MANANA',
                    subjectGrades,
                    failedSubjects: failed.map(f => ({ subjectId: f.subjectId, name: f.subjectName, average: f.average, revision: f.revision ?? null })),
                    pendientesArrastradas: deAntes,
                    pendingCount,
                    finalAverage,
                    suggestedStatus,
                    motivoDeLaSugerencia:
                        explicar({ reprobadas: failed.length, sinAprobar, esUltimoAno: isLastGrade, condicion: suggestedStatus }, config) +
                        avisoDeLabor(laborDe(enr.studentId), isLastGrade && suggestedStatus !== 'NO_PROMOVIDO', config),
                    laborSocial: laborDe(enr.studentId),
                    decision,
                    condicionFinal,
                };
            })
        );
        suggestions.push(...chunkResults);
    }

    return { academicYearId, config, suggestions };
}

export interface CloseDecision {
    studentId: string;
    finalResult: SuggestionStatus;
    /** Obligatorio si `finalResult` no es lo que sugiere el sistema (y no se guardó antes). */
    motivo?: string;
    action?: 'ENROLL' | 'GRADUATE' | 'RETIRE_KEEP_HISTORY' | 'RETIRE_DELETE';
    targetGrade?: number | null;
    assignedClassroomId?: string | null;
    targetSectionLetter?: string | null;
    targetShift?: string | null;
}

export interface CloseConfirmInput {
    academicYearId: string;
    decisions: CloseDecision[];
    strategyKey?: string;
    strategyMode?: string;
    /** Ya no se usa: el año siguiente se crea en el paso 5 (`fin-de-ano.service`). */
    autoCreateNextYear?: boolean;
    nextYearName?: string;
    /** Quién cierra (para el expediente). */
    quienCierra?: string;
}

export interface CloseConfirmResult {
    closed: boolean;
    records: Array<{ studentId: string; finalResult: string; assignedClassroomId: string | null }>;
    placements: Assignment[];
    /** Materias pendientes creadas en el año siguiente (nuevas y arrastradas). */
    pendientesCreadas: number;
}

/** El año escolar siguiente: el primero que empieza después de este. */
export async function anoSiguiente(prisma: any, academicYearId: string) {
    const actual = await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { startDate: true } });
    if (!actual) return null;
    return prisma.academicYear.findFirst({
        where: { startDate: { gt: actual.startDate } },
        orderBy: { startDate: 'asc' },
    });
}

/**
 * Quién evalúa una materia pendiente: el profesor que da esa materia en ese
 * grado el año en que se cursa (de la misma sección si puede ser). El admin
 * lo cambia después (`materias-pendientes.service`).
 */
export async function profesorParaLaPendiente(
    prisma: any,
    cicloId: string,
    grado: number,
    subjectId: string,
    seccion?: string | null
): Promise<string | null> {
    const candidatas = await prisma.classroomSubject.findMany({
        where: { subjectId, teacherId: { not: null }, classroom: { academicYearId: cicloId, grade: grado } },
        select: { teacherId: true, classroom: { select: { section: true } } },
    });
    const misma = candidatas.find((c: any) => seccion && c.classroom.section === seccion);
    return (misma ?? candidatas[0])?.teacherId ?? null;
}
export interface PromotionContext {
    currentYear: { id: string; name: string };
    suggestions: StudentSuggestion[];
    destinationYears: Array<{
        id: string;
        name: string;
        sections: Array<{
            id: string;
            name: string;
            section: string;
            grade: number;
            capacity: number | null;
            totalStudents: number;
            maleCount: number;
            femaleCount: number;
        }>;
    }>;
    suggestedNextYearName: string;
    /** El año escolar siguiente, si ya existe (sin él no se puede cerrar). */
    nextYear: { id: string; name: string } | null;
}

export { listStrategies } from './strategies';
