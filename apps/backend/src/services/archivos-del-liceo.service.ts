import { createHash } from 'crypto';
import { platformPrisma } from '../config/database';

/**
 * LOS ARCHIVOS DE UN LICEO (logo e icono de la pestaña), EN LA BASE
 *
 * Se guardaban en el disco del proceso (`uploads/institute/...`). Dos cosas
 * fallaban con eso, las dos medidas en el código, no supuestas:
 *
 *   · Con dos procesos detrás del repartidor, el logo lo tenía solo el
 *     proceso que lo recibió: la mitad de las veces la pantalla pedía el logo
 *     al otro y salía roto.
 *   · El respaldo nocturno guarda BASES. El disco de subidas no entraba:
 *     perdido el servidor, cada liceo volvía sin logo.
 *
 * En la base de la plataforma (tabla `archivos_de_liceo`) los ven todos los
 * procesos y entran en el respaldo (`_plataforma__<fecha>.dump`).
 *
 * Los logos que ya estaban en disco se siguen sirviendo de allí, igual que
 * antes: su dirección empieza por `/uploads/institute/`.
 */

export const PREFIJO = '/uploads/liceo/';

const TIPOS: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
};

/** Lo que puede ser un nombre: `logo-<huella>.png`. Nada de rutas ni puntos de más. */
const NOMBRE_VALIDO = /^(logo|favicon)-[a-f0-9]{16}\.(png|jpg|gif|webp|ico)$/;
const LICEO_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

export const direccionDelArchivo = (instituteId: string, nombre: string) => `${PREFIJO}${instituteId}/${nombre}`;

/**
 * Guarda el archivo y devuelve su dirección. `extension` es la que sale del
 * CONTENIDO (`revisarImagen`), nunca la del nombre que mandó quien sube.
 */
export async function guardarArchivoDelLiceo(
    instituteId: string,
    campo: 'logo' | 'favicon',
    datos: Buffer,
    extension: string
): Promise<string> {
    const tipo = TIPOS[extension];
    if (!tipo) throw new Error(`tipo de archivo no admitido: ${extension}`);

    const huella = createHash('sha256').update(datos).digest('hex').slice(0, 16);
    const nombre = `${campo}-${huella}${extension}`;

    // El mismo contenido, el mismo nombre: subirlo dos veces no duplica nada.
    await platformPrisma.archivoDeLiceo.upsert({
        where: { instituteId_nombre: { instituteId, nombre } },
        create: { instituteId, nombre, tipo, datos: new Uint8Array(datos), bytes: datos.length },
        update: {},
    });

    return direccionDelArchivo(instituteId, nombre);
}

/** El archivo de un liceo, o null si no existe o la dirección no tiene la forma de uno. */
export async function leerArchivoDelLiceo(
    instituteId: string,
    nombre: string
): Promise<{ datos: Buffer; tipo: string } | null> {
    if (!LICEO_VALIDO.test(instituteId) || !NOMBRE_VALIDO.test(nombre)) return null;
    const fila = await platformPrisma.archivoDeLiceo.findUnique({
        where: { instituteId_nombre: { instituteId, nombre } },
        select: { datos: true, tipo: true },
    });
    return fila ? { datos: Buffer.from(fila.datos), tipo: fila.tipo } : null;
}

/** `/uploads/liceo/<id>/<nombre>` → sus partes, o null si la dirección es de otra cosa. */
export function partesDeLaDireccion(direccion: string): { instituteId: string; nombre: string } | null {
    if (!direccion.startsWith(PREFIJO)) return null;
    const [instituteId, nombre, ...resto] = direccion.slice(PREFIJO.length).split('?')[0].split('/');
    if (resto.length || !instituteId || !nombre) return null;
    return { instituteId, nombre };
}
