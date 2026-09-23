import { NextRequest, NextResponse } from 'next/server';
import { getRefreshToken, setAccessTokenCookie } from '@/lib/auth-cookies';
import { API_URL } from '@/config/env';
import { cookies } from 'next/headers';

/**
 * `secure` manda la cookie SOLO por conexión cifrada (https).
 *
 * Estaba en `false` fijo, así que en producción la sesión podía viajar en claro:
 * quien estuviera en la misma red —el wifi del liceo, por ejemplo— podía leerla
 * y entrar como esa persona.
 *
 * En desarrollo se sigue usando http://localhost, donde `secure` impediría
 * guardar la cookie; por eso depende del entorno y no es fijo.
 */
const SOLO_POR_CONEXION_CIFRADA = process.env.NODE_ENV === 'production';


export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
    try {
        const refreshToken = await getRefreshToken();

        if (!refreshToken) {
            return NextResponse.json(
                { message: 'No refresh token' },
                { status: 401 }
            );
        }

        // Leer slug del instituto desde cookies para resolver el tenant correcto
        const cookieStore = await cookies();
        const slug = cookieStore.get('institute_slug')?.value || '';

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (slug) {
            headers['X-Institute-Slug'] = slug;
        }

        // Proxy to backend refresh endpoint
        const backendResponse = await fetch(`${API_URL}/auth/refresh-token`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ refreshToken }),
        });

        if (!backendResponse.ok) {
            // Solo un «no» del servidor es «la sesión no vale». Si el servidor
            // falla o no está (5xx), eso es otra cosa, y responder 401 aquí
            // hacía que la app cerrara la sesión de alguien que no había hecho
            // nada: ver `lib/axios.ts`.
            const esUnNo = [400, 401, 403].includes(backendResponse.status);
            return NextResponse.json(
                { message: esUnNo ? 'Token refresh failed' : 'El servidor no contesta' },
                { status: esUnNo ? 401 : 503 }
            );
        }

        const data = await backendResponse.json();

        // Update access token cookie in cookieStore
        await setAccessTokenCookie(data.accessToken);

        const responseNext = NextResponse.json({
            success: true,
            accessToken: data.accessToken,
        });

        // Setear cookie directamente en la respuesta HTTP
        responseNext.cookies.set('access_token', data.accessToken, {
            // Cerrada a la página: la llave corta vive en memoria
            // (`lib/credencial-en-memoria.ts`). La cookie la lee el guardián de
            // pantallas, que corre en el servidor.
            httpOnly: true,
            secure: SOLO_POR_CONEXION_CIFRADA,
            sameSite: 'lax',
            path: '/',
            maxAge: 15 * 60,
        });

        // ROTACIÓN DE REFRESH TOKENS: Guardar el nuevo refresh token emitido
        if (data.refreshToken) {
            responseNext.cookies.set('refresh_token', data.refreshToken, {
                httpOnly: true,
                secure: SOLO_POR_CONEXION_CIFRADA,
                sameSite: 'lax',
                path: '/',
                maxAge: 7 * 24 * 60 * 60,
            });
        }

        return responseNext;
    } catch (error) {
        // Casi siempre: el servidor de datos no contesta. No es culpa de la sesión.
        console.error('Refresh token error:', error);
        return NextResponse.json(
            { message: 'El servidor no contesta' },
            { status: 503 }
        );
    }
}
