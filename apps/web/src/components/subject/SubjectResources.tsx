import { FileText, Download, Plus } from 'lucide-react';

interface Resource {
    id: string;
    name: string;
    type: string;
    date: string;
}

interface SubjectResourcesProps {
    resources: Resource[];
}

export function SubjectResources({ resources }: SubjectResourcesProps) {
    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mt-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Recursos y Planificación</h3>
                <button className="text-indigo-600 hover:bg-indigo-50 p-1 rounded-md transition-colors">
                    <Plus size={16} />
                </button>
            </div>

            <div className="space-y-3">
                {resources.length === 0 ? (
                    <div className="text-center py-4 border-2 border-dashed border-gray-100 rounded-xl">
                        <p className="text-xs text-gray-400 font-medium">Sin documentos cargados</p>
                        <button className="text-xs font-bold text-indigo-600 mt-1 hover:underline">Subir Plan de Lapso</button>
                    </div>
                ) : (
                    resources.map((res) => (
                        <div key={res.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-indigo-200 transition-colors group">
                            <div className="flex items-center gap-3">
                                <div className="bg-white p-2 rounded-lg text-indigo-600 shadow-sm">
                                    <FileText size={18} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-900">{res.name}</p>
                                    <p className="text-[10px] text-gray-500 uppercase font-bold">{res.type} • {res.date}</p>
                                </div>
                            </div>
                            <button className="text-gray-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all p-1.5 hover:bg-white rounded-lg">
                                <Download size={16} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
