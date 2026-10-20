import { Prisma, PrismaClient } from '@prisma/client';
import { UserRole, ActivityType } from '../utils/prisma-enums';
import { AppErrors } from '../middleware/error.middleware';
import { RedisCache } from '../config/redis';
import { logger } from '../utils/logger';
import { CACHE_TTL, PAGINATION } from '../utils/constants';
import { invalidateStudentGradesCache, invalidateStudentsGradesCache } from '../utils/cache-invalidation';
import { isValidGrade } from '../utils/calculations';
import { PromediosDelAlumno, claveDelPromedioDelLapso, DURACION_DEL_PROMEDIO_DEL_LAPSO, redondearComoElMPPE } from './promedios-del-alumno';

// Se importan de aquí en todo el sistema: siguen saliendo de aquí.
export { claveDelPromedioDelLapso, DURACION_DEL_PROMEDIO_DEL_LAPSO, redondearComoElMPPE };

export interface CreateGradeData {
  score: number;
  comments?: string;
  studentId: string;
  activityId: string;
  periodId: string;
  subjectId: string;
  teacherId: string;
}

export interface UpdateGradeData {
  score?: number;
  comments?: string;
}

export interface GetGradesQuery {
  page?: number;
  limit?: number;
  search?: string;
  studentId?: string;
  subjectId?: string;
  periodId?: string;
  activityId?: string;
  teacherId?: string;
  classroomId?: string;
  minScore?: number;
  maxScore?: number;
  activityType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /**
   * Cédula del profesor que pide: solo salen las notas de sus clases (materia
   * que imparte en esa sección) y de sus secciones guía. Sin esto, cualquier
   * profesor listaba las notas de todo el liceo.
   */
  soloDelProfesor?: string;
}

export interface BulkGradeData {
  grades: CreateGradeData[];
}

export interface GradeStatistics {
  totalGrades: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
  distribution: {
    range: string;
    count: number;
    percentage: number;
  }[];
}

export interface GradeWithRelations {
  id: string;
  score: number;
  comments?: string;
  createdAt: Date;
  updatedAt: Date;
  student: {
    id: string;
    firstName: string;
    lastName: string;
  };
  activity: {
    id: string;
    title: string;
    type: string;
    maxGrade: number;
    weight: number;
  };
  period: {
    id: string;
    name: string;
  };
  subject: {
    id: string;
    name: string;
    code: string;
  };
  teacher: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

class GradesService extends PromediosDelAlumno {
  /**
   * Crear nueva calificación
   */
  async createGrade(prisma: PrismaClient, gradeData: CreateGradeData): Promise<GradeWithRelations> {
    const {
      score,
      comments,
      studentId,
      activityId,
      periodId,
      subjectId,
      teacherId } = gradeData;

    // Validar que la calificación esté en el rango correcto (0-20)
    if (!isValidGrade(score)) {
      throw AppErrors.InvalidGrade();
    }

    // Verificar que el estudiante, actividad, período y materia existen
    const [student, activity, period, subject, teacher] = await Promise.all([
      prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, firstName: true, lastName: true, role: true }
      }),
      prisma.activity.findUnique({
        where: { id: activityId },
        select: { id: true, title: true, type: true, maxGrade: true, weight: true, classroomId: true, subjectId: true }
      }),
      prisma.period.findUnique({
        where: { id: periodId },
        select: { id: true, name: true }
      }),
      prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true, name: true, code: true }
      }),
      prisma.user.findUnique({
        where: { id: teacherId },
        select: { id: true, firstName: true, lastName: true, role: true }
      })
    ]);

    if (!student) {
      throw AppErrors.UserNotFound();
    }
    if (student.role !== UserRole.STUDENT) {
      throw AppErrors.BadRequest('El usuario indicado no es un estudiante');
    }
    if (!activity) {
      throw AppErrors.NotFound('Actividad no encontrada');
    }
    if (!period) {
      throw AppErrors.NotFound('Período no encontrado');
    }
    if (!subject) {
      throw AppErrors.NotFound('Materia no encontrada');
    }
    if (!teacher) {
      throw AppErrors.NotFound('Profesor no encontrado');
    }
    if (teacher.role !== UserRole.TEACHER) {
      throw AppErrors.BadRequest('El usuario indicado no es un profesor');
    }

    // SEGURIDAD/AUTORIZACIÓN: Si la actividad pertenece a un aula, verificar que
    // (a) el estudiante esté inscrito en esa aula y (b) el profesor imparta la
    // materia en esa aula. Si la actividad no tiene aula explícita, resolver el
    // aula activa del estudiante para evitar el bypass de alcance (grades-null-classroom-scope-bypass).
    const targetClassroomId = activity.classroomId || (await prisma.studentClassroom.findFirst({
      where: {
        studentId,
        isActive: true,
      },
      select: { classroomId: true },
    }))?.classroomId;

    if (targetClassroomId) {
      if (activity.classroomId) {
        const enrollment = await prisma.studentClassroom.findFirst({
          where: {
            studentId,
            classroomId: activity.classroomId,
            isActive: true,
          },
          select: { id: true },
        });

        if (!enrollment) {
          throw AppErrors.Forbidden(
            'El estudiante no pertenece al aula de la actividad'
          );
        }
      }

      const teachingAssignment = await prisma.classroomSubject.findFirst({
        where: {
          classroomId: targetClassroomId,
          subjectId: activity.subjectId || subjectId,
          teacherId,
        },
        select: { id: true },
      });

      if (!teachingAssignment) {
        throw AppErrors.Forbidden(
          'El profesor no imparte esta materia en el aula de la actividad'
        );
      }
    } else {
      const hasSubjectAssignment = await prisma.classroomSubject.findFirst({
        where: {
          subjectId: activity.subjectId || subjectId,
          teacherId,
        },
        select: { id: true },
      });

      if (!hasSubjectAssignment) {
        throw AppErrors.Forbidden(
          'El profesor no tiene asignada esta materia'
        );
      }
    }

    // Verificar que no exista ya una calificación para esta actividad y estudiante
    const existingGrade = await prisma.grade.findUnique({
      where: {
        studentId_activityId: {
          studentId,
          activityId
        }
      }
    });

    if (existingGrade) {
      throw AppErrors.Conflict('Ya existe una calificación para esta actividad y estudiante');
    }

    // Crear calificación
    const grade = await prisma.grade.create({
      data: {
        score,
        comments,
        student: { connect: { id: studentId } },
        activity: { connect: { id: activityId } },
        period: { connect: { id: periodId } },
        subject: { connect: { id: subjectId } },
        teacher: { connect: { id: teacherId } }
      }
    });

    // Limpiar cache interno del service
    await this.clearGradeCache(studentId, subjectId, periodId);

    // Invalidar cache HTTP del sistema de cache diferenciado
    // Necesita instituteId del estudiante para invalidar correctamente
    const studentForInstitute = await prisma.user.findUnique({
      where: { id: studentId },
      select: { instituteId: true },
    });
    if (studentForInstitute?.instituteId) {
      await invalidateStudentGradesCache(studentForInstitute.instituteId, studentId);
    }

    // Obtener calificación completa
    return this.getGradeById(prisma, grade.id);
  }

  /**
   * GUARDAR LAS NOTAS DE UNA SECCIÓN DE UNA VEZ
   *
   * Es lo que hace el profesor después de cada clase: pulsa "guardar" una sola
   * vez con las notas de sus treinta alumnos dentro. Era **lo más lento del
   * sistema entero**: 266 ms medidos para 29 alumnos, 9,2 ms por alumno.
   *
   * ─── POR QUÉ TARDABA TANTO ───────────────────────────────────────────────
   *
   * Se guardaban de una en una llamando a `createGrade`, y `createGrade`
   * comprueba **diez cosas contra la base por cada nota**. De esas diez, seis
   * son EXACTAMENTE LAS MISMAS para todas las notas de la tanda: la actividad,
   * el lapso, la materia, el profesor, y que ese profesor imparta esa materia
   * en esa sección. No cambian de un alumno al siguiente, y se preguntaban
   * veintinueve veces.
   *
   * Contadas: unas 300 consultas para guardar 29 notas.
   *
   * Y encima, tirar las copias guardadas se hacía por alumno, y cada limpieza
   * recorre **todas** las claves guardadas: 87 recorridos completos por un solo
   * "guardar".
   *
   * ─── LO QUE SE HACE AHORA ────────────────────────────────────────────────
   *
   * Lo que es común se pregunta una vez. Lo que varía por alumno se pregunta
   * para todos de golpe: una consulta para los alumnos, una para las
   * inscripciones, una para ver si alguna nota ya estaba puesta. Las notas se
   * escriben juntas, y las copias se tiran de una pasada.
   *
   * De unas 300 consultas a ocho, sin importar cuántos alumnos haya.
   *
   * ─── LO QUE NO CAMBIA ────────────────────────────────────────────────────
   *
   * Se comprueba exactamente lo mismo que antes, y con el mismo resultado:
   *
   *   - que la nota esté en el rango permitido;
   *   - que el alumno exista, sea alumno, y **esté inscrito en la sección de la
   *     actividad** (no se le puede poner nota a un alumno de otra sección);
   *   - que el profesor imparta esa materia en esa sección;
   *   - que no hubiera ya una nota puesta.
   *
   * Y sigue siendo **todas o ninguna**: si una fila falla, no se guarda nada y
   * se dice cuál es. Lo vigilan RES-04 y RES-10.
   */
  async createGradesBatch(
    prisma: PrismaClient,
    filas: CreateGradeData[]
  ): Promise<GradeWithRelations[]> {
    if (filas.length === 0) return [];

    const fallo = (i: number, error: Error, statusCode: number, code: string) =>
      Object.assign(error, { statusCode, code, fila: i, studentId: filas[i].studentId });

    // ── 1. El rango de cada nota, que no necesita tocar la base ─────────────
    for (let i = 0; i < filas.length; i++) {
      if (!isValidGrade(filas[i].score as any)) {
        throw fallo(i, AppErrors.InvalidGrade(), 400, 'NOTA_INVALIDA');
      }
    }

    // ── 2. Lo que es común a toda la tanda: se pregunta UNA vez ─────────────
    const actividadesPedidas = Array.from(new Set(filas.map((f) => f.activityId)));
    const lapsosPedidos = Array.from(new Set(filas.map((f) => f.periodId)));
    const materiasPedidas = Array.from(new Set(filas.map((f) => f.subjectId)));
    const profesoresPedidos = Array.from(new Set(filas.map((f) => f.teacherId)));

    const [actividades, lapsos, materias, profesores, alumnos] = await Promise.all([
      prisma.activity.findMany({
        where: { id: { in: actividadesPedidas } },
        select: { id: true, classroomId: true, subjectId: true },
      }),
      prisma.period.findMany({ where: { id: { in: lapsosPedidos } }, select: { id: true } }),
      prisma.subject.findMany({ where: { id: { in: materiasPedidas } }, select: { id: true } }),
      prisma.user.findMany({
        where: { id: { in: profesoresPedidos } },
        select: { id: true, role: true },
      }),
      prisma.user.findMany({
        where: { id: { in: Array.from(new Set(filas.map((f) => f.studentId))) } },
        select: { id: true, role: true, instituteId: true },
      }),
    ]);

    const porId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const actividadDe = porId(actividades);
    const lapsoDe = porId(lapsos);
    const materiaDe = porId(materias);
    const profesorDe = porId(profesores);
    const alumnoDe = porId(alumnos);

    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      if (!alumnoDe.has(f.studentId)) throw fallo(i, AppErrors.UserNotFound(), 404, 'ALUMNO_NO_ENCONTRADO');
      if (alumnoDe.get(f.studentId)!.role !== UserRole.STUDENT) {
        throw fallo(i, AppErrors.BadRequest('El usuario indicado no es un estudiante'), 400, 'NO_ES_ALUMNO');
      }
      if (!actividadDe.has(f.activityId)) {
        throw fallo(i, AppErrors.NotFound('Actividad no encontrada'), 404, 'ACTIVIDAD_NO_ENCONTRADA');
      }
      if (!lapsoDe.has(f.periodId)) {
        throw fallo(i, AppErrors.NotFound('Período no encontrado'), 404, 'LAPSO_NO_ENCONTRADO');
      }
      if (!materiaDe.has(f.subjectId)) {
        throw fallo(i, AppErrors.NotFound('Materia no encontrada'), 404, 'MATERIA_NO_ENCONTRADA');
      }
      if (!profesorDe.has(f.teacherId)) {
        throw fallo(i, AppErrors.NotFound('Profesor no encontrado'), 404, 'PROFESOR_NO_ENCONTRADO');
      }
      if (profesorDe.get(f.teacherId)!.role !== UserRole.TEACHER) {
        throw fallo(i, AppErrors.BadRequest('El usuario indicado no es un profesor'), 400, 'NO_ES_PROFESOR');
      }
    }

    // ── 3. Permisos de la sección: una consulta para todos ──────────────────
    const alumnosSinClassroomDirecto = filas
      .filter((f) => !actividadDe.get(f.activityId)?.classroomId)
      .map((f) => f.studentId);

    const inscripcionesActivas = alumnosSinClassroomDirecto.length > 0
      ? await prisma.studentClassroom.findMany({
          where: {
            studentId: { in: Array.from(new Set(alumnosSinClassroomDirecto)) },
            isActive: true,
          },
          select: { studentId: true, classroomId: true },
        })
      : [];

    const aulaActivaAlumno = new Map(inscripcionesActivas.map((x) => [x.studentId, x.classroomId]));

    const filasConAula = filas.map((f, i) => {
      const actividad = actividadDe.get(f.activityId)!;
      const targetClassroomId = actividad.classroomId || aulaActivaAlumno.get(f.studentId);
      return { i, f, actividad, targetClassroomId };
    });

    const seccionesTocadas = Array.from(
      new Set(filasConAula.map((x) => x.targetClassroomId).filter((x): x is string => Boolean(x)))
    );
    const alumnosTocados = Array.from(new Set(filasConAula.map((x) => x.f.studentId)));

    const [inscripciones, asignaciones, asignacionesMateria] = await Promise.all([
      prisma.studentClassroom.findMany({
        where: {
          studentId: { in: alumnosTocados },
          classroomId: { in: seccionesTocadas },
          isActive: true,
        },
        select: { studentId: true, classroomId: true },
      }),
      prisma.classroomSubject.findMany({
        where: {
          classroomId: { in: seccionesTocadas },
          teacherId: { in: profesoresPedidos.filter((x): x is string => Boolean(x)) },
        },
        select: { classroomId: true, subjectId: true, teacherId: true },
      }),
      prisma.classroomSubject.findMany({
        where: {
          subjectId: { in: materiasPedidas },
          teacherId: { in: profesoresPedidos.filter((x): x is string => Boolean(x)) },
        },
        select: { subjectId: true, teacherId: true },
      }),
    ]);

    const inscrito = new Set(inscripciones.map((x) => `${x.studentId}|${x.classroomId}`));
    const imparte = new Set(asignaciones.map((x) => `${x.classroomId}|${x.subjectId}|${x.teacherId}`));
    const imparteMateriaGeneral = new Set(asignacionesMateria.map((x) => `${x.subjectId}|${x.teacherId}`));

    for (const { i, f, actividad, targetClassroomId } of filasConAula) {
      const materiaDeLaActividad = actividad.subjectId || f.subjectId;

      if (targetClassroomId) {
        if (actividad.classroomId && !inscrito.has(`${f.studentId}|${actividad.classroomId}`)) {
          throw fallo(
            i,
            AppErrors.Forbidden('El estudiante no pertenece al aula de la actividad'),
            403,
            'ALUMNO_DE_OTRA_SECCION'
          );
        }
        if (!imparte.has(`${targetClassroomId}|${materiaDeLaActividad}|${f.teacherId}`)) {
          throw fallo(
            i,
            AppErrors.Forbidden('El profesor no imparte esta materia en el aula de la actividad'),
            403,
            'NO_IMPARTE_LA_MATERIA'
          );
        }
      } else {
        if (!imparteMateriaGeneral.has(`${materiaDeLaActividad}|${f.teacherId}`)) {
          throw fallo(
            i,
            AppErrors.Forbidden('El profesor no tiene asignada esta materia'),
            403,
            'NO_IMPARTE_LA_MATERIA'
          );
        }
      }
    }

    // ── 4. ¿Alguna estaba ya puesta? Una consulta para todas ────────────────
    const yaPuestas = await prisma.grade.findMany({
      where: {
        OR: filas.map((f) => ({ studentId: f.studentId, activityId: f.activityId })),
      },
      select: { studentId: true, activityId: true },
    });
    const yaEstaba = new Set(yaPuestas.map((g) => `${g.studentId}|${g.activityId}`));

    for (let i = 0; i < filas.length; i++) {
      if (yaEstaba.has(`${filas[i].studentId}|${filas[i].activityId}`)) {
        throw fallo(i, new Error('Ya existe una calificación para esta actividad'), 409, 'NOTA_REPETIDA');
      }
    }

    // Y que la misma tanda no traiga dos veces al mismo alumno: sin esto, la
    // segunda chocaría contra la primera dentro de la propia escritura.
    const vistas = new Set<string>();
    for (let i = 0; i < filas.length; i++) {
      const clave = `${filas[i].studentId}|${filas[i].activityId}`;
      if (vistas.has(clave)) {
        throw fallo(i, new Error('Ya existe una calificación para esta actividad'), 409, 'NOTA_REPETIDA');
      }
      vistas.add(clave);
    }

    // ── 5. Se escriben todas juntas ─────────────────────────────────────────
    await prisma.grade.createMany({
      data: filas.map((f) => ({
        score: f.score as any,
        comments: f.comments,
        studentId: f.studentId,
        activityId: f.activityId,
        periodId: f.periodId,
        subjectId: f.subjectId,
        teacherId: f.teacherId,
      })),
    });

    // ── 6. Las copias guardadas se tiran de una pasada ──────────────────────
    await this.clearGradeCacheBatch(
      filas.map((f) => f.studentId),
      filas.map((f) => f.subjectId),
      filas.map((f) => f.periodId)
    );

    const liceo = alumnos.find((a) => a.instituteId)?.instituteId;
    if (liceo) {
      await invalidateStudentsGradesCache(liceo, alumnos.map((a) => a.id));
    }

    // ── 7. Se devuelven como las devolvía antes ─────────────────────────────
    //
    // En una sola consulta, no una por nota. Pidiéndolas de una en una
    // (`getGradeById`) volvían las veintinueve consultas por la puerta de
    // atrás, justo después de haberlas quitado por delante. Medido: 81 → 74 ms.
    const puestas = await prisma.grade.findMany({
      where: { OR: filas.map((f) => ({ studentId: f.studentId, activityId: f.activityId })) },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        activity: { select: { id: true, title: true, type: true, maxGrade: true, weight: true } },
        period: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return puestas as unknown as GradeWithRelations[];
  }

  /**
   * Obtener calificación por ID
   */
  async getGradeById(prisma: PrismaClient, id: string): Promise<GradeWithRelations> {
    const grade = await prisma.grade.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        activity: {
          select: {
            id: true,
            title: true,
            type: true,
            maxGrade: true,
            weight: true
          }
        },
        period: {
          select: {
            id: true,
            name: true
          }
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!grade) {
      throw new Error('Calificación no encontrada');
    }

    // @ts-expect-error Prisma return type structurally matches GradeWithRelations at runtime
    return grade;
  }

  /**
   * Obtener lista de calificaciones con filtros avanzados
   */
  async getGrades(prisma: PrismaClient, query: GetGradesQuery): Promise<{
    grades: GradeWithRelations[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
    filters: {
      search?: string;
      appliedFilters: string[];
    };
  }> {
    try {
      const {
        page = PAGINATION.DEFAULT_PAGE,
        limit = Math.min(query.limit || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT),
        search,
        studentId,
        subjectId,
        periodId,
        activityId,
        teacherId,
        classroomId,
        minScore,
        maxScore,
        activityType,
        dateFrom,
        dateTo,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        soloDelProfesor } = query;

      const offset = (page - 1) * limit;
      const appliedFilters: string[] = [];

      // Construir filtros where clause
      const where: Prisma.GradeWhereInput = {};

      // Filtros específicos

      if (studentId) {
        where.studentId = studentId;
        appliedFilters.push('student');
      }

      if (subjectId) {
        where.subjectId = subjectId;
        appliedFilters.push('subject');
      }

      if (periodId) {
        where.periodId = periodId;
        appliedFilters.push('period');
      }

      if (activityId) {
        where.activityId = activityId;
        appliedFilters.push('activity');
      }

      if (teacherId) {
        where.teacherId = teacherId;
        appliedFilters.push('teacher');
      }

      // Filtro por aula (requiere subconsulta)
      if (classroomId) {
        const studentFilter: Prisma.UserWhereInput = (where.student as Prisma.UserWhereInput) || {};
        where.student = {
          ...studentFilter,
          studentClassrooms: {
            some: {
              classroomId,
              isActive: true
            }
          }
        } as Prisma.UserWhereInput;
        appliedFilters.push('classroom');
      }

      if (soloDelProfesor) {
        const [materias, guia] = await Promise.all([
          prisma.classroomSubject.findMany({
            where: { teacherId: soloDelProfesor },
            select: { classroomId: true, subjectId: true },
          }),
          prisma.classroom.findMany({ where: { teacherId: soloDelProfesor }, select: { id: true } }),
        ]);
        const suyas: Prisma.GradeWhereInput[] = [
          ...materias.map((m) => ({ subjectId: m.subjectId, activity: { classroomId: m.classroomId } })),
          // Actividades sin sección: las de las materias que imparte.
          ...(materias.length > 0
            ? [{ subjectId: { in: materias.map((m) => m.subjectId) }, activity: { classroomId: null } }]
            : []),
          ...(guia.length > 0 ? [{ activity: { classroomId: { in: guia.map((g) => g.id) } } }] : []),
        ];
        where.AND = [{ OR: suyas.length > 0 ? suyas : [{ id: '__ninguna__' }] }];
        appliedFilters.push('teacherScope');
      }

      // Filtro por rango de calificación
      if (minScore !== undefined || maxScore !== undefined) {
        where.score = {};
        if (minScore !== undefined) {
          where.score.gte = minScore;
          appliedFilters.push('minScore');
        }
        if (maxScore !== undefined) {
          where.score.lte = maxScore;
          appliedFilters.push('maxScore');
        }
      }

      // Filtro por tipo de actividad
      if (activityType) {
        // Validar y convertir a enum ActivityType
        const typeEnum = (ActivityType as any)[activityType as keyof typeof ActivityType] as ActivityType | undefined;
        if (typeEnum) {
          where.activity = { type: typeEnum } as any;
          appliedFilters.push('activityType');
        }
      }

      // Filtro por rango de fechas
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) {
          where.createdAt.gte = dateFrom;
          appliedFilters.push('dateFrom');
        }
        if (dateTo) {
          where.createdAt.lte = dateTo;
          appliedFilters.push('dateTo');
        }
      }

      // Búsqueda de texto
      if (search && search.trim()) {
        const searchTerm = search.trim();
        where.OR = [
          {
            student: {
              OR: [
                { firstName: { contains: searchTerm } },
                { lastName: { contains: searchTerm } }
              ]
            }
          },
          {
            subject: {
              OR: [
                { name: { contains: searchTerm } },
                { code: { contains: searchTerm } }
              ]
            }
          },
          {
            activity: {
              title: { contains: searchTerm }
            }
          },
          {
            teacher: {
              OR: [
                { firstName: { contains: searchTerm } },
                { lastName: { contains: searchTerm } }
              ]
            }
          },
          {
            comments: { contains: searchTerm }
          }
        ];
        appliedFilters.push('search');
      }

      // Validar campo de ordenamiento
      const validSortFields = ['createdAt', 'updatedAt', 'score'];
      const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

      // Intentar obtener del cache primero - clave compacta y determinística
      const keyParts = [
        'grades:list',
        `stu:${studentId || '-'}`,
        `sub:${subjectId || '-'}`,
        `per:${periodId || '-'}`,
        `act:${activityId || '-'}`,
        `tch:${teacherId || '-'}`,
        `cls:${classroomId || '-'}`,
        `min:${minScore ?? '-'}`,
        `max:${maxScore ?? '-'}`,

        `typ:${activityType || '-'}`,
        `df:${dateFrom ? Number(new Date(dateFrom)) : '-'}`,
        `dt:${dateTo ? Number(new Date(dateTo)) : '-'}`,
        `pg:${page}`,
        `lm:${limit}`,
        `sb:${finalSortBy}`,
        `so:${sortOrder}`,
        `prof:${soloDelProfesor || '-'}`
      ];
      const cacheKey = keyParts.join('|');
      let cachedResult = await RedisCache.get<any>(cacheKey);

      if (!cachedResult) {
        // Contar total
        const total = await prisma.grade.count({ where });

        // Obtener calificaciones
        const grades = await prisma.grade.findMany({
          where,
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            },
            activity: {
              select: {
                id: true,
                title: true,
                type: true,
                maxGrade: true,
                weight: true
              }
            },
            period: {
              select: {
                id: true,
                name: true
              }
            },
            subject: {
              select: {
                id: true,
                name: true,
                code: true
              }
            },
            teacher: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: {
            [finalSortBy]: sortOrder
          },
          skip: offset,
          take: limit
        });

        cachedResult = {
          grades,
          total
        };

        // Cache por 5 minutos para listas
        await RedisCache.set(cacheKey, cachedResult, CACHE_TTL.SHORT);
      }

      const { grades, total } = cachedResult;

      logger.info('Grades retrieved successfully', {
        total,
        page,
        limit,
        appliedFilters
      });

      return {
        grades,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        filters: {
          search,
          appliedFilters
        }
      };
    } catch (error) {
      logger.error('Error retrieving grades', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query
      });
      throw new Error('Error al obtener calificaciones');
    }
  }

  /**
   * Actualizar calificación
   */
  async updateGrade(prisma: PrismaClient, id: string, updateData: UpdateGradeData): Promise<GradeWithRelations> {
    const { score, comments } = updateData;

    // Validar nueva calificación si se proporciona
    if (score !== undefined && !isValidGrade(score)) {
      throw AppErrors.InvalidGrade();
    }

    // Verificar que la calificación existe
    const existingGrade = await prisma.grade.findUnique({
      where: { id },
      select: { id: true, studentId: true, subjectId: true, periodId: true }
    });

    if (!existingGrade) {
      throw new Error('Calificación no encontrada');
    }

    // Actualizar calificación
    await prisma.grade.update({
      where: { id },
      data: {
        ...(score !== undefined && { score }),
        ...(comments !== undefined && { comments })
      }
    });

    // Limpiar cache relacionado
    await this.clearGradeCache(
      existingGrade.studentId,
      existingGrade.subjectId,
      existingGrade.periodId
    );

    return this.getGradeById(prisma, id);
  }

  /**
   * LO MISMO QUE `clearGradeCache`, PERO PARA UNA TANDA ENTERA
   *
   * `clearGradeCache` hace **cinco recorridos completos** de las claves
   * guardadas cada vez que se llama. Llamándola por alumno para las 29 notas de
   * una sección salían **145 recorridos** por un solo "guardar" del profesor.
   *
   * Es la tercera vez que aparece el mismo fallo en este sistema —borrar de uno
   * en uno lo que se puede borrar de una pasada— así que aquí se hace de una.
   *
   * Sin Redis levantado apenas se nota (las copias están en memoria). Con Redis
   * y un liceo lleno, 145 recorridos del almacén por cada tanda de notas es lo
   * que convierte "guardar" en "esperar".
   */
  private async clearGradeCacheBatch(
    studentIds: string[],
    subjectIds: string[],
    periodIds: string[]
  ): Promise<void> {
    try {
      const alumnos = Array.from(new Set(studentIds));
      const materias = Array.from(new Set(subjectIds));
      const lapsos = Array.from(new Set(periodIds));

      const patrones: string[] = ['grades:list:*', 'grades:stats:*'];

      for (const studentId of alumnos) {
        patrones.push(`grades:student:${studentId}:*`);
        for (const periodId of lapsos) {
          patrones.push(`grade:avg:student:${studentId}:global:period:${periodId}`);
          for (const subjectId of materias) {
            patrones.push(`grade:avg:student:${studentId}:subject:${subjectId}:period:${periodId}`);
          }
        }
      }

      for (const periodId of lapsos) {
        patrones.push(`grade:avg:classroom:*:global:period:${periodId}`);
        for (const subjectId of materias) {
          patrones.push(`grade:avg:classroom:*:subject:${subjectId}:period:${periodId}`);
        }
      }

      await RedisCache.clearPatterns(patrones);

      logger.debug('Cache de notas limpiado en tanda', {
        alumnos: alumnos.length,
        materias: materias.length,
        lapsos: lapsos.length,
      });
    } catch (error) {
      logger.warn('Error limpiando el cache de notas en tanda', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async clearGradeCache(
    studentId: string,
    subjectId: string,
    periodId: string
  ): Promise<void> {
    try {
      // Limpiar cache del estudiante
      await RedisCache.del(`grade:avg:student:${studentId}:subject:${subjectId}:period:${periodId}`);
      await RedisCache.del(`grade:avg:student:${studentId}:global:period:${periodId}`);

      // Limpiar cache de aulas relacionadas
      await RedisCache.clearPattern(`grade:avg:classroom:*:subject:${subjectId}:period:${periodId}`);
      await RedisCache.clearPattern(`grade:avg:classroom:*:global:period:${periodId}`);

      // Limpiar cache de listas y estadísticas
      await RedisCache.clearPattern(`grades:list:*`);
      await RedisCache.clearPattern(`grades:stats:*`);
      await RedisCache.clearPattern(`grades:student:${studentId}:*`);

      logger.debug('Grade cache cleared', {
        studentId,
        subjectId,
        periodId
      });
    } catch (error) {
      logger.warn('Error clearing grade cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        studentId,
        subjectId,
        periodId
      });
    }
  }
}

export const gradesService = new GradesService();
export default gradesService;
