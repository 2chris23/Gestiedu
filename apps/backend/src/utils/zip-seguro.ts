import { inflateRawSync } from 'zlib';

/**
 * UN ZIP QUE NO REVIENTA LA MEMORIA (ZIP-*, 2026-10-04)
 *
 * Un `.docx` es un zip. El plan de evaluación se importa desde Word con un tope
 * de 2 MB, pero 2 MB comprimidos pueden ser gigabytes al abrirlos (una «bomba
 * zip»), y `mammoth` lo descomprime entero en memoria: un solo archivo así
 * tumba el proceso que atiende a todos los liceos.
 *
 * Esto lo revisa ANTES, descomprimiendo de verdad cada entrada con un tope (no
 * fiándose de los tamaños que el zip dice tener, que pueden mentir):
 *   - más de `maxEntradas` archivos dentro → fuera;
 *   - en total más de `maxTotal` bytes al abrirlo → fuera (y se corta en el
 *     acto: `maxOutputLength`, sin llegar a reservar la memoria);
 *   - ZIP64, cifrado o un método que no sea guardado/deflate → fuera (un
 *     `.docx` de verdad no los usa).
 */

export class ZipPeligroso extends Error {}

const FIRMA_FIN = 0x06054b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;

export function revisarZip(zip: Buffer, { maxTotal = 30 * 1024 * 1024, maxEntradas = 1000 } = {}): void {
    // El final del directorio central: en los últimos 22 + 65535 bytes.
    let fin = -1;
    for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
        if (zip.readUInt32LE(i) === FIRMA_FIN) {
            fin = i;
            break;
        }
    }
    if (fin < 0) throw new ZipPeligroso('No es un zip válido');
    const entradas = zip.readUInt16LE(fin + 10);
    const inicioCentral = zip.readUInt32LE(fin + 16);
    if (entradas > maxEntradas) throw new ZipPeligroso(`Demasiados archivos dentro (${entradas})`);
    if (inicioCentral === 0xffffffff || entradas === 0xffff) throw new ZipPeligroso('ZIP64 no se admite');

    let p = inicioCentral;
    let total = 0;
    for (let n = 0; n < entradas; n++) {
        if (p + 46 > zip.length || zip.readUInt32LE(p) !== FIRMA_CENTRAL) throw new ZipPeligroso('Directorio del zip dañado');
        const banderas = zip.readUInt16LE(p + 8);
        const metodo = zip.readUInt16LE(p + 10);
        const comprimido = zip.readUInt32LE(p + 20);
        const nombreLen = zip.readUInt16LE(p + 28);
        const extraLen = zip.readUInt16LE(p + 30);
        const comentarioLen = zip.readUInt16LE(p + 32);
        const local = zip.readUInt32LE(p + 42);
        if (banderas & 0x1) throw new ZipPeligroso('Zip cifrado');
        if (comprimido === 0xffffffff || local === 0xffffffff) throw new ZipPeligroso('ZIP64 no se admite');
        if (local + 30 > zip.length || zip.readUInt32LE(local) !== FIRMA_LOCAL) throw new ZipPeligroso('Entrada del zip dañada');
        const datos = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
        if (datos + comprimido > zip.length) throw new ZipPeligroso('Entrada del zip cortada');
        const trozo = zip.subarray(datos, datos + comprimido);

        const queda = maxTotal - total;
        if (metodo === 0) {
            total += trozo.length;
        } else if (metodo === 8) {
            try {
                total += inflateRawSync(trozo, { maxOutputLength: queda + 1 }).length;
            } catch (e: any) {
                if (e?.code === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError) {
                    throw new ZipPeligroso('Al abrirlo ocupa demasiado (posible bomba zip)');
                }
                throw new ZipPeligroso('Entrada del zip dañada');
            }
        } else {
            throw new ZipPeligroso(`Método de compresión no admitido (${metodo})`);
        }
        if (total > maxTotal) throw new ZipPeligroso('Al abrirlo ocupa demasiado (posible bomba zip)');
        p += 46 + nombreLen + extraLen + comentarioLen;
    }
}
