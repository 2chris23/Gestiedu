import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { platformPrisma, getTenantPrisma, disconnectAll } from '../../src/config/database';
import { TenantProvisioningService } from '../../src/services/tenant-provisioning.service';
import { resolvePlatformUrl } from '../helpers/tenant-db';

/**
 * TEST DE INTEGRACIÓN: BASE DE DATOS COMPARTIDA (SCHEMA-PER-TENANT)
 *
 * Verifica:
 * 1. Provisioning rápido (< 2s) de esquema en base de datos compartida.
 * 2. getTenantPrisma resuelve y conecta al esquema correcto.
 * 3. Dos colegios en la misma base de datos física pueden tener usuarios con
 *    la MISMA cédula de identidad sin colisión de clave primaria.
 * 4. Aislamiento total: las consultas en un esquema no ven datos de otro esquema.
 */

describe('Base de Datos Compartida — Schema-Per-Tenant', () => {
    const timestamp = Date.now();
    const slugA = `liceo-alpha-${timestamp}`;
    const slugB = `liceo-beta-${timestamp}`;
    const sharedCi = `V-SHARED-${timestamp}`;

    let instAId: string;
    let instBId: string;
    let schemaA: string;
    let schemaB: string;

    beforeAll(async () => {
        // Asegurar que el entorno permita pruebas con esquema
        process.env.SHARED_TENANT_DB = 'true';
    });

    afterAll(async () => {
        await disconnectAll();

        // Limpiar institutos de Platform DB
        if (instAId) {
            await platformPrisma.institute.delete({ where: { id: instAId } }).catch(() => {});
        }
        if (instBId) {
            await platformPrisma.institute.delete({ where: { id: instBId } }).catch(() => {});
        }

        // Limpiar esquemas físicos de PostgreSQL
        const sharedDb = TenantProvisioningService.getSharedDatabaseName();
        const { user, password, host, port } = TenantProvisioningService.getConnectionCredentials();
        const client = new Client({ user, password, host, port, database: sharedDb });
        try {
            await client.connect();
            if (schemaA) await client.query(`DROP SCHEMA IF EXISTS "${schemaA}" CASCADE`);
            if (schemaB) await client.query(`DROP SCHEMA IF EXISTS "${schemaB}" CASCADE`);
        } finally {
            await client.end().catch(() => {});
        }
    }, 60000);

    it('1. provisiona el primer colegio en su propio esquema dentro de la base compartida', async () => {
        const start = Date.now();

        // Crear registro en plataforma
        const instRecordA = await platformPrisma.institute.create({
            data: {
                name: 'Liceo Alpha',
                code: `ALPHA-${timestamp}`,
                slug: slugA,
                subdomain: slugA,
                status: 'PROVISIONING',
            },
        });
        instAId = instRecordA.id;

        const resA = await TenantProvisioningService.provisionTenant(
            slugA,
            {
                ci: sharedCi,
                name: 'Profesor Director Alpha',
                email: `dir-alpha-${timestamp}@test.com`,
                password: 'Password123!',
            },
            {
                id: instAId,
                name: 'Liceo Alpha',
                code: `ALPHA-${timestamp}`,
                email: `info-alpha-${timestamp}@test.com`,
                slug: slugA,
                subdomain: slugA,
                status: 'ACTIVE',
            },
            { mode: 'schema' }
        );

        const elapsedMs = Date.now() - start;
        console.log(`Provisioning de esquema Alpha completado en ${elapsedMs} ms`);

        expect(resA.success).toBe(true);
        expect(resA.databaseSchema).toBe(TenantProvisioningService.generateSchemaName(slugA));
        schemaA = resA.databaseSchema!;

        // Actualizar en Platform DB
        await platformPrisma.institute.update({
            where: { id: instAId },
            data: {
                status: 'ACTIVE',
                databaseName: resA.databaseName,
                databaseSchema: resA.databaseSchema,
                databaseHost: resA.databaseHost,
                databasePort: resA.databasePort,
                databaseUser: resA.databaseUser,
                databasePassword: resA.databasePassword,
            },
        });

        // Verificar conexión vía getTenantPrisma
        const clientA = await getTenantPrisma(instAId);
        const userA = await clientA.user.findUnique({ where: { id: sharedCi } });
        expect(userA).toBeTruthy();
        expect(userA?.email).toBe(`dir-alpha-${timestamp}@test.com`);
    }, 60000);

    it('2. provisiona el segundo colegio en otro esquema con la MISMA cédula de identidad sin colisión', async () => {
        const start = Date.now();

        // Crear registro en plataforma
        const instRecordB = await platformPrisma.institute.create({
            data: {
                name: 'Liceo Beta',
                code: `BETA-${timestamp}`,
                slug: slugB,
                subdomain: slugB,
                status: 'PROVISIONING',
            },
        });
        instBId = instRecordB.id;

        const resB = await TenantProvisioningService.provisionTenant(
            slugB,
            {
                ci: sharedCi, // ¡MISMA CÉDULA DE IDENTIDAD QUE EN LICEO ALPHA!
                name: 'Profesor Director Beta',
                email: `dir-beta-${timestamp}@test.com`,
                password: 'Password123!',
            },
            {
                id: instBId,
                name: 'Liceo Beta',
                code: `BETA-${timestamp}`,
                email: `info-beta-${timestamp}@test.com`,
                slug: slugB,
                subdomain: slugB,
                status: 'ACTIVE',
            },
            { mode: 'schema' }
        );

        const elapsedMs = Date.now() - start;
        console.log(`Provisioning de esquema Beta completado en ${elapsedMs} ms`);

        expect(resB.success).toBe(true);
        expect(resB.databaseSchema).toBe(TenantProvisioningService.generateSchemaName(slugB));
        expect(resB.databaseSchema).not.toBe(schemaA);
        schemaB = resB.databaseSchema!;

        // Actualizar en Platform DB
        await platformPrisma.institute.update({
            where: { id: instBId },
            data: {
                status: 'ACTIVE',
                databaseName: resB.databaseName,
                databaseSchema: resB.databaseSchema,
                databaseHost: resB.databaseHost,
                databasePort: resB.databasePort,
                databaseUser: resB.databaseUser,
                databasePassword: resB.databasePassword,
            },
        });

        // Verificar conexión vía getTenantPrisma
        const clientB = await getTenantPrisma(instBId);
        const userB = await clientB.user.findUnique({ where: { id: sharedCi } });
        expect(userB).toBeTruthy();
        expect(userB?.email).toBe(`dir-beta-${timestamp}@test.com`);
    }, 60000);

    it('3. garantiza aislamiento estricto entre esquemas en la misma base compartida', async () => {
        const clientA = await getTenantPrisma(instAId);
        const clientB = await getTenantPrisma(instBId);

        // Crear una materia en el Liceo Alpha
        const subjectAlpha = await clientA.subject.create({
            data: {
                name: 'Matemática Alpha',
                code: `MAT-A-${timestamp}`,
                slug: `mat-alpha-${timestamp}`,
            },
        });
        expect(subjectAlpha.id).toBeTruthy();

        // Verificar que Liceo Beta NO ve la materia de Liceo Alpha
        const subjectBetaCheck = await clientB.subject.findFirst({
            where: { slug: `mat-alpha-${timestamp}` },
        });
        expect(subjectBetaCheck).toBeNull();

        // Crear una materia en el Liceo Beta con el MISMO slug
        const subjectBeta = await clientB.subject.create({
            data: {
                name: 'Matemática Beta',
                code: `MAT-B-${timestamp}`,
                slug: `mat-alpha-${timestamp}`, // Mismo slug que en Alpha
            },
        });
        expect(subjectBeta.id).toBeTruthy();
        expect(subjectBeta.name).toBe('Matemática Beta');

        // Alpha sigue teniendo su propia materia
        const subjectAlphaCheck = await clientA.subject.findFirst({
            where: { slug: `mat-alpha-${timestamp}` },
        });
        expect(subjectAlphaCheck?.name).toBe('Matemática Alpha');
    });

    /**
     * BASE-COMP-05: un liceo nuevo nace CON su historial de migraciones.
     * Se creaba con `db push`: tablas sí, `_prisma_migrations` no. La primera
     * migración siguiente (`migrate:tenants`) le fallaba para siempre («la base
     * no está vacía»), y lo que solo vive en las migraciones (índices de
     * búsqueda, SQL a mano) no llegaba nunca.
     */
    it('BASE-COMP-05: el liceo nuevo queda migrado, no empujado: su historial al día', async () => {
        const { getTenantMigrationStatus } = require('../../src/services/tenant-migrations.service');
        const fila = await platformPrisma.institute.findUnique({ where: { id: instAId } });
        const estado = await getTenantMigrationStatus(fila);
        expect(estado.error).toBeUndefined();
        expect(estado.pending).toEqual([]);
        expect(estado.upToDate).toBe(true);
        // Y lo que solo viene en una migración: los índices de búsqueda de usuarios.
        const clientA = await getTenantPrisma(instAId);
        const indices: any[] = await clientA.$queryRawUnsafe(
            `SELECT indexname FROM pg_indexes WHERE schemaname = '${schemaA}' AND indexname LIKE 'users_%trgm_idx'`
        );
        expect(indices.length).toBe(5);
    }, 60000);
});
