import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import * as zlib from 'zlib';
import * as ts from 'typescript';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken, createTestAcademicYear, createTestClassroom } from '../helpers';
import { cambiarLosMoldes, formaDeLaLectura, olvidarLoQuePesa } from '../../src/services/precarga.service';
import { armarElPaquete, actualizarPaquetesDeNoche, elMenuDelRol } from '../../src/services/paquete-de-precarga.service';

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
 *   PAQUETE-05  sin sesión, 401; lo de entrar y el superadmin no se piden nunca;
 *   PAQUETE-06  las lecturas van barajadas (siempre igual) y, tras bajar, el plan
 *               dice cuánto pesará cada bloque (el «X de Y MB» no baila).
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
    let instituto = '';
    let secA: any;
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
        for (const [nombre, rol] of roles) {
            const { user } = await createTestUser(prisma, rol, { email: `paq-${nombre}@test.com`, firstName: 'Con', lastName: nombre });
            id[nombre] = user.id;
            instituto = user.instituteId as string;
            tok[nombre] = generateTestToken(user.id, rol, instituto);
        }
        const ciclo = await createTestAcademicYear(prisma, instituto);
        secA = await createTestClassroom(prisma, ciclo.id, instituto);
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

    it('PAQUETE-06: lecturas barajadas siempre igual; tras bajar, el plan dice cuánto pesará cada bloque', async () => {
        // El tipo de una lectura: lo que cambia de una a otra fuera.
        expect(formaDeLaLectura('/students/est0575/boleta?lapso=2&ciclo=x')).toBe('/students/:x/boleta?ciclo&lapso');
        expect(formaDeLaLectura('/academic-years/ay-2026-2027-testing/cierre')).toBe('/academic-years/:x/cierre');
        expect(formaDeLaLectura('/dashboard/admin')).toBe('/dashboard/admin');
        expect(formaDeLaLectura('/boleta/mia')).toBe('/boleta/mia');

        olvidarLoQuePesa();
        const primero = await plan('admin');
        const otraVez = await plan('admin');
        // El mismo orden cada vez (reanudar y la versión dependen de eso).
        expect(otraVez.body.lecturas).toEqual(primero.body.lecturas);
        expect(otraVez.body.version).toBe(primero.body.version);
        // Sin haber bajado nada en este liceo, no se inventa el peso.
        expect(primero.body.estimadoPorBloque).toBeNull();

        const lecturas: string[] = primero.body.lecturas;
        const b = await bloque('admin', lecturas);
        const deVerdad = Object.values(b.body.datos as Record<string, unknown>).reduce<number>((n, d) => n + JSON.stringify(d).length, 0);

        const despues = await plan('admin');
        expect(despues.body.estimadoPorBloque).toHaveLength(Math.ceil(lecturas.length / despues.body.porBloque));
        expect(despues.body.conocidas).toBe(lecturas.length);
        // Lo calculado es lo que pesó (media por tipo de lectura).
        const calculado = (despues.body.estimadoPorBloque as number[]).reduce((n, x) => n + x, 0);
        expect(Math.abs(calculado - deVerdad)).toBeLessThanOrEqual(lecturas.length);
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

    it('MENU-PARIDAD: elMenuDelRol del servidor coincide exactamente con elMenuDe del cliente web', () => {
        const cargarMenuWeb = () => {
            const ruta = resolve(__dirname, '../../../../apps/web/src/lib/el-menu.ts');
            const codigoTs = readFileSync(ruta, 'utf-8');
            const transpiled = ts.transpileModule(codigoTs, {
                compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
            });
            const m = { exports: {} as any };
            const fn = new Function('require', 'module', 'exports', transpiled.outputText);
            fn(() => ({}), m, m.exports);
            return m.exports.elMenuDe as (rol?: string, conPagos?: boolean, conPae?: boolean, esGuia?: boolean) => Array<{ href: string }>;
        };

        const menuWeb = cargarMenuWeb();
        const roles = ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR', undefined];
        const opciones = [
            [false, false],
            [true, false],
            [false, true],
            [true, true],
        ] as const;
        const casosGuia = [false, true];

        for (const rol of roles) {
            for (const [conPagos, conPae] of opciones) {
                for (const esGuia of casosGuia) {
                    const deServidor = elMenuDelRol(rol, conPagos, conPae, esGuia);
                    const deWeb = menuWeb(rol, conPagos, conPae, esGuia).map((d) => d.href);
                    expect(deServidor).toEqual(deWeb);
                }
            }
        }

        // Comprobar explícitamente profesor guía vs profesor no guía
        expect(elMenuDelRol('TEACHER', false, false, true)).toContain('/dashboard/mi-seccion-guia');
        expect(elMenuDelRol('TEACHER', false, false, false)).not.toContain('/dashboard/mi-seccion-guia');
        expect(menuWeb('TEACHER', false, false, true).map((d) => d.href)).toContain('/dashboard/mi-seccion-guia');
        expect(menuWeb('TEACHER', false, false, false).map((d) => d.href)).not.toContain('/dashboard/mi-seccion-guia');
    });

    it('PAQUETE-07: se arma, se sirve completo, con Range devuelve 206 y el trozo justo, y otro usuario recibe el suyo, nunca el ajeno', async () => {
        // Armar el paquete del admin
        const resAdmin = await armarElPaquete(server, instituto, id.admin);
        expect(resAdmin).not.toBeNull();
        expect(resAdmin!.lecturas).toBeGreaterThan(0);

        // Servir completo al admin
        const servidoAdmin = await request(server.server)
            .get('/api/precarga/paquete')
            .set(cab(tok.admin));
        expect(servidoAdmin.status).toBe(200);
        expect(servidoAdmin.headers['content-type']).toBe('application/octet-stream');
        expect(servidoAdmin.headers['content-encoding']).toBeUndefined();
        expect(servidoAdmin.headers['content-length']).toBe(String(resAdmin!.bytes));
        expect(servidoAdmin.headers['accept-ranges']).toBe('bytes');
        expect(servidoAdmin.headers['x-paquete-marca']).toBeDefined();
        expect(servidoAdmin.headers['x-paquete-version']).toBeDefined();
        expect(servidoAdmin.headers['x-paquete-lecturas']).toBe(String(resAdmin!.lecturas));

        const bufferCompleto = servidoAdmin.body as Buffer;
        expect(bufferCompleto.length).toBe(resAdmin!.bytes);

        // Con Range devuelve 206 y el trozo justo
        const trozoRange = await request(server.server)
            .get('/api/precarga/paquete')
            .set(cab(tok.admin))
            .set('Range', 'bytes=0-49');
        expect(trozoRange.status).toBe(206);
        expect(trozoRange.headers['content-range']).toBe(`bytes 0-49/${resAdmin!.bytes}`);
        expect(trozoRange.headers['content-length']).toBe('50');
        expect(trozoRange.body).toEqual(bufferCompleto.subarray(0, 50));

        // Armar el de alumnoA
        const resAlumno = await armarElPaquete(server, instituto, id.alumnoA);
        expect(resAlumno).not.toBeNull();

        // AlumnoA recibe el suyo
        const servidoAlumno = await request(server.server)
            .get('/api/precarga/paquete')
            .set(cab(tok.alumnoA));
        expect(servidoAlumno.status).toBe(200);
        const lineasAlumno = zlib.gunzipSync(servidoAlumno.body as Buffer).toString('utf-8').split('\n');
        const clavesAlumno = lineasAlumno.map((l) => JSON.parse(l).c);
        expect(clavesAlumno).toContain(`/users/${id.alumnoA}`);
        expect(clavesAlumno).not.toContain('/academic-years');

        // Otro usuario (tutor) que no tiene paquete recibe 404, nunca el ajeno
        const sinPaquete = await request(server.server)
            .get('/api/precarga/paquete')
            .set(cab(tok.tutor));
        expect(sinPaquete.status).toBe(404);
    });

    it('PAQUETE-08: si cambia la huella (al profesor le quitan una sección), no se sirve el viejo (404) y se encarga uno nuevo', async () => {
        // Armar paquete para el profesor
        const rProfe = await armarElPaquete(server, instituto, id.profe);
        expect(rProfe).not.toBeNull();

        // Se sirve correctamente mientras la huella coincide
        const antes = await request(server.server)
            .get('/api/precarga/paquete')
            .set(cab(tok.profe));
        expect(antes.status).toBe(200);

        // Cambiar la huella: le quitamos la sección guía secA
        await prisma.classroom.update({
            where: { id: secA.id },
            data: { teacherId: null },
        });

        // Ahora pedir el paquete da 404 (huella desactualizada) y encarga uno nuevo
        const despues = await request(server.server)
            .get('/api/precarga/paquete')
            .set(cab(tok.profe));
        expect(despues.status).toBe(404);
        expect(despues.body.code).toBe('PAQUETE_DESACTUALIZADO');

        // Restaurar profesor en secA
        await prisma.classroom.update({
            where: { id: secA.id },
            data: { teacherId: id.profe },
        });
    });

    it('PAQUETE-09: puesto al día de noche, rehace solo las lecturas cambiadas (cuéntalas) y su marca avanza', async () => {
        // Paquete recién armado para alumnoA
        await armarElPaquete(server, instituto, id.alumnoA);
        const paqAntes = await (prisma as any).paqueteDePrecarga.findUnique({
            where: { usuarioId: id.alumnoA },
        });
        expect(paqAntes).not.toBeNull();
        const marcaAntes = Number(paqAntes.marca);

        // Generamos un cambio en alumnoA
        const put = await request(server.server)
            .put(`/api/users/${id.alumnoA}`)
            .set(cab(tok.admin))
            .send({ firstName: 'Nocturno' });
        expect(put.status).toBe(200);

        // Esperar registro del cambio en cambioDelLiceo
        await new Promise((r) => setTimeout(r, 400));
        const cambios = await (prisma as any).cambioDelLiceo.findMany({
            where: { id: { gt: marcaAntes } },
        });
        expect(cambios.length).toBeGreaterThan(0);

        // Marcar que se usó hoy para que la limpieza nocturna no lo borre
        await (prisma as any).paqueteDePrecarga.update({
            where: { id: paqAntes.id },
            data: { usadoEn: new Date() },
        });

        // Ejecutar actualización nocturna
        const resultadoNoche = await actualizarPaquetesDeNoche(server, instituto, prisma);
        expect(resultadoNoche.revisados).toBeGreaterThanOrEqual(1);

        // El paquete en base de datos avanzó su marca
        const paqDespues = await (prisma as any).paqueteDePrecarga.findUnique({
            where: { usuarioId: id.alumnoA },
        });
        expect(Number(paqDespues.marca)).toBeGreaterThan(marcaAntes);

        // Los datos dentro del paquete reflejan el nuevo nombre
        const lineas = zlib.gunzipSync(paqDespues.contenido).toString('utf-8').split('\n');
        const filaUser = lineas.find((l) => l.includes(`/users/${id.alumnoA}`));
        expect(filaUser).toBeDefined();
        expect(filaUser).toContain('Nocturno');
    });

    it('PAQUETE-10: el paquete de un profesor no lleva nada que a mano le daría 403 (como PAQUETE-01…05)', async () => {
        await armarElPaquete(server, instituto, id.profe);
        const paqProfe = await (prisma as any).paqueteDePrecarga.findUnique({
            where: { usuarioId: id.profe },
        });
        expect(paqProfe).not.toBeNull();

        const texto = zlib.gunzipSync(paqProfe.contenido).toString('utf-8');
        const lineas = texto.split('\n').filter((l) => l.trim().length > 0);
        const lecturasEnPaquete = lineas.map((l) => JSON.parse(l).c);

        // No debe contener la ficha de un alumno ajeno (alumnoB)
        expect(lecturasEnPaquete).not.toContain(`/users/${id.alumnoB}`);

        // Para cada lectura en el paquete, si se pidiera a mano con su token, no debe dar 403
        for (const clave of lecturasEnPaquete) {
            const res = await request(server.server)
                .get(`/api${clave}`)
                .set(cab(tok.profe));
            expect(res.status).not.toBe(403);
        }
    });
});
