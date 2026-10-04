'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { HelpCircle, X } from 'lucide-react';
import { pasosDelRol, recorridoDe, recorridoPorId, type PasoDelRecorrido, type Recorrido, type Rol } from '@/lib/recorridos';
import { elDuenoDeAhora } from '@/lib/el-dueno';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { cn } from '@/lib/utils';
import { MOSTRAR_LA_BARRA } from '@/components/layout/BarraInferiorMovil';

/**
 * EL RECORRIDO GUIADO, COMO EN RIAL (2026-10-04)
 *
 * La pantalla se oscurece y se deja ver, en un hueco, el botón DE VERDAD que
 * se explica; al lado, un globo oscuro con el título, el texto, «Atrás»,
 * «Siguiente» y «2 de 5». La pantalla baja sola hasta lo que se explica. Los
 * pasos de cada pantalla están en `lib/recorridos.ts`.
 *
 * Hecho en casa, sin librería: tenía que cumplir las reglas del teléfono
 * (botones de 44 px, letra de 12 o más, la franja del reloj y la barra de
 * gestos libres) y las del teclado (el foco va al globo, Escape cierra, las
 * flechas pasan de paso).
 *
 * Se abre con el «?» de la cabecera (`BotonDelRecorrido`), con el
 * «¿Cómo funciona?» de una pantalla (`BotonComoFunciona`) y, la primera vez
 * que alguien entra a una pantalla, se le OFRECE una sola vez. Lo visto se
 * apunta en el teléfono, por liceo y por persona.
 *
 * Un paso cuyo elemento no está a la vista (otro rol, otra pestaña, el liceo
 * sin pagos) se salta: nunca se ilumina un hueco vacío.
 */

const ABRIR = 'gestiedu:abrir-recorrido';
/** Las pruebas de navegador no ven la oferta (taparía lo que pulsan) salvo que la pidan. */
export const LLAVE_OFRECER_EN_PRUEBAS = 'gestiedu:ofrecer-recorridos';

/** Abre el recorrido de la pantalla (o uno por su nombre). */
export function abrirElRecorrido(id?: string): void {
    window.dispatchEvent(new CustomEvent(ABRIR, { detail: id ?? null }));
}

const llaveDeLoVisto = () => {
    const dueno = elDuenoDeAhora();
    return dueno ? `gestiedu:recorridos-vistos:${dueno}` : null;
};

function loVisto(): string[] {
    try {
        const llave = llaveDeLoVisto();
        const v = llave ? JSON.parse(localStorage.getItem(llave) ?? '[]') : [];
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

function apuntarVisto(id: string): void {
    try {
        const llave = llaveDeLoVisto();
        if (!llave) return;
        const v = loVisto();
        if (!v.includes(id)) localStorage.setItem(llave, JSON.stringify([...v, id]));
    } catch {
        // Sin almacén (modo privado): se volverá a ofrecer, y ya.
    }
}

/** El primero que se ve de verdad: hay dos campanas (la del teléfono y la del ordenador). */
function elQueSeVe(donde: string): HTMLElement | null {
    const todos = Array.from(document.querySelectorAll<HTMLElement>(`[data-recorrido="${CSS.escape(donde)}"]`));
    return (
        todos.find((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return false;
            const estilo = getComputedStyle(el);
            return estilo.visibility !== 'hidden' && estilo.display !== 'none';
        }) ?? null
    );
}

/**
 * Los que están a la vista. Con `enOrdenDePantalla`, en el orden en que
 * salen en la PANTALLA (de arriba abajo): el Inicio del alumno tiene «Ir a»
 * al final y el del personal arriba, y el recorrido no puede saltar de abajo
 * a arriba y otra vez abajo. La bienvenida (sin `donde`) va donde está; lo de
 * la app (menú, campana…), al final. Sin él, en el orden escrito (la clase en
 * vivo se explica en el orden en que se trabaja, no en el que se pinta).
 */
function pasosALaVista(pasos: PasoDelRecorrido[], enOrdenDePantalla = false): PasoDelRecorrido[] {
    const alto = (p: PasoDelRecorrido) => {
        const el = p.donde ? elQueSeVe(p.donde) : null;
        return el ? el.getBoundingClientRect().top + window.scrollY : 0;
    };
    const vistos = pasos.filter((p) => !p.donde || elQueSeVe(p.donde));
    if (!enOrdenDePantalla) return vistos;
    const deLaPantalla = vistos.filter((p) => p.donde && !p.deLaApp).sort((a, b) => alto(a) - alto(b));
    let n = 0;
    return vistos.map((p) => (p.donde && !p.deLaApp ? deLaPantalla[n++] : p));
}

interface Caja {
    x: number;
    y: number;
    w: number;
    h: number;
}

const HOLGURA = 6;
const SEPARACION = 12;
const MARGEN = 16;

function useMovimientoReducido(): boolean {
    const [reducido, setReducido] = React.useState(false);
    React.useEffect(() => {
        const m = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReducido(m.matches);
        const cambio = () => setReducido(m.matches);
        m.addEventListener('change', cambio);
        return () => m.removeEventListener('change', cambio);
    }, []);
    return reducido;
}

/** La franja del reloj y la barra de gestos, medidas con las mismas variables que la app. */
function zonasSeguras(): { arriba: number; abajo: number } {
    const sonda = document.createElement('div');
    sonda.style.cssText = 'position:fixed;top:0;left:0;width:0;visibility:hidden;padding-top:var(--zona-segura-arriba,0px);padding-bottom:var(--zona-segura-abajo,0px)';
    document.body.appendChild(sonda);
    const e = getComputedStyle(sonda);
    const r = { arriba: parseFloat(e.paddingTop) || 0, abajo: parseFloat(e.paddingBottom) || 0 };
    sonda.remove();
    return r;
}

export function RecorridoGuiado() {
    const pathname = usePathname();
    const { yo } = useQuienSoy();
    const rol = (yo?.role ?? null) as Rol | null;
    const reducido = useMovimientoReducido();
    const [montado, setMontado] = React.useState(false);
    const [abierto, setAbierto] = React.useState<{ recorrido: Recorrido; pasos: PasoDelRecorrido[] } | null>(null);
    const [i, setI] = React.useState(0);
    const [caja, setCaja] = React.useState<Caja | null>(null);
    const [ofrecer, setOfrecer] = React.useState<Recorrido | null>(null);
    const globo = React.useRef<HTMLDivElement>(null);
    const [altoDelGlobo, setAltoDelGlobo] = React.useState(180);
    const [ventana, setVentana] = React.useState({ w: 1024, h: 768 });
    const [zonas, setZonas] = React.useState({ arriba: 0, abajo: 0 });
    const antes = React.useRef<HTMLElement | null>(null);

    React.useEffect(() => setMontado(true), []);

    const cerrar = React.useCallback(() => {
        setAbierto((a) => {
            if (a) apuntarVisto(a.recorrido.id);
            return null;
        });
        setCaja(null);
        // El foco vuelve a donde estaba (el «?», casi siempre).
        const volver = antes.current;
        antes.current = null;
        if (volver && document.contains(volver)) requestAnimationFrame(() => volver.focus());
    }, []);

    const empezar = React.useCallback(
        (r: Recorrido) => {
            const pasos = pasosALaVista(pasosDelRol(r, rol), r.enOrdenDePantalla);
            if (pasos.length === 0) return;
            antes.current = document.activeElement as HTMLElement | null;
            setZonas(zonasSeguras());
            setOfrecer(null);
            setI(0);
            setAbierto({ recorrido: r, pasos });
        },
        [rol]
    );

    // El «?» y los «¿Cómo funciona?».
    React.useEffect(() => {
        const abrir = (e: Event) => {
            const id = (e as CustomEvent<string | null>).detail;
            const r = (id && recorridoPorId(id)) || recorridoDe(pathname);
            empezar(r);
        };
        window.addEventListener(ABRIR, abrir);
        return () => window.removeEventListener(ABRIR, abrir);
    }, [pathname, empezar]);

    // Otra pantalla: se cierra el de la anterior.
    React.useEffect(() => {
        setAbierto(null);
        setCaja(null);
        setOfrecer(null);
    }, [pathname]);

    // La primera vez en una pantalla, se ofrece (una sola vez).
    React.useEffect(() => {
        if (!rol) return;
        let enPruebas = false;
        try {
            enPruebas = Boolean(navigator.webdriver) && localStorage.getItem(LLAVE_OFRECER_EN_PRUEBAS) !== '1';
        } catch {
            enPruebas = Boolean(navigator.webdriver);
        }
        // Sin saber de quién es el teléfono no se puede apuntar lo visto, y se
        // ofrecería en cada visita: mejor no ofrecer.
        if (enPruebas || !llaveDeLoVisto()) return;
        const r = recorridoDe(pathname);
        if (r.id === 'general' || loVisto().includes(r.id)) return;
        // Que la pantalla haya pintado sus datos: con la mitad de los pasos
        // sin su botón todavía, el recorrido saldría cojo.
        const t = window.setTimeout(() => {
            if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
            if (pasosALaVista(pasosDelRol(r, rol)).filter((p) => p.donde).length < 2) return;
            apuntarVisto(r.id);
            setOfrecer(r);
        }, 1800);
        return () => window.clearTimeout(t);
    }, [pathname, rol]);

    const paso = abierto?.pasos[i] ?? null;

    // Bajar hasta lo que se explica.
    React.useEffect(() => {
        if (!paso?.donde) return;
        // La barra de abajo se esconde al bajar: para explicarla, que se vea.
        if (paso.donde === 'menu') window.dispatchEvent(new Event(MOSTRAR_LA_BARRA));
        const el = elQueSeVe(paso.donde);
        el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducido ? 'auto' : 'smooth' });
    }, [paso, reducido]);

    // Seguirlo mientras se mueve (la pantalla baja, el teléfono gira, algo carga).
    React.useEffect(() => {
        if (!abierto) return;
        let vivo = true;
        let cuadro = 0;
        const medir = () => {
            if (!vivo) return;
            const vv = window.visualViewport;
            const w = Math.round(vv?.width ?? window.innerWidth);
            const h = Math.round(vv?.height ?? window.innerHeight);
            setVentana((v) => (v.w === w && v.h === h ? v : { w, h }));
            const el = paso?.donde ? elQueSeVe(paso.donde) : null;
            if (el) {
                const r = el.getBoundingClientRect();
                const nueva = { x: r.left - HOLGURA, y: r.top - HOLGURA, w: r.width + HOLGURA * 2, h: r.height + HOLGURA * 2 };
                setCaja((c) =>
                    c && Math.abs(c.x - nueva.x) < 0.5 && Math.abs(c.y - nueva.y) < 0.5 && Math.abs(c.w - nueva.w) < 0.5 && Math.abs(c.h - nueva.h) < 0.5 ? c : nueva
                );
            } else {
                setCaja(null);
            }
            if (globo.current) {
                const alto = globo.current.offsetHeight;
                setAltoDelGlobo((a) => (a === alto ? a : alto));
            }
            cuadro = requestAnimationFrame(medir);
        };
        medir();
        // Y al desplazarse o cambiar de tamaño, por si el navegador no da
        // cuadros (en una pestaña de fondo, o un teléfono que ahorra batería):
        // el hueco no se puede quedar donde ESTABA el botón.
        const yaMismo = () => {
            cancelAnimationFrame(cuadro);
            medir();
        };
        window.addEventListener('scroll', yaMismo, { capture: true, passive: true });
        window.addEventListener('resize', yaMismo);
        window.visualViewport?.addEventListener('resize', yaMismo);
        window.visualViewport?.addEventListener('scroll', yaMismo);
        return () => {
            vivo = false;
            cancelAnimationFrame(cuadro);
            window.removeEventListener('scroll', yaMismo, { capture: true });
            window.removeEventListener('resize', yaMismo);
            window.visualViewport?.removeEventListener('resize', yaMismo);
            window.visualViewport?.removeEventListener('scroll', yaMismo);
        };
    }, [abierto, paso]);

    // El foco, al globo en cada paso: el lector de pantalla lee el título.
    React.useEffect(() => {
        if (abierto) globo.current?.focus({ preventScroll: true });
    }, [abierto, i]);

    const siguiente = React.useCallback(() => {
        if (!abierto) return;
        if (i >= abierto.pasos.length - 1) cerrar();
        else setI(i + 1);
    }, [abierto, i, cerrar]);
    const atras = React.useCallback(() => setI((n) => Math.max(0, n - 1)), []);

    // Escape y las flechas valen aunque el foco se haya ido del globo.
    React.useEffect(() => {
        if (!abierto) return;
        const alPulsar = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                cerrar();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                siguiente();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                atras();
            }
        };
        window.addEventListener('keydown', alPulsar, true);
        return () => window.removeEventListener('keydown', alPulsar, true);
    }, [abierto, cerrar, siguiente, atras]);

    const alTeclear = (e: React.KeyboardEvent) => {
        if (e.key === 'Tab' && globo.current) {
            // El foco no se escapa del globo mientras está abierto.
            const botones = Array.from(globo.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
            if (botones.length === 0) return;
            const primero = botones[0];
            const ultimo = botones[botones.length - 1];
            if (e.shiftKey && (document.activeElement === primero || document.activeElement === globo.current)) {
                e.preventDefault();
                ultimo.focus();
            } else if (!e.shiftKey && document.activeElement === ultimo) {
                e.preventDefault();
                primero.focus();
            }
        }
    };

    if (!montado) return null;

    if (ofrecer && !abierto) {
        return createPortal(
            <div
                role="region"
                aria-label="Recorrido de la pantalla"
                className="fixed inset-x-4 z-[90] mx-auto max-w-sm rounded-2xl bg-gray-900 p-4 text-white shadow-2xl bottom-[calc(6.5rem+var(--zona-segura-abajo))] lateral:inset-x-auto lateral:right-6 lateral:bottom-6"
            >
                <p className="text-base font-bold">¿Te enseño esta pantalla?</p>
                <p className="mt-1 text-sm text-gray-200">
                    {ofrecer.nombre}, paso a paso y en un minuto. Luego está siempre en el botón «?» de arriba.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                    <button type="button" onClick={() => setOfrecer(null)} className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-gray-200 hover:bg-white/10">
                        Ahora no
                    </button>
                    <button type="button" onClick={() => empezar(ofrecer)} className="min-h-[44px] rounded-xl bg-white px-4 text-sm font-bold text-gray-900 hover:bg-gray-100">
                        Ver cómo funciona
                    </button>
                </div>
            </div>,
            document.body
        );
    }

    if (!abierto || !paso) return null;

    // ── Dónde va el globo ──────────────────────────────────────────────────
    const ancho = Math.min(360, ventana.w - MARGEN * 2);
    const arribaLibre = MARGEN + zonas.arriba;
    const abajoLibre = ventana.h - MARGEN - zonas.abajo;
    let top: number;
    let left: number;
    let flecha: { lado: 'arriba' | 'abajo' | 'izquierda' | 'derecha'; x: number; y?: number } | null = null;
    if (caja && paso.donde) {
        const centro = caja.x + caja.w / 2;
        left = Math.min(Math.max(centro - ancho / 2, MARGEN), ventana.w - MARGEN - ancho);
        const flechaX = Math.min(Math.max(centro - left, 20), ancho - 20);
        if (caja.y + caja.h + SEPARACION + altoDelGlobo <= abajoLibre) {
            top = caja.y + caja.h + SEPARACION;
            flecha = { lado: 'arriba', x: flechaX };
        } else if (caja.y - SEPARACION - altoDelGlobo >= arribaLibre) {
            top = caja.y - SEPARACION - altoDelGlobo;
            flecha = { lado: 'abajo', x: flechaX };
        } else if (caja.x + caja.w + SEPARACION + ancho <= ventana.w - MARGEN || caja.x - SEPARACION - ancho >= MARGEN) {
            // Más alto que la pantalla (un cuadro entero), pero con sitio al
            // lado (ordenador): el globo, al lado, sin tapar nada de lo que explica.
            const aLaDerecha = caja.x + caja.w + SEPARACION + ancho <= ventana.w - MARGEN;
            left = aLaDerecha ? caja.x + caja.w + SEPARACION : caja.x - SEPARACION - ancho;
            const visibleArriba = Math.max(caja.y, arribaLibre);
            const visibleAbajo = Math.min(caja.y + caja.h, abajoLibre);
            const medio = (visibleArriba + visibleAbajo) / 2;
            top = Math.min(Math.max(medio - altoDelGlobo / 2, arribaLibre), abajoLibre - altoDelGlobo);
            flecha = { lado: aLaDerecha ? 'izquierda' : 'derecha', x: 0, y: Math.min(Math.max(medio - top, 20), altoDelGlobo - 20) };
        } else {
            // Lo iluminado ocupa casi toda la pantalla: el globo, abajo, encima.
            top = abajoLibre - altoDelGlobo;
        }
    } else {
        left = (ventana.w - ancho) / 2;
        top = Math.max(arribaLibre, (ventana.h - altoDelGlobo) / 2);
    }
    const ultimo = i === abierto.pasos.length - 1;

    return createPortal(
        <div className="fixed inset-0 z-[100]" data-recorrido-abierto={abierto.recorrido.id}>
            {/* Lo de detrás no se toca mientras se explica. */}
            <div
                className="absolute inset-0"
                onMouseDown={(e) => {
                    // Tocar fuera no cierra ni roba el foco al globo.
                    e.preventDefault();
                    globo.current?.focus({ preventScroll: true });
                }}
                aria-hidden
            />
            {caja && paso.donde ? (
                <div
                    className="pointer-events-none absolute rounded-xl"
                    // El borde blanco y lo oscuro, en UNA sombra: el `ring-` de
                    // Tailwind también es una sombra, y la de aquí la pisaba.
                    // Sin transición: el hueco sigue al botón al instante,
                    // también mientras la pantalla baja sola.
                    style={{
                        top: caja.y,
                        left: caja.x,
                        width: caja.w,
                        height: caja.h,
                        boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.9), 0 0 0 200vmax rgba(17, 24, 39, 0.72)',
                    }}
                    data-recorrido-hueco={paso.donde}
                    aria-hidden
                />
            ) : (
                <div className="pointer-events-none absolute inset-0 bg-gray-900/70" aria-hidden />
            )}

            <div
                ref={globo}
                role="dialog"
                aria-modal="true"
                aria-labelledby="recorrido-titulo"
                aria-describedby="recorrido-texto"
                tabIndex={-1}
                onKeyDown={alTeclear}
                className="absolute rounded-2xl bg-gray-900 p-4 text-white shadow-2xl outline-none"
                style={{ top, left, width: ancho, transition: reducido ? undefined : 'top 200ms ease, left 200ms ease' }}
            >
                {flecha && (
                    <span
                        aria-hidden
                        className="absolute h-3 w-3 rotate-45 bg-gray-900"
                        style={
                            flecha.lado === 'arriba'
                                ? { left: flecha.x - 6, top: -6 }
                                : flecha.lado === 'abajo'
                                  ? { left: flecha.x - 6, bottom: -6 }
                                  : flecha.lado === 'izquierda'
                                    ? { top: (flecha.y ?? 20) - 6, left: -6 }
                                    : { top: (flecha.y ?? 20) - 6, right: -6 }
                        }
                    />
                )}
                <div className="flex items-start justify-between gap-2">
                    <p id="recorrido-titulo" className="pt-2 text-base font-bold leading-snug">
                        {paso.titulo}
                    </p>
                    <button
                        type="button"
                        onClick={cerrar}
                        className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-300 hover:bg-white/10 hover:text-white"
                        aria-label="Saltar el recorrido"
                    >
                        <X className="h-5 w-5" aria-hidden />
                    </button>
                </div>
                <p id="recorrido-texto" className="mt-1 text-sm leading-relaxed text-gray-200">
                    {paso.texto}
                </p>
                <div className="mt-4 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-300" aria-live="polite">
                        {i + 1} de {abierto.pasos.length}
                    </span>
                    <div className="flex gap-2">
                        {i > 0 && (
                            <button type="button" onClick={atras} className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-gray-100 hover:bg-white/10">
                                Atrás
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={siguiente}
                            className="min-h-[44px] min-w-[44px] rounded-xl bg-white px-4 text-sm font-bold text-gray-900 hover:bg-gray-100"
                        >
                            {ultimo ? 'Listo' : 'Siguiente'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

/** El «?» de la cabecera: el recorrido de la pantalla en que se está. */
export function BotonDelRecorrido({ className }: { className?: string }) {
    return (
        <button
            type="button"
            onClick={() => abrirElRecorrido()}
            data-recorrido="ayuda"
            aria-label="¿Cómo funciona esta pantalla?"
            title="¿Cómo funciona esta pantalla?"
            className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-indigo-700', className)}
        >
            <HelpCircle className="h-5 w-5" aria-hidden />
        </button>
    );
}

/** El «¿Cómo funciona?» de dentro de una pantalla: su recorrido por nombre. */
export function BotonComoFunciona({ recorrido, className }: { recorrido: string; className?: string }) {
    return (
        <button
            type="button"
            onClick={() => abrirElRecorrido(recorrido)}
            className={cn(
                'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50',
                className
            )}
        >
            <HelpCircle className="h-4 w-4 text-indigo-600" aria-hidden />
            ¿Cómo funciona?
        </button>
    );
}

export default RecorridoGuiado;
