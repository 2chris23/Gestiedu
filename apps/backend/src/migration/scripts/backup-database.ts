#!/usr/bin/env ts-node
/**
 * Database Backup Script
 * Creates a backup of the source database before migration
 * 
 * Usage:
 *   ts-node src/migration/scripts/backup-database.ts [--output=path/to/backup.sql]
 */

import { MigrationLogger } from '../utils/logger';
import { parseDatabaseUrl } from '../utils/database';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const logger = new MigrationLogger(true);

/**
 * Create database backup using pg_dump
 */
async function createBackup() {
    logger.section('Database Backup');

    const sourceDbUrl = process.env.DATABASE_URL;
    if (!sourceDbUrl) {
        logger.error('DATABASE_URL not set');
        process.exit(1);
    }

    // Parse database URL
    const dbConfig = parseDatabaseUrl(sourceDbUrl);

    // Get output path
    const outputArg = process.argv.find(arg => arg.startsWith('--output='));
    const defaultOutput = path.join(
        __dirname,
        '../../../backups',
        `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`
    );
    const outputPath = outputArg ? outputArg.split('=')[1] : defaultOutput;

    // Create backups directory if it doesn't exist
    const backupsDir = path.dirname(outputPath);
    if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
        logger.info(`Created backups directory: ${backupsDir}`);
    }

    logger.info(`Database: ${dbConfig.database}`);
    logger.info(`Output: ${outputPath}`);

    try {
        // Build pg_dump command
        const pgDumpCmd = `pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -F c -f "${outputPath}"`;

        logger.info('Starting backup...');
        logger.warn('This may take several minutes depending on database size');

        // Set PGPASSWORD environment variable
        const env = { ...process.env, PGPASSWORD: dbConfig.password };

        // Execute pg_dump
        execSync(pgDumpCmd, {
            env,
            stdio: 'inherit',
        });

        // Get file size
        const stats = fs.statSync(outputPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        logger.success(`Backup created successfully!`);
        logger.info(`File: ${outputPath}`);
        logger.info(`Size: ${fileSizeMB} MB`);

        logger.finish(`Backup completed in ${logger.elapsed()}`);
    } catch (error: any) {
        logger.error('Backup failed', error);
        logger.error('Make sure pg_dump is installed and accessible in PATH');
        process.exit(1);
    }
}

createBackup().catch((error) => {
    logger.error('Unexpected error', error);
    process.exit(1);
});
