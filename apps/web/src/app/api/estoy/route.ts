/**
 * «¿ESTÁS?»: lo pregunta el guardián del arranque (`lib/guardian-del-arranque.ts`)
 * cuando la app no arranca, para distinguir «va lenta» de «no hay servidor».
 *
 * Empieza por `/api/`, así que el ayudante (`sw.js`) nunca la guarda: si
 * contesta, contestó la web de verdad.
 */
export const dynamic = 'force-dynamic';

export function GET() {
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
