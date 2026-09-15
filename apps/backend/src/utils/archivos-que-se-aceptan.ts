/**
 * QUÉ ARCHIVOS SE ACEPTAN, Y POR QUÉ SE MIRA EL CONTENIDO
 *
 * El sistema recibe imágenes (el logo del liceo, su ícono) y las guarda en una
 * carpeta que **se sirve públicamente**. Antes se guardaban sin mirar nada:
 *
 *     const ext = path.extname(filename);   // la extensión la ponía el usuario
 *     fs.writeFileSync(filepath, buffer);   // se escribía tal cual
 *
 * Con eso, quien pudiera subir el logo podía dejar colgada en el dominio del
 * sistema una página HTML cualquiera, o un SVG con instrucciones dentro. Una
 * dirección del propio liceo sirviendo una página del atacante es exactamente lo
 * que se usa para engañar a la gente: el candado y el dominio son los de verdad.
 *
 * ─── POR QUÉ NO BASTA CON MIRAR EL TIPO QUE DICE EL NAVEGADOR ────────────────
 *
 * El tipo (`Content-Type`) lo manda quien sube el archivo, y se puede escribir a
 * mano. Decir "es una imagen PNG" no cuesta nada. Por eso aquí se miran **los
 * primeros bytes del archivo**, que son los que de verdad dicen qué es: una PNG
 * de verdad empieza siempre igual, y eso no se puede fingir sin que deje de ser
 * una PNG.
 *
 * ─── EL SVG NO ENTRA, A PROPÓSITO ────────────────────────────────────────────
 *
 * Un SVG es una imagen, sí, pero por dentro es texto que puede llevar
 * instrucciones que el navegador ejecuta. Servido desde el dominio del sistema,
 * es una puerta. Si algún día hace falta, se acepta pero limpiándolo antes.
 */

/** Lo máximo que puede pesar una imagen del liceo. */
export const PESO_MAXIMO_IMAGEN = 2 * 1024 * 1024; // 2 MB

interface TipoDeImagen {
    extension: string;
    /** Los primeros bytes que tiene siempre este formato. */
    firma: number[];
    /** Desde qué posición empieza la firma. */
    desde?: number;
}

/**
 * Las firmas de cada formato. Son los bytes con los que empieza el archivo de
 * verdad, y no dependen de cómo se llame ni de lo que diga el navegador.
 */
const IMAGENES_ACEPTADAS: TipoDeImagen[] = [
    { extension: '.png', firma: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { extension: '.jpg', firma: [0xff, 0xd8, 0xff] },
    { extension: '.gif', firma: [0x47, 0x49, 0x46, 0x38] }, // GIF8
    { extension: '.webp', firma: [0x57, 0x45, 0x42, 0x50], desde: 8 }, // "WEBP" tras "RIFF????"
    { extension: '.ico', firma: [0x00, 0x00, 0x01, 0x00] },
];

function empiezaPor(buffer: Buffer, firma: number[], desde = 0): boolean {
    if (buffer.length < desde + firma.length) return false;
    return firma.every((byte, i) => buffer[desde + i] === byte);
}

export interface Veredicto {
    aceptada: boolean;
    /** La extensión que le corresponde según su contenido, no según su nombre. */
    extension?: string;
    motivo?: string;
}

/**
 * Decide si un archivo subido es una imagen aceptable, mirando su contenido.
 *
 * Devuelve la extensión **que le toca por lo que es**, no la que traía en el
 * nombre. Así un archivo llamado `logo.html` que de verdad sea una PNG se guarda
 * como `.png`, y uno llamado `logo.png` que por dentro sea HTML se rechaza.
 */
export function revisarImagen(buffer: Buffer, nombreOriginal?: string): Veredicto {
    if (!buffer || buffer.length === 0) {
        return { aceptada: false, motivo: 'El archivo llegó vacío' };
    }

    if (buffer.length > PESO_MAXIMO_IMAGEN) {
        const mb = (PESO_MAXIMO_IMAGEN / 1024 / 1024).toFixed(0);
        return { aceptada: false, motivo: `La imagen no puede pesar más de ${mb} MB` };
    }

    const tipo = IMAGENES_ACEPTADAS.find((t) => empiezaPor(buffer, t.firma, t.desde ?? 0));

    if (!tipo) {
        return {
            aceptada: false,
            motivo:
                'El archivo no es una imagen válida. Se aceptan PNG, JPG, GIF, WEBP e ICO. ' +
                (nombreOriginal ? `Se recibió «${nombreOriginal}».` : ''),
        };
    }

    return { aceptada: true, extension: tipo.extension };
}
