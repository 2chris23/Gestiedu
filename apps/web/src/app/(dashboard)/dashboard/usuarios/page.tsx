'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Input, Button } from '@/components/ui';
import { UsersTable } from '@/components/users/UsersTable';
import { UserForm } from '@/components/users/UserForm';
import { Modal } from '@/components/ui/Modal';
import { userService } from '@/services/user.service';
import { User, CreateUserData } from '@/types/user';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { UserProfileModal } from '@/components/users/UserProfileModal';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function UsersPage() {
    const queryClient = useQueryClient();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [editingUser, setEditingUser] = useState<User | null>(null);
    // const [viewingUserId, setViewingUserId] = useState<string | null>(null);

    // Pagination & Filter States
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('ALL');

    // Sorting states
    const [sortField, setSortField] = useState<'name' | 'email' | 'role' | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const loadUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await userService.getUsers({
                page,
                limit: 10,
                search: searchTerm,
                role: roleFilter
            });
            setUsers(data.users);
            setTotalPages(data.pagination.totalPages);
            setTotalUsers(data.pagination.total);
        } catch (error) {
            console.error('Error loading users:', error);
            toast.error('Error al cargar usuarios');
        } finally {
            setIsLoading(false);
        }
    }, [page, searchTerm, roleFilter]);

    useEffect(() => {
        loadUsers();
    }, [page, roleFilter, loadUsers]); // Reload when page or role changes

    // Debounce search could be added here, for now using a search button or confirm
    // Or simple effect on search term if we want instant search
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1); // Reset to page 1 on search
            loadUsers();
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps -- el debounce depende solo de searchTerm a propósito: loadUsers usa el valor más reciente y page como dep rompería la paginación

    const handleSaveUser = async (data: CreateUserData) => {
        setIsSaving(true);
        try {
            if (editingUser) {
                const updatedUser = await userService.updateUser(editingUser.id, data);
                setUsers((prev) => prev.map(u => u.id === editingUser.id ? updatedUser : u));
                toast.success('Usuario actualizado correctamente');
            } else {
                const newUser = await userService.createUser(data);
                setUsers((prev) => [newUser, ...prev]);
                toast.success('Usuario creado correctamente');
            }
            // Invalidar lista de profesores (React Query) para que los modales
            // de asignación reflejen inmediatamente al usuario nuevo/actualizado
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
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

    const [userToDelete, setUserToDelete] = useState<string | null>(null);

    const handleDeleteUser = async () => {
        if (!userToDelete) return;

        try {
            await userService.deleteUser(userToDelete);
            setUsers((prev) => prev.filter(u => u.id !== userToDelete));
            toast.success('Usuario eliminado correctamente');
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


    // ... inside component ...
    const router = useRouter();

    const handleViewUser = (user: User) => {
        router.push(`/dashboard/usuarios/${user.id}`);
    };

    return (
        <div className="space-y-6">
            {/* ... header ... */}
            <div className="flex justify-between items-center px-4 sm:px-0">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Usuarios</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Gestiona administradores, profesores y personal.
                    </p>
                </div>
                <Button onClick={() => { setEditingUser(null); setIsModalOpen(true); }} className="w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Nuevo Usuario
                </Button>
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
                            <SelectTrigger className="w-full">
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
                onDelete={(id) => setUserToDelete(id)}
                onView={handleViewUser}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
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

            {/* Modal de confirmación de eliminación */}
            <Modal
                isOpen={!!userToDelete}
                onClose={() => setUserToDelete(null)}
                title="Confirmar Eliminación"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        ¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer.
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button
                            variant="outline"
                            onClick={() => setUserToDelete(null)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleDeleteUser}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            Eliminar
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
