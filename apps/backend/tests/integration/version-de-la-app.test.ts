import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { createHash } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createTestServer } from '../helpers';

/**
 * LA VERSIÓN NUEVA DE LA APP, DESDE LA PROPIA APP
 *
 * La APK pregunta si hay una más nueva y se la baja de aquí. Ver
 * `routes/app-movil.routes.ts`.
 */

const PAQUETE = 'com.gestiedu.pruebas';

describe('La versión nueva de la app del teléfono', () => {
    let server: FastifyInstance;
    let carpeta: string;
    const apk = Buffer.from('PK\u0003\u0004 una apk de mentira, para la prueba');
    const huella = createHash('sha256').update(apk).digest('hex');
    const antes = process.env.APP_MOVIL_DIR;

    beforeAll(async () => {
        carpeta = mkdtempSync(path.join(tmpdir(), 'app-movil-'));
        process.env.APP_MOVIL_DIR = carpeta;
        writeFileSync(path.join(carpeta, `${PAQUETE}.apk`), apk);
        writeFileSync(
            path.join(carpeta, `${PAQUETE}.json`),
            JSON.stringify({
                versionCode: 7,
                versionName: '1.7',
                sha256: huella,
                tamano: apk.length,
                publicada: '2026-09-24T10:00:00.000Z',
                notas: 'La franja del reloj, blanca',
            })
        );
        // Una ficha rota: le falta la huella.
        writeFileSync(path.join(carpeta, 'com.gestiedu.rota.json'), JSON.stringify({ versionCode: 2, versionName: '1.2' }));
        server = await createTestServer();
    }, 120000);

    afterAll(async () => {
        if (antes === undefined) delete process.env.APP_MOVIL_DIR;
        else process.env.APP_MOVIL_DIR = antes;
        rmSync(carpeta, { recursive: true, force: true });
        await server.close();
    });

    it('APP-01: dice cuál es la última versión, con su huella y de dónde bajarla, sin sesión', async () => {
        const res = await request(server.server).get(`/api/app-movil/${PAQUETE}/version`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            versionCode: 7,
            versionName: '1.7',
            sha256: huella,
            tamano: apk.length,
            url: `/api/app-movil/${PAQUETE}/apk`,
        });
        // Recién publicada se tiene que ver ya: nadie la guarda por el camino.
        expect(res.headers['cache-control']).toBe('no-store');
    });

    it('APP-02: baja la APK entera, como APK, y es la misma que dice la huella', async () => {
        const res = await request(server.server)
            .get(`/api/app-movil/${PAQUETE}/apk`)
            .buffer(true)
            .parse((r, fin) => {
                const trozos: Buffer[] = [];
                r.on('data', (t: Buffer) => trozos.push(t));
                r.on('end', () => fin(null, Buffer.concat(trozos)));
            });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/vnd.android.package-archive');
        expect(res.headers['content-disposition']).toContain(`${PAQUETE}.apk`);
        expect(createHash('sha256').update(res.body as Buffer).digest('hex')).toBe(huella);
    });

    it('APP-03: una app sin versión publicada, o con la ficha rota, no se inventa: 404', async () => {
        expect((await request(server.server).get('/api/app-movil/com.gestiedu.otra/version')).status).toBe(404);
        expect((await request(server.server).get('/api/app-movil/com.gestiedu.otra/apk')).status).toBe(404);
        expect((await request(server.server).get('/api/app-movil/com.gestiedu.rota/version')).status).toBe(404);
    });

    it('APP-04: un nombre que no es de una app no llega al disco (ni `..`, ni barras)', async () => {
        for (const malo of ['..%2F..%2Fpackage', 'com..gestiedu', 'sinpuntos', 'COM.GESTIEDU.X', '.com.gestiedu', 'com.gestiedu.x%00']) {
            const res = await request(server.server).get(`/api/app-movil/${malo}/version`);
            expect([400, 404]).toContain(res.status);
            expect(res.body?.versionCode).toBeUndefined();
        }
        const res = await request(server.server).get('/api/app-movil/com..gestiedu/apk');
        expect(res.status).toBe(400);
    });
});
