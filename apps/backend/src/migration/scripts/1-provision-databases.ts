#!/usr/bin/env ts-node
/**
 * Database Provisioning Script
 * Creates Platform DB and Tenant DBs for all institutes
 * 
 * Usage:
 *   ts-node src/migration/scripts/1-provision-databases.ts [--dry-run] [--verbose]
 */

import { PrismaClient } from '@prisma/client';
import { PrismaClient as PlatformPrismaClient } from '../../generated/platform-client';
import {
    createDatabase,
    runPrismaMigrations,
    testDatabaseConnection,
    generateTenantDbName,
    buildDatabaseUrl,
    parseDatabaseUrl,
} from '../utils/database';
import { MigrationLogger } from '../utils/logger';
import type {
    ProvisionConfig,
    ProvisionResult,
    DatabaseProvisionResult,
    InstituteMetadata,
} from '../types';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = new MigrationLogger(process.argv.includes('--verbose'));
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Get institutes from current database
 */
async function getInstitutesFromCurrentDb(): Promise<InstituteMetadata[]> {
    const prisma = new PrismaClient();

    try {
        const institutes = await prisma.institute.findMany({
            select: {
                id: true,
                name: true,
                slug: true,
                email: true,
                code: true,
                status: true,
                plan: true,
            },
        });

        return institutes as InstituteMetadata[];
    } finally {
        await prisma.$disconnect();
    }
}

/**
 * Provision Platform Database
 */
async function provisionPlatformDb(
    platformDbUrl: string
): Promise<ProvisionResult['platformDb']> {
    logger.subsection('Provisioning Platform Database');

    try {
        // Parse URL to get database name
        const { database: dbName, ...connection } = parseDatabaseUrl(platformDbUrl);

        // Connect to postgres database to create platform database
        const adminDbUrl = buildDatabaseUrl(
            connection.host,
            connection.port,
            connection.user,
            connection.password,
            'postgres'
        );

        if (!DRY_RUN) {
            // Create database
            const createResult = await createDatabase(dbName, adminDbUrl);

            if (!createResult.success && createResult.error) {
                throw new Error(createResult.error);
            }

            if (createResult.alreadyExists) {
                logger.info(`Database already exists: ${dbName}`);
            } else {
                logger.info(`Created database: ${dbName}`);
            }

            // Test connection
            logger.info('Testing connection...');
            const testResult = await testDatabaseConnection(platformDbUrl);

            if (!testResult.success) {
                throw new Error(testResult.error || 'Connection test failed');
            }

            // Run migrations
            logger.info('Running Prisma migrations...');
            const schemaPath = path.join(__dirname, '../../prisma/platform-schema.prisma');
            const migrateResult = await runPrismaMigrations(platformDbUrl, schemaPath);

            if (!migrateResult.success) {
                throw new Error(migrateResult.error || 'Migration failed');
            }

            logger.success(`Platform database provisioned: ${dbName}`);

            return {
                url: platformDbUrl,
                status: 'success',
                migrationsApplied: 1,
            };
        } else {
            logger.info(`[DRY RUN] Would create database: ${dbName}`);
            return {
                url: platformDbUrl,
                status: 'success',
            };
        }
    } catch (error: any) {
        logger.error('Failed to provision platform database', error);
        return {
            url: platformDbUrl,
            status: 'error',
            error: error.message,
        };
    }
}

/**
 * Provision Tenant Database
 */
async function provisionTenantDb(
    institute: InstituteMetadata,
    tenantDbTemplate: string
): Promise<DatabaseProvisionResult> {
    const dbName = generateTenantDbName(institute.slug);

    try {
        // Parse template URL
        const connection = parseDatabaseUrl(tenantDbTemplate);

        // Build tenant DB URL
        const tenantDbUrl = buildDatabaseUrl(
            connection.host,
            connection.port,
            connection.user,
            connection.password,
            dbName
        );

        if (!DRY_RUN) {
            // Connect to postgres database to create tenant database
            const adminDbUrl = buildDatabaseUrl(
                connection.host,
                connection.port,
                connection.user,
                connection.password,
                'postgres'
            );

            // Create database
            const createResult = await createDatabase(dbName, adminDbUrl);

            if (!createResult.success && createResult.error) {
                throw new Error(createResult.error);
            }

            if (createResult.alreadyExists) {
                logger.debug(`Database already exists: ${dbName}`);
            } else {
                logger.debug(`Created database: ${dbName}`);
            }

            // Test connection
            const testResult = await testDatabaseConnection(tenantDbUrl);

            if (!testResult.success) {
                throw new Error(testResult.error || 'Connection test failed');
            }

            // Run migrations
            const schemaPath = path.join(__dirname, '../../prisma/schema.prisma');
            const migrateResult = await runPrismaMigrations(tenantDbUrl, schemaPath);

            if (!migrateResult.success) {
                throw new Error(migrateResult.error || 'Migration failed');
            }

            return {
                instituteId: institute.id,
                slug: institute.slug,
                dbName,
                dbUrl: tenantDbUrl,
                status: 'success',
                migrationsApplied: 1,
            };
        } else {
            logger.debug(`[DRY RUN] Would create database: ${dbName}`);
            return {
                instituteId: institute.id,
                slug: institute.slug,
                dbName,
                dbUrl: tenantDbUrl,
                status: 'success',
            };
        }
    } catch (error: any) {
        logger.error(`Failed to provision tenant database for ${institute.slug}`, error);
        return {
            instituteId: institute.id,
            slug: institute.slug,
            dbName,
            dbUrl: '',
            status: 'error',
            error: error.message,
        };
    }
}

/**
 * Main provisioning function
 */
async function main() {
    logger.section('Database Provisioning');

    if (DRY_RUN) {
        logger.warn('Running in DRY RUN mode - no changes will be made');
    }

    // Get configuration from environment
    const platformDbUrl = process.env.PLATFORM_DATABASE_URL;
    const tenantDbTemplate = process.env.TENANT_DATABASE_TEMPLATE || process.env.DATABASE_URL;

    if (!platformDbUrl) {
        logger.error('PLATFORM_DATABASE_URL not set in environment');
        process.exit(1);
    }

    if (!tenantDbTemplate) {
        logger.error('TENANT_DATABASE_TEMPLATE or DATABASE_URL not set in environment');
        process.exit(1);
    }

    logger.info(`Platform DB URL: ${platformDbUrl.replace(/:[^:@]+@/, ':****@')}`);
    logger.info(`Tenant DB Template: ${tenantDbTemplate.replace(/:[^:@]+@/, ':****@')}`);

    // Get institutes
    logger.subsection('Fetching Institutes');
    const institutes = await getInstitutesFromCurrentDb();
    logger.info(`Found ${institutes.length} institutes`);

    // Provision Platform DB
    const platformResult = await provisionPlatformDb(platformDbUrl);

    if (platformResult.status === 'error') {
        logger.error('Platform database provisioning failed. Aborting.');
        process.exit(1);
    }

    // Provision Tenant DBs
    logger.subsection(`Provisioning ${institutes.length} Tenant Databases`);

    const tenantResults: DatabaseProvisionResult[] = [];
    let current = 0;

    for (const institute of institutes) {
        current++;
        logger.progress(current, institutes.length, `${institute.slug}`);

        const result = await provisionTenantDb(institute, tenantDbTemplate);
        tenantResults.push(result);
    }

    // Summary
    const summary = {
        total: tenantResults.length,
        successful: tenantResults.filter(r => r.status === 'success').length,
        failed: tenantResults.filter(r => r.status === 'error').length,
        skipped: tenantResults.filter(r => r.status === 'skipped').length,
    };

    const result: ProvisionResult = {
        platformDb: platformResult,
        tenantDbs: tenantResults,
        summary,
    };

    // Display results
    logger.section('Provisioning Results');

    logger.subsection('Platform Database');
    logger.info(`Status: ${platformResult.status}`);
    if (platformResult.error) {
        logger.error(`Error: ${platformResult.error}`);
    }

    logger.subsection('Tenant Databases');
    logger.summary({
        'Total': summary.total,
        'Successful': summary.successful,
        'Failed': summary.failed,
        'Skipped': summary.skipped,
    });

    if (summary.failed > 0) {
        logger.subsection('Failed Databases');
        const failed = tenantResults.filter(r => r.status === 'error');
        logger.table(
            failed.map(r => ({
                Institute: r.slug,
                Database: r.dbName,
                Error: r.error || 'Unknown',
            })),
            ['Institute', 'Database', 'Error']
        );
    }

    logger.finish(`Provisioning completed in ${logger.elapsed()}`);

    // Exit with error if any failed
    if (summary.failed > 0) {
        process.exit(1);
    }
}

// Run main function
main().catch((error) => {
    logger.error('Unexpected error', error);
    process.exit(1);
});
