import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAccessToken } from '@/lib/auth-cookies';
import { API_URL } from '@/config/env';

/**
 * LA LLAVE DE ESTE TELÉFONO
 *
 * Dos cosas, las dos con sesión abierta: pedir una llave (POST) y anularla
 * (DELETE). La llave se devuelve **una sola vez**; de ahí va derecha al almacén
 * de claves del teléfono, detrás de la huella, y no se guarda en ningún sitio
 * más — ni en una cookie, ni en el navegador.
 *
 * Entrar CON la llave es otra ruta y no lleva sesión, como el login.
 */

async function cabeceras(req: NextRequest): Promise<Record<string, string>> {
    const accessToken = await getAccessToken();
    const cookieStore = await cookies();
    const slug = cookieStore.get('institute_slug')?.value || '';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    if (slug) headers['X-Institute-Slug'] = slug;
    const ua = req.headers.get('user-agent');
    if (ua) headers['user-agent'] = ua;
    return headers;
}

export async function POST(request: NextRequest) {
    try {
        const respuesta = await fetch(`${API_URL}/auth/llave-del-telefono`, {
            method: 'POST',
            headers: await cabeceras(request),
            body: '{}',
            cache: 'no-store',
        });

        const data = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) {
            return NextResponse.json(
                { message: data?.error || 'No se pudo guardar la llave de este teléfono' },
                { status: respuesta.status }
            );
        }
        return NextResponse.json(data);
    } catch (error) {
        console.error('Crear llave del teléfono:', error);
        return NextResponse.json({ message: 'Error al guardar la llave' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const respuesta = await fetch(`${API_URL}/auth/anular-llave-del-telefono`, {
            method: 'POST',
            headers: await cabeceras(request),
            body: JSON.stringify({ llave: body?.llave ?? null }),
            cache: 'no-store',
        });

        const data = await respuesta.json().catch(() => ({}));
        return NextResponse.json(data, { status: respuesta.ok ? 200 : respuesta.status });
    } catch (error) {
        console.error('Anular llave del teléfono:', error);
        return NextResponse.json({ message: 'Error al anular la llave' }, { status: 500 });
    }
}
