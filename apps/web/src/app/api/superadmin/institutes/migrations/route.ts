import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/** GET: estado del esquema de cada liceo. POST: migrar todos los que falten. */
async function proxy(request: NextRequest, method: 'GET' | 'POST', suffix = '') {
    try {
        const cookieStore = await cookies();
        const token =
            request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
            cookieStore.get('superadmin_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');
        const response = await fetch(`${backendUrl}/api/superadmin/institutes/migrations${suffix}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json().catch(() => ({}));
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('Error en el proxy de migraciones:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    return proxy(request, 'GET');
}

export async function POST(request: NextRequest) {
    return proxy(request, 'POST', '/run');
}
