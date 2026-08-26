import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { Client } from 'pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const execAsync = promisify(exec);

export interface ProvisionResult {
    success: boolean;
    databaseName: string;
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
    email: string;
    slug: string;
    subdomain?: string | null;
    status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'INACTIVE';
    plan?: 'BASIC' | 'STANDARD' | 'PREMIUM';
}

/**
 * Servicio para provisionar bases de datos de tenants
 */
export class TenantProvisioningService {
    /**
     * Genera el nombre de la base de datos del tenant
     */
    private static generateDatabaseName(slug: string): string {
        return `tenant_${slug.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
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
     * Construye la URL de conexión a la base de datos
     */
    private static buildDatabaseUrl(dbName: string): string {
        const { user, password, host, port } = this.getConnectionCredentials();
        return `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
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
                console.log(`✅ Base de datos creada: ${dbName}`);
            } else {
                console.log(`ℹ️  Base de datos ya existe: ${dbName}`);
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
                console.warn('⚠️  Advertencias en migración:', stderr);
            }

            console.log('✅ Migraciones ejecutadas exitosamente');
        } catch (error: any) {
            console.error('❌ Error ejecutando migraciones:', error.message);
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

            console.log(`✅ Instituto registrado en tenant DB: ${instituteData.slug}`);

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

            console.log(`✅ Usuario administrador creado/actualizado: ${admin.email}`);
            return admin.id;
        } finally {
            await tenantPrisma.$disconnect();
        }
    }

    /**
     * Provisiona completamente un tenant:
     * 1. Crea la base de datos
     * 2. Ejecuta migraciones
     * 3. Crea usuario administrador
     */
    static async provisionTenant(
        slug: string,
        adminData: AdminData,
        instituteData?: InstituteSeedData
    ): Promise<ProvisionResult> {
        const databaseName = this.generateDatabaseName(slug);
        const databaseUrl = this.buildDatabaseUrl(databaseName);
        const { user, password, host, port } = this.getConnectionCredentials();

        try {
            console.log(`🚀 Iniciando provisioning para: ${slug}`);

            // 1. Crear base de datos
            await this.createTenantDatabase(databaseName);

            // 2. Ejecutar migraciones
            await this.runMigrations(databaseUrl);

            // 3. Crear/actualizar usuario administrador (y registrar el instituto en la tenant DB)
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

            console.log(`✅ Provisioning completado para: ${slug}`);

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
            console.error(`❌ Error en provisioning de ${slug}:`, error.message);
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
