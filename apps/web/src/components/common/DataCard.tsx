'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

// ============================================
// Types
// ============================================

type CardColor = 'blue' | 'green' | 'red' | 'amber' | 'indigo' | 'purple';

interface CardTrend {
    value: number;
    direction: 'up' | 'down' | 'neutral';
}

interface CardComparison {
    label: string;
    value: string;
}

export interface DataCardProps {
    // Configuración de visualización
    title: string;
    icon: LucideIcon;
    color?: CardColor;

    // Datos (siempre de la API)
    value: number | string;
    subtitle?: string;

    // Características opcionales
    trend?: CardTrend;
    sparkline?: number[];
    comparison?: CardComparison;

    // Estados
    isLoading?: boolean;
    error?: string;

    // Personalización adicional
    className?: string;
}

// ============================================
// Color Configurations
// ============================================

const colorConfigs = {
    blue: {
        bg: 'bg-blue-500',
        text: 'text-blue-600',
        light: 'bg-blue-50',
        border: 'border-blue-200',
        stroke: '#3b82f6',
    },
    green: {
        bg: 'bg-green-500',
        text: 'text-green-600',
        light: 'bg-green-50',
        border: 'border-green-200',
        stroke: '#10b981',
    },
    red: {
        bg: 'bg-red-500',
        text: 'text-red-600',
        light: 'bg-red-50',
        border: 'border-red-200',
        stroke: '#ef4444',
    },
    amber: {
        bg: 'bg-amber-500',
        text: 'text-amber-600',
        light: 'bg-amber-50',
        border: 'border-amber-200',
        stroke: '#f59e0b',
    },
    indigo: {
        bg: 'bg-indigo-500',
        text: 'text-indigo-600',
        light: 'bg-indigo-50',
        border: 'border-indigo-200',
        stroke: '#6366f1',
    },
    purple: {
        bg: 'bg-purple-500',
        text: 'text-purple-600',
        light: 'bg-purple-50',
        border: 'border-purple-200',
        stroke: '#a855f7',
    },
};

// ============================================
// DataCard Component
// ============================================

export function DataCard({
    title,
    icon: Icon,
    color = 'blue',
    value,
    subtitle,
    trend,
    sparkline,
    comparison,
    isLoading = false,
    error,
    className = '',
}: DataCardProps) {
    const colors = colorConfigs[color];

    // Preparar datos para sparkline
    const chartData = sparkline?.map((val, index) => ({ value: val, index })) || [];

    // Determinar dirección de tendencia
    const getTrendIcon = () => {
        if (!trend) return null;
        if (trend.direction === 'up') return '↗';
        if (trend.direction === 'down') return '↘';
        return '→';
    };

    const getTrendColor = () => {
        if (!trend) return 'text-gray-600';
        if (trend.direction === 'up') return 'text-green-600';
        if (trend.direction === 'down') return 'text-red-600';
        return 'text-gray-600';
    };

    // Estado de error
    if (error) {
        return (
            <Card className={`p-6 border-l-4 ${colors.border} ${className}`}>
                <div className="flex items-center gap-3 mb-2">
                    <div className={`p-3 rounded-lg ${colors.bg} text-white opacity-50`}>
                        <Icon size={24} />
                    </div>
                    <p className="text-sm font-medium text-gray-600">{title}</p>
                </div>
                <p className="text-sm text-red-600 mt-2">Error al cargar datos</p>
            </Card>
        );
    }

    return (
        <div className={className}>
            <Card className={`p-6 hover:shadow-lg transition-shadow duration-200 border-l-4 ${colors.border} h-full`}>
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`p-3 rounded-lg ${colors.bg} text-white`}>
                            <Icon size={24} />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-600">{title}</p>
                        </div>
                    </div>

                    {/* Value */}
                    <div className="mb-3">
                        {isLoading ? (
                            <div className="h-10 w-24 bg-gray-200 animate-pulse rounded"></div>
                        ) : (
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold text-gray-900">{value}</span>
                                {trend && (
                                    <span className={`text-sm font-semibold ${getTrendColor()} flex items-center gap-1`}>
                                        <span className="text-lg">{getTrendIcon()}</span>
                                        {Math.abs(trend.value)}%
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Subtitle */}
                    {subtitle && !isLoading && (
                        <p className="text-xs text-gray-500 mb-2">{subtitle}</p>
                    )}

                    {/* Sparkline */}
                    {sparkline && sparkline.length > 0 && !isLoading && (
                        <div className="h-12 mb-2 mt-auto">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        stroke={colors.stroke}
                                        strokeWidth={2}
                                        dot={false}
                                        isAnimationActive={true}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Comparison */}
                    {comparison && !isLoading && (
                        <div className="text-xs text-gray-500 mt-auto pt-2">
                            <span className="font-medium">{comparison.label}:</span>{' '}
                            <span className={colors.text}>{comparison.value}</span>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
