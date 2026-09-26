import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';

/**
 * LOS DATOS OFICIALES DEL PLANTEL, EN CONFIGURACIÓN Y EN EL MEMBRETE
 *
 * Código DEA, código estadístico, código de dependencia, nombre oficial, zona
 * educativa, entidad federal, municipio y parroquia: lo que lleva la cabecera
 * de todo documento oficial de un liceo venezolano (instructivo del Resumen
 * Final del MPPE).
 */

const SLUG = 'test-institute';

describe('Datos oficiales del plantel', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let tkAdmin: string;
    let tkAlumno: string;

    const cab = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Institute-Slug': SLUG });
    const guardar = (documentos: Record<string, unknown>) =>
        request(server.server).put('/api/institutes/current/config').set(cab(tkAdmin)).send({ configuration: { documentos } });
    const membrete = (t: string) => request(server.server).get('/api/institutes/current/membrete').set(cab(t));

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {} } });
        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        const alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        tkAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tkAlumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {} } }).catch(() => {});
        await prisma?.$disconnect();
        await server?.close();
    });

    it('PLANTEL-01: se guardan y salen en el membrete; los códigos, sin espacios ni guiones', async () => {
        const res = await guardar({
            nombreOficial: 'U.E.N. Liceo de Pruebas',
            codigoDea: 'od 0054-1105',
            codigoEstadistico: '11 1299',
            codigoDependencia: '123456789',
            zonaEducativa: 'Zona Educativa del estado Carabobo',
            entidadFederal: 'Carabobo',
            municipio: 'Valencia',
            parroquia: 'San José',
        });
        expect(res.status).toBe(200);

        const m = await membrete(tkAdmin);
        expect(m.status).toBe(200);
        expect(m.body.data).toMatchObject({
            nombre: 'U.E.N. Liceo de Pruebas',
            codigoDea: 'OD00541105',
            codigoEstadistico: '111299',
            codigoDependencia: '123456789',
            entidadFederal: 'Carabobo',
            municipio: 'Valencia',
            parroquia: 'San José',
        });
        expect(m.body.data.ministerio).toEqual(['República Bolivariana de Venezuela', 'Ministerio del Poder Popular para la Educación']);
    });

    it('PLANTEL-02: un código mal escrito o una entidad inventada no se guardan', async () => {
        expect((await guardar({ codigoEstadistico: '12345' })).status).toBe(400);
        expect((await guardar({ codigoDependencia: 'abc' })).status).toBe(400);
        expect((await guardar({ entidadFederal: 'Narnia' })).status).toBe(400);
        const m = await membrete(tkAdmin);
        expect(m.body.data.codigoEstadistico).toBe('111299');
    });

    it('PLANTEL-03: guardar quién firma no borra los datos del plantel (y al revés)', async () => {
        expect((await guardar({ firmanteNombre: 'Carmen Rojas', firmanteCedula: 'V-9876543' })).status).toBe(200);
        const docs: any = ((await platformPrisma.institute.findUnique({ where: { id: 'institute' } }))?.academicConfig as any).documentos;
        expect(docs).toMatchObject({ firmanteNombre: 'Carmen Rojas', codigoDea: 'OD00541105', municipio: 'Valencia' });

        // Un campo vacío se borra; los demás se quedan.
        expect((await guardar({ parroquia: '' })).status).toBe(200);
        const m = await membrete(tkAdmin);
        expect(m.body.data.parroquia).toBeNull();
        expect(m.body.data.municipio).toBe('Valencia');
    });

    it('PLANTEL-04: el membrete lo lee cualquiera con sesión (lo lleva la boleta del alumno); sin sesión, no', async () => {
        expect((await membrete(tkAlumno)).status).toBe(200);
        const sin = await request(server.server).get('/api/institutes/current/membrete').set({ 'X-Institute-Slug': SLUG });
        expect(sin.status).toBe(401);
    });
});
