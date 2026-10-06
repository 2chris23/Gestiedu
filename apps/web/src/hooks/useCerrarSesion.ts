'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { olvidarCredencial } from '@/lib/credencial-en-memoria';
import { olvidarLoDescargado } from '@/lib/lo-guardado-en-el-telefono';
import { olvidarLasRespuestas } from '@/lib/respuestas-guardadas';
import { laPuertaDelLiceo, elLiceoDeLaCookie } from '@/lib/la-puerta-del-liceo';
import { laLlaveGuardada, olvidarLaLlave } from '@/lib/la-huella';
import { laCola, tirarLosDe, EVENTO_ENCOLADO } from '@/lib/por-enviar';
import { elDuenoDeAhora } from '@/lib/el-dueno';
import { useConfirm } from '@/hooks/useConfirm';
import { olvidarEsteTelefono } from '@/lib/avisos-al-telefono';
import { olvidarElPerfil } from '@/lib/perfil-recordado';
import { olvidarLaPrecarga } from '@/lib/precarga';
import { cerrarElCandado } from '@/lib/el-candado';

/**
 * CERRAR SESIÓN (el menú, la ficha de «Mi cuenta» y la pantalla de bloqueo)
 *
 * Estaba dentro de `DashboardShell`; la pantalla de bloqueo, que vive fuera
 * del panel, también lo necesita. Además de lo de siempre, se olvida a quién
 * enseñaba el bloqueo (`perfil-recordado.ts`) y lo que se precargó: en un
 * teléfono que se presta, el siguiente no ve ni la foto del anterior.
 */
export function useCerrarSesion(): (opciones?: { perderLoPendiente?: boolean }) => Promise<void> {
    const router = useRouter();
    const queryClient = useQueryClient();
    const preguntar = useConfirm();
    const { logout: zustandLogout } = useAuthStore();

    // `perderLoPendiente`: quien llama ya lo preguntó (la pantalla de bloqueo,
    // que tapa la ventana de «¿seguro?»).
    return async (opciones) => {
        /**
         * SALIR DEVUELVE AL PORTAL DEL LICEO, NO A UN 404
         *
         * `/login` a secas responde «esta dirección no existe»: la pantalla de
         * entrar necesita saber de qué liceo es. Al cerrar sesión se mandaba
         * ahí, así que lo último que veía quien salía era un error, con un
         * botón a la portada de la plataforma y sin forma de volver a entrar en
         * su liceo. Se apunta el liceo ANTES de borrar las credenciales, que se
         * lo llevan por delante.
         */
        /**
         * CERRAR SESIÓN CON COSAS SIN ENVIAR (2026-09-30)
         *
         * Con conexión, primero se envían. Si aún quedan (sin conexión, o algo
         * por decidir), se pregunta: cerrar sesión las pierde, y en un teléfono
         * que se presta no se pueden quedar a la vista del siguiente.
         */
        const dueno = elDuenoDeAhora();
        if (dueno && opciones?.perderLoPendiente) {
            await tirarLosDe(dueno);
        } else if (dueno) {
            if ((await laCola(dueno)).length) {
                document.dispatchEvent(new Event(EVENTO_ENCOLADO));
                await new Promise((r) => setTimeout(r, 2500));
            }
            const quedan = await laCola(dueno);
            if (quedan.length) {
                const ok = await preguntar({
                    title: `Tienes ${quedan.length} cambio(s) sin enviar`,
                    description:
                        'Lo que hiciste sin conexión todavía no llegó al liceo. Si cierras sesión ahora, se pierde. Espera a tener conexión (se envía solo) o ciérrala igual.',
                    confirmLabel: 'Cerrar y perderlos',
                    cancelLabel: 'No cerrar',
                });
                if (!ok) return;
                await tirarLosDe(dueno);
            }
        }
        const liceo = elLiceoDeLaCookie();
        const puerta = laPuertaDelLiceo();

        // La llave de la huella de ESTE teléfono: se manda para que el
        // servidor la anule, y se borra de aquí. Cerrar sesión es cerrar
        // sesión: si se quedara, el siguiente que abriera la app entraría con
        // la huella del dueño del móvil sin pasar por la contraseña.
        const llaveDelTelefono = liceo ? await laLlaveGuardada(liceo) : null;

        /**
         * SIN CONEXIÓN TAMBIÉN SE CIERRA
         *
         * Lo de hablar con el servidor puede fallar (sin señal, sin servidor):
         * se intenta y ya. Antes un fallo aquí cortaba el resto, y lo
         * descargado se quedaba en el teléfono con la sesión «cerrada».
         */
        try {
            // Y los avisos a este teléfono: con la sesión todavía abierta, que el
            // servidor necesita saber de quién son. Un teléfono prestado no debe
            // seguir recibiendo las citaciones del anterior.
            await olvidarEsteTelefono();

            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ llaveDelTelefono: llaveDelTelefono ?? undefined }),
            });
        } catch {
            // Sin conexión: lo del servidor caduca solo; lo de aquí se borra igual.
        }
        if (liceo) await olvidarLaLlave(liceo);
        // Y la llave que estaba en la memoria de la pestaña: si no, seguiría
        // sirviendo hasta que caduque aunque la sesión esté cerrada.
        olvidarCredencial();
        // Y lo descargado a este teléfono. Cerrar sesión es cerrar sesión: en
        // un móvil que se presta, lo de antes no se enseña al siguiente. Lo
        // que hay en la memoria de la pestaña, también.
        await olvidarLoDescargado();
        await olvidarLasRespuestas();
        olvidarElPerfil();
        olvidarLaPrecarga();
        cerrarElCandado();
        queryClient.clear();
        // Clear Zustand UI state
        zustandLogout();
        router.push(puerta);
    };
}
