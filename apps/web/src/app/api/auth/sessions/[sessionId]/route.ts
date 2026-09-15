import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken, getRefreshToken } from '@/lib/auth-cookies';
import { API_URL } from '@/config/env';
import { cookies } from 'next/headers';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params;
        if (!sessionId) {
            return NextResponse.json({ message: 'Session ID requerido' }, { status: 400 });
        }

        const accessToken = await getAccessToken();
        const refreshToken = await getRefreshToken();
        const cookieStore = await cookies();
        const slug = cookieStore.get('institute_slug')?.value || '';

        const headers: Record<string, string> = {};
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
        if (refreshToken) headers['X-Refresh-Token'] = refreshToken;
        if (slug) headers['X-Institute-Slug'] = slug;

        const ua = request.headers.get('user-agent');
        if (ua) headers['user-agent'] = ua;

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
        console.error('Delete individual session proxy error:', error);
        return NextResponse.json({ message: 'Error al revocar sesión' }, { status: 500 });
    }
}
