import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/providers/QueryProvider';
import { ConfirmProvider } from '@/hooks/useConfirm';
import { DynamicFavicon } from '@/components/common/DynamicFavicon';
import { DynamicTitle } from '@/components/common/DynamicTitle';
import { DynamicColors } from '@/components/common/DynamicColors';
import { FichaDeLaApp } from '@/components/common/FichaDeLaApp';
import { AyudanteDeLaApp } from '@/components/common/AyudanteDeLaApp';
import { ProveedorDeGlobos } from '@/components/ui/boton-icono';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Sistema de Gestión Escolar',
    description: 'Plataforma integral para la gestión educativa',
    /**
     * LA FICHA QUE HACE QUE SE PUEDA INSTALAR
     *
     * Sin este enlace, el teléfono no ofrece «añadir a la pantalla de inicio» y
     * el sistema se queda en «una web dentro del navegador». La ficha se arma
     * por liceo en `app/manifest.webmanifest/route.ts`.
     */
    manifest: '/manifest.webmanifest',
    appleWebApp: {
        // iPhone no lee el manifest: estas tres líneas son su equivalente.
        capable: true,
        title: 'GestiEdu',
        statusBarStyle: 'default',
    },
    icons: {
        icon: '/favicon.svg',
        shortcut: '/favicon.ico',
        apple: '/icons/apple-touch-icon.png',
    },
};

/**
 * LO QUE SEPARA "UNA WEB EN EL TELÉFONO" DE "UNA APP"
 *
 * Son tres líneas y ninguna se nota hasta que falta:
 *
 * `viewport-fit=cover` deja que la pantalla llegue **debajo de la muesca** y el
 * indicador de inicio. Sin esto, `env(safe-area-inset-*)` vale 0 en todas
 * partes y el teléfono pinta dos franjas del color del fondo arriba y abajo: el
 * sello de "esto es una página web dentro de un navegador".
 *
 * `interactive-widget=resizes-content` hace que el teclado de Android **encoja
 * el lienzo** en vez de taparlo. Sin esto, un botón anclado abajo se queda
 * debajo del teclado y no hay forma de pulsarlo.
 *
 * `themeColor` pinta la barra de estado. Uno solo para los dos modos deja la
 * barra blanca sobre la app oscura, que es peor que no ponerlo. El color es el
 * del borde superior de la pantalla —el lienzo—, no el de la marca.
 *
 * Y NO se toca el zoom: `user-scalable=no` es una barrera para quien no ve bien.
 * Que la pantalla no se acerque sola al tocar un campo se arregla en su causa,
 * el tamaño de letra del campo (ver `globals.css`), no prohibiendo el zoom.
 */
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    interactiveWidget: 'resizes-content',
    // La app aún no sigue el modo oscuro del sistema (el oscuro va por la
    // clase `.dark`). Anunciar 'light dark' hacía que el navegador pintara los
    // campos en oscuro con la letra clara de la app encima: ilegible.
    themeColor: '#f5f6f9',
    colorScheme: 'light',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es" suppressHydrationWarning={true}>
            <body className={inter.className} suppressHydrationWarning={true}>
                <QueryProvider>
                    <ConfirmProvider>
                        <ProveedorDeGlobos>
                            <DynamicFavicon />
                            <DynamicTitle />
                            <DynamicColors />
                            <Suspense fallback={null}>
                                <FichaDeLaApp />
                            </Suspense>
                            <AyudanteDeLaApp />
                            {children}
                        </ProveedorDeGlobos>
                    </ConfirmProvider>
                </QueryProvider>
                <Toaster richColors position="top-right" />
            </body>
        </html>
    );
}
