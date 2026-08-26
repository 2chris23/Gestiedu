/**
 * Database Migration Utilities
 * Helper functions for database provisioning and migration
 */

import { PrismaClient } from '@prisma/client';
import { PrismaClient as PlatformPrismaClient } from '../../generated/platform-client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Create a database if it doesn't exist
 */
export async function createDatabase(
    dbName: string,
    adminDbUrl: string
): Promise<{ success: boolean; error?: string; alreadyExists?: boolean }> {
    try {
        // Connect to postgres database
        const adminClient = new PrismaClient({
            datasources: { db: { url: adminDbUrl } },
        });

        // Check if database already exists
        const result: any[] = await adminClient.$queryRawUnsafe(
            `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`
        );

        if (result.length > 0) {
            await adminClient.$disconnect();
            return { success: true, alreadyExists: true };
        }

        // Create database if it doesn't exist
        await adminClient.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
        await adminClient.$disconnect();

        return { success: true, alreadyExists: false };
    } catch (error: any) {
        // Database might already exist (race condition)
        if (error.message?.includes('already exists')) {
            return { success: true, alreadyExists: true };
        }
        return { success: false, error: error.message };
    }
}

/**
 * Drop a database (use with caution!)
 */
export async function dropDatabase(
    dbName: string,
    adminDbUrl: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const adminClient = new PrismaClient({
            datasources: { db: { url: adminDbUrl } },
        });

        // Terminate existing connections
        await adminClient.$executeRawUnsafe(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = '${dbName}'
        AND pid <> pg_backend_pid()
    `);

        await adminClient.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
        await adminClient.$disconnect();

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Run Prisma migrations on a database (cross-platform)
 */
export async function runPrismaMigrations(
    dbUrl: string,
    schemaPath: string
): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
        // Use prisma db push (works without migration files)
        const { stdout, stderr } = await execAsync(
            `npx prisma db push --schema="${schemaPath}" --accept-data-loss --skip-generate`,
            {
                maxBuffer: 1024 * 1024 * 10,
                env: { ...process.env, DATABASE_URL: dbUrl },
            }
        );

        return { success: true, output: stdout };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Test database connectivity
 */
export async function testDatabaseConnection(
    dbUrl: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const client = new PrismaClient({
            datasources: { db: { url: dbUrl } },
        });

        await client.$connect();
        await client.$disconnect();

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Get record count for a model
 */
export async function getModelCount(
    prisma: PrismaClient | PlatformPrismaClient,
    modelName: string,
    where?: any
): Promise<number> {
    try {
        const model = (prisma as any)[modelName.toLowerCase()];
        if (!model) {
            throw new Error(`Model ${modelName} not found`);
        }
        return await model.count({ where });
    } catch (error) {
        console.error(`Error counting ${modelName}:`, error);
        return 0;
    }
}

/**
 * Build database URL from components
 */
export function buildDatabaseUrl(
    host: string,
    port: number,
    user: string,
    password: string,
    database: string
): string {
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

/**
 * Parse database URL to components
 */
export function parseDatabaseUrl(url: string): {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
} {
    const regex = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
    const match = url.match(regex);

    if (!match) {
        throw new Error('Invalid database URL format');
    }

    return {
        user: match[1],
        password: match[2],
        host: match[3],
        port: parseInt(match[4]),
        database: match[5],
    };
}

/**
 * Generate tenant database name from slug
 */
export function generateTenantDbName(slug: string): string {
    return `tenant_${slug.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Create progress bar string
 */
export function createProgressBar(current: number, total: number, width: number = 40): string {
    const percentage = Math.min(100, Math.max(0, (current / total) * 100));
    const filled = Math.floor((percentage / 100) * width);
    const empty = width - filled;

    return `[${'█'.repeat(filled)}${' '.repeat(empty)}] ${percentage.toFixed(1)}%`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
): Promise<T> {
    let lastError: Error;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            if (i < maxRetries - 1) {
                const delay = initialDelay * Math.pow(2, i);
                console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
                await sleep(delay);
            }
        }
    }

    throw lastError!;
}
