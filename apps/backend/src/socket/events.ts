// Definición de eventos socket

export const SOCKET_EVENTS = {
  // Eventos de conexión
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  
  // Eventos de autenticación
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_VERIFY: 'auth:verify',
  
  // Eventos de asistencia
  ATTENDANCE_SUBSCRIBE: 'attendance:subscribe',
  ATTENDANCE_REGISTER: 'attendance:register',
  ATTENDANCE_UPDATE: 'attendance:update',
  ATTENDANCE_DELETE: 'attendance:delete',
  ATTENDANCE_UPDATED: 'attendance:updated',
  ATTENDANCE_DELETED: 'attendance:deleted',
  
  // Eventos de calificaciones
  GRADES_SUBSCRIBE: 'grades:subscribe',
  GRADES_REGISTER: 'grades:register',
  GRADES_UPDATE: 'grades:update',
  GRADES_DELETE: 'grades:delete',
  GRADES_UPDATED: 'grades:updated',
  GRADES_DELETED: 'grades:deleted',
  
  // Eventos de actividades
  ACTIVITIES_SUBSCRIBE: 'activities:subscribe',
  ACTIVITIES_CREATE: 'activities:create',
  ACTIVITIES_UPDATE: 'activities:update',
  ACTIVITIES_DELETE: 'activities:delete',
  ACTIVITIES_CREATED: 'activities:created',
  ACTIVITIES_UPDATED: 'activities:updated',
  ACTIVITIES_DELETED: 'activities:deleted',
  
  // Eventos de notificaciones
  NOTIFICATION_SEND: 'notification:send',
  NOTIFICATION_READ: 'notification:read',
  NOTIFICATION_RECEIVED: 'notification:received',
  
  // Eventos de usuarios
  USER_STATUS_CHANGE: 'user:status_change',
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  
  // Eventos de salas
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  
  // Eventos de error
  ERROR: 'error',
} as const;

export type SocketEvent = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];

// Tipos de salas (rooms)
export const ROOM_TYPES = {
  CLASSROOM: 'classroom',
  STUDENT: 'student',
  TEACHER: 'teacher',
  SUBJECT: 'subject',
  DATE: 'date',
  USER: 'user',
} as const;

export type RoomType = typeof ROOM_TYPES[keyof typeof ROOM_TYPES];

// Funciones de utilidad para crear nombres de salas
export const createRoomName = {
  classroom: (classroomId: string, type?: string) => 
    type ? `${ROOM_TYPES.CLASSROOM}:${classroomId}:${type}` : `${ROOM_TYPES.CLASSROOM}:${classroomId}`,
  
  student: (studentId: string, type?: string) => 
    type ? `${ROOM_TYPES.STUDENT}:${studentId}:${type}` : `${ROOM_TYPES.STUDENT}:${studentId}`,
  
  teacher: (teacherId: string, type?: string) => 
    type ? `${ROOM_TYPES.TEACHER}:${teacherId}:${type}` : `${ROOM_TYPES.TEACHER}:${teacherId}`,
  
  subject: (subjectId: string, type?: string) => 
    type ? `${ROOM_TYPES.SUBJECT}:${subjectId}:${type}` : `${ROOM_TYPES.SUBJECT}:${subjectId}`,
  
  date: (date: string, type?: string) => 
    type ? `${ROOM_TYPES.DATE}:${date}:${type}` : `${ROOM_TYPES.DATE}:${date}`,
  
  user: (userId: string) => `${ROOM_TYPES.USER}:${userId}`,
};
