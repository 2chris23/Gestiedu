import { PrismaClient } from '@prisma/client';
import { gradesService } from '../grades.service';
import { getStrategy, Assignment, StudentForPlacement, SectionOption } from './strategies';
import { platformPrisma } from '../../config/database';
import { borrarGuardandoCopia, QuienBorra } from '../../utils/papelera';

export interface AcademicConfig {
    notaMinimaAprobatoria: number;
    maxMateriasPendientesParaPromover: number;
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
};

/** El porcentaje de asistencia va de 0 a 100 y no admite otra cosa. */
export function esAsistenciaMinimaValida(valor: unknown): valor is number {
    return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 100;
}

export async function getAcademicConfig(instituteId: string): Promise<AcademicConfig> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    if (!inst) return { ...DEFAULT_ACADEMIC_CONFIG };
    const raw = (inst.academicConfig || {}) as Partial<AcademicConfig>;
    const modalidad = raw.modalidad === 'MEDIA_TECNICA' ? 'MEDIA_TECNICA' : 'MEDIA_GENERAL';
    const defaultMax = modalidad === 'MEDIA_TECNICA' ? 6 : 5;
    return {
        notaMinimaAprobatoria: typeof raw.notaMinimaAprobatoria === 'number' ? raw.notaMinimaAprobatoria : DEFAULT_ACADEMIC_CONFIG.notaMinimaAprobatoria,
        maxMateriasPendientesParaPromover: typeof raw.maxMateriasPendientesParaPromover === 'number' ? raw.maxMateriasPendientesParaPromover : DEFAULT_ACADEMIC_CONFIG.maxMateriasPendientesParaPromover,
        permitePendientesEnUltimoAno: typeof raw.permitePendientesEnUltimoAno === 'boolean' ? raw.permitePendientesEnUltimoAno : DEFAULT_ACADEMIC_CONFIG.permitePendientesEnUltimoAno,
        asistenciaMinima: esAsistenciaMinimaValida(raw.asistenciaMinima) ? raw.asistenciaMinima : DEFAULT_ACADEMIC_CONFIG.asistenciaMinima,
        modalidad,
        maxGradeLevel: typeof raw.maxGradeLevel === 'number' ? raw.maxGradeLevel : defaultMax,
        turnosHabilitados: Array.isArray(raw.turnosHabilitados) ? raw.turnosHabilitados : DEFAULT_ACADEMIC_CONFIG.turnosHabilitados,
        redondeoDeDefinitivas: esRedondeoValido(raw.redondeoDeDefinitivas) ? raw.redondeoDeDefinitivas : DEFAULT_ACADEMIC_CONFIG.redondeoDeDefinitivas,
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
    const next: AcademicConfig = {
        notaMinimaAprobatoria: patch.notaMinimaAprobatoria ?? current.notaMinimaAprobatoria,
        maxMateriasPendientesParaPromover: patch.maxMateriasPendientesParaPromover ?? current.maxMateriasPendientesParaPromover,
        permitePendientesEnUltimoAno: patch.permitePendientesEnUltimoAno ?? current.permitePendientesEnUltimoAno,
        asistenciaMinima: esAsistenciaMinimaValida(patch.asistenciaMinima) ? patch.asistenciaMinima : current.asistenciaMinima,
        modalidad,
        maxGradeLevel: patch.maxGradeLevel ?? current.maxGradeLevel ?? defaultMax,
        turnosHabilitados: patch.turnosHabilitados ?? current.turnosHabilitados,
        redondeoDeDefinitivas: esRedondeoValido(patch.redondeoDeDefinitivas) ? patch.redondeoDeDefinitivas : current.redondeoDeDefinitivas,
    };
    await platformPrisma.institute.update({
        where: { id: instituteId },
        data: { academicConfig: { ...entera, ...next } as any },
    });
    return next;
}

export type SuggestionStatus = 'PROMOVIDO' | 'PROMOVIDO_CON_PENDIENTES' | 'NO_PROMOVIDO';

/**
 * Lo que le toca al alumno según cuántas materias reprobó y las reglas del
 * liceo. La usan el cierre y el resumen final, para que digan lo mismo.
 */
export function condicionSugerida(pendientes: number, esUltimoAno: boolean, config: AcademicConfig): SuggestionStatus {
    if (pendientes === 0) return 'PROMOVIDO';
    if (esUltimoAno && !config.permitePendientesEnUltimoAno) return 'NO_PROMOVIDO';
    if (pendientes <= config.maxMateriasPendientesParaPromover) return 'PROMOVIDO_CON_PENDIENTES';
    return 'NO_PROMOVIDO';
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
    }>;
    failedSubjects: Array<{ subjectId?: string; name: string; average: number; revision?: number | null }>;
    pendingCount: number;
    finalAverage: number;
    suggestedStatus: SuggestionStatus;
}

export interface PrepareCloseResult {
    academicYearId: string;
    config: AcademicConfig;
    suggestions: StudentSuggestion[];
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
                        include: { subject: { select: { id: true, name: true } } },
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

    const suggestions: StudentSuggestion[] = [];
    const chunkSize = 25;
    for (let i = 0; i < enrollments.length; i += chunkSize) {
        const chunk = enrollments.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(
            chunk.map(async (enr: any) => {
                const classroom = enr.classroom;
                const subjectGrades: StudentSuggestion['subjectGrades'] = await Promise.all(
                    classroom.subjects.map(async (cs: any) => {
                        // La definitiva, con el redondeo del liceo (MPPE por defecto): un
                        // 9,5 es un 10 aprobado, no una materia pendiente (RED-01…04).
                        const { promedio: avg, conNotas } = await gradesService.promedioDeLaMateria(
                            prisma, enr.studentId, cs.subjectId, undefined, undefined, config.redondeoDeDefinitivas
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
                const pendingCount = failed.length;
                const graded = subjectGrades.filter(sg => sg.conNotas);
                const finalAverage = graded.length > 0
                    ? Math.round((graded.reduce((a, b) => a + b.average, 0) / graded.length) * 100) / 100
                    : 0;

                const ultimoAno = config.maxGradeLevel ?? (config.modalidad === 'MEDIA_TECNICA' ? 6 : 5);
                const isLastGrade = classroom.grade >= ultimoAno;

                const suggestedStatus = condicionSugerida(pendingCount, isLastGrade, config);

                let defaultTargetGrade: number | null = null;
                if (isLastGrade) {
                    defaultTargetGrade = null; // Egresado
                } else if (suggestedStatus === 'NO_PROMOVIDO') {
                    defaultTargetGrade = classroom.grade; // Repite en su mismo año
                } else {
                    defaultTargetGrade = classroom.grade + 1; // Pasa al siguiente año
                }

                return {
                    studentId: enr.studentId,
                    name: `${enr.student.firstName} ${enr.student.lastName}`.trim(),
                    gender: enr.student.gender,
                    currentSection: classroom.section,
                    currentShift: classroom.shift || 'MANANA',
                    gradeLevel: classroom.grade,
                    isLastGrade,
                    defaultTargetGrade,
                    defaultTargetSection: classroom.section,
                    defaultTargetShift: classroom.shift || 'MANANA',
                    subjectGrades,
                    failedSubjects: failed.map(f => ({ subjectId: f.subjectId, name: f.subjectName, average: f.average, revision: f.revision ?? null })),
                    pendingCount,
                    finalAverage,
                    suggestedStatus,
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
    autoCreateNextYear?: boolean;
    nextYearName?: string;
}

export interface CloseConfirmResult {
    closed: boolean;
    records: Array<{ studentId: string; finalResult: string; assignedClassroomId: string | null }>;
    placements: Assignment[];
}

/** 2. Ejecución atómica de Cierre de Ciclo Escolar */
export async function confirmClose(
    prisma: any,
    input: CloseConfirmInput,
    instituteId: string,
    quien: QuienBorra = {}
): Promise<CloseConfirmResult> {
    // 1. Preparar sugerencias y cálculos fuera de la transacción para no bloquear el pool
    const prepared = await prepareClose(prisma, input.academicYearId, instituteId);
    const config = prepared.config;

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

        // 2. Buscar o crear automáticamente el año escolar destino si se requiere
        let nextAcademicYear = await tx.academicYear.findFirst({
            where: { startDate: { gt: currentYear.startDate } },
            orderBy: { startDate: 'asc' },
            include: {
                classrooms: true,
            },
        });

        if (!nextAcademicYear && (input.autoCreateNextYear || true)) {
            // Calcular nombre del siguiente ciclo (ej. 2026-2027 -> 2027-2028)
            let nextName = input.nextYearName;
            if (!nextName) {
                const match = currentYear.name.match(/(\d{4})-(\d{4})/);
                if (match) {
                    const y1 = parseInt(match[1]) + 1;
                    const y2 = parseInt(match[2]) + 1;
                    nextName = `${y1}-${y2}`;
                } else {
                    nextName = `${currentYear.name} (Siguiente)`;
                }
            }

            const nextStart = new Date(currentYear.endDate);
            nextStart.setMonth(nextStart.getMonth() + 1);
            const nextEnd = new Date(nextStart);
            nextEnd.setFullYear(nextEnd.getFullYear() + 1);

            nextAcademicYear = await tx.academicYear.create({
                data: {
                    name: nextName,
                    startDate: nextStart,
                    endDate: nextEnd,
                    status: 'ACTIVE',
                    isActive: true,
                },
                include: { classrooms: true },
            });

            // Crear periodo por defecto en el nuevo año
            await tx.period.create({
                data: {
                    academicYearId: nextAcademicYear.id,
                    name: '1er Lapso',
                    startDate: nextStart,
                    endDate: new Date(nextStart.getTime() + 90 * 24 * 60 * 60 * 1000),
                    isActive: true,
                },
            });
        }

        const decisionById = new Map(input.decisions.map(d => [d.studentId, d]));

        // Mapear materias existentes por grado para replicarlas al auto-crear aulas
        const subjectsByGrade = new Map<number, string[]>();
        currentYear.classrooms.forEach((c: any) => {
            if (!subjectsByGrade.has(c.grade)) {
                subjectsByGrade.set(c.grade, c.subjects.map((s: any) => s.subjectId));
            }
        });

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

        for (const s of prepared.suggestions) {
            const decision = decisionById.get(s.studentId) || {
                studentId: s.studentId,
                finalResult: s.suggestedStatus,
                action: s.isLastGrade ? 'GRADUATE' : 'ENROLL',
                assignedClassroomId: null,
            };

            // Caso A: Eliminar al estudiante. Con copia en la papelera, como
            // todo borrado: esto se saltaba la regla y el alumno se iba con
            // todas sus notas para siempre, sin nada de dónde recuperarlo.
            if (decision.action === 'RETIRE_DELETE') {
                const motivo = { ...quien, motivo: `cierre del ciclo ${input.academicYearId}: retirar y eliminar` };
                await borrarGuardandoCopia(tx, 'studentClassroom', { studentId: s.studentId }, motivo);
                await borrarGuardandoCopia(tx, 'grade', { studentId: s.studentId }, motivo);
                await borrarGuardandoCopia(tx, 'user', { id: s.studentId }, motivo);
                continue;
            }

            // Caso B: Retirado con conservación de historial
            if (decision.action === 'RETIRE_KEEP_HISTORY') {
                expedientes.push({
                    studentId: s.studentId,
                    academicYearId: input.academicYearId,
                    sectionSnapshot: s.currentSection || '',
                    finalAverage: s.finalAverage,
                    status: 'RETIRADO',
                    finalResult: 'NO_PROMOVIDO',
                    pendingSubjects: s.failedSubjects.map(f => f.name),
                    subjectGrades: s.subjectGrades.map(sg => ({ subjectId: sg.subjectId, subjectName: sg.subjectName, average: sg.average, ...(sg.revision != null ? { revision: sg.revision, definitivaDeLapsos: sg.definitivaDeLapsos } : {}) })),
                    assignedClassroomId: null,
                });
                records.push({ studentId: s.studentId, finalResult: 'RETIRADO', assignedClassroomId: null });
                placements.push({ studentId: s.studentId, sectionId: null });
                continue;
            }

            // Caso C: Estudiante de 5to año (Egresado / Graduado)
            if (s.isLastGrade || decision.action === 'GRADUATE') {
                expedientes.push({
                    studentId: s.studentId,
                    academicYearId: input.academicYearId,
                    sectionSnapshot: s.currentSection || '',
                    finalAverage: s.finalAverage,
                    status: 'COMPLETED',
                    finalResult: decision.finalResult === 'NO_PROMOVIDO' ? 'NO_PROMOVIDO' : 'PROMOVIDO',
                    pendingSubjects: s.failedSubjects.map(f => f.name),
                    subjectGrades: s.subjectGrades.map(sg => ({ subjectId: sg.subjectId, subjectName: sg.subjectName, average: sg.average, ...(sg.revision != null ? { revision: sg.revision, definitivaDeLapsos: sg.definitivaDeLapsos } : {}) })),
                    assignedClassroomId: null,
                });
                records.push({ studentId: s.studentId, finalResult: 'GRADUATED', assignedClassroomId: null });
                placements.push({ studentId: s.studentId, sectionId: null });
                continue;
            }

            // Caso D: Matricular en el ciclo destino
            let targetClassroomId = decision.assignedClassroomId;

            // Si no vino un ID directo pero sí targetGrade y targetSection (o auto-resolución)
            if (!targetClassroomId && nextAcademicYear) {
                const targetGrade = decision.targetGrade ?? s.defaultTargetGrade ?? s.gradeLevel + 1;
                const targetSection = (decision.targetSectionLetter || s.currentSection || 'A').toUpperCase();

                const targetShift = decision.targetShift ?? s.defaultTargetShift ?? (s as any).currentShift ?? 'MANANA';

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

                // Auto-crear aula si no existe en el año nuevo
                if (!targetClassroom) {
                    const gradeNames: Record<number, string> = {
                        1: '1er Año',
                        2: '2do Año',
                        3: '3er Año',
                        4: '4to Año',
                        5: '5to Año',
                        6: '6to Año',
                    };
                    const gradeName = gradeNames[targetGrade] || `${targetGrade}º Año`;
                    const shiftSuffix = targetShift === 'TARDE' ? ' (Tarde)' : targetShift === 'INTEGRAL' ? ' (Integral)' : '';
                    const fullName = `${gradeName} ${targetSection}${shiftSuffix}`;
                    const slugShift = targetShift === 'TARDE' ? '-tarde' : targetShift === 'INTEGRAL' ? '-integral' : '';
                    targetClassroom = await tx.classroom.create({
                        data: {
                            name: fullName,
                            slug: `${targetGrade}er-ano-${targetSection.toLowerCase()}${slugShift}-${nextAcademicYear.id}`,
                            grade: targetGrade,
                            section: targetSection,
                            shift: targetShift,
                            capacity: 35,
                            academicYearId: nextAcademicYear.id,
                        },
                    });

                    // Copiar materias de referencia para este grado. De una vez,
                    // y saltando las repetidas: antes era una por materia con
                    // `.catch(() => {})`, y eso NO sirve dentro de una
                    // transacción — un fallo de PostgreSQL deja la transacción
                    // anulada aunque el error se trague, y todo lo que venía
                    // detrás reventaba con un mensaje que no decía por qué.
                    const refSubjects = subjectsByGrade.get(targetGrade) || subjectsByGrade.get(1) || [];
                    if (refSubjects.length > 0) {
                        await tx.classroomSubject.createMany({
                            data: refSubjects.map((subId: string) => ({
                                classroomId: targetClassroom.id,
                                subjectId: subId,
                                weeklyBlocks: 4,
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
                studentId: s.studentId,
                academicYearId: input.academicYearId,
                sectionSnapshot: s.currentSection || '',
                finalAverage: s.finalAverage,
                status: 'COMPLETED',
                finalResult: decision.finalResult,
                pendingSubjects: s.failedSubjects.map(f => f.name),
                subjectGrades: s.subjectGrades.map(sg => ({ subjectId: sg.subjectId, subjectName: sg.subjectName, average: sg.average, ...(sg.revision != null ? { revision: sg.revision, definitivaDeLapsos: sg.definitivaDeLapsos } : {}) })),
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

            records.push({ studentId: s.studentId, finalResult: decision.finalResult, assignedClassroomId: targetClassroomId ?? null });
            placements.push({ studentId: s.studentId, sectionId: targetClassroomId ?? null });
        }

        // Expedientes y matrículas, juntos.
        if (expedientes.length > 0) {
            await tx.academicRecord.createMany({ data: expedientes });
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

        // 4. Cerrar el año escolar actual
        await tx.academicYear.update({
            where: { id: input.academicYearId },
            data: { status: 'COMPLETED', isActive: false },
        });

        return { closed: true, records, placements };
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

    return {
        currentYear: { id: currentYear.id, name: currentYear.name },
        suggestions: suggestionsData.suggestions,
        destinationYears,
        suggestedNextYearName,
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
        isLastGrade: s.isLastGrade,
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
