import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input } from '@/components/ui';
import { CreateUserData, UserRole, Gender, User } from '@/types/user';
import { ENTIDADES_DE_NACIMIENTO } from '@/lib/entidades-federales';
import { Lista } from '@/components/ui/lista';
import { armarCedulaEscolar, cedulaEscolarLegible } from '@/lib/cedula-escolar';

const SIN_INDICAR = '__sin';

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
    nacionalidad: z.string().optional(),
    lugarDeNacimiento: z.string().max(120, 'Máximo 120 caracteres').optional(),
    entidadDeNacimiento: z.string().optional(),
    tipoDeCedula: z.string().optional(),
};



interface UserFormProps {
    onSubmit: (data: CreateUserData) => void;
    isLoading?: boolean;
    onCancel: () => void;
    initialData?: User | null;
}

/** Lo mismo que exige el servidor. Si cambia allí, cambia aquí. */
export const MINIMO_DE_CONTRASENA = 8;
const AVISO_DE_CONTRASENA = `Mínimo ${MINIMO_DE_CONTRASENA} caracteres`;

export function UserForm({ onSubmit, isLoading, onCancel, initialData }: UserFormProps) {
    // Si hay initialData (modo edición), password es opcional
    /**
     * OCHO, NO SEIS
     *
     * Esta pantalla pedía seis caracteres y ponía "Mínimo 6 caracteres" debajo
     * del campo. El servidor exige **ocho** desde que se cerró el agujero de la
     * contraseña de regalo.
     *
     * O sea: se le decía al administrador que seis valían, escribía seis, y al
     * guardar le rebotaba. La pantalla prometía algo que el sistema no cumple,
     * que es la peor forma de equivocarse: parece un fallo del sistema cuando es
     * la pantalla la que miente.
     *
     * El número vive en un solo sitio (`MINIMO_DE_CONTRASENA`) para que no se
     * vuelvan a separar.
     */
    const formSchema = z.object({
        ...baseSchema,
        gender: initialData
            ? baseSchema.gender
            : z.enum(['MASCULINO', 'FEMENINO', 'OTRO'] as const, { message: 'Elige el sexo' }),
        password: initialData
            ? z.string().min(MINIMO_DE_CONTRASENA, AVISO_DE_CONTRASENA).optional().or(z.literal(''))
            : z.string().min(MINIMO_DE_CONTRASENA, AVISO_DE_CONTRASENA),
    });

    const {
        register,
        handleSubmit,
        control,
        formState: { errors },
        reset,
        watch,
        setValue,
    } = useForm<any>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            role: 'STUDENT',
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
                nacionalidad: initialData.nacionalidad || '',
                lugarDeNacimiento: initialData.lugarDeNacimiento || '',
                entidadDeNacimiento: initialData.entidadDeNacimiento || '',
                tipoDeCedula: initialData.tipoDeCedula || '',
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
        // Los datos para el Ministerio son del alumno; vacío = se borra.
        if (cleanedData.role !== 'STUDENT') {
            for (const k of ['nacionalidad', 'lugarDeNacimiento', 'entidadDeNacimiento', 'tipoDeCedula']) delete cleanedData[k];
        }

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
                {initialData && (
                    <p className="text-xs text-gray-500">
                        Para cambiarla (p. ej. de la cédula escolar a la de identidad), «Cambiar cédula» en su ficha.
                    </p>
                )}
                {!initialData && watch('role') === 'STUDENT' && (
                    <ArmarCedulaEscolar
                        alArmar={(cedula, nacionalidad) => {
                            setValue('id', cedula, { shouldValidate: true });
                            setValue('tipoDeCedula', 'ESCOLAR');
                            setValue('nacionalidad', nacionalidad);
                        }}
                    />
                )}
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700">
                    {initialData ? 'Nueva Contraseña (Opcional)' : 'Contraseña'}
                </label>
                <Input
                    type="password"
                    {...register('password')}
                    className="mt-1"
                    placeholder={initialData ? "Dejar en blanco para mantener actual" : AVISO_DE_CONTRASENA}
                />
                {errors.password && <p className="text-xs text-red-500">{errors.password.message as string}</p>}
            </div>

            {initialData && (
                <div>
                    <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700">Fecha de Nacimiento (Opcional)</label>
                    <Input id="birthDate" type="date" {...register('birthDate')} className="mt-1" />
                    {errors.birthDate && <p className="text-xs text-red-500">{errors.birthDate.message as string}</p>}
                </div>
            )}

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
                    <label htmlFor="gender" className="block text-sm font-medium text-gray-700">Sexo</label>
                    <Controller
                        name="gender"
                        control={control}
                        render={({ field }) => (
                            <Select value={field.value || undefined} onValueChange={field.onChange}>
                                <SelectTrigger id="gender" className="mt-1 w-full">
                                    <SelectValue placeholder="Elegir" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MASCULINO">Masculino</SelectItem>
                                    <SelectItem value="FEMENINO">Femenino</SelectItem>
                                    {/* Solo para las fichas viejas que lo tengan: los documentos piden M o F. */}
                                    {field.value === 'OTRO' && <SelectItem value="OTRO">Otro</SelectItem>}
                                </SelectContent>
                            </Select>
                        )}
                    />
                    {errors.gender && <p className="text-xs text-red-500">{errors.gender.message as string}</p>}
                </div>
            </div>

            {!initialData && (
                <p className="text-xs text-gray-600">
                    Lo demás (nacimiento, teléfono, dirección, representantes, recaudos) se completa después, en su ficha.
                </p>
            )}

            {initialData && (
                <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Teléfono (Opcional)</label>
                    <Input id="phone" {...register('phone')} className="mt-1" />
                </div>
            )}

            {initialData && watch('role') === 'STUDENT' && (
                <fieldset className="space-y-3 rounded-xl border border-gray-200 p-3">
                    <legend className="px-1 text-sm font-semibold text-gray-800">Datos para los documentos del Ministerio</legend>
                    <p className="text-xs text-gray-600">Los piden el Resumen Final y la certificación de calificaciones.</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label htmlFor="nacionalidad" className="block text-sm font-medium text-gray-700">Nacionalidad</label>
                            <Controller
                                name="nacionalidad"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value || SIN_INDICAR} onValueChange={(v) => field.onChange(v === SIN_INDICAR ? '' : v)}>
                                        <SelectTrigger id="nacionalidad" className="mt-1 w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={SIN_INDICAR}>Sin indicar</SelectItem>
                                            <SelectItem value="V">Venezolana (V)</SelectItem>
                                            <SelectItem value="E">Extranjera (E)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                        <div>
                            <label htmlFor="tipoDeCedula" className="block text-sm font-medium text-gray-700">Se identifica con</label>
                            <Controller
                                name="tipoDeCedula"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value || SIN_INDICAR} onValueChange={(v) => field.onChange(v === SIN_INDICAR ? '' : v)}>
                                        <SelectTrigger id="tipoDeCedula" className="mt-1 w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={SIN_INDICAR}>Sin indicar</SelectItem>
                                            <SelectItem value="IDENTIDAD">Cédula de identidad</SelectItem>
                                            <SelectItem value="ESCOLAR">Cédula escolar</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                        <div>
                            <label htmlFor="lugarDeNacimiento" className="block text-sm font-medium text-gray-700">Lugar de nacimiento</label>
                            <Input id="lugarDeNacimiento" {...register('lugarDeNacimiento')} className="mt-1" placeholder="Ciudad o pueblo" />
                            {errors.lugarDeNacimiento && <p className="text-xs text-red-500">{errors.lugarDeNacimiento.message as string}</p>}
                        </div>
                        <div>
                            <label htmlFor="entidadDeNacimiento" className="block text-sm font-medium text-gray-700">Entidad federal de nacimiento</label>
                            <Controller
                                name="entidadDeNacimiento"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value || SIN_INDICAR} onValueChange={(v) => field.onChange(v === SIN_INDICAR ? '' : v)}>
                                        <SelectTrigger id="entidadDeNacimiento" className="mt-1 w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={SIN_INDICAR}>Sin indicar</SelectItem>
                                            {ENTIDADES_DE_NACIMIENTO.map((e) => (
                                                <SelectItem key={e} value={e}>{e}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                    </div>
                </fieldset>
            )}

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

/**
 * «El alumno no tiene cédula de identidad»: arma la cédula escolar con sus
 * cuatro partes (V/E, orden del parto, año de nacimiento y cédula de la madre)
 * y la pone como su cédula.
 */
export function ArmarCedulaEscolar({
    anioDeNacimiento,
    alArmar,
}: {
    anioDeNacimiento?: number;
    alArmar: (cedula: string, nacionalidad: 'V' | 'E') => void;
}) {
    const [abierto, setAbierto] = useState(false);
    const [nacionalidad, setNacionalidad] = useState<'V' | 'E'>('V');
    const [orden, setOrden] = useState('1');
    const [anio, setAnio] = useState(anioDeNacimiento ? String(anioDeNacimiento) : '');
    const [madre, setMadre] = useState('');
    const [error, setError] = useState<string | null>(null);

    if (!abierto) {
        return (
            <button type="button" onClick={() => setAbierto(true)} className="mt-1 min-h-11 text-sm font-semibold text-indigo-700 hover:underline">
                ¿No tiene cédula de identidad? Armar su cédula escolar
            </button>
        );
    }
    const armar = () => {
        const r = armarCedulaEscolar({
            nacionalidad,
            ordenDelParto: Number(orden),
            anioDeNacimiento: Number(anio || anioDeNacimiento),
            cedulaDeLaMadre: madre,
        });
        if ('error' in r) return setError(r.error);
        setError(null);
        alArmar(r.cedula, nacionalidad);
        setAbierto(false);
    };
    return (
        <div className="mt-2 space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3" role="group" aria-label="Armar la cédula escolar">
            <p className="text-xs text-gray-700">
                Nacionalidad + orden del parto + año de nacimiento + cédula de la madre (o del padre). Por ejemplo:{' '}
                <span className="font-mono">{cedulaEscolarLegible('V11212345678')}</span>.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="text-xs font-medium text-gray-700">
                    Nacionalidad
                    <Lista
                        etiqueta="Nacionalidad"
                        valor={nacionalidad}
                        alCambiar={(v) => setNacionalidad(v as 'V' | 'E')}
                        opciones={[{ valor: 'V', texto: 'V' }, { valor: 'E', texto: 'E' }]}
                        className="mt-1"
                    />
                </div>
                <label className="text-xs font-medium text-gray-700">
                    Orden del parto
                    <Input inputMode="numeric" value={orden} onChange={(e) => setOrden(e.target.value)} className="mt-1" aria-describedby="orden-ayuda" />
                </label>
                <label className="text-xs font-medium text-gray-700">
                    Año de nacimiento
                    <Input inputMode="numeric" value={anio} onChange={(e) => setAnio(e.target.value)} placeholder="2012" className="mt-1" />
                </label>
                <label className="text-xs font-medium text-gray-700">
                    Cédula de la madre
                    <Input inputMode="numeric" value={madre} onChange={(e) => setMadre(e.target.value)} placeholder="12345678" className="mt-1" />
                </label>
            </div>
            <p id="orden-ayuda" className="text-xs text-gray-500">Orden del parto: 1 si no es morocho; 2 para el segundo.</p>
            {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
            <div className="flex gap-2">
                <Button type="button" onClick={armar}>Poner esta cédula</Button>
                <Button type="button" onClick={() => setAbierto(false)} className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50">Cancelar</Button>
            </div>
        </div>
    );
}
