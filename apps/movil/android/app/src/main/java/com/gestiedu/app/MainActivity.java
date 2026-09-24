package com.gestiedu.app;

import android.app.DownloadManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * LA APP DEL LICEO
 *
 * Casi todo lo hace Capacitor solo: abrir el sistema del liceo a pantalla
 * completa, el botón de atrás del teléfono, el teclado. Aquí solo está lo que
 * sin tocarlo NO funciona.
 *
 * BAJAR UN ARCHIVO
 *
 * Dentro de una app, pulsar «Comprobante en imagen» o «Descargar el boletín»
 * no hace absolutamente nada: la ventana de una app no sabe bajar archivos —eso
 * lo hace el navegador, y aquí no hay navegador—. El usuario pulsa, no pasa
 * nada, y da por hecho que la app está rota.
 *
 * Esto se lo pasa al gestor de descargas de Android, el mismo que usa Chrome:
 * el archivo cae en «Descargas», sale el aviso de siempre y se puede abrir o
 * compartir. Se le pasa también la credencial de la sesión (la cookie), porque
 * el comprobante de un pago no es público y sin ella el servidor respondería
 * que no.
 *
 * LA FRANJA DEL RELOJ
 *
 * Desde Android 15, una app que apunta a la plataforma 35 —como esta— dibuja
 * de borde a borde POR OBLIGACIÓN: la ventana empieza detrás del reloj y la
 * batería, y no hay forma de pedir lo contrario (`setDecorFitsSystemWindows`
 * ya no hace nada). En el teléfono se veía el nombre del liceo partido por el
 * reloj y los botones de arriba no se podían pulsar: el dedo daba en la barra
 * del sistema.
 *
 * Y no vale arreglarlo solo con CSS: en Android `env(safe-area-inset-top)` NO
 * mide la barra de estado, mide la MUESCA de la pantalla. En un teléfono sin
 * muesca vale cero aunque el reloj esté tapando media cabecera. Por eso el
 * hueco se reserva aquí, preguntándole al sistema cuánto ocupa.
 *
 * Y se pinta **del color de la app**, no de negro. Esa franja sin color es lo
 * que delata a una aplicación envuelta: se ve una banda negra pegada a una
 * cabecera blanca. Facebook y WhatsApp pintan ahí el blanco de su cabecera y
 * ponen el reloj en oscuro encima, y por eso parecen una sola pieza. Lo segundo
 * es tan importante como lo primero: un reloj blanco sobre blanco desaparece.
 * El color y los iconos los fija el TEMA (`styles.xml`): al irse la pantalla
 * de arranque, Android vuelve a pintar la franja con lo que diga el tema, y
 * lo que se pinte aquí se pierde (así salía negra en el Motorola).
 *
 * LA SESIÓN, AL DISCO ANTES DE SALIR
 *
 * La sesión vive en cookies, y Android no las escribe en el disco al
 * momento: lo hace cada 30 segundos. Quien entraba y cerraba la app antes de
 * eso —o la cerraba justo después de que la llave de volver a entrar se
 * renovara— volvía a encontrarse el formulario, o una llave vieja que el
 * servidor ya no acepta. Se escriben al salir de la app (`onPause`). Medido en
 * el emulador, entrando y cerrando a los pocos segundos: sin pasar por aquí,
 * ni una cookie en el disco y otra vez al login; pasando, las cuatro, y la
 * app abre en el panel.
 *
 * LA PANTALLA DE «NO SE LLEGA AL LICEO», SOLO SI NO HAY NADA QUE ENSEÑAR
 *
 * Sin servidor, la app abre igual: el ayudante del navegador (`sw.js`) sirve
 * la app guardada y la app enseña lo último descargado. Pero Android avisa de
 * un error de red en la página principal aunque el ayudante sí la haya
 * servido, y Capacitor, al oírlo, tiraba de su pantalla de error
 * (`server.errorPath`) y tapaba la app que ya estaba en camino. Medido en el
 * emulador: sin servidor, «No se llega al liceo»; quitando la pantalla de
 * error, el panel con lo guardado.
 *
 * Ahora se mira QUÉ quedó en pantalla (`mirarSiLlegoLaApp`): si es la app,
 * se deja; si es la página de error de Android, se cambia por la nuestra. Y un
 * 404 o un 500 del liceo tampoco es «no se llega»: eso lo cuenta el propio
 * servidor con su página.
 */
public class MainActivity extends BridgeActivity {

    private static final String ETIQUETA = "GestiEdu";

    private final Handler hiloPrincipal = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Antes de `super.onCreate`: Capacitor solo conoce los complementos
        // registrados cuando arranca el puente.
        registerPlugin(ActualizarAppPlugin.class);
        registerPlugin(AsistenciaQrPlugin.class);
        super.onCreate(savedInstanceState);

        dejarSitioParaElReloj();
        getBridge().setWebViewClient(new ClienteQueNoTapaLaApp(getBridge()));

        getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                // Un `data:` o un `blob:` no se pueden bajar así: los genera la
                // propia página y no hay dirección que pedirle al servidor.
                if (!URLUtil.isNetworkUrl(url)) {
                    Toast.makeText(this, "Este archivo no se puede guardar desde la app", Toast.LENGTH_LONG).show();
                    return;
                }

                String nombre = URLUtil.guessFileName(url, contentDisposition, mimeType);

                DownloadManager.Request peticion = new DownloadManager.Request(Uri.parse(url));
                peticion.setMimeType(mimeType);
                peticion.addRequestHeader("User-Agent", userAgent);

                String credencial = CookieManager.getInstance().getCookie(url);
                if (credencial != null) {
                    peticion.addRequestHeader("Cookie", credencial);
                }

                peticion.setTitle(nombre);
                // El nombre de la app se pregunta al sistema, no a `R`: el
                // paquete del código es uno y el de la app instalada puede ser
                // otro (uno por liceo), y ahí `R` deja de resolverse.
                peticion.setDescription("Descargando desde " + getApplicationInfo().loadLabel(getPackageManager()));
                peticion.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                peticion.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, nombre);

                DownloadManager gestor = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                gestor.enqueue(peticion);

                Toast.makeText(this, "Guardando " + nombre + " en Descargas", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                // Que falle una descarga no puede tumbar la app: se avisa y ya.
                Toast.makeText(this, "No se pudo guardar el archivo", Toast.LENGTH_LONG).show();
            }
        });
    }

    @Override
    public void onPause() {
        super.onPause();
        // Ver «LA SESIÓN, AL DISCO ANTES DE SALIR», arriba.
        CookieManager.getInstance().flush();
    }

    /**
     * Le pide al sistema cuánto ocupan el reloj y la muesca, y aparta esa
     * altura para que la web empiece por debajo. Solo arriba: el hueco de la
     * barra de gestos de abajo lo aparta la web (`--zona-segura-abajo`).
     *
     * Y a la web se le dice que arriba ya no hay nada que apartar. Las
     * versiones nuevas de Android System WebView sí miden la barra de estado en
     * `env(safe-area-inset-top)`, así que la web la apartaba OTRA vez: una
     * franja blanca del doble de alto encima de la cabecera. Medido en el
     * emulador (Android 17, WebView 149).
     */
    private void dejarSitioParaElReloj() {
        final View contenido = findViewById(android.R.id.content);
        if (contenido == null) return;

        contenido.setBackgroundColor(getResources().getColor(R.color.color_de_la_barra_de_estado, getTheme()));

        // El reloj, el wifi y la batería, en oscuro: la franja es clara y con
        // los iconos claros de fábrica no se vería absolutamente nada.
        WindowInsetsControllerCompat barras =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        barras.setAppearanceLightStatusBars(true);

        ViewCompat.setOnApplyWindowInsetsListener(contenido, (vista, insets) -> {
            Insets sistema = insets.getInsets(
                WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout()
            );
            vista.setPadding(vista.getPaddingLeft(), sistema.top, vista.getPaddingRight(), vista.getPaddingBottom());

            Insets reloj = insets.getInsets(WindowInsetsCompat.Type.statusBars());
            Insets muesca = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.statusBars(), Insets.of(reloj.left, 0, reloj.right, reloj.bottom))
                .setInsets(WindowInsetsCompat.Type.displayCutout(), Insets.of(muesca.left, 0, muesca.right, muesca.bottom))
                .build();
        });
    }

    /**
     * ¿Llegó la app a la pantalla, o se quedó la página de error de Android?
     *
     * Se pregunta a la propia página: si es de la dirección del liceo, llegó
     * (del servidor o de lo guardado por el ayudante). Si es la página de error
     * de Android (`chrome-error:`), o a los cuatro segundos sigue sin haber
     * nada, se pone la nuestra, que dice qué pasa y vuelve a intentarlo sola.
     */
    private void mirarSiLlegoLaApp(WebView vista, String urlDeError, int intento) {
        final String servidor = elOrigen(getBridge().getServerUrl());
        vista.evaluateJavascript(
            "(function(){try{return location.protocol+'|'+location.origin+'|'+document.readyState}catch(e){return 'x'}})()",
            (respuesta) -> {
                String r = respuesta == null ? "" : respuesta.replace("\"", "");
                Log.d(ETIQUETA, "¿Llegó la app? intento " + intento + ": " + r);
                if (servidor != null && r.contains("|" + servidor + "|") && !r.endsWith("|loading")) return;
                if (r.startsWith("chrome-error:") || intento >= 16) {
                    vista.loadUrl(urlDeError);
                    return;
                }
                hiloPrincipal.postDelayed(() -> mirarSiLlegoLaApp(vista, urlDeError, intento + 1), 250);
            }
        );
    }

    private static String elOrigen(String url) {
        if (url == null) return null;
        Uri u = Uri.parse(url);
        if (u.getScheme() == null || u.getEncodedAuthority() == null) return null;
        return u.getScheme() + "://" + u.getEncodedAuthority();
    }

    private class ClienteQueNoTapaLaApp extends BridgeWebViewClient {

        private final Bridge puente;

        ClienteQueNoTapaLaApp(Bridge puente) {
            super(puente);
            this.puente = puente;
        }

        @Override
        public void onReceivedError(WebView vista, WebResourceRequest peticion, WebResourceError error) {
            String urlDeError = puente.getErrorUrl();
            if (urlDeError == null || !peticion.isForMainFrame()) {
                super.onReceivedError(vista, peticion, error);
                return;
            }
            // Sin la dirección: puede llevar la cédula de alguien.
            Log.d(ETIQUETA, "Error de red en la página principal: " + error.getErrorCode() + " " + error.getDescription());
            hiloPrincipal.postDelayed(() -> mirarSiLlegoLaApp(vista, urlDeError, 0), 250);
        }

        @Override
        public void onReceivedHttpError(WebView vista, WebResourceRequest peticion, WebResourceResponse respuesta) {
            String urlDeError = puente.getErrorUrl();
            if (urlDeError == null || !peticion.isForMainFrame()) {
                super.onReceivedHttpError(vista, peticion, respuesta);
                return;
            }
            // 502, 503 y 504: el liceo no contesta detrás de su puerta. El
            // resto (un 404, un 500) lo explica el propio servidor.
            int codigo = respuesta.getStatusCode();
            if (codigo >= 502 && codigo <= 504) {
                hiloPrincipal.postDelayed(() -> mirarSiLlegoLaApp(vista, urlDeError, 0), 250);
            }
        }
    }
}
