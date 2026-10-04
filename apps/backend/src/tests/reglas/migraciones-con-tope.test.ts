import * as fs from 'fs';
import * as path from 'path';

/**
 * UNA MIGRACIÓN NO SE QUEDA ESPERANDO UN CANDADO (MIGRA-01, 2026-10-04)
 *
 * `migrate:tenants` recorre 200 liceos. Un `ALTER TABLE` sobre `grades` espera
 * a que nadie la esté usando, y mientras espera **bloquea a todos los que
 * llegan detrás**: en horario de clase, el liceo entero se queda colgado
 * pasando lista. Con `lock_timeout` la migración falla en segundos (y se
 * reintenta fuera de horario) en vez de colgar al liceo.
 *
 * Desde aquí, toda migración nueva empieza con:
 *
 *     SET lock_timeout = '10s';
 *
 * Las anteriores no se tocan: una migración aplicada no se edita nunca.
 * Y un índice sobre una tabla grande va `CONCURRENTLY` en su propia migración
 * (Prisma no puede envolverla en una transacción: ver docs/DESPLIEGUE.md).
 */
const DESDE = '20261005000000';

describe('Las migraciones nuevas llevan tope de espera (MIGRA-01)', () => {
    it('cada migración desde octubre de 2026 empieza con SET lock_timeout', () => {
        const carpeta = path.join(__dirname, '..', '..', 'prisma', 'migrations');
        const sinTope = fs
            .readdirSync(carpeta, { withFileTypes: true })
            .filter((e) => e.isDirectory() && e.name.slice(0, 14) >= DESDE)
            .filter((e) => !/SET\s+lock_timeout/i.test(fs.readFileSync(path.join(carpeta, e.name, 'migration.sql'), 'utf8')))
            .map((e) => e.name);
        expect(sinTope).toEqual([]);
    });
});
