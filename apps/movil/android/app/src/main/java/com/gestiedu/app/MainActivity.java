package com.gestiedu.app;

import android.app.DownloadManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

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
 * hueco se reserva aquí, preguntándole al sistema cuánto ocupa, y se pinta del
 * color del liceo.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        dejarSitioParaElReloj();

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

    /**
     * Le pide al sistema cuánto ocupan el reloj y la muesca, y aparta esa
     * altura para que la web empiece por debajo. Solo arriba: el hueco de la
     * barra de gestos de abajo ya lo aparta Capacitor.
     */
    private void dejarSitioParaElReloj() {
        final View contenido = findViewById(android.R.id.content);
        if (contenido == null) return;

        contenido.setBackgroundColor(getResources().getColor(R.color.color_del_liceo, getTheme()));

        ViewCompat.setOnApplyWindowInsetsListener(contenido, (vista, insets) -> {
            Insets sistema = insets.getInsets(
                WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout()
            );
            vista.setPadding(vista.getPaddingLeft(), sistema.top, vista.getPaddingRight(), vista.getPaddingBottom());
            return insets;
        });
    }
}
