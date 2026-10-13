/**
 * EL COLOR DE LA APP Y EL MODO OSCURO, EN UN SOLO SITIO (octubre 2026)
 *
 * Cristian: «quiero que los colores también cambien el azul… y un modo oscuro
 * que se vea como Spotify». Las pantallas están escritas con las clases de
 * Tailwind de siempre (`bg-white` 703 veces, `text-gray-900` 513,
 * `bg-indigo-600` 198…). Cambiarlas una a una era imposible de mantener: aquí
 * esas clases dejan de ser un color fijo y pasan a ser una VARIABLE, que cambia
 * según dos marcas del `<html>`:
 *
 *   · `data-acento="…"`  el color que eligió quien mira (lib/tema-de-la-app.ts);
 *   · la clase `dark`    el modo oscuro (lib/modo-de-la-app.ts).
 *
 * Qué cambia con el COLOR: la cabecera (la barra lateral, la franja del Inicio,
 * la cabecera del teléfono) y todo el `indigo-*`, que es «lo que se pulsa».
 * «Azul» es lo de siempre, idéntico, y va por defecto.
 *
 * Qué cambia con el MODO OSCURO, a lo Spotify: el fondo negro, las cajas
 * #121212, la letra blanca y gris claro. Una misma clase no se oscurece igual
 * en el fondo, en la letra y en el borde: `gray-900` como letra pasa a casi
 * blanco, pero `bg-gray-900` (los globos oscuros con letra blanca) sigue
 * oscuro. Por eso cada familia lleva TRES juegos de variables: fondo (-f),
 * letra (-t) y borde (-b). En claro, los tres son el color de Tailwind de
 * siempre: nada se ve distinto hasta que se elige otra cosa.
 *
 * El papel no se oscurece nunca: lo oscuro va dentro de `@media screen`, y
 * `.modo-claro` lo devuelve a claro dentro de una pantalla (los documentos).
 *
 * Lo usa `tailwind.config.js` (las clases y el CSS) y lo copia
 * `lib/tema-de-la-app.ts` (los nombres; una prueba compara las dos listas).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tw = require('tailwindcss/colors');

const TONOS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

/** Los -600 que se oscurecieron para pasar 4,5:1 (ver tailwind.config.js). */
const AJUSTES_DE_CLARO = {
    green: { 600: '#15803d' },
    emerald: { 600: '#047857' },
    amber: { 600: '#b45309' },
    yellow: { 600: '#a16207' },
    orange: { 600: '#c2410c' },
};

const NEUTROS = ['gray', 'slate'];
const DE_COLOR = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];

// ── Cuentas pequeñas ──────────────────────────────────────────────────────
const rgb = (hex) => {
    const h = hex.replace('#', '');
    const x = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
};
const canales = (hex) => rgb(hex).join(' ');
const aHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
/** `a` mezclado sobre `b`: t = cuánto de `a`. */
const mezcla = (a, b, t) => {
    const x = rgb(a);
    const y = rgb(b);
    return aHex(x.map((v, i) => v * t + y[i] * (1 - t)));
};
const luz = (hex) => {
    const lin = (c) => {
        const x = c / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const [r, g, b] = rgb(hex);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contraste = (a, b) => {
    const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
};

// ── El modo oscuro, a lo Spotify ──────────────────────────────────────────
const OSCURO = {
    fondo: '#000000', // el lienzo
    caja: '#121212', // las cajas y tarjetas (`bg-white`)
};

/** Los grises en oscuro: fondo, letra y borde, tono a tono. */
const NEUTRO_OSCURO = {
    f: { 50: '#181818', 100: '#1f1f1f', 200: '#2a2a2a', 300: '#3e3e3e', 400: '#535353', 500: '#6a6a6a', 600: '#5a5a5a', 700: '#4a4a4a', 800: '#383838', 900: '#2e2e2e', 950: '#242424' },
    // Del 50 al 300 la letra ya es clara (va sobre fondos oscuros): se queda.
    t: { 400: '#8f8f8f', 500: '#a7a7a7', 600: '#c4c4c4', 700: '#dedede', 800: '#f0f0f0', 900: '#ffffff', 950: '#ffffff' },
    b: { 50: '#1f1f1f', 100: '#242424', 200: '#2a2a2a', 300: '#3a3a3a', 400: '#4d4d4d', 500: '#5e5e5e', 600: '#6e6e6e' },
};

/**
 * Un color en oscuro: los fondos claros (50–300) pasan a un tinte oscuro del
 * mismo color, y la letra oscura (500–950) a sus tonos claros. Los fondos
 * fuertes (400+) se quedan: un botón `bg-emerald-600` con letra blanca se lee
 * igual sobre negro.
 */
function deColorOscuro(escala) {
    const base = escala['500'];
    return {
        f: { 50: mezcla(base, OSCURO.caja, 0.14), 100: mezcla(base, OSCURO.caja, 0.2), 200: mezcla(base, OSCURO.caja, 0.28), 300: mezcla(base, OSCURO.caja, 0.4) },
        t: { 500: escala['400'], 600: escala['400'], 700: escala['300'], 800: escala['200'], 900: escala['200'], 950: escala['100'] },
        b: { 50: mezcla(base, OSCURO.caja, 0.18), 100: mezcla(base, OSCURO.caja, 0.24), 200: mezcla(base, OSCURO.caja, 0.32), 300: mezcla(base, OSCURO.caja, 0.45) },
    };
}

// ── Los colores de la app ─────────────────────────────────────────────────
/**
 * Del 500 al 950 un tono más hondo: así el 600 (el botón, con letra blanca)
 * y el 700 (la letra sobre blanco) pasan 4,5:1. El teal-600 daba 3,7:1.
 */
const unTonoMasHondo = (e) => ({ ...e, 500: e['600'], 600: e['700'], 700: e['800'], 800: e['900'], 900: e['950'], 950: e['950'] });

const ACENTOS = {
    azul: {
        nombre: 'Azul',
        acento: '#00BFA5',
        // Lo de siempre, idéntico.
        escala: tw.indigo,
        cabecera: { fondo: '#0D47A1', medio: '#0B3F94', hondo: '#08326F', texto: '#FFFFFF', suave: '#BBDEFB', celeste: '#90CAF9', sobreCeleste: '#0D47A1', claro: '#E3F2FD', tinta: '#0D47A1', tintaOscura: '#90CAF9' },
    },
    turquesa: {
        nombre: 'Turquesa',
        acento: '#00BFA5',
        escala: unTonoMasHondo(tw.teal),
        cabecera: { fondo: '#00594F', medio: '#004F46', hondo: '#003F38', texto: '#FFFFFF', suave: '#E0F2F1', celeste: '#80CBC4', sobreCeleste: '#003D33', claro: '#E0F2F1', tinta: '#00594F', tintaOscura: '#4DB6AC' },
    },
    violeta: {
        nombre: 'Violeta',
        acento: '#7C3AED',
        escala: tw.violet,
        cabecera: { fondo: '#5B21B6', medio: '#4F1DA0', hondo: '#3F1782', texto: '#FFFFFF', suave: '#DDD6FE', celeste: '#C4B5FD', sobreCeleste: '#3B0F80', claro: '#EDE9FE', tinta: '#5B21B6', tintaOscura: '#C4B5FD' },
    },
    amarillo: {
        nombre: 'Amarillo',
        acento: '#FBC02D',
        // Amarillo de verdad en la barra, con la letra oscura (lo eligió
        // Cristian). Los botones no pueden ser amarillos con letra blanca:
        // van en el ámbar hondo.
        escala: unTonoMasHondo(tw.amber),
        cabecera: { fondo: '#FBC02D', medio: '#F9A825', hondo: '#F59E0B', texto: '#0B1B33', suave: '#4A3B00', celeste: '#FFF3C4', sobreCeleste: '#5C4500', claro: '#FFF8E1', tinta: '#7A5C00', tintaOscura: '#FBC02D' },
    },
    coral: {
        nombre: 'Coral',
        acento: '#FF7043',
        escala: unTonoMasHondo(tw.orange),
        cabecera: { fondo: '#A12D08', medio: '#8F2807', hondo: '#762106', texto: '#FFFFFF', suave: '#FFEAE2', celeste: '#FFAB91', sobreCeleste: '#6B1D04', claro: '#FBE9E7', tinta: '#A12D08', tintaOscura: '#FFAB91' },
    },
};
const ACENTO_POR_DEFECTO = 'azul';

/** Las variables del acento suelto (el botón de Inicio, la marca de hoy…). */
function variablesDelAcento(hex) {
    const [r, g, b] = rgb(hex);
    return {
        '--acento': hex,
        '--acento-suave': `rgba(${r},${g},${b},0.16)`,
        '--acento-hondo': `rgb(${Math.round(r * 0.52)},${Math.round(g * 0.52)},${Math.round(b * 0.52)})`,
        // Sobre un acento claro (amarillo, turquesa) el texto va oscuro.
        '--sobre-acento': luz(hex) > 0.3 ? '#0B1B33' : '#FFFFFF',
    };
}

/** Las variables de la cabecera; en canales («r g b») para el `/opacidad` de Tailwind. */
function variablesDeLaCabecera(c) {
    const v = {};
    for (const [k, hex] of Object.entries(c)) {
        if (k === 'tintaOscura') continue;
        v[`--cab-${k}`] = canales(hex);
    }
    // El azul de siempre, entero, para los que lo leen fuera de Tailwind
    // (la franja del reloj, el `theme-color`, los degradados).
    v['--azul-cabecera'] = c.fondo;
    v['--cab-fondo-hex'] = c.fondo;
    v['--cab-medio-hex'] = c.medio;
    v['--cab-hondo-hex'] = c.hondo;
    v['--cab-tinta-hex'] = c.tinta;
    return v;
}

/** En oscuro la cabecera es una caja más, como la barra de Spotify; el color queda en lo activo. */
function variablesDeLaCabeceraOscura(a) {
    const c = a.cabecera;
    const hondo = { fondo: OSCURO.caja, medio: OSCURO.caja, hondo: OSCURO.caja, texto: '#FFFFFF', suave: '#B3B3B3', celeste: mezcla(c.tintaOscura, OSCURO.caja, 0.45), sobreCeleste: '#FFFFFF', claro: mezcla(c.tintaOscura, OSCURO.caja, 0.16), tinta: c.tintaOscura };
    // El icono de la página activa, sobre la pastilla oscura: el acento, o
    // su tono claro si no se ve (el violeta sobre #2A2A2A).
    const hondoDelAcento = contraste(a.acento, '#2A2A2A') >= 3 ? a.acento : c.tintaOscura;
    return { ...variablesDeLaCabecera(hondo), '--acento-hondo': hondoDelAcento };
}

function escalaComoVariables(prefijo, escala, oscuro) {
    const v = {};
    for (const t of TONOS) {
        const claro = escala[t];
        v[`--${prefijo}-${t}-f`] = canales(oscuro?.f?.[t] ?? claro);
        v[`--${prefijo}-${t}-t`] = canales(oscuro?.t?.[t] ?? claro);
        v[`--${prefijo}-${t}-b`] = canales(oscuro?.b?.[t] ?? claro);
    }
    return v;
}

const escalaDe = (familia) => ({ ...tw[familia], ...(AJUSTES_DE_CLARO[familia] || {}) });

// ── El CSS ─────────────────────────────────────────────────────────────────
/**
 * Los colores escritos a mano del diseño del Inicio y de las barras
 * (`#0B1B33`, `#5B6B82`, `#F4F7FB`…), con nombre: así también se oscurecen.
 */
const DEL_DISENO = {
    '--texto-fuerte': ['#0B1B33', '#FFFFFF'],
    '--texto-medio': ['#33415C', '#D4D4D4'],
    '--texto-gris': ['#5B6B82', '#A7A7A7'],
    '--superficie': ['#F4F7FB', '#1F1F1F'],
    '--superficie-hover': ['#EEF3FA', '#2A2A2A'],
    '--superficie-pagina': ['#F8FAFC', '#181818'],
    '--borde-suave': ['#E3E8F0', '#2A2A2A'],
    '--borde-medio': ['#9AAFCB', '#535353'],
    // La baldosa del logo del liceo sigue blanca también en oscuro: los
    // logos están hechos para el papel.
    '--baldosa-del-logo': ['#FFFFFF', '#FFFFFF'],
    // La pastilla de la página activa en la barra.
    '--pastilla': ['#FFFFFF', '#2A2A2A'],
    '--lienzo-de-la-app': ['#F8FAFC', OSCURO.fondo],
};

function cssDeLaPaleta() {
    const claro = { '--blanco-f': canales('#FFFFFF') };
    const oscuro = { '--blanco-f': canales(OSCURO.caja) };
    for (const [k, [c, o]] of Object.entries(DEL_DISENO)) {
        claro[k] = canales(c);
        oscuro[k] = canales(o);
    }
    for (const n of NEUTROS) {
        Object.assign(claro, escalaComoVariables(n, tw[n]));
        Object.assign(oscuro, escalaComoVariables(n, tw[n], NEUTRO_OSCURO));
    }
    for (const c of DE_COLOR) {
        const e = escalaDe(c);
        Object.assign(claro, escalaComoVariables(c, e));
        Object.assign(oscuro, escalaComoVariables(c, e, deColorOscuro(e)));
    }

    const porAcento = {};
    for (const [id, a] of Object.entries(ACENTOS)) {
        porAcento[id] = {
            claro: { ...escalaComoVariables('indigo', a.escala), ...variablesDeLaCabecera(a.cabecera), ...variablesDelAcento(a.acento) },
            oscuro: { ...escalaComoVariables('indigo', a.escala, deColorOscuro(a.escala)), ...variablesDeLaCabeceraOscura(a) },
        };
    }

    const base = porAcento[ACENTO_POR_DEFECTO];
    // Lo que vale «claro» completo: los grises, los colores y el acento por defecto.
    const todoClaro = { ...claro, ...base.claro };
    const todoOscuro = { ...oscuro, ...base.oscuro };

    const css = {
        ':root': todoClaro,
        '@media screen': {
            '.dark': todoOscuro,
            // Dentro de una pantalla oscura, lo que es papel vuelve a claro.
            '.dark .modo-claro': todoClaro,
        },
    };
    for (const [id, a] of Object.entries(porAcento)) {
        if (id === ACENTO_POR_DEFECTO) continue;
        css[`[data-acento="${id}"]`] = a.claro;
        css['@media screen'][`.dark[data-acento="${id}"]`] = a.oscuro;
        css['@media screen'][`.dark[data-acento="${id}"] .modo-claro`] = a.claro;
    }
    return css;
}

// ── Las clases de Tailwind ────────────────────────────────────────────────
const variable = (nombre) => `rgb(var(${nombre}) / <alpha-value>)`;
function familia(prefijo, sufijo) {
    return Object.fromEntries(TONOS.map((t) => [t, variable(`--${prefijo}-${t}-${sufijo}`)]));
}
/** `colors` (letra, rellenos), y aparte el fondo y el borde. */
function coloresDeTailwind() {
    const familias = [...NEUTROS, ...DE_COLOR, 'indigo'];
    const comoLetra = {};
    const comoFondo = { white: variable('--blanco-f') };
    const comoBorde = {};
    for (const f of familias) {
        comoLetra[f] = familia(f, 't');
        comoFondo[f] = familia(f, 'f');
        comoBorde[f] = familia(f, 'b');
    }
    const cabecera = {
        DEFAULT: variable('--cab-fondo'),
        medio: variable('--cab-medio'),
        hondo: variable('--cab-hondo'),
        texto: variable('--cab-texto'),
        suave: variable('--cab-suave'),
        celeste: variable('--cab-celeste'),
        // La letra sobre el celeste (las iniciales del avatar).
        sobreceleste: variable('--cab-sobreCeleste'),
        claro: variable('--cab-claro'),
        tinta: variable('--cab-tinta'),
    };
    const delDiseno = {
        texto: { fuerte: variable('--texto-fuerte'), medio: variable('--texto-medio'), gris: variable('--texto-gris') },
        superficie: { DEFAULT: variable('--superficie'), hover: variable('--superficie-hover'), pagina: variable('--superficie-pagina') },
        borde: { suave: variable('--borde-suave'), medio: variable('--borde-medio') },
        baldosa: variable('--baldosa-del-logo'),
        pastilla: variable('--pastilla'),
    };
    return { comoLetra, comoFondo, comoBorde, cabecera, delDiseno };
}

module.exports = {
    ACENTOS,
    ACENTO_POR_DEFECTO,
    OSCURO,
    TONOS,
    NEUTROS,
    DE_COLOR,
    cssDeLaPaleta,
    coloresDeTailwind,
    variablesDelAcento,
    contraste,
    mezcla,
    escalaDe,
    deColorOscuro,
    NEUTRO_OSCURO,
};
