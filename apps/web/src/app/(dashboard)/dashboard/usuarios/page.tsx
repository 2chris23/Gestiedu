'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, ChevronLeft, ChevronRight, Filter, FolderArchive, Users, RotateCcw, AlertTriangle } from 'lucide-react';
import { Input, Button } from '@/components/ui';
import { UsersTable } from '@/components/users/UsersTable';
import { UserForm } from '@/components/users/UserForm';
import { Modal } from '@/components/ui/Modal';
import { userService } from '@/services/user.service';
import { User, CreateUserData } from '@/types/user';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { UserProfileModal } from '@/components/users/UserProfileModal';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

export default function UsersPage() {
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');

    // Pagination & Filter States
    const [page, setPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('ALL');

    // Sorting states
    const [sortField, setSortField] = useState<'name' | 'email' | 'role' | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    /**
     * LA LISTA, DE LA MEMORIA DE LA APP
     *
     * Se pedía a mano y vivía solo mientras la pantalla estaba abierta: sin
     * conexión, «Usuarios» salía vacía aunque se hubiera mirado un minuto
     * antes. Pasando por React Query entra en lo que se guarda en el teléfono
     * (`MemoriaDelTelefono`), página por página y búsqueda por búsqueda.
     */
    const busqueda = useDebouncedValue(searchTerm, 500);
    // Buscar otra cosa vuelve a la primera página.
    useEffect(() => setPage(1), [busqueda]);

    const status = viewMode === 'archived' ? 'ARCHIVED' : 'ACTIVE';
    const lista = useQuery({
        queryKey: ['usuarios', 'lista', { page, busqueda, roleFilter, status }],
        queryFn: () => userService.getUsers({ page, limit: 10, search: busqueda, role: roleFilter, status }),
        // Al pasar de página se sigue viendo la anterior hasta que llegue la nueva.
        placeholderData: (anterior) => anterior,
    });
    const users: User[] = lista.data?.users ?? [];
    const totalPages = lista.data?.pagination.totalPages ?? 1;
    const totalUsers = lista.data?.pagination.total ?? 0;
    const isLoading = lista.isLoading;

    const archivados = useQuery({
        queryKey: ['usuarios', 'archivados'],
        queryFn: () => userService.getUsers({ limit: 1, status: 'ARCHIVED' }).then((r) => r.pagination.total),
    });
    const archivedCount = archivados.data ?? 0;

    useEffect(() => {
        if (lista.error && !esQueNoContesta(lista.error)) toast.error('Error al cargar usuarios');
    }, [lista.error]);

    /** Tras guardar, archivar o borrar: que la lista y el contador se vuelvan a pedir. */
    const refrescar = () => queryClient.invalidateQueries({ queryKey: ['usuarios'] });

    const handleSaveUser = async (data: CreateUserData) => {
        setIsSaving(true);
        try {
            if (editingUser) {
                await userService.updateUser(editingUser.id, data);
                toast.success('Usuario actualizado correctamente');
            } else {
                await userService.createUser(data);
                toast.success('Usuario creado correctamente');
            }
            // Invalidar lista de profesores (React Query) para que los modales
            // de asignación reflejen inmediatamente al usuario nuevo/actualizado
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
            refrescar();
            setIsModalOpen(false);
            setEditingUser(null);
        } catch (error) {
            console.error('Error saving user:', error);
            toast.error(error instanceof Error ? error.message : 'Error al guardar usuario');
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditUser = (user: User) => {
        setEditingUser(user);
        setIsModalOpen(true);
    }

    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [userToArchive, setUserToArchive] = useState<User | null>(null);

    const handleArchiveUser = async () => {
        if (!userToArchive) return;

        try {
            await userService.archiveUser(userToArchive.id);
            refrescar();
            toast.success(`Usuario ${userToArchive.firstName} ${userToArchive.lastName} archivado correctamente`);
        } catch (error) {
            console.error('Error archiving user:', error);
            toast.error(error instanceof Error ? error.message : 'Error al archivar usuario');
        } finally {
            setUserToArchive(null);
        }
    };

    const handleUnarchiveUser = async (user: User) => {
        try {
            await userService.unarchiveUser(user.id);
            refrescar();
            toast.success(`Usuario ${user.firstName} ${user.lastName} restaurado a Activo`);
        } catch (error) {
            console.error('Error unarchiving user:', error);
            toast.error(error instanceof Error ? error.message : 'Error al restaurar usuario');
        }
    };

    const handleDeleteUser = async () => {
        if (!userToDelete) return;

        try {
            await userService.deleteUser(userToDelete.id);
            refrescar();
            toast.success(`Usuario ${userToDelete.firstName} ${userToDelete.lastName} eliminado correctamente`);
        } catch (error) {
            console.error('Error deleting user:', error);
            toast.error(error instanceof Error ? error.message : 'Error al eliminar usuario');
        } finally {
            setUserToDelete(null);
        }
    };

    // Sorting logic
    const handleSort = (field: 'name' | 'email' | 'role') => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Sort users locally
    const sortedUsers = useMemo(() => {
        if (!sortField) return users;

        return [...users].sort((a, b) => {
            let aValue: string;
            let bValue: string;

            if (sortField === 'name') {
                aValue = `${a.firstName} ${a.lastName}`.toLowerCase();
                bValue = `${b.firstName} ${b.lastName}`.toLowerCase();
            } else if (sortField === 'email') {
                aValue = a.email.toLowerCase();
                bValue = b.email.toLowerCase();
            } else { // role
                aValue = a.role;
                bValue = b.role;
            }

            if (sortDirection === 'asc') {
                return aValue.localeCompare(bValue);
            } else {
                return bValue.localeCompare(aValue);
            }
        });
    }, [users, sortField, sortDirection]);

    const router = useRouter();

    const handleViewUser = (user: User) => {
        router.push(`/dashboard/usuarios/${user.id}`);
    };

    return (
        <div className="space-y-6">
            {/* Header con botón de carpeta para Usuarios Archivados */}
            {/* Sin `px-4` propio (el marco de la pantalla ya lo pone): con los dos, el
                título y los botones empezaban 16 px más adentro que la lista. */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-seccion font-bold text-gray-900 sm:text-pantalla">
                            {viewMode === 'archived' ? 'Carpeta de Usuarios Archivados' : 'Usuarios'}
                        </h1>
                        {viewMode === 'archived' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                                <FolderArchive className="h-3.5 w-3.5 text-amber-600" />
                                Vista Archivados
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                        {viewMode === 'archived'
                            ? 'Usuarios en pausa o retirados temporalmente. No pueden iniciar sesión y no aparecen en listas activas.'
                            : 'Gestiona administradores, profesores, estudiantes y personal.'}
                    </p>
                </div>
                {/* Que se repartan en dos filas en el teléfono: en una sola,
                    «Nuevo Usuario» se salía de la pantalla. */}
                <div className="flex flex-wrap items-center gap-2">
                    {viewMode === 'active' ? (
                        <Button
                            variant="outline"
                            onClick={() => { setViewMode('archived'); setPage(1); }}
                            className="inline-flex items-center gap-2 border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 transition-colors shadow-sm"
                            title="Abrir carpeta de usuarios archivados"
                        >
                            <FolderArchive className="h-4 w-4 text-amber-600" />
                            <span>Archivados</span>
                            {archivedCount > 0 && (
                                <span className="ml-1 bg-amber-200 text-amber-900 text-xs px-2 py-0.5 rounded-full font-bold">
                                    {archivedCount}
                                </span>
                            )}
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={() => { setViewMode('active'); setPage(1); }}
                            className="inline-flex items-center gap-2 border-indigo-300 text-indigo-900 bg-indigo-50 hover:bg-indigo-100 transition-colors shadow-sm"
                        >
                            <Users className="h-4 w-4 text-indigo-600" />
                            <span>Ver Usuarios Activos</span>
                        </Button>
                    )}
                    {viewMode === 'active' && (
                        <Button onClick={() => { setEditingUser(null); setIsModalOpen(true); }} className="w-auto">
                            <Plus aria-hidden />
                            Nuevo Usuario
                        </Button>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <Input
                        type="text"
                        placeholder="Buscar por nombre, email o cédula..."
                        className="pl-10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="w-full sm:w-48">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Filter className="h-4 w-4 text-gray-400" />
                        </div>
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            {/* pl-9: el embudo va encima, a la izquierda, y tapaba la «T» de «Todos». */}
                            <SelectTrigger className="w-full pl-9">
                                <SelectValue placeholder="Filtrar por rol" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos los roles</SelectItem>
                                <SelectItem value="ADMIN">Administrador</SelectItem>
                                <SelectItem value="TEACHER">Profesor</SelectItem>
                                <SelectItem value="STUDENT">Estudiante</SelectItem>
                                <SelectItem value="TUTOR">Tutor</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <UsersTable
                users={sortedUsers}
                isLoading={isLoading}
                onEdit={handleEditUser}
                onDelete={(user) => setUserToDelete(user)}
                onArchive={(user) => setUserToArchive(user)}
                onUnarchive={handleUnarchiveUser}
                onView={handleViewUser}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
                viewMode={viewMode}
            />

            {/* Pagination */}
            {!isLoading && users.length > 0 && (
                <div className="flex items-center justify-center border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-lg shadow-sm">
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                        <Button
                            variant="outline"
                            className="rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                        >
                            <span className="sr-only">Anterior</span>
                            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </Button>
                        <div className="px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300">
                            {page}
                        </div>
                        <Button
                            variant="outline"
                            className="rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                        >
                            <span className="sr-only">Siguiente</span>
                            <ChevronRight className="h-5 w-5" aria-hidden="true" />
                        </Button>
                    </nav>
                </div>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingUser(null); }}
                title={editingUser ? "Editar Usuario" : "Crear Nuevo Usuario"}
            >
                <UserForm
                    onSubmit={handleSaveUser}
                    isLoading={isSaving}
                    onCancel={() => { setIsModalOpen(false); setEditingUser(null); }}
                    initialData={editingUser}
                />
            </Modal>

            {/* Modal de confirmación de archivo */}
            <Modal
                isOpen={!!userToArchive}
                onClose={() => setUserToArchive(null)}
                title="Archivar Usuario"
            >
                <div className="space-y-4">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <FolderArchive className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                        <div className="text-sm text-amber-900">
                            <p className="font-semibold">
                                ¿Deseas archivar a {userToArchive?.firstName} {userToArchive?.lastName}?
                            </p>
                            <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                                El usuario no podrá iniciar sesión y se ocultará de las listas activas. Permanecerá guardado en la <strong>Carpeta de Archivados</strong> y podrás restaurarlo en cualquier momento.
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => setUserToArchive(null)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleArchiveUser}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
                        >
                            Archivar Usuario
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Modal de confirmación de eliminación diferenciada */}
            <Modal
                isOpen={!!userToDelete}
                onClose={() => setUserToDelete(null)}
                title="Confirmar Eliminación Definitiva"
            >
                <div className="space-y-4">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                        <div className="text-sm text-red-900">
                            <p className="font-semibold">
                                ¿Eliminar definitivamente a {userToDelete?.firstName} {userToDelete?.lastName} ({userToDelete?.id})?
                            </p>
                            {userToDelete?.role === 'STUDENT' ? (
                                <p className="mt-2 text-xs text-red-800 leading-relaxed">
                                    <strong>Eliminación en Cascada:</strong> Se eliminarán todas sus notas, asistencias, matrículas e historial académico para no dejar datos huérfanos. Su cédula y correo quedarán completamente liberados para volver a registrarse.
                                </p>
                            ) : userToDelete?.role === 'TEACHER' ? (
                                <p className="mt-2 text-xs text-red-800 leading-relaxed">
                                    <strong>Preservación Histórica:</strong> Se conservará su nombre y apellido en el historial de actividades y notas que impartió en el plantel. Se desvinculará de las aulas y horarios activos. Su cédula y correo quedarán liberados para volver a registrarse.
                                </p>
                            ) : (
                                <p className="mt-2 text-xs text-red-800 leading-relaxed">
                                    Esta acción eliminará permanentemente al usuario y liberará su cédula y correo.
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => setUserToDelete(null)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleDeleteUser}
                            className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                        >
                            Eliminar Definitivamente
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
