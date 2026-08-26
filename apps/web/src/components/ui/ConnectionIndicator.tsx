'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { getConnectionStatus } from '@/lib/axios';

/**
 * Componente que muestra el estado de la conexión con el backend
 * Incluye indicador visual y botón para refrescar configuración
 */
export function ConnectionIndicator() {
    const [status, setStatus] = useState<{ connected: boolean; baseURL: string | null }>({
        connected: false,
        baseURL: null,
    });
    const [isRefreshing, setIsRefreshing] = useState(false);

    const checkConnection = async () => {
        const info = getConnectionStatus();
        try {
            const res = await fetch(`${info.baseURL?.replace('/api', '')}/api/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000),
            });
            setStatus({ connected: res.ok, baseURL: info.baseURL });
        } catch {
            setStatus({ connected: false, baseURL: info.baseURL });
        }
    };

    useEffect(() => {
        checkConnection();
        const interval = setInterval(checkConnection, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await checkConnection();
        setIsRefreshing(false);
    };

    // Extraer puerto de la baseURL
    const port = status.baseURL?.match(/:(\d+)/)?.[1] || 'desconocido';

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg transition-all ${status.connected
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                    }`}
            >
                {/* Icono de estado */}
                {status.connected ? (
                    <Wifi className="w-5 h-5 text-green-600" />
                ) : (
                    <WifiOff className="w-5 h-5 text-red-600" />
                )}

                {/* Información de conexión */}
                <div className="flex flex-col">
                    <span
                        className={`text-sm font-medium ${status.connected ? 'text-green-800' : 'text-red-800'
                            }`}
                    >
                        {status.connected ? 'Conectado' : 'Desconectado'}
                    </span>
                    {status.connected && (
                        <span className="text-xs text-green-600">Puerto {port}</span>
                    )}
                </div>

                {/* Botón de redescubrimiento */}
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className={`ml-2 p-1.5 rounded-md transition-colors ${status.connected
                        ? 'hover:bg-green-100 text-green-700'
                        : 'hover:bg-red-100 text-red-700'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title="Buscar backend nuevamente"
                >
                    <RefreshCw
                        className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                    />
                </button>
            </div>
        </div>
    );
}
