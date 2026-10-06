// Single source of truth for API URLs
// All frontend files should import from here instead of hardcoding localhost

// API URL with /api suffix — for API calls
//
// En el SERVIDOR de pantallas (rutas de `app/api/auth/*`, el icono…) manda
// `API_DEL_SERVIDOR` si existe: con el túnel (`npm run tunel`) el navegador
// pide a `https://<pc>.ts.net/api`, y si el servidor usara esa misma dirección
// para entrar se llamaría a sí mismo por internet, y `/api/auth/login` (que es
// una ruta de Next) a sí misma, en bucle.
export const API_URL =
    (typeof window === 'undefined' ? process.env.API_DEL_SERVIDOR : undefined) ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3001/api';

// Backend base URL without /api — for static assets (uploads, logos, favicons)
export const BACKEND_URL = API_URL.replace(/\/api\/?$/, '');

/**
 * Obtiene la URL de un recurso estático (logo, avatar, comprobante).
 * Usa rutas relativas para pasar transparentemente por el proxy de Next.js
 * tanto en navegador local como en teléfonos y emuladores (10.0.2.2).
 */
export function getAssetUrl(path?: string | null): string {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }
    return path.startsWith('/') ? path : `/${path}`;
}
