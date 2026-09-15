import { cookies } from 'next/headers';

// Cookie names
const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';
const USER_DATA_COOKIE = 'user_data';

// Cookie options
const SECURE = process.env.NODE_ENV === 'production';
const ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export interface CookieUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    institute: {
        id: string;
        name: string;
        code: string;
    };
}

/**
 * Set auth cookies after login (server-side only)
 */
export async function setAuthCookies(
    accessToken: string,
    refreshToken: string,
    user: CookieUser,
    instituteSlug?: string
) {
    const cookieStore = await cookies();

    cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
    /**
     * CERRADA A LA PÁGINA, ABIERTA AL GUARDIÁN
     *
     * Estaba en `false` con este comentario al lado: *"Not HttpOnly so axios
     * interceptor can read it via document.cookie"*. Se dejó abierta a
     * propósito porque hacía falta leerla desde el navegador.
     *
     * Ya no hace falta: la llave corta vive en la memoria de la pestaña
     * (`lib/credencial-en-memoria.ts`). La cookie se queda porque la lee el
     * guardián de pantallas (`proxy.ts`), que corre en el servidor. Desde la
     * página ya no se ve.
     */
    httpOnly: true,
        secure: SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: ACCESS_TOKEN_MAX_AGE,
    });

    cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, {
        httpOnly: true,
        secure: SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    cookieStore.set(USER_DATA_COOKIE, JSON.stringify(user), {
        httpOnly: true,
        secure: SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: REFRESH_TOKEN_MAX_AGE, // Same as refresh token
    });

    // Guardar slug del instituto para resolución de tenant en server-side routes
    if (instituteSlug) {
        cookieStore.set('institute_slug', instituteSlug, {
            httpOnly: false, // Legible por cliente (axios) y servidor (refresh route)
            secure: SECURE,
            sameSite: 'lax',
            path: '/',
            maxAge: REFRESH_TOKEN_MAX_AGE,
        });
    }
}

/**
 * Get the access token from cookies
 */
export async function getAccessToken(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
}

/**
 * Get the refresh token from cookies
 */
export async function getRefreshToken(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get(REFRESH_TOKEN_COOKIE)?.value ?? null;
}

/**
 * Get user data from cookies
 */
export async function getUserFromCookies(): Promise<CookieUser | null> {
    const cookieStore = await cookies();
    const raw = cookieStore.get(USER_DATA_COOKIE)?.value;
    if (!raw) return null;
    try {
        return JSON.parse(raw) as CookieUser;
    } catch {
        return null;
    }
}

/**
 * Update only the access token cookie (after refresh)
 */
export async function setAccessTokenCookie(accessToken: string) {
    const cookieStore = await cookies();
    cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
        // Ver la nota de `setAuthCookies`: cerrada a la página, la lee el
        // guardián de pantallas desde el servidor.
        httpOnly: true,
        secure: SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: ACCESS_TOKEN_MAX_AGE,
    });
}

/**
 * Clear all auth cookies (logout)
 */
export async function clearAuthCookies() {
    const cookieStore = await cookies();
    cookieStore.delete(ACCESS_TOKEN_COOKIE);
    cookieStore.delete(REFRESH_TOKEN_COOKIE);
    cookieStore.delete(USER_DATA_COOKIE);
}
