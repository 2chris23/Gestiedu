'use client';

import { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface KPICardProps {
    title: string;
    value: number | string;
    icon: LucideIcon;
    trend?: number; // Porcentaje de cambio
    sparklineData?: number[]; // Datos para micro-gráfico
    comparison?: {
        label: string;
        value: number | string;
    };
    status?: 'success' | 'warning' | 'danger' | 'info';
    isLoading?: boolean;
}

const statusColors = {
    success: {
        bg: 'bg-green-500',
        text: 'text-green-600',
        light: 'bg-green-50',
        border: 'border-green-200',
    },
    warning: {
        bg: 'bg-yellow-500',
        text: 'text-yellow-600',
        light: 'bg-yellow-50',
        border: 'border-yellow-200',
    },
    danger: {
        bg: 'bg-red-500',
        text: 'text-red-600',
        light: 'bg-red-50',
        border: 'border-red-200',
    },
    info: {
        bg: 'bg-blue-500',
        text: 'text-blue-600',
        light: 'bg-blue-50',
        border: 'border-blue-200',
    },
};

export function KPICard({
    title,
    value,
    icon: Icon,
    trend,
    sparklineData,
    comparison,
    status = 'info',
    isLoading = false,
}: KPICardProps) {
    const colors = statusColors[status];

    // Preparar datos para sparkline
    const chartData = sparklineData?.map((value, index) => ({ value, index })) || [];

    // Determinar dirección de tendencia
    const trendDirection = trend && trend > 0 ? '↗' : trend && trend < 0 ? '↘' : '→';
    const trendColor = trend && trend > 0 ? 'text-green-600' : trend && trend < 0 ? 'text-red-600' : 'text-gray-600';

    return (
        <div className="animate-[fadeUp_0.3s_ease-out]">
            <Card className={`p-6 hover:shadow-lg transition-shadow duration-200 border-l-4 ${colors.border}`}>
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        {/* Header */}
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`p-3 rounded-lg ${colors.bg} text-white`}>
                                <Icon size={24} />
                            </div>
                            <div>
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
                                    {trend !== undefined && (
                                        <span className={`text-sm font-semibold ${trendColor} flex items-center gap-1`}>
                                            <span className="text-lg">{trendDirection}</span>
                                            {Math.abs(trend)}%
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Sparkline */}
                        {sparklineData && sparklineData.length > 0 && (
                            <div className="h-12 mb-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData}>
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke={colors.bg.replace('bg-', '#')}
                                            strokeWidth={2}
                                            dot={false}
                                            isAnimationActive={true}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Comparison */}
                        {comparison && (
                            <div className="text-xs text-gray-500 mt-2">
                                <span className="font-medium">{comparison.label}:</span>{' '}
                                <span className={colors.text}>{comparison.value}</span>
                            </div>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}
