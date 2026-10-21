/**
 * LA CORTINA ANTES DE PINTAR (solo en la app)
 *
 * La página llega del servidor YA pintada (el armazón del Inicio con sus
 * esqueletos) y el libro del arranque (`ArranqueYCandado`) solo sale cuando
 * React ha arrancado: en medio, dos o tres segundos con el esqueleto del
 * Inicio a la vista, y en un teléfono lento más. Lo vio Cristian en su moto
 * g13 («la pantalla se rompe y deja ver el esqueleto del dashboard»); medido
 * en el navegador con un Capacitor de mentira: 2,9 s antes del libro.
 *
 * Esto corre en el `<head>`, antes de pintar nada: en la app marca el
 * documento (`data-arrancando`) y el CSS (`globals.css`) esconde todo menos la
 * capa del candado. `ArranqueYCandado` quita la marca en cuanto pinta el
 * libro. Si nada la quita (la app no arrancó), se quita sola a los 10 s, para
 * que el guardián del arranque y su pantalla de «sin conexión» se vean.
 */
export const MARCA_ARRANCANDO = 'data-arrancando';

export const CORTINA_DEL_ARRANQUE = `(function(){
  try {
    if (location.pathname === '/sin-conexion.html') return;
    var c = window.Capacitor;
    var app = (c && typeof c.isNativePlatform === 'function' && c.isNativePlatform())
      || /GestiEduApp/.test(navigator.userAgent)
      || localStorage.getItem('gestiedu:candado-en-el-navegador') === '1';
    if (!app) return;
    var h = document.documentElement;
    h.setAttribute('${MARCA_ARRANCANDO}', '1');
    setTimeout(function(){ h.removeAttribute('${MARCA_ARRANCANDO}'); }, 10000);
  } catch (e) {}
})();`;

export function quitarLaCortina(): void {
    if (typeof document !== 'undefined') document.documentElement.removeAttribute(MARCA_ARRANCANDO);
}
