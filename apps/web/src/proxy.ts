import { NextRequest, NextResponse } from 'next/server';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password'];
const API_ROUTES_PREFIX = '/api/';
const SUPERADMIN_LOGIN = '/superadmin/login';

const TUNNEL_HOSTS = ['lhr.life', 'localhost.run', 'localtunnel.me', 'ngrok-free.app', 'trycloudflare.com', 'pinggy.link', 'pinggy.io'];

/**
 * Extrae el subdomain del hostname.
 *
 * Soporta:
 *   - sanmiguel.localhost:3000  → "sanmiguel"  (desarrollo)
 *   - sanmiguel.tuapp.com       → "sanmiguel"  (producción)
 *   - localhost:3000            → null
 *   - tuapp.com                 → null
 */
function extractSubdomain(hostname: string): string | null {
    // Remove port
    const host = hostname.split(':')[0];

    // Check if host is a known tunnel service
    for (const tunnel of TUNNEL_HOSTS) {
        if (host === tunnel || host.endsWith('.' + tunnel)) {
            return null;
        }
    }

    // *.localhost  (desarrollo: sanmiguel.localhost)
    if (host.endsWith('.localhost')) {
        const sub = host.slice(0, host.length - '.localhost'.length);
        return sub || null;
    }

    // Raw localhost or IP — no subdomain
    if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        return null;
    }

    // Normal domain with >=3 parts  (sanmiguel.tuapp.com)
    const parts = host.split('.');
    if (parts.length >= 3) {
        return parts[0];
    }

    return null;
}

// Helper function to check if request is for SuperAdmin
function isSuperAdminRequest(hostname: string, pathname: string): boolean {
    const subdomain = extractSubdomain(hostname);

    // SuperAdmin rutas directas
    if (pathname.startsWith('/superadmin')) {
        return true;
    }

    // SuperAdmin subdomain: super-admin.localhost o superadmin.localhost
    if (subdomain === 'super-admin' || subdomain === 'superadmin') {
        return true;
    }

    return false;
}

/**
 * PANTALLAS POR ROL
 *
 * El menú oculta lo que no toca, pero la dirección se puede escribir a mano:
 * un estudiante entraba a /dashboard/usuarios. Aquí se corta antes de pintar.
 *
 * Ojo: esto es la puerta de la casa, no la de la caja fuerte. Los datos los
 * protege el servidor, que responde 403 aunque alguien manipule la cookie del
 * navegador para hacerse pasar por administrador: solo vería una pantalla vacía.
 */
type Rol = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'TUTOR';

const PANTALLAS_POR_ROL: Array<{ prefijo: string; roles: Rol[] }> = [
    { prefijo: '/dashboard/usuarios', roles: ['ADMIN'] },
    { prefijo: '/dashboard/configuracion', roles: ['ADMIN'] },
    { prefijo: '/dashboard/eventos', roles: ['ADMIN'] },
    { prefijo: '/dashboard/academico', roles: ['ADMIN', 'TEACHER'] },
    { prefijo: '/dashboard/materias', roles: ['ADMIN', 'TEACHER'] },
    { prefijo: '/dashboard/horarios', roles: ['ADMIN', 'TEACHER'] },
    { prefijo: '/dashboard/clase-en-vivo', roles: ['ADMIN', 'TEACHER'] },
    /**
     * ESTAS CUATRO FALTABAN
     *
     * Son pantallas de trabajo del personal —gestionar una clase, las aulas, el
     * calendario, el horario de una sección— y no estaban en esta lista. Un
     * alumno identificado podía abrirlas.
     *
     * Los datos nunca estuvieron en riesgo: el servidor comprueba los permisos
     * por su cuenta y le habría devuelto una pantalla vacía. Pero la puerta de
     * la casa estaba abierta, y eso no es lo acordado.
     *
     * Se encontró contando: de las 40 pantallas del sistema, diecisiete no
     * aparecían en ninguna prueba de navegador. Al escribirlas, salió esto
     * (ABRE-13).
     */
    { prefijo: '/dashboard/clases', roles: ['ADMIN', 'TEACHER'] },
    { prefijo: '/dashboard/aulas', roles: ['ADMIN', 'TEACHER'] },
    { prefijo: '/dashboard/horario', roles: ['ADMIN', 'TEACHER'] },
    /**
     * `/dashboard/calendario` NO va aquí, a propósito.
     *
     * Se puso al escribir lo de arriba, dando por hecho que era una pantalla de
     * gestión. No lo es: **el alumno y el representante también la usan** para
     * ver sus clases. Ponerla en esta lista los dejaba fuera de su propio
     * calendario.
     *
     * Lo cazó PANT-estudiante, que ya decía —desde antes— qué pantallas son
     * suyas. Queda escrito para que no se vuelva a "arreglar".
     */
];

function rolDeLaSesion(request: NextRequest): Rol | null {
    const cookie = request.cookies.get('user_data')?.value;
    if (!cookie) return null;
    try {
        const datos = JSON.parse(decodeURIComponent(cookie));
        return (datos?.role as Rol) ?? null;
    } catch {
        return null;
    }
}

/** Redirige al inicio si el rol no puede abrir esa pantalla. */
function pantallaProhibida(request: NextRequest): NextResponse | null {
    const { pathname } = request.nextUrl;
    const regla = PANTALLAS_POR_ROL.find(
        (r) => pathname === r.prefijo || pathname.startsWith(r.prefijo + '/')
    );
    if (!regla) return null;

    const rol = rolDeLaSesion(request);
    if (rol && !regla.roles.includes(rol)) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        url.search = '';
        url.searchParams.set('sinPermiso', '1');
        return NextResponse.redirect(url);
    }
    return null;
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const hostname = request.headers.get('host') || '';

    // Skip API routes, static assets, and special Next.js routes
    if (
        pathname.startsWith(API_ROUTES_PREFIX) ||
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/static/') ||
        pathname === '/favicon.ico'
    ) {
        return NextResponse.next();
    }

    // ========================================
    // SUPERADMIN ROUTES
    // ========================================
    if (isSuperAdminRequest(hostname, pathname)) {
        /**
         * LAS DOS PUERTAS TIENEN QUE MEDIR CON LA MISMA VARA
         *
         * Aquí había un bucle infinito de redirecciones, y era por una
         * diferencia de una palabra:
         *
         *   - la pantalla de entrar miraba **solo la credencial**: si existe,
         *     "ya estás dentro", y te mandaba al panel;
         *   - el panel miraba **la credencial Y los datos**: si falta uno de los
         *     dos, "no estás dentro", y te mandaba a entrar.
         *
         * Con una credencial pero sin los datos —que pasa si una caduca antes
         * que la otra, o si un cierre de sesión se queda a medias— cada puerta
         * mandaba a la otra. El navegador acababa en "demasiadas
         * redirecciones": el superadmin **no podía ni llegar a la pantalla de
         * entrar** para arreglarlo.
         *
         * Se cazó probándolo desde el navegador (ABRE-11) con una credencial
         * que no servía. Contra la API no se ve: la API responde 401 y ya.
         *
         * Ahora las dos puertas preguntan lo mismo, y además la que rebota
         * **borra lo que sobra**, para que un resto de sesión no pueda volver a
         * encerrar a nadie.
         */
        const superAdminAccessToken = request.cookies.get('superadmin_access_token')?.value;
        const superAdminData = request.cookies.get('superadmin_data')?.value;
        const sesionCompleta = Boolean(superAdminAccessToken && superAdminData);

        if (pathname === SUPERADMIN_LOGIN) {
            if (sesionCompleta) {
                return NextResponse.redirect(new URL('/superadmin/dashboard', request.url));
            }

            // Sesión a medias: se limpia lo que quedara, para que la pantalla de
            // entrar funcione y no vuelva a rebotar.
            const respuesta = NextResponse.next();
            if (superAdminAccessToken || superAdminData) {
                respuesta.cookies.delete('superadmin_access_token');
                respuesta.cookies.delete('superadmin_data');
            }
            return respuesta;
        }

        if (!sesionCompleta) {
            const respuesta = NextResponse.redirect(new URL(SUPERADMIN_LOGIN, request.url));
            respuesta.cookies.delete('superadmin_access_token');
            respuesta.cookies.delete('superadmin_data');
            return respuesta;
        }

        return NextResponse.next();
    }

    // ========================================
    // INSTITUTO ROUTES (Subdomain-based)
    // ========================================

    const subdomain = extractSubdomain(hostname);

    if (subdomain && subdomain !== 'superadmin') {
        const url = request.nextUrl.clone();

        // / → /login en el subdominio del instituto
        if (pathname === '/') {
            url.pathname = '/login';
            const response = NextResponse.rewrite(url);
            response.headers.set('x-institute-slug', subdomain);
            return response;
        }

        // Rutas de login: permitir siempre
        if (pathname === '/login' || pathname.startsWith('/login')) {
            const response = NextResponse.rewrite(url);
            response.headers.set('x-institute-slug', subdomain);
            return response;
        }

        // Antes de dejar pasar: ¿puede este rol abrir esta pantalla?
        const prohibida = pantallaProhibida(request);
        if (prohibida) return prohibida;
        // Protección de rutas: verificar token
        const accessToken = request.cookies.get('access_token')?.value;
        if (!accessToken) {
            url.pathname = '/login';
            const response = NextResponse.rewrite(url);
            response.headers.set('x-institute-slug', subdomain);
            return response;
        }

        // El pathname se mantiene igual (usa el sistema completo)
        // Solo inyectamos el slug como header y cookie
        const response = NextResponse.rewrite(url);
        response.headers.set('x-institute-slug', subdomain);
        // También guardar el slug en cookie para que los componentes client-side puedan leerlo
        response.cookies.set('institute_slug', subdomain, { path: '/', maxAge: 60 * 60 * 24 * 7 });
        return response;
    }

    // ========================================
    // FALLBACK: Regular routes (no subdomain)
    // ========================================

    // Skip public routes
    if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
        const accessToken = request.cookies.get('access_token')?.value;
        // If already logged in and visiting login, redirect to dashboard
        if (pathname === '/login' && accessToken) {
            return NextResponse.redirect(new URL('/dashboard', request.url));
        }
        return NextResponse.next();
    }

    // Antes de dejar pasar: ¿puede este rol abrir esta pantalla?
    const prohibida = pantallaProhibida(request);
    if (prohibida) return prohibida;
    // Check for access token
    const accessToken = request.cookies.get('access_token')?.value;

    if (!accessToken) {
        // Check if we have a refresh token to attempt silent refresh
        const refreshToken = request.cookies.get('refresh_token')?.value;

        if (!refreshToken) {
            // No tokens at all — redirect to login
            const loginUrl = new URL('/login', request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return NextResponse.redirect(loginUrl);
        }

        // We have a refresh token but no access token.
        // Let the request proceed — the axios interceptor or individual
        // service will handle the 401 and trigger a refresh.
        return NextResponse.next();
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|public/).*)',
    ],
};
