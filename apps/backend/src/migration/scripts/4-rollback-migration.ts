#!/usr/bin/env ts-node
/**
 * Rollback Migration Script
 * Drops all tenant databases and Platform DB (USE WITH CAUTION!)
 * 
 * Usage:
 *   ts-node src/migration/scripts/4-rollback-migration.ts --confirm
 */

import { PrismaClient } from '@prisma/client';
import { MigrationLogger } from '../utils/logger';
import { dropDatabase, generateTenantDbName, parseDatabaseUrl, buildDatabaseUrl } from '../utils/database';
import * as dotenv from 'dotenv';

dotenv.config();

const logger = new MigrationLogger(process.argv.includes('--verbose'));
const CONFIRMED = process.argv.includes('--confirm');

async function main() {
    logger.section('Migration Rollback');

    if (!CONFIRMED) {
        logger.error('This script will DELETE all tenant databases and the platform database!');
        logger.error('To confirm, run with --confirm flag');
        logger.error('Example: ts-node src/migration/scripts/4-rollback-migration.ts --confirm');
        process.exit(1);
    }

    logger.warn('⚠️  WARNING: This will DELETE all migrated databases!');
    logger.warn('⚠️  Make sure you have a backup before proceeding!');

    const sourceDbUrl = process.env.DATABASE_URL;
    const platformDbUrl = process.env.PLATFORM_DATABASE_URL;
    const tenantDbTemplate = process.env.TENANT_DATABASE_TEMPLATE || sourceDbUrl;

    if (!sourceDbUrl || !platformDbUrl || !tenantDbTemplate) {
        logger.error('Missing required environment variables');
        process.exit(1);
    }

    // Get institutes from source database
    const sourcePrisma = new PrismaClient({ datasources: { db: { url: sourceDbUrl } } });

    try {
        const institutes = await sourcePrisma.institute.findMany({
            select: { id: true, slug: true },
        });

        logger.info(`Found ${institutes.length} tenant databases to drop`);

        // Drop tenant databases
        logger.subsection('Dropping Tenant Databases');

        const connection = parseDatabaseUrl(tenantDbTemplate!);
        const adminDbUrl = buildDatabaseUrl(
            connection.host,
            connection.port,
            connection.user,
            connection.password,
            'postgres'
        );

        let current = 0;
        let dropped = 0;
        let failed = 0;

        for (const institute of institutes) {
            current++;
            const dbName = generateTenantDbName(institute.slug);

            logger.progress(current, institutes.length, dbName);

            const result = await dropDatabase(dbName, adminDbUrl);

            if (result.success) {
                dropped++;
            } else {
                failed++;
                logger.error(`Failed to drop ${dbName}: ${result.error}`);
            }
        }

        logger.info(`Dropped: ${dropped}, Failed: ${failed}`);

        // Drop platform database
        logger.subsection('Dropping Platform Database');

        const platformConnection = parseDatabaseUrl(platformDbUrl);
        const platformAdminDbUrl = buildDatabaseUrl(
            platformConnection.host,
            platformConnection.port,
            platformConnection.user,
            platformConnection.password,
            'postgres'
        );

        const platformResult = await dropDatabase(platformConnection.database, platformAdminDbUrl);

        if (platformResult.success) {
            logger.success(`Dropped platform database: ${platformConnection.database}`);
        } else {
            logger.error(`Failed to drop platform database: ${platformResult.error}`);
        }

        logger.finish(`Rollback completed in ${logger.elapsed()}`);

        if (failed > 0) {
            process.exit(1);
        }
    } finally {
        await sourcePrisma.$disconnect();
    }
}

main().catch((error) => {
    logger.error('Unexpected error', error);
    process.exit(1);
});
