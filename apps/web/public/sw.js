/**
 * EL AYUDANTE: QUE LA APP ABRA SIN SEÑAL
 *
 * Hace dos cosas, y la segunda es nueva.
 *
 * 1. Sin uno de estos, el navegador NO ofrece «instalar aplicación»: es uno de
 *    los tres requisitos, con la ficha (`manifest.webmanifest`) y los iconos.
 *
 * 2. **Guarda la app, para que abra sin internet.** Antes no guardaba nada y
 *    sin señal solo se veía una pantalla de «no hay conexión». Ahora se guarda
 *    la propia aplicación —la página y sus archivos— y al abrirla sin señal
 *    arranca igual y enseña lo último que se descargó, que vive en la memoria
 *    del teléfono (`lib/lo-guardado-en-el-telefono.ts`).
 *
 * ─── LO QUE SIGUE SIN GUARDARSE AQUÍ, A PROPÓSITO ───────────────────────────
 *
 * **Las respuestas del servidor no pasan por este archivo.** Todo lo que empieza
 * por `/api/` va a la red y punto. El motivo no es técnico: lo que guarda un
 * ayudante de estos es del NAVEGADOR, no de la persona. En un teléfono que se
 * presta, o en un ordenador del liceo, el siguiente que entrara vería las notas
 * del anterior servidas desde aquí.
 *
 * Los datos se guardan en el otro sitio, donde la llave lleva el liceo y la
 * cédula de quien los descargó, y se borran al cerrar sesión.
 *
 * Aquí solo vive la CÁSCARA: la página, el javascript y los estilos, que son
 * iguales para todo el mundo y no dicen nada de nadie.
 */

/**
 * EN DESARROLLO TAMBIÉN, PERO SIN GUARDAR NADA VIEJO POR DELANTE
 *
 * Este ayudante solo se registraba en producción, y probando en un teléfono
 * contra el servidor de desarrollo pasaba lo peor: se apagaba el PC y el
 * teléfono no enseñaba NADA, ni siquiera lo que acababa de ver. Ahora se
 * registra también en desarrollo (`?modo=desarrollo`), y ahí TODO va primero a
 * la red: con el servidor encendido se ve siempre el código recién cambiado, y
 * solo si no contesta se tira de lo guardado.
 */
const EN_DESARROLLO = new URL(self.location.href).searchParams.get('modo') === 'desarrollo';

// v3 (2026-09-30): las cajas de antes guardaban páginas de compilaciones cuyo
// código ya no estaba, y sin señal se abrían en blanco. Se empieza de cero.
const VERSION = 'gestiedu-v3';
const CASCARA = `${VERSION}-${EN_DESARROLLO ? 'desarrollo' : 'cascara'}`;
const SIN_CONEXION = '/sin-conexion.html';

/** Lo que se guarda al instalar, para que la primera vez sin señal ya funcione. */
const DE_ENTRADA = [SIN_CONEXION, '/icons/icono-192.png', '/icons/icono-512.png'];

self.addEventListener('install', (evento) => {
    evento.waitUntil(
        caches
            .open(CASCARA)
            // Si alguno falla (un icono que se renombró), no se cae la
            // instalación entera: se guarda lo que haya.
            .then((cache) => Promise.allSettled(DE_ENTRADA.map((d) => cache.add(d))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (evento) => {
    evento.waitUntil(
        caches
            .keys()
            .then((nombres) => Promise.all(nombres.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))))
            .then(() => self.clients.claim())
            .then(() => mirarLaVersion().catch(() => {}))
    );
});

/** ¿Esto es un dato del liceo? Entonces no se guarda. */
function esDelServidor(url) {
    return url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/');
}

/** Los archivos con el nombre marcado por el compilador: nunca cambian. */
function esUnArchivoFijo(url) {
    return (
        url.pathname.startsWith('/_next/static/') ||
        url.pathname.startsWith('/icons/') ||
        /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)
    );
}

/**
 * UN TOPE PARA LO GUARDADO
 *
 * Cada versión nueva de la app trae sus archivos con otro nombre (el
 * compilador les pone la huella), así que los de la versión anterior ya no
 * los pide nadie. Pero se quedaban guardados para siempre: publicación tras
 * publicación, el teléfono iba llenándose de versiones viejas de la app. Al
 * pasar del tope se tiran los más antiguos (el orden de guardado es el de
 * `keys()`), que son los de versiones anteriores.
 */
// Con la precarga (`lib/precarga.ts`) el admin guarda TODAS sus pantallas
// —una ficha por alumno: 600 y pico—, así que el tope es para lo que sobra
// de versiones viejas, no para lo que se usa.
const TOPE_DE_ARCHIVOS = 6000;
let recortando = false;

/** Lo que nunca se tira al recortar: lo de entrada y la marca de la versión. */
function esFijo(url, fijos) {
    return fijos.has(url) || new URL(url).pathname.startsWith('/__');
}

async function recortar(cache) {
    if (recortando) return;
    recortando = true;
    try {
        const claves = await cache.keys();
        const sobran = claves.length - TOPE_DE_ARCHIVOS;
        if (sobran <= 0) return;
        const fijos = new Set(DE_ENTRADA.map((d) => new URL(d, self.location.origin).href));
        // Los archivos de la versión que se está usando tampoco: sin ellos,
        // una pantalla guardada no arranca.
        const deLaVersion = new Set(((await laVersionGuardada()) || { archivos: [] }).archivos.map((a) => new URL(a, self.location.origin).href));
        for (let i = 0, quitados = 0; i < claves.length && quitados < sobran; i++) {
            if (esFijo(claves[i].url, fijos) || deLaVersion.has(claves[i].url)) continue;
            await cache.delete(claves[i]);
            quitados++;
        }
    } finally {
        recortando = false;
    }
}

async function guardar(peticion, respuesta) {
    // Solo lo que salió bien y viene de aquí. Una respuesta parcial (206) o un
    // error guardado se devolverían luego como si fueran buenos.
    if (!respuesta || !respuesta.ok || respuesta.type === 'opaque') return respuesta;
    const cache = await caches.open(CASCARA);
    await cache.put(peticion, respuesta.clone());
    recortar(cache).catch(() => {});
    return respuesta;
}

/**
 * Primero la red; si no hay, lo guardado. Para páginas y para datos de pantalla.
 *
 * «No hay red» es también el repartidor diciendo que detrás no hay nadie (502,
 * 503, 504): el servidor del liceo está caído aunque su puerta conteste. Se
 * devolvía esa página de error tal cual, teniendo la de verdad guardada.
 */
/**
 * UNA RED QUE SE CUELGA NO ES UNA RED
 *
 * Sin tope, una página esperaba a la red lo que tardara el navegador en
 * rendirse (a veces más de un minuto) con la pantalla en blanco: lo que pasa
 * con una señal que va y viene. Pasado `TOPE_DE_LA_RED_MS`, si la página está
 * guardada se enseña esa; la de la red, si llega, se guarda para la próxima.
 * Si no hay nada guardado, se sigue esperando: mejor tarde que nada.
 * En desarrollo no: la primera compilación de una pantalla tarda más que eso.
 */
const TOPE_DE_LA_RED_MS = 6000;

/**
 * Una página se busca solo por su dirección: la guardada pudo traerse con
 * otras cabeceras (ver `guardarLaPagina`). Y si no está esa dirección exacta,
 * la misma pantalla con otra `?` (la clase de otro día): la pantalla lee la `?`
 * y pinta lo suyo con los datos guardados. Un trozo de Next (`?_rsc=`) no:
 * depende de lo que ya había en pantalla, y uno que no encaje rompe la
 * navegación; sin él, Next carga la página entera.
 */
async function buscarGuardada(peticion) {
    if (peticion.mode !== 'navigate') return buscar(peticion);
    return buscarPagina(peticion.url);
}

/**
 * La página de esa dirección; si no está exacta, la misma sin la `?`. Y solo
 * una PÁGINA (HTML): sin la `?`, `/dashboard` también encaja con los trozos
 * `/dashboard?_rsc=…` de Next, y servir uno de esos como página la rompe.
 */
async function buscarPagina(direccion) {
    const exacta = await buscar(direccion, { ignoreVary: true });
    if (exacta) return exacta;
    const nombres = await caches.keys();
    for (const nombre of [CASCARA, ...nombres.filter((n) => n !== CASCARA && n.startsWith('gestiedu-'))]) {
        const todas = await (await caches.open(nombre)).matchAll(direccion, { ignoreVary: true, ignoreSearch: true });
        const pagina = todas.find((r) => (r.headers.get('content-type') || '').includes('text/html'));
        if (pagina) return pagina;
    }
    return laPlantilla(direccion);
}

/**
 * UNA FICHA GUARDADA VALE PARA TODAS (la plantilla de la ruta)
 *
 * `/dashboard/usuarios/12345678` y `/dashboard/usuarios/87654321` son la
 * MISMA página: todo lo de esa persona llega después por `useQuery`, y lo
 * guardado de cada lectura está en el teléfono (`respuestas-guardadas`). Lo
 * único que cambia en el HTML es el trozo de la dirección: Next lo lleva
 * dentro (`useParams`), así que se sirve la de otra persona con ese trozo
 * cambiado. Sin esto, había que guardar 600 fichas iguales, una por alumno.
 *
 * Solo dentro del panel, con el mismo número de trozos, los fijos iguales y
 * los distintos con cara de identificador (6 o más, con un número o un guion).
 */
// Con algún número (cédula, cuid) o un guion (`materia-quim`, `2026-2027-1-a`):
// «profesor» y «seccion», «cierre» y «matricula» no son ids.
const PARECE_UN_ID = /^(?=[A-Za-z0-9_-]*[\d-])[A-Za-z0-9_-]{6,}$/;

async function laPlantilla(direccion) {
    const destino = new URL(direccion);
    if (!destino.pathname.startsWith('/dashboard/')) return undefined;
    const trozos = destino.pathname.split('/');
    const cache = await caches.open(CASCARA);
    for (const peticion of await cache.keys()) {
        const url = new URL(peticion.url);
        if (url.searchParams.has('_rsc') || url.pathname === destino.pathname) continue;
        const suyos = url.pathname.split('/');
        if (suyos.length !== trozos.length) continue;
        const cambios = [];
        let encaja = true;
        for (let i = 0; i < trozos.length && encaja; i++) {
            if (suyos[i] === trozos[i]) continue;
            if (i < 3 || !PARECE_UN_ID.test(suyos[i]) || !PARECE_UN_ID.test(trozos[i])) encaja = false;
            else cambios.push([suyos[i], trozos[i]]);
        }
        if (!encaja || !cambios.length) continue;
        const respuesta = await cache.match(peticion, { ignoreVary: true });
        if (!respuesta || !(respuesta.headers.get('content-type') || '').includes('text/html')) continue;
        let html = await respuesta.text();
        for (const [viejo, nuevo] of cambios) html = html.split(viejo).join(nuevo);
        const cabeceras = new Headers(respuesta.headers);
        cabeceras.delete('content-length');
        cabeceras.set('x-plantilla-de', url.pathname);
        return new Response(html, { status: 200, headers: cabeceras });
    }
    return undefined;
}

/**
 * PRIMERO EN LO SUYO
 *
 * `caches.match` a secas mira en TODAS las cajas, en el orden en que se
 * crearon. En el teléfono de Cristian había dos —la de la app compilada y la
 * de desarrollo— y se servía la página vieja de la otra caja, sin el guardián
 * del arranque: blanco (2026-09-30). Se mira primero en la caja de este modo.
 */
async function buscar(peticion, opciones) {
    const propia = await (await caches.open(CASCARA)).match(peticion, opciones);
    return propia || caches.match(peticion, opciones);
}

/**
 * SIN CONEXIÓN, LA PUERTA LLEVA AL PANEL
 *
 * La APK (y el icono de la app) abren por la pantalla de entrar. Sin
 * conexión se servía la copia guardada de esa pantalla, que puede ser de una
 * compilación anterior cuyo código ya no está: medido en el teléfono de
 * Cristian (2026-09-30), la app se quedaba en blanco al abrirla fuera de
 * casa. Con el panel guardado —que solo lo está con la sesión abierta: se
 * borra al cerrarla—, la puerta lleva directo ahí, como abrir WhatsApp.
 */
const LA_PUERTA = /^\/($|login\/?$|instituto\/[^/]+\/?(login\/?)?$)/;

async function loGuardadoDeEstaPagina(peticion) {
    if (peticion.mode === 'navigate' && LA_PUERTA.test(new URL(peticion.url).pathname)) {
        if (await buscarPagina(new URL('/dashboard', self.location.origin).href)) return Response.redirect('/dashboard', 302);
    }
    return buscarGuardada(peticion);
}

/**
 * UNA PANTALLA SIN GUARDAR NO SACA A NADIE DE LA APP
 *
 * Tocar sin conexión algo que aún no se ha guardado llevaba a la pantalla de
 * «No hay conexión», fuera de la app (Cristian: «yo no quiero esto»). Ahora
 * se vuelve a la pantalla de la que se venía —o al panel— con `?sin-guardar=`,
 * y la app lo dice con un aviso pequeño (`AvisoDePantallaSinGuardar`).
 */
async function volverADondeEstaba(peticion) {
    const destino = new URL(peticion.url);
    const candidatas = [];
    if (peticion.referrer) {
        const antes = new URL(peticion.referrer);
        if (antes.origin === self.location.origin && antes.pathname !== destino.pathname) candidatas.push(antes);
    }
    candidatas.push(new URL('/dashboard', self.location.origin));
    for (const u of candidatas) {
        if (!(await buscarPagina(u.href))) continue;
        u.searchParams.delete('sin-guardar');
        u.searchParams.set('sin-guardar', destino.pathname);
        return Response.redirect(u.href, 302);
    }
    return null;
}

async function laRedYSiNoLoGuardado(peticion) {
    try {
        const deLaRed = fetch(peticion).then((respuesta) => {
            if (respuesta.status >= 502 && respuesta.status <= 504) throw new Error('sin servidor');
            return guardar(peticion, respuesta);
        });
        if (EN_DESARROLLO || peticion.mode !== 'navigate') return await deLaRed;
        deLaRed.catch(() => {});
        const loGuardadoSiTarda = new Promise((resolver) => setTimeout(resolver, TOPE_DE_LA_RED_MS))
            .then(() => loGuardadoDeEstaPagina(peticion))
            .then((guardada) => guardada || deLaRed);
        return await Promise.race([deLaRed, loGuardadoSiTarda]);
    } catch {
        const guardada = await loGuardadoDeEstaPagina(peticion);
        if (guardada) return guardada;

        // Una página que nunca se abrió no se puede inventar. Se vuelve a
        // donde se estaba, con un aviso pequeño; y si no hay de dónde, la
        // pantalla de «no hay conexión».
        if (peticion.mode === 'navigate') {
            const volver = await volverADondeEstaba(peticion);
            if (volver) return volver;
            const apagada = await buscar(SIN_CONEXION);
            if (apagada) return apagada;
        }
        return new Response('Sin conexión', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}

/** Lo guardado primero: estos archivos llevan su versión en el nombre. */
async function loGuardadoYSiNoLaRed(peticion) {
    const guardada = await buscar(peticion);
    if (guardada) return guardada;
    try {
        return await guardar(peticion, await fetch(peticion));
    } catch {
        return new Response('', { status: 504 });
    }
}

/**
 * GUARDAR LA PÁGINA QUE SE ESTÁ VIENDO, AUNQUE SE LLEGARA SIN RECARGAR
 *
 * Aquí solo pasaban las páginas que se CARGABAN (la primera, o al recargar).
 * Pero dentro de la app se navega sin recargar: Next pide solo un trozo
 * (`?_rsc=`), y la página entera de «Académico» o del panel no pasaba nunca
 * por aquí. Medido en un Motorola: se entró, se recorrió todo tocando botones,
 * se quitó el wifi y al abrir la app salió «esta pantalla no está guardada».
 *
 * Ahora la app avisa de cada pantalla que se abre (`AyudanteDeLaApp`) y aquí
 * se trae y se guarda entera, una vez cada `RECIEN` como mucho, para que el
 * servidor no la pinte dos veces en cada paso.
 */
const RECIEN = 10 * 60 * 1000;

async function guardarLaPagina(direccion, siempre = false) {
    const url = new URL(direccion, self.location.origin);
    url.hash = '';
    if (url.origin !== self.location.origin || esDelServidor(url) || esUnArchivoFijo(url)) return false;

    const cache = await caches.open(CASCARA);
    const yaEsta = await cache.match(url.href, { ignoreVary: true });
    const cuando = yaEsta ? Date.parse(yaEsta.headers.get('date') || '') : NaN;
    if (!siempre && yaEsta && Date.now() - cuando < RECIEN) return true;

    const respuesta = await fetch(url.href, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html' },
    });
    // Una redirección (la sesión caducó y manda al login, o el login manda al
    // panel) no es esta página: guardarla aquí la serviría con otra dirección.
    const esLaPagina =
        respuesta.ok && !respuesta.redirected && (respuesta.headers.get('content-type') || '').includes('text/html');
    if (!esLaPagina) return false;
    const html = await respuesta.clone().text();
    await cache.put(url.href, respuesta);
    await guardarSusArchivos(cache, html);
    recortar(cache).catch(() => {});
    return true;
}

/**
 * LA PÁGINA SIN SUS ARCHIVOS NO ARRANCA
 *
 * Se guardaba solo el HTML. Una pantalla que se abrió navegando ya tenía sus
 * archivos guardados, pero una que se guarda sin abrirse (la descarga en
 * segundo plano) no: sin señal pintaba y se quedaba muerta. Se guardan los
 * `/_next/static/` que la página nombra y aún no estén.
 */
const ARCHIVOS_DE_LA_PAGINA = /\/_next\/static\/[A-Za-z0-9_\-./%@~]+\.(?:js|css|woff2?)/g;

async function guardarSusArchivos(cache, html) {
    const rutas = [...new Set(html.match(ARCHIVOS_DE_LA_PAGINA) || [])].slice(0, 120);
    for (const ruta of rutas) {
        if (await cache.match(ruta)) continue;
        try {
            const r = await fetch(ruta);
            if (r.ok) await cache.put(ruta, r);
        } catch {
            return; // Sin red: lo que falte, la próxima vez.
        }
    }
}

/**
 * LA APP AL DÍA, SOLA Y EN SEGUNDO PLANO (como WhatsApp)
 *
 * Al abrir la app y cada media hora, se pregunta qué versión hay
 * (`/version-de-la-web`). Si es otra, se bajan sus archivos que falten —de
 * cuatro en cuatro, sin prisa— y, cuando están todos, se tiran los de la
 * anterior. Así la versión nueva abre sin señal aunque ninguna de sus
 * pantallas se haya visitado. Nada si el teléfono pide ahorrar datos.
 */
const MARCA_DE_VERSION = '/__version-guardada';
let mirandoLaVersion = null;

async function laVersionGuardada() {
    const cache = await caches.open(CASCARA);
    const r = await cache.match(MARCA_DE_VERSION);
    return r ? r.json().catch(() => null) : null;
}

function mirarLaVersion() {
    if (EN_DESARROLLO) return Promise.resolve();
    if (self.navigator && self.navigator.connection && self.navigator.connection.saveData) return Promise.resolve();
    mirandoLaVersion ??= ponerseAlDia().finally(() => {
        mirandoLaVersion = null;
    });
    return mirandoLaVersion;
}

async function ponerseAlDia() {
    const r = await fetch('/version-de-la-web', { cache: 'no-store' }).catch(() => null);
    if (!r || !r.ok) return;
    const nueva = await r.json().catch(() => null);
    if (!nueva || !nueva.id || !Array.isArray(nueva.archivos)) return;
    const guardada = await laVersionGuardada();
    if (guardada && guardada.id === nueva.id) return;

    const cache = await caches.open(CASCARA);
    const faltan = [];
    for (const a of nueva.archivos) if (!(await cache.match(a))) faltan.push(a);
    let fallo = false;
    for (let i = 0; i < faltan.length && !fallo; i += 4) {
        await Promise.all(
            faltan.slice(i, i + 4).map((a) =>
                fetch(a)
                    .then((res) => (res.ok ? cache.put(a, res) : undefined))
                    .catch(() => {
                        fallo = true;
                    })
            )
        );
    }
    // A medias no se da por buena: la próxima vez sigue donde quedó.
    if (fallo) return;
    await cache.put(MARCA_DE_VERSION, new Response(JSON.stringify(nueva), { headers: { 'Content-Type': 'application/json' } }));

    // Los archivos de la versión anterior ya no los pide nadie.
    const deLaNueva = new Set(nueva.archivos.map((a) => new URL(a, self.location.origin).href));
    for (const peticion of await cache.keys()) {
        const url = new URL(peticion.url);
        if (url.pathname.startsWith('/_next/static/') && !deLaNueva.has(url.href)) await cache.delete(peticion);
    }
    await renovarLasPaginas(cache);
}

/**
 * LAS PÁGINAS GUARDADAS, DE LA VERSIÓN NUEVA
 *
 * Una página guardada nombra los archivos de SU compilación. Tirados los de
 * la anterior, esa página ya no arrancaría sin señal: se queda en blanco.
 * Se vuelven a traer todas (con la sesión de quien las abrió). La que ya no
 * se puede traer (la sesión se cerró) se tira. Los trozos `?_rsc=` también:
 * son de la compilación anterior, y sin ellos Next carga la página entera.
 */
async function renovarLasPaginas(cache) {
    for (const peticion of await cache.keys()) {
        const url = new URL(peticion.url);
        if (url.origin !== self.location.origin || esUnArchivoFijo(url) || esDelServidor(url)) continue;
        if (url.pathname.startsWith('/__') || url.pathname === SIN_CONEXION) continue;
        if (url.searchParams.has('_rsc')) {
            await cache.delete(peticion);
            continue;
        }
        try {
            if (!(await guardarLaPagina(url.href, true))) await cache.delete(peticion);
        } catch {
            return; // Se fue la señal: el resto, la próxima vez.
        }
    }
}

/**
 * AL CERRAR SESIÓN, FUERA LAS PÁGINAS
 *
 * Una página guardada lleva el nombre de quien la abrió (la cabecera), y lo
 * que se guarda aquí es del navegador, no de la persona. Se queda la cáscara
 * —el javascript, los estilos, los iconos—, que es igual para todos.
 */
async function olvidarLasPaginas() {
    const fijos = new Set(DE_ENTRADA.map((d) => new URL(d, self.location.origin).href));
    // De TODAS las cajas de la app, no solo la de este modo: en un teléfono
    // de pruebas quedaban las páginas de la app compilada con el nombre de
    // quien las abrió, después de cerrar sesión en la de desarrollo.
    for (const nombre of await caches.keys()) {
        if (!nombre.startsWith('gestiedu-')) continue;
        const cache = await caches.open(nombre);
        for (const peticion of await cache.keys()) {
            const url = new URL(peticion.url);
            if (esFijo(url.href, fijos) || esUnArchivoFijo(url)) continue;
            await cache.delete(peticion);
        }
    }
}

self.addEventListener('message', (evento) => {
    const mensaje = evento.data || {};
    if (mensaje.tipo === 'guardar-pagina' && Array.isArray(mensaje.direcciones)) {
        // De una en una: la descarga en segundo plano manda treinta de golpe,
        // y treinta páginas a la vez son treinta pintadas en el servidor.
        // Con `respuesta` (la precarga) se avisa al acabar: cuántas quedaron.
        const respuesta = evento.ports && evento.ports[0];
        evento.waitUntil(
            (async () => {
                let guardadas = 0;
                const unicas = [...new Set(mensaje.direcciones)];
                const LOTE = 4;
                for (let i = 0; i < unicas.length; i += LOTE) {
                    const grupo = unicas.slice(i, i + LOTE);
                    const res = await Promise.all(grupo.map((d) => guardarLaPagina(d).catch(() => false)));
                    for (const ok of res) if (ok) guardadas++;
                }
                if (respuesta) respuesta.postMessage({ guardadas });
            })()
        );
    } else if (mensaje.tipo === 'olvidar-paginas') {
        evento.waitUntil(olvidarLasPaginas().catch(() => {}));
    } else if (mensaje.tipo === 'mirar-version') {
        // Con `respuesta` (la precarga) se avisa al acabar: la descarga de la
        // primera vez no se da por hecha hasta tener la cáscara entera.
        const respuesta = evento.ports && evento.ports[0];
        evento.waitUntil(
            mirarLaVersion()
                .catch(() => {})
                .then(() => {
                    if (respuesta) respuesta.postMessage({ listo: true });
                })
        );
    }
});

self.addEventListener('fetch', (evento) => {
    const peticion = evento.request;
    if (peticion.method !== 'GET') return;

    const url = new URL(peticion.url);

    // De otro servidor (el de datos, un mapa, una fuente): no se toca.
    if (url.origin !== self.location.origin) return;

    // Los datos del liceo, a la red siempre. Ver la cabecera de este archivo.
    if (esDelServidor(url)) return;

    if (EN_DESARROLLO) {
        // Lo que el servidor de desarrollo usa para recargar en caliente no se
        // toca: no es de la app, y guardarlo solo estorbaría.
        if (url.pathname.startsWith('/_next/webpack-hmr') || url.pathname.startsWith('/__nextjs') || url.pathname.includes('hot-update')) return;
        evento.respondWith(laRedYSiNoLoGuardado(peticion));
        return;
    }

    if (esUnArchivoFijo(url)) {
        evento.respondWith(loGuardadoYSiNoLaRed(peticion));
        return;
    }

    // Las páginas, y lo que Next pide al navegar dentro de la app (`?_rsc=`):
    // la red manda, pero si no hay, vale lo de la última vez.
    evento.respondWith(laRedYSiNoLoGuardado(peticion));
});

/**
 * LOS AVISOS CON LA APP CERRADA (Web Push)
 *
 * El servidor manda qué y cuándo —nunca el motivo ni lo hablado— y aquí se
 * enseña como cualquier notificación del teléfono. Al tocarla se abre la app
 * donde diga el aviso (o se trae al frente si ya estaba abierta). Ver
 * `services/avisos.service.ts` en el servidor.
 */
self.addEventListener('push', (evento) => {
    let carga = {};
    try {
        carga = evento.data ? evento.data.json() : {};
    } catch {
        carga = { titulo: 'Gestiedu', cuerpo: evento.data ? evento.data.text() : '' };
    }
    const titulo = carga.titulo || 'Aviso del liceo';
    evento.waitUntil(
        self.registration.showNotification(titulo, {
            body: carga.cuerpo || '',
            icon: '/icons/icono-192.png',
            badge: '/icons/icono-192.png',
            data: { enlace: typeof carga.enlace === 'string' && carga.enlace.startsWith('/') ? carga.enlace : '/dashboard' },
            tag: carga.enlace || undefined,
        })
    );
});

self.addEventListener('notificationclick', (evento) => {
    evento.notification.close();
    const enlace = (evento.notification.data && evento.notification.data.enlace) || '/dashboard';
    evento.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
            for (const v of ventanas) {
                if (new URL(v.url).origin === self.location.origin && 'focus' in v) {
                    v.navigate(enlace).catch(() => undefined);
                    return v.focus();
                }
            }
            return self.clients.openWindow(enlace);
        })
    );
});
