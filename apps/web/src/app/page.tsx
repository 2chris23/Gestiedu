'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
    GraduationCap, 
    ArrowRight, 
    Shield, 
    Clock, 
    Layers, 
    CheckCircle2, 
    Lock,
    ExternalLink,
    Laptop,
    Sparkles,
    Calendar,
    Users
} from 'lucide-react';
import { DeviceShowcase3D } from '@/components/landing/DeviceShowcase3D';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { SchoolAccessModal } from '@/components/landing/SchoolAccessModal';

export default function HomePage() {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col selection:bg-blue-600 selection:text-white">
            {/* ========================================================= */}
            {/* BARRA DE NAVEGACIÓN SUPERIOR (BLANCO Y AZUL)               */}
            {/* ========================================================= */}
            <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 transition-all">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
                    {/* Logo Marca GestiEdu */}
                    <Link href="/" className="flex items-center gap-2.5 group">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:bg-blue-700 transition-colors">
                            <GraduationCap className="w-6 h-6" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-extrabold text-xl text-slate-900 tracking-tight leading-none group-hover:text-blue-600 transition-colors">
                                GestiEdu
                            </span>
                            <span className="text-[10px] uppercase font-semibold tracking-wider text-blue-600 mt-0.5">
                                Gestión Escolar
                            </span>
                        </div>
                    </Link>

                    {/* Enlaces centrales de navegación */}
                    <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
                        <a href="#dispositivos" className="hover:text-blue-600 transition-colors">
                            Dispositivos 3D
                        </a>
                        <a href="#funciones" className="hover:text-blue-600 transition-colors">
                            Módulos del Sistema
                        </a>
                        <a href="#doble-turno" className="hover:text-blue-600 transition-colors flex items-center gap-1.5">
                            <span>Doble Turno</span>
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full">
                                6to Año
                            </span>
                        </a>
                    </nav>

                    {/* Acciones derecha */}
                    <div className="flex items-center gap-3">
                        <Link
                            href="/superadmin/login"
                            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                            <Lock className="w-3.5 h-3.5" />
                            <span>SuperAdmin</span>
                        </Link>

                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm shadow-blue-500/20 transition-all duration-200 cursor-pointer"
                        >
                            <span>Ingresar a mi Liceo</span>
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </header>

            {/* ========================================================= */}
            {/* SECCIÓN HERO (PRESENTACIÓN PRINCIPAL)                      */}
            {/* ========================================================= */}
            <section className="relative pt-16 pb-20 sm:pt-24 sm:pb-28 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white via-slate-50 to-white overflow-hidden">
                {/* Luces sutiles de fondo */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[850px] h-[400px] bg-blue-500/8 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute top-1/3 right-10 w-[350px] h-[350px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="max-w-5xl mx-auto text-center relative z-10">
                    {/* Badge de contexto nacional / institucional */}
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-semibold uppercase tracking-wider mb-6 shadow-sm">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>Plataforma Adaptada a la Educación en Venezuela</span>
                    </div>

                    {/* Gran Titular */}
                    <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
                        Tu liceo organizado. <br />
                        <span className="text-blue-600">En una sola plataforma.</span>
                    </h1>

                    {/* Subtítulo descriptivo */}
                    <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed font-normal">
                        Control total de calificaciones por lapsos oficiales, cuadrícula inteligente para <strong>doble turno (mañana y tarde)</strong>, formación técnica hasta <strong>6to año</strong> y matrícula con aislamiento garantizado.
                    </p>

                    {/* Botones de llamada a la acción */}
                    <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base shadow-lg shadow-blue-500/25 hover:shadow-blue-500/35 transition-all duration-200 cursor-pointer"
                        >
                            <span>Acceder a mi Liceo</span>
                            <ArrowRight className="w-4 h-4" />
                        </button>

                        <a
                            href="#dispositivos"
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-semibold text-base border border-slate-200 shadow-sm transition-all duration-200"
                        >
                            <Laptop className="w-4 h-4 text-blue-600" />
                            <span>Ver Interfaz en 3D</span>
                        </a>
                    </div>

                    {/* Métricas e insignias de confianza */}
                    <div className="mt-14 pt-8 border-t border-slate-200/80 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto text-left">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                                <Clock className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-slate-900">Doble Turno</h4>
                                <p className="text-xs text-slate-500">Mañana y tarde sin choques</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                                <GraduationCap className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-slate-900">Media Técnica</h4>
                                <p className="text-xs text-slate-500">De 1º hasta 6º año técnico</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                                <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-slate-900">Tres Lapsos</h4>
                                <p className="text-xs text-slate-500">Escala de 01 a 20 puntos</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                                <Shield className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-slate-900">Aislamiento Total</h4>
                                <p className="text-xs text-slate-500">Base de datos independiente</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ========================================================= */}
            {/* SHOWCASE 3D DE 3 DISPOSITIVOS (CON PANTALLAS REALES)       */}
            {/* ========================================================= */}
            <DeviceShowcase3D />

            {/* ========================================================= */}
            {/* CUADRÍCULA DE FUNCIONALIDADES CLAVE                        */}
            {/* ========================================================= */}
            <FeaturesSection />

            {/* ========================================================= */}
            {/* BANNER FINAL DE LLAMADA A LA ACCIÓN                       */}
            {/* ========================================================= */}
            <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50 border-t border-slate-200">
                <div className="max-w-5xl mx-auto bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-3xl p-8 sm:p-14 text-white text-center shadow-xl relative overflow-hidden">
                    <div className="absolute -top-24 -left-24 w-72 h-72 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="relative z-10 max-w-2xl mx-auto">
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                            Comienza a gestionar tu liceo de forma moderna
                        </h2>
                        <p className="mt-4 text-blue-100 text-sm sm:text-base leading-relaxed">
                            Diseñado tanto para planteles públicos como colegios privados. Accede directamente al portal exclusivo de tu institución.
                        </p>
                        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-white text-blue-600 hover:bg-slate-50 font-bold text-sm shadow-md transition-all cursor-pointer"
                            >
                                <span>Ingresar con mi Liceo</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                            <Link
                                href="/superadmin/login"
                                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-blue-800/60 hover:bg-blue-800 text-white font-semibold text-sm border border-blue-400/30 transition-all"
                            >
                                <Lock className="w-4 h-4 text-blue-300" />
                                <span>Acceso de Plataforma (SuperAdmin)</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* ========================================================= */}
            {/* PIE DE PÁGINA (BLANCO Y AZUL)                              */}
            {/* ========================================================= */}
            <footer className="bg-white border-t border-slate-200 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                            <GraduationCap className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-base text-slate-900">
                            GestiEdu
                        </span>
                        <span className="text-xs text-slate-400 ml-2">
                            Sistema de Gestión Escolar para Venezuela
                        </span>
                    </div>

                    <div className="flex items-center gap-6 text-xs text-slate-500">
                        <span>Horarios Doble Turno</span>
                        <span>Media Técnica (6to Año)</span>
                        <span>Tres Lapsos MPPE</span>
                        <Link href="/superadmin/login" className="hover:text-blue-600 transition-colors">
                            SuperAdmin
                        </Link>
                    </div>

                    <p className="text-xs text-slate-400">
                        © 2026 GestiEdu. Todos los derechos reservados.
                    </p>
                </div>
            </footer>

            {/* Modal para ingresar a un liceo por slug */}
            <SchoolAccessModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </div>
    );
}
