import { User, CreateUserData } from '@/types/user';
import { API_URL } from '@/config/env';
import { conseguirCredencial } from '@/lib/credencial-en-memoria';

/**
 * LA CREDENCIAL YA NO ESTÁ EN LAS COOKIES
 *
 * Esto se fabricaba las cabeceras leyendo `document.cookie`. Desde que la llave
 * corta vive en la memoria de la pestaña, ahí no hay nada: salía
 * `Authorization: Bearer ` (vacío) y **el servidor respondía 401**.
 *
 * Lo que eso significaba en el liceo: **crear un usuario desde la pantalla
 * dejaba de funcionar**, sin decir por qué. El formulario se cerraba como si
 * hubiera guardado y el usuario no aparecía.
 *
 * Lo cazó BOTON-01, que es la primera prueba que pulsa el botón de verdad en
 * vez de llamar a la API por dentro. Llamando a la API no se veía: la API
 * estaba bien; lo que estaba mal era cómo la llamaba esta pantalla.
 *
 * El liceo sí sigue en la cookie, que no es una credencial.
 */
const getHeaders = async (): Promise<Record<string, string>> => {
    const token = (await conseguirCredencial()) || '';

    let slug = '';
    if (typeof document !== 'undefined') {
        const cookies = document.cookie.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {} as Record<string, string>);
        slug = cookies['institute_slug'] || '';
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };
    if (slug) {
        headers['X-Institute-Slug'] = slug;
    }
    return headers;
};

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export const userService = {
    getUsers: async (params?: { page?: number; limit?: number; search?: string; role?: string; status?: string }): Promise<{ users: User[]; pagination: Pagination }> => {
        const queryParams = new URLSearchParams();
        if (params?.page) queryParams.append('page', params.page.toString());
        if (params?.limit) queryParams.append('limit', params.limit.toString());
        if (params?.search) queryParams.append('search', params.search);
        if (params?.role && params.role !== 'ALL') queryParams.append('role', params.role);
        if (params?.status) queryParams.append('status', params.status);

        const response = await fetch(`${API_URL}/users?${queryParams.toString()}`, {
            method: 'GET',
            headers: await getHeaders()
        });

        if (!response.ok) {
            throw new Error('Error al obtener usuarios');
        }

        const data = await response.json();
        return {
            users: data.users,
            pagination: data.pagination
        };
    },

    archiveUser: async (id: string): Promise<User> => {
        const response = await fetch(`${API_URL}/users/${id}/archive`, {
            method: 'POST',
            headers: await getHeaders()
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || error.error || 'Error al archivar usuario');
        }

        const data = await response.json();
        return data.user;
    },

    unarchiveUser: async (id: string): Promise<User> => {
        const response = await fetch(`${API_URL}/users/${id}/unarchive`, {
            method: 'POST',
            headers: await getHeaders()
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || error.error || 'Error al restaurar usuario');
        }

        const data = await response.json();
        return data.user;
    },

    createUser: async (user: CreateUserData): Promise<User> => {
        // Backend expects certain fields.
        // id is used as "Cédula".
        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify(user)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error('Error creating user:', error); // Log detallado para depuración

            // Si el backend devuelve detalles de validación, mostrarlos
            const msg = error.details
                ? `${error.message}: ${Array.isArray(error.details) ? error.details.map((d: { message?: string }) => d.message || String(d)).join(', ') : JSON.stringify(error.details)}`
                : (error.error || error.message || 'Error al crear usuario');

            throw new Error(msg);
        }

        const data = await response.json();
        return data.user || data;
    },

    updateUser: async (id: string, user: Partial<CreateUserData>): Promise<User> => {
        const response = await fetch(`${API_URL}/users/${id}`, {
            method: 'PUT',
            headers: await getHeaders(),
            body: JSON.stringify(user)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error('Error updating user:', error);

            const msg = error.details
                ? `${error.message}: ${Array.isArray(error.details) ? error.details.map((d: { message?: string }) => d.message || String(d)).join(', ') : JSON.stringify(error.details)}`
                : (error.error || error.message || 'Error al actualizar usuario');

            throw new Error(msg);
        }

        const data = await response.json();
        return data.user || data;
    },

    deleteUser: async (id: string): Promise<void> => {
        const response = await fetch(`${API_URL}/users/${id}`, {
            method: 'DELETE',
            headers: await getHeaders()
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error('Error deleting user:', error);
            const msg = error.message || error.error || 'Error al eliminar usuario';
            throw new Error(msg);
        }
    },

    getUserById: async (id: string): Promise<User> => {
        const response = await fetch(`${API_URL}/users/${id}`, {
            method: 'GET',
            headers: await getHeaders()
        });

        if (!response.ok) {
            if (response.status === 401) {
                console.error('Auth error (401) fetching user');
                if (typeof window !== 'undefined') window.location.href = '/login';
                throw new Error('Sesión expirada. Por favor inicie sesión nuevamente.');
            }
            if (response.status === 403) {
                console.error('Auth error (403) fetching user');
                throw new Error('No tiene permisos para ver este usuario.');
            }
            throw new Error('Error al obtener detalles del usuario');
        }

        const data = await response.json();
        return data.user;
    }
};
