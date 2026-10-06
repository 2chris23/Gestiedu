'use client';

import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { useState } from 'react';
import { Building2, Palette, GraduationCap, Bell, Shield, Wallet, QrCode, FileText, UtensilsCrossed } from 'lucide-react';
import { GeneralSettings } from './components/GeneralSettings';
import { diferido } from '@/components/common/Diferido';

// Se abre en «Información General»; cada una de las demás pestañas baja al
// pulsarla (carga diferida), no con la pantalla.
const AppearanceSettings = diferido(() => import('./components/AppearanceSettings').then((m) => ({ default: m.AppearanceSettings })), { alto: 480 });
const AcademicSettings = diferido(() => import('./components/AcademicSettings').then((m) => ({ default: m.AcademicSettings })), { alto: 480 });
const NotificationSettings = diferido(() => import('./components/NotificationSettings').then((m) => ({ default: m.NotificationSettings })), { alto: 480 });
const SecuritySettings = diferido(() => import('./components/SecuritySettings').then((m) => ({ default: m.SecuritySettings })), { alto: 480 });
const PaymentSettings = diferido(() => import('./components/PaymentSettings').then((m) => ({ default: m.PaymentSettings })), { alto: 480 });
const DocumentSettings = diferido(() => import('./components/DocumentSettings').then((m) => ({ default: m.DocumentSettings })), { alto: 480 });
const PaeSettings = diferido(() => import('./components/PaeSettings').then((m) => ({ default: m.PaeSettings })), { alto: 360 });
const QrSettings = diferido(() => import('./components/QrSettings').then((m) => ({ default: m.QrSettings })), { alto: 480 });

/**
 * Cada apartado dice qué hay dentro (escaneo UI/UX, 2026-10-01): nueve
 * pestañas con solo un nombre obligaban a abrirlas una a una para encontrar,
 * por ejemplo, dónde se cambia la nota mínima. En el teléfono, además, se
 * amontonaban en filas desiguales.
 */
const tabs = [
    { id: 'general', label: 'Información General', pista: 'Nombre, contacto y datos del Ministerio', icon: Building2, component: GeneralSettings },
    { id: 'appearance', label: 'Apariencia', pista: 'Logo, escudo y colores', icon: Palette, component: AppearanceSettings },
    { id: 'academic', label: 'Configuración Académica', pista: 'Notas, lapsos, horario y fin de año', icon: GraduationCap, component: AcademicSettings },
    { id: 'documents', label: 'Documentos', pista: 'Constancias, firma y recaudos', icon: FileText, component: DocumentSettings },
    { id: 'payments', label: 'Pagos', pista: 'Cuotas, monedas y vencimientos', icon: Wallet, component: PaymentSettings },
    { id: 'pae', label: 'Comedor (PAE)', pista: 'Activar y ajustar el comedor', icon: UtensilsCrossed, component: PaeSettings },
    { id: 'qr', label: 'Asistencia por QR', pista: 'Escanear para pasar lista', icon: QrCode, component: QrSettings },
    { id: 'notifications', label: 'Notificaciones', pista: 'Qué avisos se envían', icon: Bell, component: NotificationSettings },
    { id: 'security', label: 'Seguridad', pista: 'Sesiones y contraseñas', icon: Shield, component: SecuritySettings },
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
                titulo="Configuración del liceo"
                descripcion="Lo que se ajusta una vez y vale para todo el liceo: sus datos, las reglas de notas y horario, los documentos, los pagos y los avisos."
            />

            {/* Tabs */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200">
                    <nav className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="Apartados de la configuración">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    data-pestana
                                    data-recorrido={`config-${tab.id}`}
                                    aria-pressed={isActive}
                                    // El nombre es el apartado; lo de dentro, su descripción.
                                    aria-label={tab.label}
                                    aria-describedby={`pista-${tab.id}`}
                                    className={`group flex min-h-[44px] items-start gap-2 rounded-xl border p-3 text-left transition-colors ${
                                        isActive
                                            ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                                            : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${isActive ? 'text-indigo-600' : 'text-gray-500'}`} aria-hidden />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold leading-tight">{tab.label}</span>
                                        <span id={`pista-${tab.id}`} className={`mt-0.5 block text-xs leading-snug ${isActive ? 'text-indigo-700' : 'text-gray-600'}`}>{tab.pista}</span>
                                    </span>
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
