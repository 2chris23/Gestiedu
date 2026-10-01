import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestAcademicYear,
    generateTestToken,
} from '../helpers';
import { createId } from '@paralleldrive/cuid2';

/**
 * LA FOTO DE PERFIL
 *
 * Tres promesas, cada una con su prueba:
 *   1. pesa poquísimo (una foto de teléfono de varios MB queda en ~15 KB);
 *   2. no lleva la ubicación GPS ni nada de lo que traía el archivo original;
 *   3. solo la ve quien puede ver a esa persona, y solo el admin la pone.
 */

const SLUG = 'test-institute';

/**
 * Una "foto de teléfono": 12 megapíxeles (3000×4000) con degradado y grano, que
 * en JPEG pesa lo de una foto real (~1,7 MB), y un EXIF con datos de la casa.
 */
async function fotoDeTelefono(): Promise<Buffer> {
    const ancho = 3000;
    const alto = 4000;
    const pixeles = Buffer.alloc(ancho * alto * 3);
    for (let y = 0; y < alto; y++) {
        for (let x = 0; x < ancho; x++) {
            const i = (y * ancho + x) * 3;
            const grano = ((x * 2654435761) ^ (y * 40503)) >>> 26;
            pixeles[i] = ((x / ancho) * 200 + grano) | 0;
            pixeles[i + 1] = ((y / alto) * 200 + grano) | 0;
            pixeles[i + 2] = (grano * 3) & 255;
        }
    }
    return sharp(pixeles, { raw: { width: ancho, height: alto, channels: 3 } })
        .jpeg({ quality: 88 })
        .withExifMerge({ IFD0: { Make: 'TelefonoDePrueba', ImageDescription: 'Casa de Ana, calle 5' } })
        .toBuffer();
}

describe('Foto de perfil', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const tk: Record<string, string> = {};
    let admin: any, ana: any, luis: any, profe: any, otroProfe: any, madre: any;

    const auth = (t: string) => (r: request.Test) => r.set('Authorization', `Bearer ${t}`).set('X-Institute-Slug', SLUG);
    const subir = (t: string, userId: string, bytes: Buffer, nombre = 'foto.jpg') =>
        auth(t)(request(server.server).put(`/api/users/${userId}/photo`)).attach('foto', bytes, nombre);
    const ver = (t: string, userId: string) => auth(t)(request(server.server).get(`/api/users/${userId}/photo`));

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT)).user;
        luis = (await createTestUser(prisma, UserRole.STUDENT)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otroProfe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        madre = (await createTestUser(prisma, UserRole.TUTOR)).user;
        for (const [k, u, r] of [
            ['admin', admin, UserRole.ADMIN], ['ana', ana, UserRole.STUDENT], ['luis', luis, UserRole.STUDENT],
            ['profe', profe, UserRole.TEACHER], ['otro', otroProfe, UserRole.TEACHER], ['madre', madre, UserRole.TUTOR],
        ] as const) {
            tk[k] = generateTestToken(u.id, r, 'institute');
        }

        // El profe da clase en la sección de Ana; la madre representa a Ana.
        const year = await createTestAcademicYear(prisma, 'institute');
        const seccion = await prisma.classroom.create({
            data: { id: `c${createId()}`, name: '1er A', slug: `foto-${createId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute', teacherId: profe.id },
        });
        await prisma.studentClassroom.create({ data: { studentId: ana.id, classroomId: seccion.id, academicYearId: year.id, isActive: true } });
        await prisma.studentTutor.create({ data: { studentId: ana.id, tutorId: madre.id, relationship: 'Madre' } });
    }, 60000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('FOTO-01: una foto de teléfono de varios MB queda en menos de 25 KB, 256×256 WebP', async () => {
        const original = await fotoDeTelefono();
        expect(original.length).toBeGreaterThan(1_000_000);

        const res = await subir(tk.admin, ana.id, original);
        expect(res.status).toBe(200);
        expect(res.body.bytesGuardados).toBeLessThan(25_000);
        expect(res.body.avatar).toMatch(new RegExp(`^/users/${ana.id}/photo\\?v=[0-9a-f]{12}$`));

        const guardada = await prisma.userPhoto.findUnique({ where: { userId: ana.id } });
        const meta = await sharp(Buffer.from(guardada!.data)).metadata();
        expect(meta.format).toBe('webp');
        expect([meta.width, meta.height]).toEqual([256, 256]);
        // Lo que traía el teléfono no sobrevive.
        expect(meta.exif).toBeUndefined();
        expect(Buffer.from(guardada!.data).toString('latin1')).not.toMatch(/Casa de Ana|TelefonoDePrueba/);

        const usuario = await prisma.user.findUnique({ where: { id: ana.id }, select: { avatar: true } });
        expect(usuario?.avatar).toBe(res.body.avatar);
    }, 60000);

    it('FOTO-02: nadie más que el admin sube o quita fotos, ni la suya', async () => {
        const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#0af' } }).png().toBuffer();
        for (const [t, id] of [[tk.ana, ana.id], [tk.profe, profe.id], [tk.madre, ana.id], [tk.profe, ana.id]]) {
            expect([401, 403]).toContain((await subir(t, id, png, 'x.png')).status);
            expect([401, 403]).toContain((await auth(t)(request(server.server).delete(`/api/users/${id}/photo`))).status);
        }
    }, 60000);

    it('FOTO-03: la foto de un alumno la ven él, su madre, su profesor y el admin; nadie más', async () => {
        for (const t of [tk.ana, tk.madre, tk.profe, tk.admin]) {
            const res = await ver(t, ana.id);
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toBe('image/webp');
            expect(res.headers['cache-control']).toMatch(/private/);
            expect(res.headers['x-content-type-options']).toBe('nosniff');
        }
        // Otro alumno y un profesor que no le da clase: igual que si no tuviera foto.
        for (const t of [tk.luis, tk.otro]) {
            expect((await ver(t, ana.id)).status).toBe(404);
        }
        expect((await request(server.server).get(`/api/users/${ana.id}/photo`).set('X-Institute-Slug', SLUG)).status).toBe(401);
    }, 60000);

    it('FOTO-04: con la misma huella el navegador no la vuelve a descargar (304)', async () => {
        const primera = await ver(tk.ana, ana.id);
        const res = await ver(tk.ana, ana.id).set('If-None-Match', primera.headers.etag);
        expect(res.status).toBe(304);
    }, 60000);

    it('FOTO-05: lo que no es una foto no entra', async () => {
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
        const html = Buffer.from('<html><body><script>fetch("//malo")</script></body></html>');
        const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
        for (const [bytes, nombre] of [[svg, 'a.svg'], [html, 'a.png'], [gif, 'a.gif'], [Buffer.from('hola'), 'a.jpg']] as const) {
            const res = await subir(tk.admin, luis.id, bytes as Buffer, nombre);
            expect(res.status).toBe(400);
        }
        expect(await prisma.userPhoto.count({ where: { userId: luis.id } })).toBe(0);
    }, 60000);

    it('FOTO-06: una "bomba" de píxeles (pocos KB, 64 megapíxeles al abrirla) se rechaza', async () => {
        const bomba = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: '#fff' } })
            .png({ compressionLevel: 9 })
            .toBuffer();
        expect(bomba.length).toBeLessThan(5 * 1024 * 1024);
        expect((await subir(tk.admin, luis.id, bomba, 'bomba.png')).status).toBe(400);
    }, 60000);

    it('FOTO-07: más de 5 MB no entra', async () => {
        const grande = Buffer.concat([await fotoDeTelefono(), Buffer.alloc(5 * 1024 * 1024)]);
        expect([400, 413]).toContain((await subir(tk.admin, luis.id, grande)).status);
    }, 60000);

    it('FOTO-08: el admin la quita; queda en la papelera y el perfil vuelve a las iniciales', async () => {
        expect((await auth(tk.admin)(request(server.server).delete(`/api/users/${ana.id}/photo`))).status).toBe(200);
        expect(await prisma.userPhoto.count({ where: { userId: ana.id } })).toBe(0);
        expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.avatar).toBeNull();
        expect(await prisma.registroBorrado.count({ where: { tabla: 'userPhoto' } })).toBe(1);
        expect((await ver(tk.admin, ana.id)).status).toBe(404);
    }, 60000);
});
