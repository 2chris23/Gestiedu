import * as fs from 'fs';
import * as path from 'path';
import { maximoDelInstrumento, notaDelInstrumento, plantillaDe, validarInstrumento } from './instrumentos';

/**
 * LA CUENTA DE LOS INSTRUMENTOS, IGUAL EN LOS DOS LADOS (INSTR-WEB-01)
 *
 * La pantalla calcula la nota mientras se marca; el servidor la calcula al
 * guardar. Si las dos copias se separan, el profesor ve un 17 y se guarda un
 * 15. Se exige que el archivo sea el mismo (salvo la línea que dice dónde está
 * el otro) y se prueba una cuenta.
 */
describe('Los instrumentos (web)', () => {
    it('INSTR-WEB-01: la cuenta es la misma que la del servidor', () => {
        const sinLaLinea = (t: string) => t.replace(/^ \* lados: .*$/m, '').replace(/\r\n/g, '\n');
        const web = fs.readFileSync(path.join(__dirname, 'instrumentos.ts'), 'utf-8');
        const servidor = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'backend', 'src', 'utils', 'instrumentos.ts'), 'utf-8');
        expect(sinLaLinea(web)).toBe(sinLaLinea(servidor));
    });

    it('la lista de cotejo del cuaderno vale 20 y suma lo marcado', () => {
        const def = validarInstrumento(plantillaDe('COTEJO'));
        expect(maximoDelInstrumento(def)).toBe(20);
        expect(notaDelInstrumento(def, { c1: true, c5: true })).toBe(5);
    });
});
