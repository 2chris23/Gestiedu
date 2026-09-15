import { RedisCache, redis } from '../../src/config/redis';
import { conLiceo } from '../../src/config/ambito-del-liceo';

/**
 * LIMPIAR LAS COPIAS DE VARIOS DE UNA SOLA PASADA
 *
 * Cuando alguien guarda algo, hay que tirar la copia guardada de toda la gente
 * a la que le cambia lo que ve: el alumno, sus representantes, los profesores de
 * la sección y los admins. Suelen ser diez o quince personas por cada nota.
 *
 * Se hacía una llamada por cabeza, y **cada llamada recorre todas las claves
 * guardadas**. Así que una sola nota provocaba diez o quince recorridos
 * completos, uno detrás de otro, con el profesor esperando.
 *
 * Ahora se recorre una vez y se comparan todos los patrones contra cada clave.
 * Lo que se borra tiene que ser exactamente lo mismo que antes — ni una clave
 * de más, ni una de menos— y eso es lo que se comprueba aquí.
 */

/** El mismo prefijo que le pone `RedisCache` a cada clave. */
const PREFIJO = 'gestion-escolar:';

/**
 * Lo guardado lleva delante el apartado de su liceo: la memoria rápida es una
 * sola para todo el servidor y eso es lo que impide que dos liceos se pisen
 * (ver `config/ambito-del-liceo.ts`). Aquí se escribe entero porque estas
 * pruebas fabrican las claves a mano.
 */
const apartado = (liceo: string) => `${PREFIJO}liceo:${liceo}:`;

const LICEO = 'liceo-uno';
const OTRO_LICEO = 'liceo-dos';

/** Como las arma `smart-cache`: cache:{liceo}:{ruta}:{persona}:{parámetros} */
const claveDe = (liceo: string, ruta: string, persona: string, params = '') =>
    `cache:${liceo}:${ruta}:${persona}:${params}`;

describe('Limpiar las copias de varios de una sola pasada', () => {
    beforeEach(async () => {
        await RedisCache.clearPattern('cache:*');
    });

    const guardarCopias = async (claves: string[]) => {
        for (const clave of claves) {
            await RedisCache.set(clave, { dato: clave }, 300);
        }
    };

    const sigueGuardada = async (clave: string) => (await RedisCache.get(clave)) !== null;

    it('LIMP-01: borra lo de la gente avisada y deja lo de los demás', async () => {
        const deAna = claveDe(LICEO, '/api/dashboard/student', 'ana');
        const deLuis = claveDe(LICEO, '/api/dashboard/student', 'luis');
        const deSofia = claveDe(LICEO, '/api/dashboard/student', 'sofia');

        await guardarCopias([deAna, deLuis, deSofia]);

        await RedisCache.clearPatterns([
            `cache:${LICEO}:*:ana:*`,
            `cache:${LICEO}:*:luis:*`,
        ]);

        expect(await sigueGuardada(deAna)).toBe(false);
        expect(await sigueGuardada(deLuis)).toBe(false);
        // Sofía no tiene nada que ver con este cambio: lo suyo sigue sirviendo.
        expect(await sigueGuardada(deSofia)).toBe(true);
    });

    it('LIMP-02: borra TODAS las pantallas de esa persona, no solo una', async () => {
        const panel = claveDe(LICEO, '/api/dashboard/student', 'ana');
        const notas = claveDe(LICEO, '/api/grades/my-grades', 'ana', 'lapso=1');
        const clases = claveDe(LICEO, '/api/classrooms/mine', 'ana');

        await guardarCopias([panel, notas, clases]);

        await RedisCache.clearPatterns([`cache:${LICEO}:*:ana:*`, `cache:${LICEO}:*:luis:*`]);

        expect(await sigueGuardada(panel)).toBe(false);
        expect(await sigueGuardada(notas)).toBe(false);
        expect(await sigueGuardada(clases)).toBe(false);
    });

    it('LIMP-03: no se cruza de un liceo a otro aunque la cédula se repita', async () => {
        // La cédula es un número del Estado: la misma persona puede existir en
        // dos liceos. Borrar lo de uno no puede tocar lo del otro.
        const enEsteLiceo = claveDe(LICEO, '/api/dashboard/student', 'V12345678');
        const enElOtro = claveDe(OTRO_LICEO, '/api/dashboard/student', 'V12345678');

        await guardarCopias([enEsteLiceo, enElOtro]);

        await RedisCache.clearPatterns([`cache:${LICEO}:*:V12345678:*`]);

        expect(await sigueGuardada(enEsteLiceo)).toBe(false);
        expect(await sigueGuardada(enElOtro)).toBe(true);
    });

    it('LIMP-04: borra exactamente lo mismo que borrando de uno en uno', async () => {
        const todas = [
            claveDe(LICEO, '/api/dashboard/student', 'ana'),
            claveDe(LICEO, '/api/grades/my-grades', 'ana', 'lapso=2'),
            claveDe(LICEO, '/api/dashboard/student', 'luis'),
            claveDe(LICEO, '/api/dashboard/tutor', 'carmen'),
            claveDe(LICEO, '/api/dashboard/student', 'sofia'),
            claveDe(OTRO_LICEO, '/api/dashboard/student', 'ana'),
        ];
        const patrones = ['ana', 'luis', 'carmen'].map((p) => `cache:${LICEO}:*:${p}:*`);

        // De uno en uno, como se hacía antes.
        await guardarCopias(todas);
        for (const patron of patrones) await RedisCache.clearPattern(patron);
        const antes = [];
        for (const clave of todas) antes.push(await sigueGuardada(clave));

        // De una pasada, como se hace ahora.
        await RedisCache.clearPattern('cache:*');
        await guardarCopias(todas);
        await RedisCache.clearPatterns(patrones);
        const ahora = [];
        for (const clave of todas) ahora.push(await sigueGuardada(clave));

        expect(ahora).toEqual(antes);
        // Y que la comprobación no sea trivial: algo tiene que quedar vivo.
        expect(ahora).toContain(true);
        expect(ahora).toContain(false);
    });

    it('LIMP-05: con un solo patrón se comporta igual que antes', async () => {
        const deAna = claveDe(LICEO, '/api/dashboard/student', 'ana');
        const deLuis = claveDe(LICEO, '/api/dashboard/student', 'luis');

        await guardarCopias([deAna, deLuis]);
        await RedisCache.clearPatterns([`cache:${LICEO}:*:ana:*`]);

        expect(await sigueGuardada(deAna)).toBe(false);
        expect(await sigueGuardada(deLuis)).toBe(true);
    });

    it('LIMP-06: sin nadie a quien avisar no borra nada', async () => {
        const deAna = claveDe(LICEO, '/api/dashboard/student', 'ana');
        await guardarCopias([deAna]);

        await RedisCache.clearPatterns([]);

        expect(await sigueGuardada(deAna)).toBe(true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // LO QUE SE VINO A ARREGLAR: EL NÚMERO DE RECORRIDOS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * EL RECORRIDO SE CUENTA CON UN REDIS DE MENTIRA
     *
     * El recorrido solo ocurre contra Redis, y en las pruebas no hay uno
     * levantado. En vez de dar por bueno lo que se deduce leyendo el código, se
     * pone un Redis de mentira que anota cada búsqueda que recibe y devuelve
     * unas claves inventadas. El código que se ejecuta es el de verdad.
     */
    function ponerRedisDeMentira(clavesGuardadas: string[]) {
        const estadoAnterior = Object.getOwnPropertyDescriptor(redis, 'status');
        Object.defineProperty(redis, 'status', { value: 'ready', configurable: true });

        const busquedas: string[] = [];
        const borradas: string[] = [];

        // Los comandos de ioredis viven en el prototipo, así que se sustituyen
        // poniéndolos encima del objeto y luego se quitan.
        const teniaScan = Object.prototype.hasOwnProperty.call(redis, 'scan');
        const teniaDel = Object.prototype.hasOwnProperty.call(redis, 'del');
        const scanAnterior = (redis as any).scan;
        const delAnterior = (redis as any).del;

        (redis as any).scan = (cursor: any, ...resto: any[]) => {
            const patron = String(resto[resto.indexOf('MATCH') + 1] ?? '*');
            if (String(cursor) === '0') busquedas.push(patron);
            // Redis filtra por el patrón antes de devolver nada.
            const re = new RegExp('^' + patron.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
            return Promise.resolve(['0', clavesGuardadas.filter((k) => re.test(k))]);
        };

        (redis as any).del = (...claves: any[]) => {
            borradas.push(...claves.flat().map(String));
            return Promise.resolve(claves.length);
        };

        const devolverTodo = () => {
            if (teniaScan) (redis as any).scan = scanAnterior;
            else delete (redis as any).scan;
            if (teniaDel) (redis as any).del = delAnterior;
            else delete (redis as any).del;
            if (estadoAnterior) Object.defineProperty(redis, 'status', estadoAnterior);
            else delete (redis as any).status;
        };

        return { busquedas, borradas, devolverTodo };
    }

    it('LIMP-07: quince personas avisadas = UN recorrido, no quince', async () => {
        const quince = Array.from({ length: 15 }, (_, i) => `persona${i}`);
        const guardadas = [
            ...quince.map((p) => `${apartado(LICEO)}cache:${LICEO}:/api/dashboard/student:${p}:`),
            `${apartado(LICEO)}cache:${LICEO}:/api/dashboard/student:ajeno:`,
        ];

        const falso = ponerRedisDeMentira(guardadas);
        try {
            await conLiceo(LICEO, () => RedisCache.clearPatterns(quince.map((p) => `cache:${LICEO}:*:${p}:*`)));

            // Lo que se vino a arreglar: era uno por cabeza.
            expect(falso.busquedas).toHaveLength(1);

            // Y sin borrar de más: el que no estaba avisado sigue guardado.
            expect(falso.borradas).toHaveLength(15);
            expect(falso.borradas.some((k) => k.includes(':ajeno:'))).toBe(false);
        } finally {
            falso.devolverTodo();
        }
    });

    it('LIMP-08: de uno en uno eran quince recorridos — así estaba antes', async () => {
        // Se deja escrito el coste anterior para que el número de arriba
        // signifique algo y no se vuelva atrás sin darse cuenta.
        const quince = Array.from({ length: 15 }, (_, i) => `persona${i}`);
        const guardadas = quince.map((p) => `${apartado(LICEO)}cache:${LICEO}:/api/dashboard/student:${p}:`);

        const falso = ponerRedisDeMentira(guardadas);
        try {
            for (const p of quince) {
                await conLiceo(LICEO, () => RedisCache.clearPattern(`cache:${LICEO}:*:${p}:*`));
            }
            expect(falso.busquedas).toHaveLength(15);
        } finally {
            falso.devolverTodo();
        }
    });
});
