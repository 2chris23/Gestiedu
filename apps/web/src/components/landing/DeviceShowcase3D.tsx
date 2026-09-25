'use client';

import { useState } from 'react';
import Image from 'next/image';
import Tilt from 'react-parallax-tilt';
import { Laptop, Tablet, Smartphone, Sparkles, CheckCircle2, Eye } from 'lucide-react';

type DeviceMode = 'all' | 'laptop' | 'tablet' | 'phone';

export function DeviceShowcase3D() {
    const [activeTab, setActiveTab] = useState<DeviceMode>('all');
    const [laptopScreen, setLaptopScreen] = useState<'dashboard' | 'horarios'>('dashboard');

    return (
        <section id="dispositivos" className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white via-slate-50 to-blue-50/40 overflow-hidden">
            {/* Luces de fondo ambientales */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-10 right-10 w-[400px] h-[250px] bg-indigo-400/10 rounded-full blur-3xl pointer-events-none" />

            <div className="max-w-7xl mx-auto relative z-10">
                {/* Encabezado de la sección */}
                <div className="text-center max-w-3xl mx-auto mb-12">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold uppercase tracking-wider mb-4 shadow-sm">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>Experiencia Multiplataforma Real</span>
                    </div>

                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
                        Tu liceo en cualquier pantalla, <br className="hidden sm:inline" />
                        <span className="text-blue-600">con control total en tiempo real</span>
                    </h2>

                    <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
                        Explora la interfaz real del sistema interactuando con los dispositivos. Diseñado con fluidez para computadoras de secretaría, tabletas de directores y teléfonos de docentes.
                    </p>

                    {/* Filtros de dispositivo */}
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
                        <button
                            onClick={() => setActiveTab('all')}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                                activeTab === 'all'
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-sm'
                            }`}
                        >
                            Vista en Conjunto
                        </button>
                        <button
                            onClick={() => setActiveTab('laptop')}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                                activeTab === 'laptop'
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-sm'
                            }`}
                        >
                            <Laptop className="w-4 h-4" />
                            Laptop (Escritorio)
                        </button>
                        <button
                            onClick={() => setActiveTab('tablet')}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                                activeTab === 'tablet'
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-sm'
                            }`}
                        >
                            <Tablet className="w-4 h-4" />
                            Tablet (Dirección)
                        </button>
                        <button
                            onClick={() => setActiveTab('phone')}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                                activeTab === 'phone'
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-sm'
                            }`}
                        >
                            <Smartphone className="w-4 h-4" />
                            Teléfono (Móvil)
                        </button>
                    </div>

                    {/* Selector de pantalla para Laptop */}
                    {(activeTab === 'all' || activeTab === 'laptop') && (
                        <div className="flex items-center justify-center gap-2 mt-4 text-xs text-slate-500">
                            <span className="font-medium">Pantalla mostrada en Laptop:</span>
                            <button
                                onClick={() => setLaptopScreen('dashboard')}
                                className={`px-2.5 py-1 rounded-lg border transition-colors ${
                                    laptopScreen === 'dashboard'
                                        ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                Dashboard General
                            </button>
                            <button
                                onClick={() => setLaptopScreen('horarios')}
                                className={`px-2.5 py-1 rounded-lg border transition-colors ${
                                    laptopScreen === 'horarios'
                                        ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                Horarios Doble Turno
                            </button>
                        </div>
                    )}
                </div>

                {/* ========================================================= */}
                {/* 1. VISTA EN CONJUNTO (3 DISPOSITIVOS SIMULTÁNEOS)           */}
                {/* ========================================================= */}
                {activeTab === 'all' && (
                    <div className="relative pt-6 pb-12">
                        {/* Contenedor principal con efecto de perspectiva */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                            
                            {/* LAPTOP (Centrada o protagonista a la izquierda) */}
                            <div className="lg:col-span-8 flex justify-center">
                                <Tilt
                                    tiltMaxAngleX={7}
                                    tiltMaxAngleY={7}
                                    perspective={1000}
                                    transitionSpeed={1500}
                                    glareEnable={true}
                                    glareMaxOpacity={0.12}
                                    glareColor="#ffffff"
                                    glarePosition="all"
                                    glareBorderRadius="20px"
                                    className="w-full max-w-[760px] cursor-grab active:cursor-grabbing"
                                >
                                    {/* Mockup Laptop MacBook Pro */}
                                    <div className="bg-slate-800 rounded-t-2xl p-2.5 pt-3 shadow-2xl border border-slate-700 relative">
                                        {/* Cámara y bisel superior */}
                                        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                                            <div className="w-1 h-1 rounded-full bg-blue-900" />
                                        </div>
                                        
                                        {/* Pantalla de Laptop */}
                                        <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-800 aspect-[16/10]">
                                            <Image
                                                src={laptopScreen === 'dashboard' ? '/screenshots/system-laptop.png' : '/screenshots/system-horarios.png'}
                                                alt="Sistema en Laptop"
                                                fill
                                                className="object-cover object-top"
                                                priority
                                            />
                                        </div>

                                        {/* Base de la laptop */}
                                        <div className="h-3 bg-gradient-to-b from-slate-700 to-slate-800 -mx-2.5 -mb-2.5 rounded-b-lg border-t border-slate-600 flex justify-center">
                                            <div className="w-20 h-1 bg-slate-600 rounded-b-md" />
                                        </div>
                                    </div>
                                    <div className="text-center mt-3">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-white/80 px-3 py-1 rounded-full border border-slate-200">
                                            <Laptop className="w-3.5 h-3.5 text-blue-600" />
                                            Laptop 1440px: {laptopScreen === 'dashboard' ? 'Panel Administrativo Completo' : 'Matriz de Doble Turno'}
                                        </span>
                                    </div>
                                </Tilt>
                            </div>

                            {/* TABLET Y TELÉFONO (A la derecha, en composición flotante) */}
                            <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-6 justify-center items-center">
                                
                                {/* TABLET MOCKUP */}
                                <Tilt
                                    tiltMaxAngleX={9}
                                    tiltMaxAngleY={9}
                                    perspective={1000}
                                    transitionSpeed={1500}
                                    glareEnable={true}
                                    glareMaxOpacity={0.15}
                                    glareColor="#ffffff"
                                    className="w-full max-w-[320px] cursor-grab active:cursor-grabbing"
                                >
                                    <div className="bg-slate-800 rounded-3xl p-3 shadow-xl border border-slate-700 relative">
                                        {/* Cámara de tablet */}
                                        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-slate-900" />
                                        
                                        {/* Pantalla Tablet */}
                                        <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 aspect-[3/4]">
                                            <Image
                                                src="/screenshots/system-tablet.png"
                                                alt="Sistema en Tablet"
                                                fill
                                                className="object-cover object-top"
                                            />
                                        </div>
                                    </div>
                                    <div className="text-center mt-2.5">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-white/80 px-3 py-1 rounded-full border border-slate-200">
                                            <Tablet className="w-3.5 h-3.5 text-blue-600" />
                                            Tablet: Gestión Académica y Lapsos
                                        </span>
                                    </div>
                                </Tilt>

                                {/* TELÉFONO MOCKUP */}
                                <Tilt
                                    tiltMaxAngleX={12}
                                    tiltMaxAngleY={12}
                                    perspective={1000}
                                    transitionSpeed={1500}
                                    glareEnable={true}
                                    glareMaxOpacity={0.2}
                                    glareColor="#ffffff"
                                    className="w-full max-w-[210px] cursor-grab active:cursor-grabbing"
                                >
                                    <div className="bg-slate-900 rounded-[32px] p-2.5 shadow-2xl border-2 border-slate-700 relative">
                                        {/* Dynamic Island */}
                                        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-16 h-4 bg-black rounded-full z-20" />
                                        
                                        {/* Pantalla Teléfono */}
                                        <div className="relative rounded-[24px] overflow-hidden bg-white aspect-[9/19] border border-slate-800">
                                            <Image
                                                src="/screenshots/system-phone.png"
                                                alt="Sistema en Móvil"
                                                fill
                                                className="object-cover object-top"
                                            />
                                        </div>
                                    </div>
                                    <div className="text-center mt-2.5">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-white/80 px-3 py-1 rounded-full border border-slate-200">
                                            <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                                            Móvil: Asistencia y Alumnos
                                        </span>
                                    </div>
                                </Tilt>

                            </div>
                        </div>
                    </div>
                )}

                {/* ========================================================= */}
                {/* 2. VISTA INDIVIDUAL: SOLO LAPTOP                           */}
                {/* ========================================================= */}
                {activeTab === 'laptop' && (
                    <div className="max-w-4xl mx-auto py-6 flex flex-col items-center">
                        <Tilt
                            tiltMaxAngleX={8}
                            tiltMaxAngleY={8}
                            perspective={1200}
                            transitionSpeed={1500}
                            glareEnable={true}
                            glareMaxOpacity={0.15}
                            glareColor="#ffffff"
                            glareBorderRadius="24px"
                            className="w-full cursor-grab active:cursor-grabbing"
                        >
                            <div className="bg-slate-800 rounded-t-3xl p-4 pt-5 shadow-2xl border border-slate-700 relative">
                                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-800" />
                                </div>
                                <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 aspect-[16/10]">
                                    <Image
                                        src={laptopScreen === 'dashboard' ? '/screenshots/system-laptop.png' : '/screenshots/system-horarios.png'}
                                        alt="Laptop Full Screen"
                                        fill
                                        className="object-cover object-top"
                                        priority
                                    />
                                </div>
                                <div className="h-4 bg-gradient-to-b from-slate-700 to-slate-800 -mx-4 -mb-4 rounded-b-xl border-t border-slate-600 flex justify-center">
                                    <div className="w-32 h-1.5 bg-slate-600 rounded-b-md" />
                                </div>
                            </div>
                        </Tilt>
                        <div className="mt-6 flex items-center gap-2 text-sm text-slate-600 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm">
                            <CheckCircle2 className="w-4 h-4 text-blue-600" />
                            <span>Resolución 1440x900 con interfaz administrativa completa</span>
                        </div>
                    </div>
                )}

                {/* ========================================================= */}
                {/* 3. VISTA INDIVIDUAL: SOLO TABLET                          */}
                {/* ========================================================= */}
                {activeTab === 'tablet' && (
                    <div className="max-w-xl mx-auto py-6 flex flex-col items-center">
                        <Tilt
                            tiltMaxAngleX={10}
                            tiltMaxAngleY={10}
                            perspective={1200}
                            transitionSpeed={1500}
                            glareEnable={true}
                            glareMaxOpacity={0.2}
                            glareColor="#ffffff"
                            glareBorderRadius="32px"
                            className="w-full cursor-grab active:cursor-grabbing"
                        >
                            <div className="bg-slate-800 rounded-[36px] p-4 shadow-2xl border border-slate-700 relative">
                                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-slate-900" />
                                <div className="relative rounded-[28px] overflow-hidden bg-slate-900 border border-slate-800 aspect-[3/4]">
                                    <Image
                                        src="/screenshots/system-tablet.png"
                                        alt="Tablet Full Screen"
                                        fill
                                        className="object-cover object-top"
                                        priority
                                    />
                                </div>
                            </div>
                        </Tilt>
                        <div className="mt-6 flex items-center gap-2 text-sm text-slate-600 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm">
                            <CheckCircle2 className="w-4 h-4 text-blue-600" />
                            <span>Optimizado para iPad y tabletas con control táctil intuitivo</span>
                        </div>
                    </div>
                )}

                {/* ========================================================= */}
                {/* 4. VISTA INDIVIDUAL: SOLO TELÉFONO                        */}
                {/* ========================================================= */}
                {activeTab === 'phone' && (
                    <div className="max-w-xs mx-auto py-6 flex flex-col items-center">
                        <Tilt
                            tiltMaxAngleX={14}
                            tiltMaxAngleY={14}
                            perspective={1000}
                            transitionSpeed={1500}
                            glareEnable={true}
                            glareMaxOpacity={0.25}
                            glareColor="#ffffff"
                            glareBorderRadius="40px"
                            className="w-full cursor-grab active:cursor-grabbing"
                        >
                            <div className="bg-slate-900 rounded-[44px] p-3 shadow-2xl border-2 border-slate-700 relative">
                                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full z-20 flex items-center justify-end pr-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-950" />
                                </div>
                                <div className="relative rounded-[34px] overflow-hidden bg-white aspect-[9/19] border border-slate-800">
                                    <Image
                                        src="/screenshots/system-phone.png"
                                        alt="Phone Full Screen"
                                        fill
                                        className="object-cover object-top"
                                        priority
                                    />
                                </div>
                            </div>
                        </Tilt>
                        <div className="mt-6 flex items-center gap-2 text-sm text-slate-600 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm">
                            <CheckCircle2 className="w-4 h-4 text-blue-600" />
                            <span>Asistencia rápida y consulta de notas directamente en el aula</span>
                        </div>
                    </div>
                )}

            </div>
        </section>
    );
}
