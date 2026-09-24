import { NextRequest, NextResponse } from 'next/server';

/**
 * LA FICHA DE LA APP — Y ES LA DE CADA LICEO, NO UNA GENÉRICA
 *
 * Este archivo es lo que convierte la web en algo instalable: el teléfono lo
 * lee y de ahí saca el nombre que pondrá debajo del icono, el icono, el color
 * de la barra de estado y por qué pantalla abrir. Sin él, el navegador ni
 * ofrece instalarla, y la APK (Capacitor) tampoco tendría de dónde sacar esos
 * datos.
 *
 * Aquí manda el liceo, no la plataforma: el alumno del Liceo San Miguel
 * instala «San Miguel» con el logo de su liceo, no «GestiEdu». El liceo se
 * saca, en este orden, de la dirección (`?liceo=`), de la cookie que dejó la
 * entrada, del subdominio o de la cabecera que pone el guardián. Si no hay
 * ninguno —la portada pública—, va la ficha de la plataforma.
 *
 * `start_url` lleva el liceo a cuestas a propósito: la app instalada abre
 * SIEMPRE por el portal de su liceo. Sin eso caería en `/login` sin liceo, que
 * responde «no existe», y el usuario vería un 404 al abrir su app recién
 * instalada.
 */

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');

/** Los colores del liceo llegan como '#RRGGBB'; cualquier otra cosa se ignora. */
function colorSeguro(valor: unknown, porDefecto: string): string {
    return typeof valor === 'string' && /^#[0-9a-f]{6}$/i.test(valor) ? valor : porDefecto;
}

function elLiceoDeLaPeticion(request: NextRequest): string | null {
    const dePregunta = request.nextUrl.searchParams.get('liceo');
    if (dePregunta) return dePregunta;

    const deCabecera = request.headers.get('x-institute-slug');
    if (deCabecera) return deCabecera;

    const deCookie = request.cookies.get('institute_slug')?.value;
    if (deCookie) return deCookie;

    // sanmiguel.gestiedu.com → sanmiguel   (localhost y las IP no cuentan)
    const host = (request.headers.get('host') || '').split(':')[0];
    if (host.endsWith('.localhost')) return host.slice(0, -'.localhost'.length) || null;
    const partes = host.split('.');
    if (partes.length >= 3 && !/^\d+$/.test(partes[0])) return partes[0];

    return null;
}

async function elLiceo(slug: string) {
    try {
        const r = await fetch(`${API}/api/institutes/current/config`, {
            headers: { 'X-Institute-Slug': slug },
            cache: 'no-store',
        });
        if (!r.ok) return null;
        const { data } = await r.json();
        return data ?? null;
    } catch {
        // Si el servidor no responde, la app se instala igual con la ficha de
        // la plataforma: peor eso que no poder instalarla.
        return null;
    }
}

/**
 * Debajo del icono caben doce letras contadas. Cortar por la doceava deja
 * «Instituto Te»; se corta por palabras, y si la primera ya no cabe, entonces
 * sí por letras.
 */
function nombreCorto(nombre: string): string {
    if (nombre.length <= 12) return nombre;

    let corto = '';
    for (const palabra of nombre.split(/\s+/)) {
        if (!corto) {
            corto = palabra;
            continue;
        }
        if (`${corto} ${palabra}`.length > 12) break;
        corto = `${corto} ${palabra}`;
    }
    return (corto || nombre).slice(0, 12).trim();
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const slug = elLiceoDeLaPeticion(request);
    const liceo = slug ? await elLiceo(slug) : null;

    const nombre = (liceo?.name as string) || 'GestiEdu';
    const principal = colorSeguro(liceo?.primaryColor, '#2563EB');

    /**
     * El icono del liceo NO es su logo tal cual: el logo suele ser apaisado y
     * el teléfono lo estiraría o le comería los bordes al recortarlo. El
     * servidor lo redibuja en cuadrado sobre el color del liceo
     * (`/institutes/current/icono`). Van los primeros: si ese liceo no tiene
     * logo, esa dirección responde «no hay» y el teléfono sigue con los
     * nuestros, que están justo debajo.
     */
    const suyo = slug
        ? ([192, 512] as const).map((tam) => ({
            src: `${API}/api/institutes/current/icono?tam=${tam}&liceo=${encodeURIComponent(slug)}`,
            sizes: `${tam}x${tam}`,
            type: 'image/png',
            purpose: 'maskable' as const,
        }))
        : [];

    const manifest = {
        id: slug ? `/?liceo=${slug}` : '/',
        name: slug ? `${nombre} · GestiEdu` : 'GestiEdu',
        short_name: nombreCorto(nombre),
        description: 'El liceo en el teléfono: horario, notas, actividades y asistencia.',
        lang: 'es',
        dir: 'ltr',
        start_url: slug ? `/login?slug=${encodeURIComponent(slug)}` : '/',
        scope: '/',
        display: 'standalone',
        // 'any', no 'portrait': con 'portrait' la app instalada NO giraba
        // nunca, y el horario y el plan de evaluación piden el teléfono
        // tumbado para ver la rejilla entera (lib/girar-la-pantalla.ts).
        orientation: 'any',
        // El arranque sí es del liceo: es su momento de identificar, y es lo
        // mismo que enseña la APK (`SplashScreen.backgroundColor`).
        background_color: principal,
        /**
         * LA BARRA DE ESTADO, DEL COLOR DE LA APP
         *
         * `theme_color` es lo que pinta la franja del reloj cuando la web está
         * instalada. Iba del color del liceo, y encima de una cabecera blanca
         * eso se ve como una raya de otro color pegada arriba, no como parte de
         * la aplicación. Las apps que la gente usa a diario —Facebook,
         * WhatsApp— pintan esa franja del mismo blanco de su cabecera.
         *
         * El color del liceo identifica donde toca: el icono y el arranque. La
         * APK hace lo mismo (`color_de_la_barra_de_estado`, colors.xml).
         */
        theme_color: '#ffffff',
        categories: ['education'],
        icons: [
            ...suyo,
            { src: '/icons/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            // Android recorta el icono a la forma del teléfono: este lleva el
            // dibujo dentro de la zona segura para que no se coma el borde.
            { src: '/icons/icono-enmascarable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icono-enmascarable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };

    return NextResponse.json(manifest, {
        headers: {
            'Content-Type': 'application/manifest+json; charset=utf-8',
            // Media hora: si el liceo cambia su logo, se ve pronto sin pedirlo
            // en cada arranque.
            'Cache-Control': 'public, max-age=1800',
        },
    });
}

