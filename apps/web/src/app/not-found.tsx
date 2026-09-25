import Link from 'next/link';
import { GraduationCap, ArrowLeft, ShieldAlert } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-12">
            <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 mb-6 border border-blue-100">
                    <ShieldAlert className="w-8 h-8" />
                </div>

                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full uppercase tracking-wider mb-3">
                    Error 404
                </span>

                <h1 className="text-2xl font-bold text-slate-900 mb-2">
                    Página no encontrada
                </h1>

                <p className="text-sm text-slate-600 mb-8 leading-relaxed">
                    La dirección a la que intentas acceder no existe en la plataforma o requiere ingresar desde el portal institucional asignado a tu liceo.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors duration-200 gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Ir a la página principal
                    </Link>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-600">
                    <GraduationCap className="w-4 h-4 text-blue-600" />
                    <span>GestiEdu Plataforma Educativa</span>
                </div>
            </div>
        </div>
    );
}
