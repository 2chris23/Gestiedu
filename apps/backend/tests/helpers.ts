import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../src/server';
import { generateTokenPair } from '../src/config/jwt';
import { UserRole } from '../src/utils/prisma-enums';
import { createId } from '@paralleldrive/cuid2';

/**
 * Genera un ID compatible con Zod .cuid() (regex: /^c[^\s-]{8,}$/).
 * CUID2 puede empezar con cualquier letra, pero Zod solo acepta IDs que empiecen con 'c'.
 * Se fuerza el prefijo 'c' para garantizar compatibilidad.
 */
function gId(): string {
    const id = createId(); // e.g. "ilb5rl8eq71miju8..." — CUID2 puede empezar con cualquier letra
    return id.startsWith('c') ? id : `c${id}`;
}

function parseDbUrl(url: string): { user: string; password: string; host: string; port: number; db: string } {
    const m = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
    if (!m) throw new Error(`Invalid postgres URL: ${url}`);
    return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4], 10), db: m[5] };
}

function resolveTestUrl(): string {
    return (
        process.env.TEST_DATABASE_URL ||
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/tenant_test-load-5k'
    );
}


/**
 * Helper para crear una instancia del servidor para tests
 */
export async function createTestServer(): Promise<FastifyInstance> {
    // Forzar DATABASE_URL al tenant de test para los tests de integración
    const testUrl = resolveTestUrl();
    process.env.DATABASE_URL = testUrl;

    if (!process.env.PLATFORM_DATABASE_URL) {
        process.env.PLATFORM_DATABASE_URL =
            'postgresql://postgres:postgres@localhost:5432/gestion_escolar_platform';
    }

    // Forzar JWT secrets de test para que el servidor verifique con el mismo secret
    // que usa generateTestToken (el .env tiene un secret de producción diferente)
    process.env.JWT_SECRET = 'test-jwt-secret-key-do-not-use-in-production';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-do-not-use-in-production';

    // Resetear el singleton de Prisma para que se cree con la URL correcta
    const { resetPrismaForTests } = await import('../src/config/database');
    resetPrismaForTests();

    const server = await buildServer();
    await server.ready();

    // Crear el instituto de test en Platform DB para que el middleware identifyTenant
    // pueda encontrarlo y configurar request.tenantPrisma correctamente.
    try {
        const tenant = parseDbUrl(testUrl);
        const dbInfo = {
            databaseName: tenant.db,
            databaseHost: tenant.host,
            databasePort: tenant.port,
            databaseUser: tenant.user,
            databasePassword: tenant.password,
        };
        const { platformPrisma } = await import('../src/config/database');
        await platformPrisma.institute.upsert({
            where: { id: 'institute' },
            update: {
                status: 'ACTIVE',
                ...dbInfo,
            },
            create: {
                id: 'institute',
                code: 'TEST_INST',
                slug: 'test-institute',
                subdomain: 'test-institute',
                name: 'Test Institute',
                email: 'test@institute.com',
                environment: 'development',
                status: 'ACTIVE',
                ...dbInfo,
            },
        });
    } catch (err) {
        // Si falla la creación en Platform DB, logear pero no bloquear los tests
        console.warn('[test-setup] No se pudo crear instituto en Platform DB:', err);
    }

    return server;
}

/**
 * Crea un PrismaClient dedicado para tests con la URL de test correcta.
 * Usar en lugar de server.prisma para cleanTestDatabase y otros helpers,
 * ya que server.prisma (Lazy Proxy) puede haber sido instanciado con la URL incorrecta.
 */
export async function createTestPrismaClient(): Promise<PrismaClient> {
    // Usar la URL de test directamente (TEST_DATABASE_URL o DATABASE_URL ya resuelta)
    const testUrl = resolveTestUrl();
    return new PrismaClient({ datasources: { db: { url: testUrl } } });
}

/**
 * Helper para limpiar la base de datos de test
 */
export async function cleanTestDatabase(prisma: PrismaClient): Promise<void> {
    // Orden de eliminación respetando foreign keys
    await prisma.auditLog.deleteMany();
    await prisma.grade.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.studentTutor.deleteMany();
    await prisma.classroomSubject.deleteMany();
    await prisma.studentClassroom.deleteMany();
    await prisma.teacherClassroom.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.classroom.deleteMany();
    await prisma.subject.deleteMany();
    await prisma.period.deleteMany();
    await prisma.academicYear.deleteMany();
    await prisma.institute.deleteMany();
}

/**
 * Helper para crear un usuario de test
 */
export async function createTestUser(
    prisma: PrismaClient,
    role: UserRole = UserRole.STUDENT,
    overrides?: Partial<any>
) {
    const institute = await prisma.institute.upsert({
        where: { id: 'institute' },
        update: {},
        create: {
            id: 'institute',
            code: 'TEST_INST',
            slug: 'test-institute',
            name: 'Test Institute',
            address: 'Test Address',
            phone: '1234567890',
            email: 'test@institute.com',
        },
    });

    const uid = gId();
    const user = await prisma.user.create({
        data: {
            id: `usr${uid}`.substring(0, 30), // Máx ~30 chars, formato cédula-like
            email: `test-${role.toLowerCase()}-${uid}@test.com`,
            password: '$2b$10$test.hash.password', // Hash de "password123"
            firstName: 'Test',
            lastName: 'User',
            role,
            instituteId: institute.id,
            isActive: true,
            ...overrides,
        },
    });

    return { user, institute };
}

/**
 * Helper para generar token de autenticación para tests
 */
export function generateTestToken(userId: string, role: UserRole, instituteId: string) {
    const tokens = generateTokenPair(
        {
            id: userId,
            userId,
            email: 'test@test.com',
            role,
            instituteId,
        },
        'test-token-id'
    );

    return tokens.accessToken;
}

/**
 * Helper para crear año académico de test
 */
export async function createTestAcademicYear(prisma: PrismaClient, instituteId: string) {
    const uniqueSuffix = gId();
    return await prisma.academicYear.create({
        data: {
            id: gId(),
            name: `2024-${uniqueSuffix}`,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
            isActive: true,
            instituteId,
        },
    });
}

/**
 * Helper para crear aula de test
 */
export async function createTestClassroom(
    prisma: PrismaClient,
    academicYearId: string,
    instituteId: string
) {
    return await prisma.classroom.create({
        data: {
            id: gId(),
            name: '1er Grado A',
            slug: `aula-${gId()}`,
            grade: 1, // Changed to Int
            section: 'A',
            capacity: 30,
            academicYearId,
            instituteId,
        },
    });
}

/**
 * Helper para crear materia de test
 */
export async function createTestSubject(prisma: PrismaClient, instituteId: string) {
    const uid = gId();
    return await prisma.subject.create({
        data: {
            id: gId(),
            name: `Matemáticas-${uid}`,
            code: `MAT-${uid.substring(0, 8).toUpperCase()}`,
            slug: `matematicas-${uid}`,
            description: 'Matemáticas básicas',
            instituteId,
        },
    });
}

/**
 * Helper para crear horario de test
 */
export async function createTestSchedule(
    prisma: PrismaClient,
    data: {
        classroomId: string;
        subjectId: string;
        teacherId: string;
        dayOfWeek: string;
        startTime: string;
        endTime: string;
        instituteId?: string;
    }
) {
    const { instituteId: _ignored, ...rest } = data;
    return await prisma.schedule.create({
        data: {
            id: gId(),
            instituteId: data.instituteId || 'institute',
            ...rest,
        },
    });
}

/**
 * Helper para esperar un tiempo determinado
 */
export function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Crea un usuario de test con contraseña real (bcrypt).
 * Útil para flujos de login/change-password por API.
 */
export async function createTestUserWithPassword(
    prisma: PrismaClient,
    role: UserRole = UserRole.STUDENT,
    password: string = 'Password123!',
    overrides?: Partial<any>
) {
    const bcrypt = require('bcrypt') as typeof import('bcrypt');
    const hashed = await bcrypt.hash(password, 8);
    return createTestUser(prisma, role, {
        ...(overrides || {}),
        password: hashed,
    });
}

/**
 * Siembra un SuperAdmin en la Platform DB (con contraseña real bcrypt).
 */
export async function seedSuperAdmin(
    platformPrisma: any,
    email: string = 'superadmin@test.com',
    password: string = 'SuperAdmin123!'
) {
    const bcrypt = require('bcrypt') as typeof import('bcrypt');
    const hashed = await bcrypt.hash(password, 8);
    return platformPrisma.superAdmin.upsert({
        where: { email },
        update: { password: hashed, isActive: true },
        create: {
            email,
            password: hashed,
            name: 'Test SuperAdmin',
            isActive: true,
        },
    });
}

/**
 * Genera un token de SuperAdmin de test firmado con el secreto del entorno de test.
 */
export function generateSuperAdminTestToken(id: string, email: string) {
    const { generateSuperAdminAccessToken } = require('../src/config/jwt') as typeof import('../src/config/jwt');
    return generateSuperAdminAccessToken({
        id,
        email,
        role: 'SUPERADMIN',
    });
}

export default {
    createTestServer,
    cleanTestDatabase,
    createTestUser,
    createTestUserWithPassword,
    generateTestToken,
    generateSuperAdminTestToken,
    seedSuperAdmin,
    createTestAcademicYear,
    createTestClassroom,
    createTestSubject,
    createTestSchedule,
    wait,
};
