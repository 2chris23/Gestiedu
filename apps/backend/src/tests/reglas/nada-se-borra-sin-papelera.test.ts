import fs from 'fs';
import path from 'path';

/**
 * NADA DEL LICEO SE BORRA SIN PASAR POR LA PAPELERA
 *
 * La regla (CLAUDE.md, «Borrar»): todo borrado de información del liceo pasa
 * por `borrarGuardandoCopia()`, que guarda la fila entera antes de tocarla.
 *
 * Aun así, en septiembre de 2026 había dos borrados definitivos que se la
 * saltaban —«Retirar y eliminar» en el cierre del ciclo, que se llevaba al
 * alumno con todas sus notas, y quitar una materia de un año— y cinco métodos
 * de borrado a pelo en los servicios, sin nadie que los llamara, esperando a
 * que alguien los usara. Nadie los vio en meses porque nada miraba.
 *
 * Esta prueba mira: recorre el código de la aplicación y falla si aparece un
 * `.delete(` o `.deleteMany(` sobre una tabla que no esté en la lista de abajo.
 * Si hace falta borrar algo nuevo, se usa la papelera; y si de verdad no es
 * información del liceo, se añade aquí con su motivo.
 */

/** Lo que se puede borrar sin copia, y por qué. */
const SIN_COPIA: Record<string, string> = {
    refreshToken: 'guardar sesiones es guardar llaves',
    superAdminRefreshToken: 'ídem, las del superadmin',
    deviceKey: 'ídem, las llaves de la huella',
    notification: 'no es información del liceo',
    systemAlert: 'avisos de sistema que caducan',
    registroBorrado: 'la propia papelera vaciando lo que caducó',
    institute: 'borrar un liceo es DROP DATABASE, con respaldo previo obligatorio',
};

/** Cosas que tienen un `.delete()` y no son tablas. */
const NO_SON_TABLAS = new Set(['searchParams', 'memoryStore', 'indicePorPersona', 'headers']);

/** Carpetas que no son la aplicación: semillas, guiones de mantenimiento, lo generado. */
const FUERA = ['generated', 'scripts', 'tests', 'migration', 'prisma'];

function archivos(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const ruta = path.join(dir, e.name);
        if (e.isDirectory()) return FUERA.includes(e.name) ? [] : archivos(ruta);
        return e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') ? [ruta] : [];
    });
}

describe('Nada del liceo se borra sin pasar por la papelera', () => {
    it('BORRA-01: ningún .delete / .deleteMany sobre una tabla del liceo fuera de la papelera', () => {
        const raiz = path.join(__dirname, '..', '..');
        const infracciones: string[] = [];

        for (const archivo of archivos(raiz)) {
            if (archivo.endsWith(path.join('utils', 'papelera.ts'))) continue;
            const lineas = fs.readFileSync(archivo, 'utf8').split(/\r?\n/);
            lineas.forEach((linea, i) => {
                const t = linea.trim();
                if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
                for (const m of linea.matchAll(/\b\w+\.(\w+)\.(delete|deleteMany)\(/g)) {
                    const tabla = m[1];
                    if (SIN_COPIA[tabla] || NO_SON_TABLAS.has(tabla)) continue;
                    infracciones.push(`${path.relative(raiz, archivo)}:${i + 1}  ${t}`);
                }
            });
        }

        expect(infracciones).toEqual([]);
    });
});
