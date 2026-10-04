import { NextRequest, NextResponse } from 'next/server';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');

/**
 * GET /api/instituto/[slug]/info
 *
 * Proxy to backend: GET /api/institutes/by-slug/:slug
 * Returns public institute info (name, logo, etc.) without authentication.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    try {
        const response = await fetch(`${API_URL}/api/institutes/public/${slug}`, {
            headers: {
                'X-Institute-Slug': slug,
            },
            // Sin caché — necesitamos estado en tiempo real (el instituto puede ser eliminado)
            cache: 'no-store',
        });

        if (!response.ok) {
            if (response.status === 404) {
                return NextResponse.json(
                    { error: 'Instituto no encontrado' },
                    { status: 404 }
                );
            }
            if (response.status === 503) {
                return NextResponse.json(
                    { error: 'Instituto en mantenimiento' },
                    { status: 503 }
                );
            }
            return NextResponse.json(
                { error: 'Error al obtener información del instituto' },
                { status: response.status }
            );
        }

        const data = await response.json();

        return NextResponse.json(data, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
            },
        });
    } catch (error) {
        console.error('[instituto/info] Error:', error);
        return NextResponse.json(
            { error: 'Error de conexión con el servidor' },
            { status: 500 }
        );
    }
}
