/**
 * LA FOTO SE ACHICA EN EL TELÉFONO, ANTES DE SUBIRLA
 *
 * El servidor la comprime igual (256 px, WebP, ~15 KB), pero subir la original
 * son 3–5 MB por los datos móviles del liceo. Aquí se recorta cuadrada y se
 * baja a 512 px: sale de unos 60–120 KB, y el servidor ya no recibe nada grande.
 *
 * `imageOrientation: 'from-image'` endereza la foto según como se sostuvo el
 * teléfono; sin eso algunas salían acostadas. Y como se redibuja en un lienzo,
 * lo que el archivo traía por dentro (la ubicación GPS) ya no viaja.
 *
 * Las fotos HEIC del iPhone: Safari las abre y aquí salen como JPEG/WebP.
 */

const LADO = 512;

export async function comprimirFotoEnElDispositivo(archivo: File): Promise<Blob> {
    if (!archivo.type.startsWith('image/') && !/\.(heic|heif)$/i.test(archivo.name)) {
        throw new Error('Elige una foto');
    }

    let imagen: ImageBitmap;
    try {
        imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    } catch {
        throw new Error('Este navegador no puede abrir esa foto. Prueba con JPG o PNG.');
    }

    const lado = Math.min(imagen.width, imagen.height);
    const salida = Math.min(LADO, lado);
    const lienzo = document.createElement('canvas');
    lienzo.width = salida;
    lienzo.height = salida;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la foto');

    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
        imagen,
        (imagen.width - lado) / 2,
        (imagen.height - lado) / 2,
        lado,
        lado,
        0,
        0,
        salida,
        salida
    );
    imagen.close();

    const aBlob = (tipo: string) =>
        new Promise<Blob | null>((ok) => lienzo.toBlob((b) => ok(b), tipo, 0.85));

    // WebP donde se puede; Safari viejo no lo genera y devuelve PNG, así que se
    // comprueba el tipo y se cae a JPEG.
    const webp = await aBlob('image/webp');
    if (webp && webp.type === 'image/webp') return webp;
    const jpeg = await aBlob('image/jpeg');
    if (!jpeg) throw new Error('No se pudo preparar la foto');
    return jpeg;
}

export function pesoLegible(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
