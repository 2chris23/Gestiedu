import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const refreshToken = cookieStore.get('superadmin_refresh_token')?.value;

        if (!refreshToken) {
            return NextResponse.json(
                { error: 'No hay sesión activa' },
                { status: 401 }
            );
        }

        // Llamar al backend para logout
        const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');
        await fetch(`${backendUrl}/api/superadmin/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
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
