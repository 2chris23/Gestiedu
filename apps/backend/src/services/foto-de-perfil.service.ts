import sharp from 'sharp';
import { createHash } from 'crypto';

/**
 * LA FOTO DE PERFIL, COMPRIMIDA AL EXTREMO
 *
 * Una foto de teléfono pesa 3–5 MB. Mostrada en un círculo de 40 px eso es
 * tirar datos: con 1.000 alumnos serían 4 GB en la base y una lista de sección
 * que tarda en cargar por el plan de datos de cada representante.
 *
 * Lo que se guarda es SIEMPRE una imagen nueva dibujada aquí:
 *
 *   · 256 × 256, recortada al centro — el doble de lo que ocupa el círculo más
 *     grande de la app, para que se vea nítida en pantallas densas;
 *   · WebP calidad 70 — ~15 KB, un 99,6 % menos que el original;
 *   · girada según el EXIF y **sin** EXIF después: la foto de un teléfono lleva
 *     dentro la ubicación GPS de donde se tomó, que suele ser la casa del alumno.
 *
 * Redibujarla también es la defensa: un archivo que se hace pasar por imagen y
 * esconde otra cosa no sobrevive, porque de él solo se conservan los píxeles.
 *
 * Lo que NO se acepta aunque sharp lo sepa abrir: SVG (es código, no píxeles),
 * GIF, TIFF, PDF… Solo los formatos de una foto normal.
 */

export const LADO_DE_LA_FOTO = 256;
export const CALIDAD_WEBP = 70;
/** Lo máximo que se acepta subir. El teléfono ya la manda reducida (~100 KB). */
export const PESO_MAXIMO_DE_SUBIDA = 5 * 1024 * 1024;
/**
 * Una "bomba de descompresión" es un PNG de pocos KB que al abrirlo son
 * 50.000 × 50.000 píxeles y se come la memoria del servidor. 40 megapíxeles
 * cubren cualquier cámara de teléfono real.
 */
const PIXELES_MAXIMOS = 40_000_000;

const FORMATOS_DE_FOTO = new Set(['jpeg', 'png', 'webp', 'avif', 'heif']);

export class FotoNoValida extends Error {
    statusCode = 400;
    code = 'INVALID_PHOTO';
}

export async function comprimirFoto(original: Buffer): Promise<{ data: Buffer; version: string; size: number }> {
    if (!original?.length) throw new FotoNoValida('No llegó ninguna imagen');
    if (original.length > PESO_MAXIMO_DE_SUBIDA) throw new FotoNoValida('La imagen pesa más de 5 MB');

    let formato: string | undefined;
    try {
        formato = (await sharp(original, { limitInputPixels: PIXELES_MAXIMOS }).metadata()).format;
    } catch {
        throw new FotoNoValida('El archivo no es una imagen que se pueda abrir');
    }
    if (!formato || !FORMATOS_DE_FOTO.has(formato)) {
        throw new FotoNoValida('Solo se aceptan fotos JPG, PNG, WebP o HEIC');
    }

    let data: Buffer;
    try {
        data = await sharp(original, { limitInputPixels: PIXELES_MAXIMOS, failOn: 'error' })
            .rotate() // según el EXIF, antes de tirarlo
            .resize(LADO_DE_LA_FOTO, LADO_DE_LA_FOTO, { fit: 'cover', position: 'attention' })
            .flatten({ background: '#ffffff' }) // una PNG transparente no sale con fondo negro
            .webp({ quality: CALIDAD_WEBP, effort: 4, smartSubsample: true })
            .toBuffer();
    } catch {
        throw new FotoNoValida('La imagen está dañada o es demasiado grande');
    }

    const version = createHash('sha256').update(data).digest('hex').slice(0, 12);
    return { data, version, size: data.length };
}

/** Lo que va en `User.avatar`: la dirección con la huella, para que el navegador no enseñe la vieja. */
export const direccionDeLaFoto = (userId: string, version: string) =>
    `/users/${encodeURIComponent(userId)}/photo?v=${version}`;
