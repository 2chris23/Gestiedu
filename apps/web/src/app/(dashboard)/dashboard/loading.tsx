/**
 * MIENTRAS BAJA UNA PANTALLA
 *
 * Con la carga diferida, cada pantalla trae su propio trozo al abrirla. En un
 * teléfono con datos lentos eso tarda un momento, y sin esto se quedaba la
 * pantalla anterior congelada hasta que llegaba la nueva: parecía que el toque
 * no había hecho nada. Ahora sale al instante la forma de la pantalla (barras
 * sin texto: un esqueleto) y se rellena al llegar.
 */
export default function Cargando() {
    return (
        <div className="space-y-6" aria-busy="true" aria-live="polite">
            <span className="sr-only">Cargando la pantalla…</span>
            <div className="space-y-2" aria-hidden>
                <div className="h-7 w-56 max-w-full animate-pulse rounded-lg bg-gray-200" />
                <div className="h-4 w-80 max-w-full animate-pulse rounded bg-gray-100" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
                {[0, 1, 2].map((i) => (
                    <div key={i} className="h-28 animate-pulse rounded-2xl border border-gray-100 bg-white" />
                ))}
            </div>
            <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-gray-100" />
                ))}
            </div>
        </div>
    );
}
