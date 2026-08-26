import { Mail, Phone } from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';

interface Teacher {
    id: string;
    name: string;
    avatar?: string;
    email: string;
    sectionsCount: number; // In how many sections they teach this subject
}

interface TeachersSidebarProps {
    teachers: Teacher[];
}

export function TeachersSidebar({ teachers }: TeachersSidebarProps) {
    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 h-fit sticky top-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Equipo Docente</h3>

            <div className="space-y-4">
                {teachers.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No hay profesores asignados.</p>
                ) : (
                    teachers.map((teacher) => (
                        <div key={teacher.id} className="flex items-start gap-3 group p-2 hover:bg-gray-50 rounded-xl transition-colors -mx-2">
                            <div className="relative">
                                <UserAvatar
                                    name={teacher.name}
                                    src={teacher.avatar}
                                    className="h-10 w-10"
                                    initialsClassName="text-xs"
                                />
                                <span className="absolute -bottom-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full ring-2 ring-white">
                                    {teacher.sectionsCount}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-bold text-gray-900 truncate">{teacher.name}</h4>
                                <div className="flex flex-col gap-1 mt-1">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                        <Mail size={12} className="shrink-0" />
                                        <span className="truncate">{teacher.email}</span>
                                    </div>
                                    {/* Optional Phone if available */}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100">
                <button className="w-full text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 py-2 rounded-lg transition-colors border border-dashed border-indigo-200 hover:border-indigo-300">
                    + Gestionar Equipo
                </button>
            </div>
        </div>
    );
}
