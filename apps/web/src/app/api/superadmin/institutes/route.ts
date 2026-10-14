import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/config/env';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || cookieStore.get('superadmin_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const backendUrl = BACKEND_URL;
        const searchParams = request.nextUrl.searchParams.toString();
        const url = `${backendUrl}/api/superadmin/institutes${searchParams ? `?${searchParams}` : ''}`;

        const response = await fetch(url, {
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
        console.error('Error in /api/superadmin/institutes proxy:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || cookieStore.get('superadmin_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const backendUrl = BACKEND_URL;
        const body = await request.json();

        const response = await fetch(`${backendUrl}/api/superadmin/institutes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return NextResponse.json(error, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error creating institute proxy:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
