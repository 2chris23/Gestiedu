'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { diferido } from '@/components/common/Diferido';

// La ventana baja la primera vez que se pregunta algo (carga diferida).
const DialogoDeConfirmar = diferido(() => import('@/components/common/DialogoDeConfirmar'), { sinEsqueleto: true });

export interface ConfirmOptions {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

interface ConfirmState {
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<ConfirmState | null>(null);

    const confirm = useCallback<ConfirmFn>((options) => {
        return new Promise<boolean>((resolve) => {
            setState({ options, resolve });
        });
    }, []);

    const close = useCallback(
        (result: boolean) => {
            state?.resolve(result);
            setState(null);
        },
        [state]
    );

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {state && <DialogoDeConfirmar options={state.options} alResponder={close} />}
        </ConfirmContext.Provider>
    );
}

export function useConfirm(): ConfirmFn {
    return useContext(ConfirmContext);
}
