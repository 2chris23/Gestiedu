import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken, getRefreshToken } from '@/lib/auth-cookies';
import { API_URL } from '@/config/env';
import { cookies } from 'next/headers';

/**
 * Proxy de sesiones activas del usuario hacia el backend.
 * GET /api/auth/sessions → lista sesiones/dispositivos activos del usuario.
 * DELETE /api/auth/sessions/:id → revoca una sesión específica.
 */
async function backendHeaders(req?: NextRequest): Promise<Record<string, string>> {
    const accessToken = await getAccessToken();
    const refreshToken = await getRefreshToken();
    const cookieStore = await cookies();
    const slug = cookieStore.get('institute_slug')?.value || '';

    const headers: Record<string, string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    if (refreshToken) headers['X-Refresh-Token'] = refreshToken;
    if (slug) headers['X-Institute-Slug'] = slug;
    if (req) {
        const ua = req.headers.get('user-agent');
        if (ua) headers['user-agent'] = ua;
        const xff = req.headers.get('x-forwarded-for');
        if (xff) headers['x-forwarded-for'] = xff;
    }
    return headers;
}

export async function GET(request: NextRequest) {
    try {
        const headers = await backendHeaders(request);
        const backendResponse = await fetch(`${API_URL}/auth/sessions`, {
            method: 'GET',
            headers,
            cache: 'no-store',
        });

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
        const headers = await backendHeaders(request);
        // DELETE /api/auth/sessions revoca todas las demás sesiones excepto la actual
        const backendResponse = await fetch(`${API_URL}/auth/sessions/others`, {
            method: 'DELETE',
            headers,
        });

        if (!backendResponse.ok) {
            const errBody = await backendResponse.text();
            console.error('Backend DELETE error:', backendResponse.status, errBody);
            return NextResponse.json(
                { message: 'No se pudieron revocar las otras sesiones', detail: errBody },
                { status: backendResponse.status }
            );
        }
        const data = await backendResponse.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Delete other sessions proxy error:', error);
        return NextResponse.json({ message: 'Error al revocar sesiones' }, { status: 500 });
    }
}
