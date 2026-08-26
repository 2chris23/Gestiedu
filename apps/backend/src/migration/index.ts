/**
 * Migration Scripts Index
 * Exports all migration utilities and types
 */

// Types
export * from './types';

// Utils
export * from './utils/database';
export * from './utils/logger';

// Re-export for convenience
export { MigrationLogger } from './utils/logger';
export {
    createDatabase,
    dropDatabase,
    runPrismaMigrations,
    testDatabaseConnection,
    getModelCount,
    buildDatabaseUrl,
    parseDatabaseUrl,
    generateTenantDbName,
    formatDuration,
    createProgressBar,
    retryWithBackoff,
} from './utils/database';
