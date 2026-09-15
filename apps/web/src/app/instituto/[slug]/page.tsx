'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { conseguirCredencial } from '@/lib/credencial-en-memoria';

export default function InstitutePage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;

    useEffect(() => {
        /**
         * ¿HAY SESIÓN? SE PREGUNTA, NO SE MIRA LA COOKIE
         *
         * Esto miraba si existía la cookie `access_token` para decidir a dónde
         * mandar a la persona. Desde que esa cookie es `httpOnly`, la página no
         * la ve **aunque la sesión esté abierta**: mandaba a la pantalla de
         * entrar a quien ya estaba dentro.
         *
         * Pedir la credencial contesta lo mismo y de verdad: si la hay, se
         * consigue; si no, no.
         */
        conseguirCredencial().then((credencial) => {
        if (credencial) {
            // Redirect to dashboard
            router.push('/dashboard');
        } else {
            // Redirect to login
            router.push('/login');
        }
        });
    }, [slug, router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
            <div className="text-white text-xl">Redirigiendo...</div>
        </div>
    );
}
