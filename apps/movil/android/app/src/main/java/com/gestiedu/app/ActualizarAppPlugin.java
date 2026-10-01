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
import java.io.FileInputStream;
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
 *    app, que nadie más lee.
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
     * LO BAJADO SE GUARDA HASTA INSTALARLO (como WhatsApp)
     *
     * La versión nueva se baja SOLA, en segundo plano y con wifi (lo decide
     * `ActualizarLaApp.tsx`), y se guarda con su huella como nombre
     * (`<huella>.apk`) hasta que la persona pulse «Instalar». Al abrir la app
     * se tiran las de más de tres días: o se instalaron (y esta ES la nueva) o
     * ya hay otra más nueva. La vieja `nueva.apk` (de `descargarEInstalar`) se
     * tira a los diez minutos, como antes.
     */
    private static final long TRES_DIAS = 3L * 24 * 60 * 60 * 1000;

    @Override
    public void load() {
        hilo.execute(() -> {
            File[] archivos = carpeta().listFiles();
            if (archivos == null) return;
            long ahora = System.currentTimeMillis();
            for (File f : archivos) {
                long edad = ahora - f.lastModified();
                if (f.getName().equals("nueva.apk") ? edad > 10 * 60 * 1000 : edad > TRES_DIAS) f.delete();
            }
        });
    }

    private File carpeta() {
        return new File(getContext().getCacheDir(), "actualizacion");
    }

    private File laDe(String huella) {
        return new File(carpeta(), huella.toLowerCase() + ".apk");
    }

    private static boolean esHuella(String huella) {
        return huella != null && huella.matches("^[a-fA-F0-9]{64}$");
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

    /** ¿Ya está bajada (y entera) la versión de esta huella? */
    @PluginMethod
    public void yaBajada(PluginCall call) {
        final String huella = call.getString("sha256");
        if (!esHuella(huella)) {
            call.reject("Falta la huella de la versión nueva", "SIN_HUELLA");
            return;
        }
        hilo.execute(() -> {
            JSObject respuesta = new JSObject();
            respuesta.put("lista", estaEntera(laDe(huella), huella));
            call.resolve(respuesta);
        });
    }

    /** Baja la versión nueva y la guarda, sin instalar: para hacerlo en segundo plano. */
    @PluginMethod
    public void descargar(PluginCall call) {
        final String direccion = call.getString("url");
        final String huella = call.getString("sha256");
        if (!comprobar(call, direccion, huella)) return;
        bajando = true;
        hilo.execute(() -> {
            try {
                bajar(direccion, huella);
                JSObject respuesta = new JSObject();
                respuesta.put("lista", true);
                call.resolve(respuesta);
            } catch (FalloAlBajar e) {
                call.reject(e.getMessage(), e.codigo);
            } catch (Exception e) {
                call.reject("No se pudo bajar la versión nueva: revisa la conexión y vuelve a intentarlo.", "RED", e);
            } finally {
                bajando = false;
            }
        });
    }

    /** Abre el instalador de Android con la versión ya bajada. */
    @PluginMethod
    public void instalar(PluginCall call) {
        final String huella = call.getString("sha256");
        if (!esHuella(huella)) {
            call.reject("Falta la huella de la versión nueva", "SIN_HUELLA");
            return;
        }
        hilo.execute(() -> {
            File apk = laDe(huella);
            if (!estaEntera(apk, huella)) {
                call.reject("La versión nueva no está bajada entera. Vuelve a bajarla.", "NO_BAJADA");
                return;
            }
            abrirElInstalador(apk);
            call.resolve();
        });
    }

    /** La forma de antes (una APK vieja con web nueva, o al revés): bajar e instalar seguido. */
    @PluginMethod
    public void descargarEInstalar(PluginCall call) {
        final String direccion = call.getString("url");
        final String huella = call.getString("sha256");
        if (!comprobar(call, direccion, huella)) return;
        bajando = true;
        hilo.execute(() -> {
            try {
                abrirElInstalador(bajar(direccion, huella));
                call.resolve();
            } catch (FalloAlBajar e) {
                call.reject(e.getMessage(), e.codigo);
            } catch (Exception e) {
                call.reject("No se pudo bajar la versión nueva: revisa la conexión y vuelve a intentarlo.", "RED", e);
            } finally {
                bajando = false;
            }
        });
    }

    private boolean comprobar(PluginCall call, String direccion, String huella) {
        if (direccion == null || !(direccion.startsWith("https://") || direccion.startsWith("http://"))) {
            call.reject("Falta la dirección de la versión nueva", "SIN_DIRECCION");
            return false;
        }
        if (!esHuella(huella)) {
            call.reject("Falta la huella de la versión nueva", "SIN_HUELLA");
            return false;
        }
        if (bajando) {
            call.reject("Ya se está bajando", "YA_BAJANDO");
            return false;
        }
        return true;
    }

    private static class FalloAlBajar extends Exception {
        final String codigo;

        FalloAlBajar(String mensaje, String codigo) {
            super(mensaje);
            this.codigo = codigo;
        }
    }

    /** Baja a `<huella>.apk` (si ya está entera, no baja nada) y comprueba la huella. */
    private File bajar(String direccion, String huella) throws Exception {
        File dir = carpeta();
        if (!dir.exists() && !dir.mkdirs()) throw new FalloAlBajar("No hay sitio para bajarla", "SIN_SITIO");
        File apk = laDe(huella);
        if (estaEntera(apk, huella)) {
            avisarProgreso(100, apk.length(), apk.length());
            return apk;
        }
        File aMedias = new File(dir, huella.toLowerCase() + ".parte");
        try {
            HttpURLConnection conexion = (HttpURLConnection) new URL(direccion).openConnection();
            conexion.setConnectTimeout(15000);
            conexion.setReadTimeout(30000);
            conexion.setInstanceFollowRedirects(true);
            int estado = conexion.getResponseCode();
            if (estado != 200) throw new FalloAlBajar("El servidor no la dio (" + estado + ")", "SERVIDOR");

            long total = conexion.getContentLengthLong();
            MessageDigest resumen = MessageDigest.getInstance("SHA-256");
            long bajado = 0;
            int ultimo = -1;
            try (InputStream entrada = conexion.getInputStream(); OutputStream salida = new FileOutputStream(aMedias)) {
                byte[] trozo = new byte[64 * 1024];
                int leidos;
                while ((leidos = entrada.read(trozo)) != -1) {
                    salida.write(trozo, 0, leidos);
                    resumen.update(trozo, 0, leidos);
                    bajado += leidos;
                    int porcentaje = total > 0 ? (int) (bajado * 100 / total) : -1;
                    if (porcentaje != ultimo) {
                        ultimo = porcentaje;
                        avisarProgreso(porcentaje, bajado, total);
                    }
                }
            }
            if (!enHexadecimal(resumen.digest()).equalsIgnoreCase(huella)) {
                throw new FalloAlBajar("Lo que se bajó no es la versión publicada. Vuelve a intentarlo.", "HUELLA");
            }
            if (apk.exists()) apk.delete();
            if (!aMedias.renameTo(apk)) throw new FalloAlBajar("No hay sitio para bajarla", "SIN_SITIO");
            return apk;
        } finally {
            if (aMedias.exists()) aMedias.delete();
        }
    }

    private void avisarProgreso(int porcentaje, long bajado, long total) {
        JSObject progreso = new JSObject();
        progreso.put("porcentaje", porcentaje);
        progreso.put("bajado", bajado);
        progreso.put("total", total);
        notifyListeners("progreso", progreso);
    }

    private static boolean estaEntera(File apk, String huella) {
        if (!apk.exists()) return false;
        try (InputStream entrada = new FileInputStream(apk)) {
            MessageDigest resumen = MessageDigest.getInstance("SHA-256");
            byte[] trozo = new byte[64 * 1024];
            int leidos;
            while ((leidos = entrada.read(trozo)) != -1) resumen.update(trozo, 0, leidos);
            return enHexadecimal(resumen.digest()).equalsIgnoreCase(huella);
        } catch (Exception e) {
            return false;
        }
    }

    private void abrirElInstalador(File apk) {
        Uri archivo = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent instalar = new Intent(Intent.ACTION_VIEW);
        instalar.setDataAndType(archivo, "application/vnd.android.package-archive");
        instalar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().runOnUiThread(() -> getContext().startActivity(instalar));
    }

    private static String enHexadecimal(byte[] bytes) {
        StringBuilder texto = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) texto.append(String.format("%02x", b));
        return texto.toString();
    }
}
