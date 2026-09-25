/**
 * LAS SEIS REGLAS DEL TELÉFONO, EN UN SOLO SITIO
 *
 * Esto se ejecuta DENTRO del navegador (`page.evaluate`). Vive aparte porque lo
 * usan dos: la auditoría que saca la hoja de contactos
 * (`auditoria-del-telefono.mjs`) y la prueba de navegador que se pone en rojo
 * cuando alguna regla se rompe (`tests/e2e/movil.spec.ts`).
 *
 * Escrito dos veces, una de las dos copia se queda vieja y deja de medir algo
 * sin que nadie se entere — que es exactamente el fallo que este archivo
 * existe para no repetir.
 *
 *  1. ancho        La pantalla no se sale de ancho.
 *  2. arrastre     Nada de dentro se arrastra de lado.
 *  3. banda-arriba La franja del reloj está tapada por algo opaco.
 *  4. banda-abajo  Lo mismo con la barra de gestos.
 *  5. dedo         Lo que se pulsa mide 44 px o más.
 *  6. letra        Nada por debajo de 12 px.
 */

/** El teléfono de referencia: un Android normal, y lo que le come el sistema. */
export const TELEFONO = { width: 390, height: 844 };
export const BANDA_ARRIBA = 40;
export const BANDA_ABAJO = 24;
/** El mínimo para un dedo. Apple dice 44, Google 48; se exige el menor. */
export const DEDO = 44;
export const LETRA = 12;

/** Lo que hay que inyectar para que la página crea que tiene muesca. */
export const ZONAS_DE_UN_TELEFONO = `:root{--zona-segura-arriba:${BANDA_ARRIBA}px !important;--zona-segura-abajo:${BANDA_ABAJO}px !important}`;

export const QUE_SIGNIFICA = {
    ancho: 'La pantalla se sale de ancho',
    arrastre: 'Hay que arrastrar de lado',
    'banda-arriba': 'El reloj tapa contenido',
    'banda-abajo': 'La barra de gestos tapa contenido',
    dedo: 'Botones más pequeños que un dedo',
    letra: 'Letra por debajo de 12 px',
    'sin-cargar': 'Seguía cargando al medirla',
};

export const MEDIR = ({ bandaArriba, bandaAbajo, dedo, letra }) => {
    const faltas = [];

    /**
     * CUÁNTO MIDE EL TELÉFONO DE VERDAD
     *
     * `window.innerWidth` NO sirve para esto, y es lo que usaba la versión
     * anterior. Cuando algo se sale de ancho, el navegador de un móvil ENSANCHA
     * la ventana para que quepa: en una pantalla que pedía 6 px de más,
     * `innerWidth` valía 396 y `scrollWidth` también 396, así que
     * `scrollWidth > innerWidth` daba falso. El fallo se tapaba a sí mismo.
     *
     * Lo que sí mide el cristal del teléfono es `visualViewport`.
     */
    const anchoDelTelefono = Math.round(window.visualViewport?.width ?? document.documentElement.clientWidth);
    const altoDelTelefono = Math.round(window.visualViewport?.height ?? document.documentElement.clientHeight);
    const visible = (el) => {
        const e = getComputedStyle(el);
        return e.display !== 'none' && e.visibility !== 'hidden' && e.opacity !== '0';
    };
    const comoSeLlama = (el) => {
        const texto = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ');
        const etiqueta = el.tagName.toLowerCase();
        return texto ? `${etiqueta} «${texto.slice(0, 40)}»` : `${etiqueta}.${(el.className || '').toString().split(' ')[0]}`;
    };

    // ── 1. La pantalla se sale de ancho ───────────────────────────────────
    const anchoDoc = document.documentElement.scrollWidth;
    if (anchoDoc > anchoDelTelefono + 1) {
        const culpables = [...document.querySelectorAll('body *')]
            .filter((el) => visible(el) && el.getBoundingClientRect().right > anchoDelTelefono + 1)
            .filter((el, _i, todos) => !todos.some((otro) => otro !== el && otro.contains(el)))
            .slice(0, 2)
            .map(comoSeLlama);
        faltas.push({
            regla: 'ancho',
            detalle:
                `la pantalla mide ${anchoDoc} px y el teléfono ${anchoDelTelefono}` +
                (culpables.length ? ` — sobresale ${culpables.join(', ')}` : ''),
        });
    }

    // ── 2. Algo de dentro se arrastra de lado ─────────────────────────────
    // Se cuentan solo los de fuera: una tabla ancha suele ir metida en dos o
    // tres cajas que también se arrastran, y sin esto el mismo fallo salía
    // repetido tres veces con el mismo texto.
    const arrastrados = [];
    for (const el of document.querySelectorAll('*')) {
        if (!visible(el)) continue;
        const e = getComputedStyle(el);
        const seArrastra = e.overflowX === 'auto' || e.overflowX === 'scroll';
        if (!seArrastra) continue;
        if (el.scrollWidth <= el.clientWidth + 1) continue;
        if (el.clientWidth < 120) continue; // una pastilla de fichas no cuenta
        // Un carril puesto a propósito: el horario de hoy, que el dueño quiso
        // de lado, con las fichas asomando para que se vea que hay más.
        if (el.closest('[data-carril-a-proposito]')) continue;
        if (arrastrados.some((otro) => otro.contains(el))) continue;
        arrastrados.push(el);
    }
    for (const el of arrastrados.slice(0, 3)) {
        faltas.push({
            regla: 'arrastre',
            detalle: `hay que arrastrar ${el.scrollWidth - el.clientWidth} px en ${comoSeLlama(el)}`,
        });
    }

    // ── 3 y 4. Las bandas del sistema, tapadas ────────────────────────────
    /** ¿Hay algo opaco, fijo y de lado a lado cubriendo esta franja? */
    const estaTapada = (desde, hasta) => {
        for (const el of document.querySelectorAll('body *')) {
            if (!visible(el)) continue;
            const e = getComputedStyle(el);
            if (e.position !== 'fixed' && e.position !== 'sticky') continue;
            const fondo = e.backgroundColor;
            const alfa = fondo.startsWith('rgba') ? parseFloat(fondo.split(',')[3]) : fondo === 'transparent' ? 0 : 1;
            if (alfa < 0.85) continue;
            const r = el.getBoundingClientRect();
            // 98 % y no «de borde a borde»: cuando la pantalla se sale de
            // ancho, la cabecera mide lo que el cuerpo y no lo que la ventana
            // ensanchada, y sin esta holgura se daba por destapada una franja
            // que sí estaba tapada.
            if (r.left > 1 || r.right < anchoDelTelefono * 0.98) continue;
            if (r.top <= desde + 1 && r.bottom >= hasta - 1) return true;
        }
        return false;
    };

    /** Lo que se vería dentro de la franja si nadie la tapa. */
    const loQueAsomaEn = (desde, hasta) => {
        const dentro = [];
        for (const el of document.querySelectorAll('a,button,input,select,textarea,h1,h2,h3,h4,p,span,label,td,th,li,img,svg')) {
            if (!visible(el)) continue;
            if (!el.textContent?.trim() && !['IMG', 'SVG', 'INPUT'].includes(el.tagName)) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) continue;
            if (r.bottom <= desde || r.top >= hasta) continue;
            dentro.push(comoSeLlama(el));
            if (dentro.length >= 3) break;
        }
        return dentro;
    };

    if (!estaTapada(0, bandaArriba)) {
        const asoma = loQueAsomaEn(0, bandaArriba);
        if (asoma.length) {
            faltas.push({
                regla: 'banda-arriba',
                detalle: `el reloj y la batería tapan: ${asoma.join(', ')}`,
            });
        }
    }

    if (!estaTapada(altoDelTelefono - bandaAbajo, altoDelTelefono)) {
        const asoma = loQueAsomaEn(altoDelTelefono - bandaAbajo, altoDelTelefono);
        if (asoma.length) {
            faltas.push({
                regla: 'banda-abajo',
                detalle: `la barra de gestos tapa: ${asoma.join(', ')}`,
            });
        }
    }

    // ── 5. Lo que se pulsa, más pequeño que un dedo ───────────────────────
    const pequenos = [];
    for (const el of document.querySelectorAll('a[href],button,[role="button"],input[type="checkbox"],input[type="radio"],select')) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue; // escondido de verdad
        if (r.top > altoDelTelefono || r.bottom < 0) continue; // fuera de la vista
        if (r.height >= dedo && r.width >= dedo) continue;
        // Un enlace dentro de un párrafo no es un botón: se salta el texto corrido.
        if (el.tagName === 'A' && el.parentElement && /^(P|SPAN|LI|TD)$/.test(el.parentElement.tagName)) continue;
        pequenos.push(`${comoSeLlama(el)} mide ${Math.round(r.width)}×${Math.round(r.height)}`);
        if (pequenos.length >= 3) break;
    }
    if (pequenos.length) {
        faltas.push({ regla: 'dedo', detalle: pequenos.join('; ') });
    }

    // ── 6. Letra demasiado pequeña ────────────────────────────────────────
    const menudas = new Map();
    for (const el of document.querySelectorAll('p,span,td,th,li,label,a,button,div')) {
        if (!visible(el)) continue;
        const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
        if (!propio) continue;
        const tam = parseFloat(getComputedStyle(el).fontSize);
        if (isNaN(tam) || tam >= letra) continue;
        const r = el.getBoundingClientRect();
        if (r.top > altoDelTelefono || r.bottom < 0) continue;
        menudas.set(`${tam} px`, (menudas.get(`${tam} px`) || 0) + 1);
    }
    if (menudas.size) {
        const resumen = [...menudas.entries()].map(([t, n]) => `${n} a ${t}`).join(', ');
        faltas.push({ regla: 'letra', detalle: resumen });
    }

    return faltas;
};
