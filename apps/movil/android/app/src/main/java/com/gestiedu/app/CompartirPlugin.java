package com.gestiedu.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/**
 * COMPARTIR UN ARCHIVO DESDE LA APP
 *
 * En el navegador del teléfono, «Compartir» (el comprobante de un pago, el
 * horario en imagen) abre la hoja de compartir con `navigator.share`. El
 * WebView de Android no lo trae, y bajar un `blob:` con `<a download>` tampoco
 * hace nada dentro de una app: Cristian tocaba «Compartir» en un movimiento y
 * no pasaba nada.
 *
 * Esto recibe el archivo en base64, lo deja en la caché de la app (la carpeta
 * `compartir/`, que se vacía en cada uso) y abre el selector de Android
 * (WhatsApp, Telegram, Drive…) con el permiso de leerlo solo para la app que
 * se elija (`FileProvider`, ya declarado en el manifiesto).
 */
@CapacitorPlugin(name = "Compartir")
public class CompartirPlugin extends Plugin {

    @PluginMethod
    public void archivo(PluginCall call) {
        final String datos = call.getString("base64");
        final String nombre = limpio(call.getString("nombre", "archivo"));
        final String tipo = call.getString("tipo", "application/octet-stream");
        final String titulo = call.getString("titulo", "Compartir");
        if (datos == null || datos.isEmpty()) {
            call.reject("No llegó el archivo");
            return;
        }
        try {
            File carpeta = new File(getContext().getCacheDir(), "compartir");
            if (carpeta.exists()) {
                File[] viejos = carpeta.listFiles();
                if (viejos != null) for (File f : viejos) f.delete();
            } else {
                carpeta.mkdirs();
            }
            File archivo = new File(carpeta, nombre);
            try (FileOutputStream salida = new FileOutputStream(archivo)) {
                salida.write(Base64.decode(datos, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", archivo);
            Intent enviar = new Intent(Intent.ACTION_SEND);
            enviar.setType(tipo);
            enviar.putExtra(Intent.EXTRA_STREAM, uri);
            enviar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent selector = Intent.createChooser(enviar, titulo);
            selector.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(selector);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo compartir: " + e.getMessage());
        }
    }

    /** Un nombre de archivo sin barras ni cosas raras. */
    private static String limpio(String nombre) {
        String n = nombre.replaceAll("[^A-Za-z0-9._-]", "-");
        return n.isEmpty() ? "archivo" : n;
    }
}
