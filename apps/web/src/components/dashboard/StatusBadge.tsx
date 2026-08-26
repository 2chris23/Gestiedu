'use client';

import { CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

interface StatusBadgeProps {
    status: 'approved' | 'failed' | 'at-risk' | 'info';
    label?: string;
    size?: 'sm' | 'md';
}

const statusConfig = {
    approved: {
        icon: CheckCircle,
        label: 'Aprobado',
        bg: 'bg-green-100',
        text: 'text-green-700',
        border: 'border-green-200',
    },
    failed: {
        icon: XCircle,
        label: 'Reprobado',
        bg: 'bg-red-100',
        text: 'text-red-700',
        border: 'border-red-200',
    },
    'at-risk': {
        icon: AlertTriangle,
        label: 'En Riesgo',
        bg: 'bg-yellow-100',
        text: 'text-yellow-700',
        border: 'border-yellow-200',
    },
    info: {
        icon: Info,
        label: 'Información',
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        border: 'border-blue-200',
    },
};

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
    const config = statusConfig[status];
    const Icon = config.icon;
    const displayLabel = label || config.label;

    const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';
    const iconSize = size === 'sm' ? 14 : 16;

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.bg} ${config.text} ${config.border} ${sizeClasses}`}
        >
            <Icon size={iconSize} />
            {displayLabel}
        </span>
    );
}
