'use client';

import { User } from '@/types/user';
import { Pencil, Trash2, FolderArchive, RotateCcw } from 'lucide-react';
import { TablaAdaptable } from '@/components/ui/tabla-adaptable';

/**
 * LA LISTA DE GENTE DEL LICEO
 *
 * Eran cinco columnas con `whitespace-nowrap` dentro de un `overflow-x-auto`:
 * 817 px en una pantalla de 390. Desde el teléfono había que arrastrar de lado
 * para llegar al rol o al botón de editar, y ordenar era imposible porque se
 * ordenaba pulsando la cabecera y la cabecera se salía de la pantalla.
 *
 * Ahora cada persona es una tarjeta con todo lo suyo, con el nombre y la cédula
 * arriba y el correo, el rol y el estado debajo. En pantalla ancha sigue siendo
 * la misma tabla.
 */

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

const NOMBRE_DEL_ROL: Record<string, string> = {
    ADMIN: 'ADMINISTRADOR',
    TEACHER: 'PROFESOR',
    STUDENT: 'ESTUDIANTE',
    TUTOR: 'TUTOR',
};

const COLOR_DEL_ROL: Record<string, string> = {
    ADMIN: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
    TEACHER: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    TUTOR: 'bg-purple-50 text-purple-700 ring-purple-600/20',
    STUDENT: 'bg-green-50 text-green-700 ring-green-600/20',
};

/** Los botones de una fila. Cada uno, 44 px: es lo que mide un dedo. */
const botonDeAccion =
    'inline-flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors';

export function UsersTable({
    users,
    isLoading,
    onEdit,
    onDelete,
    onArchive,
    onUnarchive,
    onView,
    sortField,
    sortDirection = 'asc',
    onSort,
}: UsersTableProps) {
    return (
        <TablaAdaptable<User>
            datos={users}
            cargando={isLoading}
            clave={(u) => u.id}
            alPulsar={onView ? (u) => onView(u) : undefined}
            orden={sortField ? { por: sortField, hacia: sortDirection } : null}
            alOrdenar={onSort ? (por) => onSort(por as SortField) : undefined}
            vacio={<p className="text-cuerpo text-tinta-suave">No hay usuarios registrados.</p>}
            columnas={[
                {
                    id: 'name',
                    titulo: 'Nombre',
                    principal: true,
                    ordenable: true,
                    celda: (u) => (
                        <div className="min-w-0">
                            {/* Se parte en dos líneas, no se corta: con `truncate`, un
                                nombre largo («Kleiver Josué Castellanos Echenique»)
                                no dejaba encoger la columna y la tabla se salía de la
                                pantalla en la tableta (862 px en 768). */}
                            <p className="break-words font-bold text-gray-900">
                                {u.firstName} {u.lastName}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-normal text-gray-600">
                                <span className="font-mono">{u.studentCode || u.id}</span>
                                {u.classroom && (
                                    <span className="inline-flex items-center gap-1 rounded border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">
                                        <span>{u.classroom.name}</span>
                                        {(u.classroom as any).academicYear?.name && (
                                            <span className="font-normal text-indigo-700">
                                                • {(u.classroom as any).academicYear.name}
                                            </span>
                                        )}
                                    </span>
                                )}
                            </p>
                        </div>
                    ),
                },
                {
                    id: 'email',
                    titulo: 'Email',
                    ordenable: true,
                    celda: (u) => <span className="break-all text-sm text-gray-600">{u.email}</span>,
                },
                {
                    id: 'role',
                    titulo: 'Rol',
                    ordenable: true,
                    celda: (u) => (
                        <span
                            className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                COLOR_DEL_ROL[u.role] ?? COLOR_DEL_ROL.STUDENT
                            }`}
                        >
                            {NOMBRE_DEL_ROL[u.role] ?? u.role}
                        </span>
                    ),
                },
                {
                    id: 'estado',
                    titulo: 'Estado',
                    celda: (u) =>
                        u.status === 'ARCHIVED' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                <FolderArchive className="h-3.5 w-3.5 text-amber-500" />
                                Archivado
                            </span>
                        ) : (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                Activo
                            </span>
                        ),
                },
                {
                    id: 'acciones',
                    titulo: 'Acciones',
                    acciones: true,
                    alinear: 'derecha',
                    celda: (u) => (
                        <span className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            {u.status === 'ARCHIVED' ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => onUnarchive && onUnarchive(u)}
                                        className={`${botonDeAccion} border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100`}
                                        title="Restaurar a Activo"
                                    >
                                        <RotateCcw size={14} />
                                        <span>Restaurar</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onDelete(u)}
                                        className={`${botonDeAccion} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`}
                                        title="Eliminar definitivamente"
                                    >
                                        <Trash2 size={14} />
                                        <span>Eliminar</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => onEdit(u)}
                                        className={`${botonDeAccion} border-transparent text-indigo-600 hover:bg-indigo-50`}
                                        title="Editar usuario"
                                    >
                                        <Pencil size={18} />
                                        <span className="sr-only">Editar</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onArchive && onArchive(u)}
                                        className={`${botonDeAccion} border-transparent text-amber-600 hover:bg-amber-50`}
                                        title="Archivar usuario"
                                    >
                                        <FolderArchive size={18} />
                                        <span className="sr-only">Archivar</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onDelete(u)}
                                        className={`${botonDeAccion} border-transparent text-red-600 hover:bg-red-50`}
                                        title="Eliminar usuario"
                                    >
                                        <Trash2 size={18} />
                                        <span className="sr-only">Eliminar</span>
                                    </button>
                                </>
                            )}
                        </span>
                    ),
                },
            ]}
        />
    );
}
