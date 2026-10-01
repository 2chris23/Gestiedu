/**
 * EL GUARDIÁN DEL ARRANQUE: LA APP NO SE QUEDA NUNCA EN BLANCO
 *
 * Visto en el teléfono de Cristian (2026-09-30), fuera de casa: la app abría
 * una hoja vacía y ahí se quedaba. El ayudante le servía la página guardada,
 * pero la app no llegaba a arrancar encima (era la de desarrollo, que esconde
 * la página hasta hablar con su servidor). Y la APK, al ver «una página del
 * liceo, cargada», no ponía su pantalla de error. Nadie decía nada.
 *
 * Puede pasar también en producción: un archivo de la app que no se guardó,
 * una versión a medias, una red que se cuelga en vez de fallar.
 *
 * Esto va escrito EN la página (en línea, en `<head>`), así que corre aunque
 * no llegue ningún archivo de la app. Pasado `ESPERA`, si la app no dijo «ya
 * arranqué» (`window.__gestieduArranco`, `MarcaDeArranque`) o la pantalla
 * sigue sin una sola letra, pregunta a la web si está (`/api/estoy`, que el
 * ayudante no guarda nunca). Si contesta, la app solo va lenta: se deja. Si no
 * contesta, a la pantalla de sin conexión, que enseña lo guardado.
 *
 * ES5 a propósito: corre antes que nada y en navegadores viejos.
 */

/** Lo que se espera a que la app arranque antes de mirar. */
export const ESPERA_DEL_ARRANQUE_MS = 8000;

/** Lo que se espera a que la web conteste a «¿estás?». */
export const ESPERA_DE_LA_WEB_MS = 4000;

export const GUARDIAN_DEL_ARRANQUE = `(function(){
  try {
    if (location.pathname === '/sin-conexion.html') return;
    var vacia = function(){ var b = document.body; return !b || !(b.innerText || '').replace(/\\s+/g, '').length; };
    var arranco = function(){ return window.__gestieduArranco === true && !vacia(); };
    var irse = function(){
      if (arranco()) return;
      location.replace('/sin-conexion.html?desde=' + encodeURIComponent(location.pathname + location.search));
    };
    setTimeout(function(){
      if (arranco()) return;
      var hecho = false;
      var reloj = setTimeout(function(){ if (!hecho) { hecho = true; irse(); } }, ${ESPERA_DE_LA_WEB_MS});
      fetch('/api/estoy', { cache: 'no-store' }).then(function(r){
        if (hecho) return; hecho = true; clearTimeout(reloj);
        if (!r.ok) irse();
      }).catch(function(){
        if (hecho) return; hecho = true; clearTimeout(reloj); irse();
      });
    }, ${ESPERA_DEL_ARRANQUE_MS});
  } catch (e) {}
})();`;
