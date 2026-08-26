'use client';

import { useRouter } from 'next/navigation';
import { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Cycle {
    id: string;
    name: string;
    status: string;
}

interface SubjectHeaderProps {
    subjectName: string;
    subjectCode: string;
    subjectColor?: string;
    cycles: Cycle[];
    currentCycleId: string;
    subjectId: string; // ✅ NEW: Need subjectId to build URL
}

export function SubjectHeader({ subjectName, subjectCode, subjectColor, cycles, currentCycleId, subjectId }: SubjectHeaderProps) {
    const router = useRouter();

    // Find the current cycle object based on ID
    const currentCycle = cycles.find((c) => c.id === currentCycleId) || cycles[0];

    const handleCycleChange = (cycleId: string) => {
        // Navigate using year name for human-readable URLs
        const cycle = cycles.find(c => c.id === cycleId);
        const cycleName = cycle?.name || cycleId;
        router.push(`/dashboard/materias/${cycleName}/${subjectId}`);
    };

    return (
        <div className="bg-white border-b border-gray-200">
            <div className="container mx-auto px-6 py-8">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span
                                className="px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider border"
                                style={subjectColor ? {
                                    backgroundColor: `${subjectColor}15`,
                                    color: subjectColor,
                                    borderColor: `${subjectColor}30`
                                } : {
                                    backgroundColor: '#EEF2FF',
                                    color: '#4338CA',
                                    borderColor: '#E0E7FF'
                                }}
                            >
                                {subjectCode}
                            </span>
                            <span className="text-gray-300">•</span>
                            <span className="text-gray-500 text-sm font-medium">Vista Global de Materia</span>
                        </div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{subjectName}</h1>
                    </div>

                    {/* Cycle Selector (Control Area) */}
                    <div className="relative z-10 w-full md:w-auto">
                        <Menu as="div" className="relative inline-block text-left w-full md:w-auto">
                            <div>
                                <label htmlFor="cycleSelector" className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">
                                    Ciclo Escolar Visualizado
                                </label>
                                <Menu.Button id="cycleSelector" className="group inline-flex w-full md:min-w-[260px] justify-between items-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 hover:bg-gray-50 hover:ring-indigo-200 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-100 transition-colors">
                                            <Calendar size={16} />
                                        </div>
                                        <div className="flex flex-col items-start leading-none gap-0.5">
                                            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Ciclo</span>
                                            <span className="text-base">{currentCycle?.name}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {currentCycle?.status === 'ACTIVE' && (
                                            <span className="bg-emerald-100 text-emerald-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                                                Actual
                                            </span>
                                        )}
                                        <ChevronDown className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 transition-colors" aria-hidden="true" />
                                    </div>
                                </Menu.Button>
                            </div>

                            <Transition
                                as={Fragment}
                                enter="transition ease-out duration-100"
                                enterFrom="transform opacity-0 scale-95"
                                enterTo="transform opacity-100 scale-100"
                                leave="transition ease-in duration-75"
                                leaveFrom="transform opacity-100 scale-100"
                                leaveTo="transform opacity-0 scale-95"
                            >
                                <Menu.Items className="absolute right-0 z-20 mt-2 w-full origin-top-right rounded-xl bg-white shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none overflow-hidden max-h-60 overflow-y-auto">
                                    <div className="p-1.5 space-y-0.5">
                                        {cycles.map((cycle) => (
                                            <Menu.Item key={cycle.id}>
                                                {({ active }) => (
                                                    <button
                                                        onClick={() => handleCycleChange(cycle.id)}
                                                        className={cn(
                                                            active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700',
                                                            'group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150'
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={cn(
                                                                "w-1.5 h-1.5 rounded-full",
                                                                cycle.status === 'ACTIVE' ? "bg-emerald-500" : "bg-gray-300"
                                                            )} />
                                                            <span className={cn(active ? "font-bold" : "font-medium")}>
                                                                {cycle.name}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {cycle.status === 'ACTIVE' && (
                                                                <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                                                    Actual
                                                                </span>
                                                            )}
                                                            {currentCycleId === cycle.id && (
                                                                <Check size={16} className="text-indigo-600" />
                                                            )}
                                                        </div>
                                                    </button>
                                                )}
                                            </Menu.Item>
                                        ))}
                                    </div>
                                    <div className="bg-gray-50/80 px-3 py-2 border-t border-gray-100 backdrop-blur-sm sticky bottom-0">
                                        <p className="text-[10px] text-gray-400 text-center font-medium">
                                            Mostrando historial académico
                                        </p>
                                    </div>
                                </Menu.Items>
                            </Transition>
                        </Menu>
                    </div>
                </div>
            </div>
        </div>
    );
}
