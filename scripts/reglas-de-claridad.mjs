/**
 * ¿SABE LA PERSONA QUÉ HACE CADA COSA? (2026-10-01)
 *
 *   npm run movil -- --claridad      (deja docs/capturas-movil/claridad.json)
 *
 * Cristian pidió «un escaneo a fondo de la UI/UX, que sea más intuitivo, que
 * el usuario sepa qué hace cada cosa». Las seis reglas del teléfono miden si
 * se VE bien; estas miden si se ENTIENDE, con las reglas de la skill
 * `ui-ux-pro-max` (`.claude/skills/ui-ux-pro-max/references/quick-reference.md`)
 * que se pueden comprobar en el DOM:
 *
 *   para-que      La pantalla dice para qué sirve (título + una línea debajo).
 *   sin-nombre    Algo que se pulsa no dice qué hace, ni a la vista ni al lector
 *                 de pantalla (`aria-labels`, `icon-context`).
 *   solo-icono    Botón de solo icono. Con ratón sale su globo; con el DEDO no
 *                 hay globo: es una adivinanza si el icono no es evidente
 *                 (`hover-vs-tap`, `gesture-alternative`).
 *   sin-etiqueta  Un campo sin etiqueta visible: solo el texto de muestra, que
 *                 se borra al escribir (`input-labels`, `form-labels`).
 *   vacio-mudo    Un «No hay…» sin un botón que diga qué hacer
 *                 (`empty-states`, `empty-data-state`).
 *   ingles        Palabras en inglés en una app en castellano.
 *   cortado       Texto cortado con «…» sin forma de leerlo entero
 *                 (`truncation-strategy`).
 *   muchos-primarios  Más de un botón principal a la vista (`primary-action`).
 *
 * Mide lo que se puede medir; lo demás (¿se entiende el flujo?) se mira en las
 * fotos y se apunta en `docs/UI-UX-ESCANEO.md`.
 */

export const QUE_SIGNIFICA_CLARIDAD = {
    'para-que': 'La pantalla no dice para qué sirve debajo del título',
    'sin-nombre': 'Algo que se pulsa no dice qué hace',
    'solo-icono': 'Botón de solo icono: en el teléfono no sale globo',
    'sin-etiqueta': 'Campo sin etiqueta visible (solo el texto de muestra)',
    'vacio-mudo': '«No hay…» sin un botón que diga qué hacer',
    ingles: 'Palabras en inglés',
    cortado: 'Texto cortado sin forma de leerlo entero',
    'muchos-primarios': 'Más de un botón principal a la vista',
};

/** Se ejecuta EN la página. Devuelve las faltas con el texto del culpable. */
export const MEDIR_CLARIDAD = () => {
    const faltas = [];
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
    };
    const texto = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    const nombre = (el) => {
        const aria = el.getAttribute('aria-label');
        if (aria && aria.trim()) return aria.trim();
        const por = el.getAttribute('aria-labelledby');
        if (por) {
            const t = por
                .split(/\s+/)
                .map((id) => document.getElementById(id))
                .filter(Boolean)
                .map(texto)
                .join(' ');
            if (t) return t;
        }
        const t = texto(el);
        if (t) return t;
        const titulo = el.getAttribute('title');
        if (titulo && titulo.trim()) return titulo.trim();
        const img = el.querySelector('img[alt]');
        if (img && img.alt.trim()) return img.alt.trim();
        return '';
    };
    const donde = (el) => {
        const cerca = el.closest('section, article, li, tr, [role="dialog"], header, form, nav') || el.parentElement;
        return texto(cerca || el).slice(0, 60);
    };
    const principal = document.querySelector('main') || document.body;
    // La barra de abajo y el menú son del armazón: se miran una vez, no en cada pantalla.
    const delArmazon = (el) => Boolean(el.closest('nav, aside, [data-armazon]'));

    // para-que
    const h1 = principal.querySelector('h1');
    if (h1) {
        const cabecera = h1.closest('header') || h1.parentElement?.parentElement;
        const linea = cabecera ? [...cabecera.querySelectorAll('p')].find((p) => texto(p).length > 8 && visible(p)) : null;
        if (!linea) faltas.push({ regla: 'para-que', detalle: `«${texto(h1).slice(0, 50)}» sin una línea que diga para qué sirve` });
    } else {
        faltas.push({ regla: 'para-que', detalle: 'la pantalla no tiene título (h1)' });
    }

    // sin-nombre y solo-icono
    const pulsables = [...principal.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="switch"], [role="checkbox"]')].filter(
        (el) => visible(el) && !delArmazon(el)
    );
    const soloIcono = [];
    for (const el of pulsables) {
        const n = nombre(el);
        if (!n) {
            faltas.push({ regla: 'sin-nombre', detalle: `${el.tagName.toLowerCase()} en «${donde(el)}»` });
            continue;
        }
        // Una casilla dentro de su <label> con texto se entiende: el texto es suyo.
        const conEtiqueta = el.closest('label') && texto(el.closest('label'));
        if (!texto(el) && el.querySelector('svg') && !conEtiqueta) soloIcono.push(n);
    }
    if (soloIcono.length) {
        const unicos = [...new Set(soloIcono)];
        faltas.push({ regla: 'solo-icono', detalle: `${soloIcono.length}: ${unicos.slice(0, 12).join(', ')}${unicos.length > 12 ? '…' : ''}` });
    }

    // sin-etiqueta
    for (const campo of principal.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')) {
        if (!visible(campo)) continue;
        const id = campo.id;
        const conLabel =
            (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
            campo.closest('label') ||
            campo.getAttribute('aria-labelledby');
        // Un buscador con lupa y aria-label se entiende sin etiqueta encima.
        const buscador = campo.type === 'search' || /buscar/i.test(campo.getAttribute('placeholder') || '');
        if (!conLabel && !buscador) {
            const muestra = campo.getAttribute('placeholder') || campo.getAttribute('aria-label') || campo.name || campo.tagName;
            faltas.push({ regla: 'sin-etiqueta', detalle: `«${String(muestra).slice(0, 40)}» en «${donde(campo)}»` });
        }
    }

    // vacio-mudo
    const vacios = [...principal.querySelectorAll('p, span, div, td')].filter(
        (el) => el.children.length === 0 && visible(el) && /^(no hay|sin |todav[ií]a no|a[uú]n no|ning[uú]n)/i.test(texto(el))
    );
    for (const el of vacios.slice(0, 8)) {
        const caja = el.closest('section, article, [class*="rounded"], li, td') || el.parentElement;
        const hayBoton = caja && [...caja.querySelectorAll('button, a[href]')].some(visible);
        if (!hayBoton) faltas.push({ regla: 'vacio-mudo', detalle: `«${texto(el).slice(0, 70)}»` });
    }

    // ingles
    const INGLES = /\b(Loading|Save|Cancel|Submit|Delete|Edit|Search|Settings|Dashboard|Upload|Download|No data|Error|Success|Next|Previous|Back|Close|Select|Add new|Update|Remove|Profile|Logout|Sign in|Sign out)\b/;
    const vistos = new Set();
    for (const el of principal.querySelectorAll('button, a, h1, h2, h3, label, p, span, th')) {
        if (el.children.length > 1 || !visible(el)) continue;
        const t = texto(el);
        const m = t.match(INGLES);
        if (m && t.length < 80 && !vistos.has(t)) {
            vistos.add(t);
            faltas.push({ regla: 'ingles', detalle: `«${t.slice(0, 60)}»` });
        }
    }

    // cortado
    for (const el of principal.querySelectorAll('*')) {
        if (el.children.length > 0 || !visible(el)) continue;
        const s = getComputedStyle(el);
        const corta = s.textOverflow === 'ellipsis' || Number(s.webkitLineClamp) > 0;
        if (!corta || el.scrollWidth <= el.clientWidth + 1) continue;
        const legible = el.getAttribute('title') || el.closest('[title]') || el.closest('[aria-label]');
        if (!legible) faltas.push({ regla: 'cortado', detalle: `«${texto(el).slice(0, 50)}»` });
        if (faltas.filter((f) => f.regla === 'cortado').length >= 6) break;
    }

    // muchos-primarios: el color del botón principal de la app.
    const primarios = pulsables.filter((el) => {
        if (el.tagName === 'A' && !/rounded/.test(el.className)) return false;
        const fondo = getComputedStyle(el).backgroundColor;
        const m = fondo.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return false;
        const [r, g, b] = m.slice(1).map(Number);
        // Índigo/violeta lleno (el «solido» de la app).
        return b > 150 && r < 130 && g < 110;
    });
    if (primarios.length > 2) {
        faltas.push({ regla: 'muchos-primarios', detalle: `${primarios.length}: ${primarios.slice(0, 6).map(nombre).join(', ')}` });
    }

    return faltas;
};
