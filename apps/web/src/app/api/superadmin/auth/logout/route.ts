import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/config/env';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const refreshToken = cookieStore.get('superadmin_refresh_token')?.value;

        const accessToken = cookieStore.get('superadmin_access_token')?.value;

        if (!refreshToken && !accessToken) {
            return NextResponse.json(
                { error: 'No hay sesión activa' },
                { status: 401 }
            );
        }

        // Llamar al backend para logout incluyendo el token de autorización
        const backendUrl = BACKEND_URL;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        }

        await fetch(`${backendUrl}/api/superadmin/auth/logout`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ refreshToken }),
        });

        // Eliminar cookies
        cookieStore.delete('superadmin_access_token');
        cookieStore.delete('superadmin_refresh_token');
        cookieStore.delete('superadmin_data');

        return NextResponse.json({ message: 'Sesión cerrada exitosamente' });
    } catch (error) {
        console.error('Error en logout de SuperAdmin:', error);
        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}
