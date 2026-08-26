#!/usr/bin/env ts-node
/**
 * Pre-flight Checks Script
 * Validates environment and prerequisites before migration
 * 
 * Usage:
 *   ts-node src/migration/scripts/0-preflight-checks.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaClient as PlatformPrismaClient } from '../../generated/platform-client';
import { MigrationLogger } from '../utils/logger';
import { testDatabaseConnection, parseDatabaseUrl } from '../utils/database';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const logger = new MigrationLogger(true);

interface PreflightCheck {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    critical: boolean;
}

const checks: PreflightCheck[] = [];

/**
 * Check environment variables
 */
async function checkEnvironmentVariables(): Promise<void> {
    logger.subsection('Environment Variables');

    const required = [
        'DATABASE_URL',
        'PLATFORM_DATABASE_URL',
    ];

    const optional = [
        'TENANT_DATABASE_TEMPLATE',
        'VERBOSE',
    ];

    for (const varName of required) {
        if (process.env[varName]) {
            checks.push({
                name: `ENV: ${varName}`,
                status: 'pass',
                message: 'Set',
                critical: true,
            });
            logger.success(`${varName}: Set`);
        } else {
            checks.push({
                name: `ENV: ${varName}`,
                status: 'fail',
                message: 'Not set',
                critical: true,
            });
            logger.error(`${varName}: Not set`);
        }
    }

    for (const varName of optional) {
        if (process.env[varName]) {
            logger.info(`${varName}: Set`);
        } else {
            logger.warn(`${varName}: Not set (optional)`);
        }
    }
}

/**
 * Check database connectivity
 */
async function checkDatabaseConnectivity(): Promise<void> {
    logger.subsection('Database Connectivity');

    const sourceDbUrl = process.env.DATABASE_URL;
    const platformDbUrl = process.env.PLATFORM_DATABASE_URL;

    if (sourceDbUrl) {
        const result = await testDatabaseConnection(sourceDbUrl);
        if (result.success) {
            checks.push({
                name: 'Source DB Connection',
                status: 'pass',
                message: 'Connected successfully',
                critical: true,
            });
            logger.success('Source database: Connected');
        } else {
            checks.push({
                name: 'Source DB Connection',
                status: 'fail',
                message: result.error || 'Connection failed',
                critical: true,
            });
            logger.error(`Source database: ${result.error}`);
        }
    }

    if (platformDbUrl) {
        const result = await testDatabaseConnection(platformDbUrl);
        if (result.success) {
            checks.push({
                name: 'Platform DB Connection',
                status: 'pass',
                message: 'Connected successfully',
                critical: false,
            });
            logger.success('Platform database: Connected');
        } else {
            checks.push({
                name: 'Platform DB Connection',
                status: 'warn',
                message: 'Will be created during provisioning',
                critical: false,
            });
            logger.warn('Platform database: Not accessible (will be created)');
        }
    }
}

/**
 * Check Prisma schema files
 */
async function checkPrismaSchemas(): Promise<void> {
    logger.subsection('Prisma Schemas');

    const schemas = [
        { name: 'Main Schema', path: path.join(__dirname, '../../prisma/schema.prisma') },
        { name: 'Platform Schema', path: path.join(__dirname, '../../prisma/platform-schema.prisma') },
    ];

    for (const schema of schemas) {
        if (fs.existsSync(schema.path)) {
            checks.push({
                name: schema.name,
                status: 'pass',
                message: 'Found',
                critical: true,
            });
            logger.success(`${schema.name}: Found`);
        } else {
            checks.push({
                name: schema.name,
                status: 'fail',
                message: 'Not found',
                critical: true,
            });
            logger.error(`${schema.name}: Not found at ${schema.path}`);
        }
    }
}

/**
 * Check Prisma clients
 */
async function checkPrismaClients(): Promise<void> {
    logger.subsection('Prisma Clients');

    try {
        const prisma = new PrismaClient();
        await prisma.$disconnect();
        checks.push({
            name: 'Main Prisma Client',
            status: 'pass',
            message: 'Generated',
            critical: true,
        });
        logger.success('Main Prisma Client: Generated');
    } catch (error: any) {
        checks.push({
            name: 'Main Prisma Client',
            status: 'fail',
            message: error.message,
            critical: true,
        });
        logger.error(`Main Prisma Client: ${error.message}`);
    }

    try {
        const platformPrisma = new PlatformPrismaClient();
        await platformPrisma.$disconnect();
        checks.push({
            name: 'Platform Prisma Client',
            status: 'pass',
            message: 'Generated',
            critical: true,
        });
        logger.success('Platform Prisma Client: Generated');
    } catch (error: any) {
        checks.push({
            name: 'Platform Prisma Client',
            status: 'fail',
            message: error.message,
            critical: true,
        });
        logger.error(`Platform Prisma Client: ${error.message}`);
    }
}

/**
 * Check disk space
 */
async function checkDiskSpace(): Promise<void> {
    logger.subsection('Disk Space');

    // Note: This is a simplified check. In production, you'd want to check actual disk space
    logger.warn('Disk space check not implemented (manual verification required)');
    checks.push({
        name: 'Disk Space',
        status: 'warn',
        message: 'Manual verification required',
        critical: false,
    });
}

/**
 * Check data counts
 */
async function checkDataCounts(): Promise<void> {
    logger.subsection('Data Counts');

    const sourceDbUrl = process.env.DATABASE_URL;
    if (!sourceDbUrl) return;

    try {
        const prisma = new PrismaClient({ datasources: { db: { url: sourceDbUrl } } });

        const institutes = await prisma.institute.count();
        const users = await prisma.user.count();
        const students = await prisma.user.count({ where: { role: 'STUDENT' } });

        logger.info(`Institutes: ${institutes}`);
        logger.info(`Total Users: ${users}`);
        logger.info(`Students: ${students}`);

        checks.push({
            name: 'Data Counts',
            status: 'pass',
            message: `${institutes} institutes, ${users} users`,
            critical: false,
        });

        await prisma.$disconnect();
    } catch (error: any) {
        logger.error(`Failed to count data: ${error.message}`);
        checks.push({
            name: 'Data Counts',
            status: 'warn',
            message: error.message,
            critical: false,
        });
    }
}

/**
 * Main function
 */
async function main() {
    logger.section('Pre-flight Checks');

    await checkEnvironmentVariables();
    await checkDatabaseConnectivity();
    await checkPrismaSchemas();
    await checkPrismaClients();
    await checkDiskSpace();
    await checkDataCounts();

    // Summary
    logger.section('Summary');

    const passed = checks.filter(c => c.status === 'pass').length;
    const failed = checks.filter(c => c.status === 'fail').length;
    const warnings = checks.filter(c => c.status === 'warn').length;
    const criticalFailed = checks.filter(c => c.status === 'fail' && c.critical).length;

    logger.summary({
        'Total Checks': checks.length,
        'Passed': passed,
        'Failed': failed,
        'Warnings': warnings,
        'Critical Failures': criticalFailed,
    });

    if (failed > 0) {
        logger.subsection('Failed Checks');
        const failedChecks = checks.filter(c => c.status === 'fail');
        logger.table(
            failedChecks.map(c => ({
                Check: c.name,
                Status: c.status,
                Message: c.message,
                Critical: c.critical ? 'Yes' : 'No',
            })),
            ['Check', 'Status', 'Message', 'Critical']
        );
    }

    if (warnings > 0) {
        logger.subsection('Warnings');
        const warnChecks = checks.filter(c => c.status === 'warn');
        warnChecks.forEach(c => logger.warn(`${c.name}: ${c.message}`));
    }

    if (criticalFailed > 0) {
        logger.error(`\n❌ ${criticalFailed} critical checks failed. Please fix before proceeding.`);
        process.exit(1);
    } else if (failed > 0) {
        logger.warn(`\n⚠️  ${failed} non-critical checks failed. Review before proceeding.`);
        process.exit(1);
    } else if (warnings > 0) {
        logger.success(`\n✅ All critical checks passed. ${warnings} warnings to review.`);
    } else {
        logger.success('\n✅ All checks passed! Ready for migration.');
    }

    logger.finish(`Pre-flight checks completed in ${logger.elapsed()}`);
}

main().catch((error) => {
    logger.error('Unexpected error', error);
    process.exit(1);
});
