package com.gestiedu.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * IMPRIMIR (O GUARDAR EN PDF) DESDE LA APP
 *
 * Dentro de una app, `window.print()` no hace nada: el WebView de Android no
 * trae el diálogo de imprimir de Chrome. El profesor pulsaba «Imprimir» en la
 * constancia o en el plan y no pasaba nada.
 *
 * Esto le pasa la página que se ve al servicio de impresión de Android: el
 * mismo diálogo que usa Chrome, con «Guardar como PDF» y las impresoras. Lo
 * que sale es lo que diga el CSS de impresión de la página (la hoja sola,
 * `lib/documentos.ts`).
 *
 * El nombre del trabajo es el título de la página, que cada documento pone
 * («Constancia de estudio — Ana Pérez»): es el nombre del PDF al guardarlo.
 */
@CapacitorPlugin(name = "Imprimir")
public class ImprimirPlugin extends Plugin {

    @PluginMethod
    public void imprimir(PluginCall call) {
        final String nombre = call.getString("nombre", "Documento");
        getActivity().runOnUiThread(() -> {
            try {
                WebView web = getBridge().getWebView();
                PrintManager impresion = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adaptador = web.createPrintDocumentAdapter(nombre);
                impresion.print(nombre, adaptador, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception e) {
                call.reject("No se pudo abrir la impresión: " + e.getMessage());
            }
        });
    }
}
