package com.gestiedu.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * BAJAR LA VERSIÓN NUEVA DE LA APP E INSTALARLA
 *
 * La web (`ActualizarLaApp.tsx`) pregunta al servidor si hay una versión más
 * nueva que esta; si la hay y la persona acepta, esto la baja, comprueba que
 * es exactamente la que el servidor publicó (su huella SHA-256) y abre el
 * instalador de Android, que pide confirmar.
 *
 * Tres cosas que no hace, a propósito:
 *
 *  · **No instala a escondidas.** Android no deja, y está bien: la persona ve
 *    «¿Quieres instalar una actualización de esta app?» y decide.
 *  · **No se fía de lo que baja.** Si la huella no coincide —la descarga se
 *    cortó, o alguien la cambió por el camino—, se tira y no se ofrece.
 *    Además Android comprueba que la nueva venga firmada con la MISMA llave
 *    que la instalada: una APK de otro no se instala encima de esta.
 *  · **No toca la carpeta de Descargas.** Se guarda en la caché de la propia
 *    app, que nadie más lee, y se reemplaza en cada descarga.
 *
 * La primera vez, Android pide permiso para que ESTA app pueda instalar: eso
 * se pide con `pedirPermiso` (abre la pantalla de ajustes) y se comprueba con
 * `puedeInstalar`.
 */
@CapacitorPlugin(name = "ActualizarApp")
public class ActualizarAppPlugin extends Plugin {

    private final ExecutorService hilo = Executors.newSingleThreadExecutor();
    private volatile boolean bajando = false;

    /**
     * La APK bajada ya no sirve al abrir la app: o se instaló (y esta ES la
     * nueva) o se canceló. Son 5 MB que se quedaban en el teléfono. Se deja la
     * de los últimos minutos por si el instalador de Android aún la está leyendo.
     */
    @Override
    public void load() {
        hilo.execute(() -> {
            File apk = new File(new File(getContext().getCacheDir(), "actualizacion"), "nueva.apk");
            if (apk.exists() && System.currentTimeMillis() - apk.lastModified() > 10 * 60 * 1000) apk.delete();
        });
    }

    @PluginMethod
    public void puedeInstalar(PluginCall call) {
        JSObject respuesta = new JSObject();
        respuesta.put(
            "puede",
            Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls()
        );
        call.resolve(respuesta);
    }

    @PluginMethod
    public void pedirPermiso(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent ajustes = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            ajustes.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ajustes);
        }
        call.resolve();
    }

    @PluginMethod
    public void descargarEInstalar(PluginCall call) {
        final String direccion = call.getString("url");
        final String huella = call.getString("sha256");

        if (direccion == null || !(direccion.startsWith("https://") || direccion.startsWith("http://"))) {
            call.reject("Falta la dirección de la versión nueva", "SIN_DIRECCION");
            return;
        }
        if (huella == null || !huella.matches("^[a-fA-F0-9]{64}$")) {
            call.reject("Falta la huella de la versión nueva", "SIN_HUELLA");
            return;
        }
        if (bajando) {
            call.reject("Ya se está bajando", "YA_BAJANDO");
            return;
        }
        bajando = true;

        hilo.execute(() -> {
            File carpeta = new File(getContext().getCacheDir(), "actualizacion");
            File apk = new File(carpeta, "nueva.apk");
            try {
                if (!carpeta.exists() && !carpeta.mkdirs()) {
                    call.reject("No hay sitio para bajarla", "SIN_SITIO");
                    return;
                }
                if (apk.exists()) apk.delete();

                HttpURLConnection conexion = (HttpURLConnection) new URL(direccion).openConnection();
                conexion.setConnectTimeout(15000);
                conexion.setReadTimeout(30000);
                conexion.setInstanceFollowRedirects(true);
                int estado = conexion.getResponseCode();
                if (estado != 200) {
                    call.reject("El servidor no la dio (" + estado + ")", "SERVIDOR");
                    return;
                }

                long total = conexion.getContentLengthLong();
                MessageDigest resumen = MessageDigest.getInstance("SHA-256");
                long bajado = 0;
                int ultimo = -1;
                try (InputStream entrada = conexion.getInputStream(); OutputStream salida = new FileOutputStream(apk)) {
                    byte[] trozo = new byte[64 * 1024];
                    int leidos;
                    while ((leidos = entrada.read(trozo)) != -1) {
                        salida.write(trozo, 0, leidos);
                        resumen.update(trozo, 0, leidos);
                        bajado += leidos;
                        int porcentaje = total > 0 ? (int) (bajado * 100 / total) : -1;
                        if (porcentaje != ultimo) {
                            ultimo = porcentaje;
                            JSObject progreso = new JSObject();
                            progreso.put("porcentaje", porcentaje);
                            progreso.put("bajado", bajado);
                            progreso.put("total", total);
                            notifyListeners("progreso", progreso);
                        }
                    }
                }

                if (!enHexadecimal(resumen.digest()).equalsIgnoreCase(huella)) {
                    apk.delete();
                    call.reject("Lo que se bajó no es la versión publicada. Vuelve a intentarlo.", "HUELLA");
                    return;
                }

                Uri archivo = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent instalar = new Intent(Intent.ACTION_VIEW);
                instalar.setDataAndType(archivo, "application/vnd.android.package-archive");
                instalar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> getContext().startActivity(instalar));
                call.resolve();
            } catch (Exception e) {
                apk.delete();
                call.reject("No se pudo bajar la versión nueva: revisa la conexión y vuelve a intentarlo.", "RED", e);
            } finally {
                bajando = false;
            }
        });
    }

    private static String enHexadecimal(byte[] bytes) {
        StringBuilder texto = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) texto.append(String.format("%02x", b));
        return texto.toString();
    }
}
