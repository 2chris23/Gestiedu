/**
 * Script para migrar institutos desde bases de datos dedicadas a la arquitectura
 * Schema-per-Tenant en la base de datos compartida (gestion_escolar).
 *
 * Mantiene intactas las bases de datos originales como respaldo.
 */
import { execSync } from 'child_process';
import { Client } from 'pg';
import path from 'path';
import fs from 'fs';
import { PrismaClient as PlatformPrismaClient } from '../generated/platform-client';
import { PrismaClient as TenantPrismaClient } from '@prisma/client';
import { deriveTenantSchema } from '../config/tenant-db-url';

const platformPrisma = new PlatformPrismaClient();

async function migrateAllDedicatedTenants() {
  console.log('--- INICIANDO MIGRACION A SCHEMA-PER-TENANT ---');

  const institutes = await platformPrisma.institute.findMany({
    where: {
      status: 'ACTIVE',
    },
  });

  const sharedDbTargetName = process.env.SHARED_TENANT_DB_NAME || 'gestion_escolar';

  for (const inst of institutes) {
    const isDedicated =
      Boolean(inst.databaseName) &&
      !inst.databaseSchema &&
      inst.databaseName !== sharedDbTargetName;

    if (!isDedicated) {
      console.log(`Instituto ${inst.slug} ya se encuentra en modo compartido o no requiere migracion.`);
      continue;
    }

    const sourceDb = inst.databaseName!;
    const targetSchema = deriveTenantSchema(inst.slug);

    console.log(`\nMigrando instituto ${inst.name} (${inst.slug}):`);
    console.log(`  Origen: BD dedicada '${sourceDb}' (esquema public)`);
    console.log(`  Destino: BD compartida '${sharedDbTargetName}' (esquema '${targetSchema}')`);

    const dbUser = inst.databaseUser || 'postgres';
    const dbPassword = inst.databasePassword || process.env.DATABASE_PASSWORD;
    // Sin contraseña escrita aquí: el repositorio es público.
    if (!dbPassword) throw new Error(`Falta la contraseña de la base de ${inst.slug} (DATABASE_PASSWORD)`);
    const dbHost = inst.databaseHost || 'localhost';
    const dbPort = inst.databasePort || 5432;

    const sourceClient = new Client({
      user: dbUser,
      password: dbPassword,
      host: dbHost,
      port: dbPort,
      database: sourceDb,
    });

    try {
      await sourceClient.connect();

      // 1. Renombrar temporalmente public a targetSchema en la base origen
      await sourceClient.query(`ALTER SCHEMA public RENAME TO "${targetSchema}"`);

      // 2. Extraer volcado con pg_dump
      const dumpFile = path.join(process.cwd(), `temp_dump_${targetSchema}.sql`);
      const pgDumpPath = 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe';
      const psqlPath = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';

      execSync(
        `"${pgDumpPath}" -h ${dbHost} -p ${dbPort} -U ${dbUser} -d "${sourceDb}" -n "${targetSchema}" -O -x -F p -f "${dumpFile}"`,
        {
          env: { ...process.env, PGPASSWORD: dbPassword },
          stdio: 'pipe',
        }
      );

      // 3. Restaurar nombre public en base origen para dejarla como respaldo inalterado
      await sourceClient.query(`ALTER SCHEMA "${targetSchema}" RENAME TO public`);

      // 4. Restaurar volcado en la base de datos compartida
      execSync(
        `"${psqlPath}" -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${sharedDbTargetName} -f "${dumpFile}"`,
        {
          env: { ...process.env, PGPASSWORD: dbPassword },
          stdio: 'pipe',
        }
      );

      if (fs.existsSync(dumpFile)) {
        fs.unlinkSync(dumpFile);
      }

      // 5. Actualizar registro en platform DB
      await platformPrisma.institute.update({
        where: { id: inst.id },
        data: {
          databaseName: sharedDbTargetName,
          databaseSchema: targetSchema,
        },
      });

      // 6. Validar conexion con TenantPrismaClient
      const tenantUrl = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${sharedDbTargetName}?schema=${targetSchema}`;
      const tenantPrisma = new TenantPrismaClient({
        datasources: { db: { url: tenantUrl } },
      });

      const usersCount = await tenantPrisma.user.count();
      console.log(`  MIGRACION COMPLETADA: ${usersCount} usuarios verificados en esquema '${targetSchema}'.`);
      await tenantPrisma.$disconnect();
    } catch (err: any) {
      console.error(`  ERROR migrando ${inst.slug}:`, err.message);
      // Intentar restaurar esquema public si fallo a mitad
      try {
        await sourceClient.query(`ALTER SCHEMA "${targetSchema}" RENAME TO public`);
      } catch {}
    } finally {
      await sourceClient.end();
    }
  }

  await platformPrisma.$disconnect();
  console.log('\n--- PROCESO DE MIGRACION FINALIZADO ---');
}

if (require.main === module) {
  migrateAllDedicatedTenants().catch((err) => {
    console.error('Falla critica en script de migracion:', err);
    process.exit(1);
  });
}

export { migrateAllDedicatedTenants };
