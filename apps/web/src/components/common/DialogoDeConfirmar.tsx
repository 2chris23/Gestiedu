'use client';

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
import type { ConfirmOptions } from '@/hooks/useConfirm';

/**
 * La ventana de «¿seguro?». Vive aparte de `useConfirm` para bajar solo la
 * primera vez que se pregunta algo, no con cada pantalla (ni con la portada ni
 * con el login, que no preguntan nada).
 */
export default function DialogoDeConfirmar({ options, alResponder }: { options: ConfirmOptions; alResponder: (si: boolean) => void }) {
    return (
        <AlertDialog
            open
            onOpenChange={(open) => {
                if (!open) alResponder(false);
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{options.title}</AlertDialogTitle>
                    {options.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => alResponder(false)}>{options.cancelLabel || 'Cancelar'}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => alResponder(true)}>{options.confirmLabel || 'Confirmar'}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
