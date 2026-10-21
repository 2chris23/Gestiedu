package com.gestiedu.app;

import android.content.res.AssetManager;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * EL DISEÑO DE LA APP, DENTRO DE LA APK (pedido por Cristian, octubre 2026)
 *
 * La app enseña el sistema que vive en el servidor del liceo, y antes TODO su
 * código (5,5 MB de javascript y estilos) se bajaba la primera vez que se
 * abría. Con mala señal eso tardaba, y era lo primero que faltaba sin
 * conexión. Ahora la APK lleva dentro la compilación de la web
 * (`assets/cascara/_next/static/...`, la copia `scripts/publicar-apk.mjs`) y
 * aquí se sirve desde el teléfono en vez de pedirla.
 *
 * No se rompe con versiones nuevas: cada archivo de `/_next/static/` lleva su
 * huella en el nombre y no cambia nunca. Si el servidor estrena versión, sus
 * archivos nuevos no están en la APK y se piden por la red como siempre; los
 * que siguen igual salen de aquí. Solo se sirve lo que existe en la APK: lo
 * demás (páginas, datos) pasa de largo.
 *
 * Se usa en dos sitios: la ventana de la app (`MainActivity`) y el ayudante
 * (`sw.js`), cuyas peticiones NO pasan por la ventana.
 */
final class CascaraDeLaApk {

    private static final String ETIQUETA = "GestiEdu";
    private static final String CARPETA = "cascara";

    private final AssetManager archivos;
    private final String servidor;
    private int servidas = 0;

    CascaraDeLaApk(AssetManager archivos, String servidor) {
        this.archivos = archivos;
        this.servidor = servidor;
    }

    /** La respuesta desde la APK, o `null` si no es suya (y sigue su camino). */
    WebResourceResponse responder(WebResourceRequest peticion) {
        try {
            if (!"GET".equalsIgnoreCase(peticion.getMethod())) return null;
            Uri u = peticion.getUrl();
            if (servidor == null || u == null) return null;
            String origen = u.getScheme() + "://" + u.getEncodedAuthority();
            if (!servidor.equals(origen)) return null;
            String camino = u.getPath();
            if (camino == null || !camino.startsWith("/_next/static/") || camino.contains("..")) return null;

            InputStream contenido;
            try {
                contenido = archivos.open(CARPETA + camino);
            } catch (IOException noEsta) {
                return null;
            }
            Map<String, String> cabeceras = new HashMap<>();
            cabeceras.put("Cache-Control", "public, max-age=31536000, immutable");
            cabeceras.put("Access-Control-Allow-Origin", origen);
            cabeceras.put("X-Desde-La-Apk", "1");
            if (++servidas % 50 == 1) Log.d(ETIQUETA, "Cáscara desde la APK: " + servidas + " archivos");
            return new WebResourceResponse(tipo(camino), tipo(camino).startsWith("text/") || tipo(camino).endsWith("javascript") ? "utf-8" : null, 200, "OK", cabeceras, contenido);
        } catch (Exception e) {
            return null;
        }
    }

    private static String tipo(String camino) {
        String c = camino.toLowerCase();
        if (c.endsWith(".js") || c.endsWith(".mjs")) return "application/javascript";
        if (c.endsWith(".css")) return "text/css";
        if (c.endsWith(".woff2")) return "font/woff2";
        if (c.endsWith(".woff")) return "font/woff";
        if (c.endsWith(".png")) return "image/png";
        if (c.endsWith(".svg")) return "image/svg+xml";
        if (c.endsWith(".jpg") || c.endsWith(".jpeg")) return "image/jpeg";
        if (c.endsWith(".webp")) return "image/webp";
        if (c.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    /** El origen (`https://liceo.com`) de la dirección del servidor de la app. */
    static String elOrigen(String url) {
        if (url == null) return null;
        Uri u = Uri.parse(url);
        if (u.getScheme() == null || u.getEncodedAuthority() == null) return null;
        return u.getScheme() + "://" + u.getEncodedAuthority();
    }
}
