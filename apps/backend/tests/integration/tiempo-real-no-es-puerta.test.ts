import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { io as conectarSocket, Socket } from 'socket.io-client';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';

/**
 * EL TIEMPO REAL NO ES UNA PUERTA TRASERA
 *
 * La API tiene guardias en cada ruta. El canal de tiempo real (el socket) es
 * **otra puerta al mismo edificio** y entraba por su cuenta: pedía una credencial
 * válida para conectarse y, a partir de ahí, atendía cualquier cosa que le
 * pidieran sin volver a preguntar quién era ni qué podía hacer.
 *
 * Lo que la pantalla usa de verdad del socket es UNA sola cosa: el aviso
 * `datos:cambiaron`, que dice "algo se movió, vuelve a pedir lo que tengas
 * abierto" y no lleva ningún dato del liceo dentro. Todo lo demás que el socket
 * atendía no lo llama nadie de la aplicación — solo podía llamarlo alguien que
 * se pusiera a ello a propósito.
 *
 * Estas pruebas entran por esa puerta como entraría esa persona.
 */

const SLUG = 'test-institute';

/** Espera a que llegue un evento concreto; devuelve null si no llega a tiempo. */
function esperarEvento(socket: Socket, nombre: string, ms = 2500): Promise<any> {
    return new Promise((resolver) => {
        const reloj = setTimeout(() => {
            socket.off(nombre, alLlegar);
            resolver(null);
        }, ms);
        function alLlegar(datos: any) {
            clearTimeout(reloj);
            socket.off(nombre, alLlegar);
            resolver(datos ?? true);
        }
        socket.once(nombre, alLlegar);
    });
}

describe('El tiempo real no es una puerta trasera', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let urlDelSocket: string;

    let estudiante: any;
    let tokenEstudiante: string;
    let admin: any;

    const abiertos: Socket[] = [];

    /** Conecta un socket con la credencial dada y espera a que entre (o falle). */
    async function entrarAlSocket(token?: string): Promise<{ socket: Socket; entro: boolean; motivo?: string }> {
        const socket = conectarSocket(urlDelSocket, {
            auth: token ? { token } : {},
            transports: ['websocket'],
            reconnection: false,
            forceNew: true,
            timeout: 5000,
        });
        abiertos.push(socket);

        const entro = await new Promise<boolean>((resolver) => {
            const reloj = setTimeout(() => resolver(false), 6000);
            socket.on('connect', () => {
                clearTimeout(reloj);
                resolver(true);
            });
            socket.on('connect_error', () => {
                clearTimeout(reloj);
                resolver(false);
            });
        });

        return { socket, entro };
    }

    beforeAll(async () => {
        server = await createTestServer();
        await server.listen({ port: 0, host: '127.0.0.1' });
        const direccion = server.server.address() as { port: number };
        urlDelSocket = `http://127.0.0.1:${direccion.port}`;

        prisma = await createTestPrismaClient();

        estudiante = (await createTestUser(prisma, UserRole.STUDENT)).user;
        tokenEstudiante = generateTestToken(estudiante.id, UserRole.STUDENT, 'institute');

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
    }, 180000);

    afterAll(async () => {
        for (const s of abiertos) {
            try { s.close(); } catch { /* da igual */ }
        }
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    // ─────────────────────────────────────────────────────────────────────────
    // Lo que ya estaba bien: la puerta pide credencial
    // ─────────────────────────────────────────────────────────────────────────

    it('SOCKET-01: sin credencial no se entra', async () => {
        const { entro } = await entrarAlSocket();
        expect(entro).toBe(false);
    }, 30000);

    it('SOCKET-02: con una credencial inventada tampoco se entra', async () => {
        const jwt = require('jsonwebtoken');
        const inventado = jwt.sign(
            { id: estudiante.id, userId: estudiante.id, role: 'ADMIN', instituteId: 'institute' },
            'clave-que-el-atacante-se-invento',
            { expiresIn: '1h' }
        );
        const { entro } = await entrarAlSocket(inventado);
        expect(entro).toBe(false);
    }, 30000);

    // ─────────────────────────────────────────────────────────────────────────
    // Lo que NO estaba bien
    // ─────────────────────────────────────────────────────────────────────────

    it('SOCKET-03: un estudiante no puede crear una actividad por el socket', async () => {
        const { socket, entro } = await entrarAlSocket(tokenEstudiante);
        expect(entro).toBe(true);

        const antes = await prisma.activity.count();

        socket.emit('activities:create', {
            title: 'Actividad puesta por un alumno',
            description: 'Esto no debería poder ocurrir',
            type: 'HOMEWORK',
            scope: 'GENERAL',
            startDate: new Date().toISOString(),
            maxGrade: 20,
            weight: 1,
        });

        await esperarEvento(socket, 'activities:created', 2500);

        const despues = await prisma.activity.count();
        expect(despues).toBe(antes);
    }, 40000);

    it('SOCKET-04: un estudiante no puede borrar una actividad por el socket', async () => {
        const anio = await prisma.academicYear.create({
            data: {
                name: `Año socket ${Date.now()}`,
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-12-31'),
                instituteId: 'institute',
            },
        });
        const periodo = await prisma.period.create({
            data: {
                name: 'Lapso socket',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-04-01'),
                academicYearId: anio.id,
            },
        });
        const actividad = await prisma.activity.create({
            data: {
                title: 'Actividad del profesor',
                type: 'HOMEWORK',
                scope: 'GENERAL',
                startDate: new Date('2024-02-01'),
                maxGrade: 20,
                weight: 1,
                periodId: periodo.id,
                createdBy: admin.id,
                instituteId: 'institute',
            },
        });

        const { socket, entro } = await entrarAlSocket(tokenEstudiante);
        expect(entro).toBe(true);

        socket.emit('activities:delete', { id: actividad.id });
        await esperarEvento(socket, 'activities:deleted', 2500);

        const sigue = await prisma.activity.findUnique({ where: { id: actividad.id } });
        expect(sigue).not.toBeNull();
    }, 60000);

    it('SOCKET-05: el socket no reparte la lista de quién está conectado (cédulas y correos)', async () => {
        const { socket, entro } = await entrarAlSocket(tokenEstudiante);
        expect(entro).toBe(true);

        socket.emit('users:get_online', {});
        const lista = await esperarEvento(socket, 'users:online_list', 2500);

        expect(lista).toBeNull();
    }, 40000);

    it('SOCKET-06: nadie puede suscribirse a la asistencia de una sección que no es suya', async () => {
        const { socket, entro } = await entrarAlSocket(tokenEstudiante);
        expect(entro).toBe(true);

        socket.emit('attendance:subscribe', { classroomId: 'seccion-de-otro', studentId: 'V-99999999' });
        const confirmacion = await esperarEvento(socket, 'attendance:subscribed', 2500);

        expect(confirmacion).toBeNull();
    }, 40000);

    it('SOCKET-08: el aviso de un liceo no llega al mismo número de cédula de otro liceo', async () => {
        /**
         * ─── LO QUE PASABA ───────────────────────────────────────────────────
         *
         * Cada persona se apuntaba a un buzón con su número de cédula:
         * `user:V-12345678`. Pero **la cédula se repite entre liceos** — es un
         * número del Estado, no del sistema; si la misma persona (o dos personas
         * con la cédula mal cargada) está en dos liceos, es el MISMO buzón.
         *
         * Así que el aviso "algo cambió, vuelve a pedir tus datos" que se le
         * mandaba a alguien del Liceo A **también le sonaba a quien tuviera esa
         * cédula en el Liceo B**. No se le iba ningún dato del otro liceo —el
         * aviso solo dice qué tipo de cosa cambió y cuándo—, pero sí se enteraba
         * de que en algún sitio acaban de tocar las notas, y su pantalla salía
         * corriendo a recargar sin motivo.
         *
         * ─── LO QUE SE HACE AHORA ────────────────────────────────────────────
         *
         * El buzón lleva el liceo delante: `user:<liceo>:<cédula>`. Dos liceos,
         * dos buzones, aunque la cédula sea la misma.
         *
         * Esta prueba manda un aviso al buzón viejo (el de solo la cédula) y
         * comprueba que no le llega a nadie.
         */
        const persona = (await createTestUser(prisma, UserRole.STUDENT)).user;
        const token = generateTestToken(persona.id, UserRole.STUDENT, 'institute');

        const { socket, entro } = await entrarAlSocket(token);
        expect(entro).toBe(true);

        const io = (server as any).io;

        // El buzón de solo la cédula: el que compartían los liceos. No puede
        // llegarle a nadie.
        io.to(`user:${persona.id}`).emit('datos:cambiaron', { recurso: 'grades' });
        const delBuzonCompartido = await esperarEvento(socket, 'datos:cambiaron', 1500);
        expect(delBuzonCompartido).toBeNull();

        // El buzón con el liceo delante sí tiene que funcionar: si no, nadie se
        // entera de nada y el tiempo real deja de servir.
        io.to(`user:institute:${persona.id}`).emit('datos:cambiaron', { recurso: 'grades' });
        const delBuzonPropio = await esperarEvento(socket, 'datos:cambiaron', 2500);
        expect(delBuzonPropio).not.toBeNull();
    }, 40000);

    it('SOCKET-07: una cuenta desactivada no puede abrir el socket', async () => {
        const desactivado = (await createTestUser(prisma, UserRole.TEACHER)).user;
        const token = generateTestToken(desactivado.id, UserRole.TEACHER, 'institute');

        await prisma.user.update({ where: { id: desactivado.id }, data: { isActive: false } });

        const { entro } = await entrarAlSocket(token);
        expect(entro).toBe(false);
    }, 40000);
});
