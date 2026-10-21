import { createCipheriv, createDecipheriv, createPublicKey, createPrivateKey, publicEncrypt, privateDecrypt, randomBytes, constants } from 'crypto';
import { createReadStream, createWriteStream, existsSync, openSync, readSync, closeSync, statSync, readFileSync } from 'fs';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';

/**
 * LOS RESPALDOS SALEN DEL SERVIDOR CIFRADOS (datos de menores, 2026-10-05)
 *
 * Un respaldo lleva las cédulas, las notas, la dirección y la foto de niños.
 * La copia de fuera (R2/S3) vive en una empresa ajena: si alguien lee ese
 * almacén, se lleva todo. Por eso sale cifrada con la **llave pública** del
 * dueño (`RESPALDO_LLAVE_PUBLICA`). El servidor puede cifrar pero NO
 * descifrar: la llave privada no está en el servidor, la guarda el dueño (si
 * alguien entra al servidor, tampoco abre las copias de fuera).
 *
 * Formato: «GESTIEDU-RESPALDO-1\n», el largo (2 bytes) y la llave AES cifrada
 * con RSA-OAEP-SHA256, el IV (12), el contenido en AES-256-GCM y la etiqueta
 * (16) al final. La etiqueta hace que un archivo tocado no se descifre.
 *
 * Crear el par de llaves, en el ordenador del dueño (NO en el servidor):
 *
 *   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out respaldos-privada.pem
 *   openssl pkey -in respaldos-privada.pem -pubout -out respaldos-publica.pem
 *
 * Descifrar uno: `npm run respaldo:descifrar -- <archivo.cifrado> <privada.pem>`.
 */

const MAGIA = Buffer.from('GESTIEDU-RESPALDO-1\n');
const IV = 12;
const ETIQUETA = 16;

/** La llave pública: el PEM en la variable, o la ruta a un archivo con él. */
export function llavePublicaDeRespaldos(env: NodeJS.ProcessEnv = process.env): string | null {
    const v = env.RESPALDO_LLAVE_PUBLICA?.trim();
    if (!v) return null;
    const pem = v.startsWith('-----BEGIN') ? v.replace(/\\n/g, '\n') : existsSync(v) ? readFileSync(v, 'utf8') : null;
    if (!pem) throw new Error('RESPALDO_LLAVE_PUBLICA no es una llave ni un archivo que exista');
    createPublicKey(pem); // falla aquí, con su motivo, si no es una llave pública válida
    return pem;
}

export async function cifrarArchivo(origen: string, destino: string, llavePublica: string): Promise<void> {
    const clave = randomBytes(32);
    const iv = randomBytes(IV);
    const claveCifrada = publicEncrypt({ key: llavePublica, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, clave);
    const largo = Buffer.alloc(2);
    largo.writeUInt16BE(claveCifrada.length);

    const salida = createWriteStream(destino);
    salida.write(Buffer.concat([MAGIA, largo, claveCifrada, iv]));
    const cifra = createCipheriv('aes-256-gcm', clave, iv);
    // La etiqueta solo existe cuando la cifra termina: va en el último trozo.
    const conEtiqueta = new Transform({
        transform: (trozo, _codif, listo) => listo(null, trozo),
        flush: (listo) => listo(null, cifra.getAuthTag()),
    });
    await pipeline(createReadStream(origen), cifra, conEtiqueta, salida);
}

export async function descifrarArchivo(origen: string, destino: string, llavePrivada: string): Promise<void> {
    const total = statSync(origen).size;
    const fd = openSync(origen, 'r');
    let cabecera: Buffer;
    let etiqueta: Buffer;
    try {
        cabecera = Buffer.alloc(Math.min(total, MAGIA.length + 2 + 1024 + IV));
        readSync(fd, cabecera, 0, cabecera.length, 0);
        etiqueta = Buffer.alloc(ETIQUETA);
        readSync(fd, etiqueta, 0, ETIQUETA, total - ETIQUETA);
    } finally {
        closeSync(fd);
    }
    if (!cabecera.subarray(0, MAGIA.length).equals(MAGIA)) throw new Error('No es un respaldo cifrado de Gestiedu');
    const largo = cabecera.readUInt16BE(MAGIA.length);
    const inicioClave = MAGIA.length + 2;
    const clave = privateDecrypt(
        { key: createPrivateKey(llavePrivada), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        cabecera.subarray(inicioClave, inicioClave + largo)
    );
    const iv = cabecera.subarray(inicioClave + largo, inicioClave + largo + IV);
    const desde = inicioClave + largo + IV;

    const descifra = createDecipheriv('aes-256-gcm', clave, iv);
    descifra.setAuthTag(etiqueta);
    // Si el archivo se tocó, `final()` falla y el destino queda a medias: quien
    // llama lo borra (ver el guion de descifrar).
    await pipeline(createReadStream(origen, { start: desde, end: total - ETIQUETA - 1 }), descifra, createWriteStream(destino));
}
