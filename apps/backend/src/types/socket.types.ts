import { UserRole } from '../utils/prisma-enums';
// Tipos de socket

import { Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

export interface SocketEvent<T = any> {
  event: string;
  data: T;
}

export interface NotificationData {
  title: string;
  message: string;
  type: NotificationType;
  entityId?: string;
  entityType?: string;
}

export type NotificationType = 
  | 'ATTENDANCE_UPDATED'
  | 'ATTENDANCE_DELETED'
  | 'GRADE_UPDATED'
  | 'GRADE_DELETED'
  | 'ACTIVITY_CREATED'
  | 'ACTIVITY_UPDATED'
  | 'ACTIVITY_DELETED'
  | 'MESSAGE_RECEIVED'
  | 'SYSTEM_NOTIFICATION';

export interface AttendanceSocketData {
  classroomId?: string;
  studentId?: string;
  date?: string;
  status?: 'PRESENTE' | 'AUSENTE' | 'TARDANZA' | 'JUSTIFICADO';
  comment?: string;
}

export interface GradeSocketData {
  studentId: string;
  subjectId: string;
  activityId?: string;
  score: number;
  maxScore: number;
  comment?: string;
}

export interface ActivitySocketData {
  id: string;
  title: string;
  description?: string;
  type: 'TAREA' | 'EXAMEN' | 'PROYECTO' | 'PARTICIPACION';
  dueDate?: Date;
  subjectId: string;
  classroomId: string;
}

export interface RoomSubscription {
  userId: string;
  rooms: string[];
}
