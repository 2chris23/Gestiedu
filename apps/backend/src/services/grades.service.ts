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
}

export const gradesService = new GradesService();
export default gradesService;
