import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { platformPrisma } from '../../src/config/database';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken, seedSuperAdmin, generateSuperAdminTestToken } from '../helpers';
import { Medidor, percentil, cubetaDe, CUBETAS_MS, moldeDeLaRuta } from '../../src/utils/medidor-de-rutas';
import { Agrupador, normalizarMensaje, primerMarcoPropio } from '../../src/utils/errores-agrupados';
import { erlangC, prever, limites, calibrar } from '../../src/utils/pronostico-de-carga';
import { volcarLaSalud } from '../../src/services/salud-de-rutas.service';
import { medidor } from '../../src/utils/medidor-de-rutas';
import { nombreDeLaRuta } from '../../src/utils/nombres-de-las-rutas';

/**
 * LA SALUD DEL SISTEMA (18-oct-2026)
 *
 *   SALUD-01 el histograma da percentiles correctos (contra la cuenta exacta)
 *   SALUD-02 la ruta se mide como molde: dos ids, una fila
 *   SALUD-03 un error que pasa mil veces con ids distintos es UNA huella, sin datos personales
 *   SALUD-04 el pronóstico: Erlang C conocido, sube con la gente y se cae en ρ=1
 *   SALUD-05 una petición de verdad queda medida y, al volcar, sale en el panel; dos volcados se SUMAN
 *   SALUD-06 POST /api/errores agrupa lo que manda la pantalla; el panel lo lista y se marca resuelto
 *   SALUD-07 el panel de salud no se abre con una sesión de liceo (ni de su admin)
 *   SALUD-08 medir cuesta menos de 0,05 ms por petición
 */

const SLUG = 'test-institute';

describe('La salud del sistema', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let tokenAdmin: string;
    let tokenSuper: string;

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        const sup = await seedSuperAdmin(platformPrisma);
        tokenSuper = generateSuperAdminTestToken(sup.id, sup.email);
    }, 180000);

    afterAll(async () => {
        // La base de la plataforma es la de verdad: lo que la prueba apuntó no
        // puede quedarse en el panel del superadmin.
        await platformPrisma.$executeRawUnsafe(`DELETE FROM "errores_agrupados" WHERE "mensaje" LIKE 'Pantalla rota prueba%'`);
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('SALUD-01: el histograma da percentiles cerca de la cuenta exacta', () => {
        const tiempos = Array.from({ length: 5000 }, (_, i) => 3 + ((i * 7919) % 900));
        const c = new Array(CUBETAS_MS.length + 1).fill(0);
        for (const t of tiempos) c[cubetaDe(t)]++;
        const orden = [...tiempos].sort((a, b) => a - b);
        for (const q of [0.5, 0.95, 0.99]) {
            const exacto = orden[Math.floor(q * orden.length)];
            const aprox = percentil(c, q, Math.max(...tiempos))!;
            // Dentro de su cubeta (las cubetas son la resolución).
            const i = cubetaDe(exacto);
            const piso = i === 0 ? 0 : CUBETAS_MS[i - 1];
            const techo = CUBETAS_MS[i] ?? Infinity;
            expect(aprox).toBeGreaterThanOrEqual(piso);
            expect(aprox).toBeLessThanOrEqual(techo);
        }
        expect(percentil(new Array(12).fill(0), 0.5)).toBeNull();
    });

    it('SALUD-02: la ruta se mide como molde', () => {
        const m = new Medidor();
        m.apuntar({ metodo: 'GET', ruta: moldeDeLaRuta('/api/students/:id', '/api/students/abc'), rol: 'ADMIN', liceo: 'L1', ms: 10, estado: 200, codigo: null, persona: 'u1' });
        m.apuntar({ metodo: 'GET', ruta: moldeDeLaRuta('/api/students/:id', '/api/students/xyz'), rol: 'ADMIN', liceo: 'L1', ms: 30, estado: 500, codigo: null, persona: 'u2' });
        // Sin molde (un 404): los ids se tapan solos.
        expect(moldeDeLaRuta(undefined, '/api/students/3f2a9c1e-1111-2222-3333-444455556666/boleta?x=1')).toBe('/api/students/:id/boleta');
        const v = m.vaciar();
        expect(v.porRuta.size).toBe(1);
        const c = [...v.porRuta.values()][0];
        expect(c.total).toBe(2);
        expect(c.e5xx).toBe(1);
        expect(c.personas.size).toBe(2);
        expect(v.porLiceo.get('L1')!.total).toBe(2);
        expect(m.porRuta.size).toBe(0);
    });

    it('SALUD-03: el mismo error con ids distintos es una huella, sin datos personales', () => {
        const a = new Agrupador();
        const pila = 'TypeError: x\n    at f (/srv/app/src/services/notas.service.ts:120:5)\n    at g (node_modules/fastify/lib/x.js:1:1)';
        const h1 = a.apuntar({ origen: 'servidor', tipo: 'TypeError', mensaje: 'No existe el alumno 3f2a9c1e-1111-2222-3333-444455556666 (V-12345678, pepe@correo.com)', pila, liceo: 'A' });
        const h2 = a.apuntar({ origen: 'servidor', tipo: 'TypeError', mensaje: 'No existe el alumno 9b9b9b9b-1111-2222-3333-444455556666 (V-87654321, ana@correo.com)', pila, liceo: 'B' });
        expect(h1).toBe(h2);
        const [g] = a.vaciar();
        expect(g.veces).toBe(2);
        expect(Object.keys(g.liceos)).toEqual(['A', 'B']);
        expect(g.donde).toBe('services/notas.service.ts:120');
        expect(g.mensaje).not.toMatch(/12345678|pepe@|3f2a9c1e/);
        expect(g.muestra).not.toMatch(/12345678|pepe@correo/);
        expect(normalizarMensaje('tardó 1234 ms')).toBe('tardó N ms');
        expect(primerMarcoPropio('E\n at x (node:internal/x:1:1)')).toBe('');
    });

    it('SALUD-04: el pronóstico se comporta como una cola', () => {
        // Erlang C conocido: c=2, carga 1 → 1/3.
        expect(erlangC(2, 1)).toBeCloseTo(1 / 3, 5);
        expect(erlangC(1, 0.5)).toBeCloseTo(0.5, 5);
        const e = { servicioMs: 50, porPersonaPorSegundo: 0.05, aLaVez: 20 };
        const poca = prever(e, 100);
        const mucha = prever(e, 7000);
        expect(poca.respuestaMs!).toBeGreaterThanOrEqual(50);
        expect(poca.respuestaMs!).toBeLessThan(51);
        expect(mucha.respuestaMs!).toBeGreaterThan(poca.respuestaMs!);
        expect(prever(e, 8000).respuestaMs).toBeNull(); // ρ = 8000·0,05·0,05/20 = 1
        const l = limites(e);
        expect(l.seCae).toBe(8000);
        expect(l.seDobla!).toBeGreaterThan(0);
        expect(l.seDobla!).toBeLessThan(8000);
        const cal = calibrar({ servicioMs: 50, aLaVez: 20 }, [{ personas: 100, porSegundo: 5, mediaMs: 55 }]);
        expect(cal.errorMedio).toBeCloseTo(5 / 55, 2);
    });

    it('SALUD-05: una petición de verdad queda medida, y dos volcados se suman', async () => {
        medidor.vaciar();
        const ruta = '/api/academic-years';
        for (let i = 0; i < 3; i++) await request(server.server).get(ruta).set('Authorization', `Bearer ${tokenAdmin}`).set('X-Institute-Slug', SLUG);
        await volcarLaSalud();
        for (let i = 0; i < 2; i++) await request(server.server).get(ruta).set('Authorization', `Bearer ${tokenAdmin}`).set('X-Institute-Slug', SLUG);
        await volcarLaSalud();

        const r = await request(server.server).get('/api/superadmin/salud/rutas?horas=1').set('Authorization', `Bearer ${tokenSuper}`);
        expect(r.status).toBe(200);
        const fila = r.body.rutas.find((x: any) => x.ruta === `GET ${ruta}` && x.rol === 'ADMIN');
        expect(fila).toBeTruthy();
        expect(fila.total).toBeGreaterThanOrEqual(5);
        expect(fila.p50).not.toBeNull();
        expect(fila.nombre).toBe('Ver años escolares');

        const l = await request(server.server).get('/api/superadmin/salud/liceos?horas=1').set('Authorization', `Bearer ${tokenSuper}`);
        expect(l.status).toBe(200);
        expect(l.body.liceos.length).toBeGreaterThan(0);

        const p = await request(server.server).get('/api/superadmin/salud/pronostico').set('Authorization', `Bearer ${tokenSuper}`);
        expect(p.status).toBe(200);
        expect(p.body.supuestos.length).toBeGreaterThan(3);
    }, 60000);

    it('SALUD-06: la pantalla manda su fallo, se agrupa y se marca resuelto', async () => {
        const unico = `Pantalla rota prueba ${Date.now().toString(36).replace(/\d/g, 'x')}`;
        for (const id of ['aaaa1111bbbb2222cccc', 'dddd3333eeee4444ffff']) {
            const r = await request(server.server)
                .post('/api/errores')
                .set('X-Institute-Slug', SLUG)
                .send({ tipo: 'TypeError', mensaje: unico, pila: 'TypeError\n at x (webpack:///./src/app/page.tsx:10:2)', pantalla: `/dashboard/academico/${id}`, version: '1.15' });
            expect(r.status).toBe(202);
        }
        await volcarLaSalud();
        const r = await request(server.server).get('/api/superadmin/salud/errores').set('Authorization', `Bearer ${tokenSuper}`);
        const e = r.body.errores.find((x: any) => x.mensaje === normalizarMensaje(unico));
        expect(e).toBeTruthy();
        expect(e.veces).toBe(2);
        expect(e.ruta).toBe('/dashboard/academico/:id');
        const m = await request(server.server).patch(`/api/superadmin/salud/errores/${e.huella}`).set('Authorization', `Bearer ${tokenSuper}`).send({ estado: 'resuelto' });
        expect(m.status).toBe(200);
        // Vuelve a pasar: se reabre como «volvió».
        await request(server.server).post('/api/errores').set('X-Institute-Slug', SLUG).send({ tipo: 'TypeError', mensaje: unico, pila: 'TypeError\n at x (webpack:///./src/app/page.tsx:10:2)', pantalla: '/dashboard/academico/zzzz9999yyyy8888xxxx', version: '1.15' });
        await volcarLaSalud();
        const r2 = await request(server.server).get('/api/superadmin/salud/errores').set('Authorization', `Bearer ${tokenSuper}`);
        expect(r2.body.errores.find((x: any) => x.huella === e.huella).estado).toBe('volvio');
    }, 60000);

    it('SALUD-07: el panel de salud no se abre con una sesión de liceo', async () => {
        for (const ruta of ['rutas', 'liceos', 'errores', 'pronostico', 'robot']) {
            const r = await request(server.server).get(`/api/superadmin/salud/${ruta}`).set('Authorization', `Bearer ${tokenAdmin}`).set('X-Institute-Slug', SLUG);
            expect([401, 403]).toContain(r.status);
            const sin = await request(server.server).get(`/api/superadmin/salud/${ruta}`);
            expect([401, 403]).toContain(sin.status);
        }
    });

    it('SALUD-08: medir cuesta menos de 0,05 ms por petición', () => {
        const m = new Medidor();
        const n = 200_000;
        const t0 = performance.now();
        for (let i = 0; i < n; i++) m.apuntar({ metodo: 'GET', ruta: `/api/r${i % 300}`, rol: 'STUDENT', liceo: `L${i % 50}`, ms: i % 700, estado: i % 97 === 0 ? 500 : 200, codigo: null, persona: `u${i % 5000}` });
        const porPeticion = (performance.now() - t0) / n;
        expect(porPeticion).toBeLessThan(0.05);
        expect(nombreDeLaRuta('POST /api/classrooms/:classroomId/subjects/:subjectId/grades')).toBe('Guardar secciones · materias · notas');
    });
});
