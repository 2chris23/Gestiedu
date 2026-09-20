import { Fragment, useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, Transition } from '@headlessui/react';
import { X, BookOpen } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Classroom, CreateClassroomDto, classroomService } from '../../services/classroom.service';
import { academicYearService, AcademicYear } from '../../services/academic-year.service';

const schema = z.object({
    academicYearId: z.string().min(1, 'Periodo escolar requerido'),
    grade: z.coerce.number().min(1).max(6),
    section: z.string().min(1, 'Sección requerida'),
    shift: z.enum(['MANANA', 'TARDE', 'INTEGRAL']).default('MANANA'),
    capacity: z.coerce.number().min(1).default(35),
});

type FormInput = z.input<typeof schema>;
type FormData = z.output<typeof schema>;

interface ClassroomModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    classroomToEdit?: Classroom | null;
    defaultYearId?: string;
    defaultGrade?: number;
    existingClassrooms?: Array<{ section: string; shift?: string }>;
    existingSections?: string[];
}

export default function ClassroomModal({
    isOpen,
    onClose,
    onSuccess,
    classroomToEdit,
    defaultYearId,
    defaultGrade,
    existingClassrooms,
    existingSections = []
}: ClassroomModalProps) {
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
    const SECTION_OPTIONS = Array.from({ length: 10 }, (_, i) => String.fromCharCode(65 + i)); // A-J

    const {
        register,
        handleSubmit,
        control,
        reset,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<FormInput, any, FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            capacity: 35,
            shift: 'MANANA'
        }
    });

    const selectedSection = watch('section');
    const selectedShift = watch('shift') || 'MANANA';
    const isSectionTaken = (sec: string) => {
        if (!sec || classroomToEdit) return false;
        if (existingClassrooms && existingClassrooms.length > 0) {
            return existingClassrooms.some(c => c.section === sec && (c.shift || 'MANANA') === selectedShift);
        }
        return existingSections.includes(sec);
    };
    const duplicateWarning = isSectionTaken(selectedSection);

    useEffect(() => {
        const loadYears = async () => {
            try {
                const years = await academicYearService.getAcademicYears();
                setAcademicYears(years);

                if (!classroomToEdit) {
                    if (defaultYearId) {
                        setValue('academicYearId', defaultYearId);
                    } else {
                        const active = years.find(y => y.status === 'ACTIVE');
                        if (active) setValue('academicYearId', active.id);
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }
        if (isOpen) loadYears();
    }, [isOpen, classroomToEdit, setValue, defaultYearId]);

    useEffect(() => {
        if (isOpen) {
            if (classroomToEdit) {
                setValue('academicYearId', classroomToEdit.academicYearId);
                setValue('grade', classroomToEdit.grade);
                setValue('section', classroomToEdit.section);
                setValue('shift', (classroomToEdit.shift as any) || 'MANANA');
                setValue('capacity', classroomToEdit.capacity || 35);
            } else {
                reset({
                    academicYearId: defaultYearId || '',
                    grade: defaultGrade || 1,
                    section: '', // Force user to select
                    shift: 'MANANA',
                    capacity: 35
                });
            }
        }
    }, [isOpen, classroomToEdit, setValue, reset, defaultYearId, defaultGrade]);

    const onSubmit = async (data: FormData) => {
        if (duplicateWarning) {
            toast.error(`La sección "${data.section}" ya existe en este grado.`);
            return;
        }

        try {
            if (classroomToEdit) {
                await classroomService.updateClassroom(classroomToEdit.id, data);
                toast.success('Aula actualizada correctamente');
            } else {
                await classroomService.createClassroom(data);
                toast.success('Aula creada correctamente');
            }
            onSuccess();
            onClose();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error al guardar el aula');
        }
    };

    return (
        <Transition show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:w-full sm:max-w-md border border-gray-100">
                                <div className="absolute right-4 top-4">
                                    <button
                                        type="button"
                                        className="rounded-full p-1 bg-gray-50 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none"
                                        onClick={onClose}
                                    >
                                        <X className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </div>

                                <div className="p-8">
                                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-6 shadow-sm">
                                        <BookOpen className="h-7 w-7" aria-hidden="true" />
                                    </div>

                                    <div className="text-center mb-8">
                                        <Dialog.Title as="h3" className="text-xl font-bold leading-6 text-gray-900">
                                            {classroomToEdit ? 'Editar Sección' : 'Nueva Sección'}
                                        </Dialog.Title>
                                        <p className="mt-2 text-sm text-gray-500">
                                            {classroomToEdit
                                                ? 'Modifica los detalles de la sección escolar.'
                                                : `Agregando nueva sección al ${defaultGrade ? defaultGrade + '° Grado' : 'grado seleccionado'}.`
                                            }
                                        </p>
                                    </div>

                                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                                        {/* Hidden fields if context is provided */}
                                        <div className={defaultYearId ? 'hidden' : ''}>
                                            <label htmlFor="academicYearId" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Año Escolar</label>
                                            <Controller
                                                name="academicYearId"
                                                control={control}
                                                render={({ field }) => (
                                                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                                                        <SelectTrigger id="academicYearId" className="w-full">
                                                            <SelectValue placeholder="Seleccionar..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {academicYears.map(year => (
                                                                <SelectItem key={year.id} value={year.id}>
                                                                    {year.name} ({year.status})
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                            {errors.academicYearId && <p className="text-red-500 text-xs mt-1 ml-1 font-medium">{errors.academicYearId.message}</p>}
                                        </div>

                                        <div className={defaultGrade ? 'hidden' : ''}>
                                            <label htmlFor="grade" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Grado / Año</label>
                                            <Controller
                                                name="grade"
                                                control={control}
                                                render={({ field }) => (
                                                    <Select value={String(field.value || 1)} onValueChange={(val) => field.onChange(Number(val))}>
                                                        <SelectTrigger id="grade" className="w-full">
                                                            <SelectValue placeholder="Seleccionar año..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="1">1er Año</SelectItem>
                                                            <SelectItem value="2">2do Año</SelectItem>
                                                            <SelectItem value="3">3er Año</SelectItem>
                                                            <SelectItem value="4">4to Año</SelectItem>
                                                            <SelectItem value="5">5to Año</SelectItem>
                                                            <SelectItem value="6">6to Año (Educación Media Técnica)</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                            {errors.grade && <p className="text-red-500 text-xs mt-1 ml-1 font-medium">{errors.grade.message}</p>}
                                        </div>

                                        <div>
                                            <label htmlFor="shift" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Turno / Horario</label>
                                            <Controller
                                                name="shift"
                                                control={control}
                                                render={({ field }) => (
                                                    <Select value={field.value || 'MANANA'} onValueChange={field.onChange}>
                                                        <SelectTrigger id="shift" className="w-full">
                                                            <SelectValue placeholder="Seleccionar turno..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="MANANA">Turno Mañana (Matutino: 07:00 - 12:15)</SelectItem>
                                                            <SelectItem value="TARDE">Turno Tarde (Vespertino: 13:00 - 17:30)</SelectItem>
                                                            <SelectItem value="INTEGRAL">Turno Integral / Completo</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                            {errors.shift && <p className="text-red-500 text-xs mt-1 ml-1 font-medium">{errors.shift.message}</p>}
                                        </div>

                                        <div className="grid grid-cols-2 gap-5">
                                            <div>
                                                <label htmlFor="section" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Nombre de la Sección</label>
                                                <Controller
                                                    name="section"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                                                            <SelectTrigger
                                                                id="section"
                                                                className={`w-full font-semibold text-center ${duplicateWarning ? 'border-red-300 bg-red-50 text-red-900' : ''}`}
                                                            >
                                                                <SelectValue placeholder="--" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {SECTION_OPTIONS.map(opt => (
                                                                    <SelectItem key={opt} value={opt} disabled={isSectionTaken(opt)}>
                                                                        {opt}{isSectionTaken(opt) ? ' (Existe)' : ''}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                                {errors.section && <p className="text-red-500 text-xs mt-1 ml-1 font-medium">{errors.section.message}</p>}
                                                {duplicateWarning && <p className="text-red-600 text-xs mt-1 ml-1 font-bold">⚠️ Esta sección ya existe</p>}
                                            </div>

                                            <div>
                                                <label htmlFor="capacity" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Capacidad</label>
                                                <input
                                                    id="capacity"
                                                    type="number"
                                                    {...register('capacity')}
                                                    className="block w-full rounded-xl border-gray-200 bg-gray-50/50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2.5 px-3 transition-colors outline-none"
                                                />
                                                {errors.capacity && <p className="text-red-500 text-xs mt-1 ml-1 font-medium">{errors.capacity.message}</p>}
                                            </div>
                                        </div>

                                        <div className="mt-8 flex gap-3">
                                            <button
                                                type="button"
                                                className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-200 transition-colors"
                                                onClick={onClose}
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={isSubmitting || duplicateWarning}
                                                className="flex-1 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isSubmitting ? 'Guardando...' : classroomToEdit ? 'Actualizar' : 'Crear Sección'}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
