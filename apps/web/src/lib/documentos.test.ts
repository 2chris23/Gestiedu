import * as fs from 'fs';
import * as path from 'path';
import { esDocumento } from './documentos';

/**
 * TODA PANTALLA QUE IMPRIME ES UN PAPEL (DOC-LISTA-01)
 *
 * Una pantalla de papel fuera de la lista se imprime con la cabecera y la
 * barra de la app encima (Cristian, 2026-09-27). Aquí se recorren las
 * pantallas que imprimen (usan `HojaImprimible` o `imprimirConAviso`) y se
 * exige que `esDocumento` las reconozca.
 */

const RAIZ = path.join(__dirname, '..', 'app', '(dashboard)');
// Imprime una ventana suelta (el acta), no la pantalla: `data-hoja-suelta`.
const NO_SON_PAPEL = ['/dashboard/academico/x/promocion'];

function paginas(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const ruta = path.join(dir, e.name);
        if (e.isDirectory()) return paginas(ruta);
        return e.name === 'page.tsx' ? [ruta] : [];
    });
}

const laRuta = (archivo: string) =>
    '/' +
    path
        .relative(RAIZ, path.dirname(archivo))
        .split(path.sep)
        .map((trozo) => (/^\[.+\]$/.test(trozo) ? 'x' : trozo))
        .join('/');

describe('Las pantallas de papel', () => {
    const queImprimen = paginas(RAIZ)
        .filter((f) => /<HojaImprimible|imprimirConAviso\(|window\.print\(/.test(fs.readFileSync(f, 'utf-8')))
        .map(laRuta)
        .filter((r) => !NO_SON_PAPEL.includes(r));

    it('hay unas cuantas (la búsqueda funciona)', () => {
        expect(queImprimen.length).toBeGreaterThan(10);
    });

    it.each(queImprimen)('%s se ve sin el armazón de la app', (ruta) => {
        expect(esDocumento(ruta)).toBe(true);
    });

    it('las pantallas de trabajo NO son papel', () => {
        for (const r of ['/dashboard', '/dashboard/usuarios', '/dashboard/academico/x', '/dashboard/academico/x/y', '/dashboard/clase-en-vivo/a/b', '/dashboard/observaciones']) {
            expect(esDocumento(r)).toBe(false);
        }
    });

    it('con el portal del liceo delante, también', () => {
        expect(esDocumento('/instituto/mi-liceo/dashboard/boleta/V123')).toBe(true);
    });
});
