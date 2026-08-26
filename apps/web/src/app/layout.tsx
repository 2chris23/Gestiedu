import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/providers/QueryProvider';
import { ConfirmProvider } from '@/hooks/useConfirm';
import { DynamicFavicon } from '@/components/common/DynamicFavicon';
import { DynamicTitle } from '@/components/common/DynamicTitle';
import { DynamicColors } from '@/components/common/DynamicColors';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Sistema de Gestión Escolar',
    description: 'Plataforma integral para la gestión educativa',
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
                        <DynamicFavicon />
                        <DynamicTitle />
                        <DynamicColors />
                        {children}
                    </ConfirmProvider>
                </QueryProvider>
                <Toaster richColors position="top-right" />
            </body>
        </html>
    );
}
