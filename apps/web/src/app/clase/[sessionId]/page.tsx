import { redirect } from 'next/navigation';

interface PageProps {
    params: Promise<{
        sessionId: string;
    }>;
}

export default async function ShortClassPage({ params }: PageProps) {
    const { sessionId } = await params;

    // Logic: Look up the class session by publicId (short ID)
    // If found, redirect to the full detailed view OR render a "Focus Mode" view.
    // For now, let's render a Focus Mode view for the teacher/student.

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                    📚
                </div>

                <div>
                    <h1 className="text-3xl font-black text-gray-900 mb-2">Clase #{sessionId}</h1>
                    <p className="text-gray-500">Acceso Rápido a Sesión de Clase</p>
                </div>

                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 text-left space-y-4">
                    <div className="flex justify-between">
                        <span className="text-gray-500 text-sm">Materia</span>
                        <span className="font-bold text-gray-900">Matemáticas</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500 text-sm">Tema</span>
                        <span className="font-bold text-gray-900">Derivadas Parciales</span>
                    </div>
                    <div className="pt-4 border-t border-gray-200">
                        <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-colors">
                            Pasar Asistencia
                        </button>
                    </div>
                </div>

                <p className="text-xs text-center text-gray-400 mt-8">
                    Redirigiendo a entorno seguro...
                </p>
            </div>
        </div>
    );
}
