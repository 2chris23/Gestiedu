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

const VERSION = 'gestiedu-v2';
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
const TOPE_DE_ARCHIVOS = 400;
let recortando = false;

async function recortar(cache) {
    if (recortando) return;
    recortando = true;
    try {
        const claves = await cache.keys();
        const sobran = claves.length - TOPE_DE_ARCHIVOS;
        const fijos = new Set(DE_ENTRADA.map((d) => new URL(d, self.location.origin).href));
        for (let i = 0, quitados = 0; i < claves.length && quitados < sobran; i++) {
            if (fijos.has(claves[i].url)) continue;
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
async function laRedYSiNoLoGuardado(peticion) {
    try {
        const respuesta = await fetch(peticion);
        if (respuesta.status >= 502 && respuesta.status <= 504) throw new Error('sin servidor');
        return await guardar(peticion, respuesta);
    } catch {
        // Una página se busca solo por su dirección: la guardada pudo traerse
        // con otras cabeceras (ver `guardarLaPagina`). Un trozo de Next
        // (`?_rsc=`) no: depende de lo que ya había en pantalla, y uno que no
        // encaje rompe la navegación; sin él, Next carga la página entera.
        const guardada =
            peticion.mode === 'navigate'
                ? await caches.match(peticion.url, { ignoreVary: true })
                : await caches.match(peticion);
        if (guardada) return guardada;

        // Una página que nunca se abrió no se puede inventar: ahí sí toca la
        // pantalla de «no hay conexión».
        if (peticion.mode === 'navigate') {
            const apagada = await caches.match(SIN_CONEXION);
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
    const guardada = await caches.match(peticion);
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

async function guardarLaPagina(direccion) {
    const url = new URL(direccion, self.location.origin);
    url.hash = '';
    if (url.origin !== self.location.origin || esDelServidor(url) || esUnArchivoFijo(url)) return;

    const cache = await caches.open(CASCARA);
    const yaEsta = await cache.match(url.href, { ignoreVary: true });
    const cuando = yaEsta ? Date.parse(yaEsta.headers.get('date') || '') : NaN;
    if (yaEsta && Date.now() - cuando < RECIEN) return;

    const respuesta = await fetch(url.href, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html' },
    });
    // Una redirección (la sesión caducó y manda al login, o el login manda al
    // panel) no es esta página: guardarla aquí la serviría con otra dirección.
    const esLaPagina =
        respuesta.ok && !respuesta.redirected && (respuesta.headers.get('content-type') || '').includes('text/html');
    if (!esLaPagina) return;
    await cache.put(url.href, respuesta);
    recortar(cache).catch(() => {});
}

/**
 * AL CERRAR SESIÓN, FUERA LAS PÁGINAS
 *
 * Una página guardada lleva el nombre de quien la abrió (la cabecera), y lo
 * que se guarda aquí es del navegador, no de la persona. Se queda la cáscara
 * —el javascript, los estilos, los iconos—, que es igual para todos.
 */
async function olvidarLasPaginas() {
    const cache = await caches.open(CASCARA);
    const fijos = new Set(DE_ENTRADA.map((d) => new URL(d, self.location.origin).href));
    for (const peticion of await cache.keys()) {
        const url = new URL(peticion.url);
        if (fijos.has(url.href) || esUnArchivoFijo(url)) continue;
        await cache.delete(peticion);
    }
}

self.addEventListener('message', (evento) => {
    const mensaje = evento.data || {};
    if (mensaje.tipo === 'guardar-pagina' && Array.isArray(mensaje.direcciones)) {
        evento.waitUntil(
            Promise.all(mensaje.direcciones.map((d) => guardarLaPagina(d).catch(() => {})))
        );
    } else if (mensaje.tipo === 'olvidar-paginas') {
        evento.waitUntil(olvidarLasPaginas().catch(() => {}));
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
