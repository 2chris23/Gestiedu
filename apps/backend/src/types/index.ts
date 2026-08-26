// Tipos principales

// Re-exportar todos los tipos
export * from './api.types';
export * from './auth.types';
export * from './user.types';
export * from './socket.types';

// Tipos adicionales del dominio
export interface Subject {
  id: string;
  name: string;
  code: string;
  description?: string;
  credits?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Classroom {
  id: string;
  name: string;
  code: string;
  grade: string;
  section?: string;
  capacity?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Grade {
  id: string;
  score: number;
  maxScore: number;
  comment?: string;
  studentId: string;
  subjectId: string;
  activityId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Activity {
  id: string;
  title: string;
  description?: string;
  type: 'TAREA' | 'EXAMEN' | 'PROYECTO' | 'PARTICIPACION';
  dueDate?: Date;
  maxScore: number;
  subjectId: string;
  classroomId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Attendance {
  id: string;
  status: 'PRESENTE' | 'AUSENTE' | 'TARDANZA' | 'JUSTIFICADO';
  comment?: string;
  date: Date;
  studentId: string;
  classroomId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  userId: string;
  entityId?: string;
  entityType?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Schedule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectId: string;
  classroomId: string;
  teacherId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
