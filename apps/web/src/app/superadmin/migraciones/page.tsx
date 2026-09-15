'use client';

/**
 * Estado del esquema de cada liceo.
 *
 * Cada liceo tiene su propia base de datos, así que al publicar una versión hay
 * que migrarlas todas. El despliegue lo hace solo; esta pantalla existe para el
 * caso en que alguna se quede atrás: se ve cuál y se reintenta desde aquí, sin
 * entrar al servidor.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { superAdminFetch } from '@/lib/superadmin-fetch';

interface TenantStatus {
    instituteId: string;
    slug: string;
    name: string;
    databaseName: string | null;
    applied: number;
    pending: string[];
    failed: string[];
    lastApplied: string | null;
    upToDate: boolean;
    error?: string;
}

interface MigrationsResponse {
    localMigrations: string[];
    total: number;
    upToDate: number;
    behind: number;
    tenants: TenantStatus[];
}

export default function SuperAdminMigracionesPage() {
    const [data, setData] = useState<MigrationsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const res = await superAdminFetch('/api/superadmin/institutes/migrations');
            if (!res.ok) throw new Error('No se pudo consultar el estado');
            setData(await res.json());
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error al consultar');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const migrar = async (url: string, clave: string, exito: string) => {
        setWorking(clave);
        try {
            const res = await superAdminFetch(url, { method: 'POST' });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.message || body?.error || 'La migración falló');
            toast.success(exito);
            await cargar();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'La migración falló');
        } finally {
            setWorking(null);
        }
    };

    const atrasados = data?.tenants.filter((t) => !t.upToDate || t.error) ?? [];

    return (
        <div className="p-8">
            <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Migraciones</h1>
                    <p className="text-gray-400">
                        Versión de la base de datos de cada liceo frente a la del sistema publicado.
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={cargar}
                        className="px-4 py-2 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-700"
                    >
                        Actualizar
                    </button>
                    <button
                        onClick={() =>
                            migrar('/api/superadmin/institutes/migrations', 'todos', 'Liceos migrados')
                        }
                        disabled={working !== null || atrasados.length === 0}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
                    >
                        {working === 'todos' ? 'Migrando...' : `Migrar los que faltan (${atrasados.length})`}
                    </button>
                </div>
            </div>

            {loading && <div className="text-white">Cargando estado...</div>}

            {!loading && data && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <p className="text-gray-400 text-sm mb-1">Migraciones del sistema</p>
                            <p className="text-3xl font-bold text-white">{data.localMigrations.length}</p>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <p className="text-gray-400 text-sm mb-1">Liceos al día</p>
                            <p className="text-3xl font-bold text-green-400">{data.upToDate}</p>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <p className="text-gray-400 text-sm mb-1">Liceos atrasados</p>
                            <p className={`text-3xl font-bold ${data.behind > 0 ? 'text-amber-400' : 'text-white'}`}>
                                {data.behind}
                            </p>
                        </div>
                    </div>

                    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-900/60 text-gray-400 text-sm">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Liceo</th>
                                    <th className="px-6 py-3 font-medium">Base de datos</th>
                                    <th className="px-6 py-3 font-medium">Aplicadas</th>
                                    <th className="px-6 py-3 font-medium">Estado</th>
                                    <th className="px-6 py-3 font-medium text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {data.tenants.map((t) => (
                                    <tr key={t.instituteId} className="text-gray-200">
                                        <td className="px-6 py-4">
                                            <p className="font-medium text-white">{t.name}</p>
                                            <p className="text-xs text-gray-500">{t.slug}</p>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-400">
                                            {t.databaseName ?? 'sin aprovisionar'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {t.applied} / {data.localMigrations.length}
                                        </td>
                                        <td className="px-6 py-4">
                                            {t.error ? (
                                                <span className="text-red-400 text-sm">{t.error}</span>
                                            ) : t.upToDate ? (
                                                <span className="text-green-400 text-sm">Al día</span>
                                            ) : (
                                                <span className="text-amber-400 text-sm">
                                                    Faltan {t.pending.length}
                                                    {t.failed.length > 0 && ` · ${t.failed.length} a medias`}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {(!t.upToDate || t.error) && t.databaseName && (
                                                <button
                                                    onClick={() =>
                                                        migrar(
                                                            `/api/superadmin/institutes/${t.instituteId}/migrate`,
                                                            t.instituteId,
                                                            `${t.name} migrado`
                                                        )
                                                    }
                                                    disabled={working !== null}
                                                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500 disabled:opacity-40"
                                                >
                                                    {working === t.instituteId ? 'Migrando...' : 'Migrar'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
