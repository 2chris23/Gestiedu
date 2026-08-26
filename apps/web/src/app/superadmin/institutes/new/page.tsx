'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SuperAdminLayout from '../../layout';

export default function NewInstitutePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState(1);
    const [createdInstitute, setCreatedInstitute] = useState<any>(null);

    // Form data
    const [formData, setFormData] = useState({
        // Instituto
        name: '',
        code: '',
        email: '',
        phone: '',
        address: '',
        subdomain: '',
        // Admin
        adminCI: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
    });

    // Auto-generate subdomain from name
    useEffect(() => {
        if (formData.name && !formData.subdomain) {
            const slug = formData.name
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') // Remove accents
                .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with dash
                .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes

            setFormData(prev => ({ ...prev, subdomain: slug }));
        }
    }, [formData.name, formData.subdomain]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch(
                `/api/superadmin/institutes`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${document.cookie.split('superadmin_access_token=')[1]?.split(';')[0]}`,
                    },
                    body: JSON.stringify({
                        name: formData.name,
                        code: formData.code,
                        email: formData.email,
                        phone: formData.phone || undefined,
                        address: formData.address || undefined,
                        subdomain: formData.subdomain,
                        adminCI: formData.adminCI,
                        adminName: formData.adminName,
                        adminEmail: formData.adminEmail,
                        adminPassword: formData.adminPassword,
                    }),
                }
            );

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Error al crear instituto');
            }

            const data = await response.json();
            setCreatedInstitute(data);
            setStep(3); // Success step
        } catch (err: any) {
            setError(err.message || 'Error al crear instituto');
        } finally {
            setLoading(false);
        }
    };

    const getPreviewUrl = () => {
        if (!formData.subdomain) return '';
        return `http://${formData.subdomain}.localhost:3000`;
    };

    return (
        <SuperAdminLayout>
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Crear Nuevo Instituto</h1>
                    <p className="text-gray-400">
                        Configura un nuevo instituto en la plataforma
                    </p>
                </div>

                {/* Progress Steps */}
                <div className="mb-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-violet-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                                1
                            </div>
                            <div className="ml-3">
                                <p className="text-sm font-medium text-white">Información del Instituto</p>
                            </div>
                        </div>
                        <div className={`flex-1 h-1 mx-4 ${step >= 2 ? 'bg-violet-600' : 'bg-gray-700'}`}></div>
                        <div className="flex items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-violet-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                                2
                            </div>
                            <div className="ml-3">
                                <p className="text-sm font-medium text-white">Administrador</p>
                            </div>
                        </div>
                        <div className={`flex-1 h-1 mx-4 ${step >= 3 ? 'bg-violet-600' : 'bg-gray-700'}`}></div>
                        <div className="flex items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-violet-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                                3
                            </div>
                            <div className="ml-3">
                                <p className="text-sm font-medium text-white">Completado</p>
                            </div>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200">
                        {error}
                    </div>
                )}

                {step === 1 && (
                    <form onSubmit={(e) => { e.preventDefault(); setStep(2); }} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <h2 className="text-xl font-bold text-white mb-6">Paso 1: Información del Instituto</h2>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">Nombre del Instituto *</label>
                                <input
                                    id="name"
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    placeholder="Ej: Instituto Educativo San Miguel"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="code" className="block text-sm font-medium text-gray-300 mb-2">Código *</label>
                                    <input
                                        id="code"
                                        type="text"
                                        name="code"
                                        value={formData.code}
                                        onChange={handleChange}
                                        required
                                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        placeholder="Ej: IESM-001"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">Email *</label>
                                    <input
                                        id="email"
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        required
                                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        placeholder="contacto@instituto.edu"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-2">Teléfono</label>
                                    <input
                                        id="phone"
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        placeholder="+58 412 1234567"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="subdomain" className="block text-sm font-medium text-gray-300 mb-2">Subdominio *</label>
                                    <input
                                        id="subdomain"
                                        type="text"
                                        name="subdomain"
                                        value={formData.subdomain}
                                        onChange={handleChange}
                                        required
                                        pattern="[a-z0-9-]+"
                                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        placeholder="san-miguel"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">
                                        Solo letras minúsculas, números y guiones
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="address" className="block text-sm font-medium text-gray-300 mb-2">Dirección</label>
                                <textarea
                                    id="address"
                                    name="address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    rows={3}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    placeholder="Dirección completa del instituto"
                                />
                            </div>

                            {/* URL Preview */}
                            {formData.subdomain && (
                                <div className="p-4 bg-violet-500/10 border border-violet-500/30 rounded-lg">
                                    <p className="text-sm font-medium text-gray-300 mb-2">URL de Acceso (Desarrollo)</p>
                                    <p className="text-violet-400 font-mono text-sm">
                                        {getPreviewUrl()}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-2">
                                        Esta será la URL para acceder al instituto en desarrollo local
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                type="submit"
                                className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
                            >
                                Siguiente
                            </button>
                        </div>
                    </form>
                )}

                {step === 2 && (
                    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <h2 className="text-xl font-bold text-white mb-6">Paso 2: Administrador del Instituto</h2>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="adminCI" className="block text-sm font-medium text-gray-300 mb-2">Cédula de Identidad *</label>
                                <input
                                    id="adminCI"
                                    type="text"
                                    name="adminCI"
                                    value={formData.adminCI}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    placeholder="V-12345678"
                                />
                            </div>

                            <div>
                                <label htmlFor="adminName" className="block text-sm font-medium text-gray-300 mb-2">Nombre Completo *</label>
                                <input
                                    id="adminName"
                                    type="text"
                                    name="adminName"
                                    value={formData.adminName}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    placeholder="Juan Pérez"
                                />
                            </div>

                            <div>
                                <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-300 mb-2">Email *</label>
                                <input
                                    id="adminEmail"
                                    type="email"
                                    name="adminEmail"
                                    value={formData.adminEmail}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    placeholder="admin@instituto.edu"
                                />
                            </div>

                            <div>
                                <label htmlFor="adminPassword" className="block text-sm font-medium text-gray-300 mb-2">Contraseña *</label>
                                <input
                                    id="adminPassword"
                                    type="password"
                                    name="adminPassword"
                                    value={formData.adminPassword}
                                    onChange={handleChange}
                                    required
                                    minLength={8}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    placeholder="Mínimo 8 caracteres"
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-between">
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                            >
                                Atrás
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-6 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
                            >
                                {loading ? 'Creando...' : 'Crear Instituto'}
                            </button>
                        </div>
                    </form>
                )}

                {step === 3 && createdInstitute && (
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">¡Instituto Creado Exitosamente!</h2>
                            <p className="text-gray-400">
                                El instituto ha sido provisionado y está listo para usar
                            </p>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div className="p-4 bg-gray-700 rounded-lg">
                                <p className="text-sm text-gray-400 mb-1">Nombre</p>
                                <p className="text-white font-medium">{createdInstitute.name}</p>
                            </div>

                            <div className="p-4 bg-gray-700 rounded-lg">
                                <p className="text-sm text-gray-400 mb-1">URL de Acceso</p>
                                <a
                                    href={`http://${createdInstitute.subdomain}.localhost:3000`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-violet-400 hover:text-violet-300 font-mono text-sm"
                                >
                                    http://{createdInstitute.subdomain}.localhost:3000 ↗
                                </a>
                            </div>

                            <div className="p-4 bg-gray-700 rounded-lg">
                                <p className="text-sm text-gray-400 mb-1">Credenciales del Administrador</p>
                                <p className="text-white text-sm">Email: {formData.adminEmail}</p>
                                <p className="text-white text-sm">Contraseña: {formData.adminPassword}</p>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => router.push('/superadmin/institutes')}
                                className="flex-1 px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
                            >
                                Ver Todos los Institutos
                            </button>
                            <button
                                onClick={() => {
                                    setStep(1);
                                    setCreatedInstitute(null);
                                    setFormData({
                                        name: '',
                                        code: '',
                                        email: '',
                                        phone: '',
                                        address: '',
                                        subdomain: '',
                                        adminCI: '',
                                        adminName: '',
                                        adminEmail: '',
                                        adminPassword: '',
                                    });
                                }}
                                className="flex-1 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                            >
                                Crear Otro Instituto
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </SuperAdminLayout>
    );
}
