import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken, getRefreshToken } from '@/lib/auth-cookies';
import { API_URL } from '@/config/env';
import { cookies } from 'next/headers';

/**
 * Proxy de sesiones activas del usuario hacia el backend.
 * GET /api/auth/sessions → lista sesiones/dispositivos activos del usuario.
 * DELETE /api/auth/sessions/:id → revoca una sesión específica.
 */
async function backendHeaders(): Promise<Record<string, string>> {
    const accessToken = await getAccessToken();
    const refreshToken = await getRefreshToken();
    const cookieStore = await cookies();
    const slug = cookieStore.get('institute_slug')?.value || '';

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    if (refreshToken) headers['X-Refresh-Token'] = refreshToken;
    if (slug) headers['X-Institute-Slug'] = slug;
    return headers;
}

export async function GET() {
    try {
        const headers = await backendHeaders();
        const backendResponse = await fetch(`${API_URL}/auth/sessions`, { method: 'GET', headers });

        if (!backendResponse.ok) {
            return NextResponse.json(
                { message: 'No se pudieron obtener las sesiones' },
                { status: backendResponse.status }
            );
        }
        const data = await backendResponse.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Get sessions proxy error:', error);
        return NextResponse.json({ message: 'Error al obtener sesiones' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const sessionId = request.nextUrl.pathname.split('/').pop();
        if (!sessionId) {
            return NextResponse.json({ message: 'Session ID requerido' }, { status: 400 });
        }

        const headers = await backendHeaders();
        const backendResponse = await fetch(`${API_URL}/auth/sessions/${sessionId}`, {
            method: 'DELETE',
            headers,
        });

        if (!backendResponse.ok) {
            return NextResponse.json(
                { message: 'No se pudo revocar la sesión' },
                { status: backendResponse.status }
            );
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete session proxy error:', error);
        return NextResponse.json({ message: 'Error al revocar sesión' }, { status: 500 });
    }
}
