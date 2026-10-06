'use client';

/**
 * EL LIBRO QUE SE ABRE (la precarga, elegida por Cristian)
 *
 * Se abre la tapa y las hojas van pasando mientras se baja lo del liceo para
 * usarlo sin conexión. Debajo, cuánto va: el avance es el de la descarga de
 * verdad, no un reloj de adorno. Los colores son los de la app (el azul de la
 * cabecera y el acento que eligió cada uno). CSS en `globals.css` (`.libro`).
 */
export function LibroQueSeAbre({
    titulo,
    detalle,
    nota,
    avance,
}: {
    titulo: string;
    detalle?: string | null;
    /** Una línea más pequeña debajo (lo que pasó de verdad por internet). */
    nota?: string | null;
    /** De 0 a 1; `null` mientras no se sabe cuánto hay. */
    avance: number | null;
}) {
    const porcentaje = avance === null ? null : Math.round(Math.max(0, Math.min(1, avance)) * 100);
    return (
        <div className="flex flex-col items-center gap-6 text-center">
            <div className="libro relative h-[120px] w-[176px]" aria-hidden>
                {/* La página de la izquierda (lo que queda debajo de la tapa abierta). */}
                <div className="absolute left-0 top-0 h-full w-1/2 rounded-l-[10px] bg-white shadow-[inset_-6px_0_10px_rgba(13,71,161,0.08)] ring-1 ring-[#D6E2F5]">
                    <Renglones />
                </div>
                {/* El lado derecho: el bloque de hojas, con las que pasan encima. */}
                <div className="absolute right-0 top-0 h-full w-1/2" style={{ perspective: '900px' }}>
                    <div className="absolute inset-0 rounded-r-[10px] bg-white shadow-[inset_6px_0_10px_rgba(13,71,161,0.08)] ring-1 ring-[#D6E2F5]">
                        <Renglones />
                    </div>
                    {/*
                        La tapa, del azul de la app, con la cinta del acento. Va
                        DEBAJO de las hojas y por dentro es una hoja blanca: antes
                        quedaba encima, azul, en el lado izquierdo, y cada hoja que
                        pasaba caía debajo de ella y parecía desaparecer (lo vio
                        Cristian). Mientras está cerrada no se ve ninguna hoja
                        (empiezan transparentes), así que nada la tapa.
                    */}
                    <div className="libro-tapa absolute inset-0">
                        <div className="libro-cara absolute inset-0 rounded-r-[10px] bg-[var(--azul-cabecera)] shadow-[0_6px_16px_rgba(4,24,64,0.25)]">
                            <span className="absolute right-3 top-0 h-9 w-2.5 rounded-b-sm bg-[var(--acento)]" />
                            <span className="absolute inset-x-4 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/25" />
                        </div>
                        <div className="libro-cara libro-cara-de-atras absolute inset-0 rounded-l-[10px] bg-white shadow-[inset_-6px_0_10px_rgba(13,71,161,0.08)] ring-1 ring-[#D6E2F5]">
                            <Renglones />
                        </div>
                    </div>
                    {/*
                        LA HOJA QUE PASA: una sola, y siempre encima de todo.

                        Eran cuatro en bucle, cada una con su retraso, y la de abajo
                        de las cuatro, al dar la vuelta, caía DEBAJO de la que ya
                        estaba en la izquierda: cada 3 o 4 hojas una «se reseteaba»
                        y desaparecía a mitad de camino (lo vio un amigo de Cristian).

                        Una sola basta: pasa de la derecha a la izquierda, se queda
                        un momento y vuelve de golpe a la derecha. Ese salto no se
                        ve porque cada cara es igual a la página fija que tapa: la
                        de delante, a la de la derecha; la de detrás, a la de la
                        izquierda. Por eso la de detrás lleva redondas las esquinas
                        de la IZQUIERDA (las de fuera, una vez pasada): con las de
                        la derecha, la hoja caía en la izquierda con la esquina en
                        pico y se notaba el salto (lo vio Cristian).
                    */}
                    <div className="libro-hoja absolute inset-0">
                        <div className="libro-cara absolute inset-0 rounded-r-[10px] bg-white shadow-[inset_6px_0_10px_rgba(13,71,161,0.08)] ring-1 ring-[#D6E2F5]">
                            <Renglones />
                        </div>
                        <div className="libro-cara libro-cara-de-atras absolute inset-0 rounded-l-[10px] bg-white shadow-[inset_-6px_0_10px_rgba(13,71,161,0.08)] ring-1 ring-[#D6E2F5]">
                            <Renglones />
                        </div>
                    </div>
                </div>
                {/* El lomo. */}
                <div className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 rounded-full bg-[#C5D5EE]" />
            </div>

            <div className="flex w-full max-w-[260px] flex-col items-center gap-2">
                <p className="text-base font-bold text-[#0B1B33]" role="status" aria-live="polite">
                    {titulo}
                    {porcentaje !== null && <span className="tabular-nums"> {porcentaje} %</span>}
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#DCE6F5]" aria-hidden>
                    <div
                        className={`h-full rounded-full bg-[var(--acento)] transition-[width] duration-500 ease-out ${porcentaje === null ? 'w-1/3 motion-safe:animate-pulse' : ''}`}
                        style={porcentaje === null ? undefined : { width: `${porcentaje}%` }}
                    />
                </div>
                {detalle && <p className="text-xs font-medium text-[#5B6B82] tabular-nums">{detalle}</p>}
                {nota && <p className="text-xs text-[#5B6B82] tabular-nums">{nota}</p>}
            </div>
        </div>
    );
}

function Renglones() {
    return (
        <div className="flex h-full flex-col justify-center gap-2.5 px-3">
            {[70, 90, 55, 85, 65].map((w, i) => (
                <span key={i} className="h-1 rounded-full bg-[#E3EBF7]" style={{ width: `${w}%` }} />
            ))}
        </div>
    );
}

export default LibroQueSeAbre;
