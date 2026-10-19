import { platformPrisma } from '../../src/config/database';
import { tomarElTurno, unaVezCada } from '../../src/utils/turno-de-la-tarea';

/**
 * CADA TAREA, UNA SOLA DUEÑA (`utils/turno-de-la-tarea.ts`)
 *
 *   TURNO-01 si el turno es de otro proceso y no ha caducado, la tarea no corre aquí
 *   TURNO-02 caducado (el otro murió), se toma y corre
 *   TURNO-03 la misma vuelta no corre dos veces en este proceso dentro de su periodo… sí la siguiente
 */

const NOMBRE = `prueba-turno-${Date.now()}`;

describe('El turno de cada tarea', () => {
    afterAll(async () => {
        await platformPrisma.$executeRawUnsafe(`DELETE FROM "turnos_de_tareas" WHERE "nombre" LIKE 'prueba-turno-%'`);
    });

    it('TURNO-01: si es de otro y no caducó, aquí no corre', async () => {
        await platformPrisma.$executeRawUnsafe(`INSERT INTO "turnos_de_tareas" ("nombre","quien","hasta") VALUES ($1, 'otro-proceso', now() + interval '1 hour')`, NOMBRE);
        let corrio = false;
        const r = await unaVezCada(NOMBRE, 60_000, async () => {
            corrio = true;
        });
        expect(r).toBe(false);
        expect(corrio).toBe(false);
    });

    it('TURNO-02: caducado (el otro murió), se toma y corre', async () => {
        await platformPrisma.$executeRawUnsafe(`UPDATE "turnos_de_tareas" SET "hasta" = now() - interval '1 second' WHERE "nombre" = $1`, NOMBRE);
        let corrio = false;
        expect(await unaVezCada(NOMBRE, 60_000, async () => void (corrio = true))).toBe(true);
        expect(corrio).toBe(true);
        const [f] = await platformPrisma.$queryRawUnsafe<Array<{ quien: string }>>(`SELECT "quien" FROM "turnos_de_tareas" WHERE "nombre" = $1`, NOMBRE);
        expect(f.quien).not.toBe('otro-proceso');
    });

    it('TURNO-03: dos procesos a la vez, solo uno lo toma', async () => {
        const nombre = `${NOMBRE}-carrera`;
        // El de aquí y un «otro» que intenta lo mismo en el mismo instante.
        const otro = platformPrisma.$queryRawUnsafe<Array<{ quien: string }>>(
            `INSERT INTO "turnos_de_tareas" ("nombre","quien","hasta") VALUES ($1, 'otro-proceso', now() + interval '1 hour')
             ON CONFLICT ("nombre") DO UPDATE SET "quien" = EXCLUDED."quien", "hasta" = EXCLUDED."hasta"
               WHERE "turnos_de_tareas"."hasta" < now() OR "turnos_de_tareas"."quien" = EXCLUDED."quien"
             RETURNING "quien"`,
            nombre
        );
        const [mio, suyo] = await Promise.all([tomarElTurno(nombre, 3600_000), otro]);
        expect(Number(mio) + suyo.length).toBe(1);
    });
});
