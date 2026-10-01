'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { School, Search, ArrowRight, X, Building2, ShieldCheck } from 'lucide-react';

interface SchoolAccessModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SchoolAccessModal({ isOpen, onClose }: SchoolAccessModalProps) {
    const router = useRouter();
    const [slug, setSlug] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
        
        if (!cleanSlug) {
            setError('Por favor ingresa el identificador o nombre de tu liceo.');
            return;
        }

        // En desarrollo redirigir con parámetro slug o subdominio
        const isLocalhost = typeof window !== 'undefined' && window.location.hostname.includes('localhost');
        if (isLocalhost) {
            window.location.href = `http://${cleanSlug}.localhost:3000/login`;
        } else {
            window.location.href = `/login?slug=${cleanSlug}`;
        }
    };

    const handleQuickAccess = (schoolSlug: string) => {
        const isLocalhost = typeof window !== 'undefined' && window.location.hostname.includes('localhost');
        if (isLocalhost) {
            window.location.href = `http://${schoolSlug}.localhost:3000/login`;
        } else {
            window.location.href = `/login?slug=${schoolSlug}`;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative animate-in zoom-in-95 duration-200">
                {/* Botón cerrar */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Encabezado */}
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                        <School className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">
                            Ingresar a tu Liceo
                        </h3>
                        <p className="text-xs text-slate-500">
                            Accede al portal institucional privado de tu colegio
                        </p>
                    </div>
                </div>

                {/* Formulario */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="school-slug" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                            Identificador o Slug del Liceo
                        </label>
                        <div className="relative">
                            <input
                                id="school-slug"
                                type="text"
                                value={slug}
                                onChange={(e) => {
                                    setSlug(e.target.value);
                                    setError('');
                                }}
                                placeholder="ejemplo: san-miguel"
                                className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                                autoFocus
                            />
                            <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                        </div>
                        {error && (
                            <p className="text-xs text-red-600 mt-1.5 font-medium">{error}</p>
                        )}
                        <p className="text-[11px] text-slate-500 mt-1.5">
                            Corresponde a la dirección personalizada asignada a tu institución (ejemplo: <code>san-miguel.localhost:3000</code>).
                        </p>
                    </div>

                    <button
                        type="submit"
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all duration-200 cursor-pointer"
                    >
                        <span>Continuar al portal</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </form>

                {/* Accesos de prueba rápidos */}
                <div className="mt-6 pt-5 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 mb-2.5 uppercase tracking-wider">
                        Liceos registrados para demostración:
                    </p>
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={() => handleQuickAccess('instituto-testing')}
                            className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left group"
                        >
                            <div>
                                <p className="text-xs font-bold text-slate-900 group-hover:text-blue-600">
                                    Instituto Testing
                                </p>
                                <p className="text-[11px] text-slate-500">
                                    Subdominio: instituto-testing
                                </p>
                            </div>
                            <span className="text-xs font-medium text-blue-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                Acceder <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                        </button>
                    </div>
                </div>

                <div className="mt-5 text-center flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Conexión segura y aislamiento estricto de base de datos</span>
                </div>
            </div>
        </div>
    );
}
