import { API_URL } from '../config/env';
import { User } from '../types/user';

export interface Institute {
    id: string;
    name: string;
    code: string;
    email: string;
    phone?: string;
    address?: string;
    logo?: string;
    favicon?: string;
    primaryColor?: string;
    secondaryColor?: string;
    subjectPalette?: string;
}

interface LoginResponse {
    user: User & { institute: Institute };
    tokens: {
        accessToken: string;
        refreshToken: string;
        expiresIn: string;
        tokenType: string;
    };
}

export const authService = {
    async login(credentials: { email: string; password: string }): Promise<LoginResponse> {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Error al iniciar sesión');
        }

        return response.json();
    },
};
