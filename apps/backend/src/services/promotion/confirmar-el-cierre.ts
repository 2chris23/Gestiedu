import { SuggestionStatus, gradoDeDestino, StudentSuggestion, egresoDe, prepareClose, CloseConfirmInput, CloseConfirmResult, profesorParaLaPendiente } from './close-cycle.service';
import { Assignment } from './strategies';
import { borrarGuardandoCopia, QuienBorra } from '../../utils/papelera';
import { nombreDeLaSeccion, slugDeLaSeccion } from '../../utils/nombre-de-la-seccion';
import { asignarLasClases } from './clase-de-la-pendiente';

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
                // Cada una a su clase (si el año siguiente ya tiene sus clases armadas).
                await asignarLasClases(tx, nextAcademicYear.id);
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
