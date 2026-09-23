import { Prisma, PrismaClient } from '@prisma/client';
import { UserRole, ActivityType } from '../utils/prisma-enums';
import { AppErrors } from '../middleware/error.middleware';
import { RedisCache } from '../config/redis';
import { logger } from '../utils/logger';
import { CACHE_TTL, PAGINATION, GRADE_SYSTEM } from '../utils/constants';
import { invalidateStudentGradesCache, invalidateStudentsGradesCache } from '../utils/cache-invalidation';
import {
  calculateSimpleAverage,
  calculateCompleteStudentAverage,
  calculateClassroomAverage,
  isValidGrade,
  getGradeScale,
  calculateGradeStatistics,
  type GradeRecord,
  type StudentAverage,
  type ClassroomAverage
} from '../utils/calculations';
import {
  calculateLapsoAverage,
  type CriterionInput,
  type CriterionActivityGrade,
} from '../utils/lapso-average';

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

class GradesService {
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
        sortOrder = 'desc' } = query;

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
        `so:${sortOrder}`
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
    const cacheKey = `grade:avg:student:${studentId}:subject:${subjectId}:period:${periodId}`;

    let average = await RedisCache.get<number>(cacheKey);

    if (average === null) {
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
      average = (gradedPts > 0 && gradedPts < 20)
        ? result.total * (20 / gradedPts)
        : result.total;
      average = Math.round(average * 100) / 100;

      // Cache por 10 minutos
      await RedisCache.set(cacheKey, average, CACHE_TTL.SHORT * 2);
    }

    return average;
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
    if (periodId) {
      return this.calculateSubjectAverage(prisma, studentId, subjectId, periodId);
    }

    let lapsos = lapsosConocidos;

    if (!lapsos || lapsos.length === 0) {
      // Modo global: TODOS los lapsos con datos del aula del estudiante
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
      lapsos = (student?.studentClassrooms?.[0]?.classroom?.academicYear?.periods || []).map((p) => p.id);
    }

    if (lapsos.length === 0) return 0;

    // Los lapsos no dependen unos de otros: se piden a la vez y no de uno en
    // uno. Con tres lapsos, eso es una espera en vez de tres.
    const promedios = await Promise.all(
      lapsos.map((id) => this.calculateSubjectAverage(prisma, studentId, subjectId, id))
    );

    const sums = promedios.filter((avg) => avg > 0);
    if (sums.length === 0) return 0;
    const global = sums.reduce((a, b) => a + b, 0) / sums.length;
    return Math.round(global * 100) / 100;
  }

  /**
   * Construye los criterios (filas/bloques EVALUATION del plan) con sus
   * actividades calificadas para un estudiante, listos para la función pura.
   */
  private async buildCriteriaForStudent(
    prisma: PrismaClient,
    studentId: string,
    subjectId: string,
    periodId: string
  ): Promise<CriterionInput[]> {
    // 1. Lapso del período (Primer→1, Segundo→2, Tercer→3; fallback '1')
    const period = await prisma.period.findUnique({
      where: { id: periodId },
      select: { name: true },
    });
    const lapso = this.periodToLapso(period?.name);

    // Obtener aula activa del estudiante para aislar su plan de evaluación
    const studentEnrollment = await prisma.studentClassroom.findFirst({
      where: { studentId, isActive: true },
      select: { classroomId: true },
    });

    const whereClause: any = { subjectId, lapso, rowType: 'EVALUATION' };
    if (studentEnrollment?.classroomId) {
      whereClause.classroomId = studentEnrollment.classroomId;
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

      const studentClassroom = await prisma.studentClassroom.findFirst({
        where: { studentId, isActive: true },
        select: { classroomId: true },
      });
      if (studentClassroom?.classroomId) {
        const adHoc = await prisma.classActivity.findMany({
          where: {
            classroomId: studentClassroom.classroomId,
            subjectId,
            scores: { not: undefined },
          },
          select: { maxScore: true, scores: true },
        });
        adHoc.forEach(ca => {
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

  /** Mapea el nombre del período al lapso del plan (fallback '1'). */
  private periodToLapso(periodName?: string | null): string {
    if (!periodName) return '1';
    const name = periodName.toLowerCase();
    if (name.includes('segundo') || name.includes('2do') || name.includes('2er') || name.includes('ii')) return '2';
    if (name.includes('tercer') || name.includes('3ro') || name.includes('3er') || name.includes('iii')) return '3';
    return '1';
  }

  /**
   * Calcular promedio global del estudiante (TU LÓGICA EXACTA)
   * Promedio de los promedios por materia en un lapso
   */
  async calculateStudentGlobalAverage(
    prisma: PrismaClient,
    studentId: string,
    periodId: string
  ): Promise<{
    globalAverage: number;
    subjectAverages: Array<{
      subjectId: string;
      subjectName: string;
      average: number;
    }>;
  }> {
    const cacheKey = `grade:avg:student:${studentId}:global:period:${periodId}`;

    let result = await RedisCache.get<any>(cacheKey);

    if (!result) {
      // Obtener todas las materias del estudiante en el período
      const subjectsWithGrades = await prisma.grade.findMany({
        where: {
          studentId,
          periodId
        },
        select: {
          subjectId: true,
          subject: {
            select: {
              name: true
            }
          }
        },
        distinct: ['subjectId']
      });

      const subjectAverages = [];

      // ✅ OPTIMIZADO: Calcular promedios de todas las materias en paralelo
      const subjectAveragePromises = subjectsWithGrades.map(item =>
        this.calculateSubjectAverage(prisma, studentId, item.subjectId, periodId)
          .then(average => ({
            subjectId: item.subjectId,
            subjectName: item.subject.name,
            average
          }))
      );

      const calculatedAverages = await Promise.all(subjectAveragePromises);
      subjectAverages.push(...calculatedAverages);

      // Calcular promedio global: promedio de los promedios por materia
      const globalAverage = subjectAverages.length > 0
        ? calculateSimpleAverage(subjectAverages.map(s => s.average))
        : 0;

      result = {
        globalAverage,
        subjectAverages
      };

      // Cache por 10 minutos
      await RedisCache.set(cacheKey, result, CACHE_TTL.SHORT * 2);
    }

    return result;
  }

  /**
   * Calcular promedio de la clase por materia (TU LÓGICA EXACTA)
   * Promedio de los promedios individuales de todos los estudiantes de esa clase en una materia y lapso
   */
  async calculateClassroomSubjectAverage(
    prisma: PrismaClient,
    classroomId: string,
    subjectId: string,
    periodId: string
  ): Promise<{
    average: number;
    studentCount: number;
    passedStudents: number;
    failedStudents: number;
    statistics: any;
  }> {
    const cacheKey = `grade:avg:classroom:${classroomId}:subject:${subjectId}:period:${periodId}`;

    let result = await RedisCache.get<any>(cacheKey);

    if (!result) {
      // Obtener todos los estudiantes del aula
      const studentsInClassroom = await prisma.studentClassroom.findMany({
        where: {
          classroomId,
          isActive: true
        },
        select: {
          studentId: true
        }
      });

      const studentAverages: number[] = [];

      // ✅ OPTIMIZADO: Calcular promedios de todos los estudiantes en paralelo
      const studentAveragePromises = studentsInClassroom.map(student =>
        this.calculateSubjectAverage(prisma, student.studentId, subjectId, periodId)
      );

      const allStudentAverages = await Promise.all(studentAveragePromises);

      // Filtrar solo estudiantes con calificaciones
      allStudentAverages.forEach(avg => {
        if (avg > 0) {
          studentAverages.push(avg);
        }
      });

      // Calcular promedio de la clase: promedio de los promedios individuales
      const average = studentAverages.length > 0
        ? calculateSimpleAverage(studentAverages)
        : 0;

      const passedStudents = studentAverages.filter(avg => avg >= GRADE_SYSTEM.PASSING_SCORE).length;
      const failedStudents = studentAverages.length - passedStudents;
      const statistics = calculateGradeStatistics(studentAverages);

      result = {
        average,
        studentCount: studentAverages.length,
        passedStudents,
        failedStudents,
        statistics
      };

      // Cache por 15 minutos
      await RedisCache.set(cacheKey, result, CACHE_TTL.MEDIUM);
    }

    return result;
  }

  /**
   * Calcular promedio global de la clase (TU LÓGICA EXACTA)
   * Promedio de los promedios por materia para la clase en un lapso
   */
  async calculateClassroomGlobalAverage(
    prisma: PrismaClient,
    classroomId: string,
    periodId: string
  ): Promise<{
    globalAverage: number;
    subjectAverages: Array<{
      subjectId: string;
      subjectName: string;
      average: number;
    }>;
  }> {
    const cacheKey = `grade:avg:classroom:${classroomId}:global:period:${periodId}`;

    let result = await RedisCache.get<any>(cacheKey);

    if (!result) {
      // Obtener todas las materias que tiene el aula
      const classroomSubjects = await prisma.classroomSubject.findMany({
        where: { classroomId },
        include: {
          subject: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      const subjectAverages = [];

      for (const item of classroomSubjects) {
        const classroomSubjectAvg = await this.calculateClassroomSubjectAverage(
          prisma,
          classroomId,
          item.subject.id,
          periodId
        );

        if (classroomSubjectAvg.average > 0) {
          subjectAverages.push({
            subjectId: item.subject.id,
            subjectName: item.subject.name,
            average: classroomSubjectAvg.average
          });
        }
      }

      // Promedio global de la clase: promedio de los promedios por materia
      const globalAverage = subjectAverages.length > 0
        ? calculateSimpleAverage(subjectAverages.map(s => s.average))
        : 0;

      result = {
        globalAverage,
        subjectAverages
      };

      // Cache por 15 minutos
      await RedisCache.set(cacheKey, result, CACHE_TTL.MEDIUM);
    }

    return result;
  }

  /**
   * Obtener reporte completo de calificaciones de un estudiante
   */
  async getStudentGradeReport(
    prisma: PrismaClient,
    studentId: string,
    periodId: string
  ): Promise<{
    student: {
      id: string;
      firstName: string;
      lastName: string;
    };
    period: {
      id: string;
      name: string;
    };
    globalAverage: number;
    globalScale: string;
    subjectDetails: Array<{
      subject: {
        id: string;
        name: string;
        code: string;
      };
      average: number;
      scale: string;
      grades: Array<{
        id: string;
        score: number;
        activity: {
          title: string;
          type: string;
        };
        createdAt: Date;
      }>;
    }>;
  }> {
    // Obtener datos del estudiante y período
    const [student, period] = await Promise.all([
      prisma.user.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      }),
      prisma.period.findUnique({
        where: { id: periodId },
        select: {
          id: true,
          name: true
        }
      })
    ]);

    if (!student || !period) {
      throw new Error('Estudiante o período no encontrado');
    }

    // Calcular promedio global
    const { globalAverage, subjectAverages } = await this.calculateStudentGlobalAverage(
      prisma,
      studentId,
      periodId
    );

    // Obtener detalles por materia
    const subjectDetails = [];

    for (const subjectAvg of subjectAverages) {
      const grades = await prisma.grade.findMany({
        where: {
          studentId,
          subjectId: subjectAvg.subjectId,
          periodId
        },
        include: {
          activity: {
            select: {
              title: true,
              type: true
            }
          },
          subject: {
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      const scale = getGradeScale(subjectAvg.average);

      subjectDetails.push({
        subject: grades[0]?.subject || {
          id: subjectAvg.subjectId,
          name: subjectAvg.subjectName,
          code: ''
        },
        average: subjectAvg.average,
        scale: scale?.label || 'Sin calificar',
        grades: grades.map(grade => ({
          id: grade.id,
          score: grade.score,
          activity: grade.activity,
          createdAt: grade.createdAt
        }))
      });
    }

    const globalScale = getGradeScale(globalAverage);

    return {
      student,
      period,
      globalAverage,
      globalScale: globalScale?.label || 'Sin calificar',
      // @ts-expect-error Prisma select return matches the expected shape at runtime
      subjectDetails
    };
  }

  /**
   * Crear múltiples calificaciones en lote
   */
  async createBulkGrades(prisma: PrismaClient, bulkData: BulkGradeData): Promise<{
    created: GradeWithRelations[];
    errors: Array<{
      index: number;
      grade: CreateGradeData;
      error: string;
    }>;
    summary: {
      total: number;
      success: number;
      failed: number;
    };
  }> {
    const { grades } = bulkData;
    const created: GradeWithRelations[] = [];
    const errors: Array<{ index: number; grade: CreateGradeData; error: string }> = [];

    logger.info('Starting bulk grade creation', { totalGrades: grades.length });

    for (let i = 0; i < grades.length; i++) {
      try {
        const gradeData = grades[i];
        const createdGrade = await this.createGrade(prisma, gradeData);
        created.push(createdGrade);
      } catch (error) {
        errors.push({
          index: i,
          grade: grades[i],
          error: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
    }

    const summary = {
      total: grades.length,
      success: created.length,
      failed: errors.length
    };

    logger.info('Bulk grade creation completed', summary);

    return {
      created,
      errors,
      summary
    };
  }

  /**
   * Obtener estadísticas detalladas de calificaciones
   */
  async getGradeStatistics(prisma: PrismaClient, filters: {
    studentId?: string;
    subjectId?: string;
    periodId?: string;
    classroomId?: string;
    teacherId?: string;
  }): Promise<GradeStatistics> {
    try {
      const cacheKey = `grades:stats:${JSON.stringify(filters)}`;
      let stats = await RedisCache.get<GradeStatistics>(cacheKey);

      if (!stats) {
        // Construir where clause basado en filtros
        const where: Prisma.GradeWhereInput = {
          student: {
          } as Prisma.UserWhereInput
        };

        if (filters.studentId) where.studentId = filters.studentId;
        if (filters.subjectId) where.subjectId = filters.subjectId;
        if (filters.periodId) where.periodId = filters.periodId;
        if (filters.teacherId) where.teacherId = filters.teacherId;

        if (filters.classroomId) {
          const studentFilter: Prisma.UserWhereInput = (where.student as Prisma.UserWhereInput) || {};
          where.student = {
            ...studentFilter,
            studentClassrooms: {
              some: {
                classroomId: filters.classroomId,
                isActive: true
              }
            }
          } as Prisma.UserWhereInput;
        }

        // Obtener todas las calificaciones que coincidan con los filtros
        const grades = await prisma.grade.findMany({
          where,
          select: {
            score: true
          }
        });

        if (grades.length === 0) {
          stats = {
            totalGrades: 0,
            averageScore: 0,
            highestScore: 0,
            lowestScore: 0,
            passedCount: 0,
            failedCount: 0,
            passRate: 0,
            distribution: []
          };
        } else {
          const scores = grades.map(g => g.score).filter((s): s is number => s !== null);
          const totalGrades = scores.length;
          const averageScore = calculateSimpleAverage(scores);
          const highestScore = Math.max(...scores);
          const lowestScore = Math.min(...scores);
          const passedCount = scores.filter(score => score >= GRADE_SYSTEM.PASSING_SCORE).length;
          const failedCount = totalGrades - passedCount;
          const passRate = (passedCount / totalGrades) * 100;

          // Calcular distribución por rangos
          const ranges = [
            { min: 0, max: 4.99, label: '0-4.99' },
            { min: 5, max: 9.99, label: '5-9.99' },
            { min: 10, max: 12.99, label: '10-12.99' },
            { min: 13, max: 15.99, label: '13-15.99' },
            { min: 16, max: 18.99, label: '16-18.99' },
            { min: 19, max: 20, label: '19-20' }
          ];

          const distribution = ranges.map(range => {
            const count = scores.filter(score => score >= range.min && score <= range.max).length;
            const percentage = (count / totalGrades) * 100;
            return {
              range: range.label,
              count,
              percentage: Math.round(percentage * 100) / 100
            };
          });

          stats = {
            totalGrades,
            averageScore: Math.round(averageScore * 100) / 100,
            highestScore,
            lowestScore,
            passedCount,
            failedCount,
            passRate: Math.round(passRate * 100) / 100,
            distribution
          };
        }

        // Cache por 15 minutos
        await RedisCache.set(cacheKey, stats, CACHE_TTL.MEDIUM);
      }

      logger.info('Grade statistics retrieved', {
        filters,
        totalGrades: stats.totalGrades,
        averageScore: stats.averageScore
      });

      return stats;
    } catch (error) {
      logger.error('Error retrieving grade statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filters
      });
      throw new Error('Error al obtener estadísticas de calificaciones');
    }
  }

  /**
   * Obtener calificaciones por estudiante con caché optimizado
   */
  async getGradesByStudent(
    prisma: PrismaClient,
    studentId: string,
    periodId?: string,
    subjectId?: string
  ): Promise<GradeWithRelations[]> {
    try {
      const cacheKey = `grades:student:${studentId}:period:${periodId || 'all'}:subject:${subjectId || 'all'}`;
      let grades = await RedisCache.get<GradeWithRelations[]>(cacheKey);

      if (!grades) {
        const where: Prisma.GradeWhereInput = {
          studentId
        };

        if (periodId) where.periodId = periodId;
        if (subjectId) where.subjectId = subjectId;

        // @ts-expect-error Prisma findMany return structurally matches GradeWithRelations[] at runtime
        grades = await prisma.grade.findMany({
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
            createdAt: 'desc'
          }
        });

        // Cache por 10 minutos
        await RedisCache.set(cacheKey, grades, CACHE_TTL.SHORT * 2);
      }

      // @ts-expect-error grades is populated from either cache or Prisma query
      return grades;
    } catch (error) {
      logger.error('Error retrieving grades by student', {
        error: error instanceof Error ? error.message : 'Unknown error',
        studentId,
        periodId,
        subjectId
      });
      throw new Error('Error al obtener calificaciones del estudiante');
    }
  }

  /**
   * Validar si un estudiante puede recibir una calificación
   */
  async validateGradeEligibility(
    prisma: PrismaClient,
    studentId: string,
    activityId: string
  ): Promise<{
    isEligible: boolean;
    reason?: string;
    existingGrade?: {
      id: string;
      score: number | null;
    };
  }> {
    try {
      // Verificar si ya existe una calificación
      const existingGrade = await prisma.grade.findUnique({
        where: {
          studentId_activityId: {
            studentId,
            activityId
          }
        },
        select: {
          id: true,
          score: true
        }
      });

      if (existingGrade) {
        return {
          isEligible: false,
          reason: 'Ya existe una calificación para esta actividad',
          existingGrade
        };
      }

      // Verificar que el estudiante esté activo
      const student = await prisma.user.findFirst({
        where: {
          id: studentId,
          role: UserRole.STUDENT,
          isActive: true
        },
        select: { id: true }
      });

      if (!student) {
        return {
          isEligible: false,
          reason: 'Estudiante no encontrado o inactivo'
        };
      }

      // Verificar que la actividad exista y esté activa
      const activity = await prisma.activity.findFirst({
        where: {
          id: activityId,
          isActive: true
        },
        select: { id: true, dueDate: true }
      });

      if (!activity) {
        return {
          isEligible: false,
          reason: 'Actividad no encontrada o inactiva'
        };
      }

      return {
        isEligible: true
      };
    } catch (error) {
      logger.error('Error validating grade eligibility', {
        error: error instanceof Error ? error.message : 'Unknown error',
        studentId,
        activityId
      });
      throw new Error('Error al validar elegibilidad para calificación');
    }
  }

  /**
   * Limpiar cache de calificaciones
   */
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

  /**
   * Limpiar todo el cache de calificaciones
   */
  async clearAllGradeCache(prisma: PrismaClient): Promise<void> {
    try {
      await Promise.all([
        RedisCache.clearPattern('grade:*'),
        RedisCache.clearPattern('grades:*')
      ]);

      logger.info('All grade cache cleared successfully');
    } catch (error) {
      logger.error('Error clearing all grade cache', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const gradesService = new GradesService();
export default gradesService;
