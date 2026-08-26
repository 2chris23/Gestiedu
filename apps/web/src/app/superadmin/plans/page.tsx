'use client';

import { useState } from 'react';

interface Plan {
    id: string;
    name: string;
    slug: string;
    maxStudents: number;
    maxTeachers: number;
    maxAdmins: number;
    priceMonthly: number;
    features: string[];
    isActive: boolean;
    institutesCount: number;
}

const defaultPlans: Plan[] = [
    {
        id: '1',
        name: 'Básico',
        slug: 'basic',
        maxStudents: 500,
        maxTeachers: 30,
        maxAdmins: 3,
        priceMonthly: 0,
        features: ['Gestión de estudiantes', 'Calificaciones', 'Asistencia', 'Reportes básicos'],
        isActive: true,
        institutesCount: 12,
    },
    {
        id: '2',
        name: 'Profesional',
        slug: 'professional',
        maxStudents: 5000,
        maxTeachers: 200,
        maxAdmins: 10,
        priceMonthly: 49.99,
        features: ['Todo del Básico', 'Comunicación padres', 'Horarios automáticos', 'API acceso', 'Soporte prioritario'],
        isActive: true,
        institutesCount: 8,
    },
    {
        id: '3',
        name: 'Empresarial',
        slug: 'enterprise',
        maxStudents: 20000,
        maxTeachers: 1000,
        maxAdmins: 50,
        priceMonthly: 149.99,
        features: ['Todo del Profesional', 'Multi-sede', 'Analíticas avanzadas', 'SSO/LDAP', 'SLA garantizado', 'Soporte 24/7'],
        isActive: true,
        institutesCount: 3,
    },
];

export default function PlansPage() {
    const [plans] = useState<Plan[]>(defaultPlans);
    const [showCreateModal, setShowCreateModal] = useState(false);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Planes y Tarifas</h1>
                    <p className="mt-1 text-gray-400">Gestiona los planes disponibles para los institutos</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-all duration-200 shadow-lg shadow-violet-600/25 flex items-center gap-2"
                >
                    <span className="text-lg">+</span>
                    Nuevo Plan
                </button>
            </div>

            {/* Estadísticas */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Planes', value: plans.length, icon: '📋', color: 'violet' },
                    { label: 'Planes Activos', value: plans.filter(p => p.isActive).length, icon: '✅', color: 'emerald' },
                    { label: 'Institutos Asignados', value: plans.reduce((a, b) => a + b.institutesCount, 0), icon: '🏫', color: 'blue' },
                    { label: 'Ingresos Mensuales', value: `$${plans.reduce((a, b) => a + (b.priceMonthly * b.institutesCount), 0).toFixed(2)}`, icon: '💰', color: 'amber' },
                ].map((stat) => (
                    <div key={stat.label} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="text-2xl">{stat.icon}</span>
                            <span className="text-sm text-gray-400">{stat.label}</span>
                        </div>
                        <span className="text-2xl font-bold text-white">{stat.value}</span>
                    </div>
                ))}
            </div>

            {/* Cards de Planes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map((plan) => (
                    <div
                        key={plan.id}
                        className={`relative bg-white/5 backdrop-blur-sm border rounded-2xl p-6 transition-all duration-300 hover:bg-white/8 hover:shadow-xl ${
                            plan.slug === 'professional' ? 'border-violet-500/50 ring-1 ring-violet-500/20' : 'border-white/10'
                        }`}
                    >
                        {plan.slug === 'professional' && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-violet-600 text-white text-xs font-bold rounded-full uppercase tracking-wider">
                                Popular
                            </div>
                        )}

                        <div className="text-center mb-6">
                            <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                            <div className="mt-3">
                                <span className="text-4xl font-extrabold text-white">
                                    {plan.priceMonthly === 0 ? 'Gratis' : `$${plan.priceMonthly}`}
                                </span>
                                {plan.priceMonthly > 0 && (
                                    <span className="text-gray-400 text-sm">/mes</span>
                                )}
                            </div>
                            <p className="mt-2 text-sm text-gray-400">
                                {plan.institutesCount} instituto{plan.institutesCount !== 1 ? 's' : ''} activo{plan.institutesCount !== 1 ? 's' : ''}
                            </p>
                        </div>

                        {/* Límites */}
                        <div className="space-y-2 mb-6">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400">Estudiantes</span>
                                <span className="text-white font-medium">{plan.maxStudents.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400">Profesores</span>
                                <span className="text-white font-medium">{plan.maxTeachers.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400">Administradores</span>
                                <span className="text-white font-medium">{plan.maxAdmins.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="h-px bg-white/10 mb-6"></div>

                        {/* Features */}
                        <ul className="space-y-2 mb-6">
                            {plan.features.map((feature) => (
                                <li key={feature} className="flex items-start gap-2 text-sm">
                                    <span className="text-emerald-400 mt-0.5">✓</span>
                                    <span className="text-gray-300">{feature}</span>
                                </li>
                            ))}
                        </ul>

                        <div className="flex gap-2">
                            <button className="flex-1 py-2 px-4 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl transition-colors">
                                Editar
                            </button>
                            <button className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                                plan.isActive
                                    ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                                    : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                            }`}>
                                {plan.isActive ? 'Activo' : 'Inactivo'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal placeholder */}
            {showCreateModal && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setShowCreateModal(false)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowCreateModal(false); } }}
                >
                    <div
                        className="bg-slate-800 border border-white/10 rounded-2xl p-8 max-w-lg w-full"
                        onClick={e => e.stopPropagation()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}
                    >
                        <h2 className="text-2xl font-bold text-white mb-6">Crear Nuevo Plan</h2>
                        <div className="space-y-4">
                            {[
                                { label: 'Nombre del Plan', placeholder: 'ej: Premium' },
                                { label: 'Slug', placeholder: 'ej: premium' },
                                { label: 'Precio Mensual ($)', placeholder: '0.00', type: 'number' },
                                { label: 'Máx. Estudiantes', placeholder: '5000', type: 'number' },
                                { label: 'Máx. Profesores', placeholder: '200', type: 'number' },
                            ].map((field) => (
                                <div key={field.label}>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">{field.label}</label>
                                    <input
                                        type={field.type || 'text'}
                                        placeholder={field.placeholder}
                                        className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 flex gap-3 justify-end">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-violet-600/25">
                                Crear Plan
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
