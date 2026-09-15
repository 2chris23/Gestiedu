'use client';

import { useEffect, useState, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter, useParams } from 'next/navigation';
import { useSuperAdminAuthStore } from '@/store/superadmin-auth.store';
import { superAdminFetch } from '@/lib/superadmin-fetch';
import SuperAdminLayout from '../../layout';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Institute {
    id: string;
    name: string;
    code: string;
    slug: string;
    subdomain: string;
    email: string;
    phone?: string;
    address?: string;
    status: string;
    plan: string;
    maxStudents: number;
    currentStudents: number;
    maxTeachers: number;
    currentTeachers: number;
    maxStorage: number;
    currentStorage: number;
    monthlyPrice: number;
    billingStatus: string;
    nextBillingDate?: string;
    createdAt: string;
    notes?: string;
    databaseName?: string;
    adminId?: string;
}

interface PlanConfig {
    name: string;
    displayName: string;
    description: string;
    maxStudents: number;
    maxTeachers: number;
    maxStorage: number;
    monthlyPrice: number;
    features: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function usagePct(current: number, max: number) {
    return Math.min(Math.round((current / max) * 100), 100);
}

function usageColor(pct: number) {
    if (pct >= 90) return { bar: 'bg-red-500', text: 'text-red-400', ring: 'ring-red-500/30' };
    if (pct >= 75) return { bar: 'bg-amber-500', text: 'text-amber-400', ring: 'ring-amber-500/30' };
    return { bar: 'bg-emerald-500', text: 'text-emerald-400', ring: 'ring-emerald-500/30' };
}

const STATUS_STYLES: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    SUSPENDED: 'bg-red-500/20 text-red-400 border-red-500/40',
    PENDING: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    PROVISIONING: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    INACTIVE: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
    FAILED: 'bg-red-500/20 text-red-400 border-red-500/40',
};

const PLAN_STYLES: Record<string, string> = {
    BASIC: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    PREMIUM: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    ENTERPRISE: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
};

const BILLING_LABEL: Record<string, string> = {
    ACTIVE: '✅ Al día',
    SUSPENDED: '🚫 Suspendido',
    TRIAL: '🔬 Período de prueba',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function UsageBar({ label, current, max }: { label: string; current: number; max: number }) {
    const pct = usagePct(current, max);
    const colors = usageColor(pct);
    return (
        <div>
            <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-400">{label}</span>
                <span className={`text-sm font-semibold ${colors.text}`}>
                    {current.toLocaleString()} / {max.toLocaleString()}
                    <span className="text-gray-500 font-normal ml-1">({pct}%)</span>
                </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div
                    className={`h-2.5 rounded-full transition-all duration-700 ${colors.bar}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            {pct >= 90 && (
                <p className="mt-1 text-xs text-red-400 font-medium">⚠️ Límite casi alcanzado</p>
            )}
            {pct >= 75 && pct < 90 && (
                <p className="mt-1 text-xs text-amber-400">↗ Alcanzando el límite pronto</p>
            )}
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between items-start py-2 border-b border-gray-700/50 last:border-0">
            <span className="text-sm text-gray-400 shrink-0">{label}</span>
            <span className="text-sm text-white text-right ml-4 font-medium">{value}</span>
        </div>
    );
}

// ─── Change Plan Modal ────────────────────────────────────────────────────────

function ChangePlanModal({
    institute,
    plans,
    onClose,
    onSuccess,
}: {
    institute: Institute;
    plans: PlanConfig[];
    onClose: () => void;
    onSuccess: (newPlan: string) => void;
}) {
    const [selected, setSelected] = useState(institute.plan);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleConfirm = async () => {
        if (selected === institute.plan) { onClose(); return; }
        setSaving(true);
        setError('');
        try {
            const res = await superAdminFetch(`/api/superadmin/institutes/${institute.id}/plan`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: selected }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || data.error || 'Error al cambiar plan');
            onSuccess(selected);
            onClose();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const PLAN_ICONS: Record<string, string> = { BASIC: '🪨', PREMIUM: '💎', ENTERPRISE: '🚀' };
    const PLAN_COLORS: Record<string, string> = {
        BASIC: 'border-slate-500 bg-slate-500/10',
        PREMIUM: 'border-violet-500 bg-violet-500/10',
        ENTERPRISE: 'border-amber-500 bg-amber-500/10',
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-gray-700 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white">Cambiar Plan</h2>
                        <p className="text-sm text-gray-400 mt-0.5">Instituto: <span className="text-white">{institute.name}</span></p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Plans Grid */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    {plans.map((plan) => {
                        const isSelected = selected === plan.name;
                        const isCurrent = institute.plan === plan.name;
                        return (
                            <button
                                key={plan.name}
                                onClick={() => setSelected(plan.name)}
                                className={`relative text-left p-4 rounded-xl border-2 transition-all duration-200 ${isSelected
                                        ? `${PLAN_COLORS[plan.name]} scale-[1.02] shadow-lg`
                                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                                    }`}
                            >
                                {isCurrent && (
                                    <span className="absolute top-2 right-2 text-xs bg-violet-600 text-white px-2 py-0.5 rounded-full">
                                        Actual
                                    </span>
                                )}
                                <div className="text-2xl mb-2">{PLAN_ICONS[plan.name]}</div>
                                <h3 className="font-bold text-white">{plan.displayName}</h3>
                                <p className="text-2xl font-bold text-white mt-1">
                                    ${plan.monthlyPrice}
                                    <span className="text-sm text-gray-400 font-normal">/mes</span>
                                </p>
                                <div className="mt-3 space-y-1">
                                    <p className="text-xs text-gray-300">👥 {plan.maxStudents.toLocaleString()} estudiantes</p>
                                    <p className="text-xs text-gray-300">👨‍🏫 {plan.maxTeachers} profesores</p>
                                    <p className="text-xs text-gray-300">💾 {plan.maxStorage} GB storage</p>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Warning if downgrade might be blocked */}
                {selected !== institute.plan && (() => {
                    const newPlan = plans.find(p => p.name === selected);
                    if (!newPlan) return null;
                    const overStudents = institute.currentStudents > newPlan.maxStudents;
                    const overTeachers = institute.currentTeachers > newPlan.maxTeachers;
                    if (overStudents || overTeachers) {
                        return (
                            <div className="mx-6 mb-4 p-3 bg-red-500/15 border border-red-500/40 rounded-xl text-sm text-red-300">
                                ⚠️ <strong>No se puede degradar:</strong>{' '}
                                {overStudents && `El instituto tiene ${institute.currentStudents.toLocaleString()} estudiantes (límite: ${newPlan.maxStudents.toLocaleString()}). `}
                                {overTeachers && `Tiene ${institute.currentTeachers} profesores (límite: ${newPlan.maxTeachers}).`}
                            </div>
                        );
                    }
                    return null;
                })()}

                {error && (
                    <div className="mx-6 mb-4 p-3 bg-red-500/15 border border-red-500/40 rounded-xl text-sm text-red-300">
                        ❌ {error}
                    </div>
                )}

                {/* Footer */}
                <div className="p-6 pt-0 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500 rounded-xl transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={saving || selected === institute.plan}
                        className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                        {saving ? 'Aplicando...' : selected === institute.plan ? 'Sin cambios' : `Cambiar a ${selected}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function InstituteDetailPage() {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string;

    const [institute, setInstitute] = useState<Institute | null>(null);
    const [plans, setPlans] = useState<PlanConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showPlanModal, setShowPlanModal] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        status: 'ACTIVE',
    });

    // ── Fetch ──────────────────────────────────────────────────────────────

    const fetchData = useCallback(async () => {
        if (!id) return;
        try {
            const [instRes, plansRes] = await Promise.all([
                superAdminFetch(`/api/superadmin/institutes/${id}`),
                superAdminFetch(`/api/superadmin/institutes/plans`),
            ]);

            if (instRes.ok) {
                const data = await instRes.json();
                setInstitute(data);
                setFormData({
                    name: data.name,
                    email: data.email,
                    phone: data.phone || '',
                    address: data.address || '',
                    status: data.status,
                });
            }
            if (plansRes.ok) {
                const data = await plansRes.json();
                setPlans(data.plans || []);
            }
        } catch (e) {
            console.error('Error fetching institute:', e);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── Save general info ──────────────────────────────────────────────────

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const res = await superAdminFetch(`/api/superadmin/institutes/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            if (res.ok) {
                const updated = await res.json();
                setInstitute(prev => prev ? { ...prev, ...updated } : updated);
                setEditing(false);
            } else {
                const data = await res.json();
                setError(data.error || 'Error al actualizar');
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setSaving(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <SuperAdminLayout>
                <div className="p-8 flex items-center justify-center h-64">
                    <div className="flex items-center gap-3 text-gray-400">
                        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        Cargando instituto...
                    </div>
                </div>
            </SuperAdminLayout>
        );
    }

    if (!institute) {
        return (
            <SuperAdminLayout>
                <div className="p-8 text-center text-gray-400">
                    <p className="text-5xl mb-4">🏫</p>
                    <p className="text-lg">Instituto no encontrado</p>
                    <button onClick={() => router.back()} className="mt-4 text-violet-400 hover:text-violet-300">← Volver</button>
                </div>
            </SuperAdminLayout>
        );
    }

    const studentPct = usagePct(institute.currentStudents, institute.maxStudents);
    const teacherPct = usagePct(institute.currentTeachers, institute.maxTeachers);
    const storagePct = usagePct(institute.currentStorage, institute.maxStorage);
    const hasWarning = studentPct >= 90 || teacherPct >= 90 || storagePct >= 90;

    return (
        <SuperAdminLayout>
            {showPlanModal && institute && (
                <ChangePlanModal
                    institute={institute}
                    plans={plans}
                    onClose={() => setShowPlanModal(false)}
                    onSuccess={(newPlan) => {
                        const planConfig = plans.find(p => p.name === newPlan);
                        if (planConfig) {
                            setInstitute(prev => prev ? {
                                ...prev,
                                plan: newPlan,
                                maxStudents: planConfig.maxStudents,
                                maxTeachers: planConfig.maxTeachers,
                                maxStorage: planConfig.maxStorage,
                                monthlyPrice: planConfig.monthlyPrice,
                            } : prev);
                        }
                    }}
                />
            )}

            <div className="p-8 max-w-7xl mx-auto">
                {/* ── Header ──────────────────────────────────────────── */}
                <div className="flex items-start justify-between mb-8">
                    <div>
                        <button
                            onClick={() => router.back()}
                            className="text-gray-400 hover:text-white mb-3 flex items-center gap-2 text-sm transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Volver a institutos
                        </button>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold text-white">{institute.name}</h1>
                            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_STYLES[institute.status] || STATUS_STYLES.INACTIVE}`}>
                                {institute.status}
                            </span>
                            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${PLAN_STYLES[institute.plan] || PLAN_STYLES.BASIC}`}>
                                {institute.plan}
                            </span>
                        </div>
                        <p className="text-gray-400 mt-1 text-sm">{institute.code} · {institute.subdomain}.localhost:3000</p>
                    </div>
                    <button
                        onClick={() => editing ? setEditing(false) : setEditing(true)}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors text-sm font-medium"
                    >
                        {editing ? '✕ Cancelar' : '✏️ Editar'}
                    </button>
                </div>

                {/* ── Alert banner ─────────────────────────────────────── */}
                {hasWarning && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
                        <span className="text-2xl">🚨</span>
                        <div>
                            <p className="text-red-300 font-semibold">Límites críticos detectados</p>
                            <p className="text-red-400/80 text-sm">Este instituto está cerca de su límite del plan. Considera hacer upgrade.</p>
                        </div>
                        <button
                            onClick={() => setShowPlanModal(true)}
                            className="ml-auto px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 rounded-lg text-sm transition-colors whitespace-nowrap"
                        >
                            Cambiar Plan →
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* ══ Left: Plan & Billing + Uso ════════════════════ */}
                    <div className="xl:col-span-2 space-y-6">

                        {/* Plan y Facturación */}
                        <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-gray-700">
                                <div>
                                    <h2 className="text-lg font-bold text-white">Plan y Facturación</h2>
                                    <p className="text-sm text-gray-400">Suscripción actual y límites del instituto</p>
                                </div>
                                <button
                                    onClick={() => setShowPlanModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Cambiar Plan
                                </button>
                            </div>

                            <div className="p-6">
                                {/* Plan overview cards */}
                                <div className="grid grid-cols-3 gap-4 mb-6">
                                    <div className="bg-gray-700/50 rounded-xl p-4 text-center">
                                        <p className="text-xs text-gray-400 mb-1">Plan actual</p>
                                        <p className={`text-lg font-bold ${institute.plan === 'ENTERPRISE' ? 'text-amber-400' : institute.plan === 'PREMIUM' ? 'text-violet-400' : 'text-gray-300'}`}>
                                            {institute.plan === 'BASIC' ? '🪨 Básico' : institute.plan === 'PREMIUM' ? '💎 Premium' : '🚀 Enterprise'}
                                        </p>
                                    </div>
                                    <div className="bg-gray-700/50 rounded-xl p-4 text-center">
                                        <p className="text-xs text-gray-400 mb-1">Costo mensual</p>
                                        <p className="text-lg font-bold text-white">${Number(institute.monthlyPrice).toFixed(0)}<span className="text-gray-400 text-sm font-normal">/mes</span></p>
                                    </div>
                                    <div className="bg-gray-700/50 rounded-xl p-4 text-center">
                                        <p className="text-xs text-gray-400 mb-1">Estado de facturación</p>
                                        <p className="text-sm font-medium text-white">{BILLING_LABEL[institute.billingStatus] || institute.billingStatus}</p>
                                    </div>
                                </div>

                                {/* Usage bars */}
                                <div className="space-y-5">
                                    <UsageBar label="Estudiantes" current={institute.currentStudents} max={institute.maxStudents} />
                                    <UsageBar label="Profesores" current={institute.currentTeachers} max={institute.maxTeachers} />
                                    <UsageBar
                                        label="Almacenamiento"
                                        current={Math.round(institute.currentStorage * 10) / 10}
                                        max={institute.maxStorage}
                                    />
                                </div>

                                {/* Next billing */}
                                {institute.nextBillingDate && (
                                    <div className="mt-5 pt-5 border-t border-gray-700">
                                        <p className="text-sm text-gray-400">
                                            📅 Próxima facturación:{' '}
                                            <span className="text-white font-medium">
                                                {new Date(institute.nextBillingDate).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })}
                                            </span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Información General */}
                        <div className="bg-gray-800 rounded-2xl border border-gray-700">
                            <div className="px-6 pt-6 pb-4 border-b border-gray-700">
                                <h2 className="text-lg font-bold text-white">Información General</h2>
                            </div>
                            <div className="p-6">
                                {editing ? (
                                    <div className="space-y-4">
                                        {[
                                            { label: 'Nombre', key: 'name', type: 'text' },
                                            { label: 'Email', key: 'email', type: 'email' },
                                            { label: 'Teléfono', key: 'phone', type: 'tel' },
                                        ].map(({ label, key, type }) => (
                                            <div key={key}>
                                                <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
                                                <input
                                                    type={type}
                                                    value={(formData as any)[key]}
                                                    onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                                                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                                />
                                            </div>
                                        ))}
                                        <div>
                                            <label htmlFor="institute-address" className="block text-sm font-medium text-gray-300 mb-1.5">Dirección</label>
                                            <textarea
                                                id="institute-address"
                                                value={formData.address}
                                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                                rows={2}
                                                className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="institute-edit-status" className="block text-sm font-medium text-gray-300 mb-1.5">Estado</label>
                                            <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {['ACTIVE', 'SUSPENDED', 'PENDING', 'INACTIVE'].map(s => (
                                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {error && (
                                            <div className="p-3 bg-red-500/15 border border-red-500/40 rounded-xl text-red-300 text-sm">{error}</div>
                                        )}
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setEditing(false)}
                                                className="flex-1 py-2.5 border border-gray-600 text-gray-300 hover:text-white rounded-xl transition-colors"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={handleSave}
                                                disabled={saving}
                                                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors disabled:opacity-50 font-medium"
                                            >
                                                {saving ? 'Guardando...' : 'Guardar'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <InfoRow label="Email" value={institute.email} />
                                        <InfoRow label="Teléfono" value={institute.phone || '—'} />
                                        <InfoRow label="Dirección" value={institute.address || '—'} />
                                        <InfoRow label="Creado" value={new Date(institute.createdAt).toLocaleDateString('es-VE')} />
                                        <InfoRow label="Base de datos" value={<code className="text-xs bg-gray-700 px-2 py-0.5 rounded text-violet-300">{institute.databaseName || '—'}</code>} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ══ Right sidebar ══════════════════════════════════ */}
                    <div className="space-y-6">
                        {/* Plan Features */}
                        {plans.find(p => p.name === institute.plan) && (() => {
                            const currentPlan = plans.find(p => p.name === institute.plan)!;
                            return (
                                <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6">
                                    <h3 className="text-base font-bold text-white mb-4">
                                        Incluido en {currentPlan.displayName}
                                    </h3>
                                    <ul className="space-y-2">
                                        {currentPlan.features.map((f, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                                                <span className="text-emerald-400 mt-0.5">✓</span>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })()}

                        {/* Quick Stats */}
                        <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6">
                            <h3 className="text-base font-bold text-white mb-4">Resumen de Uso</h3>
                            <div className="space-y-3">
                                {[
                                    { label: 'Estudiantes activos', value: institute.currentStudents.toLocaleString(), max: institute.maxStudents, icon: '👥' },
                                    { label: 'Profesores activos', value: institute.currentTeachers.toLocaleString(), max: institute.maxTeachers, icon: '👨‍🏫' },
                                    { label: 'Storage usado', value: `${institute.currentStorage.toFixed(1)} GB`, max: institute.maxStorage, icon: '💾' },
                                ].map(({ label, value, max, icon }) => (
                                    <div key={label} className="flex items-center justify-between">
                                        <span className="text-sm text-gray-400 flex items-center gap-2">
                                            <span>{icon}</span>{label}
                                        </span>
                                        <span className="text-sm font-medium text-white">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6">
                            <h3 className="text-base font-bold text-white mb-4">Acciones Rápidas</h3>
                            <div className="space-y-2">
                                <a
                                    href={`http://${institute.subdomain}.localhost:3000`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between w-full px-4 py-2.5 bg-gray-700/60 hover:bg-gray-700 rounded-xl text-sm text-gray-300 hover:text-white transition-colors"
                                >
                                    <span>Abrir Instituto</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </a>
                                <button
                                    onClick={() => setShowPlanModal(true)}
                                    className="flex items-center justify-between w-full px-4 py-2.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-600/40 rounded-xl text-sm text-violet-300 hover:text-violet-200 transition-colors"
                                >
                                    <span>Cambiar Plan</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </SuperAdminLayout>
    );
}
