'use client';

import { X, Calendar, ChevronRight, User, History } from '@/components/icons';
import { useRouter } from 'next/navigation';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface GuideSection {
    academicYearId: string;
    academicYearName: string;
    academicYearStatus: string;
    classroomId?: string;
    classroomName?: string;
    classroomSlug?: string;
    grade?: number;
    section?: string;
}

interface GuideHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    guideSections: GuideSection[];
    teacherName: string;
}

export default function GuideHistoryModal({
    isOpen,
    onClose,
    guideSections,
    teacherName
}: GuideHistoryModalProps) {
    const router = useRouter();

    if (!isOpen) return null;

    const handleSectionClick = (section: GuideSection) => {
        if (section.classroomSlug && section.academicYearId) {
            router.push(`/dashboard/academico/${section.academicYearId}/${section.classroomSlug}`);
            onClose();
        }
    };

    const getStatusBadge = (status: string) => {
        const badges = {
            ACTIVE: { text: 'Actual', className: 'bg-green-100 text-green-800' },
            COMPLETED: { text: 'Completado', className: 'bg-gray-100 text-gray-800' },
            UPCOMING: { text: 'Próximo', className: 'bg-blue-100 text-blue-800' }
        };
        const badge = badges[status as keyof typeof badges] || badges.COMPLETED;
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                {badge.text}
            </span>
        );
    };

    // Group sections by year logic could be simple or we assume they are passed flat.
    // The test implies we see 2024, 2023 headers. So we need grouping logic if input is flat list.
    // Based on requirements, the input might be flat list of matches.
    // Let's implement grouping.

    const sectionsByYear = guideSections.reduce((acc, section) => {
        if (!acc[section.academicYearName]) {
            acc[section.academicYearName] = [];
        }
        acc[section.academicYearName].push(section);
        return acc;
    }, {} as Record<string, GuideSection[]>);

    // Sort years descending (newest first)
    const sortedYears = Object.keys(sectionsByYear).sort((a, b) => b.localeCompare(a));

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-xl p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-white/20 shadow-2xl [&>button:last-child]:hidden">
                {/* Header with Gradient */}
                <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 p-6 text-white relative h-32">
                    {/* Decorative Circles */}
                    <div className="absolute top-0 right-0 p-4">
                        <div className="absolute -top-12 -right-12 bg-white/10 rounded-full w-40 h-40 blur-3xl pointer-events-none"></div>
                        <button
                            onClick={onClose}
                            className="hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors relative z-20"
                            aria-label="Cerrar modal"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <DialogHeader className="relative z-10 mt-4">
                        <DialogTitle className="text-2xl font-bold text-white flex items-center gap-2">
                            <History className="h-6 w-6" />
                            Historial de Secciones Guía
                        </DialogTitle>
                        <p className="text-white/80 mt-1 flex items-center gap-2">
                            <User size={16} />
                            {teacherName}
                        </p>
                    </DialogHeader>
                </div>

                {/* Content */}
                <div className="p-6 pt-2 h-[400px] overflow-y-auto custom-scrollbar">
                    {sortedYears.length > 0 ? (
                        <div className="space-y-6 mt-4">
                            {sortedYears.map((year) => (
                                <div key={year} className="relative">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2 sticky top-0 bg-white/95 backdrop-blur-sm py-2 z-10">
                                        <Calendar className="h-4 w-4 text-indigo-600" />
                                        Año Académico {year}
                                    </h3>
                                    <div className="grid gap-3 pl-4 border-l-2 border-indigo-100">
                                        {sectionsByYear[year].map((section, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => handleSectionClick(section)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        handleSectionClick(section);
                                                    }
                                                }}
                                                className="group p-4 rounded-xl border border-gray-100 bg-white hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                                            >
                                                <div className="absolute top-0 right-0 w-1 h-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <h4 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
                                                            {section.classroomName || `${section.grade}º Año "${section.section}"`}
                                                        </h4>
                                                        <span className="text-xs text-gray-500 mt-1 inline-block">
                                                            Profesor Guía Titular
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        {getStatusBadge(section.academicYearStatus)}
                                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-500 transform group-hover:translate-x-1 transition-all" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-4">
                            <div className="bg-gray-100 p-4 rounded-full">
                                <History className="h-8 w-8 text-gray-400" />
                            </div>
                            <div>
                                <p className="font-medium text-gray-900">Sin historial disponible</p>
                                <p className="text-sm">Este docente no tiene secciones guía registradas en años anteriores.</p>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
