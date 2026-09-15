import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || cookieStore.get('superadmin_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');
        const response = await fetch(`${backendUrl}/api/superadmin/institutes/stats`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return NextResponse.json(error, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in /api/superadmin/stats proxy:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
