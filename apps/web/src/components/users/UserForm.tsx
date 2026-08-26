import { useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input } from '@/components/ui';
import { CreateUserData, UserRole, Gender, User } from '@/types/user';

// Esquema base
const baseSchema = {
    firstName: z.string().min(2, 'Nombre requerido'),
    lastName: z.string().min(2, 'Apellido requerido'),
    email: z.string().email('Email inválido'),
    id: z.string().min(5, 'Cédula requerida'), // Cédula/ID
    birthDate: z.string().optional(),
    role: z.enum(['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'] as const),
    gender: z.enum(['MASCULINO', 'FEMENINO', 'OTRO'] as const).optional(),
    phone: z.string().optional(),
};



interface UserFormProps {
    onSubmit: (data: CreateUserData) => void;
    isLoading?: boolean;
    onCancel: () => void;
    initialData?: User | null;
}

export function UserForm({ onSubmit, isLoading, onCancel, initialData }: UserFormProps) {
    // Si hay initialData (modo edición), password es opcional
    const formSchema = z.object({
        ...baseSchema,
        password: initialData
            ? z.string().min(6, 'Mínimo 6 caracteres').optional().or(z.literal(''))
            : z.string().min(6, 'Contraseña requerida'),
    });

    const {
        register,
        handleSubmit,
        control,
        formState: { errors },
        reset,
    } = useForm<any>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            role: 'STUDENT',
            gender: 'OTRO'
        }
    });

    useEffect(() => {
        if (initialData) {
            // Adaptar datos del usuario al formulario
            reset({
                firstName: initialData.firstName,
                lastName: initialData.lastName,
                email: initialData.email,
                id: initialData.id,
                role: initialData.role,
                phone: initialData.phone || '',
                // Verificar si birthDate viene como fecha
                birthDate: initialData.birthDate ? new Date(initialData.birthDate).toISOString().split('T')[0] : '',
                gender: initialData.gender || 'OTRO',
                password: '' // Contraseña vacía por defecto en edición
            });
        }
    }, [initialData, reset]);

    const onSubmitHandler = (data: CreateUserData) => {
        // Limpiar strings vacíos
        const cleanedData = { ...data } as any;

        if (!cleanedData.birthDate) delete cleanedData.birthDate;
        if (!cleanedData.phone) delete cleanedData.phone;
        if (!cleanedData.id) delete cleanedData.id;

        // Si estamos en edición y el password está vacío, lo eliminamos para no sobreescribirlo
        if (initialData && !cleanedData.password) {
            delete cleanedData.password;
        } else if (!cleanedData.password) {
            // En creación si está vacío (aunque el validador debería atraparlo)
            delete cleanedData.password;
        }

        onSubmit(cleanedData);
    };

    return (
        <form onSubmit={handleSubmit(onSubmitHandler)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">Nombre</label>
                    <Input id="firstName" {...register('firstName')} className="mt-1" />
                    {errors.firstName && <p className="text-xs text-red-500">{errors.firstName.message as string}</p>}
                </div>
                <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">Apellido</label>
                    <Input id="lastName" {...register('lastName')} className="mt-1" />
                    {errors.lastName && <p className="text-xs text-red-500">{errors.lastName.message as string}</p>}
                </div>
            </div>

            <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                <Input id="email" type="email" {...register('email')} className="mt-1" />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message as string}</p>}
            </div>

            <div>
                <label htmlFor="id" className="block text-sm font-medium text-gray-700">Cédula / ID</label>
                <Input
                    id="id"
                    {...register('id')}
                    className="mt-1"
                    placeholder="Ej: 12345678"
                    disabled={!!initialData} // Deshabilitar ID en edición
                />
                {errors.id && <p className="text-xs text-red-500">{errors.id.message as string}</p>}
                {initialData && <p className="text-xs text-gray-500">El ID no se puede modificar.</p>}
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700">
                    {initialData ? 'Nueva Contraseña (Opcional)' : 'Contraseña'}
                </label>
                <Input
                    type="password"
                    {...register('password')}
                    className="mt-1"
                    placeholder={initialData ? "Dejar en blanco para mantener actual" : "Mínimo 6 caracteres"}
                />
                {errors.password && <p className="text-xs text-red-500">{errors.password.message as string}</p>}
            </div>

            <div>
                <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700">Fecha de Nacimiento (Opcional)</label>
                <Input id="birthDate" type="date" {...register('birthDate')} className="mt-1" />
                {errors.birthDate && <p className="text-xs text-red-500">{errors.birthDate.message as string}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="role" className="block text-sm font-medium text-gray-700">Rol</label>
                    <Controller
                        name="role"
                        control={control}
                        render={({ field }) => (
                            <Select value={field.value || undefined} onValueChange={field.onChange}>
                                <SelectTrigger id="role" className="mt-1 w-full">
                                    <SelectValue placeholder="Seleccionar rol" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="STUDENT">Estudiante</SelectItem>
                                    <SelectItem value="TEACHER">Profesor</SelectItem>
                                    <SelectItem value="ADMIN">Administrador</SelectItem>
                                    <SelectItem value="TUTOR">Tutor</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    />
                </div>
                <div>
                    <label htmlFor="gender" className="block text-sm font-medium text-gray-700">Género</label>
                    <Controller
                        name="gender"
                        control={control}
                        render={({ field }) => (
                            <Select value={field.value || undefined} onValueChange={field.onChange}>
                                <SelectTrigger id="gender" className="mt-1 w-full">
                                    <SelectValue placeholder="Seleccionar género" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MASCULINO">Masculino</SelectItem>
                                    <SelectItem value="FEMENINO">Femenino</SelectItem>
                                    <SelectItem value="OTRO">Otro</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    />
                </div>
            </div>

            <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Teléfono (Opcional)</label>
                <Input id="phone" {...register('phone')} className="mt-1" />
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
                <Button type="button" onClick={onCancel} className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50">
                    Cancelar
                </Button>
                <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Guardando...' : (initialData ? 'Actualizar Usuario' : 'Guardar Usuario')}
                </Button>
            </div>
        </form>
    );
}
