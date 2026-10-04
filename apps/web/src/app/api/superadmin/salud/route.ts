import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * La salud del sistema para el panel del superadmin (`SaludDelSistema`):
 * tareas, respaldos y disco. Con algo crítico el servidor responde 503 CON el
 * detalle, y se pasa tal cual: el 503 es la noticia, no un fallo de aquí.
 */
export async function GET(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || cookieStore.get('superadmin_access_token')?.value;
        if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

        const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');
        const response = await fetch(`${backendUrl}/api/superadmin/monitoring/health`, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            cache: 'no-store',
        });
        const cuerpo = await response.json().catch(() => ({ error: 'Respuesta ilegible del servidor' }));
        return NextResponse.json(cuerpo, { status: response.status });
    } catch (error) {
        console.error('Error in /api/superadmin/salud proxy:', error);
        return NextResponse.json({ error: 'El servidor no contesta' }, { status: 503 });
    }
}
