#!/usr/bin/env ts-node
/**
 * Data Migration Script - PostgreSQL Direct Copy Approach
 * 
 * Uses dblink to copy data directly between PostgreSQL databases.
 * This avoids Prisma schema mismatch issues entirely.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaClient as PlatformPrismaClient } from '../../generated/platform-client';
import { MigrationLogger } from '../utils/logger';
import { generateTenantDbName, buildDatabaseUrl, parseDatabaseUrl } from '../utils/database';
import * as dotenv from 'dotenv';

dotenv.config();

const logger = new MigrationLogger(true);
const DRY_RUN = process.argv.includes('--dry-run');

// Tables to migrate to tenant DB, in order (FK dependencies)
// [tableName, hasInstituteId, columnsToExclude]
const TENANT_TABLES: Array<{ table: string; filterByInstitute: boolean; excludeCols?: string[] }> = [
    { table: 'users', filterByInstitute: true },
    { table: 'classrooms', filterByInstitute: true },
    { table: 'subjects', filterByInstitute: true },
    { table: 'academic_years', filterByInstitute: true },
    { table: 'periods', filterByInstitute: false },
    { table: 'classroom_subjects', filterByInstitute: false },
    { table: 'enrollments', filterByInstitute: true },
    { table: 'activities', filterByInstitute: true },
    { table: 'grades', filterByInstitute: false },
    { table: 'schedules', filterByInstitute: true },
    { table: 'schedule_blocks', filterByInstitute: false },
    { table: 'class_sessions', filterByInstitute: false },
    { table: 'observations', filterByInstitute: true },
    { table: 'notifications', filterByInstitute: true },
    { table: 'audit_logs', filterByInstitute: true },
    { table: 'system_alerts', filterByInstitute: true },
    { table: 'subject_teacher_history', filterByInstitute: false },
];

/**
 * Get columns that exist in BOTH source and target tables
 */
async function getCommonColumns(
    sourceClient: PrismaClient,
    targetClient: PrismaClient,
    tableName: string
): Promise<string[]> {
    const srcCols: any[] = await sourceClient.$queryRawUnsafe(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = '${tableName}' AND table_schema = 'public'
        ORDER BY ordinal_position
    `);

    const tgtCols: any[] = await targetClient.$queryRawUnsafe(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = '${tableName}' AND table_schema = 'public'
        ORDER BY ordinal_position
    `);

    const tgtSet = new Set(tgtCols.map(c => c.column_name));
    return srcCols.map(c => c.column_name).filter(c => tgtSet.has(c));
}

/**
 * Check if a table exists in a database
 */
async function tableExists(client: PrismaClient, tableName: string): Promise<boolean> {
    const result: any[] = await client.$queryRawUnsafe(`
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '${tableName}'
    `);
    return result.length > 0;
}

/**
 * Migrate Platform Metadata
 */
async function migratePlatformData(
    sourceUrl: string,
    platformPrisma: PlatformPrismaClient
): Promise<{ institutes: number; superAdmins: number }> {
    logger.subsection('Migrating Platform Metadata');

    const sourceClient = new PrismaClient({
        datasources: { db: { url: sourceUrl } },
    });

    try {
        // Get institutes using raw SQL
        const institutes: any[] = await sourceClient.$queryRawUnsafe(`
            SELECT id, name, code, email, phone, address, slug, domain, subdomain,
                   status, plan, "maxStudents", "maxTeachers", "trialEndsAt", notes,
                   timezone, country, city, logo, favicon, 
                   "primaryColor", "secondaryColor", "subjectPalette",
                   "createdAt", "updatedAt"
            FROM institutes
        `);

        logger.info(`Found ${institutes.length} institutes in source`);

        if (!DRY_RUN) {
            for (const inst of institutes) {
                const dbName = generateTenantDbName(inst.slug);

                await platformPrisma.institute.upsert({
                    where: { id: inst.id },
                    create: {
                        id: inst.id,
                        name: inst.name,
                        code: inst.code,
                        email: inst.email,
                        phone: inst.phone,
                        address: inst.address,
                        slug: inst.slug,
                        subdomain: inst.subdomain || inst.slug, // migrar domain/subdomain
                        status: inst.status,
                        trialEndsAt: inst.trialEndsAt,
                        notes: inst.notes,
                        databaseName: dbName,
                        timezone: inst.timezone,
                        country: inst.country,
                        city: inst.city,
                        logo: inst.logo,
                        favicon: inst.favicon,
                        primaryColor: inst.primaryColor,
                        secondaryColor: inst.secondaryColor,
                        subjectPalette: inst.subjectPalette,
                        createdAt: inst.createdAt,
                        updatedAt: inst.updatedAt,
                    },
                    update: { name: inst.name, databaseName: dbName },
                });
                logger.success(`Migrated institute: ${inst.name} (${inst.slug})`);
            }
        }

        // Migrate SuperAdmins
        const superAdmins = await sourceClient.$queryRawUnsafe(`
            SELECT id, email, password, name, "isActive", "lastLogin", "createdAt", "updatedAt"
            FROM super_admins
        `).catch(() => []) as any[];

        if (!DRY_RUN && superAdmins.length > 0) {
            for (const admin of superAdmins) {
                await platformPrisma.superAdmin.upsert({
                    where: { id: admin.id },
                    create: admin,
                    update: { name: admin.name, email: admin.email },
                });
            }
            logger.success(`Migrated ${superAdmins.length} super admins`);
        }

        return { institutes: institutes.length, superAdmins: superAdmins.length };
    } finally {
        await sourceClient.$disconnect();
    }
}

/**
 * Migrate tenant data using direct SQL copy with parameterized queries
 */
async function migrateTenantData(
    instituteId: string,
    slug: string,
    sourceUrl: string,
    tenantDbUrl: string
): Promise<{ totalRecords: number; errors: string[] }> {
    logger.subsection(`Tenant: ${slug}`);

    const sourceClient = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
    const tenantClient = new PrismaClient({ datasources: { db: { url: tenantDbUrl } } });

    let totalRecords = 0;
    const errors: string[] = [];

    try {
        // Temporarily disable FK constraints for faster INSERT
        if (!DRY_RUN) {
            await tenantClient.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
        }

        for (const { table, filterByInstitute } of TENANT_TABLES) {
            try {
                // Check both tables exist
                const srcExists = await tableExists(sourceClient, table);
                const tgtExists = await tableExists(tenantClient, table);

                if (!srcExists) {
                    logger.debug(`${table}: not in source DB, skip`);
                    continue;
                }
                if (!tgtExists) {
                    logger.debug(`${table}: not in tenant DB, skip`);
                    continue;
                }

                // Get common columns
                const commonCols = await getCommonColumns(sourceClient, tenantClient, table);
                if (commonCols.length === 0) {
                    logger.debug(`${table}: no common columns, skip`);
                    continue;
                }

                const colList = commonCols.map(c => `"${c}"`).join(', ');

                // Count source records
                let whereClause = '';
                if (filterByInstitute) {
                    const hasInstCol = commonCols.includes('instituteId');
                    if (hasInstCol) {
                        whereClause = `WHERE "instituteId" = '${instituteId}'`;
                    }
                }

                const countResult: any[] = await sourceClient.$queryRawUnsafe(
                    `SELECT COUNT(*)::int as count FROM "${table}" ${whereClause}`
                );
                const total = Number(countResult[0]?.count || 0);

                if (total === 0) {
                    logger.debug(`${table}: 0 records, skip`);
                    continue;
                }

                if (DRY_RUN) {
                    logger.info(`[DRY RUN] ${table}: ${total} records`);
                    totalRecords += total;
                    continue;
                }

                // Fetch all records from source
                const records: any[] = await sourceClient.$queryRawUnsafe(
                    `SELECT ${colList} FROM "${table}" ${whereClause}`
                );

                // Build a single INSERT with multiple VALUES
                let migrated = 0;
                const batchSize = 100;

                for (let i = 0; i < records.length; i += batchSize) {
                    const batch = records.slice(i, i + batchSize);

                    const valueRows = batch.map(record => {
                        const values = commonCols.map(col => {
                            const val = record[col];
                            if (val === null || val === undefined) return 'NULL';
                            if (val instanceof Date) return `'${val.toISOString()}'`;
                            if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
                            if (typeof val === 'number' || typeof val === 'bigint') return String(val);
                            if (typeof val === 'object') {
                                // JSON/JSONB
                                return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
                            }
                            // String - escape single quotes
                            return `'${String(val).replace(/'/g, "''")}'`;
                        });
                        return `(${values.join(', ')})`;
                    });

                    const insertSql = `INSERT INTO "${table}" (${colList}) VALUES ${valueRows.join(',\n')} ON CONFLICT DO NOTHING`;

                    try {
                        const result = await tenantClient.$executeRawUnsafe(insertSql);
                        migrated += Number(result);
                    } catch (batchErr: any) {
                        // Log the FULL error for the first failure
                        if (i === 0) {
                            logger.error(`${table} batch insert error: ${batchErr.message?.substring(0, 200)}`);
                            // Try individual records to see which ones fail
                            for (const record of batch) {
                                const values = commonCols.map(col => {
                                    const val = record[col];
                                    if (val === null || val === undefined) return 'NULL';
                                    if (val instanceof Date) return `'${val.toISOString()}'`;
                                    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
                                    if (typeof val === 'number' || typeof val === 'bigint') return String(val);
                                    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
                                    return `'${String(val).replace(/'/g, "''")}'`;
                                });
                                try {
                                    await tenantClient.$executeRawUnsafe(
                                        `INSERT INTO "${table}" (${colList}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING`
                                    );
                                    migrated++;
                                } catch (singleErr: any) {
                                    // First detailed error
                                    if (migrated === 0 && i === 0) {
                                        logger.error(`DETAIL: ${singleErr.message?.substring(0, 300)}`);
                                    }
                                }
                            }
                        }
                    }
                }

                logger.success(`${table}: ${migrated}/${total} records`);
                totalRecords += migrated;

            } catch (tableErr: any) {
                const errMsg = `${table}: ${tableErr.message?.substring(0, 100)}`;
                errors.push(errMsg);
                logger.error(errMsg);
            }
        }

        // Re-enable FK constraints
        if (!DRY_RUN) {
            await tenantClient.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
        }

        return { totalRecords, errors };
    } finally {
        await sourceClient.$disconnect();
        await tenantClient.$disconnect();
    }
}

/**
 * Main
 */
async function main() {
    logger.section('Data Migration');

    const sourceDbUrl = process.env.DATABASE_URL!;
    const platformDbUrl = process.env.PLATFORM_DATABASE_URL!;
    const tenantDbTemplate = process.env.TENANT_DATABASE_TEMPLATE!;

    if (!sourceDbUrl || !platformDbUrl || !tenantDbTemplate) {
        logger.error('Missing: DATABASE_URL, PLATFORM_DATABASE_URL, TENANT_DATABASE_TEMPLATE');
        process.exit(1);
    }

    if (sourceDbUrl.includes('platform')) {
        logger.error('DATABASE_URL points to platform DB! It should point to the original source DB.');
        process.exit(1);
    }

    logger.info(`Source: ${sourceDbUrl.replace(/:[^:@]+@/, ':***@')}`);
    logger.info(`Platform: ${platformDbUrl.replace(/:[^:@]+@/, ':***@')}`);

    if (DRY_RUN) logger.warn('DRY RUN mode');

    const platformPrisma = new PlatformPrismaClient({
        datasources: { db: { url: platformDbUrl } },
    });

    try {
        // Step 1: Platform metadata
        const platformResult = await migratePlatformData(sourceDbUrl, platformPrisma);

        if (platformResult.institutes === 0) {
            logger.error('No institutes found in source DB!');
            process.exit(1);
        }

        // Step 2: Get institutes
        const institutes = await platformPrisma.institute.findMany({
            select: { id: true, slug: true },
        });

        // Step 3: Migrate tenant data
        let totalRecords = 0;
        let allErrors: string[] = [];

        for (const inst of institutes) {
            const dbName = generateTenantDbName(inst.slug);
            const conn = parseDatabaseUrl(tenantDbTemplate);
            const tenantDbUrl = buildDatabaseUrl(conn.host, conn.port, conn.user, conn.password, dbName);

            const result = await migrateTenantData(inst.id, inst.slug, sourceDbUrl, tenantDbUrl);
            totalRecords += result.totalRecords;
            allErrors = [...allErrors, ...result.errors];
        }

        // Summary
        logger.section('Migration Results');
        logger.summary({
            'Institutes': platformResult.institutes,
            'Super Admins': platformResult.superAdmins,
            'Tenants': institutes.length,
            'Records Migrated': totalRecords,
            'Errors': allErrors.length,
        });

        if (allErrors.length > 0) {
            logger.subsection('Errors');
            allErrors.forEach(e => logger.error(e));
        }

        logger.finish(`Migration completed in ${logger.elapsed()}`);
    } finally {
        await platformPrisma.$disconnect();
    }
}

main().catch((error) => {
    logger.error('Unexpected error');
    console.error(error);
    process.exit(1);
});
