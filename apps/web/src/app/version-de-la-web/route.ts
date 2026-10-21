import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * QUÉ VERSIÓN DE LA APP HAY EN EL SERVIDOR, Y SUS ARCHIVOS
 *
 * Lo pide el ayudante (`public/sw.js`, `mirarLaVersion`) al abrir la app y cada
 * media hora. Si la versión cambió, baja en segundo plano los archivos nuevos
 * (los que no tenga ya) y tira los de la anterior: como WhatsApp, la app se
 * pone al día sola, y lo nuevo ya abre sin señal aunque no se haya visitado.
 *
 * Solo nombres de archivos del compilador (`/_next/static/...`): son iguales
 * para todo el mundo y no dicen nada de nadie, igual que la propia cáscara.
 * En desarrollo no hay versión que guardar (el código cambia en cada tecla).
 */
export const dynamic = 'force-dynamic';

type Version = { id: string; archivos: string[] };
let calculada: Promise<Version | null> | null = null;

async function listar(dir: string, base: string): Promise<string[]> {
    const salida: string[] = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
        const ruta = path.join(dir, e.name);
        if (e.isDirectory()) salida.push(...(await listar(ruta, `${base}/${e.name}`)));
        else if (/\.(js|css|woff2?)$/.test(e.name)) salida.push(`${base}/${e.name}`);
    }
    return salida;
}

/**
 * Dónde está la compilación. Normalmente en `<cwd>/.next`; con `next start
 * apps/web` lanzado desde la raíz del repositorio, el directorio de trabajo es
 * la raíz y aquí salía 404: el ayudante no guardaba la cáscara entera y, sin
 * conexión, partes de la app decían «no está guardada» (PRECARGA-01/04).
 */
const DONDE_PUEDE_ESTAR = [path.join(process.cwd(), '.next'), path.join(process.cwd(), 'apps', 'web', '.next')];

async function calcular(): Promise<Version | null> {
    for (const raiz of DONDE_PUEDE_ESTAR) {
        try {
            const id = (await readFile(path.join(raiz, 'BUILD_ID'), 'utf8')).trim();
            const archivos = (await listar(path.join(raiz, 'static'), '/_next/static')).sort();
            return { id, archivos };
        } catch {
            /* la siguiente */
        }
    }
    return null;
}

export async function GET() {
    if (process.env.NODE_ENV !== 'production') {
        return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    // La compilación no cambia mientras el proceso vive: se calcula una vez.
    calculada ??= calcular();
    const version = await calculada;
    if (!version) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return Response.json(version, { headers: { 'Cache-Control': 'no-store' } });
}
