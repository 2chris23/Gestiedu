import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestPrismaClient, createTestUser } from '../helpers';
import { tirarLoQueNoSirve } from '../../src/services/mantenimiento.service';
import { latido, losLatidos, olvidarLosLatidos, saludDe } from '../../src/utils/latido-de-tareas';

/**
 * LO QUE CRECE SIN LÍMITE Y LAS TAREAS QUE DEJAN DE LATIR (MANT-01…03, LATIDO-01/02)
 *
 *   MANT-01  se tira lo viejo de la papelera, los avisos leídos hace mucho o
 *            caducados, las llaves de sesión caducadas y los cambios recibidos viejos
 *   MANT-02  lo reciente, lo persistente y lo del liceo NO se toca
 *   MANT-03  correrlo dos veces a la vez no falla (varios procesos)
 *   LATIDO-01 una tarea que no ha ido bien en dos vueltas sale «atrasada»; con error, «fallando»
 *   LATIDO-02 apuntar un latido no falla aunque no haya memoria rápida
 */

const DIA = 24 * 60 * 60 * 1000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA);

describe('Mantenimiento (MANT) y latidos (LATIDO)', () => {
    let prisma: PrismaClient;
    let alumno: any;

    beforeAll(async () => {
        prisma = await createTestPrismaClient();
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
    });

    afterAll(async () => {
        await prisma?.$disconnect();
    });

    const aviso = (datos: Record<string, unknown>) =>
        (prisma as any).notification.create({
            data: { id: createId(), title: 'x', message: 'x', type: 'INFO', priority: 'LOW', recipientId: alumno.id, ...datos },
        });

    it('MANT-01 y MANT-02: se tira lo viejo que no sirve; lo reciente y lo del liceo, no', async () => {
        const p = prisma as any;
        const viejo = await p.registroBorrado.create({ data: { tabla: 'grade', registroId: 'a', contenido: {}, createdAt: hace(200) } });
        const nuevo = await p.registroBorrado.create({ data: { tabla: 'grade', registroId: 'b', contenido: {} } });
        const leidoViejo = await aviso({ readAt: hace(400), createdAt: hace(400) });
        const caducado = await aviso({ expiresAt: hace(1) });
        const persistente = await aviso({ persistent: true, readAt: hace(400), createdAt: hace(400) });
        const sinLeer = await aviso({});
        const llaveVieja = await p.refreshToken.create({ data: { token: `t-${createId()}`, userId: alumno.id, expiresAt: hace(30) } });
        const llaveViva = await p.refreshToken.create({ data: { token: `t-${createId()}`, userId: alumno.id, expiresAt: new Date(Date.now() + DIA) } });
        const cambioViejo = await p.cambioRecibido.create({ data: { id: createId(), usuarioId: alumno.id, metodo: 'POST', ruta: '/x', estado: 201, recibidoEn: hace(120) } });
        const cambioNuevo = await p.cambioRecibido.create({ data: { id: createId(), usuarioId: alumno.id, metodo: 'POST', ruta: '/x', estado: 201 } });

        const r = await tirarLoQueNoSirve(prisma);
        expect(r.papelera).toBeGreaterThanOrEqual(1);
        expect(r.avisos).toBeGreaterThanOrEqual(2);

        const existe = async (modelo: string, id: string) => Boolean(await p[modelo].findUnique({ where: { id } }));
        expect(await existe('registroBorrado', viejo.id)).toBe(false);
        expect(await existe('registroBorrado', nuevo.id)).toBe(true);
        expect(await existe('notification', leidoViejo.id)).toBe(false);
        expect(await existe('notification', caducado.id)).toBe(false);
        expect(await existe('notification', persistente.id)).toBe(true);
        expect(await existe('notification', sinLeer.id)).toBe(true);
        expect(await existe('refreshToken', llaveVieja.id)).toBe(false);
        expect(await existe('refreshToken', llaveViva.id)).toBe(true);
        expect(await existe('cambioRecibido', cambioViejo.id)).toBe(false);
        expect(await existe('cambioRecibido', cambioNuevo.id)).toBe(true);
        // Lo del liceo, intacto.
        expect(await p.user.findUnique({ where: { id: alumno.id } })).toBeTruthy();
    });

    it('MANT-03: dos a la vez no fallan', async () => {
        await aviso({ readAt: hace(400), createdAt: hace(400) });
        const [a, b] = await Promise.all([tirarLoQueNoSirve(prisma), tirarLoQueNoSirve(prisma)]);
        expect(a.avisos + b.avisos).toBe(1);
    });

    it('LATIDO-01: dos vueltas sin ir bien = atrasada; con error = fallando; bien = bien', () => {
        const ahora = Date.now();
        const hora = 60 * 60 * 1000;
        expect(saludDe({ ultimaVez: new Date(ahora).toISOString(), ultimaVezBien: new Date(ahora).toISOString(), error: null, cadaMs: hora }, ahora)).toBe('bien');
        expect(saludDe({ ultimaVez: new Date(ahora - 3 * hora).toISOString(), ultimaVezBien: new Date(ahora - 3 * hora).toISOString(), error: null, cadaMs: hora }, ahora)).toBe('atrasada');
        expect(saludDe({ ultimaVez: new Date(ahora).toISOString(), ultimaVezBien: null, error: 'sin base', cadaMs: hora }, ahora)).toBe('fallando');
        expect(saludDe(null, ahora)).toBe('atrasada');
    });

    it('LATIDO-02: apuntar no falla y se lee lo último', async () => {
        olvidarLosLatidos();
        await latido('prueba', 1000);
        await latido('prueba', 1000, new Error('se cayó'));
        const l = (await losLatidos(['prueba'])).prueba;
        expect(l.error).toBe('se cayó');
        expect(l.ultimaVezBien).toBeTruthy();
        expect(l.salud).toBe('fallando');
    });
});

/**
 * LATIDO-03: el panel del superadmin dice qué tarea no late y cuánto disco
 * queda (falla gris: lo que no da error en ninguna pantalla, aquí se ve).
 */
describe('La salud del sistema en el panel del superadmin (LATIDO-03)', () => {
    it('LATIDO-03: trae las tareas (con la que falla marcada) y el disco', async () => {
        const request = require('supertest');
        const { createTestServer, seedSuperAdmin, generateSuperAdminTestToken } = require('../helpers');
        const { platformPrisma } = require('../../src/config/database');
        const server = await createTestServer();
        try {
            const email = `sa-latido-${Date.now()}@test.com`;
            const sa = await seedSuperAdmin(platformPrisma, email);
            olvidarLosLatidos();
            await latido('mantenimiento', 24 * 60 * 60 * 1000);
            await latido('cuadro-de-honor', 6 * 60 * 60 * 1000, new Error('sin base'));
            const r = await request(server.server)
                .get('/api/superadmin/monitoring/health')
                .set('Authorization', `Bearer ${generateSuperAdminTestToken(sa.id, email)}`);
            expect([200, 503]).toContain(r.status);
            expect(r.body.tareas.mantenimiento.salud).toBe('bien');
            expect(r.body.tareas['cuadro-de-honor'].salud).toBe('fallando');
            expect(r.body.tareasMal).toEqual(expect.arrayContaining(['cuadro-de-honor', 'recordatorio-de-cuotas']));
            expect(r.body.disco === null || typeof r.body.disco.libre === 'number').toBe(true);
            expect(r.body.status).not.toBe('healthy');
        } finally {
            await server.close();
        }
    }, 120000);
});

/**
 * LATIDO-04: el certificado que vence pronto y el proceso atascado salen en el
 * panel. El .pem de prueba es SOLO el certificado (sin llave), creado para
 * vencer a los 5 días: desde entonces vence «pronto» o ya venció, y en los dos
 * casos el panel tiene que avisar.
 */
describe('El certificado y el proceso (LATIDO-04)', () => {
    it('LATIDO-04: un certificado de menos de 14 días se avisa; el retraso del proceso se mide', async () => {
        const path = require('path');
        const { elCertificado, elBucle } = require('../../src/controllers/monitoring.controller');
        const c = await elCertificado(path.join(__dirname, '..', 'fixtures', 'certificado-que-vence-pronto.pem'));
        expect(c).not.toBeNull();
        expect(c.dias).toBeLessThan(14);
        expect(await elCertificado(undefined)).toBeNull();
        expect(await elCertificado(path.join(__dirname, 'no-existe.pem'))).toBeNull();
        const b = elBucle();
        expect(typeof b.p99ms).toBe('number');
    });
});
