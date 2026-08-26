#!/usr/bin/env ts-node
/**
 * Migration Validation Script
 * Validates data integrity after migration
 * 
 * Usage:
 *   ts-node src/migration/scripts/3-validate-migration.ts [--verbose]
 */

import { PrismaClient } from '@prisma/client';
import { PrismaClient as PlatformPrismaClient } from '../../generated/platform-client';
import { MigrationLogger } from '../utils/logger';
import { generateTenantDbName, buildDatabaseUrl, parseDatabaseUrl } from '../utils/database';
import type { ValidationResult, ValidationReport } from '../types';
import * as dotenv from 'dotenv';

dotenv.config();

const logger = new MigrationLogger(process.argv.includes('--verbose'));

/**
 * Validate a single model for a tenant
 */
async function validateTenantModel(
    modelName: string,
    instituteId: string,
    sourcePrisma: PrismaClient,
    tenantPrisma: PrismaClient
): Promise<ValidationResult> {
    try {
        const modelLower = modelName.charAt(0).toLowerCase() + modelName.slice(1);
        const sourceModel = (sourcePrisma as any)[modelLower];
        const targetModel = (tenantPrisma as any)[modelLower];

        if (!sourceModel || !targetModel) {
            return {
                instituteId,
                model: modelName,
                sourceCount: 0,
                targetCount: 0,
                status: 'error',
                error: `Model ${modelName} not found`,
            };
        }

        const sourceCount = await sourceModel.count({ where: { instituteId } });
        const targetCount = await targetModel.count();

        const status = sourceCount === targetCount ? 'ok' : 'mismatch';
        const missingRecords = sourceCount > targetCount ? sourceCount - targetCount : undefined;
        const orphanedRecords = targetCount > sourceCount ? targetCount - sourceCount : undefined;

        return {
            instituteId,
            model: modelName,
            sourceCount,
            targetCount,
            status,
            missingRecords,
            orphanedRecords,
        };
    } catch (error: any) {
        return {
            instituteId,
            model: modelName,
            sourceCount: 0,
            targetCount: 0,
            status: 'error',
            error: error.message,
        };
    }
}

/**
 * Main validation function
 */
async function main() {
    logger.section('Migration Validation');

    const sourceDbUrl = process.env.DATABASE_URL;
    const platformDbUrl = process.env.PLATFORM_DATABASE_URL;
    const tenantDbTemplate = process.env.TENANT_DATABASE_TEMPLATE || sourceDbUrl;

    if (!sourceDbUrl || !platformDbUrl || !tenantDbTemplate) {
        logger.error('Missing required environment variables');
        process.exit(1);
    }

    const sourcePrisma = new PrismaClient({ datasources: { db: { url: sourceDbUrl } } });
    const platformPrisma = new PlatformPrismaClient({ datasources: { db: { url: platformDbUrl } } });

    try {
        // Validate Platform Metadata
        logger.subsection('Validating Platform Metadata');

        const sourceInstitutes = await sourcePrisma.institute.count();
        const platformInstitutes = await platformPrisma.institute.count();

        logger.info(`Source institutes: ${sourceInstitutes}`);
        logger.info(`Platform institutes: ${platformInstitutes}`);

        if (sourceInstitutes !== platformInstitutes) {
            logger.error(`Mismatch: ${sourceInstitutes - platformInstitutes} institutes missing`);
        } else {
            logger.success('Platform metadata validated');
        }

        // Get institutes
        const institutes = await sourcePrisma.institute.findMany({
            select: { id: true, slug: true },
        });

        // Validate tenant data
        logger.subsection(`Validating Data for ${institutes.length} Tenants`);

        const models = [
            'User', 'Classroom', 'Subject', 'ClassroomSubject', 'Grade',
            'Activity', 'DailyAttendance', 'Period', 'AcademicYear',
            'ClassSession', 'Observation', 'Notification', 'Enrollment',
            'Schedule', 'ScheduleBlock', 'AuditLog', 'SystemAlert',
        ];

        const validations: ValidationResult[] = [];
        let current = 0;

        for (const institute of institutes) {
            current++;
            logger.progress(current, institutes.length, institute.slug);

            const connection = parseDatabaseUrl(tenantDbTemplate!);
            const dbName = generateTenantDbName(institute.slug);
            const tenantDbUrl = buildDatabaseUrl(
                connection.host,
                connection.port,
                connection.user,
                connection.password,
                dbName
            );

            const tenantPrisma = new PrismaClient({ datasources: { db: { url: tenantDbUrl } } });

            try {
                for (const model of models) {
                    const result = await validateTenantModel(model, institute.id, sourcePrisma, tenantPrisma);
                    validations.push(result);
                }
            } finally {
                await tenantPrisma.$disconnect();
            }
        }

        // Generate report
        const report: ValidationReport = {
            validations,
            summary: {
                totalValidations: validations.length,
                passed: validations.filter(v => v.status === 'ok').length,
                failed: validations.filter(v => v.status !== 'ok').length,
                warnings: validations.filter(v => v.status === 'mismatch').length,
            },
            issues: {
                critical: validations
                    .filter(v => v.status === 'error')
                    .map(v => `${v.model} (${v.instituteId}): ${v.error}`),
                warnings: validations
                    .filter(v => v.status === 'mismatch')
                    .map(v => `${v.model} (${v.instituteId}): ${v.missingRecords || v.orphanedRecords} records mismatch`),
            },
        };

        // Display results
        logger.section('Validation Results');

        logger.summary({
            'Total Validations': report.summary.totalValidations,
            'Passed': report.summary.passed,
            'Failed': report.summary.failed,
            'Warnings': report.summary.warnings,
        });

        if (report.issues.critical.length > 0) {
            logger.subsection('Critical Issues');
            report.issues.critical.forEach(issue => logger.error(issue));
        }

        if (report.issues.warnings.length > 0) {
            logger.subsection('Warnings');
            report.issues.warnings.forEach(warning => logger.warn(warning));
        }

        if (report.summary.failed === 0 && report.summary.warnings === 0) {
            logger.success('All validations passed!');
        }

        logger.finish(`Validation completed in ${logger.elapsed()}`);

        if (report.summary.failed > 0) {
            process.exit(1);
        }
    } finally {
        await sourcePrisma.$disconnect();
        await platformPrisma.$disconnect();
    }
}

main().catch((error) => {
    logger.error('Unexpected error', error);
    process.exit(1);
});
