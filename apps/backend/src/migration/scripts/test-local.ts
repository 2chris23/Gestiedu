#!/usr/bin/env ts-node
/**
 * Local Testing Script
 * Tests migration scripts in local environment with sample data
 * 
 * Usage:
 *   ts-node src/migration/scripts/test-local.ts
 */

import { PrismaClient } from '@prisma/client';
import { MigrationLogger } from '../utils/logger';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

const logger = new MigrationLogger(true);

async function createSampleData() {
    logger.subsection('Creating Sample Data');

    const prisma = new PrismaClient();

    try {
        // Create sample institute
        const institute = await prisma.institute.upsert({
            where: { slug: 'test-institute' },
            create: {
                name: 'Test Institute',
                code: 'TEST001',
                email: 'test@example.com',
                slug: 'test-institute',
                subdomain: 'test',
                status: 'ACTIVE',
                plan: 'BASIC',
                maxStudents: 100,
                maxTeachers: 10,
            },
            update: {},
        });

        logger.success(`Created institute: ${institute.name}`);

        // Create sample users
        const users = await Promise.all([
            prisma.user.upsert({
                where: { email: 'admin@test.com' },
                create: {
                    email: 'admin@test.com',
                    password: 'hashed_password',
                    firstName: 'Test',
                    lastName: 'Admin',
                    role: 'ADMIN',
                    instituteId: institute.id,
                } as any,
                update: {},
            }),
            prisma.user.upsert({
                where: { email: 'teacher@test.com' },
                create: {
                    email: 'teacher@test.com',
                    password: 'hashed_password',
                    firstName: 'Test',
                    lastName: 'Teacher',
                    role: 'TEACHER',
                    instituteId: institute.id,
                } as any,
                update: {},
            }),
        ]);

        logger.success(`Created ${users.length} users`);

        // Create academic year
        const academicYear = await prisma.academicYear.upsert({
            where: { id: 'test-year-2024' },
            create: {
                id: 'test-year-2024',
                name: '2024',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-12-31'),
                status: 'ACTIVE',
                instituteId: institute.id,
            },
            update: {},
        });

        logger.success(`Created academic year: ${academicYear.name}`);

        logger.success('Sample data created successfully');
    } finally {
        await prisma.$disconnect();
    }
}

async function runMigrationTest() {
    logger.section('Local Migration Test');

    try {
        // Step 1: Create sample data
        await createSampleData();

        // Step 2: Run provisioning (dry-run)
        logger.subsection('Testing Provisioning (Dry Run)');
        execSync('npx ts-node src/migration/scripts/1-provision-databases.ts --dry-run --verbose', {
            stdio: 'inherit',
        });

        // Step 3: Run migration (dry-run)
        logger.subsection('Testing Migration (Dry Run)');
        execSync('npx ts-node src/migration/scripts/2-migrate-data.ts --dry-run --verbose', {
            stdio: 'inherit',
        });

        logger.finish('Local test completed successfully');
        logger.info('To run actual migration, remove --dry-run flag');
    } catch (error: any) {
        logger.error('Test failed', error);
        process.exit(1);
    }
}

runMigrationTest().catch((error) => {
    logger.error('Unexpected error', error);
    process.exit(1);
});
