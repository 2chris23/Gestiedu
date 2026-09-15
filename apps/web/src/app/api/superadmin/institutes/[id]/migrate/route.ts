import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/** Aplica las migraciones pendientes a un liceo concreto. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const cookieStore = await cookies();
        const token =
            request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
            cookieStore.get('superadmin_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');
        const response = await fetch(`${backendUrl}/api/superadmin/institutes/${id}/migrate`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json().catch(() => ({}));
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('Error migrando el liceo:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
