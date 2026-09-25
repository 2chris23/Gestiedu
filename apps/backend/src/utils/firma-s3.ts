import { createHash, createHmac } from 'crypto';

/**
 * LA FIRMA DE UNA PETICIÓN A S3 (Y A CLOUDFLARE R2, QUE HABLA LO MISMO)
 *
 * Para sacar los respaldos del servidor hace falta subirlos a un almacén de
 * fuera. S3 y R2 piden cada petición firmada con «AWS Signature Version 4».
 * Se hace aquí a mano, en unas decenas de líneas, en vez de meter el SDK
 * entero de Amazon (varios megas) para un único PUT al día.
 *
 * Que la firma está bien no se supone: `firma-s3.test.ts` la compara con el
 * ejemplo que publica Amazon en su documentación, carácter a carácter.
 */

export interface Credenciales {
    accessKeyId: string;
    secretAccessKey: string;
}

export interface PeticionAFirmar {
    metodo: string;
    url: URL;
    /** Cabeceras que se firman, además de host, x-amz-date y x-amz-content-sha256. */
    cabeceras?: Record<string, string>;
    /** sha256 del cuerpo en hexadecimal (el de un cuerpo vacío si no hay). */
    resumenDelCuerpo: string;
    region: string;
    servicio?: string;
    cuando?: Date;
}

export const RESUMEN_VACIO = createHash('sha256').update('').digest('hex');

const hmac = (clave: Buffer | string, texto: string) => createHmac('sha256', clave).update(texto, 'utf8').digest();
const sha256 = (texto: string) => createHash('sha256').update(texto, 'utf8').digest('hex');

/** RFC 3986, como la quiere S3: cada tramo del camino por separado, sin tocar las barras. */
function caminoCanonico(pathname: string): string {
    return pathname
        .split('/')
        .map((tramo) =>
            encodeURIComponent(decodeURIComponent(tramo)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
        )
        .join('/');
}

function consultaCanonica(url: URL): string {
    return [...url.searchParams.entries()]
        .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
        .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
}

/** Devuelve todas las cabeceras que hay que mandar, `Authorization` incluida. */
export function firmar(peticion: PeticionAFirmar, credenciales: Credenciales): Record<string, string> {
    const cuando = peticion.cuando ?? new Date();
    const amzDate = cuando.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20130524T000000Z
    const dia = amzDate.slice(0, 8);
    const servicio = peticion.servicio ?? 's3';

    const cabeceras: Record<string, string> = {
        host: peticion.url.host,
        'x-amz-content-sha256': peticion.resumenDelCuerpo,
        'x-amz-date': amzDate,
    };
    for (const [k, v] of Object.entries(peticion.cabeceras ?? {})) cabeceras[k.toLowerCase()] = v;

    const nombres = Object.keys(cabeceras).sort();
    const canonicas = nombres.map((n) => `${n}:${String(cabeceras[n]).trim().replace(/\s+/g, ' ')}\n`).join('');
    const firmadas = nombres.join(';');

    const peticionCanonica = [
        peticion.metodo.toUpperCase(),
        caminoCanonico(peticion.url.pathname),
        consultaCanonica(peticion.url),
        canonicas,
        firmadas,
        peticion.resumenDelCuerpo,
    ].join('\n');

    const ambito = `${dia}/${peticion.region}/${servicio}/aws4_request`;
    const aFirmar = ['AWS4-HMAC-SHA256', amzDate, ambito, sha256(peticionCanonica)].join('\n');

    const llave = hmac(hmac(hmac(hmac(`AWS4${credenciales.secretAccessKey}`, dia), peticion.region), servicio), 'aws4_request');
    const firma = createHmac('sha256', llave).update(aFirmar, 'utf8').digest('hex');

    const { host: _host, ...resto } = cabeceras;
    return {
        ...resto,
        authorization: `AWS4-HMAC-SHA256 Credential=${credenciales.accessKeyId}/${ambito}, SignedHeaders=${firmadas}, Signature=${firma}`,
    };
}
