import { Plus, FileText, Calendar } from 'lucide-react';

interface ActivityDeckProps {
    subjectName?: string;
}

export default function ActivityDeck({ subjectName = 'Materia' }: ActivityDeckProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Container A: Current Activity (Focus) */}
            <div className="border-2 border-indigo-100 ring-4 ring-indigo-50/50 bg-white rounded-xl p-5 relative overflow-hidden group">
                {/* Decoration */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>

                <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            Actividad Actual
                        </h3>
                        <span className="text-xs font-semibold px-2 py-1 rounded bg-indigo-100 text-indigo-700 uppercase tracking-wide">
                            En Curso
                        </span>
                    </div>

                    <div className="bg-white border text-left border-gray-100 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
                                <FileText className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 uppercase">
                                        Examen Escrito
                                    </span>
                                </div>
                                <h4 className="font-bold text-gray-900 text-lg">Evaluación de {subjectName}</h4>
                                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                    Evaluación sobre los temas vistos en la unidad actual.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Container B: Next Class / Planning */}
            <div className="border border-dashed border-gray-300 bg-gray-50/50 rounded-xl p-5 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-500 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Próxima Clase (Mañana)
                    </h3>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                        <Calendar className="w-6 h-6 text-gray-300" />
                    </div>
                    <p className="text-gray-400 font-medium text-sm mb-4">No hay tareas asignadas</p>

                    <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 shadow-sm text-sm font-semibold text-gray-700 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-all">
                        <Plus className="w-4 h-4" />
                        Crear Actividad
                    </button>
                </div>
            </div>
        </div>
    );
}
