import { platformPrisma } from '../config/database';

async function runMigration() {
    try {
        console.log('🚀 Iniciando migración de schema...');

        // Add new fields
        await platformPrisma.$executeRawUnsafe(`
            ALTER TABLE "public"."institutes" 
            ADD COLUMN IF NOT EXISTS "isLocal" BOOLEAN NOT NULL DEFAULT true,
            ADD COLUMN IF NOT EXISTS "port" INTEGER,
            ADD COLUMN IF NOT EXISTS "adminId" TEXT;
        `);
        console.log('✅ Campos nuevos agregados');

        // Add unique constraints
        await platformPrisma.$executeRawUnsafe(`
            ALTER TABLE "public"."institutes" 
            DROP CONSTRAINT IF EXISTS "institutes_code_key";
        `);
        await platformPrisma.$executeRawUnsafe(`
            ALTER TABLE "public"."institutes" 
            ADD CONSTRAINT "institutes_code_key" UNIQUE ("code");
        `);
        console.log('✅ Constraint de code agregado');

        await platformPrisma.$executeRawUnsafe(`
            ALTER TABLE "public"."institutes" 
            DROP CONSTRAINT IF EXISTS "institutes_port_key";
        `);
        await platformPrisma.$executeRawUnsafe(`
            ALTER TABLE "public"."institutes" 
            ADD CONSTRAINT "institutes_port_key" UNIQUE ("port");
        `);
        console.log('✅ Constraint de port agregado');

        await platformPrisma.$executeRawUnsafe(`
            ALTER TABLE "public"."institutes" 
            DROP CONSTRAINT IF EXISTS "institutes_adminId_key";
        `);
        await platformPrisma.$executeRawUnsafe(`
            ALTER TABLE "public"."institutes" 
            ADD CONSTRAINT "institutes_adminId_key" UNIQUE ("adminId");
        `);
        console.log('✅ Constraint de adminId agregado');

        // Remove old fields
        await platformPrisma.$executeRawUnsafe(`
            ALTER TABLE "public"."institutes" 
            DROP COLUMN IF EXISTS "plan",
            DROP COLUMN IF EXISTS "maxStudents",
            DROP COLUMN IF EXISTS "maxTeachers";
        `);
        console.log('✅ Campos antiguos eliminados');

        // Add indexes
        await platformPrisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "institutes_port_idx" ON "public"."institutes"("port");
        `);
        console.log('✅ Índice de port creado');

        // Remove old index
        await platformPrisma.$executeRawUnsafe(`
            DROP INDEX IF EXISTS "institutes_plan_idx";
        `);
        console.log('✅ Índice de plan eliminado');

        // Update PlatformConfig
        await platformPrisma.$executeRawUnsafe(`
            ALTER TABLE "public"."platform_config"
            DROP COLUMN IF EXISTS "defaultPlan",
            DROP COLUMN IF EXISTS "maxFreeStudents";
        `);
        console.log('✅ Campos de PlatformConfig actualizados');

        console.log('✅ Migración completada exitosamente');
        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error en la migración:', error.message);
        process.exit(1);
    }
}

runMigration();
