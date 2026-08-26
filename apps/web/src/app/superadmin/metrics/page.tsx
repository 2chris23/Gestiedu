'use client';

import { useState, useEffect } from 'react';

interface CacheMetric {
    key: string;
    hits: number;
    misses: number;
    size: string;
    ttl: string;
    lastAccess: string;
}

interface SystemMetric {
    label: string;
    value: string;
    change: string;
    trend: 'up' | 'down' | 'stable';
    icon: string;
}

export default function MetricsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'cache' | 'database'>('overview');

    const systemMetrics: SystemMetric[] = [
        { label: 'Institutos Activos', value: '23', change: '+3', trend: 'up', icon: '🏫' },
        { label: 'Usuarios Totales', value: '15,847', change: '+542', trend: 'up', icon: '👥' },
        { label: 'Requests/min', value: '1,234', change: '-12%', trend: 'down', icon: '⚡' },
        { label: 'Uptime', value: '99.97%', change: 'estable', trend: 'stable', icon: '🟢' },
        { label: 'Memoria Redis', value: '256 MB', change: '+12 MB', trend: 'up', icon: '💾' },
        { label: 'Conexiones DB', value: '47/100', change: '+5', trend: 'up', icon: '🔗' },
    ];

    const cacheMetrics: CacheMetric[] = [
        { key: 'institute:san-miguel:config', hits: 15420, misses: 23, size: '2.4 KB', ttl: '24h', lastAccess: 'hace 2s' },
        { key: 'institute:liceo-bolivar:config', hits: 12300, misses: 18, size: '2.1 KB', ttl: '24h', lastAccess: 'hace 5s' },
        { key: 'auth:sessions:active', hits: 89400, misses: 156, size: '45.6 KB', ttl: '1h', lastAccess: 'hace 1s' },
        { key: 'institute:san-miguel:students:list', hits: 8900, misses: 45, size: '128 KB', ttl: '5min', lastAccess: 'hace 15s' },
        { key: 'global:plans:active', hits: 5600, misses: 12, size: '1.2 KB', ttl: '12h', lastAccess: 'hace 30s' },
        { key: 'institute:san-miguel:schedules', hits: 4300, misses: 67, size: '89 KB', ttl: '15min', lastAccess: 'hace 45s' },
    ];

    const dbConnections = [
        { name: 'platform_db', status: 'connected', queries: 4521, avgLatency: '2.3ms', pool: '5/10', uptime: '72h' },
        { name: 'san_miguel_db', status: 'connected', queries: 12890, avgLatency: '1.8ms', pool: '8/15', uptime: '72h' },
        { name: 'liceo_bolivar_db', status: 'connected', queries: 9870, avgLatency: '2.1ms', pool: '6/15', uptime: '72h' },
        { name: 'colegio_america_db', status: 'idle', queries: 234, avgLatency: '3.5ms', pool: '1/15', uptime: '24h' },
    ];

    useEffect(() => {
        const timer = setTimeout(() => setIsLoading(false), 800);
        return () => clearTimeout(timer);
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-3 border-violet-500/30 border-t-violet-500 rounded-full animate-spin"></div>
                    <p className="text-gray-400 text-sm">Cargando métricas del sistema...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Métricas del Sistema</h1>
                    <p className="mt-1 text-gray-400">Monitorea el rendimiento en tiempo real</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-sm text-emerald-400 font-medium">En línea</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
                {(['overview', 'cache', 'database'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab
                                ? 'bg-violet-600 text-white shadow-lg'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        {tab === 'overview' ? '📊 General' : tab === 'cache' ? '⚡ Caché Redis' : '🗄️ Base de Datos'}
                    </button>
                ))}
            </div>

            {/* Tab: Overview */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Grid de métricas */}
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {systemMetrics.map((metric) => (
                            <div key={metric.label} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 hover:bg-white/8 transition-colors">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xl">{metric.icon}</span>
                                    <span className="text-xs text-gray-400 truncate">{metric.label}</span>
                                </div>
                                <div className="text-xl font-bold text-white">{metric.value}</div>
                                <div className={`text-xs font-medium mt-1 ${
                                    metric.trend === 'up' ? 'text-emerald-400' :
                                    metric.trend === 'down' ? 'text-red-400' :
                                    'text-gray-400'
                                }`}>
                                    {metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '→'} {metric.change}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Gráfico placeholder de actividad */}
                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Actividad del Sistema (últimas 24h)</h3>
                        <div className="flex items-end gap-1 h-40">
                            {Array.from({ length: 24 }, (_, i) => {
                                const height = 20 + Math.random() * 80;
                                const isNow = i === 23;
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                        <div
                                            className={`w-full rounded-t-md transition-all duration-300 ${
                                                isNow ? 'bg-violet-500' : 'bg-violet-500/30 hover:bg-violet-500/50'
                                            }`}
                                            style={{ height: `${height}%` }}
                                        ></div>
                                        {i % 4 === 0 && (
                                            <span className="text-[10px] text-gray-500">{i}:00</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Tab: Cache */}
            {activeTab === 'cache' && (
                <div className="space-y-6">
                    {/* Stats de caché */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                            <div className="text-sm text-gray-400 mb-1">Hit Rate Global</div>
                            <div className="text-3xl font-bold text-emerald-400">99.7%</div>
                            <div className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '99.7%' }}></div>
                            </div>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                            <div className="text-sm text-gray-400 mb-1">Memoria Usada</div>
                            <div className="text-3xl font-bold text-violet-400">256 MB</div>
                            <div className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-violet-500 rounded-full" style={{ width: '51%' }}></div>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">de 512 MB asignados</div>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                            <div className="text-sm text-gray-400 mb-1">Keys Activas</div>
                            <div className="text-3xl font-bold text-amber-400">1,247</div>
                            <div className="text-xs text-gray-500 mt-3">TTL promedio: 4.2h</div>
                        </div>
                    </div>

                    {/* Tabla de caché */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <div className="p-5 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white">Cache Keys (Top)</h3>
                            <button className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium rounded-xl transition-colors">
                                🗑️ Flush All
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-white/5">
                                        <th className="px-5 py-3">Key</th>
                                        <th className="px-5 py-3">Hits</th>
                                        <th className="px-5 py-3">Misses</th>
                                        <th className="px-5 py-3">Ratio</th>
                                        <th className="px-5 py-3">Size</th>
                                        <th className="px-5 py-3">TTL</th>
                                        <th className="px-5 py-3">Último Acceso</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cacheMetrics.map((cache) => {
                                        const ratio = ((cache.hits / (cache.hits + cache.misses)) * 100).toFixed(1);
                                        return (
                                            <tr key={cache.key} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                <td className="px-5 py-3">
                                                    <code className="text-sm text-violet-300 bg-violet-500/10 px-2 py-0.5 rounded">{cache.key}</code>
                                                </td>
                                                <td className="px-5 py-3 text-sm text-emerald-400 font-medium">{cache.hits.toLocaleString()}</td>
                                                <td className="px-5 py-3 text-sm text-red-400">{cache.misses.toLocaleString()}</td>
                                                <td className="px-5 py-3">
                                                    <span className={`text-sm font-medium ${Number(ratio) > 99 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                        {ratio}%
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-sm text-gray-300">{cache.size}</td>
                                                <td className="px-5 py-3 text-sm text-gray-300">{cache.ttl}</td>
                                                <td className="px-5 py-3 text-sm text-gray-400">{cache.lastAccess}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab: Database */}
            {activeTab === 'database' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {dbConnections.map((db) => (
                            <div key={db.name} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 transition-colors">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">🗄️</span>
                                        <div>
                                            <h4 className="text-white font-semibold">{db.name}</h4>
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                                                db.status === 'connected' ? 'text-emerald-400' : 'text-amber-400'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${
                                                    db.status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
                                                }`}></span>
                                                {db.status === 'connected' ? 'Conectado' : 'Idle'}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-xs text-gray-500">Uptime: {db.uptime}</span>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <div className="text-xs text-gray-400 mb-1">Queries</div>
                                        <div className="text-lg font-bold text-white">{db.queries.toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-400 mb-1">Latencia Prom.</div>
                                        <div className="text-lg font-bold text-violet-400">{db.avgLatency}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-400 mb-1">Pool</div>
                                        <div className="text-lg font-bold text-amber-400">{db.pool}</div>
                                    </div>
                                </div>

                                {/* Pool bar */}
                                <div className="mt-4">
                                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-violet-500 rounded-full transition-all"
                                            style={{ width: `${(parseInt(db.pool) / parseInt(db.pool.split('/')[1])) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
