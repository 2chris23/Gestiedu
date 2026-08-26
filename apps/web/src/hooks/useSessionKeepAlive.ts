'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth.store';

/**
 * Hook para mantener la sesión viva mientras la pestaña esté abierta.
 * - Renueva el access_token silenciosamente cada 10 minutos (antes del límite de 15m del JWT).
 * - Al regresar de estar AFK (focus / visibilitychange), si pasaron > 8 min, renueva el token.
 */
export function useSessionKeepAlive() {
    const { isAuthenticated, user } = useAuthStore();
    const lastRefreshRef = useRef<number>(Date.now());

    useEffect(() => {
        if (!isAuthenticated && !user) return;

        const performSilentRefresh = async () => {
            try {
                const response = await fetch('/api/auth/refresh', { method: 'POST' });
                if (response.ok) {
                    const data = await response.json().catch(() => ({}));
                    if (data.accessToken && typeof document !== 'undefined') {
                        document.cookie = `access_token=${data.accessToken}; path=/; max-age=900; SameSite=Lax`;
                    }
                    lastRefreshRef.current = Date.now();
                }
            } catch (error) {
                console.debug('Silent refresh error (ignored during keepalive):', error);
            }
        };

        // Intervalo de renovación preventiva cada 10 minutos
        const intervalId = setInterval(() => {
            performSilentRefresh();
        }, 10 * 60 * 1000);

        // Al volver a la pestaña tras estar inactivo/AFK
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const elapsedMinutes = (Date.now() - lastRefreshRef.current) / (1000 * 60);
                if (elapsedMinutes >= 8) {
                    performSilentRefresh();
                }
            }
        };

        const handleFocus = () => {
            const elapsedMinutes = (Date.now() - lastRefreshRef.current) / (1000 * 60);
            if (elapsedMinutes >= 8) {
                performSilentRefresh();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, [isAuthenticated, user]);
}
