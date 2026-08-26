'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
            <AlertDialog
                open={!!state}
                onOpenChange={(open) => {
                    if (!open) close(false);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{state?.options.title}</AlertDialogTitle>
                        {state?.options.description && (
                            <AlertDialogDescription>{state.options.description}</AlertDialogDescription>
                        )}
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => close(false)}>
                            {state?.options.cancelLabel || 'Cancelar'}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => close(true)}>
                            {state?.options.confirmLabel || 'Confirmar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ConfirmContext.Provider>
    );
}

export function useConfirm(): ConfirmFn {
    return useContext(ConfirmContext);
}
