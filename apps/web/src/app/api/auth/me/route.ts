import { NextResponse } from 'next/server';
import { getUserFromCookies } from '@/lib/auth-cookies';

export async function GET() {
    const user = await getUserFromCookies();

    if (!user) {
        return NextResponse.json(
            { message: 'No autenticado' },
            { status: 401 }
        );
    }

    return NextResponse.json({ user });
}
