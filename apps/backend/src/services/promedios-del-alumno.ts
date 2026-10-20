/**
 * LOS PROMEDIOS DE UN ALUMNO (nivel 2 de `MAPA_DE_CALCULOS.md`)
 *
 * Salió de `grades.service.ts` (2.186 líneas) el 19-oct-2026: ahí quedan las
 * notas en sí (crear, cambiar, leer, la memoria rápida) y aquí cómo se
 * calcula el promedio de una materia y de un lapso. `GradesService` hereda de
 * esta clase, así que `gradesService.promedioDeLaMateria(...)` sigue igual.
 */
import { PrismaClient } from '@prisma/client';
import { RedisCache } from '../config/redis';
import { esCualitativa } from './apreciaciones.service';
import { fechaDeLaActividad, lapsoDeLaFecha, LapsoConFechas } from '../utils/lapso-de-la-actividad';
import { CACHE_TTL } from '../utils/constants';
import {
  calculateLapsoAverage,
  type CriterionInput,
  type CriterionActivityGrade,
} from '../utils/lapso-average';

export class PromediosDelAlumno {
  /**
   * Calcular promedio por materia de un estudiante usando el PROMEDIO PONDERADO
   * POR CRITERIO del plan de evaluación (escala 01-20).
   *
   * Nota del criterio = (promedio de notas normalizadas de sus actividades
   * calificadas ÷ 20) × puntos del criterio. Nota del lapso = Σ criterios.
   *
   * Fuentes de notas de una actividad del criterio:
   *  - Grade.score (0-20) vía activityId de la fila EVALUATION (plan editor).
   *  - ClassActivity.scores (0-maxScore) vinculadas por planRowId (clase en vivo).
   */
  async calculateSubjectAverage(
    prisma: PrismaClient,
    studentId: string,
    subjectId: string,
    periodId: string
  ): Promise<number> {
    return (await this.promedioDelLapso(prisma, studentId, subjectId, periodId)).promedio;
  }

  /**
   * EL PROMEDIO DEL LAPSO, Y SI DE VERDAD HAY NOTAS
   *
   * Un 0 es una nota. Quien no entregó nada y sacó 0 no es lo mismo que quien
   * todavía no tiene ninguna nota puesta, y el mapa de cálculos solo deja fuera
   * al segundo. Todo el sistema miraba `promedio > 0` para saber si había
   * notas, así que el alumno con todo en 0 pasaba por «sin calificar»: al cerrar
   * el ciclo salía promovido sin materia pendiente, no salía en riesgo, el
   * representante no recibía aviso, y un lapso en 0 no contaba en el ciclo
   * (0 y 16 daba 16). `conNotas` dice lo que el número solo no puede decir.
   * Pruebas: `funcional-notas-en-cero.test.ts` (CERO-01…07).
   */
  async promedioDelLapso(
    prisma: PrismaClient,
    studentId: string,
    subjectId: string,
    periodId: string
  ): Promise<{ promedio: number; conNotas: boolean }> {
    // Una materia con apreciación (Orientación, Grupos de Creación…) no entra
    // en ningún promedio: sale «sin notas», y todo lo de encima —la sección,
    // el año, el riesgo, el cierre— ya deja fuera lo que no tiene notas.
    if (await esCualitativa(prisma, subjectId)) return { promedio: 0, conNotas: false };

    const cacheKey = claveDelPromedioDelLapso(studentId, subjectId, periodId);

    const guardado = await RedisCache.get<{ promedio: number; conNotas: boolean } | number>(cacheKey);
    if (guardado !== null && guardado !== undefined) {
      // Lo guardado por la versión anterior era solo el número.
      if (typeof guardado === 'number') return { promedio: guardado, conNotas: guardado > 0 };
      return guardado;
    }

    let average: number;
    {
      const criteria = await this.buildCriteriaForStudent(prisma, studentId, subjectId, periodId);
      const result = calculateLapsoAverage(criteria);

      // ============================================================
      // NIVEL 2 DE LA JERARQUÍA — ESCALA 0-20 COMPLETA:
      // calculateLapsoAverage suma las notas de los criterios CALIFICADOS.
      // Si la parte calificada del plan no cubre la escala completa (puntos
      // de criterios con nota < 20), se escala a 20:
      //   promedio = total × (20 ÷ puntos_de_criterios_con_nota)
      // Una única nota de 20/20 en un criterio de 4 pts → 4 × (20/4) = 20,
      // que es exactamente lo que debe reflejarse en cascada (Niveles 3-6).
      // Un plan COMPLETO y calificado (Σ=20) no cambia: 20 × 1 = 20.
      // ============================================================
      const gradedPts = criteria
        .filter(c => c.activities.some(a => a.score !== null && a.score !== undefined && !Number.isNaN(a.score)))
        .reduce((s, c) => s + (c.puntos || 0), 0);
      // Se escala a 20 siempre que lo calificado no sean justo 20 puntos: con
      // un solo plan nunca pasa de 20, pero el alumno que se cambió de sección
      // junta criterios de dos planes y puede pasar (SEC-04).
      average = gradedPts > 0 && Math.abs(gradedPts - 20) > 0.009
        ? result.total * (20 / gradedPts)
        : result.total;
      average = Math.round(average * 100) / 100;

      let detalle = { promedio: average, conNotas: result.gradedActivities > 0 };
      // EL LAPSO QUE CURSÓ EN OTRO LICEO: si llegó trasladado y aquí no tiene
      // notas de ese lapso, cuenta la que trajo (MAPA_DE_CALCULOS.md §1). Una
      // nota propia, aunque sea una sola, manda sobre la traída.
      if (!detalle.conNotas) {
        const traida = await (prisma as any).notaDeOtroPlantel.findUnique({
          where: { studentId_periodId_subjectId: { studentId, periodId, subjectId } },
          select: { nota: true },
        });
        if (traida) detalle = { promedio: traida.nota, conNotas: true };
      }
      // Cache por 10 minutos
      await RedisCache.set(cacheKey, detalle, DURACION_DEL_PROMEDIO_DEL_LAPSO);
      return detalle;
    }
  }

  /**
   * Público: calcula el promedio ponderado por criterio de un estudiante en una
   * materia. Si periodId se omite (modo "Todo el ciclo"):
   *  - FÓRMULA GLOBAL (documentada, Fase 3.5): promedio SIMPLE de los promedios
   *    N2 de los lapsos del aula del estudiante CON datos (>0). Un lapso sin
   *    notas no pesa (regla de exclusión de la Fase 2.5).
   *  - ANTES (pre-Fase 3.5) el modo global resolvía el PERIODO ACTIVO ÚNICO
   *    (o el primero) — documentado con el cambio (el "global" combinando
   *    lapsos era la intención del producto, no la implementación real).
   */
  /**
   * Promedio del alumno en una materia.
   *
   * Con `periodId` se calcula ese lapso. Sin él, se promedian todos los lapsos
   * del ciclo en curso.
   *
   * ─── POR QUÉ SE PUEDEN PASAR LOS LAPSOS DESDE FUERA ────────────────────────
   *
   * Quien llama suele pedir esto **una vez por materia**. Si cada llamada vuelve
   * a preguntar cuáles son los lapsos del alumno, con doce materias son doce
   * consultas idénticas para responder siempre lo mismo. El panel del estudiante
   * hacía exactamente eso.
   *
   * Si el que llama ya conoce los lapsos, los pasa y se ahorran todas.
   */
  async calculateWeightedSubjectAverage(
    prisma: PrismaClient,
    studentId: string,
    subjectId: string,
    periodId?: string,
    lapsosConocidos?: string[]
  ): Promise<number> {
    return (await this.promedioDeLaMateria(prisma, studentId, subjectId, periodId, lapsosConocidos)).promedio;
  }

  /**
   * Los lapsos del «modo global» de un alumno: los del año de su inscripción
   * activa. Es la consulta que `promedioDeLaMateria` hace si no se le pasan;
   * quien pide varias materias del mismo alumno la hace una vez con esto.
   */
  async lapsosDelAlumno(prisma: PrismaClient, studentId: string): Promise<string[]> {
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        studentClassrooms: {
          where: { isActive: true },
          take: 1,
          select: { classroom: { select: { academicYear: { select: { periods: { select: { id: true, name: true } } } } } } }
        }
      },
    });
    return (student?.studentClassrooms?.[0]?.classroom?.academicYear?.periods || []).map((p) => p.id);
  }

  /**
   * Lo mismo que `calculateWeightedSubjectAverage`, diciendo además si el
   * alumno tiene alguna nota en la materia. Sin eso, quien lo usa no puede
   * distinguir «sacó 0» de «no tiene notas» (ver `promedioDelLapso`).
   */
  async promedioDeLaMateria(
    prisma: PrismaClient,
    studentId: string,
    subjectId: string,
    periodId?: string,
    lapsosConocidos?: string[],
    redondeo?: 'MPPE' | 'NINGUNO'
  ): Promise<{ promedio: number; conNotas: boolean }> {
    // Con `redondeo: 'MPPE'` salen las DEFINITIVAS: cada lapso redondeado al
    // entero (0,50 o más sube) y la de la materia, de esas, redondeada otra vez.
    // Sin él, el promedio de siempre, a dos decimales (lo que se ve durante el año).
    const definitiva = (n: number) => (redondeo === 'MPPE' ? redondearComoElMPPE(n) : n);
    if (periodId) {
      const lapso = await this.promedioDelLapso(prisma, studentId, subjectId, periodId);
      return { ...lapso, promedio: definitiva(lapso.promedio) };
    }

    let lapsos = lapsosConocidos;

    if (!lapsos || lapsos.length === 0) {
      // Modo global: TODOS los lapsos con datos del aula del estudiante
      lapsos = await this.lapsosDelAlumno(prisma, studentId);
    }

    if (lapsos.length === 0) return { promedio: 0, conNotas: false };

    // Los lapsos no dependen unos de otros: se piden a la vez y no de uno en
    // uno. Con tres lapsos, eso es una espera en vez de tres.
    const promedios = await Promise.all(
      lapsos.map((id) => this.promedioDelLapso(prisma, studentId, subjectId, id))
    );

    // Un lapso SIN notas no pesa; uno con notas en 0, sí (antes: `avg > 0`).
    const sums = promedios.filter((p) => p.conNotas).map((p) => definitiva(p.promedio));
    if (sums.length === 0) return { promedio: 0, conNotas: false };
    const global = sums.reduce((a, b) => a + b, 0) / sums.length;
    return { promedio: definitiva(Math.round(global * 100) / 100), conNotas: true };
  }

  /**
   * Construye los criterios (filas/bloques EVALUATION del plan) con sus
   * actividades calificadas para un estudiante, listos para la función pura.
   */
  protected async buildCriteriaForStudent(
    prisma: PrismaClient,
    studentId: string,
    subjectId: string,
    periodId: string
  ): Promise<CriterionInput[]> {
    // 1. Lapso del período (Primer→1, Segundo→2, Tercer→3; fallback '1')
    const period = await prisma.period.findUnique({
      where: { id: periodId },
      select: { name: true, academicYearId: true },
    });
    const lapso = this.periodToLapso(period?.name);

    // Las secciones de las que salen sus criterios: la suya y las otras del
    // mismo ciclo donde tiene notas de esta materia (ver `seccionesDelAlumno`).
    const aulas = await this.seccionesDelAlumno(prisma, studentId, subjectId, periodId, period?.academicYearId);

    const whereClause: any = { subjectId, lapso, rowType: 'EVALUATION' };
    if (aulas.length > 0) {
      whereClause.classroomId = { in: aulas };
    }

    // 2. Filas EVALUATION del plan = criterios (solo las que tienen puntos > 0)
    const rows = await prisma.evaluationPlanRow.findMany({
      where: whereClause,
      select: {
        id: true,
        puntos: true,
        actividadEval: true,
        activityId: true,
      },
    });

    const criterios = rows.filter(r => (r.puntos || 0) > 0);
    if (criterios.length === 0) {
      const grades = await prisma.grade.findMany({
        where: { studentId, subjectId, periodId },
        select: { score: true },
      });
      const scores = grades.map(g => g.score).filter((s): s is number => s !== null);

      let activities: Array<{ score: number; maxScore: number }> =
        scores.map(score => ({ score, maxScore: 20 }));

      if (aulas.length > 0) {
        const [adHoc, lapsosDelCiclo] = await Promise.all([
          prisma.classActivity.findMany({
            where: {
              classroomId: { in: aulas },
              subjectId,
              scores: { not: undefined },
            },
            select: {
              maxScore: true,
              scores: true,
              dueDate: true,
              createdAt: true,
              classSession: { select: { date: true } },
              planRow: { select: { lapso: true, rowType: true } },
            },
          }),
          period?.academicYearId
            ? prisma.period.findMany({
                where: { academicYearId: period.academicYearId },
                select: { id: true, startDate: true, endDate: true },
              })
            : Promise.resolve([] as LapsoConFechas[]),
        ]);
        adHoc.forEach(ca => {
          // Solo las de ESTE lapso: la del criterio, por el lapso del
          // criterio; la suelta, por su fecha (LAP-01…03). Antes entraban
          // todas en todos los lapsos.
          const esDeEsteLapso = ca.planRow && ca.planRow.rowType === 'EVALUATION'
            ? ca.planRow.lapso === lapso
            : lapsosDelCiclo.length === 0 ||
              lapsoDeLaFecha(
                fechaDeLaActividad({ fechaDeLaClase: ca.classSession?.date, dueDate: ca.dueDate, createdAt: ca.createdAt }),
                lapsosDelCiclo
              ) === periodId;
          if (!esDeEsteLapso) return;
          let parsed: Record<string, number | null> = {};
          try {
            parsed = typeof ca.scores === 'string' ? JSON.parse(ca.scores) : (ca.scores || {});
          } catch { /* ignorar */ }
          const score = parsed[studentId];
          if (score !== undefined && score !== null) {
            activities.push({ score, maxScore: ca.maxScore ?? 20 });
          }
        });
      }

      return activities.length > 0 ? [{ puntos: 20, activities }] : [];
    }

    // 3. Notas por actividad de la fila (Grade vinculados al Activity del criterio)
    const rowsWithActivities = criterios.filter(r => r.activityId);
    const gradesByActivity = new Map<string, number[]>();
    if (rowsWithActivities.length > 0) {
      const grades = await prisma.grade.findMany({
        where: {
          studentId,
          activityId: { in: rowsWithActivities.map((r: any) => r.activityId) },
        },
        select: { activityId: true, score: true },
      });
      grades.forEach(g => {
        if (g.score === null) return;
        const list = gradesByActivity.get(g.activityId as string) || [];
        list.push(g.score);
        gradesByActivity.set(g.activityId as string, list);
      });
    }

    // 4. Actividades de Clase en Vivo vinculadas al criterio (planRowId)
    const rowIds = criterios.map((r: any) => r.id);
    const classActivities = rowIds.length > 0
      ? await prisma.classActivity.findMany({
          where: { planRowId: { in: rowIds }, scores: { not: undefined } },
          select: { planRowId: true, maxScore: true, scores: true },
        })
      : [];

    const scoresByRow = new Map<string, CriterionActivityGrade[]>();
    classActivities.forEach(ca => {
      const rowId = ca.planRowId as string;
      const list = scoresByRow.get(rowId) || [];
      let parsed: Record<string, number | null> = {};
      try {
        parsed = typeof ca.scores === 'string' ? JSON.parse(ca.scores) : (ca.scores || {});
      } catch { /* ignorar */ }
      const studentScore = parsed[studentId];
      if (studentScore !== undefined && studentScore !== null) {
        list.push({ score: studentScore, maxScore: ca.maxScore ?? 20 });
      }
      scoresByRow.set(rowId, list);
    });

    // 5. Ensamblar los criterios
    return criterios.map(r => {
      const activities: CriterionActivityGrade[] = [];
      if (r.activityId && gradesByActivity.has(r.activityId)) {
        gradesByActivity.get(r.activityId)!.forEach(score =>
          activities.push({ score, maxScore: 20 })
        );
      }
      const classActs = scoresByRow.get(r.id) || [];
      classActs.forEach(a => activities.push(a));
      return { puntos: r.puntos || 0, activities };
    });
  }

  /**
   * LAS SECCIONES DE LAS QUE SALEN LAS NOTAS DE UN ALUMNO EN UN LAPSO
   *
   * Se miraba SOLO su sección de ahora. Si se cambió de sección a mitad de
   * lapso, lo que sacó en la anterior —notas de verdad, puestas por su
   * profesor— dejaba de contar sin avisar: 18 en la A y 10 en la B daba 10
   * (SEC-04). Es de las quejas más repetidas de otros sistemas escolares.
   *
   * Ahora: su sección de ESE ciclo (activa o no; si hay varias, la activa) y
   * además las otras secciones del mismo ciclo donde tiene notas de esta
   * materia. Los criterios sin notas no pesan (el promedio se escala a lo
   * calificado), así que traer el plan de la anterior no cambia nada a quien
   * no se movió.
   *
   * Y el ciclo es el del LAPSO que se calcula: con dos inscripciones activas
   * (la de este año y la del que viene, inscrito por adelantado) se cogía una
   * cualquiera.
   */
  async seccionesDelAlumno(
    prisma: PrismaClient,
    studentId: string,
    subjectId: string,
    periodId: string,
    academicYearId?: string | null
  ): Promise<string[]> {
    const inscripciones = await prisma.studentClassroom.findMany({
      where: { studentId, ...(academicYearId ? { academicYearId } : { isActive: true }) },
      select: { classroomId: true, isActive: true },
    });
    const aulas = new Set<string>();
    const vigente = inscripciones.find((i) => i.isActive) ?? inscripciones[0];
    if (vigente) aulas.add(vigente.classroomId);

    if (academicYearId) {
      const conNotas = await prisma.$queryRaw<Array<{ classroomId: string }>>`
        SELECT DISTINCT ca."classroomId"
          FROM class_activities ca
          JOIN classrooms c ON c.id = ca."classroomId"
         WHERE ca."subjectId" = ${subjectId}
           AND c."academicYearId" = ${academicYearId}
           AND jsonb_typeof(ca.scores) = 'object'
           AND jsonb_typeof(ca.scores -> ${studentId}) = 'number'
        UNION
        SELECT DISTINCT r."classroomId"
          FROM evaluation_plan_rows r
          JOIN classrooms c2 ON c2.id = r."classroomId"
          JOIN grades g ON g."activityId" = r."activityId"
         WHERE r."subjectId" = ${subjectId}
           AND r."rowType" = 'EVALUATION'
           AND c2."academicYearId" = ${academicYearId}
           AND g."studentId" = ${studentId}
           AND g."subjectId" = ${subjectId}
           AND g.score IS NOT NULL`;
      conNotas.forEach((r) => r.classroomId && aulas.add(r.classroomId));
    }
    return [...aulas];
  }

  /** Mapea el nombre del período al lapso del plan (fallback '1'). */
  protected periodToLapso(periodName?: string | null): string {
    if (!periodName) return '1';
    const name = periodName.toLowerCase();
    if (name.includes('segundo') || name.includes('2do') || name.includes('2er') || name.includes('ii')) return '2';
    if (name.includes('tercer') || name.includes('3ro') || name.includes('3er') || name.includes('iii')) return '3';
    return '1';
  }

  /**
   * Limpiar cache de calificaciones
   */
}

/**
 * La llave del promedio de un lapso en la memoria rápida. La comparten
 * `promedioDelLapso` y el precalentado en bloque (`precalentar-promedios.service.ts`).
 */
export function claveDelPromedioDelLapso(studentId: string, subjectId: string, periodId: string): string {
  return `grade:avg:student:${studentId}:subject:${subjectId}:period:${periodId}`;
}

/** Lo que dura guardado el promedio de un lapso (`promedioDelLapso`). */
export const DURACION_DEL_PROMEDIO_DEL_LAPSO = CACHE_TTL.SHORT * 2;

/**
 * La regla del Reglamento General de la LOE: al calcular, una fracción de
 * 0,50 o más se lleva al entero inmediato superior. El `1e-9` es por la coma
 * flotante: 9,5 guardado como 9,4999999… también es 9,5.
 */
export function redondearComoElMPPE(n: number): number {
  return Math.floor(n + 0.5 + 1e-9);
}

