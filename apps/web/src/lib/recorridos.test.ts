import * as fs from 'fs';
import * as path from 'path';
import { PANTALLAS_CON_RECORRIDO, pasosDelRol, recorridoDe, recorridoPorId } from './recorridos';

/**
 * LOS RECORRIDOS APUNTAN A ALGO QUE EXISTE (RECORRIDO-01…03)
 *
 * Un paso cuyo `data-recorrido` no está en ninguna pantalla no falla: se salta
 * en silencio, y el recorrido sale con un paso menos sin que nadie lo note
 * (renombrar un botón bastaba). Aquí se lee el código de la web y cada paso
 * tiene que encontrar su marca.
 */

function archivos(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const ruta = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : archivos(ruta);
        return /\.tsx$/.test(e.name) ? [ruta] : [];
    });
}

const codigo = archivos(path.join(__dirname, '..')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const marcas = new Set(Array.from(codigo.matchAll(/data-recorrido="([a-z0-9-]+)"/g), (m) => m[1]));
// `data-recorrido={`finanzas-${v.id}`}`: vale cualquier nombre con ese principio.
const prefijos = Array.from(codigo.matchAll(/data-recorrido=\{`([a-z0-9-]+)\$\{/g), (m) => m[1]);
const existe = (donde: string) => marcas.has(donde) || prefijos.some((p) => donde.startsWith(p));

const todos = [...PANTALLAS_CON_RECORRIDO.map((id) => recorridoPorId(id)!), recorridoDe('/dashboard/una-que-no-tiene')];

describe('Los recorridos guiados', () => {
    it('RECORRIDO-01: cada paso apunta a una marca que alguna pantalla pone', () => {
        const faltan = todos.flatMap((r) => r.pasos.filter((p) => p.donde && !existe(p.donde)).map((p) => `${r.id} → ${p.donde}`));
        expect(faltan).toEqual([]);
    });

    it('RECORRIDO-02: cada pantalla encuentra el suyo, y sin uno propio sale el de siempre', () => {
        expect(recorridoDe('/dashboard').id).toBe('inicio');
        expect(recorridoDe('/dashboard/clase-en-vivo/abc/def').id).toBe('clase-en-vivo');
        expect(recorridoDe('/dashboard/pagos').id).toBe('finanzas');
        expect(recorridoDe('/dashboard/pagos/reporte').id).toBe('general');
        expect(recorridoDe('/dashboard/usuarios/12345').id).toBe('general');
        expect(recorridoDe('/dashboard/mi-clase/mate').id).toBe('mi-clase');
        const general = recorridoDe('/dashboard/aulas');
        expect(general.pasos.map((p) => p.donde)).toEqual(expect.arrayContaining(['menu', 'campana', 'ayuda']));
    });

    it('RECORRIDO-03: cada rol ve sus pasos; el alumno no ve el cuadro de honor del liceo ni el representante el del alumno', () => {
        const inicio = recorridoPorId('inicio')!;
        const de = (rol: 'ADMIN' | 'TEACHER' | 'STUDENT' | 'TUTOR') => pasosDelRol(inicio, rol).map((p) => p.donde);
        expect(de('ADMIN')).toContain('cuadro-de-honor');
        expect(de('STUDENT')).not.toContain('cuadro-de-honor');
        expect(de('STUDENT')).toContain('mi-puntaje');
        expect(de('TUTOR')).not.toContain('mi-puntaje');
        expect(de('TUTOR')).toContain('mis-representados');
        expect(de('TEACHER')).not.toContain('calendario-del-liceo');
        // Sin rol todavía, solo lo que es de todos.
        expect(pasosDelRol(inicio, null).every((p) => !p.roles)).toBe(true);
    });
});
