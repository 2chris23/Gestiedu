import { exec, execFileSync } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { Client } from 'pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { buildTenantDatabaseUrl, deriveTenantSchema } from '../config/tenant-db-url';
import { avisarSiFalla } from '../utils/sin-callar';

const execAsync = promisify(exec);

export interface ProvisionResult {
    success: boolean;
    databaseName: string;
    databaseSchema?: string;
    databaseUrl: string;
    databaseHost: string;
    databasePort: number;
    databaseUser: string;
    databasePassword: string;
    adminUserId?: string;
    error?: string;
}

export interface AdminData {
    ci: string;
    name: string;
    email: string;
    password: string;
}

export interface InstituteSeedData {
    id: string;
    name: string;
    code: string;
    /** Opcional: un instituto puede no tener email de contacto. */
    email: string | null;
    slug: string;
    subdomain?: string | null;
    status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'INACTIVE';
    plan?: 'BASIC' | 'STANDARD' | 'PREMIUM';
}

/**
 * Servicio para provisionar bases de datos y esquemas de tenants
 */
export class TenantProvisioningService {
    /**
     * Genera el nombre de la base de datos del tenant (modo dedicado)
     */
    static generateDatabaseName(slug: string): string {
        return `tenant_${slug.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
    }

    /**
     * Genera el nombre del esquema del tenant dentro de la base compartida
     */
    static generateSchemaName(slug: string): string {
        return deriveTenantSchema(slug);
    }

    /**
     * Resuelve el nombre de la base de datos compartida
     */
    static getSharedDatabaseName(): string {
        if (process.env.SHARED_TENANT_DB_NAME) return process.env.SHARED_TENANT_DB_NAME;
        const dUrl = process.env.DATABASE_URL || '';
        const m = dUrl.match(/postgres(?:ql)?:\/\/[^/]+\/([^?]+)/);
        return m ? m[1] : 'gestion_escolar';
    }

    /**
     * Extrae las credenciales de conexión desde PLATFORM_DATABASE_URL
     */
    static getConnectionCredentials(): { user: string; password: string; host: string; port: number } {
        const baseUrl = process.env.PLATFORM_DATABASE_URL || '';
        const urlParts = baseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\//);
        if (!urlParts) throw new Error('Invalid PLATFORM_DATABASE_URL format');
        const [, user, password, host, port] = urlParts;
        return { user, password, host, port: parseInt(port) };
    }

    /**
     * Construye la URL de conexión a la base de datos o esquema
     */
    static buildDatabaseUrl(dbName: string, schemaName?: string): string {
        const { user, password, host, port } = this.getConnectionCredentials();
        return buildTenantDatabaseUrl(
            {
                databaseUser: user,
                databasePassword: password,
                databaseHost: host,
                databasePort: port,
                databaseName: dbName,
                databaseSchema: schemaName || 'public',
            },
            'direct'
        );
    }

    /**
     * Crea la base de datos del tenant
     */
    private static async createTenantDatabase(dbName: string): Promise<void> {
        const { user, password, host, port } = this.getConnectionCredentials();

        // Conectar a la base de datos postgres para crear la nueva BD
        const client = new Client({
            user,
            password,
            host,
            port,
            database: 'postgres',
        });

        try {
            await client.connect();

            // Verificar si la base de datos ya existe
            const checkQuery = `SELECT 1 FROM pg_database WHERE datname = $1`;
            const result = await client.query(checkQuery, [dbName]);

            if (result.rows.length === 0) {
                // Crear la base de datos
                await client.query(`CREATE DATABASE "${dbName}"`);
                console.log(`Base de datos creada: ${dbName}`);
            } else {
                console.log(`Base de datos ya existe: ${dbName}`);
            }
        } finally {
            await client.end();
        }
    }

    /**
     * Ejecuta las migraciones de Prisma en la base de datos del tenant
     */
    private static async runMigrations(databaseUrl: string): Promise<void> {
        const schemaPath = path.join(__dirname, '../prisma/schema.prisma');

        try {
            // Ejecutar migraciones
            const { stdout, stderr } = await execAsync(
                `npx prisma migrate deploy --schema="${schemaPath}"`,
                {
                    env: {
                        ...process.env,
                        DATABASE_URL: databaseUrl,
                    },
                }
            );

            if (stderr && !stderr.includes('warnings')) {
                console.warn('Advertencias en migracion:', stderr);
            }

            console.log('Migraciones ejecutadas exitosamente');
        } catch (error: any) {
            console.error('Error ejecutando migraciones:', error.message);
            throw new Error(`Error en migraciones: ${error.message}`);
        }
    }

    /**
     * Crea o actualiza el usuario administrador en la base de datos del tenant
     */
    private static async createAdminUser(
        databaseUrl: string,
        adminData: AdminData,
        instituteData: InstituteSeedData
    ): Promise<string> {
        const tenantPrisma = new PrismaClient({
            datasources: {
                db: {
                    url: databaseUrl,
                },
            },
        });

        try {
            // Registrar el instituto en la BD del tenant (id = id de la plataforma)
            await tenantPrisma.institute.upsert({
                where: { id: instituteData.id },
                update: {
                    name: instituteData.name,
                    code: instituteData.code,
                    email: instituteData.email,
                    slug: instituteData.slug,
                    subdomain: instituteData.subdomain,
                    status: instituteData.status || 'ACTIVE',
                    plan: instituteData.plan || 'BASIC',
                },
                create: {
                    id: instituteData.id,
                    name: instituteData.name,
                    code: instituteData.code,
                    email: instituteData.email,
                    slug: instituteData.slug,
                    subdomain: instituteData.subdomain,
                    status: instituteData.status || 'ACTIVE',
                    plan: instituteData.plan || 'BASIC',
                },
            });

            console.log(`Instituto registrado en tenant DB: ${instituteData.slug}`);

            // Hash de la contraseña
            const hashedPassword = await bcrypt.hash(adminData.password, 12);
            const firstName = adminData.name.split(' ')[0] || adminData.name;
            const lastName = adminData.name.split(' ').slice(1).join(' ') || 'Admin';

            // Usar upsert para que no falle si el admin ya existe
            const admin = await tenantPrisma.user.upsert({
                where: { id: adminData.ci },
                update: {
                    email: adminData.email,
                    password: hashedPassword,
                    firstName,
                    lastName,
                    role: 'ADMIN',
                    isActive: true,
                    instituteId: instituteData.id,
                },
                create: {
                    id: adminData.ci,
                    email: adminData.email,
                    password: hashedPassword,
                    firstName,
                    lastName,
                    role: 'ADMIN',
                    isActive: true,
                    instituteId: instituteData.id,
                },
            });

            console.log(`Usuario administrador creado/actualizado: ${admin.email}`);
            return admin.id;
        } finally {
            await tenantPrisma.$disconnect();
        }
    }

    /**
     * Crea el esquema del tenant en la base de datos compartida y asegura las extensiones necesarias
     */
    static async createTenantSchema(schemaName: string, dbName: string): Promise<void> {
        const { user, password, host, port } = this.getConnectionCredentials();
        const client = new Client({
            user,
            password,
            host,
            port,
            database: dbName,
        });

        try {
            await client.connect();
            // Asegurar extensiones para que estén accesibles globalmente en cualquier search_path
            try {
                await client.query('ALTER EXTENSION pg_trgm SET SCHEMA pg_catalog').catch(avisarSiFalla('tenant-provisioning.service'));
                await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA pg_catalog').catch(avisarSiFalla('tenant-provisioning.service'));
                await client.query('ALTER EXTENSION unaccent SET SCHEMA pg_catalog').catch(avisarSiFalla('tenant-provisioning.service'));
                await client.query('CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA pg_catalog').catch(avisarSiFalla('tenant-provisioning.service'));
            } catch (extError: any) {
                // Fallback si no tiene permisos de superuser
                await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public').catch(avisarSiFalla('tenant-provisioning.service'));
                await client.query('CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public').catch(avisarSiFalla('tenant-provisioning.service'));
            }

            await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
            console.log(`Esquema creado: ${schemaName} en base ${dbName}`);
        } finally {
            await client.end();
        }
    }

    /**
     * Crea las tablas del liceo en su esquema con LAS MIGRACIONES, igual que
     * un liceo con base propia (BASE-COMP-05).
     *
     * Antes era `db push --accept-data-loss`: salían las tablas, pero sin
     * `_prisma_migrations`, así que la primera migración siguiente le fallaba
     * para siempre («la base no está vacía», P3005) y lo que solo vive en las
     * migraciones (los índices de búsqueda, el SQL escrito a mano) no llegaba.
     * Cuesta unos segundos más al dar de alta un liceo; una vez.
     */
    static async deploySchemaTables(databaseUrl: string): Promise<void> {
        const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
        const cli = require.resolve('prisma/build/index.js');

        try {
            execFileSync(
                process.execPath,
                [cli, 'migrate', 'deploy', '--schema', schemaPath],
                {
                    env: {
                        ...process.env,
                        DATABASE_URL: databaseUrl,
                    },
                    stdio: 'pipe',
                }
            );
            console.log('Tablas desplegadas exitosamente en el esquema');
        } catch (error: any) {
            console.error('Error desplegando tablas en esquema:', error.message);
            throw new Error(`Error en despliegue de tablas: ${error.message}`);
        }
    }

    /**
     * Provisiona completamente un tenant (modo esquema compartido o base de datos dedicada)
     */
    static async provisionTenant(
        slug: string,
        adminData: AdminData,
        instituteData?: InstituteSeedData,
        options?: { mode?: 'schema' | 'database' }
    ): Promise<ProvisionResult> {
        const isDedicatedMode =
            options?.mode === 'database' ||
            process.env.USE_DEDICATED_TENANT_DATABASES === 'true' ||
            (process.env.NODE_ENV === 'test' && options?.mode !== 'schema' && process.env.TENANT_PROVISION_MODE !== 'schema');

        const { user, password, host, port } = this.getConnectionCredentials();

        if (isDedicatedMode) {
            const databaseName = this.generateDatabaseName(slug);
            const databaseUrl = this.buildDatabaseUrl(databaseName);

            try {
                console.log(`Iniciando provisioning dedicado para: ${slug}`);
                await this.createTenantDatabase(databaseName);
                await this.runMigrations(databaseUrl);

                const seedData: InstituteSeedData = instituteData ?? {
                    id: slug,
                    name: slug,
                    code: slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'INST',
                    email: adminData.email,
                    slug,
                    status: 'ACTIVE',
                    plan: 'BASIC',
                };
                const adminUserId = await this.createAdminUser(databaseUrl, adminData, seedData);
                console.log(`Provisioning dedicado completado para: ${slug}`);

                return {
                    success: true,
                    databaseName,
                    databaseUrl,
                    databaseHost: host,
                    databasePort: port,
                    databaseUser: user,
                    databasePassword: password,
                    adminUserId,
                };
            } catch (error: any) {
                console.error(`Error en provisioning dedicado de ${slug}:`, error.message);
                return {
                    success: false,
                    databaseName,
                    databaseUrl,
                    databaseHost: host,
                    databasePort: port,
                    databaseUser: user,
                    databasePassword: password,
                    error: error.message,
                };
            }
        }

        // Modo Base de Datos Compartida con Esquema por Tenant (Schema-Per-Tenant)
        const databaseName = this.getSharedDatabaseName();
        const databaseSchema = this.generateSchemaName(slug);
        const databaseUrl = this.buildDatabaseUrl(databaseName, databaseSchema);

        try {
            console.log(`Iniciando provisioning compartido para: ${slug} (esquema ${databaseSchema} en ${databaseName})`);

            // 1. Crear el esquema
            await this.createTenantSchema(databaseSchema, databaseName);

            // 2. Desplegar tablas en el esquema
            await this.deploySchemaTables(databaseUrl);

            // 3. Crear/actualizar usuario administrador
            const seedData: InstituteSeedData = instituteData ?? {
                id: slug,
                name: slug,
                code: slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'INST',
                email: adminData.email,
                slug,
                status: 'ACTIVE',
                plan: 'BASIC',
            };
            const adminUserId = await this.createAdminUser(databaseUrl, adminData, seedData);

            console.log(`Provisioning compartido completado para: ${slug}`);

            return {
                success: true,
                databaseName,
                databaseSchema,
                databaseUrl,
                databaseHost: host,
                databasePort: port,
                databaseUser: user,
                databasePassword: password,
                adminUserId,
            };
        } catch (error: any) {
            console.error(`Error en provisioning compartido de ${slug}:`, error.message);
            return {
                success: false,
                databaseName,
                databaseSchema,
                databaseUrl,
                databaseHost: host,
                databasePort: port,
                databaseUser: user,
                databasePassword: password,
                error: error.message,
            };
        }
    }

    /**
     * Verifica la conexión a una base de datos
     */
    static async testConnection(databaseUrl: string): Promise<boolean> {
        const testPrisma = new PrismaClient({
            datasources: {
                db: {
                    url: databaseUrl,
                },
            },
        });

        try {
            await testPrisma.$connect();
            await testPrisma.$disconnect();
            return true;
        } catch (error) {
            return false;
        }
    }
}
