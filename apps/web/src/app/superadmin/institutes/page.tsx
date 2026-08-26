'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SuperAdminLayout from '../layout';
import Link from 'next/link';

interface Institute {
    id: string;
    name: string;
    code: string;
    slug: string;
    subdomain: string;
    customDomain?: string;
    environment: string;
    email: string;
    phone?: string;
    status: string;
    plan: string;
    currentStudents: number;
    maxStudents: number;
    billingStatus: string;
    monthlyPrice: number;
    createdAt: string;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export default function SuperAdminInstitutesPage() {
    const [institutes, setInstitutes] = useState<Institute[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(1);
    const [deleteModal, setDeleteModal] = useState<{ show: boolean; institute: Institute | null }>({ show: false, institute: null });
    const [deleting, setDeleting] = useState(false);

    const fetchInstitutes = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '10',
                ...(search && { search }),
                ...(statusFilter && { status: statusFilter }),
            });

            const response = await fetch(
                `/api/superadmin/institutes?${params}`,
                {
                    credentials: 'include',
                    headers: {
                        'Authorization': `Bearer ${document.cookie.split('superadmin_access_token=')[1]?.split(';')[0]}`,
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                setInstitutes(data.institutes);
                setPagination(data.pagination);
            }
        } catch (error) {
            console.error('Error fetching institutes:', error);
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter]);

    useEffect(() => {
        fetchInstitutes();
    }, [page, search, statusFilter, fetchInstitutes]);

    const handleDeleteClick = (institute: Institute) => {
        setDeleteModal({ show: true, institute });
    };

    const handleDeleteConfirm = async () => {
        if (!deleteModal.institute) return;

        setDeleting(true);
        try {
            const response = await fetch(
                `/api/superadmin/institutes/${deleteModal.institute.id}`,
                {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: {
                        'Authorization': `Bearer ${document.cookie.split('superadmin_access_token=')[1]?.split(';')[0]}`,
                    },
                }
            );

            if (response.ok) {
                // Recargar la lista de institutos
                await fetchInstitutes();
                setDeleteModal({ show: false, institute: null });
            } else {
                const error = await response.json();
                toast.error(`Error al eliminar instituto: ${error.error || 'Error desconocido'}`);
            }
        } catch (error) {
            console.error('Error deleting institute:', error);
            toast.error('Error al eliminar instituto');
        } finally {
            setDeleting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        const styles = {
            ACTIVE: 'bg-green-600/20 text-green-400 border-green-600/50',
            SUSPENDED: 'bg-red-600/20 text-red-400 border-red-600/50',
            PENDING: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/50',
            INACTIVE: 'bg-gray-600/20 text-gray-400 border-gray-600/50',
            PROVISIONING: 'bg-blue-600/20 text-blue-400 border-blue-600/50',
            FAILED: 'bg-red-600/20 text-red-400 border-red-600/50',
        };
        return styles[status as keyof typeof styles] || styles.INACTIVE;
    };

    return (
        <SuperAdminLayout>
            <div className="p-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Institutos</h1>
                        <p className="text-gray-400">Gestión de institutos de la plataforma</p>
                    </div>
                    <Link
                        href="/superadmin/institutes/new"
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors flex items-center space-x-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Crear Instituto</span>
                    </Link>
                </div>

                {/* Filters */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Search */}
                        <div>
                            <label htmlFor="institute-search" className="block text-sm font-medium text-gray-300 mb-2">Buscar</label>
                            <input
                                id="institute-search"
                                type="text"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setPage(1);
                                }}
                                placeholder="Nombre, código o email..."
                                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                            />
                        </div>

                        {/* Status Filter */}
                        <div>
                            <label htmlFor="institute-status" className="block text-sm font-medium text-gray-300 mb-2">Estado</label>
                            <Select value={statusFilter || undefined} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Todos" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ACTIVE">Activo</SelectItem>
                                    <SelectItem value="SUSPENDED">Suspendido</SelectItem>
                                    <SelectItem value="PENDING">Pendiente</SelectItem>
                                    <SelectItem value="INACTIVE">Inactivo</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>


                    </div>
                </div>

                {/* Table */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center text-gray-400">Cargando...</div>
                    ) : institutes.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">No se encontraron institutos</div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-700/50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Instituto</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Código</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Estado</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Plan / Uso</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">URL de Acceso</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700">
                                        {institutes.map((institute) => (
                                            <tr key={institute.id} className="hover:bg-gray-700/30 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div>
                                                        <div className="text-sm font-medium text-white">{institute.name}</div>
                                                        <div className="text-sm text-gray-400">{institute.email}</div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-sm text-gray-300">{institute.code}</span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusBadge(institute.status)}`}>
                                                        {institute.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {(() => {
                                                        const pct = Math.min(Math.round((institute.currentStudents / (institute.maxStudents || 1)) * 100), 100);
                                                        const planColors: Record<string, string> = { BASIC: 'text-slate-300', PREMIUM: 'text-violet-400', ENTERPRISE: 'text-amber-400' };
                                                        const barColor = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
                                                        return (
                                                            <div className="min-w-[120px]">
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className={`text-xs font-bold ${planColors[institute.plan] || 'text-gray-400'}`}>{institute.plan}</span>
                                                                    {pct >= 90 && <span className="text-xs text-red-400">⚠️</span>}
                                                                </div>
                                                                <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                                                                    <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                                                                </div>
                                                                <p className="text-xs text-gray-500 mt-0.5">{institute.currentStudents.toLocaleString()}/{institute.maxStudents.toLocaleString()} alumnos</p>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {institute.subdomain || institute.slug ? (
                                                        <a
                                                            href={
                                                                typeof window !== 'undefined' && window.location.hostname.includes('localhost')
                                                                    ? `http://${institute.subdomain || institute.slug}.localhost:3000`
                                                                    : `/login?slug=${institute.slug || institute.subdomain}`
                                                            }
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-violet-400 hover:text-violet-300 text-sm font-mono flex items-center gap-1"
                                                        >
                                                            {typeof window !== 'undefined' && !window.location.hostname.includes('localhost')
                                                                ? `/login?slug=${institute.slug || institute.subdomain}`
                                                                : `${institute.subdomain || institute.slug}.localhost:3000`
                                                            }
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                            </svg>
                                                        </a>
                                                    ) : (
                                                        <span className="text-sm text-gray-500">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <div className="flex items-center justify-end gap-3">
                                                        <Link
                                                            href={`/superadmin/institutes/${institute.id}`}
                                                            className="text-violet-400 hover:text-violet-300 transition-colors"
                                                        >
                                                            Ver detalles
                                                        </Link>
                                                        <button
                                                            onClick={() => handleDeleteClick(institute)}
                                                            className="text-red-400 hover:text-red-300 transition-colors"
                                                            title="Eliminar instituto"
                                                        >
                                                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {pagination && pagination.totalPages > 1 && (
                                <div className="px-6 py-4 bg-gray-700/30 border-t border-gray-700 flex items-center justify-between">
                                    <div className="text-sm text-gray-400">
                                        Mostrando {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} institutos
                                    </div>
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => setPage(page - 1)}
                                            disabled={page === 1}
                                            className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
                                        >
                                            Anterior
                                        </button>
                                        <span className="px-3 py-1 text-gray-300">
                                            Página {pagination.page} de {pagination.totalPages}
                                        </span>
                                        <button
                                            onClick={() => setPage(page + 1)}
                                            disabled={page === pagination.totalPages}
                                            className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
                                        >
                                            Siguiente
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteModal.show && deleteModal.institute && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 border border-gray-700">
                        <div className="text-center">
                            {/* Warning Icon */}
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-900/20 mb-4">
                                <svg className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>

                            <h3 className="text-2xl font-bold text-white mb-2">
                                ¿Eliminar Instituto?
                            </h3>
                            <p className="text-gray-400 mb-2">
                                Estás a punto de eliminar el instituto <span className="text-violet-400 font-semibold">{deleteModal.institute.name}</span>.
                            </p>
                            <p className="text-red-400 text-sm mb-6">
                                Esta acción eliminará permanentemente la base de datos y todos los datos asociados. No se puede deshacer.
                            </p>

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => setDeleteModal({ show: false, institute: null })}
                                    disabled={deleting}
                                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDeleteConfirm}
                                    disabled={deleting}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {deleting ? 'Eliminando...' : 'Eliminar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </SuperAdminLayout>
    );
}
