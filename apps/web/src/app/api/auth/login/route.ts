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

        // Proxy to backend
        const backendResponse = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email: body.email, password: body.password }),
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

        // Return user data (without tokens) to the client
        return NextResponse.json({ user: cookieUser });
    } catch (error) {
        console.error('Login proxy error:', error);
        return NextResponse.json(
            { message: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}
