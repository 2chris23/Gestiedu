'use client';

import { useEffect, useState, useCallback } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import Link from 'next/link';

interface Stats {
    totalInstitutes: number;
    activeInstitutes: number;
    totalUsers: number;
    statusDistribution?: {
        ACTIVE?: number;
        PENDING?: number;
        SUSPENDED?: number;
        PROVISIONING?: number;
        FAILED?: number;
    };
}

interface CacheMetrics {
    hits: number;
    misses: number;
    invalidations: number;
    hitRate: number;
    totalRequests: number;
    uptime?: { minutes: number; hours: number };
    requestsPerMinute?: number;
}

function getAuthHeader() {
    if (typeof document === 'undefined') return '';
    return document.cookie.split('superadmin_access_token=')[1]?.split(';')[0] || '';
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');

export default function SuperAdminDashboardPage() {
    const confirmDialog = useConfirm();
    const [stats, setStats] = useState<Stats | null>(null);
    const [cacheMetrics, setCacheMetrics] = useState<CacheMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [cacheLoading, setCacheLoading] = useState(true);
    const [resetting, setResetting] = useState(false);
    const [resetMsg, setResetMsg] = useState('');

    const fetchStats = useCallback(async () => {
        try {
            const response = await fetch(`/api/superadmin/stats`, {
                credentials: 'include',
                headers: { 'Authorization': `Bearer ${getAuthHeader()}` },
            });
            if (response.ok) setStats(await response.json());
        } catch (error) {
            console.error('Error fetching stats:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchCacheMetrics = useCallback(async () => {
        try {
            const response = await fetch(`/api/superadmin/metrics/cache`, {
                credentials: 'include',
                headers: { 'Authorization': `Bearer ${getAuthHeader()}` },
            });
            if (response.ok) {
                const data = await response.json();
                setCacheMetrics(data.metrics);
            }
        } catch (error) {
            console.error('Error fetching cache metrics:', error);
        } finally {
            setCacheLoading(false);
        }
    }, []);

    const handleResetCache = async () => {
        if (!(await confirmDialog({ title: '¿Resetear las métricas de cache?' }))) return;
        setResetting(true);
        setResetMsg('');
        try {
            const response = await fetch(`/api/superadmin/metrics/cache/reset`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Authorization': `Bearer ${getAuthHeader()}` },
            });
            if (response.ok) {
                setResetMsg('✅ Métricas reseteadas.');
                await fetchCacheMetrics();
            }
        } catch (error) {
            setResetMsg('❌ Error al resetear métricas.');
        } finally {
            setResetting(false);
            setTimeout(() => setResetMsg(''), 3000);
        }
    };

    useEffect(() => {
        fetchStats();
        fetchCacheMetrics();
    }, [fetchStats, fetchCacheMetrics]);

    function getCacheHealth(hitRate: number) {
        if (hitRate >= 70) return { label: 'Excelente', color: 'text-green-300', bg: 'bg-green-500/20', border: 'border-green-500/30', dot: 'bg-green-400' };
        if (hitRate >= 40) return { label: 'Moderado', color: 'text-yellow-300', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', dot: 'bg-yellow-400' };
        return { label: 'Bajo', color: 'text-red-300', bg: 'bg-red-500/20', border: 'border-red-500/30', dot: 'bg-red-400' };
    }

    return (
        <div className="p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
                <p className="text-gray-400">Vista general de la plataforma</p>
            </div>

            {/* Stats Cards */}
            {loading ? (
                <div className="text-white mb-8">Cargando estadísticas...</div>
            ) : stats ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-blue-600/20 rounded-lg">
                                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-1">{stats.totalInstitutes}</h3>
                        <p className="text-sm text-gray-400">Total Institutos</p>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-green-600/20 rounded-lg">
                                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-1">{stats.activeInstitutes}</h3>
                        <p className="text-sm text-gray-400">Institutos Activos</p>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-purple-600/20 rounded-lg">
                                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-1">{stats.totalUsers}</h3>
                        <p className="text-sm text-gray-400">Total Usuarios</p>
                    </div>
                </div>
            ) : null}

            {/* Cache Performance Section */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 mb-8 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-600/20 rounded-lg">
                            <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Cache Performance</h2>
                            <p className="text-xs text-gray-400">Sistema de cache diferenciado READ-ONLY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {resetMsg && <span className="text-sm">{resetMsg}</span>}
                        <button
                            onClick={() => fetchCacheMetrics()}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                            title="Actualizar métricas"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                        <button
                            onClick={handleResetCache}
                            disabled={resetting}
                            className="px-3 py-1.5 text-sm text-red-300 hover:text-red-200 hover:bg-red-500/10 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {resetting ? 'Reseteando...' : 'Reset'}
                        </button>
                    </div>
                </div>

                {cacheLoading ? (
                    <div className="p-6 text-gray-400 text-sm">Cargando métricas de cache...</div>
                ) : cacheMetrics ? (() => {
                    const health = getCacheHealth(cacheMetrics.hitRate);
                    return (
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-6">
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${health.bg} ${health.border}`}>
                                    <span className={`w-2 h-2 rounded-full ${health.dot} animate-pulse`}></span>
                                    <span className={`text-sm font-medium ${health.color}`}>{health.label}</span>
                                </div>
                                <span className="text-gray-400 text-sm">
                                    Objetivo: <span className="text-green-300">&gt; 70% hit rate</span>
                                </span>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/50">
                                    <div className="flex items-end gap-1 mb-1">
                                        <span className={`text-3xl font-bold ${health.color}`}>
                                            {cacheMetrics.hitRate.toFixed(1)}
                                        </span>
                                        <span className="text-gray-400 text-lg mb-0.5">%</span>
                                    </div>
                                    <p className="text-xs text-gray-400">Hit Rate</p>
                                    <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${cacheMetrics.hitRate >= 70 ? 'bg-green-400' : cacheMetrics.hitRate >= 40 ? 'bg-yellow-400' : 'bg-red-400'}`}
                                            style={{ width: `${Math.min(cacheMetrics.hitRate, 100)}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/50">
                                    <p className="text-3xl font-bold text-green-300 mb-1">{cacheMetrics.hits.toLocaleString()}</p>
                                    <p className="text-xs text-gray-400">Cache Hits</p>
                                    <p className="text-xs text-green-300/90 mt-1">X-Cache: HIT</p>
                                </div>

                                <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/50">
                                    <p className="text-3xl font-bold text-orange-300 mb-1">{cacheMetrics.misses.toLocaleString()}</p>
                                    <p className="text-xs text-gray-400">Cache Misses</p>
                                    <p className="text-xs text-orange-300/90 mt-1">X-Cache: MISS</p>
                                </div>

                                <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/50">
                                    <p className="text-3xl font-bold text-violet-400 mb-1">{cacheMetrics.invalidations.toLocaleString()}</p>
                                    <p className="text-xs text-gray-400">Invalidaciones</p>
                                    <p className="text-xs text-violet-300/90 mt-1">Total: {cacheMetrics.totalRequests.toLocaleString()}</p>
                                </div>
                            </div>

                            {cacheMetrics.uptime && (
                                <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
                                    <span>Uptime: {cacheMetrics.uptime.hours > 0 ? `${cacheMetrics.uptime.hours}h ` : ''}{cacheMetrics.uptime.minutes % 60}m</span>
                                    {cacheMetrics.requestsPerMinute !== undefined && <span>Req/min: {cacheMetrics.requestsPerMinute}</span>}
                                    <span className="ml-auto">Solo usuarios STUDENT y PARENT son cacheados</span>
                                </div>
                            )}
                        </div>
                    );
                })() : (
                    <div className="p-6 text-gray-500 text-sm">No hay métricas disponibles</div>
                )}
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h2 className="text-xl font-bold text-white mb-4">Acciones Rápidas</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Link
                        href="/superadmin/institutes/new"
                        className="flex items-center space-x-3 p-4 bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
                    >
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-white font-medium">Crear Instituto</span>
                    </Link>

                    <Link
                        href="/superadmin/institutes"
                        className="flex items-center space-x-3 p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                    >
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <span className="text-white font-medium">Ver Institutos</span>
                    </Link>

                    <Link
                        href="/superadmin/plans"
                        className="flex items-center space-x-3 p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                    >
                        <span className="text-2xl">💎</span>
                        <span className="text-white font-medium">Planes</span>
                    </Link>

                    <button
                        onClick={fetchCacheMetrics}
                        className="flex items-center space-x-3 p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                    >
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="text-white font-medium">Actualizar Cache</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
