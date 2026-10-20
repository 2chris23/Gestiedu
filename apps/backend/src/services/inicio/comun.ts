import { PrismaClient } from '@prisma/client';
import { gradesService } from '../grades.service';
import { bulkSubjectAveragesConDatos } from '../bulk-averages.service';
import { NOTAS_QUE_CUENTAN } from '../apreciaciones.service';

/**
 * QUÉ PERIODO SE MIRA: EL LAPSO EN CURSO, Y APARTE EL CICLO
 *
 * La asistencia y las observaciones se contaban **desde siempre**. Un alumno de
 * quinto año arrastraba sus cinco años en el mismo porcentaje: el número no
 * decía nada de cómo va ahora, y encima el trabajo crecía cada año que pasaba.
 *
 * Ahora se mira el lapso en curso —que es lo que le importa a un liceo— y se
 * ofrece aparte la cifra del ciclo completo.
 *
 * **Nada se deja de guardar.** Los años anteriores siguen enteros en la base y
 * en el expediente del alumno; lo único que cambia es qué se suma en el panel de
 * hoy.
 */
export interface Ventana {
    desde?: Date;
    hasta?: Date;
}

export interface VentanaDelAlumno {
    /** El lapso que corre hoy. Si no se puede saber, cae al ciclo. */
    lapso: Ventana;
    /** El ciclo escolar completo. */
    ciclo: Ventana;
    /** Los lapsos del ciclo, para acotar lo que se guarda por `periodId`. */
    lapsosDelCiclo: string[];
}

/** Convierte una ventana en un filtro de Prisma sobre el campo de fecha que sea. */
export function comoFecha(campo: string, v: Ventana): Record<string, unknown> {
    if (!v?.desde && !v?.hasta) return {};
    const rango: Record<string, Date> = {};
    if (v.desde) rango.gte = v.desde;
    if (v.hasta) rango.lte = v.hasta;
    return { [campo]: rango };
}

/**
 * Busca el lapso que contiene el día de hoy dentro del ciclo del alumno.
 *
 * Si ninguno lo contiene (vacaciones, por ejemplo) se usa el último que ya
 * empezó; y si tampoco hay, se usa el ciclo entero. Nunca devuelve vacío: una
 * ventana sin límites contaría desde siempre, que es justo lo que se corrige.
 */
export async function ventanaDelLapsoYCiclo(db: any, academicYearId: string | null): Promise<VentanaDelAlumno> {
    if (!academicYearId) return { lapso: {}, ciclo: {}, lapsosDelCiclo: [] };

    const anio = await db.academicYear.findUnique({
        where: { id: academicYearId },
        select: {
            startDate: true,
            endDate: true,
            periods: { select: { id: true, startDate: true, endDate: true }, orderBy: { startDate: 'asc' } },
        },
    });
    if (!anio) return { lapso: {}, ciclo: {}, lapsosDelCiclo: [] };

    const ciclo: Ventana = { desde: anio.startDate ?? undefined, hasta: anio.endDate ?? undefined };
    const lapsosDelCiclo: string[] = (anio.periods || []).map((p: any) => p.id).filter(Boolean);
    const hoy = new Date();

    const enCurso = (anio.periods || []).find(
        (p: any) => p.startDate && p.endDate && p.startDate <= hoy && hoy <= p.endDate
    );
    if (enCurso) return { lapso: { desde: enCurso.startDate, hasta: enCurso.endDate }, ciclo, lapsosDelCiclo };

    const yaEmpezados = (anio.periods || []).filter((p: any) => p.startDate && p.startDate <= hoy);
    const ultimo = yaEmpezados[yaEmpezados.length - 1];
    if (ultimo) return { lapso: { desde: ultimo.startDate, hasta: ultimo.endDate ?? undefined }, ciclo, lapsosDelCiclo };

    return { lapso: ciclo, ciclo, lapsosDelCiclo };
}

/** Porcentaje de asistencia en una ventana, y cuántos registros hay (0 = no hay dato que juzgar). */
export async function asistenciaEnLaVentana(db: any, studentId: string, v: Ventana): Promise<{ porcentaje: number; registros: number }> {
    const donde = { studentId, ...comoFecha('date', v) };
    const [total, presentes] = await Promise.all([
        db.dailyAttendance.count({ where: donde }),
        db.dailyAttendance.count({ where: { ...donde, status: { in: ['PRESENT', 'LATE'] } } }),
    ]);
    return { porcentaje: total > 0 ? (presentes * 100.0) / total : 0, registros: total };
}

/** Porcentaje de asistencia de un alumno dentro de una ventana de fechas. */
export async function porcentajeDeAsistencia(db: any, studentId: string, v: Ventana): Promise<number> {
    const donde = { studentId, ...comoFecha('date', v) };
    const [total, presentes] = await Promise.all([
        db.dailyAttendance.count({ where: donde }),
        db.dailyAttendance.count({ where: { ...donde, status: { in: ['PRESENT', 'LATE'] } } }),
    ]);
    return total > 0 ? (presentes * 100.0) / total : 0;
}

/**
 * Las materias del alumno en el ciclo, con su promedio (nivel 2) y si tiene
 * notas. Es EL cálculo del panel del alumno, y el del representante usa el
 * mismo: antes el representante veía la media a pelo de la tabla de notas
 * antigua —sin las de Clase en Vivo ni el plan— y le salía 0 a un hijo que iba
 * con 8 (REP-01).
 */
export async function materiasDelAlumnoConPromedio(
    db: any,
    userId: string,
    activeClassroomId: string | null,
    lapsosDelCiclo: string[]
): Promise<Array<{ subjectId: string; subjectName: string; subjectColor: string; average: number; conNotas: boolean }>> {
    // Solo las materias DE ESTE CICLO.
    //
    // Antes se sacaban las de todo su historial. Una materia de un año
    // anterior se colaba en el panel de hoy con promedio 0, y ese 0
    // parece un aplazado cuando en realidad significa "esta materia no
    // es de este año". No se pierde nada: los años anteriores siguen
    // enteros en la base y en el expediente del alumno.
    const grades = await db.grade.groupBy({
        by: ['subjectId'],
        where: {
            studentId: userId,
            ...NOTAS_QUE_CUENTAN,
            ...(lapsosDelCiclo.length > 0
                ? { periodId: { in: lapsosDelCiclo } }
                : {}),
        },
        _avg: { score: true }
    });
    const classActs = activeClassroomId
        ? await db.classActivity.findMany({
            where: { classroomId: activeClassroomId, scores: { not: undefined } },
            select: { subjectId: true, scores: true },
        })
        : [];
    const classActSubjectIds = new Set<string>();
    classActs.forEach((act: any) => {
        let parsed: Record<string, number | null> = {};
        try {
            parsed = typeof act.scores === 'string' ? JSON.parse(act.scores) : (act.scores || {});
        } catch { /* ignorar */ }
        if (parsed[userId] !== null && parsed[userId] !== undefined) classActSubjectIds.add(act.subjectId);
    });

    const subjectIds = [...new Set([...grades.map((g: any) => g.subjectId), ...classActSubjectIds])];
    const subjects = await db.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true, color: true, evaluacion: true } });

    /**
     * EN BLOQUE: EL MISMO NÚMERO, CON 4 CONSULTAS EN VEZ DE ~20 POR MATERIA
     *
     * Materia por materia, este panel —el que más se abre del
     * sistema— hacía unas 180 consultas en un alumno normal, y
     * crecía con cada materia. Con 500 personas a la vez su p99
     * llegó a 13 s. `bulkSubjectAverages` aplica las mismas reglas
     * (lo comprueba PANEL-02 contra el cálculo de siempre).
     */
    if (activeClassroomId && subjects.length > 0) {
        const enBloque = await bulkSubjectAveragesConDatos(db, {
            classroomId: activeClassroomId,
            studentIds: [userId],
            subjectIds: subjects.map((s: any) => s.id),
        });
        const suyos = enBloque.get(userId);
        return subjects.map((s: any) => ({
            subjectId: s.id,
            subjectName: s.name,
            subjectColor: s.color || '#666',
            average: suyos?.get(s.id)?.promedio ?? 0,
            conNotas: suyos?.get(s.id)?.conNotas ?? false,
            cualitativa: s.evaluacion === 'CUALITATIVA',
        }));
    }

    return Promise.all(subjects.map(async (s: any) => {
        // Se le pasan los lapsos ya sabidos: sin esto, cada materia
        // repetía la misma consulta para averiguarlos.
        const level2 = await gradesService.promedioDeLaMateria(
            db as PrismaClient,
            userId,
            s.id,
            undefined,
            lapsosDelCiclo
        );
        return {
            subjectId: s.id,
            subjectName: s.name,
            subjectColor: s.color || '#666',
            average: level2.promedio,
            conNotas: level2.conNotas,
            cualitativa: s.evaluacion === 'CUALITATIVA',
        };
    }));
}
