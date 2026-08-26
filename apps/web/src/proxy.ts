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
        // Allow login page without auth
        if (pathname === SUPERADMIN_LOGIN) {
            const superAdminAccessToken = request.cookies.get('superadmin_access_token')?.value;
            // If already logged in, redirect to dashboard
            if (superAdminAccessToken) {
                return NextResponse.redirect(new URL('/superadmin/dashboard', request.url));
            }
            return NextResponse.next();
        }

        // Protected SuperAdmin routes — require auth
        const superAdminAccessToken = request.cookies.get('superadmin_access_token')?.value;
        const superAdminData = request.cookies.get('superadmin_data')?.value;

        if (!superAdminAccessToken || !superAdminData) {
            // No auth — redirect to SuperAdmin login
            return NextResponse.redirect(new URL(SUPERADMIN_LOGIN, request.url));
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
