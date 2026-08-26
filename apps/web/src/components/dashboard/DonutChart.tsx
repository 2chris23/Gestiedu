'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface DonutChartProps {
    value: number; // 0-100
    label: string;
    size?: 'sm' | 'md' | 'lg';
    color?: string;
    showPercentage?: boolean;
}

const sizeMap = {
    sm: { width: 80, height: 80, innerRadius: 25, outerRadius: 35, fontSize: 'text-sm' },
    md: { width: 120, height: 120, innerRadius: 40, outerRadius: 55, fontSize: 'text-base' },
    lg: { width: 160, height: 160, innerRadius: 55, outerRadius: 75, fontSize: 'text-lg' },
};

const getColorByValue = (value: number): string => {
    if (value >= 90) return '#10b981'; // Verde
    if (value >= 70) return '#f59e0b'; // Amarillo
    return '#ef4444'; // Rojo
};

export function DonutChart({
    value,
    label,
    size = 'md',
    color,
    showPercentage = true,
}: DonutChartProps) {
    const dimensions = sizeMap[size];
    const finalColor = color || getColorByValue(value);

    const data = [
        { name: 'value', value: value },
        { name: 'remaining', value: 100 - value },
    ];

    return (
        <div
            className="flex flex-col items-center animate-[fadeScale_0.4s_ease-out]"
        >
            <div className="relative" style={{ width: dimensions.width, height: dimensions.height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={dimensions.innerRadius}
                            outerRadius={dimensions.outerRadius}
                            startAngle={90}
                            endAngle={-270}
                            dataKey="value"
                            animationBegin={0}
                            animationDuration={800}
                        >
                            <Cell fill={finalColor} />
                            <Cell fill="#e5e7eb" />
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>

                {/* Percentage in center */}
                {showPercentage && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`font-bold ${dimensions.fontSize}`} style={{ color: finalColor }}>
                            {value}%
                        </span>
                    </div>
                )}
            </div>

            {label && (
                <p className="text-sm text-gray-600 mt-2 text-center">{label}</p>
            )}
        </div>
    );
}
