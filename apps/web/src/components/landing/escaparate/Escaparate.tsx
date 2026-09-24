'use client';

import * as React from 'react';
import { LazyMotion, MotionConfig, domAnimation, m } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dedo } from './Dedo';
import { MEDIDAS, Portatil, Tableta, Telefono } from './Marcos';
import { PortCifras, PortHorario, TabNotas, TabQr, TelAsistencia, TelEscaner, TelHorario, TelInicio } from './Pantallas';
import { ESCENAS, INICIO_DE, PASO_MS, PASOS_DEL_CICLO, PASO_QUIETO, type Aparato, type IdDeEscena, momentoDe } from './guion';
import { useALaVista, useMenosMovimiento, usePestanaVisible, useReloj } from './useReloj';

/**
 * EL ESCAPARATE: TRES APARATOS QUE SE USAN SOLOS
 *
 * Un portátil, una tableta y un teléfono con la app de verdad dentro, y un
 * dedo (o un cursor) que va tocando. Cada toque tiene su onda y la pantalla
 * responde: la cuenta de la asistencia sube, el promedio se mueve, el
 * horario pasa a la hora siguiente, el QR cambia mientras entran nombres.
 *
 * ─── EL RELOJ ───────────────────────────────────────────────────────────────
 *
 * Cuenta MEDIOS pasos. En la primera mitad de un paso el dedo está sobre lo
 * que toca en ese paso (y la onda nace ahí); en la segunda mitad ya se va
 * hacia lo que tocará en el siguiente. Así el dedo llega ANTES de tocar, como
 * una mano de verdad, y la onda no sale arrastrada por el camino.
 *
 * ─── CUÁNDO NO SE MUEVE ─────────────────────────────────────────────────────
 *
 *  · Fuera de la vista (IntersectionObserver) o con la pestaña escondida.
 *  · Si se pulsa «Pausar»: una animación que no para sola durante más de
 *    cinco segundos tiene que poder pararse (WCAG 2.2.2), no solo para quien
 *    pidió «menos movimiento» en su sistema.
 *  · Con «menos movimiento» (`prefers-reduced-motion`): una foto fija con las
 *    tres pantallas completas, sin dedo; los botones de las escenas siguen
 *    enseñando cada una, quieta.
 *
 * ─── DOS COMPOSICIONES ─────────────────────────────────────────────────────
 *
 * Ancha (desde 768 px): el portátil al fondo y en el centro, la tableta a la
 * izquierda y el teléfono a la derecha, girados hacia dentro. Estrecha (el
 * teléfono de quien mira): el portátil arriba y los otros dos debajo, más
 * grandes, porque en 360 px un teléfono dibujado a escala del portátil no se
 * leería. El escenario se diseña a un tamaño fijo y se encoge entero con UN
 * `transform: scale` al ancho que haya: la caja que lo contiene reserva su
 * sitio con `aspect-ratio`, así que la página no salta (CLS 0).
 */

type Forma = 'ancha' | 'estrecha';

const ESCENARIO: Record<Forma, { ancho: number; alto: number }> = {
    ancha: { ancho: 1100, alto: 640 },
    estrecha: { ancho: 400, alto: 520 },
};

interface Pose {
    x: number;
    y: number;
    s: number;
    rotY: number;
    rotX?: number;
}

const POSES: Record<Forma, Record<Aparato, Pose>> = {
    ancha: {
        portatil: { x: 118, y: 0, s: 1.08, rotY: 0, rotX: 5 },
        tableta: { x: 14, y: 168, s: 0.88, rotY: 11 },
        telefono: { x: 848, y: 124, s: 0.9, rotY: -11 },
    },
    estrecha: {
        portatil: { x: 16, y: 4, s: 0.46, rotY: 0, rotX: 6 },
        tableta: { x: 4, y: 214, s: 0.56, rotY: 12 },
        telefono: { x: 236, y: 196, s: 0.58, rotY: -12 },
    },
};

/** Dónde descansa el dedo cuando no toca: abajo a la derecha, fuera de la vista. */
const REPOSO: Record<Aparato, { x: number; y: number }> = {
    portatil: { x: MEDIDAS.portatil.contenido.ancho - 60, y: MEDIDAS.portatil.contenido.alto + 40 },
    tableta: { x: MEDIDAS.tableta.contenido.ancho + 40, y: MEDIDAS.tableta.contenido.alto - 80 },
    telefono: { x: MEDIDAS.telefono.contenido.ancho + 40, y: MEDIDAS.telefono.contenido.alto - 120 },
};

// ─── Qué enseña cada aparato en cada paso, y qué toca ──────────────────────

interface Estado {
    pantalla: React.ReactNode;
    /** Lo que se toca en ESTE paso (la pantalla ya muestra la respuesta). */
    toca: string | null;
}

function telefono(pasoGlobal: number): Estado {
    const { escena, paso: p } = momentoDe(pasoGlobal);
    switch (escena.id) {
        case 'asistencia':
            return {
                pantalla: <TelAsistencia marcados={Math.min(6, Math.max(0, p - 1))} guardado={p >= 8} />,
                toca: p === 0 ? 'tel-barra-academico' : p <= 6 ? `tel-presente-${p - 1}` : null,
            };
        case 'notas':
            return { pantalla: <TelAsistencia marcados={6} guardado />, toca: null };
        case 'horario':
            if (p === 0) return { pantalla: <TelAsistencia marcados={6} guardado />, toca: null };
            return { pantalla: <TelHorario ahora={p >= 3 ? 1 : 0} />, toca: p === 1 ? 'tel-barra-horarios' : null };
        case 'qr':
            return { pantalla: <TelEscaner barrido={p} leido={p >= 5} />, toca: null };
        case 'cifras':
            return { pantalla: <TelInicio />, toca: null };
    }
}

function tableta(pasoGlobal: number): Estado {
    const { escena, paso: p } = momentoDe(pasoGlobal);
    switch (escena.id) {
        case 'asistencia':
            return { pantalla: <TabNotas puestas={0} foco={null} guardado={false} />, toca: null };
        case 'notas': {
            const puestas = p >= 6 ? 3 : p >= 4 ? 2 : p >= 2 ? 1 : 0;
            const foco = p === 1 || p === 2 ? 0 : p === 3 || p === 4 ? 1 : p === 5 || p === 6 ? 3 : null;
            const toca = p === 1 ? 'tab-nota-0' : p === 3 ? 'tab-nota-1' : p === 5 ? 'tab-nota-3' : null;
            return { pantalla: <TabNotas puestas={puestas} foco={foco} guardado={p >= 7} />, toca };
        }
        case 'horario':
            return { pantalla: <TabNotas puestas={3} foco={null} guardado />, toca: null };
        case 'qr':
            return { pantalla: <TabQr entrados={Math.min(7, p)} version={Math.floor(p / 3)} />, toca: null };
        case 'cifras':
            return { pantalla: <TabQr entrados={7} version={2} />, toca: null };
    }
}

function portatil(pasoGlobal: number): Estado {
    const { escena, paso: p } = momentoDe(pasoGlobal);
    switch (escena.id) {
        case 'asistencia':
            return {
                pantalla: <PortHorario ahora={0} progreso={0.08 + p * 0.01} reloj="07:03" abierta={false} />,
                toca: p === 0 ? 'port-lateral-horarios' : null,
            };
        case 'notas':
            return { pantalla: <PortHorario ahora={0} progreso={0.2 + p * 0.01} reloj="07:09" abierta={false} />, toca: null };
        case 'horario': {
            const reloj = ['07:42', '07:43', '07:44'][p] ?? '07:45';
            return {
                pantalla: (
                    <PortHorario
                        ahora={p >= 3 ? 1 : 0}
                        progreso={p >= 3 ? 0.03 : 0.93 + p * 0.03}
                        reloj={reloj}
                        abierta={p >= 5}
                    />
                ),
                toca: p === 5 ? 'port-entrar' : null,
            };
        }
        case 'qr':
            return { pantalla: <PortHorario ahora={1} progreso={0.1} reloj="07:47" abierta />, toca: null };
        case 'cifras':
            return {
                pantalla: <PortCifras lapso={p >= 4 ? 1 : 0} vuelta={Math.floor(pasoGlobal / PASOS_DEL_CICLO)} />,
                toca: p === 0 ? 'port-lateral-academico' : p === 4 ? 'port-lapso-1' : null,
            };
    }
}

const ESTADOS: Record<Aparato, (p: number) => Estado> = { portatil, tableta, telefono };

/** El teléfono primero: es lo primero que se ve en un teléfono. */
const ORDEN_DE_MONTAJE: Aparato[] = ['telefono', 'tableta', 'portatil'];

/** A dónde va el dedo en este medio paso. */
function blancoDe(aparato: Aparato, paso: number, segundaMitad: boolean) {
    const ahora = ESTADOS[aparato](paso).toca;
    const siguiente = ESTADOS[aparato](paso + 1).toca;
    return segundaMitad ? (siguiente ?? ahora) : (ahora ?? null);
}

// ─── El componente ─────────────────────────────────────────────────────────

/**
 * Lo que se anima en CSS y no con framer-motion: las cifras que cambian. Con
 * «menos movimiento», `globals.css` deja la animación en nada.
 */
const CSS_DEL_ESCAPARATE = `
@keyframes cifra-entra { from { transform: translateY(60%); opacity: 0 } to { transform: none; opacity: 1 } }
.cifra-entra { display: inline-block; animation: cifra-entra 350ms cubic-bezier(0.22, 1, 0.36, 1) both }
`;

function Aparato3D({
    aparato,
    forma,
    activo,
    quieto,
    children,
}: {
    aparato: Aparato;
    forma: Forma;
    activo: boolean;
    quieto: boolean;
    children: React.ReactNode;
}) {
    const pose = POSES[forma][aparato];
    // El que se usa se adelanta un poco y mira más de frente.
    const giro = activo && !quieto ? pose.rotY * 0.45 : pose.rotY;
    return (
        <m.div
            className="absolute left-0 top-0 origin-top-left will-change-transform"
            style={{ transformStyle: 'preserve-3d' }}
            initial={false}
            animate={{
                x: pose.x,
                y: pose.y - (activo && !quieto ? 10 : 0),
                // Dentro de un espacio 3D manda la profundidad, no el z-index:
                // el portátil, al fondo; la tableta y el teléfono, delante.
                z: (aparato === 'portatil' ? -200 : 40) + (activo && !quieto ? 30 : 0),
                scale: pose.s * (activo && !quieto ? 1.03 : 1),
                rotateY: giro,
                rotateX: pose.rotX ?? 0,
            }}
            // Con «menos movimiento», al sitio de golpe (MotionConfig no lo
            // garantiza para `transform` en esta versión: medido en PORTADA-05).
            transition={quieto ? { duration: 0 } : { type: 'spring', stiffness: 60, damping: 18, mass: 1.2 }}
        >
            {children}
        </m.div>
    );
}

/**
 * La pantalla de un aparato solo cambia con el PASO; el dedo, cada medio paso.
 * Separados, cada medio paso se repinta el dedo y no las tres pantallas.
 */
const PantallaDelPaso = React.memo(function PantallaDelPaso({ aparato, paso }: { aparato: Aparato; paso: number }) {
    return <>{ESTADOS[aparato](paso).pantalla}</>;
});

export function Escaparate() {
    const caja = React.useRef<HTMLDivElement>(null);
    const [forma, setForma] = React.useState<Forma>('ancha');
    const [escala, setEscala] = React.useState<number | null>(null);
    const [pausado, setPausado] = React.useState(false);
    const reducir = useMenosMovimiento();

    /**
     * Los aparatos se montan cuando el navegador queda libre, no al hidratar.
     * Son cientos de nodos: montados junto con el resto de la página, en un
     * teléfono lento sumaban tareas largas justo cuando la persona empieza a
     * leer y a tocar (medido: `docs/nube/portada.md`). La caja ya ocupa su
     * sitio, así que llegar un poco después no mueve nada.
     */
    const [montados, setMontados] = React.useState(0);
    React.useEffect(() => {
        // De uno en uno (teléfono, tableta, portátil): tres tareas cortas en vez
        // de una larga que bloquee el primer toque.
        if (montados >= ORDEN_DE_MONTAJE.length) return;
        const w = window as Window & {
            requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
            cancelIdleCallback?: (id: number) => void;
        };
        const siguiente = () => setMontados((n) => n + 1);
        if (w.requestIdleCallback && w.cancelIdleCallback) {
            const id = w.requestIdleCallback(siguiente, { timeout: 2000 });
            return () => w.cancelIdleCallback!(id);
        }
        const id = window.setTimeout(siguiente, 200);
        return () => window.clearTimeout(id);
    }, [montados]);
    const montado = montados >= ORDEN_DE_MONTAJE.length;

    const aLaVista = useALaVista(caja);
    const visible = usePestanaVisible();
    const enMarcha = montado && aLaVista && visible && !pausado && !reducir && escala !== null;

    const [medios, setMedios] = useReloj(enMarcha, 0, PASO_MS / 2);
    const paso = reducir ? PASO_QUIETO : Math.floor(medios / 2);
    const segundaMitad = medios % 2 === 1;
    const momento = momentoDe(paso);

    // Medir: qué composición toca y cuánto hay que encoger el escenario.
    React.useLayoutEffect(() => {
        const el = caja.current;
        if (!el) return;
        const mide = () => {
            const f: Forma = window.matchMedia('(min-width: 768px)').matches ? 'ancha' : 'estrecha';
            setForma(f);
            setEscala(el.clientWidth / ESCENARIO[f].ancho);
        };
        mide();
        const ro = new ResizeObserver(mide);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    /** Saltar a una escena: desde su principio o, con «menos movimiento», ya hecha. */
    const irA = (id: IdDeEscena) => {
        const e = ESCENAS.find((x) => x.id === id)!;
        if (reducir) setPasoQuieto(INICIO_DE[id] + e.pasos - 1);
        else setMedios(INICIO_DE[id] * 2);
    };
    const [pasoQuieto, setPasoQuieto] = React.useState<number | null>(null);
    const pasoVisto = reducir && pasoQuieto !== null ? pasoQuieto : paso;
    const momentoVisto = reducir && pasoQuieto !== null ? momentoDe(pasoQuieto) : momento;

    const giroDelEscenario = { portatil: 0, tableta: 3, telefono: -3 }[momentoVisto.escena.activo];

    return (
        <LazyMotion features={domAnimation} strict>
            <MotionConfig reducedMotion={reducir ? 'always' : 'never'}>
                <div className="mx-auto w-full max-w-6xl">
                    <style>{CSS_DEL_ESCAPARATE}</style>
                    {/* Lo decorativo: los aparatos. El mensaje va en texto de verdad debajo. */}
                    <div
                        ref={caja}
                        aria-hidden
                        data-escaparate
                        data-en-marcha={enMarcha ? 'si' : 'no'}
                        // La caja ocupa su sitio desde el primer pintado, por CSS y con el
                        // mismo corte (768 px) que decide la composición al medir.
                        className="relative w-full select-none [aspect-ratio:400/520] md:[aspect-ratio:1100/640]"
                    >
                        <div
                            className={cn(
                                'absolute left-0 top-0 origin-top-left transition-opacity duration-500',
                                escala === null || montados === 0 ? 'opacity-0' : 'opacity-100'
                            )}
                            style={{
                                width: ESCENARIO[forma].ancho,
                                height: ESCENARIO[forma].alto,
                                transform: `scale(${escala ?? 1})`,
                                perspective: 2200,
                            }}
                        >
                            <m.div
                                className="absolute inset-0"
                                style={{ transformStyle: 'preserve-3d' }}
                                initial={false}
                                animate={{ rotateY: reducir ? 0 : giroDelEscenario }}
                                transition={reducir ? { duration: 0 } : { duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
                            >
                                {(['portatil', 'tableta', 'telefono'] as Aparato[]).map((a) => {
                                    if (ORDEN_DE_MONTAJE.indexOf(a) >= montados) return null;
                                    const estado = ESTADOS[a](pasoVisto);
                                    const toque = !reducir && estado.toca ? pasoVisto : null;
                                    const Marco = a === 'portatil' ? Portatil : a === 'tableta' ? Tableta : Telefono;
                                    return (
                                        <Aparato3D key={a} aparato={a} forma={forma} activo={momentoVisto.escena.activo === a} quieto={reducir}>
                                            <Marco>
                                                <div className="relative h-full w-full">
                                                    <PantallaDelPaso aparato={a} paso={pasoVisto} />
                                                    {!reducir && (
                                                        <Dedo
                                                            forma={a === 'portatil' ? 'cursor' : 'dedo'}
                                                            blanco={blancoDe(a, paso, segundaMitad)}
                                                            toque={toque}
                                                            reposo={REPOSO[a]}
                                                            tam={a === 'portatil' ? 40 : a === 'tableta' ? 58 : 50}
                                                        />
                                                    )}
                                                </div>
                                            </Marco>
                                        </Aparato3D>
                                    );
                                })}
                            </m.div>
                        </div>
                    </div>

                    {/* Lo que se está viendo, dicho con palabras, y el mando. */}
                    <div className="mt-6 flex flex-col items-center gap-4 px-4 sm:mt-8">
                        <p className="min-h-[3rem] max-w-xl text-center text-base leading-6 text-slate-700">
                            {momentoVisto.escena.texto}
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Escenas de la demostración">
                            {ESCENAS.map((e, i) => {
                                const actual = momentoVisto.indice === i;
                                return (
                                    <button
                                        key={e.id}
                                        type="button"
                                        onClick={() => irA(e.id)}
                                        aria-pressed={actual}
                                        className={cn(
                                            'relative min-h-[44px] overflow-hidden rounded-full border px-4 text-sm font-semibold transition-colors',
                                            actual
                                                ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                                        )}
                                    >
                                        {e.titulo}
                                        {actual && !reducir && (
                                            <m.span
                                                aria-hidden
                                                className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-indigo-500"
                                                initial={false}
                                                animate={{ scaleX: (momento.paso + (segundaMitad ? 0.5 : 0) + 0.5) / e.pasos }}
                                                transition={{ duration: PASO_MS / 2000, ease: 'linear' }}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                            {!reducir && (
                                <button
                                    type="button"
                                    onClick={() => setPausado((p) => !p)}
                                    aria-pressed={pausado}
                                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900"
                                >
                                    {pausado ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
                                    {pausado ? 'Seguir' : 'Pausar'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </MotionConfig>
        </LazyMotion>
    );
}

export default Escaparate;
