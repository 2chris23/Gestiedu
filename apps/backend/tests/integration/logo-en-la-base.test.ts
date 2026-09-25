import { FastifyInstance } from 'fastify';
import request = require('supertest');
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { platformPrisma } from '../../src/config/database';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';

/**
 * EL LOGO DEL LICEO, EN LA BASE Y NO EN EL DISCO DEL PROCESO
 *
 * Se guardaba en `uploads/` del proceso que lo recibía. Con dos procesos
 * detrás del repartidor, el otro no lo tenía; y el respaldo nocturno, que
 * guarda bases, no lo guardaba. Ver `services/archivos-del-liceo.service.ts`.
 */

const SLUG = 'test-institute';
const LICEO = 'institute';

describe('El logo del liceo, en la base', () => {
    let server: FastifyInstance;
    let otroProceso: FastifyInstance;
    let prisma: PrismaClient;
    let tokenAdmin: string;
    let logo: Buffer;
    let direccion = '';

    const subir = (archivo: Buffer, campo = 'logo') =>
        request(server.server)
            .post('/api/institutes/logos')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .set('X-Institute-Slug', SLUG)
            .attach(campo, archivo, 'mi-logo.png');

    beforeAll(async () => {
        server = await createTestServer();
        otroProceso = await createTestServer();
        prisma = await createTestPrismaClient();
        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, LICEO);
        // Un logo apaisado de verdad, como los de los liceos.
        logo = await sharp({ create: { width: 300, height: 100, channels: 3, background: '#1d4ed8' } }).png().toBuffer();
    }, 120000);

    afterAll(async () => {
        await platformPrisma.archivoDeLiceo.deleteMany({ where: { instituteId: LICEO } }).catch(() => undefined);
        await prisma.$disconnect();
        await server.close();
        await otroProceso.close();
    });

    it('LOGO-01: el admin sube el logo y queda en la base, con una dirección que lleva su huella', async () => {
        const res = await subir(logo);
        expect(res.status).toBe(200);

        direccion = res.body.data?.logo;
        expect(direccion).toMatch(new RegExp(`^/uploads/liceo/${LICEO}/logo-[a-f0-9]{16}\\.png$`));

        const nombre = direccion.split('/').pop()!;
        const fila = await platformPrisma.archivoDeLiceo.findUnique({
            where: { instituteId_nombre: { instituteId: LICEO, nombre } },
        });
        expect(fila?.bytes).toBe(logo.length);
        expect(Buffer.from(fila!.datos).equals(logo)).toBe(true);
    });

    it('LOGO-02: lo sirve cualquier proceso, igual byte a byte y con caché para siempre', async () => {
        for (const proceso of [server, otroProceso]) {
            const res = await request(proceso.server).get(direccion).buffer(true).parse((r, fin) => {
                const trozos: Buffer[] = [];
                r.on('data', (t: Buffer) => trozos.push(t));
                r.on('end', () => fin(null, Buffer.concat(trozos)));
            });
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toBe('image/png');
            expect(res.headers['cache-control']).toContain('immutable');
            expect(res.headers['x-content-type-options']).toBe('nosniff');
            expect((res.body as Buffer).equals(logo)).toBe(true);
        }
    });

    it('LOGO-03: subir el mismo archivo otra vez no lo duplica', async () => {
        const res = await subir(logo);
        expect(res.body.data?.logo).toBe(direccion);
        expect(await platformPrisma.archivoDeLiceo.count({ where: { instituteId: LICEO, nombre: { startsWith: 'logo-' } } })).toBe(1);
    });

    it('LOGO-04: una dirección que no tiene la forma de un archivo no abre nada', async () => {
        for (const mala of [
            `/uploads/liceo/${LICEO}/..%2F..%2Fpackage.json`,
            `/uploads/liceo/${LICEO}/logo-0123456789abcdef.html`,
            `/uploads/liceo/otro-liceo/${direccion.split('/').pop()}`,
            `/uploads/liceo/${LICEO}/logo-ffffffffffffffff.png`,
        ]) {
            const res = await request(server.server).get(mala);
            expect(res.status).toBe(404);
        }
    });

    it('LOGO-05: el icono de la app se dibuja con el logo guardado en la base', async () => {
        const res = await request(server.server)
            .get(`/api/institutes/current/icono?liceo=${SLUG}&tam=192`)
            .buffer(true)
            .parse((r, fin) => {
                const trozos: Buffer[] = [];
                r.on('data', (t: Buffer) => trozos.push(t));
                r.on('end', () => fin(null, Buffer.concat(trozos)));
            });
        expect(res.status).toBe(200);
        const { width, height } = await sharp(res.body as Buffer).metadata();
        expect([width, height]).toEqual([192, 192]);
    });
});
