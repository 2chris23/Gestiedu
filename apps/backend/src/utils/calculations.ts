import { GRADE_SYSTEM, GRADE_SCALES } from './constants';

// =====================================================
// TIPOS PARA CÁLCULOS
// =====================================================

export interface GradeRecord {
  score: number;
  weight?: number;
  activityId: string;
  subjectId: string;
  periodId: string;
}

export interface SubjectAverage {
  subjectId: string;
  subjectName?: string;
  average: number;
  totalGrades: number;
  weightedAverage: number;
}

export interface StudentAverage {
  studentId: string;
  periodId: string;
  subjectAverages: SubjectAverage[];
  globalAverage: number;
  totalSubjects: number;
}

export interface ClassroomAverage {
  classroomId: string;
  periodId: string;
  subjectId?: string;
  average: number;
  studentCount: number;
  passedStudents: number;
  failedStudents: number;
}

export interface AttendanceStats {
  studentId: string;
  periodId?: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  justifiedDays: number;
  attendanceRate: number;
}

// =====================================================
// CÁLCULOS DE CALIFICACIONES
// =====================================================

/**
 * Calcular promedio simple de calificaciones
 * @param grades - Array de calificaciones
 * @returns Promedio simple
 */
export function calculateSimpleAverage(grades: number[]): number {
  if (grades.length === 0) return 0;
  
  const sum = grades.reduce((acc, grade) => acc + grade, 0);
  return Math.round((sum / grades.length) * 100) / 100; // Redondear a 2 decimales
}

/**
 * Calcular promedio ponderado de calificaciones
 * @param grades - Array de objetos con score y weight
 * @returns Promedio ponderado
 */
export function calculateWeightedAverage(
  grades: Array<{ score: number; weight: number }>
): number {
  if (grades.length === 0) return 0;
  
  const totalWeightedScore = grades.reduce(
    (acc, grade) => acc + (grade.score * grade.weight),
    0
  );
  const totalWeight = grades.reduce((acc, grade) => acc + grade.weight, 0);
  
  if (totalWeight === 0) return 0;
  
  return Math.round((totalWeightedScore / totalWeight) * 100) / 100;
}

/**
 * Calcular promedio por materia para un estudiante en un período
 * @param grades - Calificaciones del estudiante en la materia
 * @returns Promedio de la materia
 */
export function calculateSubjectAverage(grades: GradeRecord[]): SubjectAverage | null {
  if (grades.length === 0) return null;
  
  const subjectId = grades[0].subjectId;
  
  // Verificar que todas las calificaciones sean de la misma materia
  if (!grades.every(g => g.subjectId === subjectId)) {
    throw new Error('Todas las calificaciones deben ser de la misma materia');
  }
  
  // Calcular promedio simple
  const scores = grades.map(g => g.score);
  const average = calculateSimpleAverage(scores);
  
  // Calcular promedio ponderado si hay pesos definidos
  const hasWeights = grades.some(g => g.weight && g.weight !== 1);
  const weightedAverage = hasWeights 
    ? calculateWeightedAverage(grades.map(g => ({ score: g.score, weight: g.weight || 1 })))
    : average;
  
  return {
    subjectId,
    average,
    totalGrades: grades.length,
    weightedAverage,
  };
}

/**
 * Calcular promedio global de un estudiante en un período
 * @param subjectAverages - Promedios por materia
 * @returns Promedio global del estudiante
 */
export function calculateStudentGlobalAverage(
  subjectAverages: SubjectAverage[]
): number {
  if (subjectAverages.length === 0) return 0;
  
  // Usar promedio ponderado si está disponible, sino usar promedio simple
  const averages = subjectAverages.map(subject => 
    subject.weightedAverage || subject.average
  );
  
  return calculateSimpleAverage(averages);
}

/**
 * Calcular promedio completo de un estudiante
 * @param grades - Todas las calificaciones del estudiante
 * @param studentId - ID del estudiante
 * @param periodId - ID del período
 * @returns Promedio completo del estudiante
 */
export function calculateCompleteStudentAverage(
  grades: GradeRecord[],
  studentId: string,
  periodId: string
): StudentAverage {
  // Agrupar calificaciones por materia
  const gradesBySubject = grades.reduce((acc, grade) => {
    if (!acc[grade.subjectId]) {
      acc[grade.subjectId] = [];
    }
    acc[grade.subjectId].push(grade);
    return acc;
  }, {} as Record<string, GradeRecord[]>);
  
  // Calcular promedio por materia
  const subjectAverages: SubjectAverage[] = Object.entries(gradesBySubject)
    .map(([subjectId, subjectGrades]) => calculateSubjectAverage(subjectGrades))
    .filter(Boolean) as SubjectAverage[];
  
  // Calcular promedio global
  const globalAverage = calculateStudentGlobalAverage(subjectAverages);
  
  return {
    studentId,
    periodId,
    subjectAverages,
    globalAverage,
    totalSubjects: subjectAverages.length,
  };
}

/**
 * Calcular promedio de un aula por materia
 * @param studentAverages - Promedios individuales de estudiantes
 * @param classroomId - ID del aula
 * @param periodId - ID del período
 * @param subjectId - ID de la materia (opcional)
 * @returns Promedio del aula
 */
export function calculateClassroomAverage(
  studentAverages: number[],
  classroomId: string,
  periodId: string,
  subjectId?: string
): ClassroomAverage {
  const average = calculateSimpleAverage(studentAverages);
  const passedStudents = studentAverages.filter(avg => avg >= GRADE_SYSTEM.PASSING_SCORE).length;
  const failedStudents = studentAverages.length - passedStudents;
  
  return {
    classroomId,
    periodId,
    subjectId,
    average,
    studentCount: studentAverages.length,
    passedStudents,
    failedStudents,
  };
}

/**
 * Calcular promedio global de un aula (todas las materias)
 * @param subjectAverages - Promedios del aula por materia
 * @returns Promedio global del aula
 */
export function calculateClassroomGlobalAverage(
  subjectAverages: ClassroomAverage[]
): number {
  if (subjectAverages.length === 0) return 0;
  
  const averages = subjectAverages.map(subject => subject.average);
  return calculateSimpleAverage(averages);
}

// =====================================================
// CLASIFICACIÓN DE CALIFICACIONES
// =====================================================

/**
 * Obtener escala de calificación para una nota
 * @param score - Calificación
 * @returns Escala de calificación
 */
export function getGradeScale(score: number): typeof GRADE_SCALES[keyof typeof GRADE_SCALES] | null {
  for (const [key, scale] of Object.entries(GRADE_SCALES)) {
    if (score >= scale.min && score <= scale.max) {
      return scale;
    }
  }
  return null;
}

/**
 * Verificar si una calificación es aprobatoria
 * @param score - Calificación
 * @returns true si es aprobatoria
 */
export function isPassingGrade(score: number): boolean {
  return score >= GRADE_SYSTEM.PASSING_SCORE;
}

/**
 * Verificar si una calificación es de excelencia
 * @param score - Calificación
 * @returns true si es de excelencia
 */
export function isExcellentGrade(score: number): boolean {
  return score >= GRADE_SYSTEM.EXCELLENT_SCORE;
}

/**
 * Validar que una calificación esté dentro del rango válido
 * @param score - Calificación
 * @returns true si es válida
 */
export function isValidGrade(score: number): boolean {
  return score >= GRADE_SYSTEM.MIN_SCORE && score <= GRADE_SYSTEM.MAX_SCORE;
}

// =====================================================
// CÁLCULOS DE ASISTENCIA
// =====================================================

/**
 * Calcular estadísticas de asistencia
 * @param attendanceRecords - Registros de asistencia
 * @param studentId - ID del estudiante
 * @param periodId - ID del período (opcional)
 * @returns Estadísticas de asistencia
 */
export function calculateAttendanceStats(
  attendanceRecords: Array<{ status: string; date: Date }>,
  studentId: string,
  periodId?: string
): AttendanceStats {
  const totalDays = attendanceRecords.length;
  
  const presentDays = attendanceRecords.filter(r => r.status === 'PRESENTE').length;
  const absentDays = attendanceRecords.filter(r => r.status === 'AUSENTE').length;
  const lateDays = attendanceRecords.filter(r => r.status === 'TARDANZA').length;
  const justifiedDays = attendanceRecords.filter(r => r.status === 'JUSTIFICADA').length;
  
  const attendanceRate = totalDays > 0 
    ? Math.round(((presentDays + lateDays) / totalDays) * 10000) / 100 // Porcentaje con 2 decimales
    : 0;
  
  return {
    studentId,
    periodId,
    totalDays,
    presentDays,
    absentDays,
    lateDays,
    justifiedDays,
    attendanceRate,
  };
}

/**
 * Calcular porcentaje de asistencia
 * @param presentDays - Días presentes (incluyendo tardanzas)
 * @param totalDays - Total de días
 * @returns Porcentaje de asistencia
 */
export function calculateAttendanceRate(presentDays: number, totalDays: number): number {
  if (totalDays === 0) return 0;
  return Math.round((presentDays / totalDays) * 10000) / 100;
}

// =====================================================
// UTILIDADES MATEMÁTICAS
// =====================================================

/**
 * Redondear número a decimales específicos
 * @param num - Número a redondear
 * @param decimals - Número de decimales
 * @returns Número redondeado
 */
export function roundToDecimals(num: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Calcular percentil de una calificación dentro de un grupo
 * @param score - Calificación del estudiante
 * @param allScores - Todas las calificaciones del grupo
 * @returns Percentil (0-100)
 */
export function calculatePercentile(score: number, allScores: number[]): number {
  if (allScores.length === 0) return 0;
  
  const sortedScores = [...allScores].sort((a, b) => a - b);
  const belowScore = sortedScores.filter(s => s < score).length;
  const atScore = sortedScores.filter(s => s === score).length;
  
  const percentile = ((belowScore + (atScore / 2)) / allScores.length) * 100;
  return roundToDecimals(percentile, 1);
}

/**
 * Calcular desviación estándar de un conjunto de calificaciones
 * @param scores - Calificaciones
 * @returns Desviación estándar
 */
export function calculateStandardDeviation(scores: number[]): number {
  if (scores.length === 0) return 0;
  
  const mean = calculateSimpleAverage(scores);
  const squaredDifferences = scores.map(score => Math.pow(score - mean, 2));
  const variance = calculateSimpleAverage(squaredDifferences);
  
  return Math.sqrt(variance);
}

/**
 * Calcular la mediana de un conjunto de calificaciones
 * @param scores - Calificaciones
 * @returns Mediana
 */
export function calculateMedian(scores: number[]): number {
  if (scores.length === 0) return 0;
  
  const sortedScores = [...scores].sort((a, b) => a - b);
  const middle = Math.floor(sortedScores.length / 2);
  
  if (sortedScores.length % 2 === 0) {
    return roundToDecimals((sortedScores[middle - 1] + sortedScores[middle]) / 2);
  } else {
    return sortedScores[middle];
  }
}

/**
 * Calcular estadísticas completas de un conjunto de calificaciones
 * @param scores - Calificaciones
 * @returns Estadísticas completas
 */
export function calculateGradeStatistics(scores: number[]) {
  if (scores.length === 0) {
    return {
      count: 0,
      average: 0,
      median: 0,
      min: 0,
      max: 0,
      standardDeviation: 0,
      passedCount: 0,
      failedCount: 0,
      passRate: 0,
    };
  }
  
  const average = calculateSimpleAverage(scores);
  const median = calculateMedian(scores);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const standardDeviation = calculateStandardDeviation(scores);
  const passedCount = scores.filter(score => isPassingGrade(score)).length;
  const failedCount = scores.length - passedCount;
  const passRate = roundToDecimals((passedCount / scores.length) * 100);
  
  return {
    count: scores.length,
    average,
    median,
    min,
    max,
    standardDeviation: roundToDecimals(standardDeviation),
    passedCount,
    failedCount,
    passRate,
  };
}

export default {
  calculateSimpleAverage,
  calculateWeightedAverage,
  calculateSubjectAverage,
  calculateStudentGlobalAverage,
  calculateCompleteStudentAverage,
  calculateClassroomAverage,
  calculateClassroomGlobalAverage,
  getGradeScale,
  isPassingGrade,
  isExcellentGrade,
  isValidGrade,
  calculateAttendanceStats,
  calculateAttendanceRate,
  roundToDecimals,
  calculatePercentile,
  calculateStandardDeviation,
  calculateMedian,
  calculateGradeStatistics,
};
