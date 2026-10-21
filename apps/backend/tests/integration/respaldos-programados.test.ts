import http from 'http';
import { AddressInfo } from 'net';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { generateKeyPairSync } from 'crypto';
import { descifrarArchivo } from '../../src/utils/cifrar-respaldo';
import { tmpdir } from 'os';
import path from 'path';
import { prisma } from '../../src/config/database';
import {
    respaldarAhora,
    leerEstado,
    saludDeLosRespaldos,
    msHastaLaHora,
} from '../../src/services/respaldos-programados.service';
import { InformeDeRespaldo } from '../../src/services/respaldos.service';

/**
 * LOS RESPALDOS SE HACEN SOLOS, SE SACAN FUERA Y AVISAN SI FALLAN
 *
 * Aquí se prueba todo lo de alrededor del `pg_dump` (que ya prueba de verdad
 * `respaldos.test.ts`): que se apunta cómo fue, que la copia de fuera llega
 * entera a un almacén que habla S3, y que un fallo se ve —en el estado y como
 * alerta crítica del superadmin— en vez de quedarse en un registro que nadie lee.
 */

describe('Respaldos programados', () => {
    let carpeta = '';
    let servidor: http.Server;
    let recibidos: Array<{ url: string; bytes: number; auth: string; cuerpo: Buffer }> = [];
    // Un par de llaves de usar y tirar: la pública la tiene «el servidor»; la
    // privada, «el dueño» (aquí, la prueba que descifra lo que llegó fuera).
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    let responder = 200;
    const env = { ...process.env };

    const informeDe = (archivos: Array<{ slug: string; contenido?: string; error?: string }>): InformeDeRespaldo => {
        const resultados = archivos.map((a) => {
            if (a.error) return { slug: a.slug, ok: false, error: a.error, ms: 1 };
            const archivo = path.join(carpeta, `${a.slug}__2026-09-23T02-00-00.dump`);
            writeFileSync(archivo, a.contenido ?? 'x');
            return { slug: a.slug, ok: true, archivo, bytes: (a.contenido ?? 'x').length, ms: 1 };
        });
        const fallidos = resultados.filter((r) => !r.ok);
        return { total: resultados.length, guardados: resultados.length - fallidos.length, fallidos, resultados, carpeta, ms: 1 };
    };

    beforeAll(async () => {
        carpeta = mkdtempSync(path.join(tmpdir(), 'respaldos-programados-'));
        servidor = http.createServer((req, res) => {
            const trozos: Buffer[] = [];
            req.on('data', (t) => trozos.push(t));
            req.on('end', () => {
                const cuerpo = Buffer.concat(trozos);
                recibidos.push({ url: req.url || '', bytes: cuerpo.length, auth: String(req.headers.authorization || ''), cuerpo });
                res.statusCode = responder;
                res.end(responder === 200 ? '' : '<Error>AccessDenied</Error>');
            });
        });
        await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', () => r()));
        const { port } = servidor.address() as AddressInfo;
        process.env.BACKUP_S3_ENDPOINT = `http://127.0.0.1:${port}`;
        process.env.BACKUP_S3_BUCKET = 'gestiedu-respaldos';
        process.env.BACKUP_S3_ACCESS_KEY_ID = 'AKIDPRUEBA';
        process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secreto-de-prueba';
        process.env.RESPALDO_LLAVE_PUBLICA = publicKey;
    });

    afterAll(async () => {
        process.env = env;
        await new Promise<void>((r) => servidor.close(() => r()));
        rmSync(carpeta, { recursive: true, force: true });
        await prisma.$disconnect();
    });

    beforeEach(() => {
        recibidos = [];
        responder = 200;
    });

    it('RESP-01 y CIFRA-01: una pasada buena queda apuntada, y cada respaldo llega fuera CIFRADO y entero', async () => {
        const contenido = 'datos del liceo '.repeat(5000);
        const estado = await respaldarAhora(carpeta, async () =>
            informeDe([{ slug: 'liceo-bolivar', contenido }, { slug: 'liceo-sucre' }])
        );

        expect(estado.guardados).toBe(2);
        expect(estado.copiaFuera).toBe('ok');
        expect(saludDeLosRespaldos(leerEstado(carpeta))).toBe('al-dia');

        expect(recibidos.map((r) => r.url).sort()).toEqual([
            '/gestiedu-respaldos/liceo-bolivar/liceo-bolivar__2026-09-23T02-00-00.dump.cifrado',
            '/gestiedu-respaldos/liceo-sucre/liceo-sucre__2026-09-23T02-00-00.dump.cifrado',
        ]);
        // Lo que llegó fuera NO se lee: no contiene el texto del respaldo…
        const llegado = recibidos.find((r) => r.url.includes('bolivar'))!.cuerpo;
        expect(llegado.includes(Buffer.from('datos del liceo'))).toBe(false);
        // …y con la llave privada del dueño vuelve a ser exactamente el respaldo.
        const enDisco = path.join(carpeta, 'llegado.cifrado');
        const vuelto = path.join(carpeta, 'llegado.dump');
        writeFileSync(enDisco, llegado);
        await descifrarArchivo(enDisco, vuelto, privateKey);
        expect(readFileSync(vuelto, 'utf8')).toBe(contenido);
        rmSync(enDisco);
        rmSync(vuelto);
        expect(recibidos.every((r) => r.auth.startsWith('AWS4-HMAC-SHA256 Credential=AKIDPRUEBA/'))).toBe(true);
    });

    it('RESP-02: si un liceo no se respalda o la copia de fuera falla, se ve y salta una alerta crítica', async () => {
        const antes = await prisma.systemAlert.count({ where: { type: 'BACKUP_FAILED' } });
        const bienAntes = leerEstado(carpeta)!.ultimaVezBien;
        responder = 403;

        const estado = await respaldarAhora(carpeta, async () =>
            informeDe([{ slug: 'liceo-bolivar' }, { slug: 'liceo-miranda', error: 'pg_dump: conexión rechazada' }])
        );

        expect(estado.fallidos).toEqual(['liceo-miranda: pg_dump: conexión rechazada']);
        expect(estado.copiaFuera).toBe('fallo');
        expect(estado.erroresDeCopiaFuera[0]).toMatch(/403/);
        // La última vez BUENA sigue siendo la de antes: no se pisa con una mala.
        expect(estado.ultimaVezBien).toBe(bienAntes);
        expect(saludDeLosRespaldos(leerEstado(carpeta))).toBe('fallo');

        const despues = await prisma.systemAlert.count({ where: { type: 'BACKUP_FAILED', severity: 'CRITICAL' } });
        expect(despues).toBeGreaterThan(antes);
    });

    it('CIFRA-02: sin llave pública el respaldo NO sale del servidor (datos de menores), y se ve como fallo', async () => {
        const llave = process.env.RESPALDO_LLAVE_PUBLICA;
        delete process.env.RESPALDO_LLAVE_PUBLICA;
        try {
            const estado = await respaldarAhora(carpeta, async () => informeDe([{ slug: 'liceo-bolivar' }]));
            expect(recibidos).toEqual([]);
            expect(estado.copiaFuera).toBe('fallo');
            expect(estado.erroresDeCopiaFuera[0]).toMatch(/RESPALDO_LLAVE_PUBLICA/);
        } finally {
            process.env.RESPALDO_LLAVE_PUBLICA = llave;
        }
    });

    it('CIFRA-03: un archivo tocado, o la llave equivocada, no se descifra', async () => {
        const original = path.join(carpeta, 'tocado.dump');
        const cifrado = path.join(carpeta, 'tocado.cifrado');
        writeFileSync(original, 'cédulas y notas '.repeat(100));
        const { cifrarArchivo } = require('../../src/utils/cifrar-respaldo');
        await cifrarArchivo(original, cifrado, publicKey);
        const bytes = readFileSync(cifrado);
        bytes[bytes.length - 40] ^= 0xff;
        writeFileSync(cifrado, bytes);
        await expect(descifrarArchivo(cifrado, path.join(carpeta, 'x.dump'), privateKey)).rejects.toThrow();
        const otra = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
        await cifrarArchivo(original, cifrado, publicKey);
        await expect(descifrarArchivo(cifrado, path.join(carpeta, 'y.dump'), otra.privateKey)).rejects.toThrow();
    });

    it('RESP-03: si hace más de un día que no sale uno bueno, está «atrasado» aunque nadie viera un error', () => {
        const hace = (horas: number) => new Date(Date.now() - horas * 3_600_000).toISOString();
        const estado = { ultimaVez: hace(30), ultimaVezBien: hace(30), liceos: 3, guardados: 3, fallidos: [], copiaFuera: 'ok' as const, erroresDeCopiaFuera: [], segundos: 5 };
        expect(saludDeLosRespaldos(estado)).toBe('atrasado');
        expect(saludDeLosRespaldos({ ...estado, ultimaVezBien: hace(2) })).toBe('al-dia');
        expect(saludDeLosRespaldos(null)).toBe('sin-programar');
    });

    it('RESP-04: la espera hasta la hora del respaldo es la de hoy si no ha pasado, y la de mañana si ya pasó', () => {
        const a = new Date(2026, 8, 23, 1, 0, 0);
        expect(msHastaLaHora('02:00', a)).toBe(60 * 60 * 1000);
        const b = new Date(2026, 8, 23, 3, 0, 0);
        expect(msHastaLaHora('02:00', b)).toBe(23 * 60 * 60 * 1000);
    });
});
