import { cabenLasConexiones, tenantConnectionLimit, POZO_POR_DEFECTO } from '../../src/config/tenant-db-url';

/**
 * ¿CABEN LAS CONEXIONES QUE PEDIMOS?
 *
 * Todas las bases de los liceos viven en el MISMO servidor de PostgreSQL, y el
 * máximo de conexiones es del servidor entero, no de cada base. El sistema
 * guarda hasta 50 clientes de liceo a la vez, así que:
 *
 *     conexiones en el peor caso = 50 liceos × conexiones por liceo
 *
 * Con el valor por defecto (2) eso da 100, que es exactamente el máximo por
 * defecto de PostgreSQL. **Por eso es 2.** No estaba escrito en ningún sitio, y
 * por eso parecía un número puesto al azar.
 *
 * ─── POR QUÉ IMPORTA QUE EL SISTEMA LO DIGA ──────────────────────────────────
 *
 * Quien despliegue esto va a leer que subiendo ese número la pantalla más
 * pesada va 2,6× más rápida (medido: 550 ms → 215 ms con 200 personas a la vez)
 * y lo va a subir. Con pocos liceos es lo correcto. Con muchos, se queda sin
 * conexiones y empiezan a fallar peticiones, que es lo que ya pasó una vez: el
 * 15% de las peticiones murieron con "Timed out fetching a new connection from
 * the connection pool (connection limit: 2)".
 *
 * El sistema hace la cuenta al arrancar y lo dice. Estas pruebas son la garantía
 * de que la cuenta está bien y de que el aviso se entiende.
 */

describe('¿Caben las conexiones que pedimos?', () => {
    const SIN_PGBOUNCER = () => {
        delete process.env.PGBOUNCER_HOST;
    };

    beforeEach(SIN_PGBOUNCER);
    afterEach(SIN_PGBOUNCER);

    // ─────────────────────────────────────────────────────────────────────────
    // LA CUENTA
    // ─────────────────────────────────────────────────────────────────────────

    it('CONN-01: ni el valor por defecto cabe del todo, y el sistema lo dice', async () => {
        // 100 plazas, 3 reservadas, 50 liceos guardados, 2 conexiones cada uno.
        //
        // El 2 se eligió contra el 100 de PostgreSQL, pero **3 de esas plazas
        // están reservadas para el superusuario**: quedan 97. Con 50 liceos
        // llenos a la vez faltarían 3 conexiones.
        //
        // No es urgente —hacen falta 50 liceos con gente dentro al mismo
        // tiempo— pero es real, y ahora se dice al arrancar en vez de aparecer
        // como peticiones que fallan sin explicación.
        const cuenta = cabenLasConexiones(100, 3, 50, 2);

        expect(cuenta.peorCaso).toBe(100);
        expect(cuenta.disponibles).toBe(97);
        expect(cuenta.cabe).toBe(false);
        // Y la salida que propone es la correcta: bajar a 1 con esos números.
        expect(cuenta.mensaje).toMatch(/TENANT_CONNECTION_LIMIT=1\b/);
    });

    it('CONN-02: con pocos liceos, subirlo cabe de sobra', async () => {
        // El caso real de casi todos los despliegues: un servidor con 3 liceos.
        const cuenta = cabenLasConexiones(100, 3, 3, 25);

        expect(cuenta.peorCaso).toBe(75);
        expect(cuenta.cabe).toBe(true);
        expect(cuenta.mensaje).toContain('Cabe');
    });

    it('CONN-03: subirlo con muchos liceos NO cabe, y lo dice con números', async () => {
        const cuenta = cabenLasConexiones(100, 3, 50, 25);

        expect(cuenta.cabe).toBe(false);
        expect(cuenta.peorCaso).toBe(1250);
        // El aviso tiene que traer los tres números que hacen falta para
        // entenderlo sin abrir el código.
        expect(cuenta.mensaje).toContain('1250');
        expect(cuenta.mensaje).toContain('97');
        expect(cuenta.mensaje).toContain('25');
    });

    it('CONN-04: el aviso dice qué hacer, no solo que está mal', async () => {
        const cuenta = cabenLasConexiones(100, 3, 50, 25);

        // Un aviso que solo dice "no cabe" obliga a adivinar. Este trae la
        // salida concreta.
        expect(cuenta.mensaje).toMatch(/TENANT_CONNECTION_LIMIT=1\b/);
        expect(cuenta.mensaje).toContain('max_connections');
        expect(cuenta.mensaje).toContain('PgBouncer');
    });

    it('CONN-05: un servidor grande aguanta lo que uno de fábrica no', async () => {
        // Subir max_connections es una de las salidas: con 500 plazas, 50
        // liceos a 10 conexiones caben.
        const cuenta = cabenLasConexiones(500, 3, 50, 10);

        expect(cuenta.peorCaso).toBe(500);
        expect(cuenta.disponibles).toBe(497);
        expect(cuenta.cabe).toBe(false);

        // Con 9 sí.
        expect(cabenLasConexiones(500, 3, 50, 9).cabe).toBe(true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PGBOUNCER: LA CUENTA DEJA DE APLICAR
    // ─────────────────────────────────────────────────────────────────────────

    it('CONN-06: con PgBouncer delante, la cuenta de PostgreSQL no aplica', async () => {
        // PgBouncer reparte un puñado de conexiones reales entre todos los
        // clientes: eso es exactamente para lo que sirve. Avisar de que "no
        // caben" ahí sería una alarma falsa cada vez que arranca el servidor.
        process.env.PGBOUNCER_HOST = 'pgbouncer.interno';

        const cuenta = cabenLasConexiones(100, 3, 50, 25);

        expect(cuenta.cabe).toBe(true);
        expect(cuenta.mensaje).toContain('PgBouncer');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // EL VALOR CONFIGURADO
    // ─────────────────────────────────────────────────────────────────────────

    it('CONN-07: sin configurar nada, son 2 conexiones por liceo', async () => {
        const antes = process.env.TENANT_CONNECTION_LIMIT;
        delete process.env.TENANT_CONNECTION_LIMIT;
        try {
            expect(tenantConnectionLimit()).toBe(POZO_POR_DEFECTO);
            expect(POZO_POR_DEFECTO).toBe(2);
        } finally {
            if (antes !== undefined) process.env.TENANT_CONNECTION_LIMIT = antes;
        }
    });

    it('CONN-08: lo que se configura manda, y lo que no es un número no', async () => {
        const antes = process.env.TENANT_CONNECTION_LIMIT;
        try {
            process.env.TENANT_CONNECTION_LIMIT = '10';
            expect(tenantConnectionLimit()).toBe(10);

            for (const disparate of ['0', '-5', 'muchas', '']) {
                process.env.TENANT_CONNECTION_LIMIT = disparate;
                expect(tenantConnectionLimit()).toBe(POZO_POR_DEFECTO);
            }
        } finally {
            if (antes !== undefined) process.env.TENANT_CONNECTION_LIMIT = antes;
            else delete process.env.TENANT_CONNECTION_LIMIT;
        }
    });

    it('CONN-09: la cuenta usa lo configurado si no se le dice otra cosa', async () => {
        const antes = process.env.TENANT_CONNECTION_LIMIT;
        try {
            process.env.TENANT_CONNECTION_LIMIT = '4';
            // Sin cuarto argumento: lo tiene que sacar de la configuración.
            const cuenta = cabenLasConexiones(100, 3, 10);
            expect(cuenta.peorCaso).toBe(40);
            expect(cuenta.cabe).toBe(true);
        } finally {
            if (antes !== undefined) process.env.TENANT_CONNECTION_LIMIT = antes;
            else delete process.env.TENANT_CONNECTION_LIMIT;
        }
    });
});
