'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function InstitutePage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;

    useEffect(() => {
        // Check if user is authenticated
        const accessToken = document.cookie
            .split('; ')
            .find(row => row.startsWith('access_token='));

        if (accessToken) {
            // Redirect to dashboard
            router.push('/dashboard');
        } else {
            // Redirect to login
            router.push('/login');
        }
    }, [slug, router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
            <div className="text-white text-xl">Redirigiendo...</div>
        </div>
    );
}
