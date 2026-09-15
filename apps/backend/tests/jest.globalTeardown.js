/**
 * LIMPIEZA AL TERMINAR LA TANDA
 *
 * Las pruebas escriben una fila de instituto ("test-institute") en la base de
 * plataforma para que el servidor sepa a qué base del liceo conectarse. Esa fila
 * apunta a la base temporal del último archivo de pruebas, que ya no existe
 * cuando termina la tanda: queda basura señalando a la nada.
 *
 * En una máquina de desarrollo la base de plataforma es la de verdad, así que
 * esa fila se queda ahí mezclada con los liceos reales. Aquí se borra.
 *
 * Lo que faltaría (anotado, no hecho): que las pruebas tengan su PROPIA base de
 * plataforma en vez de escribir en la compartida.
 */

const { Client } = require('pg');

const ID_INSTITUTO_DE_PRUEBAS = 'institute';

/**
 * LAS CUENTAS DE SUPERADMIN QUE DEJAN LAS PRUEBAS
 *
 * `seedSuperAdmin` crea una cuenta de superadmin —acceso a TODOS los liceos— y
 * nadie la borraba. Cada tanda dejaba las suyas.
 *
 * Contadas en esta máquina antes de arreglarlo: **106 cuentas de superadmin
 * activas**, casi todas `sa-<número>@test.com`. En una base de desarrollo es
 * suciedad; si esa base llega a producción —y la de plataforma es la misma que
 * usan las pruebas, ver la nota de arriba— son cien puertas abiertas.
 *
 * Se borran las de prueba, que se reconocen por el correo. Las de verdad no
 * llevan ese patrón y no se tocan.
 */
const CORREOS_DE_PRUEBA = [
    "email LIKE 'sa-%@test.com'",
    "email = 'superadmin@test.com'",
].join(' OR ');

module.exports = async function globalTeardown() {
    const url = process.env.PLATFORM_DATABASE_URL;
    if (!url) return;

    const client = new Client({ connectionString: url });
    try {
        await client.connect();
        const { rowCount } = await client.query('DELETE FROM institutes WHERE id = $1', [
            ID_INSTITUTO_DE_PRUEBAS,
        ]);
        if (rowCount > 0) {
            console.log('[jest-teardown] instituto de pruebas borrado de la base de plataforma');
        }

        const superadmins = await client.query(
            `DELETE FROM super_admins WHERE ${CORREOS_DE_PRUEBA}`
        );
        if (superadmins.rowCount > 0) {
            console.log(
                `[jest-teardown] ${superadmins.rowCount} cuentas de superadmin de prueba borradas`
            );
        }
    } catch (error) {
        // Que no falle la tanda por no poder limpiar
        console.warn('[jest-teardown] no se pudo limpiar el instituto de pruebas:', error.message);
    } finally {
        await client.end().catch(() => {});
    }
};
