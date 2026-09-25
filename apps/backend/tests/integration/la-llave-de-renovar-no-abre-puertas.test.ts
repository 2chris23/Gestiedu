import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../../src/utils/prisma-enums';
import { platformPrisma } from '../../src/config/database';
import { createTestServer, createTestPrismaClient, cleanTestDatabase } from '../helpers';

/**
 * LA LLAVE DE RENOVAR NO ABRE PUERTAS, Y RENOVAR NO BORRA EL LICEO DEL TOKEN
 *
 * Al entrar se reciben dos llaves: la de acceso (15 min) y la de renovar
 * (7 días, o 60 con «recordarme»). Las dos se firmaban con la misma clave, el
 * mismo emisor y el mismo destinatario, así que el servidor no sabía
 * distinguirlas:
 *
 *   1. **La llave de renovar servía como llave de acceso.** Y como no lleva el
 *      liceo dentro, el liceo lo elegía quien llamaba con la cabecera. Seguía
 *      sirviendo después de cerrar sesión (el cierre anula la de acceso y
 *      borra la fila de la de renovar, pero usada como acceso nadie miraba esa
 *      fila): siete días de puerta abierta tras «Cerrar sesión».
 *
 *   2. **La llave de acceso que salía de renovar iba sin liceo** (`instituteId:
 *      null`): en la base de cada liceo la columna está vacía, y la renovación
 *      copiaba esa columna en vez del liceo de la petición. Sin liceo en el
 *      token, el guardián de liceos (`TENANT_MISMATCH`) no tenía con qué
 *      comparar, y la cabecera `X-Institute-Slug` decidía a qué base se iba.
 *
 * Juntas: un profesor que da clase en dos liceos —con la misma cédula en los
 * dos, que es lo normal— entraba en el liceo B con la contraseña del liceo A.
 * Medido contra el servidor en marcha (informe `docs/nube/seguridad.md`, S-01).
 *
 * Aquí la persona existe en los dos liceos con la MISMA cédula y contraseñas
 * distintas, y con `instituteId` vacío en las dos bases, como en producción.
 */

const SLUG_A = 'test-institute';
const ID_A = 'institute';
const SUFIJO = Date.now();
const ID_B = `liceo-b-${SUFIJO}`;
const SLUG_B = `liceo-b-${SUFIJO}`;

const CEDULA = `V-${String(SUFIJO).slice(-8)}`;
const CLAVE_A = 'ClaveDelLiceoA-1';
const CLAVE_B = 'ClaveDelLiceoB-2';

function datosDeConexion() {
    const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
    const m = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
    if (!m) throw new Error(`URL de postgres inválida: ${url}`);
    return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4], 10) };
}

async function crearBaseDelLiceoB(): Promise<string> {
    const plantilla = (process.env.TEST_TEMPLATE_DATABASE_URL || '').match(/\/([^/?]+)(\?|$)/)?.[1];
    if (!plantilla) throw new Error('No hay plantilla de base para crear el liceo B');
    const nombre = `t_llave_${process.pid}_${Date.now().toString(36).slice(-5)}`;
    const cliente = new Client({ ...datosDeConexion(), database: 'postgres' });
    await cliente.connect();
    try {
        await cliente.query(`CREATE DATABASE "${nombre}" TEMPLATE "${plantilla}"`);
    } finally {
        await cliente.end();
    }
    return nombre;
}

async function borrarBase(nombre?: string) {
    if (!nombre) return;
    const cliente = new Client({ ...datosDeConexion(), database: 'postgres' });
    await cliente.connect();
    try {
        await cliente.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
    } finally {
        await cliente.end();
    }
}

/** Lo de dentro de un token, sin comprobar la firma: solo para mirar. */
function queLleva(token: string): Record<string, any> {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

describe('La llave de renovar no abre puertas', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let prismaB: PrismaClient | undefined;
    let baseDeB: string | undefined;

    const entrar = (slug: string, clave: string) =>
        request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', slug)
            .send({ email: `profe-${SUFIJO}@liceo.test`, password: clave });

    const renovar = (slug: string, refreshToken: string) =>
        request(server.server)
            .post('/api/auth/refresh-token')
            .set('X-Institute-Slug', slug)
            .send({ refreshToken });

    const perfil = (slug: string, token: string) =>
        request(server.server)
            .get('/api/auth/profile')
            .set('X-Institute-Slug', slug)
            .set('Authorization', `Bearer ${token}`);

    async function crearLaPersona(db: PrismaClient, clave: string) {
        await db.user.create({
            data: {
                id: CEDULA,
                email: `profe-${SUFIJO}@liceo.test`,
                password: await bcrypt.hash(clave, 8),
                firstName: 'Profe',
                lastName: 'DeDosLiceos',
                role: UserRole.TEACHER,
                // Como en la base de un liceo de verdad: la columna va vacía.
                instituteId: null,
                isActive: true,
            },
        });
    }

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        await cleanTestDatabase(prisma);

        const liceoA = await platformPrisma.institute.findUnique({ where: { id: ID_A } });
        baseDeB = await crearBaseDelLiceoB();
        await platformPrisma.institute.create({
            data: {
                id: ID_B,
                code: `B_${SUFIJO}`,
                slug: SLUG_B,
                subdomain: SLUG_B,
                name: 'Liceo B',
                email: `b-${SUFIJO}@liceo.test`,
                environment: 'development',
                status: 'ACTIVE',
                databaseName: baseDeB,
                databaseHost: liceoA!.databaseHost,
                databasePort: liceoA!.databasePort,
                databaseUser: liceoA!.databaseUser,
                databasePassword: liceoA!.databasePassword,
            },
        });
        const urlDeB =
            `postgresql://${liceoA!.databaseUser}:${liceoA!.databasePassword}` +
            `@${liceoA!.databaseHost}:${liceoA!.databasePort}/${baseDeB}`;
        prismaB = new PrismaClient({ datasources: { db: { url: urlDeB } } });

        await crearLaPersona(prisma, CLAVE_A);
        await crearLaPersona(prismaB, CLAVE_B);
    });

    afterAll(async () => {
        await platformPrisma.institute.delete({ where: { id: ID_B } }).catch(() => undefined);
        await prismaB?.$disconnect().catch(() => undefined);
        await borrarBase(baseDeB).catch(() => undefined);
        await cleanTestDatabase(prisma);
        await prisma.$disconnect();
        await server.close();
    });

    it('LLAVE-R-01: la llave de renovar NO sirve como llave de acceso', async () => {
        const login = await entrar(SLUG_A, CLAVE_A);
        expect(login.status).toBe(200);
        const { refreshToken } = login.body.tokens;

        const res = await perfil(SLUG_A, refreshToken);
        expect(res.status).toBe(401);
        expect(JSON.stringify(res.body)).not.toContain(CEDULA);
    });

    it('LLAVE-R-02: tras cerrar sesión, la llave de renovar no abre nada', async () => {
        const login = await entrar(SLUG_A, CLAVE_A);
        const { accessToken, refreshToken } = login.body.tokens;

        await request(server.server)
            .post('/api/auth/logout')
            .set('X-Institute-Slug', SLUG_A)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ refreshToken })
            .expect(200);

        expect((await perfil(SLUG_A, accessToken)).status).toBe(401);
        expect((await perfil(SLUG_A, refreshToken)).status).toBe(401);
        expect((await renovar(SLUG_A, refreshToken)).status).toBe(401);
    });

    it('LLAVE-R-03: la llave de renovar de A no abre el liceo B', async () => {
        const login = await entrar(SLUG_A, CLAVE_A);
        const res = await perfil(SLUG_B, login.body.tokens.refreshToken);
        expect(res.status).toBe(401);
        expect(JSON.stringify(res.body)).not.toContain('DeDosLiceos');
    });

    it('LLAVE-R-04: la llave de acceso que sale de renovar lleva el liceo', async () => {
        const login = await entrar(SLUG_A, CLAVE_A);
        expect(queLleva(login.body.tokens.accessToken).instituteId).toBe(ID_A);

        const renovada = await renovar(SLUG_A, login.body.tokens.refreshToken);
        expect(renovada.status).toBe(200);
        expect(queLleva(renovada.body.accessToken).instituteId).toBe(ID_A);

        // Y sigue sirviendo en su liceo.
        expect((await perfil(SLUG_A, renovada.body.accessToken)).status).toBe(200);
    });

    it('LLAVE-R-05: la llave renovada en A no entra en B aunque la cédula exista allí', async () => {
        const login = await entrar(SLUG_A, CLAVE_A);
        const renovada = await renovar(SLUG_A, login.body.tokens.refreshToken);
        expect(renovada.status).toBe(200);

        const res = await perfil(SLUG_B, renovada.body.accessToken);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('TENANT_MISMATCH');
    });

    it('LLAVE-R-06: una llave de acceso sin liceo dentro no entra en ninguno', async () => {
        // Las que se emitieron antes del arreglo (15 min de vida) y cualquiera
        // que un día saliera sin liceo por otro camino: se falla cerrado.
        const { generateAccessToken } = await import('../../src/config/jwt');
        const sinLiceo = generateAccessToken({
            id: CEDULA,
            userId: CEDULA,
            email: `profe-${SUFIJO}@liceo.test`,
            role: UserRole.TEACHER,
            instituteId: null,
        });
        expect((await perfil(SLUG_A, sinLiceo)).status).toBe(401);
        expect((await perfil(SLUG_B, sinLiceo)).status).toBe(401);
    });

    it('LLAVE-R-07: en B se entra con la contraseña de B (control positivo)', async () => {
        const login = await entrar(SLUG_B, CLAVE_B);
        expect(login.status).toBe(200);
        expect(queLleva(login.body.tokens.accessToken).instituteId).toBe(ID_B);
        expect((await perfil(SLUG_B, login.body.tokens.accessToken)).status).toBe(200);
        // Y la de A no vale en B.
        expect((await entrar(SLUG_B, CLAVE_A)).status).toBe(401);
    });
});
