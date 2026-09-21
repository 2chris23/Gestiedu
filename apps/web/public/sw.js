/**
 * EL AYUDANTE QUE HACE QUE SE PUEDA INSTALAR
 *
 * Sin uno de estos, el navegador NO ofrece «instalar aplicación»: es uno de los
 * requisitos, junto con la ficha (`manifest.webmanifest`) y los iconos.
 *
 * LO QUE ESTE **NO** HACE, A PROPÓSITO
 *
 * No guarda pantallas ni respuestas del servidor. Un ayudante que sirve copias
 * guardadas es la forma más fácil de que un profesor vea la nota de ayer y crea
 * que la de hoy no se guardó, o de que un alumno expulsado siga viendo sus
 * datos. En un sistema donde lo que importa es el dato de AHORA, eso no
 * compensa.
 *
 * Lo único que hace: cuando el teléfono se queda sin señal y la página no se
 * puede pedir, enseña una pantalla escrita para una persona en vez del error
 * del navegador. Nada más.
 */

const VERSION = 'gestiedu-v1';
const SIN_CONEXION = '/sin-conexion.html';

self.addEventListener('install', (evento) => {
    evento.waitUntil(
        caches.open(VERSION).then((cache) => cache.addAll([SIN_CONEXION])).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (evento) => {
    evento.waitUntil(
        caches
            .keys()
            .then((nombres) => Promise.all(nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (evento) => {
    const peticion = evento.request;

    // Solo las pantallas, y solo las que se piden con GET. Todo lo demás
    // —datos, imágenes, subidas— va al servidor sin pasar por aquí.
    if (peticion.method !== 'GET' || peticion.mode !== 'navigate') return;

    evento.respondWith(
        fetch(peticion).catch(async () => {
            const guardada = await caches.match(SIN_CONEXION);
            return (
                guardada ||
                new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
            );
        })
    );
});
