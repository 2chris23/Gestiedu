/**
 * Types for Database Migration
 * Fase 3: Data Migration & Deployment
 */

export interface InstituteMetadata {
    id: string;
    name: string;
    slug: string;
    email: string;
    code: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'INACTIVE';
    plan: 'BASIC' | 'STANDARD' | 'PREMIUM';

    // Database connection info
    databaseName?: string;
    databaseHost?: string;
    databasePort?: number;
    databaseUser?: string;
    databasePassword?: string;
}

export interface ProvisionConfig {
    platformDbUrl: string;
    tenantDbTemplate: string; // "postgresql://user:pass@host:5432/tenant_{slug}"
    institutes: InstituteMetadata[];
    dryRun?: boolean;
}

export interface DatabaseProvisionResult {
    instituteId: string;
    slug: string;
    dbName: string;
    dbUrl: string;
    status: 'success' | 'error' | 'skipped';
    error?: string;
    migrationsApplied?: number;
}

export interface ProvisionResult {
    platformDb: {
        url: string;
        status: 'success' | 'error';
        error?: string;
        migrationsApplied?: number;
    };
    tenantDbs: DatabaseProvisionResult[];
    summary: {
        total: number;
        successful: number;
        failed: number;
        skipped: number;
    };
}

export interface MigrationConfig {
    sourceDbUrl: string; // Single database URL
    platformDbUrl: string;
    tenantDbUrls: Map<string, string>; // instituteId -> tenant DB URL
    batchSize?: number;
    dryRun?: boolean;
}

export interface ModelMigrationResult {
    model: string;
    instituteId: string;
    sourceCount: number;
    targetCount: number;
    status: 'ok' | 'mismatch' | 'error';
    missingRecords?: number;
    error?: string;
    duration: number; // milliseconds
}

export interface MigrationResult {
    platformMetadata: {
        institutes: number;
        superAdmins: number;
        status: 'success' | 'error';
        error?: string;
    };
    tenantData: {
        [instituteId: string]: {
            models: ModelMigrationResult[];
            totalRecords: number;
            status: 'success' | 'partial' | 'error';
            error?: string;
        };
    };
    summary: {
        totalInstitutes: number;
        successfulInstitutes: number;
        failedInstitutes: number;
        totalRecordsMigrated: number;
        totalDuration: number;
    };
}

export interface ValidationResult {
    instituteId: string;
    model: string;
    sourceCount: number;
    targetCount: number;
    status: 'ok' | 'mismatch' | 'error';
    missingRecords?: number;
    orphanedRecords?: number;
    error?: string;
}

export interface ValidationReport {
    validations: ValidationResult[];
    summary: {
        totalValidations: number;
        passed: number;
        failed: number;
        warnings: number;
    };
    issues: {
        critical: string[];
        warnings: string[];
    };
}

export const TENANT_MODELS = [
    'User',
    'Classroom',
    'Subject',
    'ClassroomSubject',
    'Grade',
    'Activity',
    'DailyAttendance',
    'Period',
    'AcademicYear',
    'ClassSession',
    'Observation',
    'Notification',
    'Enrollment',
    'Schedule',
    'ScheduleBlock',
    'AuditLog',
    'SystemAlert',
] as const;

export const PLATFORM_MODELS = [
    'Institute',
    'SuperAdmin',
    'SuperAdminRefreshToken',
    'PlatformConfig',
    'InstituteInvitation',
    'WebhookLog',
] as const;

export type TenantModel = typeof TENANT_MODELS[number];
export type PlatformModel = typeof PLATFORM_MODELS[number];
