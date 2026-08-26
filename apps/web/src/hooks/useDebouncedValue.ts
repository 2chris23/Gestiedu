'use client';

import { useEffect, useState } from 'react';

/**
 * Retorna el valor dado tras `delay` ms de inactividad.
 * Evita disparar requests por cada tecleo en búsquedas que van al servidor.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}
