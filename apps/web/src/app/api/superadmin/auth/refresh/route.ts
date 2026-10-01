import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

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


export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        let refreshToken = cookieStore.get('superadmin_refresh_token')?.value;

        // Si no está en cookie, intentar leer del body si se envió explícitamente
        if (!refreshToken) {
            try {
                const body = await request.json();
                refreshToken = body?.refreshToken;
            } catch {}
        }

        if (!refreshToken) {
            const response = NextResponse.json(
                { error: 'No se encontró refresh token de superadmin' },
                { status: 401 }
            );
            response.cookies.delete('superadmin_access_token');
            response.cookies.delete('superadmin_refresh_token');
            response.cookies.delete('superadmin_data');
            return response;
        }

        const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');
        const backendRes = await fetch(`${backendUrl}/api/superadmin/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });

        if (!backendRes.ok) {
            const errData = await backendRes.json().catch(() => ({}));
            const response = NextResponse.json(
                { error: errData.error || 'Refresh token de superadmin inválido o expirado' },
                { status: 401 }
            );
            response.cookies.delete('superadmin_access_token');
            response.cookies.delete('superadmin_refresh_token');
            response.cookies.delete('superadmin_data');
            return response;
        }

        const data = await backendRes.json();

        const responseNext = NextResponse.json({
            success: true,
            accessToken: data.accessToken,
            superAdmin: data.user,
        });

        // Actualizar cookies seguras con el nuevo token pair
        responseNext.cookies.set('superadmin_access_token', data.accessToken, {
            httpOnly: true,
            secure: SOLO_POR_CONEXION_CIFRADA,
            sameSite: 'lax',
            maxAge: 1800, // 30 minutos
            path: '/',
        });

        responseNext.cookies.set('superadmin_refresh_token', data.refreshToken, {
            httpOnly: true,
            secure: SOLO_POR_CONEXION_CIFRADA,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60,
            path: '/',
        });

        if (data.user) {
            responseNext.cookies.set('superadmin_data', JSON.stringify(data.user), {
                httpOnly: false,
                secure: SOLO_POR_CONEXION_CIFRADA,
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60,
                path: '/',
            });
        }

        return responseNext;
    } catch (error) {
        console.error('Error en refresh de SuperAdmin:', error);
        return NextResponse.json(
            { error: 'Error interno del servidor al renovar sesión' },
            { status: 500 }
        );
    }
}
