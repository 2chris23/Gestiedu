import { FastifyInstance } from 'fastify';
import request = require('supertest');
import http from 'http';
import { AddressInfo } from 'net';
import { createVerify, generateKeyPairSync } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';

// Web Push de mentira: se ve qué se mandaría y a quién, sin salir a internet.
const enviados: Array<{ endpoint: string; carga: any }> = [];
const muertos = new Set<string>();
jest.mock('web-push', () => ({
    __esModule: true,
    default: {
        // Funciones de verdad, no jest.fn: la configuración de jest les borra la implementación antes de cada prueba.
        setVapidDetails: () => undefined,
        sendNotification: async (sub: { endpoint: string }, carga: string) => {
            if (muertos.has(sub.endpoint)) throw Object.assign(new Error('Gone'), { statusCode: 410 });
            enviados.push({ endpoint: sub.endpoint, carga: JSON.parse(carga) });
            return { statusCode: 201 };
        },
    },
}));

import { avisar, esperarEnvios, olvidarLosToques, tocarLosTelefonos } from '../../src/services/avisos.service';

/**
 * LOS AVISOS: EN LA APP Y EN EL TELÉFONO
 *
 *   NOTI-01  la campana: cada uno ve los suyos y cuántos no ha leído;
 *   NOTI-02  nadie marca como leído el aviso de otro (404, y sigue sin leer);
 *   NOTI-03  `avisar` guarda, anuncia por el tiempo real a cada destinatario
 *            y lo manda a sus teléfonos (Web Push);
 *   NOTI-04  el teléfono se apunta y se borra (al cerrar sesión); si pasa a
 *            otra persona, deja de ser del anterior; solo https;
 *   NOTI-05  lo que sale en la pantalla bloqueada NO lleva el motivo; una
 *            suscripción muerta (410) se borra sola; quien apagó los avisos
 *            al teléfono no los recibe (la campana sí);
 *   NOTI-06  la APK: el aviso va a Firebase con un permiso firmado con la
 *            cuenta de servicio; un token que Firebase da por muerto se borra;
 *   NOTI-07  al escribir, la APK recibe el toque silencioso (solo datos, sin
 *            qué cambió), como mucho uno por teléfono y minuto.
 */

const SLUG = 'test-institute';
const WEB = (n: string) => ({ tipo: 'WEB', destino: `https://fcm.googleapis.com/fcm/send/prueba-${n}-0123456789`, llaves: { p256dh: 'BPk-llave-publica', auth: 'secreto' } });

describe('Los avisos (NOTI-01…07)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let mama: any;
    let papa: any;

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const api = () => request(server.server);

    beforeAll(async () => {
        process.env.VAPID_PUBLIC_KEY = 'BPublicaDePrueba';
        process.env.VAPID_PRIVATE_KEY = 'privadaDePrueba';
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        delete process.env.FCM_CUENTA_DE_SERVICIO;
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        enviados.length = 0;
        muertos.clear();
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        mama = (await createTestUser(prisma, UserRole.TUTOR)).user;
        papa = (await createTestUser(prisma, UserRole.TUTOR)).user;
    });

    it('NOTI-01/02: cada uno ve los suyos; nadie marca los de otro', async () => {
        // Primero vacía: y lo que otro le mande después se ve al momento
        // (la campana no sale de la memoria rápida de las lecturas).
        expect((await api().get('/api/avisos').set(como(mama, UserRole.TUTOR)).expect(200)).body.data.sinLeer).toBe(0);
        await avisar(prisma, 'institute', null, { a: [mama.id], titulo: 'Citación', mensaje: 'Martes 8:00', enlace: '/dashboard' });
        await avisar(prisma, 'institute', null, { a: [mama.id, papa.id], titulo: 'Reunión de representantes', mensaje: 'Viernes' });
        await esperarEnvios();

        const deMama = await api().get('/api/avisos').set(como(mama, UserRole.TUTOR)).expect(200);
        expect(deMama.body.data.sinLeer).toBe(2);
        expect(deMama.body.data.avisos.map((a: any) => a.titulo)).toEqual(expect.arrayContaining(['Citación', 'Reunión de representantes']));
        const dePapa = await api().get('/api/avisos').set(como(papa, UserRole.TUTOR)).expect(200);
        expect(dePapa.body.data.avisos.map((a: any) => a.titulo)).toEqual(['Reunión de representantes']);

        const citacion = deMama.body.data.avisos.find((a: any) => a.titulo === 'Citación');
        const ajeno = await api().patch(`/api/avisos/${citacion.id}/leido`).set(como(papa, UserRole.TUTOR));
        expect(ajeno.status).toBe(404);
        expect((await api().get('/api/avisos').set(como(mama, UserRole.TUTOR))).body.data.sinLeer).toBe(2);

        const leido = await api().patch(`/api/avisos/${citacion.id}/leido`).set(como(mama, UserRole.TUTOR)).expect(200);
        expect(leido.body.data.sinLeer).toBe(1);
        const todos = await api().patch('/api/avisos/leidos').set(como(mama, UserRole.TUTOR)).expect(200);
        expect(todos.body.data.sinLeer).toBe(0);
        await api().get('/api/avisos').expect(401);
    });

    it('NOTI-03: avisar guarda, anuncia a cada uno por el tiempo real y lo manda a su teléfono', async () => {
        await api().post('/api/avisos/telefonos').set(como(mama, UserRole.TUTOR)).send(WEB('mama')).expect(200);
        const salas: string[] = [];
        const io = { to: (sala: string) => ({ emit: (evento: string) => salas.push(`${sala}|${evento}`) }) };
        const n = await avisar(prisma, 'institute', io, { a: [mama.id, papa.id, mama.id], titulo: 'Citación', mensaje: 'x', enlace: '/dashboard/citaciones/1' });
        await esperarEnvios();
        expect(n).toBe(2);
        expect(salas.sort()).toEqual([`user:institute:${mama.id}|aviso:nuevo`, `user:institute:${papa.id}|aviso:nuevo`].sort());
        expect(await prisma.notification.count()).toBe(2);
        // Solo mamá tiene teléfono apuntado.
        expect(enviados).toEqual([{ endpoint: WEB('mama').destino, carga: expect.objectContaining({ titulo: 'Citación', enlace: '/dashboard/citaciones/1' }) }]);
    });

    it('NOTI-04: el teléfono se apunta, cambia de dueño y se borra al cerrar sesión', async () => {
        await api().post('/api/avisos/telefonos').set(como(mama, UserRole.TUTOR)).send(WEB('uno')).expect(200);
        // El mismo teléfono, ahora con la sesión de papá: deja de ser de mamá.
        await api().post('/api/avisos/telefonos').set(como(papa, UserRole.TUTOR)).send(WEB('uno')).expect(200);
        expect(await prisma.suscripcionDeAviso.findMany({ select: { userId: true } })).toEqual([{ userId: papa.id }]);
        // Mamá no puede quitar el de papá.
        const ajeno = await api().delete('/api/avisos/telefonos').set(como(mama, UserRole.TUTOR)).send({ destino: WEB('uno').destino }).expect(200);
        expect(ajeno.body.data.quitadas).toBe(0);
        const suyo = await api().delete('/api/avisos/telefonos').set(como(papa, UserRole.TUTOR)).send({ destino: WEB('uno').destino }).expect(200);
        expect(suyo.body.data.quitadas).toBe(1);
        // Solo https (la dirección la da el navegador).
        const http = await api().post('/api/avisos/telefonos').set(como(mama, UserRole.TUTOR)).send({ ...WEB('x'), destino: 'http://atacante.example/recoger-avisos' });
        expect(http.status).toBe(400);
    });

    it('NOTI-05: en la pantalla bloqueada no va el motivo; la muerta se borra; quien los apagó no los recibe', async () => {
        await api().post('/api/avisos/telefonos').set(como(mama, UserRole.TUTOR)).send(WEB('viva')).expect(200);
        await api().post('/api/avisos/telefonos').set(como(mama, UserRole.TUTOR)).send(WEB('muerta')).expect(200);
        muertos.add(WEB('muerta').destino);
        await avisar(prisma, 'institute', null, {
            a: [mama.id],
            titulo: 'Citación',
            mensaje: 'Motivo: peleó con un compañero en el recreo',
            alTelefono: { titulo: 'Citación del liceo', cuerpo: 'Martes 14, 8:00 a. m.' },
        });
        await esperarEnvios();
        expect(enviados).toHaveLength(1);
        expect(JSON.stringify(enviados[0].carga)).not.toContain('peleó');
        expect(enviados[0].carga).toMatchObject({ titulo: 'Citación del liceo', cuerpo: 'Martes 14, 8:00 a. m.' });
        expect(await prisma.suscripcionDeAviso.count()).toBe(1);

        await api().put('/api/avisos/preferencias').set(como(mama, UserRole.TUTOR)).send({ alTelefono: false }).expect(200);
        enviados.length = 0;
        await avisar(prisma, 'institute', null, { a: [mama.id], titulo: 'Otro', mensaje: 'x' });
        await esperarEnvios();
        expect(enviados).toHaveLength(0);
        expect((await api().get('/api/avisos').set(como(mama, UserRole.TUTOR))).body.data.sinLeer).toBe(2);
        const pref = await api().get('/api/avisos/preferencias').set(como(mama, UserRole.TUTOR)).expect(200);
        expect(pref.body.data).toMatchObject({ alTelefono: false, webPush: 'BPublicaDePrueba' });
    });

    /** El toque sale en `onResponse`, DESPUÉS de responder: se espera a que salga. */
    const trasEscribir = async () => {
        await new Promise((r) => setTimeout(r, 300));
        await esperarEnvios();
    };

    /** Un Firebase de mentira (permiso y envíos), en un puerto propio. */
    async function firebaseDeMentira() {
        const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        const pedidos: Array<{ url: string; cuerpo: string; auth?: string }> = [];
        const google = http.createServer((req, res) => {
            let cuerpo = '';
            req.on('data', (c) => (cuerpo += c));
            req.on('end', () => {
                pedidos.push({ url: req.url!, cuerpo, auth: req.headers.authorization });
                if (req.url === '/token') {
                    const jwt = new URLSearchParams(cuerpo).get('assertion')!;
                    const [a, b, firma] = jwt.split('.');
                    const buena = createVerify('RSA-SHA256').update(`${a}.${b}`).verify(publicKey, Buffer.from(firma, 'base64url'));
                    res.writeHead(buena ? 200 : 401, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ access_token: 'permiso-de-prueba', expires_in: 3600 }));
                }
                const muerto = cuerpo.includes('token-muerto');
                res.writeHead(muerto ? 404 : 200, { 'Content-Type': 'application/json' });
                res.end(muerto ? JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }) : '{"name":"x"}');
            });
        });
        await new Promise<void>((r) => google.listen(0, '127.0.0.1', r));
        const base = `http://127.0.0.1:${(google.address() as AddressInfo).port}`;
        return {
            envios: () =>
                pedidos.filter((p) => p.url === '/v1/projects/gestiedu-prueba/messages:send').map((p) => ({ ...p, json: JSON.parse(p.cuerpo) })),
            /** Desde aquí el servidor «tiene Firebase». */
            encender() {
                process.env.FCM_URL = base;
                process.env.FCM_TOKEN_URL = `${base}/token`;
                process.env.FCM_CUENTA_DE_SERVICIO = JSON.stringify({
                    project_id: 'gestiedu-prueba',
                    client_email: 'avisos@gestiedu-prueba.iam.gserviceaccount.com',
                    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
                });
            },
            apagar() {
                delete process.env.FCM_URL;
                delete process.env.FCM_TOKEN_URL;
                delete process.env.FCM_CUENTA_DE_SERVICIO;
                google.close();
            },
        };
    }

    it('NOTI-06: la APK recibe por Firebase, con el permiso firmado; un token muerto se borra', async () => {
        const firebase = await firebaseDeMentira();
        try {
            const vivo = 'token-vivo-de-la-apk-0123456789abcdef';
            await api().post('/api/avisos/telefonos').set(como(mama, UserRole.TUTOR)).send({ tipo: 'FCM', destino: vivo, aparato: 'Motorola G13' }).expect(200);
            await api().post('/api/avisos/telefonos').set(como(mama, UserRole.TUTOR)).send({ tipo: 'FCM', destino: 'token-muerto-0123456789abcdef' }).expect(200);
            await trasEscribir();
            firebase.encender();
            await avisar(prisma, 'institute', null, { a: [mama.id], titulo: 'Citación', mensaje: 'x', alTelefono: { titulo: 'Citación del liceo', cuerpo: 'Martes 8:00' } });
            await esperarEnvios();

            const envios = firebase.envios();
            expect(envios).toHaveLength(2);
            expect(envios.every((p) => p.auth === 'Bearer permiso-de-prueba')).toBe(true);
            const alVivo = envios.find((p) => p.cuerpo.includes(vivo))!.json;
            expect(alVivo.message).toMatchObject({ token: vivo, notification: { title: 'Citación del liceo', body: 'Martes 8:00' } });
            expect((await prisma.suscripcionDeAviso.findMany({ select: { destino: true } })).map((s) => s.destino)).toEqual([vivo]);
        } finally {
            firebase.apagar();
        }
    });

    it('NOTI-07: al escribir, la APK recibe el toque silencioso (sin nada que enseñar), uno por minuto', async () => {
        const firebase = await firebaseDeMentira();
        olvidarLosToques();
        try {
            const deMama = 'token-de-mama-0123456789abcdef';
            await api().post('/api/avisos/telefonos').set(como(mama, UserRole.TUTOR)).send({ tipo: 'FCM', destino: deMama }).expect(200);
            await trasEscribir();
            firebase.encender();

            // Una escritura que no se acota a nadie: toca a todos los teléfonos del liceo.
            await api().put('/api/avisos/preferencias').set(como(admin, UserRole.ADMIN)).send({ alTelefono: true }).expect(200);
            await trasEscribir();
            const toques = firebase.envios();
            expect(toques).toHaveLength(1);
            expect(toques[0].json.message).toEqual({
                token: deMama,
                data: { gestiedu: 'datos-cambiaron' },
                android: { priority: 'high', collapse_key: 'datos-cambiaron', ttl: '3600s' },
            });

            // Otra escritura dentro del minuto: ahora no sale otro (sale uno al acabar el minuto).
            await api().put('/api/avisos/preferencias').set(como(admin, UserRole.ADMIN)).send({ alTelefono: true }).expect(200);
            await trasEscribir();
            expect(firebase.envios()).toHaveLength(1);

            // A quien no tiene la APK, nada.
            olvidarLosToques();
            expect(await tocarLosTelefonos(prisma, [papa.id])).toBe(0);
            expect(await tocarLosTelefonos(prisma, [mama.id])).toBe(1);
        } finally {
            olvidarLosToques();
            firebase.apagar();
        }
    });
});
