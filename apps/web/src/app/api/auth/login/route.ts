import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies, CookieUser } from '@/lib/auth-cookies';
import { API_URL } from '@/config/env';

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
            return NextResponse.json(
                { message: errorData.message || 'Error al iniciar sesión' },
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
            httpOnly: false,
            secure: false,
            sameSite: 'lax',
            path: '/',
            maxAge: 15 * 60, // 15 min JWT
        });

        responseNext.cookies.set('refresh_token', tokens.refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
            maxAge: cookieMaxAge,
        });

        responseNext.cookies.set('user_data', JSON.stringify(cookieUser), {
            httpOnly: false,
            secure: false,
            sameSite: 'lax',
            path: '/',
            maxAge: cookieMaxAge,
        });

        if (slug) {
            responseNext.cookies.set('institute_slug', slug, {
                httpOnly: false,
                secure: false,
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
