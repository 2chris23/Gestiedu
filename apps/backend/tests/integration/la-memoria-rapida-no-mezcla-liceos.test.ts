import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import fs from 'fs';
import path, { sep } from 'path';
import { UserRole } from '../../src/utils/prisma-enums';
import { platformPrisma } from '../../src/config/database';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
    generateTestToken,
} from '../helpers';
import { RedisCache } from '../../src/config/redis';
import { conLiceo, sinLiceo, liceoActual } from '../../src/config/ambito-del-liceo';

/**
 * LA MEMORIA RÁPIDA NO PUEDE MEZCLAR LICEOS
 *
 * Los datos de cada liceo están en su propia base, y eso los aísla. La memoria
 * rápida —lo que se guarda para no volver a preguntar— es **una sola para todo
 * el servidor**, y ahí el aislamiento no lo da nadie: lo tiene que dar la clave.
 *
 * ─── LO QUE ESTABA MAL ───────────────────────────────────────────────────────
 *
 * La lista de notas se guardaba con esta clave:
 *
 *     grades:list|stu:-|sub:-|per:-|...|pg:1|lm:10|sb:createdAt|so:desc
 *
 * Los guiones son «sin filtro». Pedir «todas las notas» produce **exactamente
 * la misma clave en todos los liceos**: el primero que la pedía dejaba ahí sus
 * notas y el siguiente liceo recibía las del primero. Igual con
 * `grades:stats:{}` y `report:academic:{}`.
 *
 * Y al guardar una nota se limpiaba `grades:list:*`, que tiraba lo guardado de
 * **todos** los liceos, no solo del suyo.
 *
 * ─── CÓMO SE COMPRUEBA AQUÍ ──────────────────────────────────────────────────
 *
 * Con dos liceos apuntando a la misma base. Eso es a propósito: si los datos
 * fueran distintos, la prueba podría pasar por casualidad. Aquí lo único que
 * puede distinguir a uno del otro es **la clave con la que se guarda**, que es
 * justo lo que se quiere probar.
 *
 * La pieza que lo arregla está en `src/config/ambito-del-liceo.ts`.
 */

const SLUG_A = 'test-institute';
const ID_A = 'institute';

const SUFIJO = Date.now();
const ID_B = `otro-liceo-${SUFIJO}`;
const SLUG_B = `otro-liceo-${SUFIJO}`;

/** La clave exacta que construye `getGrades` cuando no se le pasa ningún filtro. */
const CLAVE_DE_TODAS_LAS_NOTAS =
    'grades:list|stu:-|sub:-|per:-|act:-|tch:-|cls:-|min:-|max:-|typ:-|df:-|dt:-|pg:1|lm:10|sb:createdAt|so:desc';

function datosDeConexion() {
    const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
    const m = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
    if (!m) throw new Error(`URL de postgres inválida: ${url}`);
    return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4], 10) };
}

/** Una base nueva para el segundo liceo, copiada de la plantilla ya migrada. */
async function crearBaseParaElOtroLiceo(): Promise<string> {
    const plantilla = (process.env.TEST_TEMPLATE_DATABASE_URL || '').match(/\/([^/?]+)(\?|$)/)?.[1];
    if (!plantilla) throw new Error('No hay plantilla de base para crear el segundo liceo');

    const nombre = `t_mezcla_${process.pid}_${Date.now().toString(36).slice(-5)}`;
    const cliente = new Client({ ...datosDeConexion(), database: 'postgres' });
    await cliente.connect();
    try {
        await cliente.query(`CREATE DATABASE "${nombre}" TEMPLATE "${plantilla}"`);
    } finally {
        await cliente.end();
    }
    return nombre;
}

async function borrarBaseDelOtroLiceo(nombre?: string) {
    if (!nombre) return;
    const cliente = new Client({ ...datosDeConexion(), database: 'postgres' });
    await cliente.connect();
    try {
        await cliente.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
    } finally {
        await cliente.end();
    }
}

describe('La memoria rápida no mezcla liceos', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let tokenA: string;
    let tokenB: string;
    let baseDeB: string | undefined;
    let prismaB: PrismaClient | undefined;

    const auth = (token: string, slug: string) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': slug,
    });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        await cleanTestDatabase(prisma);

        const { user: admin } = await createTestUser(prisma, UserRole.ADMIN);

        // El segundo liceo es un liceo de verdad: su propia base, copiada de la
        // misma plantilla ya migrada que usan todas las pruebas. Vacío, que es
        // justo lo que hace visible la fuga: si al pedir sus notas le llegan
        // notas, no son suyas.
        const liceoA = await platformPrisma.institute.findUnique({ where: { id: ID_A } });
        baseDeB = await crearBaseParaElOtroLiceo();
        await platformPrisma.institute.create({
            data: {
                id: ID_B,
                code: `OTRO_${SUFIJO}`,
                slug: SLUG_B,
                subdomain: SLUG_B,
                name: 'Otro liceo',
                email: `otro-${SUFIJO}@liceo.test`,
                environment: 'development',
                status: 'ACTIVE',
                databaseName: baseDeB,
                databaseHost: liceoA!.databaseHost,
                databasePort: liceoA!.databasePort,
                databaseUser: liceoA!.databaseUser,
                databasePassword: liceoA!.databasePassword,
            },
        });

        // El segundo liceo necesita su propio administrador, en SU base: el del
        // primero no existe ahí, y el servidor —con razón— no le abre.
        const urlDeB = `postgresql://${liceoA!.databaseUser}:${liceoA!.databasePassword}` +
            `@${liceoA!.databaseHost}:${liceoA!.databasePort}/${baseDeB}`;
        prismaB = new PrismaClient({ datasources: { db: { url: urlDeB } } });
        await prismaB.institute.upsert({
            where: { id: ID_B },
            update: {},
            create: {
                id: ID_B,
                code: `OTRO_${SUFIJO}`,
                slug: SLUG_B,
                name: 'Otro liceo',
                email: `otro-${SUFIJO}@liceo.test`,
            },
        });
        const adminDeB = await prismaB.user.create({
            data: {
                id: `adm-b-${SUFIJO}`.substring(0, 30),
                email: `admin-b-${SUFIJO}@liceo.test`,
                password: '$2b$10$test.hash.password',
                firstName: 'Admin',
                lastName: 'DelOtroLiceo',
                role: UserRole.ADMIN,
                instituteId: ID_B,
                isActive: true,
            },
        });

        tokenA = generateTestToken(admin.id, UserRole.ADMIN, ID_A);
        tokenB = generateTestToken(adminDeB.id, UserRole.ADMIN, ID_B);
    });

    afterAll(async () => {
        await platformPrisma.institute.delete({ where: { id: ID_B } }).catch(() => undefined);
        await prismaB?.$disconnect().catch(() => undefined);
        await borrarBaseDelOtroLiceo(baseDeB).catch(() => undefined);
        await cleanTestDatabase(prisma);
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await sinLiceo(() => RedisCache.clearPattern('*'));
        await conLiceo(ID_A, () => RedisCache.clearPattern('*'));
        await conLiceo(ID_B, () => RedisCache.clearPattern('*'));
    });

    // ═════════════════════════════════════════════════════════════════════════
    // LA FUGA DE VERDAD, POR LA RUTA DE VERDAD
    // ═════════════════════════════════════════════════════════════════════════

    it('MEZCLA-01: lo que un liceo deja guardado NO se le sirve al siguiente', async () => {
        // 1. El liceo A pide todas sus notas. Queda guardado.
        const primera = await request(server.server)
            .get('/api/grades')
            .set(auth(tokenA, SLUG_A));
        expect(primera.status).toBe(200);

        // 2. Lo guardado está donde se cree que está. Si esta comprobación
        //    fallara, la clave de abajo ya no sería la que usa el sistema y el
        //    resto de la prueba no probaría nada.
        const guardado = await conLiceo(ID_A, () => RedisCache.get(CLAVE_DE_TODAS_LAS_NOTAS));
        expect(guardado).not.toBeNull();

        // 3. Se marca lo del liceo A para poder reconocerlo si sale por donde
        //    no debe.
        const SENA = { grades: [{ id: 'ESTO-ES-DEL-LICEO-A' }], pagination: { page: 1, limit: 10, total: 1, pages: 1 } };
        await conLiceo(ID_A, () => RedisCache.set(CLAVE_DE_TODAS_LAS_NOTAS, SENA, 300));

        // 4. El liceo A lo recibe: la copia guardada es lo que se sirve.
        const suya = await request(server.server).get('/api/grades').set(auth(tokenA, SLUG_A));
        expect(JSON.stringify(suya.body)).toContain('ESTO-ES-DEL-LICEO-A');

        // 5. Y el liceo B pide lo mismo: NO puede recibir lo del A.
        const ajena = await request(server.server).get('/api/grades').set(auth(tokenB, SLUG_B));
        expect(ajena.status).toBe(200);
        expect(JSON.stringify(ajena.body)).not.toContain('ESTO-ES-DEL-LICEO-A');
    });

    it('MEZCLA-02: guardar en un liceo no tira lo guardado del otro', async () => {
        // Antes, al guardar una nota se limpiaba `grades:list:*` entero.
        await conLiceo(ID_A, () => RedisCache.set('grades:list|prueba', { de: 'A' }, 300));
        await conLiceo(ID_B, () => RedisCache.set('grades:list|prueba', { de: 'B' }, 300));

        await conLiceo(ID_A, () => RedisCache.clearPattern('grades:list*'));

        expect(await conLiceo(ID_A, () => RedisCache.get('grades:list|prueba'))).toBeNull();
        expect(await conLiceo(ID_B, () => RedisCache.get('grades:list|prueba'))).toEqual({ de: 'B' });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // LA PIEZA, POR SU CUENTA
    // ═════════════════════════════════════════════════════════════════════════

    it('MEZCLA-03: la misma clave en dos liceos guarda dos cosas distintas', async () => {
        await conLiceo(ID_A, () => RedisCache.set('lo:mismo', 'de A', 300));
        await conLiceo(ID_B, () => RedisCache.set('lo:mismo', 'de B', 300));

        expect(await conLiceo(ID_A, () => RedisCache.get('lo:mismo'))).toBe('de A');
        expect(await conLiceo(ID_B, () => RedisCache.get('lo:mismo'))).toBe('de B');
    });

    it('MEZCLA-04: lo de fuera de una petición tampoco se mezcla con lo de un liceo', async () => {
        await conLiceo(ID_A, () => RedisCache.set('tarea:nocturna', 'del liceo', 300));
        await sinLiceo(() => RedisCache.set('tarea:nocturna', 'de nadie', 300));

        expect(await conLiceo(ID_A, () => RedisCache.get('tarea:nocturna'))).toBe('del liceo');
        expect(await sinLiceo(() => RedisCache.get('tarea:nocturna'))).toBe('de nadie');
    });

    it('MEZCLA-05: lo de la plataforma SÍ es de todos, se mire desde donde se mire', async () => {
        // El portal público escribe el nombre del liceo y el superadministrador
        // lo borra desde fuera. Si cada uno lo metiera en un apartado distinto,
        // borrar no alcanzaría a lo escrito.
        await conLiceo(ID_A, () => RedisCache.set(`institute:info:${SLUG_A}`, { nombre: 'viejo' }, 300));
        expect(await sinLiceo(() => RedisCache.get(`institute:info:${SLUG_A}`))).toEqual({ nombre: 'viejo' });

        await sinLiceo(() => RedisCache.del(`institute:info:${SLUG_A}`));
        expect(await conLiceo(ID_A, () => RedisCache.get(`institute:info:${SLUG_A}`))).toBeNull();
    });

    it('MEZCLA-06: `tenant:` queda fuera porque es lo que dice de qué liceo es la petición', async () => {
        await sinLiceo(() => RedisCache.set(`tenant:slug:${SLUG_A}`, ID_A, 300));
        expect(await conLiceo(ID_B, () => RedisCache.get(`tenant:slug:${SLUG_A}`))).toBe(ID_A);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // QUE EL LICEO LLEGUE HASTA DONDE TIENE QUE LLEGAR
    // ═════════════════════════════════════════════════════════════════════════

    // ═════════════════════════════════════════════════════════════════════════
    // QUE NO VUELVA A APARECER OTRA MEMORIA COMPARTIDA
    // ═════════════════════════════════════════════════════════════════════════

    it('MEZCLA-08: ninguna memoria de módulo nueva sin decir de qué liceo es', () => {
        /**
         * La memoria rápida ya no puede olvidarse del liceo: lo pone ella sola.
         * Lo que sí puede volver a aparecer es lo OTRO que había — una tabla en
         * memoria a nivel de módulo, compartida por todo el servidor, con una
         * clave que no dice de qué liceo es. Así estaba el «quién es el personal
         * de esta sección», y por eso un cambio en un liceo avisaba al de al
         * lado.
         *
         * Esta prueba no adivina si una tabla nueva está bien o mal: obliga a
         * que **alguien lo haya mirado** y la haya apuntado aquí con su motivo.
         * Una tabla nueva sin apuntar rompe la tanda, y eso es exactamente lo
         * que se quiere.
         */
        const MIRADAS: Record<string, string> = {
            'src/config/database.ts|tenantConnections':
                'la clave es el liceo',
            'src/config/redis.ts|memoryStore':
                'es la memoria rápida misma: la clave ya lleva el liceo (getKey)',
            'src/plugins/anti-doble-envio.ts|enCurso':
                'la clave lleva la credencial de quien pide, que es de un liceo y de una persona',
            'src/services/a-quien-afecta.service.ts|personalPorSeccion':
                'la clave lleva el liceo delante (clavePorLiceo)',
            'src/middleware/smart-cache.middleware.ts|READ_ONLY_ROLES':
                'son los nombres de los roles, no datos de nadie',
            'src/plugins/avisar-cambios.ts|METODOS_QUE_ESCRIBEN':
                'son los métodos HTTP que escriben (POST, PUT...), no datos de nadie',
            'src/utils/papelera.ts|FUERA_DE_LA_PAPELERA':
                'son dos nombres de tablas (refreshToken, notification), no datos de nadie',
            'src/scripts/medir-concurrencia.ts|credenciales':
                'guion de medición, no corre en el servidor',
        };

        const carpetas = ['src/config', 'src/controllers', 'src/middleware', 'src/plugins', 'src/services', 'src/utils', 'src/scripts'];
        // `const algo = new Map(...)` suelto en un módulo, y también el que vive
        // colgado de una clase (`private static algo = new Map(...)`), que es
        // igual de compartido aunque no lo parezca.
        // El `const` va sin sangrar (si está dentro de una función es una
        // variable local y no la comparte nadie); el `static` sí, porque vive
        // colgado de una clase.
        const declaracion =
            /^(?:(?:const|let)\s+|\s+(?:(?:public|private|protected)\s+)?(?:readonly\s+)?static(?:\s+readonly)?\s+)([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*new\s+(?:Map|Set|WeakMap)/;

        const sinMirar: string[] = [];
        let archivosMirados = 0;
        for (const carpeta of carpetas) {
            const dir = path.join(process.cwd(), carpeta);
            expect(fs.existsSync(dir)).toBe(true);
            for (const archivo of fs.readdirSync(dir, { recursive: true } as never) as string[]) {
                if (!String(archivo).endsWith('.ts')) continue;
                const ruta = path.join(dir, String(archivo));
                if (!fs.statSync(ruta).isFile()) continue;
                archivosMirados++;
                const texto = fs.readFileSync(ruta, 'utf8');
                for (const linea of texto.split(/\r?\n/)) {
                    const m = declaracion.exec(linea);
                    if (!m) continue;
                    const clave = `${carpeta}/${String(archivo).split(sep).join('/')}|${m[1]}`;
                    if (!(clave in MIRADAS)) sinMirar.push(clave);
                }
            }
        }

        // Si no se hubiera mirado nada, la comprobación de abajo pasaría sola
        // y no estaría vigilando nada. Esto lo impide.
        expect(archivosMirados).toBeGreaterThan(100);
        expect(sinMirar).toEqual([]);
    });

    it('MEZCLA-07: el liceo llega hasta el servicio, no se queda en el guardián', async () => {
        // Esto es lo que sostiene todo lo anterior, y es justo lo que falló al
        // primer intento: el liceo se apuntaba al empezar la petición y **no
        // llegaba** al servicio, que guardaba en el apartado «sin liceo».
        await request(server.server).get('/api/grades').set(auth(tokenA, SLUG_A));

        const claves: string[] = Array.from((RedisCache as never as { memoryStore: Map<string, unknown> }).memoryStore.keys());
        const laDeLasNotas = claves.find((k) => k.includes('grades:list|'));

        expect(laDeLasNotas).toBeDefined();
        expect(laDeLasNotas).toContain(`liceo:${ID_A}:`);
        expect(laDeLasNotas).not.toContain('sin-liceo:');
    });
});
