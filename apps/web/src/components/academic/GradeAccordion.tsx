import { useState, Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { ChevronDown, Plus, Users, MoreHorizontal, Pencil, Trash } from 'lucide-react';
import { Classroom } from '@/services/classroom.service';
import AcademicStats from './AcademicStats';
import { toast } from 'sonner';
import Link from 'next/link';
import TurnoBadge from '@/components/common/TurnoBadge';

interface GradeAccordionProps {
    grade: number;
    classrooms: Classroom[];
    onAddSection: (grade: number) => void;
    onEditSection: (classroom: Classroom) => void;
    onDeleteSection: (id: string) => void;
    academicYearId?: string;
    yearSlug?: string;
    stats?: {
        average: number;
        riskCount: number;
        occupancy: string;
        attendance: string;
        observations: number;
    };
}

export default function GradeAccordion({ grade, classrooms, onAddSection, onEditSection, onDeleteSection, academicYearId, yearSlug, stats }: GradeAccordionProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={`
            border rounded-xl bg-white shadow-sm transition-all duration-300
            ${isOpen ? 'ring-2 ring-indigo-50 border-indigo-100 relative z-20' : 'border-gray-200 hover:border-indigo-200 relative z-0'}
        `}>
            {/* Header / Trigger */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between p-5 cursor-pointer bg-white select-none"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setIsOpen(!isOpen);
                    }
                }}
            >
                <div className="flex items-center gap-5">
                    <div className={`
                        h-12 w-12 rounded-xl flex items-center justify-center font-bold text-xl transition-colors
                        ${isOpen ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500'}
                    `}>
                        {grade}°
                    </div>
                    <div>
                        <h3 className={`font-bold text-lg ${isOpen ? 'text-indigo-900' : 'text-gray-700'}`}>
                            {grade === 1 ? 'Primer' : grade === 2 ? 'Segundo' : grade === 3 ? 'Tercer' : grade === 4 ? 'Cuarto' : grade === 5 ? 'Quinto' : 'Sexto'} Año
                        </h3>
                        <p className="text-sm text-gray-400 mt-0.5">
                            {classrooms.length} Secciones
                        </p>
                    </div>
                </div>
                <div className={`
                    p-2 rounded-full transition-all duration-300
                    ${isOpen ? 'bg-indigo-50 text-indigo-600 rotate-180' : 'bg-gray-50 text-gray-400'}
                `}>
                    <ChevronDown className="w-5 h-5" />
                </div>
            </div>

            {/* Content Body */}
            {isOpen && (
                <div className="animate-in slide-in-from-top-2 duration-300 bg-white">
                    {/* Year-level Stats Panel */}
                    <div className="px-6 py-5 border-t border-b border-gray-100 bg-gray-50/30">
                        {stats ? (
                            <AcademicStats stats={stats} />
                        ) : (
                            <AcademicStats stats={{
                                average: 0,
                                riskCount: 0,
                                occupancy: `0/0`,
                                attendance: `0%`,
                                observations: 0
                            }} />
                        )}
                    </div>

                    <div className="p-6 bg-gray-50/50">
                        <div className="flex items-center justify-between mb-5">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <Users className="w-4 h-4" /> Secciones
                            </h4>
                            <button
                                onClick={(e) => { e.stopPropagation(); onAddSection(grade); }}
                                className="text-xs flex items-center gap-1.5 font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                <Plus className="w-3 h-3" /> Crear
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {classrooms.map(c => {
                                const capacity = c.capacity || 35;
                                const count = c._count?.students || 0;
                                const percentage = Math.min((count / capacity) * 100, 100);
                                const isFull = count >= capacity;

                                return (
                                    <Link
                                        href={`/dashboard/academico/${yearSlug || academicYearId}/${
                                            // Strip year suffix from slug (e.g. "1er-ano-a-2025-2026" → "1er-ano-a")
                                            yearSlug && c.slug?.endsWith(`-${yearSlug}`)
                                                ? c.slug.slice(0, -(yearSlug.length + 1))
                                                : c.slug
                                        }`}
                                        key={c.id}
                                        className="block"
                                    >
                                        <div className="group bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer relative">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-9 w-9 rounded-lg bg-gray-100 group-hover:bg-indigo-50 flex items-center justify-center font-bold text-gray-600 group-hover:text-indigo-600 transition-colors">
                                                        {c.section}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-semibold text-gray-900 text-sm">Sección &quot;{c.section}&quot;</p>
                                                            <TurnoBadge turno={c.shift} />
                                                        </div>
                                                        <p className="text-xs text-gray-500">{count}/{capacity} Cupos</p>
                                                    </div>
                                                </div>

                                                {/* Action Menu */}
                                                <div onClick={(e) => e.preventDefault()} role="button" tabIndex={0} onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                    }
                                                }}>
                                                    <Menu as="div" className="relative inline-block text-left">
                                                        <Menu.Button className="text-gray-300 hover:text-indigo-600 p-1 rounded-md hover:bg-indigo-50 transition-colors outline-none">
                                                            <MoreHorizontal className="w-4 h-4" />
                                                        </Menu.Button>
                                                        <Transition
                                                            as={Fragment}
                                                            enter="transition ease-out duration-100"
                                                            enterFrom="transform opacity-0 scale-95"
                                                            enterTo="transform opacity-100 scale-100"
                                                            leave="transition ease-in duration-75"
                                                            leaveFrom="transform opacity-100 scale-100"
                                                            leaveTo="transform opacity-0 scale-95"
                                                        >
                                                            <Menu.Items className="absolute right-0 mt-1 w-32 origin-top-right divide-y divide-gray-100 rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                                                                <div className="px-1 py-1">
                                                                    <Menu.Item>
                                                                        {({ active }) => (
                                                                            <button
                                                                                onClick={() => onEditSection(c)}
                                                                                className={`${active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'
                                                                                    } group flex w-full items-center rounded-md px-2 py-2 text-xs font-medium transition-colors`}
                                                                            >
                                                                                <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                                                                                Editar
                                                                            </button>
                                                                        )}
                                                                    </Menu.Item>
                                                                    <Menu.Item>
                                                                        {({ active }) => (
                                                                            <button
                                                                                onClick={() => onDeleteSection(c.id)}
                                                                                className={`${active ? 'bg-red-50 text-red-700' : 'text-red-600'
                                                                                    } group flex w-full items-center rounded-md px-2 py-2 text-xs font-medium transition-colors`}
                                                                            >
                                                                                <Trash className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                                                                                Eliminar
                                                                            </button>
                                                                        )}
                                                                    </Menu.Item>
                                                                </div>
                                                            </Menu.Items>
                                                        </Transition>
                                                    </Menu>
                                                </div>
                                            </div>

                                            {/* Capacity Bar */}
                                            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-red-500' : percentage > 80 ? 'bg-amber-400' : 'bg-green-500'}`}
                                                    style={{ width: `${percentage}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                            {classrooms.length === 0 && (
                                <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
                                    <p className="text-sm text-gray-400 mb-2">No hay secciones</p>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onAddSection(grade); }}
                                        className="text-indigo-600 text-xs font-medium hover:underline"
                                    >
                                        + Agregar primera sección
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
