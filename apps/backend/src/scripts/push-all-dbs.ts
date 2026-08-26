import 'dotenv/config';
import { PrismaClient as PlatformPrismaClient } from '../generated/platform-client';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

const platformPrisma = new PlatformPrismaClient({
    datasources: {
        db: {
            url: process.env.PLATFORM_DATABASE_URL,
        },
    },
});

async function main() {
    console.log('🏁 Starting db push to all databases...');

    // 1. Get all institutes with databases
    const institutes = await platformPrisma.institute.findMany({
        where: {
            status: 'ACTIVE',
        },
        select: {
            id: true,
            slug: true,
            databaseName: true,
            databaseHost: true,
            databasePort: true,
            databaseUser: true,
            databasePassword: true,
        },
    });

    console.log(`🔍 Found ${institutes.length} active institutes.`);

    const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
    console.log(`Schema path: ${schemaPath}`);

    // 2. Loop and push to each tenant DB
    for (const institute of institutes) {
        if (!institute.databaseName) {
            console.log(`⚠️ Skip ${institute.slug} - No database provisioned.`);
            continue;
        }

        const dbUrl = `postgresql://${institute.databaseUser}:${institute.databasePassword}@${institute.databaseHost}:${institute.databasePort || 5432}/${institute.databaseName}`;
        console.log(`🚀 Pushing schema to tenant: ${institute.slug} (${institute.databaseName})...`);

        try {
            const { stdout } = await execAsync(
                `npx prisma db push --schema="${schemaPath}" --accept-data-loss --skip-generate`,
                {
                    env: {
                        ...process.env,
                        DATABASE_URL: dbUrl,
                    },
                }
            );
            console.log(`✅ Success for ${institute.slug}:\n`, stdout);
        } catch (error: any) {
            console.error(`❌ Error for ${institute.slug}:`, error.message);
        }
    }

    // 3. Pushing schema to the main development database just in case
    if (process.env.DATABASE_URL) {
        console.log(`🚀 Pushing schema to default dev database: ${process.env.DATABASE_URL.split('@')[1]}...`);
        try {
            const { stdout } = await execAsync(
                `npx prisma db push --schema="${schemaPath}" --accept-data-loss --skip-generate`,
                {
                    env: {
                        ...process.env,
                        DATABASE_URL: process.env.DATABASE_URL,
                    },
                }
            );
            console.log('✅ Success for dev database:\n', stdout);
        } catch (error: any) {
            console.error('❌ Error for dev database:', error.message);
        }
    }

    await platformPrisma.$disconnect();
    console.log('🎉 Done!');
}

main().catch(console.error);
