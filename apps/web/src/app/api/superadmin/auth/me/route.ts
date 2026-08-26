import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Usa cookies → debe ser dinámica, no prerenderizada en build
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const superAdminData = cookieStore.get('superadmin_data')?.value;

        if (!superAdminData) {
            return NextResponse.json(
                { error: 'No autenticado' },
                { status: 401 }
            );
        }

        const superAdmin = JSON.parse(superAdminData);
        return NextResponse.json(superAdmin);
    } catch (error) {
        console.error('Error obteniendo datos de SuperAdmin:', error);
        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}
