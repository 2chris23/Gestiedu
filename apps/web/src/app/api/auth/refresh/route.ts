import { NextRequest, NextResponse } from 'next/server';
import { getRefreshToken, setAccessTokenCookie } from '@/lib/auth-cookies';
import { API_URL } from '@/config/env';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
    try {
        const refreshToken = await getRefreshToken();

        if (!refreshToken) {
            return NextResponse.json(
                { message: 'No refresh token' },
                { status: 401 }
            );
        }

        // Leer slug del instituto desde cookies para resolver el tenant correcto
        const cookieStore = await cookies();
        const slug = cookieStore.get('institute_slug')?.value || '';

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (slug) {
            headers['X-Institute-Slug'] = slug;
        }

        // Proxy to backend refresh endpoint
        const backendResponse = await fetch(`${API_URL}/auth/refresh-token`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ refreshToken }),
        });

        if (!backendResponse.ok) {
            return NextResponse.json(
                { message: 'Token refresh failed' },
                { status: 401 }
            );
        }

        const data = await backendResponse.json();

        // Update access token cookie in cookieStore
        await setAccessTokenCookie(data.accessToken);

        const responseNext = NextResponse.json({
            success: true,
            accessToken: data.accessToken,
        });

        // Setear cookie directamente en la respuesta HTTP
        responseNext.cookies.set('access_token', data.accessToken, {
            httpOnly: false,
            secure: false,
            sameSite: 'lax',
            path: '/',
            maxAge: 15 * 60,
        });

        return responseNext;
    } catch (error) {
        console.error('Refresh token error:', error);
        return NextResponse.json(
            { message: 'Error al refrescar token' },
            { status: 500 }
        );
    }
}
