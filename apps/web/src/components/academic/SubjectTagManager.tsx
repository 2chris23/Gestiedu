'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Search, Clock, User, Check, Loader2 } from 'lucide-react';
import { subjectsService, Subject } from '@/services/subjects.service';
import { userService } from '@/services/user.service';
import { toast } from 'sonner';

export interface SubjectTag {
    id: string; // This is the Subject ID
    name: string;
    code?: string;
    color: string;
    teacherName?: string;
    teacherId?: string;
    hours?: number;
}

interface SubjectTagManagerProps {
    gradeId: number;
    academicYearId?: string;
}

export default function SubjectTagManager({ gradeId, academicYearId }: SubjectTagManagerProps) {
    const confirmDialog = useConfirm();
    const [assignedSubjects, setAssignedSubjects] = useState<SubjectTag[]>([]);
    const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
    const [teachers, setTeachers] = useState<{ id: string, name: string }[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [inputValue, setInputValue] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Config form state
    const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null); // The subject being configured (new or existing)
    const [configTeacherId, setConfigTeacherId] = useState('');
    const [configHours, setConfigHours] = useState(4);

    const inputRef = useRef<HTMLInputElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Initial Data Load
    const loadData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [gradeSubjects, subjectsResponse, teachersList] = await Promise.all([
                subjectsService.getSubjectsByGrade(gradeId, academicYearId),
                subjectsService.getAllSubjects({ limit: 100 }),
                userService.getUsers({ role: 'TEACHER', limit: 100 })
            ]);

            const subjectsList = subjectsResponse.subjects;

            // Map backend response to UI format
            // GradeSubjects are basically Subjects. We need to fetch teacher info for each? 
            // The getSubjectsByGrade endpoint returns Subjects. 
            // In my updated backend service `getSubjectsByGrade` returns just `Subject[]`. 
            // To get the teacher, I would need to `getSubjectTeachers` for each or have the backend include it.
            // *Optimization*: For this MVP, I'll fetch teachers for the *assigned* subjects in a separate effect or lazy load.
            // *Correction*: Let's rely on valid teacher assignment logic.
            // For the timeline/display, we might show "Profesor Asignado" if we can.
            // The current backend `getSubjectsByGrade` does NOT return the teacher. I'd need to update it or make separate calls.
            // Let's make separate calls for now to verify "Teacher Assigned" status.

            const processedAssigned = await Promise.all(gradeSubjects.map(async (s: Subject) => {
                // Fetch teacher for this subject in this grade (approximate, since endpoint is per subject)
                // Actually `getSubjectTeachers` returns ALL teachers for that subject across all sections.
                // This might be ambiguous if multiple teachers teach the same subject in same grade (different sections).
                // MVP Assumption: 1 Teacher per Subject per Grade for simplicity in this view, 
                // OR we show "Varios" if multiple.
                const teachers = await subjectsService.getSubjectTeachers(s.id);
                const mainTeacher = teachers[0];

                return {
                    id: s.id,
                    name: s.name,
                    code: s.code,
                    color: s.color || 'bg-indigo-100 text-indigo-700 border-indigo-200',
                    teacherName: mainTeacher ? `${mainTeacher.firstName} ${mainTeacher.lastName}` : undefined,
                    teacherId: mainTeacher?.id
                };
            }));

            setAssignedSubjects(processedAssigned);
            setAllSubjects(subjectsList);
            setTeachers(teachersList.users.map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}` })));

        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Error cargando datos académicos');
        } finally {
            setIsLoading(false);
        }
    }, [gradeId, academicYearId]);

    useEffect(() => {
        loadData();
    }, [gradeId, academicYearId, loadData]);

    // Filter suggestions
    const suggestions = inputValue.trim() === ''
        ? []
        : allSubjects.filter(s =>
            s.name.toLowerCase().includes(inputValue.toLowerCase()) &&
            !assignedSubjects.some(existing => existing.id === s.id)
        );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                // Only close if not clicking the tag itself (handled by onClick)
                // But for now, safe to close.
                // If we are "Adding new", and close, we cancel the add.
                // If "Editing", we cancel edit.
                // We handle this via close button mostly, but clicking outside is UX expectation.
            }
        };
        // document.addEventListener('mousedown', handleClickOutside); // Disabled to prevent conflict with internal state for now
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSuggestionClick = (subject: Subject) => {
        // When clicking a suggestion, we don't add immediately.
        // We open config to select Teacher.
        setSelectedSubject(subject);
        setConfigTeacherId('');
        setConfigHours(4);
        setInputValue('');
        setShowSuggestions(false);
    };

    const handleEditClick = (tag: SubjectTag) => {
        // Convert Tag to Subject format for state
        setSelectedSubject({
            id: tag.id,
            name: tag.name,
            code: tag.code || '',
            color: tag.color
        } as Subject);
        setConfigTeacherId(tag.teacherId || '');
        setConfigHours(tag.hours || 4);
    };

    const handleSaveConfig = async () => {
        if (!selectedSubject || !configTeacherId) {
            toast.error('Debe seleccionar un profesor');
            return;
        }

        try {
            setIsSaving(true);
            await subjectsService.assignSubjectToGrade(gradeId, selectedSubject.id, configTeacherId, academicYearId);

            toast.success('Materia asignada correctamente');

            // Reload local state
            await loadData();

            setSelectedSubject(null);
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar asignación');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveSubject = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!(await confirmDialog({ title: '¿Estás seguro de quitar esta materia del grado? Se eliminará de todas las secciones.' }))) return;

        try {
            await subjectsService.removeSubjectFromGrade(gradeId, id, academicYearId);
            toast.success('Materia eliminada del grado');
            setAssignedSubjects(prev => prev.filter(s => s.id !== id));
        } catch (error) {
            console.error(error);
            toast.error('Error al eliminar materia');
        }
    };

    const handleCancel = () => {
        setSelectedSubject(null);
    };

    if (isLoading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin text-indigo-500" /></div>;

    return (
        <div className="relative">
            {/* Search Input (Moved to Top) */}
            <div className="relative min-w-[200px] mb-6">
                <div className="relative group">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder="Buscar materia"
                        className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-white placeholder-gray-400 transition-all"
                    />
                </div>

                {/* Autocomplete Suggestions */}
                {showSuggestions && (inputValue || allSubjects.length > 0) && (
                    <div className="w-full bg-white rounded-lg shadow-sm border border-gray-100 mt-2 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                        {(inputValue.trim() === ''
                            ? allSubjects.filter(s => !assignedSubjects.some(ex => ex.id === s.id)).slice(0, 5)
                            : suggestions
                        ).map((option) => (
                            <div
                                key={option.id}
                                className="px-4 py-2.5 text-sm hover:bg-indigo-50 cursor-pointer flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0"
                                onClick={() => handleSuggestionClick(option)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSuggestionClick(option); } }}
                            >
                                <span className={`w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm`}></span>
                                <span className="font-medium text-gray-700">{option.name}</span>
                                {option.code && <span className="text-xs text-gray-400 ml-auto font-mono">{option.code}</span>}
                            </div>
                        ))}
                        {suggestions.length === 0 && inputValue.trim() !== '' && (
                            <div className="px-4 py-3 text-xs text-center text-gray-400 italic">
                                No se encontraron materias
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Tag List (Moved to Bottom) */}
            <div className="flex flex-wrap gap-3">
                {assignedSubjects.map(subject => {
                    // Extract base color for the indicator
                    // e.g. bg-indigo-100 -> bg-indigo-500
                    const activeColorClass = subject.color?.includes('bg-')
                        ? subject.color.replace('100', '500')
                        : 'bg-indigo-500';

                    return (
                        <div key={subject.id} className="relative group">
                            <div
                                onClick={() => handleEditClick(subject)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEditClick(subject); } }}
                                className={`
                                        cursor-pointer select-none pl-3 pr-4 py-2 rounded-lg text-sm font-medium border flex items-center gap-2 transition-all hover:shadow-md active:scale-95 bg-white border-gray-200 hover:border-indigo-200
                                    `}
                            >
                                {/* Full height color strip */}
                                <span className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-lg ${activeColorClass}`}></span>

                                <div className="flex flex-col items-start leading-none gap-0.5 ml-1">
                                    <span className="text-gray-900 font-bold flex items-center gap-1.5">
                                        {subject.name}
                                        <span className="text-[10px] text-gray-400 font-normal bg-gray-50 px-1.5 py-0.5 rounded-full border border-gray-100">
                                            {subject.hours || 4}h
                                        </span>
                                    </span>

                                    {subject.teacherName ? (
                                        <span className="text-[11px] text-gray-500 flex items-center gap-1 font-medium">
                                            <User className="w-3 h-3 text-gray-400" />
                                            Prof. {subject.teacherName.split(' ')[0]}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] text-red-400 italic flex items-center gap-1">
                                            Sin profesor
                                        </span>
                                    )}
                                </div>

                                <button
                                    onClick={(e) => handleRemoveSubject(subject.id, e)}
                                    className="ml-2 -mr-1 p-1 hover:bg-red-50 hover:text-red-500 text-gray-300 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {
                assignedSubjects.length === 0 && (
                    <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-lg">
                        <p className="text-xs text-gray-400">No hay materias asignadas a este grado.</p>
                    </div>
                )
            }

            {/* Modal for Subject Config (New and Edit) */}
            {
                selectedSubject && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95" onClick={(e) => e.stopPropagation()} role="presentation">
                            <h4 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                                {assignedSubjects.find(s => s.id === selectedSubject.id) ? 'Editar' : 'Asignar'} {selectedSubject.name}
                            </h4>
                            <p className="text-xs text-gray-500 mb-4">
                                {assignedSubjects.find(s => s.id === selectedSubject.id)
                                    ? 'Modifica la asignación del profesor y carga horaria.'
                                    : `Configura la materia para el ${gradeId}º Grado`
                                }
                            </p>
                            {renderConfigForm()}
                        </div>
                    </div>
                )
            }
        </div >
    );

    function renderConfigForm() {
        return (
            <div className="space-y-3">
                <div>
                    <label htmlFor="configTeacherId" className="block text-xs font-medium text-gray-500 mb-1">Profesor Asignado</label>
                    <div className="relative">
                        <User className="w-4 h-4 absolute left-2 top-2 text-gray-400" />
                        <Select value={configTeacherId || undefined} onValueChange={setConfigTeacherId}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Seleccionar..." />
                            </SelectTrigger>
                            <SelectContent>
                                {teachers.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div>
                    <label htmlFor="configHours" className="block text-xs font-medium text-gray-500 mb-1">Carga Horaria Semanal</label>
                    <div className="relative">
                        <Clock className="w-4 h-4 absolute left-2 top-2 text-gray-400" />
                        <input
                            id="configHours"
                            type="number"
                            min="1"
                            max="10"
                            className="w-full pl-8 pr-2 py-1.5 text-sm border-gray-200 rounded-md focus:border-indigo-500 focus:ring-0 bg-gray-50"
                            value={configHours}
                            onChange={(e) => setConfigHours(parseInt(e.target.value) || 0)}
                        />
                    </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                    <button
                        onClick={handleCancel}
                        className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSaveConfig}
                        disabled={isSaving}
                        className="px-3 py-1 text-xs font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 flex items-center gap-1 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Guardar
                    </button>
                </div>
            </div>
        );
    }
}
