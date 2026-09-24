'use client';

import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { useState } from 'react';
import { Building2, Palette, GraduationCap, Bell, Shield, Wallet, QrCode } from 'lucide-react';
import { GeneralSettings } from './components/GeneralSettings';
import { AppearanceSettings } from './components/AppearanceSettings';
import { AcademicSettings } from './components/AcademicSettings';
import { NotificationSettings } from './components/NotificationSettings';
import { SecuritySettings } from './components/SecuritySettings';
import { PaymentSettings } from './components/PaymentSettings';
import { QrSettings } from './components/QrSettings';

const tabs = [
    { id: 'general', label: 'Información General', icon: Building2, component: GeneralSettings },
    { id: 'appearance', label: 'Apariencia', icon: Palette, component: AppearanceSettings },
    { id: 'academic', label: 'Configuración Académica', icon: GraduationCap, component: AcademicSettings },
    { id: 'payments', label: 'Pagos', icon: Wallet, component: PaymentSettings },
    { id: 'qr', label: 'Asistencia por QR', icon: QrCode, component: QrSettings },
    { id: 'notifications', label: 'Notificaciones', icon: Bell, component: NotificationSettings },
    { id: 'security', label: 'Seguridad', icon: Shield, component: SecuritySettings },
];

export default function ConfiguracionPage() {
    const [activeTab, setActiveTab] = useState('general');

    const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || GeneralSettings;

    return (
        // Sin `min-h-screen bg-gray-50 p-6` propio: el marco de la pantalla ya
        // pone el fondo y el margen, y con los dos el título quedaba 24 px más
        // adentro que en el resto de pantallas.
        <div className="space-y-6">
            <EncabezadoDePantalla
                titulo="Configuración del Instituto"
                descripcion="Gestiona la información y configuración general de tu instituto"
            />

            {/* Tabs */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex flex-wrap" aria-label="Tabs">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        group inline-flex items-center px-6 py-4 border-b-2 font-medium text-sm whitespace-nowrap transition-colors
                                        ${isActive
                                            ? 'border-indigo-500 text-indigo-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }
                                    `}
                                >
                                    <Icon className={`-ml-0.5 mr-2 h-5 w-5 ${isActive ? 'text-indigo-500' : 'text-gray-400 group-hover:text-gray-500'}`} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Tab Content */}
                <div className="p-6">
                    <ActiveComponent />
                </div>
            </div>
        </div>
    );
}
