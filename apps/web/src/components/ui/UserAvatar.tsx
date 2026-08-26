import React from 'react';

interface UserAvatarProps {
    name: string;
    src?: string | null;
    className?: string;
    initialsClassName?: string;
    sizes?: string;
}

const COLORS = [
    'bg-indigo-500',
    'bg-purple-600',
    'bg-pink-500',
    'bg-rose-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-cyan-600',
    'bg-blue-500',
];

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

/**
 * Avatar generado localmente (iniciales + color derivado del nombre).
 * Evita dependencias externas como ui-avatars.com, cuyo SVG dispara
 * descargas (imagen.bin) cuando pasa por el optimizador de Next.js.
 */
export default function UserAvatar({ name, src, className = '', initialsClassName = '', sizes }: UserAvatarProps) {
    const color = COLORS[hashCode(name) % COLORS.length];

    return (
        <div
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ${color} ${className}`}
        >
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={name}
                    sizes={sizes}
                    className="h-full w-full object-cover"
                    loading="lazy"
                />
            ) : (
                <span className={`text-white font-bold ${initialsClassName}`}>{getInitials(name)}</span>
            )}
        </div>
    );
}