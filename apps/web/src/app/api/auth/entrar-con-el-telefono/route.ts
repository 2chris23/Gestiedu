import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies, CookieUser } from '@/lib/auth-cookies';
import { API_URL } from '@/config/env';

/**
 * ENTRAR CON LA LLAVE QUE GUARDÓ ESTE TELÉFONO
 *
 * Sin sesión, como el login: aquí es donde se llega después de que la huella
 * abriera el cajón del teléfono. Lo que se manda es una llave que emitió el
 * propio servidor, y él decide si vale.
 *
 * Termina exactamente igual que el login —las mismas cookies, con las mismas
 * marcas— porque a partir de aquí la sesión es una sesión normal y corriente.
 *
 * Y devuelve **otra llave**: la que se acaba de usar ya no vale. Quien llama
 * tiene que guardarla en el sitio de donde sacó la anterior, o la próxima vez
 * tocará escribir la contraseña.
 */

const SOLO_POR_CONEXION_CIFRADA = process.env.NODE_ENV === 'production';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const slug = request.headers.get('x-institute-slug') || body.instituteSlug || '';

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (slug) headers['X-Institute-Slug'] = slug;
        const ua = request.headers.get('user-agent');
        if (ua) headers['user-agent'] = ua;
        const xff = request.headers.get('x-forwarded-for');
        if (xff) headers['x-forwarded-for'] = xff;

        const backendResponse = await fetch(`${API_URL}/auth/entrar-con-el-telefono`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ llave: body.llave }),
        });

        if (!backendResponse.ok) {
            const errorData = await backendResponse.json().catch(() => ({}));
            return NextResponse.json(
                { message: errorData.error || errorData.message || 'Esta llave ya no vale' },
                { status: backendResponse.status }
            );
        }

        const data = await backendResponse.json();
        const { tokens, user, llave, expiresAt } = data;

        const cookieUser: CookieUser = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            institute: user.institute
                ? { id: user.institute.id, name: user.institute.name, code: user.institute.code }
                : { id: slug || 'unknown', name: slug || 'Instituto', code: slug || '' },
        };

        await setAuthCookies(tokens.accessToken, tokens.refreshToken, cookieUser, slug);

        const responseNext = NextResponse.json({
            user: cookieUser,
            tokens,
            accessToken: tokens.accessToken,
            // La llave nueva, para que el teléfono guarde esta y tire la vieja.
            llave,
            expiresAt,
            instituteSlug: slug,
        });

        // Quien entra con la llave del teléfono quiere justo eso: no volver a
        // escribir la contraseña. La sesión es de las largas.
        const cookieMaxAge = 60 * 24 * 60 * 60;

        responseNext.cookies.set('access_token', tokens.accessToken, {
            httpOnly: true,
            secure: SOLO_POR_CONEXION_CIFRADA,
            sameSite: 'lax',
            path: '/',
            maxAge: 15 * 60,
        });

        responseNext.cookies.set('refresh_token', tokens.refreshToken, {
            httpOnly: true,
            secure: SOLO_POR_CONEXION_CIFRADA,
            sameSite: 'lax',
            path: '/',
            maxAge: cookieMaxAge,
        });

        responseNext.cookies.set('user_data', JSON.stringify(cookieUser), {
            httpOnly: false,
            secure: SOLO_POR_CONEXION_CIFRADA,
            sameSite: 'lax',
            path: '/',
            maxAge: cookieMaxAge,
        });

        if (slug) {
            responseNext.cookies.set('institute_slug', slug, {
                httpOnly: false,
                secure: SOLO_POR_CONEXION_CIFRADA,
                sameSite: 'lax',
                path: '/',
                maxAge: cookieMaxAge,
            });
        }

        return responseNext;
    } catch (error) {
        console.error('Entrar con la llave del teléfono:', error);
        return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
    }
}
