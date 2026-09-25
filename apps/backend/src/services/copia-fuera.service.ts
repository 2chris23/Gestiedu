import { createHash } from 'crypto';
import { createReadStream, statSync } from 'fs';
import path from 'path';
import { firmar } from '../utils/firma-s3';

/**
 * UNA COPIA DE CADA RESPALDO, FUERA DEL SERVIDOR
 *
 * Un respaldo que vive en el mismo disco que la base se pierde con ella: si
 * el servidor se quema, se va todo junto. Con estas variables, cada respaldo
 * se sube además a un almacén de fuera (Cloudflare R2, Amazon S3 o cualquiera
 * que hable S3):
 *
 *   BACKUP_S3_ENDPOINT           https://<cuenta>.r2.cloudflarestorage.com
 *   BACKUP_S3_BUCKET             gestiedu-respaldos
 *   BACKUP_S3_ACCESS_KEY_ID      …
 *   BACKUP_S3_SECRET_ACCESS_KEY  …
 *   BACKUP_S3_REGION             auto   (R2); us-east-1, etc. (S3)
 *
 * Sin ellas no se sube nada y el respaldo se queda en el disco, como antes.
 */

export interface DestinoDeFuera {
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
}

export function destinoDeFuera(env: NodeJS.ProcessEnv = process.env): DestinoDeFuera | null {
    const endpoint = env.BACKUP_S3_ENDPOINT?.trim();
    const bucket = env.BACKUP_S3_BUCKET?.trim();
    const accessKeyId = env.BACKUP_S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = env.BACKUP_S3_SECRET_ACCESS_KEY?.trim();
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
    return { endpoint, bucket, accessKeyId, secretAccessKey, region: env.BACKUP_S3_REGION?.trim() || 'auto' };
}

function resumenDelArchivo(archivo: string): Promise<string> {
    return new Promise((resolver, rechazar) => {
        const h = createHash('sha256');
        createReadStream(archivo)
            .on('data', (trozo) => h.update(trozo))
            .on('end', () => resolver(h.digest('hex')))
            .on('error', rechazar);
    });
}

/** Sube un archivo. La clave es su nombre, dentro de una carpeta por liceo. */
export async function subirAFuera(archivo: string, slug: string, destino: DestinoDeFuera): Promise<string> {
    const clave = `${slug}/${path.basename(archivo)}`;
    const url = new URL(`${destino.endpoint.replace(/\/+$/, '')}/${destino.bucket}/${clave}`);
    const bytes = statSync(archivo).size;
    const resumen = await resumenDelArchivo(archivo);

    const cabeceras = firmar(
        {
            metodo: 'PUT',
            url,
            cabeceras: { 'content-length': String(bytes), 'content-type': 'application/octet-stream' },
            resumenDelCuerpo: resumen,
            region: destino.region,
        },
        destino
    );

    const respuesta = await fetch(url, {
        method: 'PUT',
        headers: cabeceras,
        body: createReadStream(archivo) as any,
        // Node necesita que se diga que el cuerpo va a trozos.
        duplex: 'half',
    } as any);

    if (!respuesta.ok) {
        const detalle = (await respuesta.text().catch(() => '')).slice(0, 300);
        throw new Error(`el almacén de fuera respondió ${respuesta.status}: ${detalle}`);
    }
    return clave;
}
