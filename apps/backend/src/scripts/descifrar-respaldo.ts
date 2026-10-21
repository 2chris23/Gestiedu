/**
 * DESCIFRAR UNA COPIA DE FUERA
 *
 *   npm run respaldo:descifrar -- <archivo.dump.cifrado> <llave-privada.pem>
 *
 * Deja al lado el `.dump` de siempre, listo para `pg_restore`. Se corre en el
 * ordenador del dueño (o en el servidor nuevo tras una catástrofe), con la
 * llave privada que nunca vive en el servidor. Ver `utils/cifrar-respaldo.ts`.
 */
import { readFileSync, rmSync } from 'fs';
import { descifrarArchivo } from '../utils/cifrar-respaldo';

async function main(): Promise<number> {
    const [archivo, llave] = process.argv.slice(2);
    if (!archivo || !llave) {
        console.error('Uso: npm run respaldo:descifrar -- <archivo.cifrado> <llave-privada.pem>');
        return 1;
    }
    const destino = archivo.replace(/\.cifrado$/, '') === archivo ? `${archivo}.dump` : archivo.replace(/\.cifrado$/, '');
    try {
        await descifrarArchivo(archivo, destino, readFileSync(llave, 'utf8'));
        console.log(`Listo: ${destino}`);
        return 0;
    } catch (error) {
        // A medias no sirve y engaña: fuera.
        rmSync(destino, { force: true });
        console.error(`No se pudo descifrar (¿otra llave, o el archivo está dañado?): ${error instanceof Error ? error.message : error}`);
        return 1;
    }
}

main().then((c) => process.exit(c));
