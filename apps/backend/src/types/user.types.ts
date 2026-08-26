import { UserRole } from '../utils/prisma-enums';

// Tipos de usuario
export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  address?: string;
  avatar?: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  avatar?: string;
  isActive?: boolean;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  phone?: string;
  address?: string;
  avatar?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentProfile extends UserProfile {
  studentCode?: string;
  birthDate?: Date;
  emergencyContact?: string;
  emergencyPhone?: string;
}

export interface TeacherProfile extends UserProfile {
  employeeCode?: string;
  specialization?: string;
}

export interface TutorProfile extends UserProfile {
  relationship?: string;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  adminCount: number;
  teacherCount: number;
  studentCount: number;
  tutorCount: number;
}
