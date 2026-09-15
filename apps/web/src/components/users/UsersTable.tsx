import { User } from '@/types/user';
import { Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, FolderArchive, RotateCcw } from 'lucide-react';

type SortField = 'name' | 'email' | 'role';
type SortDirection = 'asc' | 'desc';

interface UsersTableProps {
    users: User[];
    isLoading: boolean;
    onEdit: (user: User) => void;
    onDelete: (user: User) => void;
    onArchive?: (user: User) => void;
    onUnarchive?: (user: User) => void;
    onView?: (user: User) => void;
    sortField?: SortField | null;
    sortDirection?: SortDirection;
    onSort?: (field: SortField) => void;
    viewMode?: 'active' | 'archived';
}

export function UsersTable({
    users,
    isLoading,
    onEdit,
    onDelete,
    onArchive,
    onUnarchive,
    onView,
    sortField,
    sortDirection,
    onSort,
    viewMode = 'active'
}: UsersTableProps) {
    const SortIcon = ({ column }: { column: SortField }) => {
        if (sortField !== column) return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
        return sortDirection === 'asc'
            ? <ArrowUp className="h-4 w-4 text-indigo-600" />
            : <ArrowDown className="h-4 w-4 text-indigo-600" />;
    };

    if (isLoading) {
        return <div className="text-center py-8">Cargando usuarios...</div>;
    }

    if (users.length === 0) {
        return <div className="text-center py-8 text-gray-500">No hay usuarios registrados.</div>;
    }

    return (
        <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                    <tr>
                        <th
                            scope="col"
                            className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${onSort ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                            onClick={() => onSort && onSort('name')}
                        >
                            <div className="flex items-center gap-2">
                                Nombre
                                {onSort && <SortIcon column="name" />}
                            </div>
                        </th>
                        <th
                            scope="col"
                            className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${onSort ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                            onClick={() => onSort && onSort('email')}
                        >
                            <div className="flex items-center gap-2">
                                Email
                                {onSort && <SortIcon column="email" />}
                            </div>
                        </th>
                        <th
                            scope="col"
                            className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${onSort ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                            onClick={() => onSort && onSort('role')}
                        >
                            <div className="flex items-center gap-2">
                                Rol
                                {onSort && <SortIcon column="role" />}
                            </div>
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Estado
                        </th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                            <span className="sr-only">Acciones</span>
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                    {users.map((user) => (
                        <tr
                            key={user.id}
                            onClick={() => onView && onView(user)}
                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                <div className="font-bold text-gray-900">{user.firstName} {user.lastName}</div>
                                <div className="text-gray-500 font-normal text-xs flex items-center gap-1.5 mt-0.5">
                                    <span className="font-mono">{user.studentCode || user.id}</span>
                                    {user.classroom && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                            <span>{user.classroom.name}</span>
                                            {(user.classroom as any).academicYear?.name && (
                                                <span className="text-[10px] text-indigo-500 font-normal">
                                                    • {(user.classroom as any).academicYear.name}
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{user.email}</td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${user.role === 'ADMIN' ? 'bg-yellow-50 text-yellow-700 ring-yellow-600/20' :
                                    user.role === 'TEACHER' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
                                        user.role === 'TUTOR' ? 'bg-purple-50 text-purple-700 ring-purple-600/20' :
                                            'bg-green-50 text-green-700 ring-green-600/20'
                                    }`}>
                                    {user.role === 'ADMIN' ? 'ADMINISTRADOR' :
                                        user.role === 'TEACHER' ? 'PROFESOR' :
                                            user.role === 'STUDENT' ? 'ESTUDIANTE' :
                                                user.role === 'TUTOR' ? 'TUTOR' : user.role}
                                </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {user.status === 'ARCHIVED' ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                                        <FolderArchive className="h-3.5 w-3.5 text-amber-500" />
                                        Archivado
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                                        Activo
                                    </span>
                                )}
                            </td>
                            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6" onClick={(e) => e.stopPropagation()}>
                                {user.status === 'ARCHIVED' ? (
                                    <>
                                        <button
                                            onClick={() => onUnarchive && onUnarchive(user)}
                                            className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md text-xs font-medium mr-2 transition-colors"
                                            title="Restaurar a Activo"
                                        >
                                            <RotateCcw size={14} />
                                            <span>Restaurar</span>
                                        </button>
                                        <button
                                            onClick={() => onDelete(user)}
                                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                                            title="Eliminar definitivamente"
                                        >
                                            <Trash2 size={14} />
                                            <span>Eliminar</span>
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => onEdit(user)}
                                            className="text-indigo-600 hover:text-indigo-900 mr-3 p-1 rounded hover:bg-indigo-50 transition-colors"
                                            title="Editar usuario"
                                        >
                                            <Pencil size={18} />
                                        </button>
                                        <button
                                            onClick={() => onArchive && onArchive(user)}
                                            className="text-amber-600 hover:text-amber-900 mr-3 p-1 rounded hover:bg-amber-50 transition-colors"
                                            title="Archivar usuario"
                                        >
                                            <FolderArchive size={18} />
                                        </button>
                                        <button
                                            onClick={() => onDelete(user)}
                                            className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors"
                                            title="Eliminar usuario"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
