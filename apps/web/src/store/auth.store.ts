import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { User as BaseUser } from '@/types/user';

interface User extends BaseUser {
    institute: {
        id: string;
        name: string;
        code: string;
    };
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isHydrated: boolean;
    login: (user: User, token: string, keepSession: boolean) => void;
    logout: () => void;
    setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            isHydrated: false,
            // Token param kept for backward compatibility but not stored
            login: (user, _token, _keepSession) => set({ user, isAuthenticated: true }),
            logout: () => set({ user: null, isAuthenticated: false }),
            setHydrated: () => set({ isHydrated: true }),
        }),
        {
            name: 'auth-storage',
            onRehydrateStorage: () => (state) => {
                state?.setHydrated();
            },
            partialize: (state) => ({
                // Only persist user and auth status — tokens live in HttpOnly cookies
                user: state.user,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);
