import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import * as zlib from 'zlib';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken, createTestAcademicYear, createTestClassroom } from '../helpers';
import { cambiarLosMoldes } from '../../src/services/precarga.service';
import { prepararAUnaPersona, hacerElTrabajoDe, pedirQueSePrepare, ensuciarPorLosCambios, laClaveDelCubo, PRIORIDAD } from '../../src/services/cubos-de-precarga.service';

/**
 * LA DESCARGA EN CUBOS (`services/cubos-de-precarga.service.ts`)
 *
 * Regla de Cristian: lo único que frena a una persona es su teléfono o su
 * internet, nunca el sistema. Al entrar no se arma nada.
 *
 *   CUBO-01  lo que guarda el teléfono con cubos es IDÉNTICO a pedirlo a mano, lectura a lectura
 *   CUBO-02  dos alumnos de la misma sección comparten el cubo del liceo y el de la sección (uno, no dos),
 *            y lo compartido sale igual que si lo pidiera el otro (PRECARGA-AMBITO)
 *   CUBO-03  nadie baja un cubo que no es de su índice: el de otro alumno, el de otra sección (403)
 *   CUBO-04  sin índice: 202 con el puesto, y la petición no arma nada; después, 200 al instante;
 *            el cubo se sirve comprimido, con ETag (304) y Range (reanudar)
 *   CUBO-05  un cambio ensucia SOLO los cubos que toca, y se rehacen de fondo
 *   CUBO-06  dos procesos trabajando a la vez no preparan dos veces a la misma persona
 */

const SLUG = 'test-institute';

describe('La descarga en cubos', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let instituto = '';
    let secA: any;
    let secB: any;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const cab = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        for (const [nombre, rol] of [
            ['admin', UserRole.ADMIN],
            ['alumnoA', UserRole.STUDENT],
            ['alumnoA2', UserRole.STUDENT],
            ['alumnoB', UserRole.STUDENT],
        ] as Array<[string, UserRole]>) {
            const { user } = await createTestUser(prisma, rol, { email: `cubo-${nombre}@test.com`, firstName: 'Con', lastName: nombre });
            id[nombre] = user.id;
            instituto = user.instituteId as string;
            tok[nombre] = generateTestToken(user.id, rol, instituto);
        }
        const ciclo = await createTestAcademicYear(prisma, instituto);
        secA = await createTestClassroom(prisma, ciclo.id, instituto);
        secB = await prisma.classroom.create({
            data: { name: '1er Grado B', slug: `aula-cubo-b-${Date.now()}`, grade: 1, section: 'B', academicYearId: ciclo.id, instituteId: instituto } as any,
        });
        await prisma.studentClassroom.create({ data: { studentId: id.alumnoA, classroomId: secA.id, academicYearId: ciclo.id } });
        await prisma.studentClassroom.create({ data: { studentId: id.alumnoA2, classroomId: secA.id, academicYearId: ciclo.id } });
        await prisma.studentClassroom.create({ data: { studentId: id.alumnoB, classroomId: secB.id, academicYearId: ciclo.id } });

        cambiarLosMoldes({
            version: 98,
            pantallas: {
                'STUDENT:/dashboard': ['/institutes/current/config', '/schedules/classroom/{seccionDelAlumno}', '/users/{yo}'],
                'ADMIN:/dashboard': ['/academic-years', '/institutes/current/config'],
            },
        });
    }, 180000);

    afterAll(async () => {
        cambiarLosMoldes(null);
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    const indice = (quien: string) => request(server.server).post('/api/precarga/indice').set(cab(tok[quien])).send({});
    const cubo = (quien: string, clave: string) => request(server.server).get(`/api/precarga/cubo/${encodeURIComponent(clave)}`).set(cab(tok[quien])).buffer(true).parse((res, cb) => {
        const trozos: Buffer[] = [];
        res.on('data', (t: Buffer) => trozos.push(t));
        res.on('end', () => cb(null, Buffer.concat(trozos)));
    });
    const lineasDe = (gz: Buffer) =>
        zlib
            .gunzipSync(gz)
            .toString('utf-8')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l) as { c: string; d?: unknown; f?: number });

    it('CUBO-04: sin índice, 202 y nada se arma en la petición; luego 200 al instante', async () => {
        const antes = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) n FROM "cubos_de_precarga"`);
        const r = await indice('alumnoA');
        expect(r.status).toBe(202);
        expect(r.body.preparando).toBe(true);
        expect(typeof r.body.delante).toBe('number');
        const despues = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) n FROM "cubos_de_precarga"`);
        expect(Number(despues[0].n)).toBe(Number(antes[0].n)); // la petición no armó nada

        await hacerElTrabajoDe(server, instituto);
        const t0 = Date.now();
        const r2 = await indice('alumnoA');
        expect(r2.status).toBe(200);
        expect(Date.now() - t0).toBeLessThan(1000);
        expect(r2.body.cubos.length).toBeGreaterThanOrEqual(3);
        expect(r2.body.bytes).toBe(r2.body.cubos.reduce((a: number, c: any) => a + c.bytes, 0));

        const c = r2.body.cubos[0];
        const entero = await cubo('alumnoA', c.clave);
        expect(entero.status).toBe(200);
        expect(entero.headers.etag).toBe(`"${c.huella}"`);
        const igual = await request(server.server).get(`/api/precarga/cubo/${encodeURIComponent(c.clave)}`).set(cab(tok.alumnoA)).set('If-None-Match', `"${c.huella}"`);
        expect(igual.status).toBe(304);
        const trozo = await cubo('alumnoA', c.clave).set('Range', 'bytes=5-').set('If-Range', `"${c.huella}"`);
        expect(trozo.status).toBe(206);
        expect(Buffer.compare(trozo.body, (entero.body as Buffer).subarray(5))).toBe(0);
    }, 60000);

    it('CUBO-01: lo de los cubos es idéntico a pedirlo a mano', async () => {
        const r = await indice('alumnoA');
        const guardado = new Map<string, unknown>();
        for (const c of r.body.cubos) for (const l of lineasDe((await cubo('alumnoA', c.clave)).body)) if (l.d !== undefined) guardado.set(l.c, l.d);
        expect([...guardado.keys()].sort()).toEqual(['/institutes/current/config', `/schedules/classroom/${secA.id}`, `/users/${id.alumnoA}`].sort());
        for (const [lectura, datos] of guardado) {
            const aMano = await request(server.server).get(`/api${lectura}`).set(cab(tok.alumnoA));
            expect(datos).toEqual(aMano.body);
        }
    }, 60000);

    it('CUBO-02: la misma sección comparte cubos, y lo compartido sale igual para el otro', async () => {
        await pedirQueSePrepare(instituto, [id.alumnoA2, id.alumnoB], PRIORIDAD.ENTRANDO);
        await hacerElTrabajoDe(server, instituto);
        const a = (await indice('alumnoA')).body.cubos.map((c: any) => c.clave);
        const a2 = (await indice('alumnoA2')).body.cubos.map((c: any) => c.clave);
        const b = (await indice('alumnoB')).body.cubos.map((c: any) => c.clave);
        expect(a).toContain('liceo:STUDENT');
        expect(a).toContain(`seccion:STUDENT:${secA.id}`);
        expect(a2).toContain(`seccion:STUDENT:${secA.id}`);
        expect(b).not.toContain(`seccion:STUDENT:${secA.id}`);
        expect(b).toContain(`seccion:STUDENT:${secB.id}`);
        // Lo suyo no se comparte.
        expect(a.filter((k: string) => k.startsWith('persona:')).some((k: string) => a2.includes(k))).toBe(false);
        // Lo compartido, armado como A, es lo que A2 vería pidiéndolo él.
        for (const clave of ['liceo:STUDENT', `seccion:STUDENT:${secA.id}`]) {
            for (const l of lineasDe((await cubo('alumnoA2', clave)).body)) {
                const comoA2 = await request(server.server).get(`/api${l.c}`).set(cab(tok.alumnoA2));
                expect(l.d).toEqual(comoA2.body);
            }
        }
        // Otro rol, otro cubo del liceo (ver no es lo mismo para todos).
        expect(laClaveDelCubo('/institutes/current/config', { id: 'x', role: 'TEACHER' }, new Set()).clave).toBe('liceo:TEACHER');
        expect(laClaveDelCubo('/notes?x=1', { id: 'x', role: 'STUDENT' }, new Set()).clave.startsWith('persona:x:')).toBe(true);
    }, 60000);

    it('CUBO-03: nadie baja un cubo que no es de su índice', async () => {
        const deA = (await indice('alumnoA')).body.cubos.map((c: any) => c.clave);
        const suyoDeA = deA.find((k: string) => k.startsWith('persona:'));
        expect((await cubo('alumnoB', suyoDeA)).status).toBe(403);
        expect((await cubo('alumnoB', `seccion:STUDENT:${secA.id}`)).status).toBe(403);
        expect((await request(server.server).get(`/api/precarga/cubo/liceo:STUDENT`)).status).toBe(401);
        // Un admin tampoco baja el cubo personal de un alumno (no está en SU índice).
        await pedirQueSePrepare(instituto, [id.admin], PRIORIDAD.ENTRANDO);
        await hacerElTrabajoDe(server, instituto);
        expect((await cubo('admin', suyoDeA)).status).toBe(403);
    }, 60000);

    it('CUBO-05: un cambio ensucia solo los cubos que toca, y se rehacen', async () => {
        await ensuciarPorLosCambios(instituto); // pone el cursor al día
        const huellaDe = async (clave: string) =>
            (await prisma.$queryRawUnsafe<Array<{ huella: string; sucio: boolean }>>(`SELECT "huella","sucio" FROM "cubos_de_precarga" WHERE "clave" = $1`, clave))[0];
        const personaA = (await indice('alumnoA')).body.cubos.find((c: any) => c.clave.startsWith('persona:') ).clave;
        const personaB = (await indice('alumnoB')).body.cubos.find((c: any) => c.clave.startsWith('persona:')).clave;
        // Cambia el nombre del alumno A (como lo apuntaría una escritura).
        await prisma.user.update({ where: { id: id.alumnoA }, data: { firstName: 'Cambiado' } });
        await (prisma as any).cambioDelLiceo.create({ data: { recurso: 'users', accion: 'actualizado', ids: [id.alumnoA], destinatarios: [id.alumnoA, id.admin], todos: false } });
        await ensuciarPorLosCambios(instituto);
        expect((await huellaDe(personaA)).sucio).toBe(true);
        expect((await huellaDe(personaB)).sucio).toBe(false);
        expect((await huellaDe(`seccion:STUDENT:${secB.id}`)).sucio).toBe(false);
        const antes = (await huellaDe(personaA)).huella;
        await hacerElTrabajoDe(server, instituto);
        const ahora = await huellaDe(personaA);
        expect(ahora.sucio).toBe(false);
        expect(ahora.huella).not.toBe(antes);
        const l = lineasDe((await cubo('alumnoA', personaA)).body).find((x) => x.c === `/users/${id.alumnoA}`);
        expect(JSON.stringify(l?.d)).toContain('Cambiado');
    }, 60000);

    it('CUBO-06: dos trabajadores a la vez no preparan dos veces a la misma persona', async () => {
        const muchos: string[] = [];
        for (let i = 0; i < 6; i++) {
            const { user } = await createTestUser(prisma, UserRole.STUDENT, { email: `cubo-muchos-${i}@test.com` });
            await prisma.studentClassroom.create({ data: { studentId: user.id, classroomId: secA.id, academicYearId: secA.academicYearId } });
            muchos.push(user.id);
        }
        await pedirQueSePrepare(instituto, muchos, PRIORIDAD.ENTRANDO);
        const [x, y] = await Promise.all([hacerElTrabajoDe(server, instituto), hacerElTrabajoDe(server, instituto)]);
        expect(x + y).toBe(muchos.length);
        const listos = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
            `SELECT count(*) n FROM "indices_de_precarga" WHERE "usuarioId" = ANY($1) AND NOT "pendiente" AND "armadoEn" IS NOT NULL`,
            muchos
        );
        expect(Number(listos[0].n)).toBe(muchos.length);
        // El cubo de la sección se armó una vez y lo comparten los seis (más A y A2).
        const [s] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) n FROM "indices_de_precarga" WHERE $1 = ANY("claves")`, `seccion:STUDENT:${secA.id}`);
        expect(Number(s.n)).toBe(8);
    }, 90000);
});
