/**
 * LAS REGLAS DEL DISEÑO: CENTRADO Y ALINEACIÓN, MEDIDOS EN EL DOM
 *
 * Se ejecuta DENTRO del navegador (`page.evaluate`), como las reglas del
 * teléfono (`reglas-del-telefono.mjs`). Lo usan dos: el recorrido con fotos
 * (`recorrido-del-diseno.mjs`) y la prueba que se pone en rojo
 * (`tests/e2e/diseno-alineacion.spec.ts`). Un solo sitio, para que las dos
 * copias no se separen.
 *
 * No mira «si queda bonito»: mide lo que a ojo se ve torcido y nadie sabe decir
 * por qué.
 *
 *  modal-descentrado   Una ventana (diálogo) más cerca de un borde que del otro.
 *  modal-se-sale       Una ventana que se sale de la pantalla.
 *  ventana-sin-rol     Un velo con una ventana encima sin `role="dialog"`.
 *  cerrar-pequeno      La X de cerrar una ventana, por debajo de 44 px en táctil.
 *  cerrar-sin-nombre   Un botón de icono de una ventana sin nombre, o «Close».
 *  icono-descentrado   Un icono más alto o más bajo que el texto que acompaña.
 *  centro-torcido      Lo que se pidió centrado (círculo con icono, botón de
 *                      icono, `justify-center`) no está en el centro.
 *  relleno-desigual    Un botón o una etiqueta con más relleno a un lado.
 *  texto-cortado       Un texto que no cabe y se corta SIN puntos suspensivos.
 *  texto-con-puntos    Un texto que acaba en «…» y no dice en ningún sitio el
 *                      resto (sin `title` ni `aria-label`).
 *  encima              Dos textos pisándose.
 *  tarjetas-desiguales Tarjetas de la misma fila con alturas distintas.
 *  boton-partido       Un botón corto («Nuevo Ciclo») con el texto en dos líneas:
 *                      no cabe y se aplasta.
 *  ultima-fila-rota    Una rejilla de 3 columnas o más cuya última fila lleva
 *                      una sola tarjeta estirada o descolgada.
 */

export const QUE_SIGNIFICA_DISENO = {
    'modal-descentrado': 'Ventana descentrada',
    'modal-se-sale': 'Ventana que se sale de la pantalla',
    'icono-descentrado': 'Icono más alto o más bajo que su texto',
    'centro-torcido': 'Lo centrado no está en el centro',
    'relleno-desigual': 'Más relleno a un lado que al otro',
    'texto-cortado': 'Texto cortado sin «…»',
    'texto-con-puntos': 'Texto con «…» y sin el texto entero a mano',
    encima: 'Dos textos pisándose',
    'tarjetas-desiguales': 'Tarjetas de una fila con alturas distintas',
    'ultima-fila-rota': 'Rejilla con la última fila descolgada',
    'boton-partido': 'Botón con el texto partido en dos líneas',
    'ventana-sin-rol': 'Una ventana que no se anuncia como ventana (sin role="dialog")',
    'cerrar-pequeno': 'La X de cerrar una ventana, más pequeña que un dedo',
    'cerrar-sin-nombre': 'Un botón de icono de una ventana sin nombre (o en inglés)',
};

/** Tolerancia en píxeles: por debajo de esto el ojo no lo ve. */
export const TOLERANCIA = 2;

export const MEDIR_DISENO = ({ tolerancia = 2 } = {}) => {
    const faltas = [];
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;

    /**
     * LA VENTANA DE VERDAD
     *
     * `role="dialog"` no siempre está en la ventana. Headless UI lo pone en una caja
     * de 0 × 0 (`relative z-50`) cuyos hijos van `fixed`; otras ventanas lo ponen en
     * el velo que cubre la pantalla entera. En los dos casos la ventana que se ve es
     * un descendiente: el más grande que tenga fondo propio y no cubra la pantalla.
     * Va aquí dentro porque `page.evaluate` solo se lleva el texto de esta
     * función: lo que esté fuera no existe en el navegador.
     */
    const LA_VENTANA_DE_VERDAD = (dialogo) => {
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        const cuenta = (el) => {
            const s = getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return 0;
            const r = el.getBoundingClientRect();
            return r.width * r.height;
        };
        const cubre = (el) => {
            const r = el.getBoundingClientRect();
            return r.width >= vw - 1 && r.height >= vh - 1;
        };
        if (cuenta(dialogo) > 0 && !cubre(dialogo)) return dialogo;
        let mejor = null;
        let area = 0;
        const cola = [...dialogo.children].map((h) => [h, 1]);
        while (cola.length) {
            const [el, nivel] = cola.shift();
            const a = cuenta(el);
            const s = getComputedStyle(el);
            const conFondo = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
            if (a > area && conFondo && !cubre(el)) {
                mejor = el;
                area = a;
            }
            if (nivel < 6 && !mejor) for (const h of el.children) cola.push([h, nivel + 1]);
        }
        return mejor;
    };

    const visible = (el) => {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };
    const escondidoParaLectores = (el) => el.closest('.sr-only, [aria-hidden="true"]') && !el.matches('svg');
    // Lo que va pegado a la pantalla (la barra de abajo, la cabecera) se pinta
    // ENCIMA del contenido a propósito: no «pisa» a nadie.
    const pegadoALaPantalla = (el) => {
        for (let e = el; e && e !== document.body; e = e.parentElement) {
            const p = getComputedStyle(e).position;
            if (p === 'fixed' || p === 'sticky') return true;
        }
        return false;
    };
    // El trozo que ocupa el texto PROPIO de un elemento, sin sus hijos: un
    // `sr-only` dentro de una etiqueta está fuera de su sitio a propósito.
    const cajaDelTexto = (el) => {
        const rango = document.createRange();
        let caja = null;
        for (const n of el.childNodes) {
            if (n.nodeType !== 3 || !n.textContent.trim()) continue;
            rango.selectNodeContents(n);
            const r = rango.getBoundingClientRect();
            if (!r.width) continue;
            caja = caja
                ? { left: Math.min(caja.left, r.left), top: Math.min(caja.top, r.top), right: Math.max(caja.right, r.right), bottom: Math.max(caja.bottom, r.bottom) }
                : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }
        return caja;
    };
    const nombre = (el) =>
        String(el.getAttribute?.('aria-label') || el.innerText || el.getAttribute?.('title') || el.tagName)
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 50);
    const donde = (el) => {
        const partes = [];
        let e = el;
        for (let i = 0; e && i < 3; i++, e = e.parentElement) {
            let p = e.tagName.toLowerCase();
            const t = e.getAttribute('data-testid') || e.id;
            if (t) p += `#${t}`;
            partes.unshift(p);
        }
        return partes.join('>');
    };
    const anotar = (regla, el, detalle) => {
        // Una sola nota por regla y elemento parecido: la misma tarjeta repetida
        // treinta veces es UN fallo, no treinta.
        const clave = `${regla}|${nombre(el)}|${detalle}`;
        if (faltas.some((f) => f.clave === clave)) return;
        const r = el.getBoundingClientRect();
        faltas.push({
            clave,
            regla,
            que: nombre(el),
            donde: donde(el),
            detalle,
            caja: [Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.width), Math.round(r.height)],
        });
    };
    const todos = [...document.body.querySelectorAll('*')].filter(
        (el) => !(el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg') && visible(el)
    );

    // ── Ventanas que no dicen que lo son ─────────────────────────────────────
    // Un velo oscuro que tapa la pantalla con algo encima ES una ventana, se
    // declare o no. Sin `role="dialog"` el lector de pantalla no avisa de que se
    // abrió nada, y lo de detrás se sigue pudiendo recorrer con el teclado.
    for (const el of document.body.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (r.width < vw - 1 || r.height < vh - 1) continue;
        const velo = /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0?\.\d+\)/.test(s.backgroundColor) || s.backdropFilter !== 'none';
        if (!velo || !visible(el)) continue;
        if (el.closest('[role="dialog"], [role="alertdialog"]') || el.parentElement?.querySelector(':scope > [role="dialog"], :scope > [role="alertdialog"]')) continue;
        const dentro = [...el.parentElement.querySelectorAll('[role="dialog"], [role="alertdialog"]')].length;
        if (dentro) continue;
        anotar('ventana-sin-rol', el, 'un velo con una ventana encima, sin role="dialog"');
    }

    // ── Ventanas ─────────────────────────────────────────────────────────────
    for (const dialogo of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
        const d = LA_VENTANA_DE_VERDAD(dialogo);
        if (!d) continue;
        const r = d.getBoundingClientRect();
        for (const cerrar of dialogo.querySelectorAll('button')) {
            const nombreDelBoton = (cerrar.getAttribute('aria-label') || cerrar.innerText || '').trim();
            if (!/^(cerrar|close|×|x)$/i.test(nombreDelBoton) && !(cerrar.querySelector('svg') && !nombreDelBoton)) continue;
            if (!visible(cerrar)) continue;
            const rb = cerrar.getBoundingClientRect();
            if (rb.width > 60 || rb.height > 60) continue;
            if (!nombreDelBoton) anotar('cerrar-sin-nombre', cerrar, 'botón de icono sin nombre dentro de la ventana');
            else if (/^close$/i.test(nombreDelBoton)) anotar('cerrar-sin-nombre', cerrar, 'se llama «Close», en inglés');
            if (matchMedia('(pointer: coarse)').matches && (rb.width < 44 || rb.height < 44))
                anotar('cerrar-pequeno', cerrar, `${Math.round(rb.width)}×${Math.round(rb.height)} px`);
        }
        // Una hoja lateral (sheet) se pega a un borde a propósito.
        const pegadaAUnBorde = r.left <= 1 || vw - r.right <= 1;
        const izq = r.left;
        const der = vw - r.right;
        if (!pegadaAUnBorde && Math.abs(izq - der) > tolerancia)
            anotar('modal-descentrado', d, `${Math.round(izq)} px a la izquierda y ${Math.round(der)} a la derecha`);
        if (r.left < -1 || r.right > vw + 1)
            anotar('modal-se-sale', d, `ocupa de ${Math.round(r.left)} a ${Math.round(r.right)} en ${vw} px`);
        if (r.top < -1 || (r.bottom > vh + 1 && getComputedStyle(d).overflowY === 'visible'))
            anotar('modal-se-sale', d, `ocupa de ${Math.round(r.top)} a ${Math.round(r.bottom)} en ${vh} px de alto`);
    }

    // ── Iconos al lado de un texto ───────────────────────────────────────────
    const primeraLineaDelTexto = (padre, icono) => {
        const rango = document.createRange();
        const caminante = document.createTreeWalker(padre, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = caminante.nextNode())) {
            if (!n.textContent.trim()) continue;
            if (icono.contains(n)) continue;
            const el = n.parentElement;
            if (!el || !visible(el) || el.closest('.sr-only')) continue;
            rango.selectNodeContents(n);
            const rects = [...rango.getClientRects()].filter((x) => x.width > 0);
            // Todo el bloque de texto, no la primera línea: si el texto se
            // parte en dos, el icono centrado se compara con las dos (y el
            // botón partido se anota aparte, en «boton-partido»).
            if (rects.length) {
                const t = Math.min(...rects.map((x) => x.top));
                const b = Math.max(...rects.map((x) => x.bottom));
                return { rect: { top: t, bottom: b, height: b - t }, el };
            }
        }
        return null;
    };
    for (const svg of document.querySelectorAll('svg')) {
        if (!visible(svg)) continue;
        const ri = svg.getBoundingClientRect();
        if (ri.width > 32 || ri.height > 32 || ri.width < 8) continue;
        const padre = svg.parentElement;
        if (!padre) continue;
        const ps = getComputedStyle(padre);
        if (!/flex/.test(ps.display)) continue;
        if (ps.flexDirection.startsWith('column')) continue;
        // Solo el icono que va en la MISMA fila que un texto corto (botón, enlace,
        // etiqueta, elemento de menú): el que acompaña un párrafo largo se alinea
        // a propósito con la primera línea.
        const linea = primeraLineaDelTexto(padre, svg);
        if (!linea) continue;
        const rt = linea.rect;
        if (rt.bottom < ri.top || rt.top > ri.bottom) continue; // en otra fila
        if (padre.getBoundingClientRect().height > 64) continue;
        const cIcono = ri.top + ri.height / 2;
        const cTexto = rt.top + rt.height / 2;
        const dif = cIcono - cTexto;
        if (Math.abs(dif) > tolerancia)
            anotar(
                'icono-descentrado',
                padre,
                `icono ${Math.abs(dif).toFixed(1)} px ${dif > 0 ? 'más bajo' : 'más alto'} que «${linea.el.innerText
                    .trim()
                    .slice(0, 24)}»`
            );
    }

    // ── Botones partidos en dos líneas ───────────────────────────────────────
    for (const b of document.querySelectorAll('button, a[role="button"], a[class*="rounded"]')) {
        if (!visible(b) || escondidoParaLectores(b)) continue;
        const texto = (b.innerText || '').trim();
        if (!texto || texto.length > 28 || texto.includes('\n')) continue;
        const rango = document.createRange();
        const altos = [];
        const caminante = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = caminante.nextNode())) {
            if (!n.textContent.trim() || n.parentElement?.closest('.sr-only')) continue;
            rango.selectNodeContents(n);
            for (const x of rango.getClientRects()) if (x.width > 2) altos.push(x.top);
        }
        altos.sort((a, c) => a - c);
        const lineas = { size: altos.length ? 1 + altos.slice(1).filter((t, i) => t - altos[i] > 8).length : 0 };
        if (lineas.size > 1) anotar('boton-partido', b, `«${texto}» ocupa ${lineas.size} líneas`);
    }

    // ── Lo que se pidió centrado ─────────────────────────────────────────────
    for (const el of todos) {
        if (escondidoParaLectores(el)) continue;
        const s = getComputedStyle(el);
        if (!/flex|grid/.test(s.display)) continue;
        const centradoH = s.justifyContent === 'center' || s.placeContent?.includes('center');
        const centradoV = s.alignItems === 'center';
        if (!centradoH && !centradoV) continue;
        const hijos = [...el.children].filter((h) => visible(h) && getComputedStyle(h).position !== 'absolute' && getComputedStyle(h).position !== 'fixed');
        if (!hijos.length || hijos.length > 3) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 200 && r.height > 120) continue; // solo cajas pequeñas: iconos, avatares, botones
        const caja = hijos.reduce(
            (a, h) => {
                const x = h.getBoundingClientRect();
                return { l: Math.min(a.l, x.left), t: Math.min(a.t, x.top), r: Math.max(a.r, x.right), b: Math.max(a.b, x.bottom) };
            },
            { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity }
        );
        const bl = parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
        const br = parseFloat(s.borderRightWidth) + parseFloat(s.paddingRight);
        const bt = parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop);
        const bb = parseFloat(s.borderBottomWidth) + parseFloat(s.paddingBottom);
        const cx = (r.left + bl + r.right - br) / 2;
        const cy = (r.top + bt + r.bottom - bb) / 2;
        const dx = (caja.l + caja.r) / 2 - cx;
        const dy = (caja.t + caja.b) / 2 - cy;
        // Si el contenido se sale de la caja, «centrado» no significa nada.
        if (caja.r - caja.l > r.width + 1 || caja.b - caja.t > r.height + 1) continue;
        if (centradoH && Math.abs(dx) > tolerancia && s.flexDirection !== 'column')
            anotar('centro-torcido', el, `${Math.abs(dx).toFixed(1)} px a la ${dx > 0 ? 'derecha' : 'izquierda'}`);
        if (centradoV && Math.abs(dy) > tolerancia && !s.flexDirection.startsWith('column'))
            anotar('centro-torcido', el, `${Math.abs(dy).toFixed(1)} px ${dy > 0 ? 'abajo' : 'arriba'}`);
    }

    // ── Relleno desigual en botones y etiquetas ──────────────────────────────
    for (const el of document.querySelectorAll('button, a[class*="px-"], [class*="rounded-full"][class*="px-"]')) {
        if (!visible(el) || escondidoParaLectores(el)) continue;
        const s = getComputedStyle(el);
        const pl = parseFloat(s.paddingLeft);
        const pr = parseFloat(s.paddingRight);
        const pt = parseFloat(s.paddingTop);
        const pb = parseFloat(s.paddingBottom);
        if (Math.abs(pl - pr) > tolerancia && s.textAlign !== 'left' && s.justifyContent !== 'space-between' && s.justifyContent !== 'flex-start' && s.justifyContent !== 'normal')
            anotar('relleno-desigual', el, `${pl} px a la izquierda y ${pr} a la derecha`);
        if (Math.abs(pt - pb) > tolerancia) anotar('relleno-desigual', el, `${pt} px arriba y ${pb} abajo`);
    }

    // ── Textos cortados ──────────────────────────────────────────────────────
    for (const el of todos) {
        if (escondidoParaLectores(el)) continue;
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const s = getComputedStyle(el);
        const cortaX = /hidden|clip/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1;
        const cortaY =
            (/hidden|clip/.test(s.overflowY) || s.webkitLineClamp !== 'none') && el.scrollHeight > el.clientHeight + 2;
        if (!cortaX && !cortaY) continue;
        const conPuntos = s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none');
        const dicho =
            el.closest('[title]')?.getAttribute('title') ||
            el.closest('[aria-label]')?.getAttribute('aria-label') ||
            el.closest('[aria-describedby]');
        if (!conPuntos) anotar('texto-cortado', el, `caben ${el.clientWidth}×${el.clientHeight} de ${el.scrollWidth}×${el.scrollHeight}`);
        else if (!dicho) anotar('texto-con-puntos', el, `se ve «${el.innerText.trim().slice(0, 30)}…» y no hay title`);
    }

    // ── Textos pisándose ─────────────────────────────────────────────────────
    const hojas = todos
        .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !escondidoParaLectores(el))
        .filter((el) => !pegadoALaPantalla(el) && !el.closest('[role="dialog"], [role="tooltip"], [role="menu"], [role="listbox"]'))
        .slice(0, 600);
    const rects = hojas.map(cajaDelTexto);
    for (let i = 0; i < hojas.length; i++) {
        for (let j = i + 1; j < hojas.length; j++) {
            if (hojas[i].contains(hojas[j]) || hojas[j].contains(hojas[i])) continue;
            const a = rects[i];
            const b = rects[j];
            if (!a || !b) continue;
            const ancho = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const alto = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ancho > 4 && alto > 4) {
                // Solo si los dos se pintan: si uno está debajo de algo opaco no
                // se pisan a la vista.
                const x = Math.max(a.left, b.left) + ancho / 2;
                const y = Math.max(a.top, b.top) + alto / 2;
                if (x < 0 || y < 0 || x > vw || y > vh) continue;
                const arriba = document.elementFromPoint(x, y);
                if (arriba && (hojas[i].contains(arriba) || hojas[j].contains(arriba) || arriba.contains(hojas[i]) || arriba.contains(hojas[j])))
                    anotar('encima', hojas[i], `pisa a «${hojas[j].innerText.trim().slice(0, 24)}»`);
            }
        }
    }

    // ── Rejillas: tarjetas de una fila y la última fila ──────────────────────
    const esTarjeta = (el) => {
        const s = getComputedStyle(el);
        return (
            parseFloat(s.borderTopWidth) > 0 ||
            (s.boxShadow && s.boxShadow !== 'none') ||
            (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(s.borderRadius) > 4)
        );
    };
    for (const el of todos) {
        const s = getComputedStyle(el);
        if (s.display !== 'grid') continue;
        const columnas = s.gridTemplateColumns.split(' ').filter(Boolean).length;
        if (columnas < 2) continue;
        const hijos = [...el.children].filter(visible);
        if (hijos.length < 2) continue;
        const filas = new Map();
        for (const h of hijos) {
            const t = Math.round(h.getBoundingClientRect().top);
            if (!filas.has(t)) filas.set(t, []);
            filas.get(t).push(h);
        }
        for (const fila of filas.values()) {
            if (fila.length < 2 || !fila.every(esTarjeta)) continue;
            const altos = fila.map((h) => Math.round(h.getBoundingClientRect().height));
            if (Math.max(...altos) - Math.min(...altos) > tolerancia)
                anotar('tarjetas-desiguales', el, `alturas ${[...new Set(altos)].join(', ')} px en una fila de ${fila.length}`);
        }
        const ultima = [...filas.values()].pop();
        if (columnas >= 3 && filas.size > 1 && ultima.length === 1 && hijos.length % columnas === 1 && ultima.every(esTarjeta))
            anotar('ultima-fila-rota', el, `${hijos.length} tarjetas en ${columnas} columnas: la última va sola`);
    }

    return faltas.map(({ clave, ...f }) => f);
};

/**
 * Lo que se anota de cada pantalla para compararlas entre sí: el mismo título
 * con cuatro tamaños es incoherencia aunque cada pantalla, sola, esté bien.
 */
export const FICHA_DE_LA_PANTALLA = () => {
    const main = document.querySelector('main') || document.body;
    const h1 = main.querySelector('h1');
    const caja = (el) => (el ? el.getBoundingClientRect() : null);
    const s = h1 ? getComputedStyle(h1) : null;
    const contenedor = main.firstElementChild;
    const rc = caja(contenedor);
    const rm = caja(main);
    const r1 = caja(h1);
    return {
        titulo: h1?.innerText?.trim().slice(0, 60) || null,
        tituloLetra: s ? `${s.fontSize}/${s.fontWeight}` : null,
        tituloIzquierda: r1 && rm ? Math.round(r1.left - rm.left) : null,
        tituloArriba: r1 && rm ? Math.round(r1.top - rm.top) : null,
        margenIzquierda: rc && rm ? Math.round(rc.left - rm.left) : null,
        margenDerecha: rc && rm ? Math.round(rm.right - rc.right) : null,
        botones: [...main.querySelectorAll('button')]
            .filter((b) => b.offsetParent)
            .slice(0, 40)
            .map((b) => {
                const bs = getComputedStyle(b);
                return `${Math.round(b.getBoundingClientRect().height)}|${bs.borderRadius}|${bs.fontSize}`;
            }),
    };
};
