import { useSuperAdminAuthStore } from '@/store/superadmin-auth.store';

let refreshPromise: Promise<string | null> | null = null;

/**
 * Obtiene el token actual del store o de la cookie en el navegador
 */
function getSuperAdminToken(): string {
    const storeToken = useSuperAdminAuthStore.getState().token;
    if (storeToken) return storeToken;
    if (typeof document === 'undefined') return '';
    const match = document.cookie.match(/(?:^|;\s*)superadmin_access_token=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Ejecuta la renovación del token de superadmin de forma atómica y protegida contra concurrencia
 */
async function refreshSuperAdminToken(): Promise<string | null> {
    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            const res = await fetch('/api/superadmin/auth/refresh', {
                method: 'POST',
                credentials: 'include',
            });

            if (!res.ok) {
                // Refresh falló definitivamente
                useSuperAdminAuthStore.getState().logout();
                if (typeof window !== 'undefined' && !window.location.pathname.includes('/superadmin/login')) {
                    window.location.href = '/superadmin/login';
                }
                return null;
            }

            const data = await res.json();
            const newAccessToken = data.accessToken;
            if (newAccessToken) {
                const currentAdmin = data.superAdmin || useSuperAdminAuthStore.getState().superAdmin;
                useSuperAdminAuthStore.getState().setSuperAdmin(currentAdmin, newAccessToken);

                // Las cookies las pone /api/superadmin/auth/refresh en su propia
                // respuesta, con `Secure` en producción. Reescribirlas aquí les
                // quitaba esa marca en cada renovación.
            }
            return newAccessToken || null;
        } catch (err) {
            console.error('Error al renovar token de SuperAdmin:', err);
            useSuperAdminAuthStore.getState().logout();
            if (typeof window !== 'undefined' && !window.location.pathname.includes('/superadmin/login')) {
                window.location.href = '/superadmin/login';
            }
            return null;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

/**
 * Helper de fetch con inyección de token de SuperAdmin, soporte de credenciales
 * y auto-renovación silenciosa con reintento si el token expira (401).
 */
export async function superAdminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const token = getSuperAdminToken();
    const headers = new Headers(init?.headers || {});

    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const modifiedInit: RequestInit = {
        ...init,
        credentials: 'include',
        headers,
    };

    let response = await fetch(input, modifiedInit);

    // Si recibimos 401 y no hemos reintentado aún esta petición
    if (response.status === 401 && !(init as any)?._retry) {
        const newToken = await refreshSuperAdminToken();
        if (newToken) {
            const retryHeaders = new Headers(init?.headers || {});
            retryHeaders.set('Authorization', `Bearer ${newToken}`);

            const retryInit: RequestInit = {
                ...init,
                credentials: 'include',
                headers: retryHeaders,
            };
            (retryInit as any)._retry = true;

            response = await fetch(input, retryInit);
        }
    }

    return response;
}
