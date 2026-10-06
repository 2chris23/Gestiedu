import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken, createTestAcademicYear, createTestClassroom } from '../helpers';
import { cambiarLosMoldes } from '../../src/services/precarga.service';

/**
 * LA PRECARGA EN UN PAQUETE (`routes/precarga.routes.ts`)
 *
 * El paquete baja de una vez lo de cada persona. Lo que NO puede pasar es que
 * por ahí se cuele lo de otro: cada lectura se hace como esa persona, por la
 * misma puerta que a mano.
 *
 *   PAQUETE-01  el admin: su plan trae las fichas, y el bloque da lo mismo que pedirlo a mano;
 *   PAQUETE-02  el profesor: ni fichas (no las abre); pedir la de otro, 403 y fuera del paquete;
 *   PAQUETE-03  el alumno: solo lo suyo;
 *   PAQUETE-04  el representante: solo sus representados;
 *   PAQUETE-05  sin sesión, 401; lo de entrar y el superadmin no se piden nunca.
 *
 * Y «solo lo que cambió» (`cambios_del_liceo`):
 *
 *   CAMBIOS-01  cada escritura se apunta, con los ids que nombraba;
 *   CAMBIOS-02  al que le toca, le vuelve lo que nombra ese id;
 *   CAMBIOS-03  al alumno no se le cuela nada de otro alumno;
 *   CAMBIOS-04  con la marca de antes de lo que ya se tiró: «baja todo»;
 *   CAMBIOS-05  pedir el plan o un bloque NO es un cambio (si no, un bucle).
 */

const SLUG = 'test-institute';

describe('La precarga en un paquete', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const cab = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        const roles: Array<[string, UserRole]> = [
            ['admin', UserRole.ADMIN],
            ['profe', UserRole.TEACHER],
            ['alumnoA', UserRole.STUDENT],
            ['alumnoB', UserRole.STUDENT],
            ['tutor', UserRole.TUTOR],
        ];
        let instituto = '';
        for (const [nombre, rol] of roles) {
            const { user } = await createTestUser(prisma, rol, { email: `paq-${nombre}@test.com`, firstName: 'Con', lastName: nombre });
            id[nombre] = user.id;
            instituto = user.instituteId as string;
            tok[nombre] = generateTestToken(user.id, rol, instituto);
        }
        const ciclo = await createTestAcademicYear(prisma, instituto);
        const secA = await createTestClassroom(prisma, ciclo.id, instituto);
        const secB = await prisma.classroom.create({
            data: { name: '1er Grado B', slug: `aula-b-${Date.now()}`, grade: 1, section: 'B', academicYearId: ciclo.id, instituteId: instituto } as any,
        });
        await prisma.classroom.update({ where: { id: secA.id }, data: { teacherId: id.profe } });
        await prisma.studentClassroom.create({ data: { studentId: id.alumnoA, classroomId: secA.id, academicYearId: ciclo.id } });
        await prisma.studentClassroom.create({ data: { studentId: id.alumnoB, classroomId: secB.id, academicYearId: ciclo.id } });
        await prisma.studentTutor.create({ data: { studentId: id.alumnoA, tutorId: id.tutor, relationship: 'MADRE' } });

        // Moldes pequeños y conocidos (los de verdad los graba `grabar-lecturas.spec.ts`).
        cambiarLosMoldes({
            version: 99,
            pantallas: {
                'ADMIN:/dashboard': ['/academic-years'],
                'ADMIN:/dashboard/usuarios/{id}#STUDENT': ['/users/{id}'],
                'TEACHER:/dashboard/usuarios/{id}#STUDENT': ['/users/{id}'],
                'STUDENT:/dashboard': ['/users/{yo}'],
                'TUTOR:/dashboard/mi-clase?alumno={alumno}': ['/users/{alumno}'],
            },
        });
    });

    afterAll(async () => {
        cambiarLosMoldes(null);
        await prisma.$disconnect();
        await server.close();
    });

    const plan = (quien: string) => request(server.server).post('/api/precarga/plan').set(cab(tok[quien])).send({ menu: ['/dashboard'] });
    const bloque = (quien: string, lecturas: string[]) => request(server.server).post('/api/precarga/bloque').set(cab(tok[quien])).send({ lecturas });

    it('PAQUETE-01: el admin trae las fichas, y el bloque da lo mismo que pedirlo a mano', async () => {
        const r = await plan('admin');
        expect(r.status).toBe(200);
        expect(r.body.lecturas).toEqual(expect.arrayContaining(['/academic-years', `/users/${id.alumnoA}`, `/users/${id.alumnoB}`]));
        expect(typeof r.body.marca).toBe('number');
        const b = await bloque('admin', [`/users/${id.alumnoA}`, '/academic-years']);
        expect(b.status).toBe(200);
        const aMano = await request(server.server).get(`/api/users/${id.alumnoA}`).set(cab(tok.admin));
        expect(b.body.datos[`/users/${id.alumnoA}`]).toEqual(aMano.body);
    });

    it('PAQUETE-02: el profesor no lleva fichas; pedir la de otro alumno no entra', async () => {
        const r = await plan('profe');
        expect(r.body.lecturas).not.toContain(`/users/${id.alumnoB}`);
        const b = await bloque('profe', [`/users/${id.alumnoB}`]);
        expect(b.body.datos[`/users/${id.alumnoB}`]).toBeUndefined();
        expect(b.body.fallos[`/users/${id.alumnoB}`]).toBe(403);
    });

    it('PAQUETE-03: el alumno, solo lo suyo', async () => {
        const r = await plan('alumnoA');
        expect(r.body.lecturas).toEqual([`/users/${id.alumnoA}`]);
        const b = await bloque('alumnoA', [`/users/${id.alumnoB}`, `/users/${id.alumnoA}`]);
        expect(Object.keys(b.body.datos)).toEqual([`/users/${id.alumnoA}`]);
        expect(b.body.fallos[`/users/${id.alumnoB}`]).toBe(403);
    });

    it('PAQUETE-04: el representante, solo sus representados', async () => {
        const r = await plan('tutor');
        expect(r.body.lecturas).toContain(`/users/${id.alumnoA}`);
        expect(r.body.lecturas).not.toContain(`/users/${id.alumnoB}`);
        const b = await bloque('tutor', [`/users/${id.alumnoB}`]);
        expect(b.body.datos[`/users/${id.alumnoB}`]).toBeUndefined();
    });

    it('PAQUETE-05: sin sesión, 401; lo de entrar y el superadmin no se piden nunca', async () => {
        const sin = await request(server.server).post('/api/precarga/bloque').set({ 'X-Institute-Slug': SLUG }).send({ lecturas: ['/academic-years'] });
        expect(sin.status).toBe(401);
        const b = await bloque('admin', ['/auth/profile', '/superadmin/institutes', '/../users', '//evil.com/x', '/academic-years']);
        expect(Object.keys(b.body.datos)).toEqual(['/academic-years']);
        expect(Object.keys(b.body.fallos)).toEqual([]);
    });

    it('CAMBIOS-01/02/03: se apunta la escritura; vuelve a quien le toca, no al otro alumno', async () => {
        const desde = (await plan('admin')).body.marca as number;
        const put = await request(server.server).put(`/api/users/${id.alumnoA}`).set(cab(tok.admin)).send({ firstName: 'Cambiado' });
        expect(put.status).toBe(200);
        // Se apunta al terminar la respuesta.
        await new Promise((r) => setTimeout(r, 300));
        const filas = await (prisma as any).cambioDelLiceo.findMany({ where: { id: { gt: desde } } });
        expect(filas.length).toBeGreaterThanOrEqual(1);
        expect(filas.some((f: { ids: string[] }) => f.ids.includes(id.alumnoA))).toBe(true);

        const tutor = await request(server.server).post('/api/precarga/cambios').set(cab(tok.tutor)).send({ desde, menu: ['/dashboard'] });
        expect(tutor.status).toBe(200);
        expect(tutor.body.todo).toBe(false);
        expect(tutor.body.lecturas).toContain(`/users/${id.alumnoA}`);
        expect(tutor.body.marca).toBeGreaterThan(desde);

        const otro = await request(server.server).post('/api/precarga/cambios').set(cab(tok.alumnoB)).send({ desde, menu: ['/dashboard'] });
        expect(otro.body.lecturas).toEqual([]);

        // Ya al día: nada.
        const otraVez = await request(server.server).post('/api/precarga/cambios').set(cab(tok.tutor)).send({ desde: tutor.body.marca });
        expect(otraVez.body.lecturas).toEqual([]);
    });

    it('CAMBIOS-04: con una marca de antes de lo ya tirado, «baja todo»', async () => {
        const ultimo = await (prisma as any).cambioDelLiceo.findFirst({ orderBy: { id: 'desc' } });
        await (prisma as any).cambioDelLiceo.deleteMany({ where: { id: { lt: ultimo.id } } });
        const r = await request(server.server).post('/api/precarga/cambios').set(cab(tok.admin)).send({ desde: 0 });
        expect(ultimo.id > 1 ? r.body.todo : true).toBe(true);
    });

    it('CAMBIOS-05: pedir el plan o un bloque no es un cambio', async () => {
        const antes = await (prisma as any).cambioDelLiceo.count();
        await plan('admin');
        await bloque('admin', ['/academic-years']);
        await request(server.server).post('/api/precarga/cambios').set(cab(tok.admin)).send({ desde: 0 });
        await new Promise((r) => setTimeout(r, 300));
        expect(await (prisma as any).cambioDelLiceo.count()).toBe(antes);
    });
});
