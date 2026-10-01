import sharp from 'sharp';
import { createHash } from 'crypto';
import { join, normalize, sep } from 'path';
import { readFile } from 'fs/promises';
import { leerArchivoDelLiceo, partesDeLaDireccion } from './archivos-del-liceo.service';

/**
 * EL ICONO DE LA APP DEL LICEO
 *
 * El logo que sube un liceo es apaisado casi siempre —una banda con el escudo y
 * el nombre al lado—, y el icono de una app es un CUADRADO que además Android
 * recorta con la forma del teléfono: círculo, cuadrado redondeado o gota. Si se
 * le da el logo tal cual, el teléfono lo estira o le come los bordes, y el
 * alumno acaba con un icono con media letra.
 *
 * Aquí se dibuja uno nuevo: el logo entero, sin deformar, centrado dentro del
 * 60 % del cuadro —la zona que ningún recorte se lleva— sobre el color del
 * liceo. Lo que se sirve son píxeles recién dibujados, así que un archivo que
 * se hiciera pasar por imagen no sobrevive: de él solo quedan los colores.
 */

/** 40 megapíxeles: una "bomba de descompresión" no pasa de aquí. */
const PIXELES_MAXIMOS = 40_000_000;
/** Lo que ocupa el dibujo dentro del cuadro, dejando el margen que se recorta. */
const PARTE_SEGURA = 0.6;

const RAIZ_DE_SUBIDAS = join(__dirname, '../../uploads');

export const TAMANOS_DE_ICONO = [192, 512] as const;
export type TamanoDeIcono = (typeof TAMANOS_DE_ICONO)[number];

export class IconoNoDisponible extends Error {
    statusCode = 404;
    code = 'ICON_NOT_AVAILABLE';
}

/**
 * La dirección del logo viene de la base, pero se trata como si viniera de la
 * calle: solo se abre un archivo DENTRO de `uploads`. Sin esto, un `..` en ese
 * campo leería cualquier archivo del servidor.
 */
async function elArchivoDelLogo(logo: string): Promise<Buffer> {
    // Los logos nuevos viven en la base (ver archivos-del-liceo.service.ts).
    const enLaBase = partesDeLaDireccion(logo);
    if (enLaBase) {
        const archivo = await leerArchivoDelLiceo(enLaBase.instituteId, enLaBase.nombre);
        if (!archivo) throw new IconoNoDisponible('El logo del liceo ya no está');
        return archivo.datos;
    }

    if (!logo.startsWith('/uploads/')) throw new IconoNoDisponible('El liceo no tiene logo propio');

    const dentro = normalize(join(RAIZ_DE_SUBIDAS, logo.slice('/uploads/'.length)));
    if (!dentro.startsWith(RAIZ_DE_SUBIDAS + sep)) {
        throw new IconoNoDisponible('Ruta de logo no válida');
    }

    try {
        return await readFile(dentro);
    } catch {
        throw new IconoNoDisponible('El logo del liceo ya no está');
    }
}

const colorSeguro = (valor: string | null | undefined) =>
    valor && /^#[0-9a-f]{6}$/i.test(valor) ? valor : '#2563EB';

export async function dibujarIconoDelLiceo(
    logo: string | null | undefined,
    color: string | null | undefined,
    tamano: TamanoDeIcono
): Promise<{ data: Buffer; version: string }> {
    if (!logo) throw new IconoNoDisponible('El liceo no tiene logo propio');

    const original = await elArchivoDelLogo(logo);
    const lado = Math.round(tamano * PARTE_SEGURA);

    let dibujo: Buffer;
    try {
        dibujo = await sharp(original, { limitInputPixels: PIXELES_MAXIMOS, failOn: 'error' })
            // `contain` con fondo transparente: el logo entra entero y sin
            // deformarse, que es lo contrario de lo que hace `cover`.
            .resize(lado, lado, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
    } catch {
        throw new IconoNoDisponible('El logo del liceo no se puede abrir');
    }

    const margen = Math.round((tamano - lado) / 2);
    const data = await sharp({
        create: { width: tamano, height: tamano, channels: 4, background: colorSeguro(color) },
    })
        .composite([{ input: dibujo, top: margen, left: margen }])
        .png({ compressionLevel: 9 })
        .toBuffer();

    return { data, version: createHash('sha256').update(data).digest('hex').slice(0, 12) };
}
