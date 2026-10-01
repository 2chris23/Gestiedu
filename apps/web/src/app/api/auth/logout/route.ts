import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearAuthCookies, getAccessToken, getRefreshToken } from '@/lib/auth-cookies';
import { API_URL } from '@/config/env';

/**
 * CERRAR SESIÓN ES CERRAR SESIÓN
 *
 * Esto **solo borraba las cookies del navegador**. En el servidor no pasaba
 * nada: la llave de volver a entrar seguía en la base valiendo semanas, la
 * sesión seguía en la memoria rápida y el token de acceso seguía sirviendo
 * hasta que caducara solo —hasta quince minutos—. Es decir, quien copiara ese
 * token antes de que su dueño saliera podía seguir usándolo un rato largo, y
 * la lista de «sesiones abiertas» seguía enseñando una sesión cerrada.
 *
 * La regla de la casa dice lo contrario: al cerrar sesión, el token de acceso
 * deja de servir EN EL ACTO (lista de anulados en la memoria rápida). Eso lo
 * hace el servidor, y para eso hay que llamarlo.
 *
 * Se llama primero y se borran las cookies después, pase lo que pase: si el
 * servidor no contesta, al menos este navegador se queda sin sesión.
 */
export async function POST(request: NextRequest) {
    const accessToken = await getAccessToken();
    const refreshToken = await getRefreshToken();
    const cookieStore = await cookies();
    const slug = cookieStore.get('institute_slug')?.value || '';

    // La llave que este teléfono guardó para volver a entrar con la huella: si
    // se quedara, el siguiente que abriera la app entraría sin contraseña.
    const cuerpo = await request.json().catch(() => ({} as { llaveDelTelefono?: string }));

    try {
        if (accessToken) {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            };
            if (slug) headers['X-Institute-Slug'] = slug;

            await fetch(`${API_URL}/auth/logout`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    refreshToken: refreshToken ?? undefined,
                    llaveDelTelefono: cuerpo?.llaveDelTelefono ?? undefined,
                }),
                cache: 'no-store',
            });
        }
    } catch (error) {
        // Que el servidor no conteste no puede dejar a nadie dentro de esta
        // pantalla: las cookies se borran igual, abajo.
        console.error('No se pudo avisar al servidor del cierre de sesión:', error);
    }

    await clearAuthCookies();
    return NextResponse.json({ success: true });
}
