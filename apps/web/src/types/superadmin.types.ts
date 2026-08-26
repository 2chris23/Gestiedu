/**
 * SuperAdmin Types
 * Tipos TypeScript para el panel de SuperAdmin
 */

export interface SuperAdmin {
    id: string;
    email: string;
    name: string;
    role: 'SUPERADMIN';
    isActive: boolean;
    lastLogin?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Institute {
    id: string;
    name: string;
    code: string;
    slug: string;
    subdomain: string;
    email: string;
    phone?: string;
    address?: string;
    status: InstituteStatus;
    plan: InstitutePlan;
    maxStudents: number;
    maxTeachers: number;
    databaseName: string;
    createdAt: string;
    updatedAt: string;
}

export type InstituteStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'INACTIVE';
export type InstitutePlan = 'BASIC' | 'PREMIUM' | 'ENTERPRISE';

export interface DashboardKPIs {
    totalInstitutes: number;
    activeInstitutes: number;
    totalUsers: number;
    totalStudents: number;
    planDistribution: {
        BASIC: number;
        PREMIUM: number;
        ENTERPRISE: number;
    };
}

export interface InstituteStats {
    totalInstitutes: number;
    activeInstitutes: number;
    totalUsers: number;
    planDistribution: {
        BASIC?: number;
        PREMIUM?: number;
        ENTERPRISE?: number;
    };
}

export interface CreateInstituteDTO {
    name: string;
    code: string;
    email: string;
    phone?: string;
    address?: string;
    plan: InstitutePlan;
    maxStudents: number;
    maxTeachers: number;
    adminEmail: string;
    adminPassword: string;
    adminFirstName: string;
    adminLastName: string;
}

export interface UpdateInstituteDTO {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    status?: InstituteStatus;
    plan?: InstitutePlan;
    maxStudents?: number;
    maxTeachers?: number;
}

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface AuthResponse {
    superAdmin: SuperAdmin;
    accessToken: string;
    refreshToken: string;
}
