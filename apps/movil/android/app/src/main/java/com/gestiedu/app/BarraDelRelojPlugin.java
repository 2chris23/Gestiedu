package com.gestiedu.app;

import android.graphics.Color;
import android.util.Log;
import android.view.View;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * LA FRANJA DEL RELOJ, DEL COLOR DE LA PANTALLA
 *
 * En la APK la franja del reloj NO es de la página: es el fondo de la vista
 * de Android que la rodea (`MainActivity.dejarSitioParaElReloj`), blanca. En
 * el Inicio del admin la cabecera es azul y quedaba una banda blanca encima
 * (visto en el moto g13). La página le dice aquí de qué color ponerla y si los
 * iconos (reloj, wifi, batería) van claros u oscuros. Sin color, vuelve al de
 * siempre (`color_de_la_barra_de_estado`).
 */
@CapacitorPlugin(name = "BarraDelReloj")
public class BarraDelRelojPlugin extends Plugin {

    @PluginMethod
    public void pintar(PluginCall call) {
        final String color = call.getString("color");
        final boolean iconosClaros = Boolean.TRUE.equals(call.getBoolean("iconosClaros", false));
        Log.d("BarraDelReloj", "pintar " + color + " iconosClaros=" + iconosClaros);
        getActivity().runOnUiThread(() -> {
            try {
                View contenido = getActivity().findViewById(android.R.id.content);
                int fondo = color == null
                    ? getActivity().getResources().getColor(R.color.color_de_la_barra_de_estado, getActivity().getTheme())
                    : Color.parseColor(color);
                if (contenido != null) contenido.setBackgroundColor(fondo);
                // Hasta Android 14 la franja la pinta la VENTANA (el
                // `statusBarColor` del tema), no la vista de detrás: en el moto
                // g13 los iconos cambiaban y el fondo seguía blanco.
                getActivity().getWindow().setStatusBarColor(fondo);
                WindowInsetsControllerCompat barras =
                    WindowCompat.getInsetsController(getActivity().getWindow(), getActivity().getWindow().getDecorView());
                barras.setAppearanceLightStatusBars(!iconosClaros);
                call.resolve();
            } catch (IllegalArgumentException e) {
                call.reject("Color no válido: " + color);
            }
        });
    }
}
