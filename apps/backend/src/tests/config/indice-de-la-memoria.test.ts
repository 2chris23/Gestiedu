import { RedisCache } from '../../config/redis';
import { conLiceo } from '../../config/ambito-del-liceo';

/**
 * EL ÍNDICE BORRA LO MISMO QUE EL RECORRIDO COMPLETO
 *
 * La memoria de respaldo ahora borra lo de una persona mirando solo sus claves
 * (ver `indicePorPersona` en config/redis.ts). Un índice que se desincroniza
 * deja pantallas con datos viejos, que es lo único que no se puede permitir.
 *
 * Aquí se guardan muchas claves al azar, se borran con patrones al azar, y lo
 * que queda tiene que ser EXACTAMENTE lo que quedaría comparando cada clave
 * contra cada patrón, como se hacía antes.
 *
 * En estas pruebas no hay Redis: todo va a la memoria de respaldo.
 */

const LICEOS = ['liceoA', 'liceoB'];
const RUTAS = ['/api/grades', '/api/dashboard/student', '/api/students/my-dashboard', '/api/users'];
const PERSONAS = Array.from({ length: 12 }, (_, i) => `persona${i}`);

let semilla = 42;
const azar = (n: number) => {
    // Los bits BAJOS de este generador repiten con un ciclo cortísimo (con
    // `% n` nunca salían ciertas personas): se usan los altos.
    semilla = (semilla * 1103515245 + 12345) % 2 ** 31;
    return Math.floor((semilla / 2 ** 31) * n);
};
const uno = <T>(xs: T[]) => xs[azar(xs.length)];

const aRegex = (patron: string) =>
    new RegExp(`^${patron.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

describe('Índice por persona de la memoria de respaldo', () => {
    it('INDICE-01: tras cientos de guardados y borrados al azar, queda justo lo que dice la fuerza bruta', async () => {
        for (let ronda = 0; ronda < 40; ronda++) {
            const liceo = uno(LICEOS);
            const vivas = new Set<string>(); // claves que deberían seguir
            const escritas = new Set<string>(); // todas las que se guardaron

            await conLiceo(liceo, async () => {
                // Guardar un puñado.
                for (let i = 0; i < 60; i++) {
                    const clave = `cache:${liceo}:${uno(RUTAS)}:${uno(PERSONAS)}:page=${azar(3)}`;
                    await RedisCache.set(clave, { ronda, i }, 300);
                    vivas.add(clave);
                    escritas.add(clave);
                }
                // Y algunas que no tienen forma de "pantalla de una persona".
                await RedisCache.set(`stats:section:${ronda}:global`, 1, 300);

                // Borrar con patrones de todas las formas que usa el sistema.
                const patrones = [
                    `cache:${liceo}:*:${uno(PERSONAS)}:*`,
                    `cache:${liceo}:*:${uno(PERSONAS)}:*`,
                    `cache:${liceo}:${uno(RUTAS)}:${uno(PERSONAS)}:*`,
                ];
                if (ronda % 7 === 0) patrones.push(`cache:${liceo}:/api/users:*`); // forma sin persona
                if (ronda % 2 === 0) await RedisCache.clearPatterns(patrones);
                else for (const p of patrones) await RedisCache.clearPattern(p);

                for (const clave of Array.from(vivas)) {
                    if (patrones.some((p) => aRegex(p).test(clave))) vivas.delete(clave);
                }

                // Lo que la fuerza bruta dice que queda, queda; lo demás, no.
                for (const clave of escritas) {
                    const hay = (await RedisCache.get(clave)) !== null;
                    expect({ clave, hay }).toEqual({ clave, hay: vivas.has(clave) });
                }
                expect(await RedisCache.get(`stats:section:${ronda}:global`)).toBe(1);
            });

            // Limpiar la ronda para que la siguiente empiece de cero.
            await conLiceo(liceo, () => RedisCache.clearPattern(`cache:${liceo}:*`));
        }
    });

    it('INDICE-02: borrar lo de una persona en un liceo no toca a la misma persona en otro', async () => {
        await conLiceo('liceoA', () => RedisCache.set('cache:liceoA:/api/grades:ana:', 'A', 300));
        await conLiceo('liceoB', () => RedisCache.set('cache:liceoB:/api/grades:ana:', 'B', 300));

        await conLiceo('liceoA', () => RedisCache.clearPatterns(['cache:liceoA:*:ana:*', 'cache:liceoA:*:luis:*']));

        expect(await conLiceo('liceoA', () => RedisCache.get('cache:liceoA:/api/grades:ana:'))).toBeNull();
        expect(await conLiceo('liceoB', () => RedisCache.get('cache:liceoB:/api/grades:ana:'))).toBe('B');
    });

    it('INDICE-03: lo caducado sale también del índice (no se queda creciendo)', async () => {
        await conLiceo('liceoA', () => RedisCache.set('cache:liceoA:/api/users:caduca:', 1, 1));
        await new Promise((r) => setTimeout(r, 1100));
        expect(await conLiceo('liceoA', () => RedisCache.get('cache:liceoA:/api/users:caduca:'))).toBeNull();
        const indice: Map<string, Set<string>> = (RedisCache as any).indicePorPersona;
        expect([...indice.keys()].some((k) => k.endsWith('\u0000caduca'))).toBe(false);
    });
});
