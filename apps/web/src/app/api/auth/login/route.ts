import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies, CookieUser } from '@/lib/auth-cookies';
import { API_URL } from '@/config/env';
import { avisoDeDemasiadosIntentos, segundosDeEspera } from '@/lib/demasiados-intentos';

/**
 * `secure` manda la cookie SOLO por conexión cifrada (https).
 *
 * Estaba en `false` fijo, así que en producción la sesión podía viajar en claro:
 * quien estuviera en la misma red —el wifi del liceo, por ejemplo— podía leerla
 * y entrar como esa persona.
 *
 * En desarrollo se sigue usando http://localhost, donde `secure` impediría
 * guardar la cookie; por eso depende del entorno y no es fijo.
 */
const SOLO_POR_CONEXION_CIFRADA = process.env.NODE_ENV === 'production';


export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Leer slug del header inyectado por el middleware (cuando viene de subdominio)
        // o del body si fue enviado explícitamente
        const slug = request.headers.get('x-institute-slug') || body.instituteSlug || '';

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (slug) {
            headers['X-Institute-Slug'] = slug;
        }
        const ua = request.headers.get('user-agent');
        if (ua) headers['user-agent'] = ua;
        const xff = request.headers.get('x-forwarded-for');
        if (xff) headers['x-forwarded-for'] = xff;

        const keepSession = Boolean(body.keepSession || body.rememberMe);

        // Proxy to backend (reenviando keepSession y rememberMe para activar sliding session)
        const backendResponse = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                email: body.email,
                password: body.password,
                keepSession,
                rememberMe: keepSession,
            }),
        });

        if (!backendResponse.ok) {
            const errorData = await backendResponse.json().catch(() => ({}));

            // Frenado por intentar demasiadas veces: su `error` es «Too Many
            // Requests», en inglés. Ver `lib/demasiados-intentos.ts`. La cuenta
            // cerrada por fallos no manda `Retry-After`, pero dice sus minutos.
            if (backendResponse.status === 429) {
                const segundos = segundosDeEspera(backendResponse.headers.get('retry-after'))
                    ?? (typeof errorData.minutos === 'number' ? errorData.minutos * 60 : null);
                return NextResponse.json(
                    { message: avisoDeDemasiadosIntentos(segundos), code: 'DEMASIADOS_INTENTOS' },
                    { status: 429, headers: segundos ? { 'Retry-After': String(segundos) } : undefined }
                );
            }

            return NextResponse.json(
                { message: errorData.error || errorData.message || 'Error al iniciar sesión' },
                { status: backendResponse.status }
            );
        }

        const data = await backendResponse.json();

        // Extract tokens and user
        const { tokens, user } = data;

        const cookieUser: CookieUser = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            institute: user.institute ? {
                id: user.institute.id,
                name: user.institute.name,
                code: user.institute.code,
            } : {
                id: slug || 'unknown',
                name: slug || 'Instituto',
                code: slug || '',
            },
        };

        // Set HttpOnly cookies (incluye institute_slug para resolución de tenant)
        await setAuthCookies(tokens.accessToken, tokens.refreshToken, cookieUser, slug);

        const responseNext = NextResponse.json({
            user: cookieUser,
            tokens,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            instituteSlug: slug,
        });

        // Setear cookies explícitamente en la respuesta HTTP
        const cookieMaxAge = keepSession ? 60 * 24 * 60 * 60 : 7 * 24 * 60 * 60; // 60 días si keepSession
        responseNext.cookies.set('access_token', tokens.accessToken, {
            // Cerrada a la página: la llave corta vive en memoria
            // (`lib/credencial-en-memoria.ts`). La cookie la lee el guardián de
            // pantallas, que corre en el servidor.
            httpOnly: true,
            secure: SOLO_POR_CONEXION_CIFRADA,
            sameSite: 'lax',
            path: '/',
            maxAge: 15 * 60, // 15 min JWT
        });

        responseNext.cookies.set('refresh_token', tokens.refreshToken, {
            httpOnly: true,
            secure: SOLO_POR_CONEXION_CIFRADA,
            sameSite: 'lax',
            path: '/',
            maxAge: cookieMaxAge,
        });

        responseNext.cookies.set('user_data', JSON.stringify(cookieUser), {
            httpOnly: false,
            secure: SOLO_POR_CONEXION_CIFRADA,
            sameSite: 'lax',
            path: '/',
            maxAge: cookieMaxAge,
        });

        if (slug) {
            responseNext.cookies.set('institute_slug', slug, {
                httpOnly: false,
                secure: SOLO_POR_CONEXION_CIFRADA,
                sameSite: 'lax',
                path: '/',
                maxAge: cookieMaxAge,
            });
        }

        return responseNext;
    } catch (error) {
        console.error('Login proxy error:', error);
        return NextResponse.json(
            { message: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}
