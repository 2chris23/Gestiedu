'use client';

import {
    LineChart,
    Line,
    BarChart,
    Bar,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';

interface DataPoint {
    label: string;
    value: number;
    [key: string]: string | number;
}

interface TrendChartProps {
    data: DataPoint[];
    height?: number;
    type?: 'line' | 'bar' | 'area';
    showGrid?: boolean;
    showTooltip?: boolean;
    showLegend?: boolean;
    color?: string;
    dataKey?: string;
}

export function TrendChart({
    data,
    height = 200,
    type = 'line',
    showGrid = true,
    showTooltip = true,
    showLegend = false,
    color = '#3b82f6',
    dataKey = 'value',
}: TrendChartProps) {
    const ChartComponent = type === 'bar' ? BarChart : type === 'area' ? AreaChart : LineChart;

    return (
        <div
            className="animate-[fadeIn_0.5s_ease-out]"
            style={{ width: '100%', height }}
        >
            <ResponsiveContainer width="100%" height="100%">
                <ChartComponent data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
                    <XAxis
                        dataKey="label"
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                    />
                    <YAxis
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                    />
                    {showTooltip && (
                        <Tooltip
                            contentStyle={{
                                borderRadius: '8px',
                                border: '1px solid #e5e7eb',
                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                            }}
                        />
                    )}
                    {showLegend && <Legend />}

                    {type === 'line' && (
                        <Line
                            type="monotone"
                            dataKey={dataKey}
                            stroke={color}
                            strokeWidth={2}
                            dot={{ r: 4, fill: color }}
                            activeDot={{ r: 6 }}
                            isAnimationActive={true}
                        />
                    )}
                    {type === 'bar' && (
                        <Bar
                            dataKey={dataKey}
                            fill={color}
                            radius={[4, 4, 0, 0]}
                            isAnimationActive={true}
                        />
                    )}
                    {type === 'area' && (
                        <Area
                            type="monotone"
                            dataKey={dataKey}
                            stroke={color}
                            fill={color}
                            fillOpacity={0.2}
                            strokeWidth={2}
                            isAnimationActive={true}
                        />
                    )}
                </ChartComponent>
            </ResponsiveContainer>
        </div>
    );
}
