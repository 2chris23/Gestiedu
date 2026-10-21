import * as fs from 'fs';
import * as path from 'path';

/**
 * NINGÚN ARCHIVO DE CÓDIGO CRECE SIN FIN (Cristian, 19-oct-2026; CLAUDE.md 0-ter)
 *
 * «Está mal que un solo archivo tenga 2.000 líneas.» Un archivo así mezcla
 * cosas, se lee mal y cada cambio arriesga lo de al lado. La meta es ~800
 * líneas por archivo, partido por responsabilidad (no por número).
 *
 * TAMAÑO-01: ninguno pasa de 800 (desde el 20-oct-2026, cuando el último bajó de ahí).
 * TAMAÑO-02: los que ya pasan de 800 están en esta lista con su tope de hoy;
 *            pueden bajar (y entonces se baja el tope), nunca subir.
 *
 * Solo el código de la app: no las pruebas, los guiones de medir ni las semillas.
 */
const RAIZ = path.resolve(__dirname, '../../..');
// Vacía desde el 20-oct-2026: ya no queda ningún archivo de más de 800 líneas.
// Uno que pase de ahí entra aquí con su tope y una razón, nunca para crecer.
const GRANDES: Record<string, number> = {};
const TOPE_NUEVO = 800;

function archivos(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const r = path.join(dir, e.name);
        if (e.isDirectory()) return ['node_modules', 'generated', 'scripts', 'prisma', '.next'].includes(e.name) ? [] : archivos(r);
        return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') ? [r] : [];
    });
}
const lineas = (f: string) => fs.readFileSync(f, 'utf8').split('\n').length - 1;

describe('Los archivos no crecen sin fin (TAMAÑO)', () => {
    const todos = [...archivos(path.join(RAIZ, 'apps/backend/src')), ...archivos(path.join(RAIZ, 'apps/web/src'))].map((f) => [path.relative(RAIZ, f).split(path.sep).join('/'), lineas(f)] as const);

    it('TAMAÑO-01: ninguno nuevo pasa de 1.000 líneas', () => {
        const fuera = todos.filter(([f, n]) => !(f in GRANDES) && n > TOPE_NUEVO).map(([f, n]) => `${f}: ${n}`);
        expect(fuera).toEqual([]);
    });

    it('TAMAÑO-02: los grandes de la lista no crecen (pueden bajar)', () => {
        const crecieron = todos.filter(([f, n]) => f in GRANDES && n > GRANDES[f]).map(([f, n]) => `${f}: ${n} > ${GRANDES[f]}`);
        expect(crecieron).toEqual([]);
    });
});
