import Link from 'next/link';

/** «Términos · Privacidad» al pie de las pantallas de entrar (19-oct-2026). */
export function EnlacesLegales() {
    return (
        <nav aria-label="Información legal" className="mt-2 flex items-center justify-center gap-1 text-xs text-gray-600">
            <Link href="/legal/terminos" className="inline-flex min-h-[44px] items-center px-2 underline-offset-2 hover:underline">
                Términos
            </Link>
            <span aria-hidden>·</span>
            <Link href="/legal/privacidad" className="inline-flex min-h-[44px] items-center px-2 underline-offset-2 hover:underline">
                Privacidad
            </Link>
        </nav>
    );
}
