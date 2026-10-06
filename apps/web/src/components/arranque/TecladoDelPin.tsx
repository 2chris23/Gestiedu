'use client';

import * as React from 'react';
import { Delete } from 'lucide-react';
import { LARGO_DEL_PIN } from '@/lib/pin-de-la-app';

/**
 * EL TECLADO DEL PIN DE LA APP
 *
 * Cuatro casillas y los números grandes, como el de un banco. Se manda solo
 * al completar la cuarta cifra. Se puede escribir también con un teclado de
 * verdad (las pruebas y quien lo use en una tableta).
 */
export function TecladoDelPin({
    titulo,
    pista,
    error,
    ocupado,
    alCompletar,
}: {
    titulo: string;
    pista?: string | null;
    error?: string | null;
    ocupado?: boolean;
    alCompletar: (pin: string) => void;
}) {
    const [pin, setPin] = React.useState('');

    // Cada vez que cambia lo que se pide (crear → repetir) o sale un error, vacío.
    React.useEffect(() => setPin(''), [titulo, error]);

    const pulsar = React.useCallback(
        (d: string) => {
            if (ocupado) return;
            setPin((p) => {
                if (p.length >= LARGO_DEL_PIN) return p;
                const nuevo = p + d;
                if (nuevo.length === LARGO_DEL_PIN) window.setTimeout(() => alCompletar(nuevo), 120);
                return nuevo;
            });
        },
        [alCompletar, ocupado]
    );
    const borrar = React.useCallback(() => setPin((p) => p.slice(0, -1)), []);

    React.useEffect(() => {
        const alTeclear = (e: KeyboardEvent) => {
            if (/^\d$/.test(e.key)) pulsar(e.key);
            else if (e.key === 'Backspace') borrar();
        };
        window.addEventListener('keydown', alTeclear);
        return () => window.removeEventListener('keydown', alTeclear);
    }, [pulsar, borrar]);

    return (
        <div className="flex w-full max-w-[300px] flex-col items-center gap-5" data-teclado-del-pin>
            <div className="text-center">
                <p className="text-base font-bold text-[#0B1B33]">{titulo}</p>
                {pista && <p className="mt-1 text-sm text-gray-600">{pista}</p>}
            </div>
            <div className="flex gap-4" aria-label={`${pin.length} de ${LARGO_DEL_PIN} números`} role="status">
                {Array.from({ length: LARGO_DEL_PIN }, (_, i) => (
                    <span
                        key={i}
                        className={`h-4 w-4 rounded-full border-2 transition-colors ${
                            i < pin.length ? 'border-[var(--azul-cabecera)] bg-[var(--azul-cabecera)]' : 'border-[#9AAFCB]'
                        }`}
                    />
                ))}
            </div>
            <p className="min-h-[20px] text-center text-sm font-semibold text-red-700" role="alert">
                {error ?? ''}
            </p>
            <div className="grid w-full grid-cols-3 gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <Tecla key={d} onClick={() => pulsar(d)} disabled={ocupado}>
                        {d}
                    </Tecla>
                ))}
                <span />
                <Tecla onClick={() => pulsar('0')} disabled={ocupado}>
                    0
                </Tecla>
                <button
                    type="button"
                    onClick={borrar}
                    aria-label="Borrar el último número"
                    className="flex h-16 items-center justify-center rounded-2xl text-[#33415C] active:bg-gray-100"
                >
                    <Delete className="h-6 w-6" aria-hidden />
                </button>
            </div>
        </div>
    );
}

function Tecla({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="flex h-16 items-center justify-center rounded-2xl bg-white text-2xl font-semibold text-[#0B1B33] shadow-[0_1px_2px_rgba(13,71,161,0.1)] ring-1 ring-[#DCE6F5] transition-transform active:scale-95 active:bg-[#EEF3FB] disabled:opacity-50"
        >
            {children}
        </button>
    );
}

export default TecladoDelPin;
