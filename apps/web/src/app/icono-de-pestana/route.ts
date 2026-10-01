import { NextRequest, NextResponse } from 'next/server';

/**
 * EL ICONO DE LA PESTAÑA, DEL LICEO DESDE LA PRIMERA PINTADA
 *
 * El liceo sube su favicon en Configuración → Apariencia y la pestaña seguía
 * enseñando el birrete azul de la plataforma. `app/layout.tsx` declaraba
 * `/favicon.svg`, y `DynamicFavicon` añadía el del liceo DESPUÉS, contando con
 * que «el navegador se queda con el último». No es así: Chrome puntúa los
 * candidatos y un SVG le gana a un PNG sin tamaño. Quitar el de React tampoco
 * vale (ver el comentario de `DynamicFavicon`: congelaba la pantalla).
 *
 * Así que el icono que declara la página ya es el del liceo: esta dirección
 * averigua de qué liceo es la petición —igual que la ficha de la app— y
 * devuelve SU favicon. Si no tiene, o el servidor no contesta, el de la
 * plataforma.
 */

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');

function elLiceoDeLaPeticion(request: NextRequest): string | null {
    const dePregunta = request.nextUrl.searchParams.get('liceo');
    if (dePregunta) return dePregunta;

    const deCabecera = request.headers.get('x-institute-slug');
    if (deCabecera) return deCabecera;

    const deCookie = request.cookies.get('institute_slug')?.value;
    if (deCookie) return deCookie;

    const host = (request.headers.get('host') || '').split(':')[0];
    if (host.endsWith('.localhost')) return host.slice(0, -'.localhost'.length) || null;
    const partes = host.split('.');
    if (partes.length >= 3 && !/^\d+$/.test(partes[0])) return partes[0];

    return null;
}

/** Solo imágenes: si el servidor devolviera otra cosa, no se reenvía. */
const TIPOS = /^image\/(png|x-icon|vnd\.microsoft\.icon|jpeg|gif|webp|svg\+xml)$/;

function elDeLaPlataforma(request: NextRequest) {
    return NextResponse.redirect(new URL('/favicon.svg', request.url), {
        headers: { 'Cache-Control': 'no-store' },
    });
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const slug = elLiceoDeLaPeticion(request);
    if (!slug) return elDeLaPlataforma(request);

    try {
        const r = await fetch(`${API}/api/institutes/current/config`, {
            headers: { 'X-Institute-Slug': slug },
            cache: 'no-store',
        });
        if (!r.ok) return elDeLaPlataforma(request);
        const { data } = await r.json();
        const favicon: unknown = data?.favicon;
        // Solo lo que el servidor guardó él mismo: nada de ir a buscar
        // direcciones de fuera desde aquí.
        if (typeof favicon !== 'string' || !favicon.startsWith('/uploads/')) {
            return elDeLaPlataforma(request);
        }

        const archivo = await fetch(`${API}${favicon}`, { cache: 'no-store' });
        const tipo = (archivo.headers.get('content-type') || '').split(';')[0].trim();
        if (!archivo.ok || !TIPOS.test(tipo)) return elDeLaPlataforma(request);

        return new NextResponse(archivo.body, {
            headers: {
                'Content-Type': tipo,
                // Cinco minutos: si el liceo cambia el icono, se ve pronto. Y
                // `private`: la misma dirección da un icono distinto según el
                // liceo, así que un intermediario no debe guardarla para todos.
                'Cache-Control': 'private, max-age=300',
                Vary: 'Cookie, Host',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch {
        return elDeLaPlataforma(request);
    }
}
