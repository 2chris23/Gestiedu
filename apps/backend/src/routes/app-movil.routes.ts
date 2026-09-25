import { FastifyInstance } from 'fastify';
import { createReadStream } from 'fs';
import { readFile, stat } from 'fs/promises';
import path from 'path';

/**
 * LA VERSIÓN NUEVA DE LA APP, DESDE LA PROPIA APP
 *
 * La app enseña el sistema que vive en el servidor, así que casi todo lo que
 * cambia se ve sin instalar nada. Pero lo que es del propio teléfono —el color
 * de la franja del reloj, guardar la sesión al salir, entrar con la huella— va
 * DENTRO de la APK, y para eso hay que instalar la nueva. Pedirle a cada
 * alumno que la busque en una página y la instale a mano no funciona.
 *
 * La app pregunta aquí al abrirse (`/version`): si hay una más nueva que la
 * suya, lo dice en una ventana y la baja de aquí mismo (`/apk`). Android pide
 * confirmar la instalación y comprueba que la firma sea la misma que la de la
 * app instalada: una APK cambiada por otro, firmada con otra llave, no se
 * instala encima.
 *
 * ─── DE DÓNDE SALEN ─────────────────────────────────────────────────────────
 *
 * De una carpeta (`APP_MOVIL_DIR`), un par de archivos por app:
 * `<paquete>.apk` y `<paquete>.json` con su número de versión y su huella. Los
 * deja ahí `apps/movil/scripts/publicar-apk.mjs`. Son ficheros de la
 * publicación, como la propia web, no información de ningún liceo.
 *
 * Google Play no permite que una app se actualice sola por fuera de la tienda:
 * la que se publique allí se actualiza por Play (ver `docs/APP-MOVIL.md`).
 */

/** El nombre de una app Android: `com.gestiedu.sanmiguel`. Nada de barras ni puntos sueltos. */
const PAQUETE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function laCarpetaDeLasApps(): string {
    return process.env.APP_MOVIL_DIR || path.resolve(process.cwd(), '..', '..', 'apks');
}

export interface FichaDeLaApp {
    versionCode: number;
    versionName: string;
    sha256: string;
    tamano: number;
    publicada: string;
    notas?: string;
}

function esUnPaquete(paquete: string): boolean {
    return paquete.length <= 100 && PAQUETE.test(paquete);
}

async function leerLaFicha(paquete: string): Promise<FichaDeLaApp | null> {
    try {
        const crudo = JSON.parse(await readFile(path.join(laCarpetaDeLasApps(), `${paquete}.json`), 'utf-8'));
        const bien =
            Number.isInteger(crudo?.versionCode) &&
            crudo.versionCode > 0 &&
            typeof crudo.versionName === 'string' &&
            /^[a-f0-9]{64}$/.test(crudo.sha256) &&
            Number.isInteger(crudo.tamano);
        if (!bien) return null;
        return {
            versionCode: crudo.versionCode,
            versionName: crudo.versionName,
            sha256: crudo.sha256,
            tamano: crudo.tamano,
            publicada: String(crudo.publicada ?? ''),
            ...(typeof crudo.notas === 'string' ? { notas: crudo.notas } : {}),
        };
    } catch {
        return null;
    }
}

export async function appMovilRoutes(fastify: FastifyInstance) {
    fastify.get<{ Params: { paquete: string } }>('/:paquete/version', async (request, reply) => {
        const { paquete } = request.params;
        if (!esUnPaquete(paquete)) {
            return reply.status(400).send({ error: 'Ese no es el nombre de una app', code: 'PAQUETE_INVALIDO' });
        }
        const ficha = await leerLaFicha(paquete);
        if (!ficha) {
            return reply.status(404).send({ error: 'No hay ninguna versión publicada de esa app', code: 'NOT_FOUND' });
        }
        return reply
            .header('Cache-Control', 'no-store')
            .send({ ...ficha, url: `/api/app-movil/${paquete}/apk` });
    });

    fastify.get<{ Params: { paquete: string } }>('/:paquete/apk', async (request, reply) => {
        const { paquete } = request.params;
        if (!esUnPaquete(paquete)) {
            return reply.status(400).send({ error: 'Ese no es el nombre de una app', code: 'PAQUETE_INVALIDO' });
        }
        const archivo = path.join(laCarpetaDeLasApps(), `${paquete}.apk`);
        const datos = await stat(archivo).catch(() => null);
        if (!datos?.isFile()) {
            return reply.status(404).send({ error: 'No hay ninguna versión publicada de esa app', code: 'NOT_FOUND' });
        }
        return reply
            .header('Content-Type', 'application/vnd.android.package-archive')
            .header('Content-Length', String(datos.size))
            .header('Content-Disposition', `attachment; filename="${paquete}.apk"`)
            .header('Cache-Control', 'no-cache')
            .header('X-Content-Type-Options', 'nosniff')
            .send(createReadStream(archivo));
    });
}

export default appMovilRoutes;
