import { PrismaClient } from '@prisma/client';
import { gradesService } from '../grades.service';
import { getStrategy, Assignment, StudentForPlacement, SectionOption } from './strategies';
import { platformPrisma } from '../../config/database';
import { borrarGuardandoCopia, QuienBorra } from '../../utils/papelera';
import { apreciacionesFinalesDelCiclo, APRECIACIONES_POR_DEFECTO, esListaDeApreciaciones } from '../apreciaciones.service';
import { nombreDeLaSeccion, slugDeLaSeccion } from '../../utils/nombre-de-la-seccion';
import {
    ReglasDeRevision,
    ReglasDePendientes,
    ReglasDeLaborSocial,
    LABOR_SOCIAL_POR_DEFECTO,
    esReglasDeLaborSocial,
    avanceDe,
    AvanceDeLaborSocial,
    UltimoAnoConPendientes,
    PendienteNoAprobada,
    REVISION_POR_DEFECTO,
    PENDIENTES_POR_DEFECTO,
    esReglasDeRevision,
    limpiarReglasDeRevision,
    esUltimoAnoConPendientes,
    esPendienteNoAprobada,
    esReglasDePendientes,
} from './reglas-del-fin-de-ano';

export interface AcademicConfig {
    notaMinimaAprobatoria: number;
    maxMateriasPendientesParaPromover: number;
    /**
     * La forma vieja de `ultimoAnoConPendientes`: `true` se lee como EGRESA
     * (lo que hacía), `false` como REPITE. Se sigue devolviendo para las
     * pantallas que la leen.
     */
    permitePendientesEnUltimoAno: boolean;
    /**
     * A partir de qué porcentaje de asistencia se deja de avisar al representante.
     */
    asistenciaMinima: number;
    modalidad?: 'MEDIA_GENERAL' | 'MEDIA_TECNICA';
    maxGradeLevel?: number;
    turnosHabilitados?: ('MANANA' | 'TARDE' | 'INTEGRAL')[];
    /**
     * Cómo se redondean las notas DEFINITIVAS (la del lapso y la de la materia
     * al cerrar el ciclo). 'MPPE': una fracción de 0,50 o más sube al entero
     * inmediato superior (Reglamento General de la LOE), cada lapso y luego la
     * definitiva. 'NINGUNO': a dos decimales, sin redondear al entero.
     */
    redondeoDeDefinitivas?: RedondeoDeDefinitivas;
    /**
     * Las palabras con que se evalúan las materias cualitativas (Orientación,
     * Grupos de Creación…), de mejor a peor. Por defecto: Consolidado, En
     * proceso, Iniciado.
     */
    apreciaciones?: string[];
    /** Las reglas del fin del año (`reglas-del-fin-de-ano.ts`). */
    revision: ReglasDeRevision;
    ultimoAnoConPendientes: UltimoAnoConPendientes;
    pendienteNoAprobada: PendienteNoAprobada;
    pendientes: ReglasDePendientes;
    laborSocial: ReglasDeLaborSocial;
}

export type RedondeoDeDefinitivas = 'MPPE' | 'NINGUNO';
export const REDONDEOS_DE_DEFINITIVAS: RedondeoDeDefinitivas[] = ['MPPE', 'NINGUNO'];
export function esRedondeoValido(valor: unknown): valor is RedondeoDeDefinitivas {
    return typeof valor === 'string' && (REDONDEOS_DE_DEFINITIVAS as string[]).includes(valor);
}

export const DEFAULT_ACADEMIC_CONFIG: AcademicConfig = {
    notaMinimaAprobatoria: 10,
    maxMateriasPendientesParaPromover: 2,
    permitePendientesEnUltimoAno: false,
    asistenciaMinima: 80,
    modalidad: 'MEDIA_GENERAL',
    maxGradeLevel: 5,
    turnosHabilitados: ['MANANA', 'TARDE'],
    redondeoDeDefinitivas: 'MPPE',
    apreciaciones: APRECIACIONES_POR_DEFECTO,
    revision: REVISION_POR_DEFECTO,
    ultimoAnoConPendientes: 'REPITE',
    pendienteNoAprobada: 'REPITE',
    pendientes: PENDIENTES_POR_DEFECTO,
    laborSocial: LABOR_SOCIAL_POR_DEFECTO,
};

/** El porcentaje de asistencia va de 0 a 100 y no admite otra cosa. */
export function esAsistenciaMinimaValida(valor: unknown): valor is number {
    return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 100;
}

/** Lo del último año, leyendo también la forma vieja (el booleano). */
function ultimoAnoDe(raw: Record<string, unknown>): UltimoAnoConPendientes {
    if (esUltimoAnoConPendientes(raw.ultimoAnoConPendientes)) return raw.ultimoAnoConPendientes;
    return raw.permitePendientesEnUltimoAno === true ? 'EGRESA' : 'REPITE';
}

export async function getAcademicConfig(instituteId: string): Promise<AcademicConfig> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    if (!inst) return { ...DEFAULT_ACADEMIC_CONFIG };
    const raw = (inst.academicConfig || {}) as Partial<AcademicConfig> & Record<string, unknown>;
    const modalidad = raw.modalidad === 'MEDIA_TECNICA' ? 'MEDIA_TECNICA' : 'MEDIA_GENERAL';
    const defaultMax = modalidad === 'MEDIA_TECNICA' ? 6 : 5;
    const ultimoAnoConPendientes = ultimoAnoDe(raw);
    return {
        notaMinimaAprobatoria: typeof raw.notaMinimaAprobatoria === 'number' ? raw.notaMinimaAprobatoria : DEFAULT_ACADEMIC_CONFIG.notaMinimaAprobatoria,
        maxMateriasPendientesParaPromover: typeof raw.maxMateriasPendientesParaPromover === 'number' ? raw.maxMateriasPendientesParaPromover : DEFAULT_ACADEMIC_CONFIG.maxMateriasPendientesParaPromover,
        permitePendientesEnUltimoAno: ultimoAnoConPendientes !== 'REPITE',
        asistenciaMinima: esAsistenciaMinimaValida(raw.asistenciaMinima) ? raw.asistenciaMinima : DEFAULT_ACADEMIC_CONFIG.asistenciaMinima,
        modalidad,
        maxGradeLevel: typeof raw.maxGradeLevel === 'number' ? raw.maxGradeLevel : defaultMax,
        turnosHabilitados: Array.isArray(raw.turnosHabilitados) ? raw.turnosHabilitados : DEFAULT_ACADEMIC_CONFIG.turnosHabilitados,
        redondeoDeDefinitivas: esRedondeoValido(raw.redondeoDeDefinitivas) ? raw.redondeoDeDefinitivas : DEFAULT_ACADEMIC_CONFIG.redondeoDeDefinitivas,
        apreciaciones: esListaDeApreciaciones(raw.apreciaciones) ? raw.apreciaciones.map((v) => v.trim()) : [...APRECIACIONES_POR_DEFECTO],
        revision: esReglasDeRevision(raw.revision) ? limpiarReglasDeRevision(raw.revision) : REVISION_POR_DEFECTO,
        ultimoAnoConPendientes,
        pendienteNoAprobada: esPendienteNoAprobada(raw.pendienteNoAprobada) ? raw.pendienteNoAprobada : DEFAULT_ACADEMIC_CONFIG.pendienteNoAprobada,
        pendientes: esReglasDePendientes(raw.pendientes) ? raw.pendientes : PENDIENTES_POR_DEFECTO,
        laborSocial: esReglasDeLaborSocial(raw.laborSocial)
            ? raw.laborSocial
            : { ...LABOR_SOCIAL_POR_DEFECTO, grados: [typeof raw.maxGradeLevel === 'number' ? raw.maxGradeLevel : defaultMax] },
    };
}

export async function updateAcademicConfig(instituteId: string, patch: Partial<AcademicConfig>): Promise<AcademicConfig> {
    const current = await getAcademicConfig(instituteId);
    // La configuración académica guarda MÁS cosas que estas reglas (la escala
    // de notas, el horario, la asistencia por QR…). Se escribían solo estas y
    // lo demás se perdía: guardar las reglas de promoción borraba la escala.
    const entera =
        ((await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } }))
            ?.academicConfig as Record<string, unknown> | null) || {};
    const modalidad = patch.modalidad ?? current.modalidad;
    const defaultMax = modalidad === 'MEDIA_TECNICA' ? 6 : 5;
    // El booleano viejo, si llega solo, sigue mandando (se traduce).
    const ultimoAnoConPendientes = esUltimoAnoConPendientes(patch.ultimoAnoConPendientes)
        ? patch.ultimoAnoConPendientes
        : typeof patch.permitePendientesEnUltimoAno === 'boolean'
          ? patch.permitePendientesEnUltimoAno
              ? 'EGRESA'
              : 'REPITE'
          : current.ultimoAnoConPendientes;
    const next: AcademicConfig = {
        notaMinimaAprobatoria: patch.notaMinimaAprobatoria ?? current.notaMinimaAprobatoria,
        maxMateriasPendientesParaPromover: patch.maxMateriasPendientesParaPromover ?? current.maxMateriasPendientesParaPromover,
        permitePendientesEnUltimoAno: ultimoAnoConPendientes !== 'REPITE',
        asistenciaMinima: esAsistenciaMinimaValida(patch.asistenciaMinima) ? patch.asistenciaMinima : current.asistenciaMinima,
        modalidad,
        maxGradeLevel: patch.maxGradeLevel ?? current.maxGradeLevel ?? defaultMax,
        turnosHabilitados: patch.turnosHabilitados ?? current.turnosHabilitados,
        redondeoDeDefinitivas: esRedondeoValido(patch.redondeoDeDefinitivas) ? patch.redondeoDeDefinitivas : current.redondeoDeDefinitivas,
        apreciaciones: esListaDeApreciaciones(patch.apreciaciones) ? patch.apreciaciones.map((v) => v.trim()) : current.apreciaciones,
        revision: esReglasDeRevision(patch.revision) ? limpiarReglasDeRevision(patch.revision) : current.revision,
        ultimoAnoConPendientes,
        pendienteNoAprobada: esPendienteNoAprobada(patch.pendienteNoAprobada) ? patch.pendienteNoAprobada : current.pendienteNoAprobada,
        pendientes: esReglasDePendientes(patch.pendientes) ? patch.pendientes : current.pendientes,
        laborSocial: esReglasDeLaborSocial(patch.laborSocial) ? patch.laborSocial : current.laborSocial,
    };
    await platformPrisma.institute.update({
        where: { id: instituteId },
        data: { academicConfig: { ...entera, ...next } as any },
    });
    return next;
}

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
                        const { promedio: avg, conNotas } = await gradesService.promedioDeLaMateria(
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

const conflicto = (mensaje: string, code: string, extra: Record<string, unknown> = {}) =>
    Object.assign(new Error(mensaje), { code, statusCode: 409, ...extra });

/** Lo que queda de cada materia en el expediente del alumno. */
function notaDelExpediente(sg: StudentSuggestion['subjectGrades'][number]) {
    if (sg.cualitativa) return { subjectId: sg.subjectId, subjectName: sg.subjectName, cualitativa: true, apreciacion: sg.apreciacion ?? null };
    return {
        subjectId: sg.subjectId,
        subjectName: sg.subjectName,
        average: sg.average,
        ...(sg.revision != null ? { revision: sg.revision, definitivaDeLapsos: sg.definitivaDeLapsos } : {}),
    };
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

/**
 * 2. EL CIERRE, EN UNA SOLA TRANSACCIÓN
 *
 * Escribe el expediente de cada alumno, lo matricula en el año siguiente,
 * crea sus materias pendientes y marca a los que egresan. Lo que cambió
 * (MAPA_DE_CALCULOS §10, pruebas CIERRE-*):
 *
 *   - **Ya no crea el año siguiente solo** (con un lapso de 90 días y fechas
 *     inventadas): sin año siguiente no se cierra (409 `SIN_ANO_SIGUIENTE`).
 *     Se crea en el paso 5, con el calendario del MPPE y la estructura de este.
 *   - Si falta una sección de destino, se crea copiando la de este año
 *     (capacidad, materias y horas), no con valores fijos.
 *   - Una condición distinta de la sugerida lleva **motivo** (400
 *     `FALTA_EL_MOTIVO`); queda en el expediente.
 *   - El de 5to que no aprueba repite 5to (antes egresaba igual).
 *   - Las pendientes son registros de verdad (`MateriaPendiente`), y las del
 *     año anterior sin aprobar se arrastran con su historia.
 */
export async function confirmClose(
    prisma: any,
    input: CloseConfirmInput,
    instituteId: string,
    quien: QuienBorra = {}
): Promise<CloseConfirmResult> {
    // 1. Preparar sugerencias y cálculos fuera de la transacción para no bloquear el pool
    const prepared = await prepareClose(prisma, input.academicYearId, instituteId);
    const config = prepared.config;
    const decisionById = new Map(input.decisions.map(d => [d.studentId, d]));

    // Una condición distinta de la sugerida, sin motivo, no se acepta.
    const sinMotivo: string[] = [];
    for (const s of prepared.suggestions) {
        const d = decisionById.get(s.studentId);
        if (d?.action === 'RETIRE_DELETE' || d?.action === 'RETIRE_KEEP_HISTORY') continue;
        const condicion = d?.finalResult ?? s.condicionFinal;
        if (condicion === s.suggestedStatus) continue;
        const motivo = d?.motivo?.trim() || (s.decision?.condicion === condicion ? s.decision.motivo : '');
        if (!motivo) sinMotivo.push(s.name);
    }
    if (sinMotivo.length > 0) {
        throw Object.assign(
            new Error(`Falta el motivo de la decisión distinta de la sugerida: ${sinMotivo.slice(0, 5).join(', ')}${sinMotivo.length > 5 ? '…' : ''}`),
            { code: 'FALTA_EL_MOTIVO', statusCode: 400, alumnos: sinMotivo }
        );
    }

    return prisma.$transaction(async (tx: any) => {
        // 1. Verificar idempotencia
        const existing = await tx.academicRecord.count({ where: { academicYearId: input.academicYearId } });
        if (existing > 0) {
            throw Object.assign(new Error('El ciclo ya fue cerrado'), { code: 'CLOSE_ALREADY_EXECUTED', statusCode: 409 });
        }

        const currentYear = await tx.academicYear.findUnique({
            where: { id: input.academicYearId },
            include: {
                classrooms: {
                    include: {
                        subjects: true,
                    },
                },
            },
        });

        if (!currentYear) {
            throw new Error('Academic year not found');
        }

        // Un ciclo ya cerrado no se vuelve a cerrar. La comprobación de arriba
        // mira si dejó registros; esta mira su estado, para el caso de un ciclo
        // marcado como cerrado que no los tenga.
        if (currentYear.status === 'COMPLETED') {
            throw Object.assign(new Error('El ciclo ya fue cerrado'), {
                code: 'CLOSE_ALREADY_EXECUTED',
                statusCode: 409,
            });
        }

        // 2. El año siguiente tiene que existir (paso 5). Antes se inventaba.
        const nextAcademicYear = await tx.academicYear.findFirst({
            where: { startDate: { gt: currentYear.startDate } },
            orderBy: { startDate: 'asc' },
        });
        if (!nextAcademicYear && prepared.suggestions.length > 0) {
            throw conflicto(
                'Falta el año escolar siguiente: créalo primero (paso 5 del fin de año), con el calendario y las secciones.',
                'SIN_ANO_SIGUIENTE'
            );
        }

        // Las secciones de este año, para copiar su estructura si falta una de destino.
        const referenciaDe = (grado: number, seccion: string, turno: string) =>
            currentYear.classrooms.find((c: any) => c.grade === grado && c.section === seccion && (c.shift || 'MANANA') === turno) ??
            currentYear.classrooms.find((c: any) => c.grade === grado) ??
            null;

        // 3. Procesar cada estudiante
        const records: CloseConfirmResult['records'] = [];
        const placements: Assignment[] = [];

        /**
         * UNA CONSULTA POR ALUMNO NO CABE EN UNA TRANSACCIÓN
         *
         * Cada alumno hacía cuatro viajes a la base (buscar su aula destino,
         * crear su expediente, averiguar el año de esa aula, matricularlo), uno
         * detrás de otro y dentro de la transacción. Con un liceo de 1.500
         * alumnos son 6.000 viajes; con el servidor cargado se pasaba del tiempo
         * de la transacción, se deshacía entero y el ciclo NO se podía cerrar.
         *
         * Ahora las aulas se buscan una vez por destino (todas las de «2do A»
         * son la misma), y expedientes y matrículas se escriben juntos al
         * final: un puñado de consultas, tenga el liceo los alumnos que tenga.
         */
        const aulaPorDestino = new Map<string, any>();
        const anioDelAula = new Map<string, string | null>();
        const expedientes: any[] = [];
        const matriculas: Array<{ studentId: string; classroomId: string; academicYearId: string }> = [];
        const pendientesNuevas: Array<{ studentId: string; subjectId: string; gradoDeOrigen: number; notaDeOrigen: number | null; seccion: string | null }> = [];
        const retirados = new Set<string>();

        const baseDelExpediente = (s: StudentSuggestion, condicion: SuggestionStatus, motivo: string | null) => ({
            studentId: s.studentId,
            academicYearId: input.academicYearId,
            sectionSnapshot: s.currentSection || '',
            finalAverage: s.finalAverage,
            pendingSubjects: s.failedSubjects.map(f => f.name),
            subjectGrades: s.subjectGrades.map(notaDelExpediente),
            condicionSugerida: s.suggestedStatus,
            motivo: condicion !== s.suggestedStatus ? motivo : null,
            decididaPor: condicion !== s.suggestedStatus ? (s.decision?.decididaPor ?? input.quienCierra ?? quien.usuarioId ?? null) : null,
        });

        for (const s of prepared.suggestions) {
            const d = decisionById.get(s.studentId);
            const condicion: SuggestionStatus = d?.finalResult ?? s.condicionFinal;
            const motivo = d?.motivo?.trim() || (s.decision?.condicion === condicion ? s.decision.motivo : null);

            // Caso A: Eliminar al estudiante. Con copia en la papelera, como
            // todo borrado: esto se saltaba la regla y el alumno se iba con
            // todas sus notas para siempre, sin nada de dónde recuperarlo.
            if (d?.action === 'RETIRE_DELETE') {
                const motivoDelBorrado = { ...quien, motivo: `cierre del ciclo ${input.academicYearId}: retirar y eliminar` };
                await borrarGuardandoCopia(tx, 'studentClassroom', { studentId: s.studentId }, motivoDelBorrado);
                await borrarGuardandoCopia(tx, 'grade', { studentId: s.studentId }, motivoDelBorrado);
                await borrarGuardandoCopia(tx, 'user', { id: s.studentId }, motivoDelBorrado);
                retirados.add(s.studentId);
                continue;
            }

            // Caso B: Retirado con conservación de historial
            if (d?.action === 'RETIRE_KEEP_HISTORY') {
                expedientes.push({
                    ...baseDelExpediente(s, 'NO_PROMOVIDO', null),
                    status: 'RETIRADO',
                    finalResult: 'NO_PROMOVIDO',
                    motivo: d.motivo?.trim() || null,
                    assignedClassroomId: null,
                });
                records.push({ studentId: s.studentId, finalResult: 'RETIRADO', assignedClassroomId: null });
                placements.push({ studentId: s.studentId, sectionId: null });
                retirados.add(s.studentId);
                continue;
            }

            // Sus materias reprobadas pasan a pendientes si pasa con pendientes.
            if (condicion === 'PROMOVIDO_CON_PENDIENTES') {
                for (const f of s.failedSubjects) {
                    if (!f.subjectId) continue;
                    pendientesNuevas.push({ studentId: s.studentId, subjectId: f.subjectId, gradoDeOrigen: s.gradeLevel, notaDeOrigen: f.average, seccion: s.currentSection });
                }
            }

            // Caso C: el último año que no repite (o un egreso decidido a mano).
            // Egresa, o se queda solo con sus pendientes hasta aprobarlas.
            const egresa = d?.action === 'GRADUATE' || (s.isLastGrade && condicion !== 'NO_PROMOVIDO');
            if (egresa) {
                const egreso = egresoDe(condicion, config, s.laborSocial, d?.action === 'GRADUATE');
                expedientes.push({
                    ...baseDelExpediente(s, condicion, motivo),
                    status: 'COMPLETED',
                    finalResult: condicion,
                    egreso,
                    assignedClassroomId: null,
                });
                records.push({ studentId: s.studentId, finalResult: egreso === 'PENDIENTE' ? 'EGRESO_PENDIENTE' : 'GRADUATED', assignedClassroomId: null });
                placements.push({ studentId: s.studentId, sectionId: null });
                continue;
            }

            // Caso D: Matricular en el ciclo destino (también el de 5to que repite)
            let targetClassroomId = d?.assignedClassroomId ?? null;

            if (!targetClassroomId && nextAcademicYear) {
                const targetGrade = d?.targetGrade ?? gradoDeDestino(s.gradeLevel, s.isLastGrade, condicion) ?? s.gradeLevel;
                const targetSection = (d?.targetSectionLetter || s.currentSection || 'A').toUpperCase();
                const targetShift = d?.targetShift ?? s.defaultTargetShift ?? (s as any).currentShift ?? 'MANANA';

                // Buscar aula en el año destino (una vez por destino)
                const destino = `${targetGrade}|${targetSection}|${targetShift}`;
                let targetClassroom = aulaPorDestino.get(destino);
                if (targetClassroom === undefined) {
                    targetClassroom = await tx.classroom.findFirst({
                        where: {
                            academicYearId: nextAcademicYear.id,
                            grade: targetGrade,
                            section: targetSection,
                            shift: targetShift,
                        },
                    });
                }

                // Si falta, se crea COPIANDO la de este año (capacidad, materias
                // y horas). Antes: capacidad 35, 4 horas por materia y la misma
                // dirección «3er-ano-…» para todos los grados.
                if (!targetClassroom) {
                    const referencia = referenciaDe(targetGrade, targetSection, targetShift);
                    const nombre = nombreDeLaSeccion(targetGrade, targetSection, targetShift);
                    targetClassroom = await tx.classroom.create({
                        data: {
                            name: nombre,
                            slug: slugDeLaSeccion(nombre, nextAcademicYear.name),
                            grade: targetGrade,
                            section: targetSection,
                            shift: targetShift,
                            capacity: referencia?.capacity ?? null,
                            academicYearId: nextAcademicYear.id,
                        },
                    });
                    // De una vez y saltando las repetidas: un fallo dentro de la
                    // transacción la deja anulada aunque el error se trague.
                    const materias = referencia?.subjects ?? [];
                    if (materias.length > 0) {
                        await tx.classroomSubject.createMany({
                            data: materias.map((m: any) => ({
                                classroomId: targetClassroom.id,
                                subjectId: m.subjectId,
                                weeklyBlocks: m.weeklyBlocks ?? 0,
                                hoursPerWeek: m.hoursPerWeek ?? 0,
                            })),
                            skipDuplicates: true,
                        });
                    }
                }
                aulaPorDestino.set(destino, targetClassroom);
                anioDelAula.set(targetClassroom.id, targetClassroom.academicYearId ?? nextAcademicYear.id);

                targetClassroomId = targetClassroom.id;
            }

            // Guardar registro académico histórico en el ciclo que se cierra
            expedientes.push({
                ...baseDelExpediente(s, condicion, motivo),
                status: 'COMPLETED',
                finalResult: condicion,
                egreso: s.isLastGrade ? null : undefined,
                assignedClassroomId: targetClassroomId,
            });

            // Matricular en el aula destino, EN EL AÑO DE ESA AULA.
            // El admin puede mover a un estudiante a un año posterior, no solo al
            // inmediato siguiente; antes la matrícula se creaba siempre en el año
            // siguiente, así que apuntaba a un aula de otro año.
            if (targetClassroomId) {
                if (!anioDelAula.has(targetClassroomId)) {
                    const targetClassroomYear = await tx.classroom.findUnique({
                        where: { id: targetClassroomId },
                        select: { academicYearId: true },
                    });
                    anioDelAula.set(targetClassroomId, targetClassroomYear?.academicYearId ?? null);
                }
                const targetYearId = anioDelAula.get(targetClassroomId) ?? nextAcademicYear?.id ?? null;

                if (targetYearId) {
                    matriculas.push({ studentId: s.studentId, classroomId: targetClassroomId, academicYearId: targetYearId });
                }
            }

            records.push({ studentId: s.studentId, finalResult: condicion, assignedClassroomId: targetClassroomId ?? null });
            placements.push({ studentId: s.studentId, sectionId: targetClassroomId ?? null });
        }

        // Expedientes y matrículas, juntos.
        if (expedientes.length > 0) {
            await tx.academicRecord.createMany({
                data: expedientes.map((e) => {
                    const { egreso, ...resto } = e;
                    return egreso === undefined ? resto : { ...resto, egreso };
                }),
            });
        }
        if (matriculas.length > 0) {
            // Quien ya estaba matriculado en ese año se cambia de aula (lo que
            // hacía el `upsert`); los demás se matriculan de una vez.
            const yaEstaban = await tx.studentClassroom.findMany({
                where: {
                    studentId: { in: matriculas.map(m => m.studentId) },
                    academicYearId: { in: [...new Set(matriculas.map(m => m.academicYearId))] },
                },
                select: { id: true, studentId: true, academicYearId: true },
            });
            const existente = new Map<string, string>(
                yaEstaban.map((m: any) => [`${m.studentId}|${m.academicYearId}`, m.id])
            );
            for (const m of matriculas) {
                const id = existente.get(`${m.studentId}|${m.academicYearId}`);
                if (id) {
                    await tx.studentClassroom.update({ where: { id }, data: { classroomId: m.classroomId, isActive: true } });
                }
            }
            const nuevas = matriculas.filter(m => !existente.has(`${m.studentId}|${m.academicYearId}`));
            if (nuevas.length > 0) {
                await tx.studentClassroom.createMany({
                    data: nuevas.map(m => ({ ...m, isActive: true })),
                });
            }
        }

        // 4. Las materias pendientes, en el año siguiente.
        let pendientesCreadas = 0;
        if (nextAcademicYear) {
            // Las de antes que no se aprobaron: quedan NO_APROBADA en este año
            // y nacen otra vez en el siguiente (con su origen), salvo retirados.
            const deAntes = await tx.materiaPendiente.findMany({
                where: { cicloId: input.academicYearId, estado: 'PENDIENTE' },
            });
            if (deAntes.length > 0) {
                await tx.materiaPendiente.updateMany({
                    where: { id: { in: deAntes.map((p: any) => p.id) } },
                    data: { estado: 'NO_APROBADA' },
                });
            }
            const porCrear = [
                ...pendientesNuevas.map((p) => ({ ...p, cicloDeOrigenId: input.academicYearId })),
                ...deAntes
                    .filter((p: any) => !retirados.has(p.studentId))
                    .map((p: any) => ({
                        studentId: p.studentId,
                        subjectId: p.subjectId,
                        gradoDeOrigen: p.gradoDeOrigen,
                        notaDeOrigen: p.notaDeOrigen,
                        seccion: null,
                        cicloDeOrigenId: p.cicloDeOrigenId,
                    })),
            ];
            const profesores = new Map<string, string | null>();
            for (const p of porCrear) {
                const clave = `${p.gradoDeOrigen}|${p.subjectId}|${p.seccion ?? ''}`;
                if (!profesores.has(clave)) {
                    profesores.set(clave, await profesorParaLaPendiente(tx, nextAcademicYear.id, p.gradoDeOrigen, p.subjectId, p.seccion));
                }
            }
            if (porCrear.length > 0) {
                const hecho = await tx.materiaPendiente.createMany({
                    data: porCrear.map((p) => ({
                        studentId: p.studentId,
                        subjectId: p.subjectId,
                        gradoDeOrigen: p.gradoDeOrigen,
                        cicloDeOrigenId: p.cicloDeOrigenId,
                        notaDeOrigen: p.notaDeOrigen,
                        cicloId: nextAcademicYear.id,
                        profesorId: profesores.get(`${p.gradoDeOrigen}|${p.subjectId}|${p.seccion ?? ''}`) ?? null,
                    })),
                    skipDuplicates: true,
                });
                pendientesCreadas = hecho.count;
            }
        }

        // 5. Cerrar el año escolar actual
        await tx.academicYear.update({
            where: { id: input.academicYearId },
            data: { status: 'COMPLETED', isActive: false },
        });

        return { closed: true, records, placements, pendientesCreadas };
    }, { timeout: 60000, maxWait: 15000 });
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

/** Contexto completo para la pantalla de promoción */
/**
 * Estudiantes que todavía NO tienen destino. Mientras la lista no esté vacía, el
 * botón "Confirmar" del cierre de ciclo tiene que seguir bloqueado: cerrar el
 * año con alguien sin destino lo deja fuera del ciclo siguiente.
 *
 * Acepta tanto un Map como un objeto plano, que es como lo maneja la pantalla.
 * Un valor vacío (null, '' o ausente) cuenta como "sin destino"; una acción
 * terminal (graduado, retirado) cuenta como destino.
 */
export function missingAssignmentIds(
    suggestions: Array<{ studentId: string }>,
    assignments: Map<string, string | null | undefined> | Record<string, string | null | undefined>
): string[] {
    const valueOf = (studentId: string) =>
        assignments instanceof Map ? assignments.get(studentId) : assignments[studentId];

    return suggestions.filter((s) => !valueOf(s.studentId)).map((s) => s.studentId);
}

export async function getPromotionContext(prisma: PrismaClient, academicYearId: string, instituteId: string): Promise<PromotionContext> {
    const [currentYear, suggestionsData, allYears] = await Promise.all([
        prisma.academicYear.findUnique({
            where: { id: academicYearId },
            select: { id: true, name: true, startDate: true, endDate: true },
        }),
        prepareClose(prisma, academicYearId, instituteId),
        prisma.academicYear.findMany({
            orderBy: { startDate: 'asc' },
            include: {
                classrooms: {
                    include: {
                        studentClassrooms: {
                            where: { isActive: true },
                            include: {
                                student: { select: { gender: true } },
                            },
                        },
                    },
                },
            },
        }),
    ]);

    if (!currentYear) throw new Error('Academic year not found');

    // Calcular nombre sugerido para el siguiente año
    let suggestedNextYearName = '2027-2028';
    const match = currentYear.name.match(/(\d{4})-(\d{4})/);
    if (match) {
        suggestedNextYearName = `${parseInt(match[1]) + 1}-${parseInt(match[2]) + 1}`;
    }

    const destinationYears = allYears
        .filter(y => y.startDate >= currentYear.startDate)
        .map(y => ({
            id: y.id,
            name: y.name,
            sections: y.classrooms.map(c => {
                const total = c.studentClassrooms.length;
                const maleCount = c.studentClassrooms.filter(sc => sc.student.gender === 'MASCULINO').length;
                const femaleCount = c.studentClassrooms.filter(sc => sc.student.gender === 'FEMENINO').length;
                return {
                    id: c.id,
                    name: c.name,
                    section: c.section,
                    grade: c.grade,
                    capacity: c.capacity,
                    totalStudents: total,
                    maleCount,
                    femaleCount,
                };
            }),
        }));

    const siguiente = allYears.find((y) => y.startDate > currentYear.startDate);

    return {
        currentYear: { id: currentYear.id, name: currentYear.name },
        suggestions: suggestionsData.suggestions,
        destinationYears,
        suggestedNextYearName,
        nextYear: siguiente ? { id: siguiente.id, name: siguiente.name } : null,
    };
}

/** Previsualiza la asignación de una estrategia automática sobre los estudiantes */
export async function previewStrategyAssignment(
    prisma: PrismaClient,
    academicYearId: string,
    instituteId: string,
    strategyKey: string,
    strategyMode?: string
): Promise<{ assignments: Array<{ studentId: string; sectionId: string | null; targetGrade: number | null; targetSectionLetter: string | null }>; yearId: string | null }> {
    const prepared = await prepareClose(prisma, academicYearId, instituteId);
    const currentYear = await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { startDate: true } });

    const nextYear = currentYear
        ? await prisma.academicYear.findFirst({
            where: { startDate: { gt: currentYear.startDate } },
            orderBy: { startDate: 'asc' },
            include: {
                classrooms: {
                    select: { id: true, section: true, grade: true, capacity: true },
                },
            },
        })
        : null;

    const students: StudentForPlacement[] = prepared.suggestions.map(s => ({
        id: s.studentId,
        average: s.finalAverage,
        gender: s.gender,
        currentSection: s.currentSection,
        currentGrade: s.gradeLevel,
        targetGrade: s.defaultTargetGrade,
        // Sin sección solo quien no va a ninguna: el de 5to que repite, sí.
        isLastGrade: s.defaultTargetGrade === null,
        name: s.name,
    }));

    const sections: SectionOption[] = (nextYear?.classrooms || []).map(c => ({
        id: c.id,
        section: c.section,
        grade: c.grade,
        capacity: c.capacity,
    }));

    const strategy = getStrategy(strategyKey);
    const rawAssignments = strategy.assign(students, sections, { mode: strategyMode });

    const assignments = rawAssignments.map(a => {
        const student = students.find(s => s.id === a.studentId);
        const section = sections.find(sec => sec.id === a.sectionId);
        return {
            studentId: a.studentId,
            sectionId: a.sectionId,
            targetGrade: student?.targetGrade ?? null,
            targetSectionLetter: section?.section ?? student?.currentSection ?? 'A',
        };
    });

    return { assignments, yearId: nextYear?.id ?? null };
}

export { listStrategies } from './strategies';
