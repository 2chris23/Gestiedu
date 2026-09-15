import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { Client } from 'pg';
import {
    respaldarLiceo,
    restaurarLiceo,
    limpiarRespaldosViejos,
    ultimoRespaldoDe,
    carpetaDeRespaldos,
    diasQueSeGuardan,
} from '../../src/services/respaldos.service';

/**
 * RESPALDOS: LA PRUEBA QUE LOS HACE REALES
 *
 * Un respaldo que nunca se restauró no es un respaldo, es un archivo que ocupa
 * espacio. Aquí se hace el viaje completo contra PostgreSQL de verdad:
 *
 *   1. se guarda el liceo;
 *   2. se le rompen los datos a propósito, como pasaría de verdad (alguien borra
 *      un año escolar entero);
 *   3. se restaura;
 *   4. se comprueba que volvió **exactamente** como estaba.
 *
 * Si esto se cae, hay que parar todo: significa que el día que haga falta, no se
 * va a poder devolver la información de un liceo.
 *
 * Hace falta pg_dump/pg_restore. Si no están en el PATH (Windows), se indican con
 * PG_BIN_DIR. Sin ellos la prueba se salta y lo dice: callarse sería fingir que
 * está comprobado.
 */

const BIN = process.env.PG_BIN_DIR || 'C:/Program Files/PostgreSQL/17/bin';

function hayHerramientas(): boolean {
    if (!process.env.PG_BIN_DIR && process.platform === 'win32' && existsSync(path.join(BIN, 'pg_dump.exe'))) {
        process.env.PG_BIN_DIR = BIN;
        return true;
    }
    if (process.env.PG_BIN_DIR) {
        const exe = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
        return existsSync(path.join(process.env.PG_BIN_DIR, exe));
    }
    // En Linux/servidor normalmente está en el PATH
    return process.platform !== 'win32';
}

const urlBase = () => process.env.DATABASE_URL || '';
const urlDe = (base: string) => urlBase().replace(/\/[^/?]+(\?|$)/, `/${base}$1`);

async function enBase<T>(base: string, fn: (c: Client) => Promise<T>): Promise<T> {
    const c = new Client({ connectionString: urlDe(base) });
    await c.connect();
    try {
        return await fn(c);
    } finally {
        await c.end().catch(() => undefined);
    }
}

describe('Respaldos por liceo', () => {
    const disponible = hayHerramientas();
    const baseDePrueba = `t_respaldo_${Date.now()}`;
    let carpeta = '';

    beforeAll(async () => {
        if (!disponible) return;

        carpeta = mkdtempSync(path.join(tmpdir(), 'respaldos-'));

        // Una base pequeña con datos reconocibles
        await enBase('postgres', async (c) => {
            await c.query(`CREATE DATABASE "${baseDePrueba}"`);
        });
        await enBase(baseDePrueba, async (c) => {
            await c.query(`CREATE TABLE anos_escolares (id text PRIMARY KEY, nombre text NOT NULL)`);
            await c.query(`INSERT INTO anos_escolares VALUES ('a1','2026-2027'), ('a2','2027-2028')`);
            await c.query(`CREATE TABLE notas (id serial PRIMARY KEY, alumno text, valor numeric)`);
            await c.query(`INSERT INTO notas (alumno, valor) VALUES ('Ana', 18), ('Luis', 11), ('Sofía', 20)`);
        });
    }, 120000);

    afterAll(async () => {
        if (!disponible) return;
        await enBase('postgres', async (c) => {
            await c.query(`DROP DATABASE IF EXISTS "${baseDePrueba}" WITH (FORCE)`);
        }).catch(() => undefined);
        if (carpeta) rmSync(carpeta, { recursive: true, force: true });
    }, 120000);

    const liceoFalso = () => {
        const u = new URL(urlBase());
        return {
            id: 'inst-respaldo',
            slug: 'liceo-de-prueba',
            name: 'Liceo de Prueba',
            databaseName: baseDePrueba,
            databaseHost: u.hostname,
            databasePort: Number(u.port || 5432),
            databaseUser: decodeURIComponent(u.username),
            databasePassword: decodeURIComponent(u.password),
        } as any;
    };

    it('RESP-01: si no hay herramientas de PostgreSQL, se dice en voz alta', () => {
        if (!disponible) {
            // Esto no es un aprobado disfrazado: la prueba deja constancia de que
            // el viaje completo NO se comprobó en esta máquina.
            console.warn(
                '\n⚠️  pg_dump no está disponible: la restauración NO se comprobó.' +
                    '\n   Indica dónde está con PG_BIN_DIR para probarlo de verdad.\n'
            );
        }
        expect(true).toBe(true);
    });

    (disponible ? it : it.skip)(
        'RESP-02: el viaje completo — guardar, romper y devolver a como estaba',
        async () => {
            // 1. Guardar
            const respaldo = await respaldarLiceo(liceoFalso(), carpeta);
            expect(respaldo.ok).toBe(true);
            expect(respaldo.archivo).toBeTruthy();
            expect(statSync(respaldo.archivo!).size).toBeGreaterThan(0);

            // 2. Romperlo como se rompería de verdad: alguien borra un año escolar
            //    entero y media lista de notas
            await enBase(baseDePrueba, async (c) => {
                await c.query(`DELETE FROM anos_escolares WHERE id = 'a1'`);
                await c.query(`DELETE FROM notas WHERE alumno <> 'Ana'`);
                await c.query(`UPDATE notas SET valor = 1 WHERE alumno = 'Ana'`);
            });

            const roto = await enBase(baseDePrueba, async (c) => ({
                anos: (await c.query('SELECT count(*)::int AS n FROM anos_escolares')).rows[0].n,
                notas: (await c.query('SELECT count(*)::int AS n FROM notas')).rows[0].n,
            }));
            expect(roto.anos).toBe(1);
            expect(roto.notas).toBe(1);

            // 3. Devolverlo
            await restaurarLiceo(respaldo.archivo!, urlDe(baseDePrueba));

            // 4. Tiene que estar exactamente como al principio
            const devuelto = await enBase(baseDePrueba, async (c) => ({
                anos: (await c.query('SELECT nombre FROM anos_escolares ORDER BY id')).rows.map(
                    (r: any) => r.nombre
                ),
                notas: (await c.query('SELECT alumno, valor::float AS valor FROM notas ORDER BY alumno')).rows,
            }));

            expect(devuelto.anos).toEqual(['2026-2027', '2027-2028']);
            expect(devuelto.notas).toEqual([
                { alumno: 'Ana', valor: 18 },
                { alumno: 'Luis', valor: 11 },
                { alumno: 'Sofía', valor: 20 },
            ]);
        },
        180000
    );

    (disponible ? it : it.skip)(
        'RESP-03: se encuentra el respaldo más reciente de un liceo',
        async () => {
            const encontrado = ultimoRespaldoDe('liceo-de-prueba', carpeta);
            expect(encontrado).toBeTruthy();
            expect(path.basename(encontrado!)).toContain('liceo-de-prueba__');
        },
        60000
    );

    (disponible ? it : it.skip)(
        'RESP-04: los respaldos recientes NO se borran al limpiar',
        async () => {
            const antes = readdirSync(carpeta).filter((n) => n.endsWith('.dump')).length;
            expect(antes).toBeGreaterThan(0);

            const borrados = limpiarRespaldosViejos(carpeta, diasQueSeGuardan());
            expect(borrados).toEqual([]);

            const despues = readdirSync(carpeta).filter((n) => n.endsWith('.dump')).length;
            expect(despues).toBe(antes);
        },
        60000
    );

    (disponible ? it : it.skip)(
        'RESP-05: un liceo con datos de conexión rotos falla claro, no en silencio',
        async () => {
            const roto = { ...liceoFalso(), databaseName: 'base_que_no_existe_xyz' };
            const r = await respaldarLiceo(roto, carpeta);

            expect(r.ok).toBe(false);
            expect(r.error).toBeTruthy();
            // Y no deja un archivo a medias haciéndose pasar por respaldo
            const basura = readdirSync(carpeta).filter(
                (n) => n.startsWith('liceo-de-prueba__') && statSync(path.join(carpeta, n)).size === 0
            );
            expect(basura).toEqual([]);
        },
        120000
    );

    it('RESP-06: la carpeta de respaldos se puede cambiar por configuración', () => {
        const original = process.env.BACKUP_DIR;
        process.env.BACKUP_DIR = '/discos/respaldos';
        expect(carpetaDeRespaldos()).toBe('/discos/respaldos');

        if (original === undefined) delete process.env.BACKUP_DIR;
        else process.env.BACKUP_DIR = original;
    });
});
