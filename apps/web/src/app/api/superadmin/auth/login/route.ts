import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email y contraseña son requeridos' },
                { status: 400 }
            );
        }

        // Llamar al backend
        const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');
        const response = await fetch(`${backendUrl}/api/superadmin/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const error = await response.json();
            return NextResponse.json(
                { error: error.error || error.message || 'Error de autenticación' },
                { status: response.status }
            );
        }

        const data = await response.json();

        const responseNext = NextResponse.json({
            superAdmin: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
        });

        // Setear cookies en la respuesta HTTP directamente
        responseNext.cookies.set('superadmin_access_token', data.accessToken, {
            httpOnly: false,
            secure: false,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60,
            path: '/',
        });

        responseNext.cookies.set('superadmin_refresh_token', data.refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60,
            path: '/',
        });

        responseNext.cookies.set('superadmin_data', JSON.stringify(data.user), {
            httpOnly: false,
            secure: false,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60,
            path: '/',
        });

        return responseNext;
    } catch (error) {
        console.error('Error en login de SuperAdmin:', error);
        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}
