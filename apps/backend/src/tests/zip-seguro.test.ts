import JSZip from 'jszip';
import { revisarZip, ZipPeligroso } from '../utils/zip-seguro';

/**
 * UN ZIP QUE NO REVIENTA LA MEMORIA (ZIP-01…04, 2026-10-04)
 *
 * El plan se importa desde un `.docx` (un zip). Uno de 60 KB que al abrirlo
 * ocupa 60 MB —o gigabytes— tumbaba el proceso: mammoth lo abre entero.
 */
const zipDe = async (archivos: Record<string, Uint8Array | string>) => {
    const z = new JSZip();
    for (const [nombre, contenido] of Object.entries(archivos)) z.file(nombre, contenido);
    return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
};

describe('Un zip que no revienta la memoria (ZIP)', () => {
    it('ZIP-01: un .docx normal pasa', async () => {
        const docx = await zipDe({
            '[Content_Types].xml': '<Types/>',
            'word/document.xml': `<w:document>${'<w:p>Tema generador</w:p>'.repeat(2000)}</w:document>`,
        });
        expect(() => revisarZip(docx)).not.toThrow();
    });

    it('ZIP-02: una bomba (pequeña comprimida, enorme abierta) se rechaza sin abrirla entera', async () => {
        const bomba = await zipDe({ 'word/document.xml': new Uint8Array(60 * 1024 * 1024) });
        expect(bomba.length).toBeLessThan(200 * 1024);
        expect(() => revisarZip(bomba)).toThrow(ZipPeligroso);
    }, 60000);

    it('ZIP-03: demasiados archivos dentro se rechaza', async () => {
        const muchos: Record<string, string> = {};
        for (let i = 0; i < 1200; i++) muchos[`x/${i}.xml`] = 'a';
        expect(() => revisarZip(Buffer.from('esto no es un zip, pero mide más de 22 bytes'))).toThrow(ZipPeligroso);
        const zip = await zipDe(muchos);
        expect(() => revisarZip(zip)).toThrow(/Demasiados/);
    });

    it('ZIP-04: la suma de muchas entradas medianas también cuenta', async () => {
        const archivos: Record<string, Uint8Array> = {};
        for (let i = 0; i < 8; i++) archivos[`word/media/${i}.bin`] = new Uint8Array(5 * 1024 * 1024);
        const zip = await zipDe(archivos);
        expect(() => revisarZip(zip)).toThrow(ZipPeligroso);
    }, 60000);
});
